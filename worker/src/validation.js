/**
 * 输入验证和安全清理模块
 * 防止 XSS、注入和其他攻击
 */

/**
 * 验证并清理文本内容（防止 XSS）
 * @param {string} text - 输入文本
 * @param {Object} options - 选项
 * @param {number} options.maxLength - 最大长度
 * @param {boolean} options.allowNewlines - 是否允许换行符
 * @returns {string} 清理后的文本
 */
export function sanitizeText(text, options = {}) {
  const { maxLength = 5000, allowNewlines = true } = options;
  if (typeof text !== 'string') {
    return '';
  }

  let result = text
    // 移除控制字符（除了制表符），根据 options 控制是否保留换行
    .split('')
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      if (code === 9) return true; // TAB
      if (allowNewlines && (code === 10 || code === 13)) return true; // LF/CR
      return code >= 32 && code !== 127;
    })
    .join('')
    // 仅按纯文本转义 HTML 特殊字符，不删除用户输入内容
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

  // 处理换行符
  if (!allowNewlines) {
    result = result.replace(/[\r\n]/g, ' ');
  } else {
    // 限制连续换行
    result = result.replace(/\n{3,}/g, '\n\n');
  }

  // 截断过长内容
  if (result.length > maxLength) {
    result = result.slice(0, maxLength);
  }

  return result.trim();
}

const ENCRYPTED_MESSAGE_PREFIX = 'edgechat:e2ee:v1:';
const ENCRYPTED_MESSAGE_PATTERN = /^edgechat:e2ee:v1:[A-Za-z0-9_-]{24,10000}$/;

export function isEncryptedMessageContent(content) {
  return typeof content === 'string' && content.startsWith(ENCRYPTED_MESSAGE_PREFIX);
}

/**
 * 验证用户名
 * @param {string} username - 用户名
 * @returns {Object} {valid: boolean, error?: string}
 */
export function validateUsername(username) {
  if (typeof username !== 'string') {
    return { valid: false, error: '用户名必须是文本' };
  }

  const trimmed = username.trim();

  if (trimmed.length < 3) {
    return { valid: false, error: '用户名至少3个字符' };
  }

  if (trimmed.length > 32) {
    return { valid: false, error: '用户名最多32个字符' };
  }

  // 只允许字母、数字、下划线和连字符
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return { valid: false, error: '用户名只能包含字母、数字、下划线和连字符' };
  }

  return { valid: true };
}

/**
 * 验证显示名称
 * @param {string} displayName - 显示名称
 * @returns {Object} {valid: boolean, error?: string}
 */
export function validateDisplayName(displayName) {
  if (typeof displayName !== 'string') {
    return { valid: false, error: '显示名称必须是文本' };
  }

  const trimmed = displayName.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: '显示名称不能为空' };
  }

  if (trimmed.length > 64) {
    return { valid: false, error: '显示名称最多64个字符' };
  }

  return { valid: true };
}

/**
 * 验证密码强度
 * @param {string} password - 密码
 * @returns {Object} {valid: boolean, error?: string, strength: 'weak'|'medium'|'strong'}
 */
export function validatePassword(password) {
  if (typeof password !== 'string') {
    return { valid: false, error: '密码必须是文本', strength: 'weak' };
  }

  if (password.length < 8) {
    return { valid: false, error: '密码至少8个字符', strength: 'weak' };
  }

  if (password.length > 128) {
    return { valid: false, error: '密码最多128个字符', strength: 'weak' };
  }

  // 检查密码强度
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const specialChars = '!@#$%^&*()_+-=[]{};\':"\\|,.<>/?';
  const hasSpecial = [...password].some((ch) => specialChars.includes(ch));

  const strengthScore = [hasLower, hasUpper, hasNumber, hasSpecial].filter(Boolean).length;

  let strength = 'weak';
  if (strengthScore >= 3) {
    strength = 'strong';
  } else if (strengthScore >= 2) {
    strength = 'medium';
  }

  return { valid: true, strength };
}

/**
 * 验证频道名称
 * @param {string} name - 频道名称
 * @returns {Object} {valid: boolean, error?: string}
 */
export function validateChannelName(name) {
  if (typeof name !== 'string') {
    return { valid: false, error: '频道名称必须是文本' };
  }

  const trimmed = name.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: '频道名称不能为空' };
  }

  if (trimmed.length > 64) {
    return { valid: false, error: '频道名称最多64个字符' };
  }

  // 只允许字母、数字、空格、连字符和下划线
  if (!/^[a-zA-Z0-9\s_-]+$/.test(trimmed)) {
    return { valid: false, error: '频道名称包含不允许的字符' };
  }

  return { valid: true };
}

/**
 * 验证消息内容
 * @param {string} content - 消息内容
 * @returns {Object} {valid: boolean, error?: string, sanitized: string}
 */
export function validateMessage(content) {
  if (typeof content !== 'string') {
    return { valid: false, error: '消息必须是文本', sanitized: '' };
  }

  const trimmed = content.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: '消息不能为空', sanitized: '' };
  }

  if (trimmed.length > 10000) {
    return { valid: false, error: '消息最多10000个字符', sanitized: '' };
  }

  if (isEncryptedMessageContent(trimmed)) {
    if (!ENCRYPTED_MESSAGE_PATTERN.test(trimmed)) {
      return { valid: false, error: '加密消息格式无效', sanitized: '' };
    }
    return { valid: true, sanitized: trimmed };
  }

  // 清理内容（防止 XSS）
  const sanitized = sanitizeText(trimmed, { maxLength: 10000 });

  return { valid: true, sanitized };
}

/**
 * 验证和清理频道描述
 * @param {string} description - 描述
 * @returns {Object} {valid: boolean, error?: string, sanitized: string}
 */
export function validateChannelDescription(description) {
  if (typeof description !== 'string') {
    return { valid: false, error: '描述必须是文本', sanitized: '' };
  }

  if (description.length > 500) {
    return { valid: false, error: '描述最多500个字符', sanitized: '' };
  }

  // 清理内容
  const sanitized = sanitizeText(description, { maxLength: 500 });

  return { valid: true, sanitized };
}

/**
 * 验证 URL
 * @param {string} url - URL
 * @returns {boolean}
 */
export function isValidUrl(url) {
  if (typeof url !== 'string') {
    return false;
  }

  try {
    const parsed = new URL(url);
    // 只允许 http 和 https
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 验证电子邮件地址（简单检查）
 * @param {string} email - 电子邮件
 * @returns {boolean}
 */
export function isValidEmail(email) {
  if (typeof email !== 'string') {
    return false;
  }

  // 简单的电子邮件验证
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
