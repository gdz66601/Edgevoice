#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hashPassword } from '../worker/src/auth.js';

const username = String(process.env.EDGECHAT_ADMIN_USERNAME || 'admin').trim();
const password = String(process.env.EDGECHAT_ADMIN_PASSWORD || 'admin123');
const displayName = String(process.env.EDGECHAT_ADMIN_DISPLAY_NAME || 'Administrator').trim();

function escapeSql(value) {
  return String(value).replace(/'/g, "''");
}

async function main() {
  const hashed = await hashPassword(password);

  const safeUsername = escapeSql(username);
  const safeDisplayName = escapeSql(displayName || username);
  const safeHash = escapeSql(hashed.hash);
  const safeSalt = escapeSql(hashed.salt);
  const safeVersion = Number(hashed.version) || 2;

  // 仅在用户不存在时插入；不会更新已存在用户的密码或权限标志。
  // 防止反复执行该脚本时"复活"已禁用/已删除的本地管理员账户。
  // 如需重置本地管理员密码，请清除 users 表（或显式 UPDATE）后再执行。
  const sql = `
INSERT INTO users (
  username,
  display_name,
  password_hash,
  password_salt,
  password_hash_version,
  is_admin,
  is_disabled
)
SELECT
  '${safeUsername}',
  '${safeDisplayName}',
  '${safeHash}',
  '${safeSalt}',
  ${safeVersion},
  1,
  0
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE username = '${safeUsername}'
);
`.trim();

  const outputDir = resolve(process.cwd(), '.tmp');
  const outputPath = resolve(outputDir, 'edgechat-local-admin-upsert.sql');
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputPath, `${sql}\n`, 'utf8');

  console.log(`Generated local admin bootstrap SQL: ${outputPath}`);
  console.log(`Local admin username: ${username}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
