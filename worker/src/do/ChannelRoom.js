import { insertMessage, requireAccessibleRoom } from '../db.js';
import { validateSession } from '../session.js';
import { pickAttachment } from '../utils.js';

function socketMeta(session, room) {
  return {
    session,
    room
  };
}

function sendSocketError(ws, message) {
  try {
    ws.send(JSON.stringify({ type: 'error', error: message }));
  } catch {
    // Ignore broken sockets.
  }
}

async function revalidateConnection(env, meta) {
  const auth = await validateSession(env, meta.session.token);
  if (!auth.ok) {
    return { ok: false, status: auth.status, message: auth.message };
  }

  const room = await requireAccessibleRoom(
    env.DB,
    auth.session.userId,
    meta.room.kind,
    meta.room.id,
    auth.session.isAdmin
  );
  if (!room) {
    return { ok: false, status: 403, message: '你已无权访问该会话' };
  }

  return { ok: true, session: auth.session, room };
}

export class ChannelRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.connections = new Map();

    for (const socket of this.state.getWebSockets()) {
      const meta = socket.deserializeAttachment();
      if (meta) {
        this.connections.set(socket, meta);
      }
    }
  }

  disconnect(ws, message) {
    sendSocketError(ws, message);
    try {
      ws.close(1008, 'Forbidden');
    } catch {
      // Ignore.
    }
    this.connections.delete(ws);
  }

  async ensureAuthorized(ws, meta) {
    const revalidated = await revalidateConnection(this.env, meta);
    if (!revalidated.ok) {
      this.disconnect(ws, revalidated.message);
      return null;
    }

    const nextMeta = socketMeta(revalidated.session, revalidated.room);
    ws.serializeAttachment(nextMeta);
    this.connections.set(ws, nextMeta);
    return nextMeta;
  }

  parsePayload(ws, message) {
    try {
      return JSON.parse(message);
    } catch {
      sendSocketError(ws, '无效消息格式');
      return null;
    }
  }

  async broadcast(packet) {
    for (const [socket, storedMeta] of this.connections.entries()) {
      const authorized = await this.ensureAuthorized(socket, storedMeta);
      if (!authorized) {
        continue;
      }

      try {
        socket.send(packet);
      } catch {
        this.connections.delete(socket);
      }
    }
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected websocket', { status: 426 });
    }

    const token = url.searchParams.get('token') || '';
    const kind = url.searchParams.get('kind') || '';
    const roomId = Number(url.searchParams.get('id') || '');
    const auth = await validateSession(this.env, token);
    if (!auth.ok) {
      return new Response('Unauthorized', { status: 401 });
    }
    const session = auth.session;

    const room = await requireAccessibleRoom(
      this.env.DB,
      session.userId,
      kind,
      roomId,
      session.isAdmin
    );

    if (!room) {
      return new Response('Forbidden', { status: 403 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    const meta = socketMeta(session, room);
    server.serializeAttachment(meta);
    this.connections.set(server, meta);
    server.send(
      JSON.stringify({
        type: 'ready',
        room: {
          id: Number(room.id),
          kind: room.kind,
          name: room.name
        }
      })
    );

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    const meta = this.connections.get(ws);
    if (!meta) {
      return;
    }

    const nextMeta = await this.ensureAuthorized(ws, meta);
    if (!nextMeta) {
      return;
    }

    const payload = this.parsePayload(ws, message);
    if (!payload) {
      return;
    }

    if (payload.type !== 'send') {
      sendSocketError(ws, '不支持的消息类型');
      return;
    }

    try {
      const saved = await insertMessage(this.env.DB, {
        channelId: nextMeta.room.id,
        senderId: nextMeta.session.userId,
        content: payload.content,
        attachment: pickAttachment(payload.attachment)
      });
      const packet = JSON.stringify({
        type: 'message',
        message: saved
      });

      await this.broadcast(packet);
    } catch (error) {
      ws.send(JSON.stringify({ type: 'error', error: error.message || '发送失败' }));
    }
  }

  webSocketClose(ws) {
    this.connections.delete(ws);
  }

  webSocketError(ws) {
    this.connections.delete(ws);
  }
}
