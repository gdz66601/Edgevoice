import { listMessages, markChannelRead, requireAccessibleRoom } from '../db.js';
import { publishUserInboxEvent } from '../do/UserInbox.js';
import { errorResponse, sanitizeLimit } from '../utils.js';

export function registerMessageRoutes(app) {
  app.get('/api/messages', async (c) => {
    const session = c.get('session');
    const kind = c.req.query('kind');
    const roomId = Number(c.req.query('roomId'));
    const before = c.req.query('before');
    const limit = sanitizeLimit(c.req.query('limit'));

    if (!['public', 'private', 'dm'].includes(kind) || !Number.isFinite(roomId)) {
      return errorResponse('Invalid parameters');
    }

    const room = await requireAccessibleRoom(
      c.env.DB,
      session.userId,
      kind,
      roomId,
      session.isAdmin
    );

    if (!room) {
      return errorResponse('Room not accessible', 403);
    }

    const messages = await listMessages(c.env.DB, roomId, before, limit);
    return c.json({
      room: {
        id: Number(room.id),
        kind: room.kind,
        name: room.name,
        description: room.description
      },
      messages
    });
  });

  app.post('/api/messages/read', async (c) => {
    const session = c.get('session');
    const payload = await c.req.json().catch(() => null);
    const kind = payload?.kind;
    const roomId = Number(payload?.roomId);
    const messageId =
      payload?.messageId === null || payload?.messageId === undefined
        ? null
        : Number(payload.messageId);

    if (!['public', 'private', 'dm'].includes(kind) || !Number.isFinite(roomId)) {
      return errorResponse('Invalid parameters');
    }

    if (messageId !== null && !Number.isFinite(messageId)) {
      return errorResponse('Invalid parameters');
    }

    const room = await requireAccessibleRoom(
      c.env.DB,
      session.userId,
      kind,
      roomId,
      session.isAdmin
    );

    if (!room) {
      return errorResponse('Room not accessible', 403);
    }

    const readState = await markChannelRead(c.env.DB, roomId, session.userId, messageId);
    await publishUserInboxEvent(c.env, session.userId, {
      type: 'conversation_read',
      key: `${kind}:${roomId}`,
      roomId,
      kind,
      unreadCount: 0
    });

    return c.json({
      ok: true,
      room: {
        id: Number(room.id),
        kind: room.kind
      },
      ...readState
    });
  });
}
