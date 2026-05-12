#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { hashPassword } from "../../worker/src/auth.js";

const username = String(
  process.env.EDGECHAT_ADMIN_USERNAME || process.env.CFCHAT_ADMIN_USERNAME || "",
).trim();
const password = String(process.env.EDGECHAT_ADMIN_PASSWORD || process.env.CFCHAT_ADMIN_PASSWORD || "");
const displayNameInput = String(
  process.env.EDGECHAT_ADMIN_DISPLAY_NAME || process.env.CFCHAT_ADMIN_DISPLAY_NAME || "",
).trim();
const displayName = displayNameInput || username || "Administrator";

if (!username) {
  throw new Error(
    "Missing required environment variable: EDGECHAT_ADMIN_USERNAME (or legacy CFCHAT_ADMIN_USERNAME)",
  );
}

if (!password) {
  throw new Error(
    "Missing required environment variable: EDGECHAT_ADMIN_PASSWORD (or legacy CFCHAT_ADMIN_PASSWORD)",
  );
}

function escapeSql(value) {
  return String(value).replace(/'/g, "''");
}

async function main() {
  const hashed = await hashPassword(password);

  const safeUsername = escapeSql(username);
  const safeDisplayName = escapeSql(displayName);
  const safeHash = escapeSql(hashed.hash);
  const safeSalt = escapeSql(hashed.salt);
  const safeVersion = Number(hashed.version) || 2;

  // 仅在用户不存在时插入；不会更新已存在的用户、不会"复活"被禁用或软删的账户。
  // 后续账户管理（启用/禁用、改密、删除）应通过应用内管理员后台完成，
  // 不应依赖 CI 反复执行该脚本。
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

  const outputPath = resolve(process.cwd(), ".tmp", "edgechat-admin-upsert.sql");
  mkdirSync(resolve(process.cwd(), ".tmp"), { recursive: true });
  writeFileSync(outputPath, `${sql}\n`, "utf8");

  console.log(`Generated admin bootstrap SQL: ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
