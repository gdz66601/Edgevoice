import { getChannelMemberModeration, insertMessage, requireAccessibleRoom } from '../db.js';
import { findBlockedWord, getBlockedWords, isMutedUntilActive } from '../moderation.js';
import { validateSession } from '../session.js';
import { pickAttachment } from '../utils.js';

const INTERNAL_AUTH_HEADER = 'x-cfchat-internal-auth';
const VERIFIED_USER_ID_HEADER = 'x-cfchat-verified-user-id';
const VERIFIED_IS_ADMIN_HEADER = 'x-cfchat-verified-is-admin';
const VERIFIED_AT_HEADER = 'x-cfchat-verified-at';
const WS_CLOSE_UNAUTHORIZED = 4401;
const WS_CLOSE_FORBIDDEN = 4403;
const WS_REASON_UNAUTHORIZED = 'session_invalid';
const WS_REASON_FORBIDDEN = 'room_forbidden';

function socketMeta(principal, room) {
  return {
    principal,
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

function getMessageByteLength(message) {
  if (typeof message === 'string') {
    return new TextEncoder().encode(message).length;
  }
  if (message instanceof ArrayBuffer) {
    return message.byteLength;
  }
  if (ArrayBuffer.isView(message)) {
    return message.byteLength;
  }
  return 0;
}

function normalizeWebSocketMessage(message) {
  if (typeof message === 'string') {
    return message;
  }
  if (message instanceof ArrayBuffer) {
    return new TextDecoder().decode(message);
  }
  if (ArrayBuffer.isView(message)) {
    return new TextDecoder().decode(message);
  }
  return '';
}

function parseVerifiedPrincipal(request, token) {
  if (request.headers.get(INTERNAL_AUTH_HEADER) !== 'worker-verified') {
    return null;
  }

  const userId = Number(request.headers.get(VERIFIED_USER_ID_HEADER) || '');
  const verifiedAt = Number(request.headers.get(VERIFIED_AT_HEADER) || '');
  if (!Number.isFinite(userId) || !Number.isFinite(verifiedAt)) {
    return null;
  }

  return {
    userId,
    isAdmin: request.headers.get(VERIFIED_IS_ADMIN_HEADER) === '1',
    token
  };
}

export class ChannelRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.connections = new Map();
    this.messageRateLimits = new Map();
    this.MESSAGE_SIZE_LIMIT = 10 * 1024;
    this.RATE_LIMIT_PER_SECOND = 10;
    this.RATE_LIMIT_WINDOW = 1000;

    for (const socket of this.state.getWebSockets()) {
      const meta = socket.deserializeAttachment();
      if (meta) {
        this.connections.set(socket, meta);
      }
    }
  }

  disconnect(ws, message, code = WS_CLOSE_FORBIDDEN, reason = WS_REASON_FORBIDDEN) {
    sendSocketError(ws, message);
    try {
      ws.close(code, reason);
    } catch {
      // Ignore broken sockets.
    }
    this.removeConnection(ws);
  }

  removeConnection(ws) {
    const meta = this.connections.get(ws);
    this.connections.delete(ws);

    const userId = meta?.principal?.userId;
    if (!userId) {
      return;
    }

    const hasOtherConnection = Array.from(this.connections.values()).some(
      (storedMeta) => storedMeta?.principal?.userId === userId
    );
    if (!hasOtherConnection) {
      this.messageRateLimits.delete(userId);
    }
  }

  cleanupExpiredRateLimits(now = Date.now()) {
    for (const [userId, counter] of this.messageRateLimits.entries()) {
      if (!counter || now > counter.resetAt) {
        this.messageRateLimits.delete(userId);
      }
    }
  }

  async ensureAccessible(ws, meta) {
    const auth = await validateSession(this.env, meta.principal.token);
    if (!auth.ok) {
      this.disconnect(ws, auth.message, WS_CLOSE_UNAUTHORIZED, WS_REASON_UNAUTHORIZED);
      return null;
    }

    if (auth.session.userId !== meta.principal.userId) {
      this.disconnect(ws, '登录已过期，请重新登录', WS_CLOSE_UNAUTHORIZED, WS_REASON_UNAUTHORIZED);
      return null;
    }

    const room = await requireAccessibleRoom(
      this.env.DB,
      auth.session.userId,
      meta.room.kind,
      meta.room.id,
      auth.session.isAdmin
    );

    if (!room) {
      this.disconnect(ws, '你已无权访问该会话');
      return null;
    }

    const nextMeta = socketMeta(
      {
        userId: auth.session.userId,
        isAdmin: auth.session.isAdmin,
        token: meta.principal.token
      },
      room
    );
    ws.serializeAttachment(nextMeta);
    this.connections.set(ws, nextMeta);
    return nextMeta;
  }

  parsePayload(ws, message) {
    try {
      return JSON.parse(message);
    } catch {
      sendSocketError(ws, 'Invalid message payload');
      return null;
    }
  }

  async broadcast(packet) {
    const connectionSnapshot = Array.from(this.connections.entries());
    await Promise.allSettled(
      connectionSnapshot.map(async ([socket, storedMeta]) => {
        const authorized = await this.ensureAccessible(socket, storedMeta);
        if (!authorized) {
          return;
        }

        try {
          socket.send(packet);
        } catch {
          this.removeConnection(socket);
        }
      })
    );
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected websocket', { status: 426 });
    }

    const token = url.searchParams.get('token') || '';
    const kind = url.searchParams.get('kind') || '';
    const roomId = Number(url.searchParams.get('id') || '');

    let principal = parseVerifiedPrincipal(request, token);
    if (!principal) {
      const auth = await validateSession(this.env, token);
      if (!auth.ok) {
        return new Response('Unauthorized', { status: 401 });
      }

      principal = {
        userId: auth.session.userId,
        isAdmin: auth.session.isAdmin,
        token
      };
    }

    const room = await requireAccessibleRoom(
      this.env.DB,
      principal.userId,
      kind,
      roomId,
      principal.isAdmin
    );

    if (!room) {
      return new Response('Forbidden', { status: 403 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    const meta = socketMeta(principal, room);
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

    if (getMessageByteLength(message) > this.MESSAGE_SIZE_LIMIT) {
      sendSocketError(ws, `消息过大，最大 ${Math.round(this.MESSAGE_SIZE_LIMIT / 1024)}KB`);
      return;
    }

    const nextMeta = await this.ensureAccessible(ws, meta);
    if (!nextMeta) {
      return;
    }

    const now = Date.now();
    this.cleanupExpiredRateLimits(now);
    const userId = nextMeta.principal.userId;
    let counter = this.messageRateLimits.get(userId) || {
      count: 0,
      resetAt: now + this.RATE_LIMIT_WINDOW
    };

    if (now > counter.resetAt) {
      counter = {
        count: 0,
        resetAt: now + this.RATE_LIMIT_WINDOW
      };
    }

    if (counter.count >= this.RATE_LIMIT_PER_SECOND) {
      sendSocketError(ws, '消息发送过于频繁，请稍后再试');
      return;
    }

    counter.count += 1;
    this.messageRateLimits.set(userId, counter);

    const payload = this.parsePayload(ws, normalizeWebSocketMessage(message));
    if (!payload) {
      return;
    }

    if (payload.type !== 'send') {
      sendSocketError(ws, 'Unsupported message type');
      return;
    }

    try {
      const moderation = await getChannelMemberModeration(
        this.env.DB,
        nextMeta.room.id,
        nextMeta.principal.userId
      );
      if (isMutedUntilActive(moderation?.muted_until)) {
        sendSocketError(ws, '你已被禁言，暂时不能在此群组发言');
        return;
      }

      const blocked = findBlockedWord(payload.content, await getBlockedWords(this.env.DB));
      if (blocked) {
        sendSocketError(ws, '消息包含违禁词，已被拦截');
        return;
      }

      const attachment = pickAttachment(payload.attachment);
      if (attachment && !attachment.key.startsWith(`${nextMeta.principal.userId}/`)) {
        sendSocketError(ws, '附件无效或无权发送');
        return;
      }

      const saved = await insertMessage(this.env.DB, {
        channelId: nextMeta.room.id,
        senderId: nextMeta.principal.userId,
        content: payload.content,
        attachment
      });
      const packet = JSON.stringify({
        type: 'message',
        message: saved
      });

      await this.broadcast(packet);
    } catch (error) {
      sendSocketError(ws, error.message || 'Send failed');
    }
  }

  webSocketClose(ws) {
    this.removeConnection(ws);
  }

  webSocketError(ws) {
    this.removeConnection(ws);
  }
}
