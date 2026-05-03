/**
 * 审计日志模块
 * 记录所有管理员操作以供审计和合规性检查
 */

/**
 * 记录管理员操作
 * @param {Object} db - 数据库连接
 * @param {number} adminUserId - 执行操作的管理员 ID
 * @param {string} action - 操作类型（如 'delete_user', 'reset_password'）
 * @param {string} targetType - 目标类型（'user', 'channel', 'message'）
 * @param {number} targetId - 目标 ID
 * @param {Object} details - 操作详情（JSON 对象）
 * @param {string} ipAddress - IP 地址（可选）
 * @param {string} userAgent - User-Agent（可选）
 * @returns {Promise<number>} 日志记录 ID
 */
export async function logAdminAction(
  db,
  adminUserId,
  action,
  targetType = null,
  targetId = null,
  details = {},
  ipAddress = null,
  userAgent = null
) {
  try {
    const result = await db.prepare(
      `INSERT INTO admin_audit_log (
         admin_user_id,
         action,
         target_type,
         target_id,
         details,
         ip_address,
         user_agent
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        Number(adminUserId),
        String(action || ''),
        targetType ? String(targetType) : null,
        targetId ? Number(targetId) : null,
        JSON.stringify(details || {}),
        ipAddress ? String(ipAddress).slice(0, 45) : null,
        userAgent ? String(userAgent).slice(0, 255) : null
      )
      .run();

    return Number(result.meta.last_row_id);
  } catch (error) {
    console.error('Failed to log admin action:', error);
    // 不抛出错误，防止日志记录失败导致操作失败
    return -1;
  }
}

/**
 * 获取审计日志
 * @param {Object} db - 数据库连接
 * @param {Object} options - 查询选项
 * @param {number} options.limit - 返回数量限制（默认 100）
 * @param {number} options.offset - 偏移量（默认 0）
 * @param {string} options.adminUserId - 筛选特定管理员
 * @param {string} options.action - 筛选特定操作类型
 * @param {string} options.startDate - 开始日期（ISO 8601）
 * @param {string} options.endDate - 结束日期（ISO 8601）
 * @returns {Promise<Array>} 审计日志列表
 */
export async function getAuditLogs(db, options = {}) {
  const limit = Math.min(Number(options.limit) || 100, 1000);
  const offset = Math.max(Number(options.offset) || 0, 0);

  let query = `
    SELECT
      aal.id,
      aal.admin_user_id,
      u.username,
      u.display_name,
      aal.action,
      aal.target_type,
      aal.target_id,
      aal.details,
      aal.ip_address,
      aal.created_at
    FROM admin_audit_log aal
    LEFT JOIN users u ON aal.admin_user_id = u.id
    WHERE 1 = 1
  `;

  const params = [];

  if (options.adminUserId) {
    query += ` AND aal.admin_user_id = ?`;
    params.push(Number(options.adminUserId));
  }

  if (options.action) {
    query += ` AND aal.action = ?`;
    params.push(String(options.action));
  }

  if (options.startDate) {
    query += ` AND aal.created_at >= ?`;
    params.push(String(options.startDate));
  }

  if (options.endDate) {
    query += ` AND aal.created_at <= ?`;
    params.push(String(options.endDate));
  }

  query += ` ORDER BY aal.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const { results } = await db.prepare(query).bind(...params).all();

  return results.map((row) => ({
    id: Number(row.id),
    adminUserId: Number(row.admin_user_id),
    adminUsername: row.username || '(已删除)',
    adminDisplayName: row.display_name || '(已删除)',
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id ? Number(row.target_id) : null,
    details: (() => {
      try {
        return JSON.parse(row.details || '{}');
      } catch {
        return {};
      }
    })(),
    ipAddress: row.ip_address,
    createdAt: row.created_at
  }));
}

/**
 * 获取用户的管理操作历史
 * @param {Object} db - 数据库连接
 * @param {number} adminUserId - 管理员 ID
 * @param {number} limit - 返回数量限制
 * @returns {Promise<Array>} 该管理员的操作历史
 */
export async function getAdminActionHistory(db, adminUserId, limit = 50) {
  return getAuditLogs(db, {
    adminUserId,
    limit
  });
}

/**
 * 获取特定目标的所有操作
 * @param {Object} db - 数据库连接
 * @param {string} targetType - 目标类型
 * @param {number} targetId - 目标 ID
 * @param {number} limit - 返回数量限制
 * @returns {Promise<Array>} 针对该目标的所有操作
 */
export async function getTargetActionHistory(db, targetType, targetId, limit = 50) {
  const { results } = await db
    .prepare(
      `SELECT
         aal.id,
         aal.admin_user_id,
         u.username,
         u.display_name,
         aal.action,
         aal.details,
         aal.ip_address,
         aal.created_at
       FROM admin_audit_log aal
       LEFT JOIN users u ON aal.admin_user_id = u.id
       WHERE aal.target_type = ? AND aal.target_id = ?
       ORDER BY aal.created_at DESC
       LIMIT ?`
    )
    .bind(String(targetType), Number(targetId), limit)
    .all();

  return results.map((row) => ({
    id: Number(row.id),
    adminUserId: Number(row.admin_user_id),
    adminUsername: row.username || '(已删除)',
    adminDisplayName: row.display_name || '(已删除)',
    action: row.action,
    details: (() => {
      try {
        return JSON.parse(row.details || '{}');
      } catch {
        return {};
      }
    })(),
    ipAddress: row.ip_address,
    createdAt: row.created_at
  }));
}
