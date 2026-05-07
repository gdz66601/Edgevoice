import { isEncryptedMessageContent } from './validation.js';

const BLOCKED_WORDS_KEY = 'blocked_words';
const MAX_BLOCKED_WORDS = 500;
const MAX_BLOCKED_WORD_LENGTH = 64;
const MAX_MUTE_MINUTES = 60 * 24 * 30;

export function normalizeBlockedWords(words) {
  const source = Array.isArray(words) ? words : [];
  const seen = new Set();
  const normalized = [];

  for (const item of source) {
    const word = String(item || '').trim().toLowerCase();
    if (!word || seen.has(word)) {
      continue;
    }
    if (word.length > MAX_BLOCKED_WORD_LENGTH) {
      throw new Error(`违禁词最多 ${MAX_BLOCKED_WORD_LENGTH} 个字符`);
    }
    seen.add(word);
    normalized.push(word);
    if (normalized.length >= MAX_BLOCKED_WORDS) {
      break;
    }
  }

  return normalized;
}

export function findBlockedWord(content, words) {
  if (typeof content !== 'string' || isEncryptedMessageContent(content)) {
    return null;
  }

  const normalizedContent = content.toLowerCase();
  for (const word of normalizeBlockedWords(words)) {
    if (normalizedContent.includes(word)) {
      return { word };
    }
  }
  return null;
}

export function toMuteUntil(minutes, now = new Date()) {
  const duration = Number(minutes);
  if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_MUTE_MINUTES) {
    throw new Error(`禁言时长必须在 1 到 ${MAX_MUTE_MINUTES} 分钟之间`);
  }
  return new Date(now.getTime() + Math.round(duration) * 60 * 1000).toISOString();
}

export function isMutedUntilActive(mutedUntil, now = new Date()) {
  if (!mutedUntil) {
    return false;
  }
  const expiresAt = new Date(mutedUntil).getTime();
  return Number.isFinite(expiresAt) && expiresAt > now.getTime();
}

export async function getBlockedWords(db) {
  const row = await db
    .prepare(
      `SELECT setting_value
       FROM site_settings
       WHERE setting_key = ?`
    )
    .bind(BLOCKED_WORDS_KEY)
    .first();

  if (!row?.setting_value) {
    return [];
  }

  try {
    return normalizeBlockedWords(JSON.parse(row.setting_value));
  } catch {
    return [];
  }
}

export async function updateBlockedWords(db, words) {
  const normalized = normalizeBlockedWords(words);
  await db
    .prepare(
      `INSERT INTO site_settings (setting_key, setting_value, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(setting_key) DO UPDATE
       SET setting_value = excluded.setting_value,
           updated_at = CURRENT_TIMESTAMP`
    )
    .bind(BLOCKED_WORDS_KEY, JSON.stringify(normalized))
    .run();
  return normalized;
}

