import { getChannelMemberModeration, insertMessage, requireAccessibleRoom } from '../db.js';
import { findBlockedWord, getBlockedWords, isMutedUntilActive } from '../moderation.js';
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

    // 添加速率限制和大小检查配置
    this.messageRateLimits = new Map(); // userId -> {count, resetAt}
    this.MESSAGE_SIZE_LIMIT = 10 * 1024; // 10KB
    this.RATE_LIMIT_PER_SECOND = 10;     // 每秒最多 10 条消息
    this.RATE_LIMIT_WINDOW = 1000;       // 1 秒

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
    this.removeConnection(ws);
  }

  removeConnection(ws) {
    const meta = this.connections.get(ws);
    this.connections.delete(ws);

    const userId = meta?.session?.userId;
    if (!userId) {
      return;
    }

    const hasOtherConnection = Array.from(this.connections.values()).some(
      (storedMeta) => storedMeta?.session?.userId === userId
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

  // 修复：创建连接快照以避免迭代中修改集合导致的竞态条件
  async broadcast(packet) {
    // 创建当前连接的快照，避免在循环中修改 Map 时出现迭代问题
    const connectionSnapshot = Array.from(this.connections.entries());

    // 并发处理所有连接，使用 Promise.allSettled 避免单个失败影响其他连接
    const results = await Promise.allSettled(
      connectionSnapshot.map(async ([socket, storedMeta]) => {
        try {
          const authorized = await this.ensureAuthorized(socket, storedMeta);
          if (!authorized) {
            return; // 未授权，跳过此连接
          }

          try {
            socket.send(packet);
          } catch (error) {
            // 发送失败，删除此连接
            this.removeConnection(socket);
            throw error;
          }
        } catch (error) {
          console.error('Broadcast error:', error);
          // 继续处理其他连接，不中断
        }
      })
    );

    return results; // 返回结果用于监控/日志
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

    // 检查消息大小限制
    if (getMessageByteLength(message) > this.MESSAGE_SIZE_LIMIT) {
      sendSocketError(ws, `消息过大，最大 ${Math.round(this.MESSAGE_SIZE_LIMIT / 1024)}KB`);
      return;
    }

    const nextMeta = await this.ensureAuthorized(ws, meta);
    if (!nextMeta) {
      return;
    }

    // 检查速率限制
    const now = Date.now();
    this.cleanupExpiredRateLimits(now);
    const userId = nextMeta.session.userId;
    let counter = this.messageRateLimits.get(userId) || {
      count: 0,
      resetAt: now + this.RATE_LIMIT_WINDOW
    };

    // 重置时间窗口
    if (now > counter.resetAt) {
      counter = {
        count: 0,
        resetAt: now + this.RATE_LIMIT_WINDOW
      };
    }

    // 检查是否超过速率限制
    if (counter.count >= this.RATE_LIMIT_PER_SECOND) {
      sendSocketError(ws, '消息发送过于频繁，请稍后再试');
      return;
    }

    counter.count++;
    this.messageRateLimits.set(userId, counter);

    const payload = this.parsePayload(ws, normalizeWebSocketMessage(message));
    if (!payload) {
      return;
    }

    if (payload.type !== 'send') {
      sendSocketError(ws, '不支持的消息类型');
      return;
    }

    try {
      const moderation = await getChannelMemberModeration(
        this.env.DB,
        nextMeta.room.id,
        nextMeta.session.userId
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
      if (attachment && !attachment.key.startsWith(`${nextMeta.session.userId}/`)) {
        sendSocketError(ws, '附件无效或无权发送');
        return;
      }

      const saved = await insertMessage(this.env.DB, {
        channelId: nextMeta.room.id,
        senderId: nextMeta.session.userId,
        content: payload.content,
        attachment
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
    this.removeConnection(ws);
  }

  webSocketError(ws) {
    this.removeConnection(ws);
  }
}
