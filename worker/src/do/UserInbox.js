import { validateSession } from '../session.js';

function socketMeta(session) {
  return { session };
}

async function ensureAuthorized(env, ws, meta, connections) {
  const auth = await validateSession(env, meta.session.token);
  if (!auth.ok) {
    try {
      ws.close(4401, 'session_invalid');
    } catch {
      // Ignore broken sockets.
    }
    connections.delete(ws);
    return null;
  }

  const nextMeta = socketMeta(auth.session);
  ws.serializeAttachment(nextMeta);
  connections.set(ws, nextMeta);
  return nextMeta;
}

export async function publishUserInboxEvent(env, userId, payload) {
  const stub = env.USER_INBOX.get(env.USER_INBOX.idFromName(`user:${Number(userId)}`));
  await stub.fetch('https://user-inbox/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export class UserInbox {
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

  async broadcast(payload) {
    const packet = typeof payload === 'string' ? payload : JSON.stringify(payload);
    for (const [socket, meta] of this.connections.entries()) {
      const authorized = await ensureAuthorized(this.env, socket, meta, this.connections);
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

    if (request.headers.get('Upgrade') === 'websocket') {
      const token = url.searchParams.get('token') || '';
      const auth = await validateSession(this.env, token);
      if (!auth.ok) {
        return new Response(auth.message || 'Unauthorized', { status: auth.status || 401 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.state.acceptWebSocket(server);
      const meta = socketMeta(auth.session);
      server.serializeAttachment(meta);
      this.connections.set(server, meta);
      server.send(JSON.stringify({ type: 'ready' }));

      return new Response(null, { status: 101, webSocket: client });
    }

    if (request.method === 'POST' && url.pathname === '/publish') {
      const payload = await request.json().catch(() => null);
      if (!payload || typeof payload !== 'object') {
        return new Response('Invalid payload', { status: 400 });
      }

      await this.broadcast(payload);
      return new Response(null, { status: 204 });
    }

    return new Response('Not Found', { status: 404 });
  }

  webSocketClose(ws) {
    this.connections.delete(ws);
  }

  webSocketError(ws) {
    this.connections.delete(ws);
  }
}
