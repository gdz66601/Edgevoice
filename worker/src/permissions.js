/**
 * 统一的权限检查模块
 * 防止权限检查逻辑不一致导致的安全漏洞
 */

import { canManageChannel, getChannelById, getChannelMembership } from './db.js';

/**
 * 检查用户是否有权访问频道
 * @param {Object} db - 数据库连接
 * @param {number} userId - 用户 ID
 * @param {number} channelId - 频道 ID
 * @param {boolean} isAdmin - 是否为管理员
 * @returns {Promise<Object|null>} 频道对象或 null
 */
export async function requireChannelAccess(db, userId, channelId, isAdmin = false) {
  const channel = await getChannelById(db, channelId);

  if (!channel || channel.deleted_at) {
    return null;
  }

  // 管理员无条件访问
  if (isAdmin) {
    return channel;
  }

  // 非管理员必须是成员
  const membership = await getChannelMembership(db, channelId, userId);
  if (!membership) {
    return null;
  }

  return channel;
}

/**
 * 检查用户是否有权管理频道（修改、删除、邀请成员等）
 * @param {Object} db - 数据库连接
 * @param {number} userId - 用户 ID
 * @param {number} channelId - 频道 ID
 * @param {boolean} isAdmin - 是否为管理员
 * @returns {Promise<Object|null>} {channel, membership} 或 null
 */
export async function requireChannelManagement(db, userId, channelId, isAdmin = false) {
  const managed = await canManageChannel(db, channelId, userId, isAdmin);

  if (!managed) {
    return null;
  }

  return managed;
}

/**
 * 检查用户是否有权查看私有频道的信息
 * @param {Object} db - 数据库连接
 * @param {number} userId - 用户 ID
 * @param {number} channelId - 频道 ID
 * @param {boolean} isAdmin - 是否为管理员
 * @returns {Promise<boolean>} 是否有权访问
 */
export async function canViewChannelInfo(db, userId, channelId, isAdmin = false) {
  const channel = await getChannelById(db, channelId);

  if (!channel) {
    return false;
  }

  // 公开频道任何人都可以查看
  if (channel.kind === 'public') {
    return true;
  }

  // 管理员可以查看任何频道
  if (isAdmin) {
    return true;
  }

  // 私有频道和 DM 只有成员可以查看
  const membership = await getChannelMembership(db, channelId, userId);
  return Boolean(membership);
}

/**
 * 检查用户是否有权查看频道消息
 * @param {Object} db - 数据库连接
 * @param {number} userId - 用户 ID
 * @param {number} channelId - 频道 ID
 * @param {boolean} isAdmin - 是否为管理员
 * @returns {Promise<boolean>} 是否有权访问
 */
export async function canViewChannelMessages(db, userId, channelId, isAdmin = false) {
  const channel = await getChannelById(db, channelId);

  if (!channel || channel.deleted_at) {
    return false;
  }

  // 管理员可以查看任何频道的消息
  if (isAdmin) {
    return true;
  }

  // 必须是频道成员
  const membership = await getChannelMembership(db, channelId, userId);
  return Boolean(membership);
}

/**
 * 检查用户是否有权发送消息到频道
 * @param {Object} db - 数据库连接
 * @param {number} userId - 用户 ID
 * @param {number} channelId - 频道 ID
 * @param {boolean} isAdmin - 是否为管理员
 * @returns {Promise<boolean>} 是否有权发送
 */
export async function canSendMessage(db, userId, channelId, isAdmin = false) {
  // 必须是频道成员
  const membership = await getChannelMembership(db, channelId, userId);

  if (!membership && !isAdmin) {
    return false;
  }

  // 验证频道存在且未被删除
  const channel = await getChannelById(db, channelId);
  return Boolean(channel && !channel.deleted_at);
}

/**
 * 检查用户是否有权删除消息
 * @param {Object} db - 数据库连接
 * @param {number} userId - 用户 ID
 * @param {number} messageId - 消息 ID
 * @param {boolean} isAdmin - 是否为管理员
 * @returns {Promise<boolean>} 是否有权删除
 */
export async function canDeleteMessage(db, userId, messageId, isAdmin = false) {
  const { results } = await db
    .prepare(
      `SELECT channel_id, sender_id FROM messages WHERE id = ? LIMIT 1`
    )
    .bind(messageId)
    .all();

  const message = results[0];
  if (!message) {
    return false;
  }

  // 管理员可以删除任何消息
  if (isAdmin) {
    return true;
  }

  // 只有发送者可以删除自己的消息
  return message.sender_id === userId;
}
