#!/usr/bin/env node

import { appendFileSync } from "node:fs";

const API_BASE_URL = "https://api.cloudflare.com/client/v4";

const requiredEnv = ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

const LEGACY_D1_DATABASE_NAME = "cfchat-db";
const LEGACY_KV_NAMESPACE_TITLE = "cfchat-sessions";
const LEGACY_R2_BUCKET_NAME = "cfchat-files";

function readEnv(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value) {
      return value;
    }
  }

  return undefined;
}

const d1DatabaseName =
  readEnv("EDGECHAT_D1_DATABASE_NAME", "CFCHAT_D1_DATABASE_NAME") ?? LEGACY_D1_DATABASE_NAME;
const kvNamespaceTitle =
  readEnv("EDGECHAT_KV_NAMESPACE_TITLE", "CFCHAT_KV_NAMESPACE_TITLE") ??
  LEGACY_KV_NAMESPACE_TITLE;
const r2BucketName =
  readEnv("EDGECHAT_R2_BUCKET_NAME", "CFCHAT_R2_BUCKET_NAME") ?? LEGACY_R2_BUCKET_NAME;

function setOutput(name, value) {
  const stringValue = String(value);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${stringValue}\n`);
  }
  console.log(`[output] ${name}=${stringValue}`);
}

function extractApiError(payload, fallback) {
  if (!payload || !Array.isArray(payload.errors) || payload.errors.length === 0) {
    return fallback;
  }
  return payload.errors.map((err) => `${err.code}: ${err.message}`).join("; ");
}

async function cloudflareRequest(method, path, { query, body } = {}) {
  const url = new URL(`${API_BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    if (!response.ok) {
      throw new Error(`Cloudflare API error (${response.status}): ${text}`);
    }
    throw new Error(`Unable to parse Cloudflare API response: ${text}`);
  }

  if (!response.ok || payload?.success === false) {
    const message = extractApiError(payload, "Unknown Cloudflare API error");
    throw new Error(`Cloudflare API request failed (${method} ${path}): ${message}`);
  }

  return payload;
}

function normalizeD1Record(item) {
  return {
    id: item.uuid ?? item.id ?? item.database_id ?? "",
    name: item.name ?? "",
  };
}

function normalizeKvRecord(item) {
  return {
    id: item.id ?? "",
    title: item.title ?? "",
  };
}

function normalizeR2Record(item) {
  return {
    name: item.name ?? item.bucket_name ?? "",
  };
}

async function listD1Databases() {
  const all = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const payload = await cloudflareRequest("GET", `/accounts/${accountId}/d1/database`, {
      query: { page, per_page: perPage },
    });
    const records = Array.isArray(payload.result) ? payload.result.map(normalizeD1Record) : [];
    all.push(...records);

    const resultInfo = payload.result_info;
    const reachedLastPage =
      !resultInfo?.total_pages || Number(page) >= Number(resultInfo.total_pages);
    if (reachedLastPage) {
      break;
    }
    page += 1;
  }

  return all;
}

async function listKvNamespaces() {
  const all = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const payload = await cloudflareRequest(
      "GET",
      `/accounts/${accountId}/storage/kv/namespaces`,
      { query: { page, per_page: perPage } },
    );
    const records = Array.isArray(payload.result) ? payload.result.map(normalizeKvRecord) : [];
    all.push(...records);

    const resultInfo = payload.result_info;
    const noMorePages = !resultInfo?.total_pages || page >= resultInfo.total_pages;
    if (noMorePages) {
      break;
    }
    page += 1;
  }

  return all;
}

async function listR2Buckets() {
  const payload = await cloudflareRequest("GET", `/accounts/${accountId}/r2/buckets`);
  const raw = payload.result;
  const buckets = Array.isArray(raw) ? raw : Array.isArray(raw?.buckets) ? raw.buckets : [];
  return buckets.map(normalizeR2Record);
}

async function ensureD1Database() {
  const databases = await listD1Databases();
  const existing = databases.find((db) => db.name === d1DatabaseName && db.id);
  if (existing) {
    console.log(`D1 database already exists: ${d1DatabaseName} (${existing.id})`);
    return { id: existing.id, created: false };
  }

  console.log(`Creating D1 database: ${d1DatabaseName}`);
  const payload = await cloudflareRequest("POST", `/accounts/${accountId}/d1/database`, {
    body: { name: d1DatabaseName },
  });
  const id = payload.result?.uuid ?? payload.result?.id ?? payload.result?.database_id;
  if (!id) {
    throw new Error("D1 create response is missing database id");
  }

  return { id, created: true };
}

async function ensureKvNamespace() {
  const namespaces = await listKvNamespaces();
  const existing = namespaces.find((ns) => ns.title === kvNamespaceTitle && ns.id);
  if (existing) {
    console.log(`KV namespace already exists: ${kvNamespaceTitle} (${existing.id})`);
    return { id: existing.id, created: false };
  }

  console.log(`Creating KV namespace: ${kvNamespaceTitle}`);
  const payload = await cloudflareRequest("POST", `/accounts/${accountId}/storage/kv/namespaces`, {
    body: { title: kvNamespaceTitle },
  });
  const id = payload.result?.id;
  if (!id) {
    throw new Error("KV create response is missing namespace id");
  }

  return { id, created: true };
}

async function ensureR2Bucket() {
  const buckets = await listR2Buckets();
  const existing = buckets.find((bucket) => bucket.name === r2BucketName);
  if (existing) {
    console.log(`R2 bucket already exists: ${r2BucketName}`);
    return { created: false };
  }

  console.log(`Creating R2 bucket: ${r2BucketName}`);
  await cloudflareRequest("POST", `/accounts/${accountId}/r2/buckets`, {
    body: { name: r2BucketName },
  });
  return { created: true };
}

async function main() {
  console.log("Ensuring Cloudflare resources for production deployment...");
  console.log(`Target account: ${accountId}`);
  console.log(
    "Using legacy Cloudflare resource names by default to avoid creating a second production stack.",
  );

  const d1 = await ensureD1Database();
  const kv = await ensureKvNamespace();
  const r2 = await ensureR2Bucket();

  setOutput("d1_database_name", d1DatabaseName);
  setOutput("d1_database_id", d1.id);
  setOutput("d1_created", d1.created);
  setOutput("kv_namespace_title", kvNamespaceTitle);
  setOutput("kv_namespace_id", kv.id);
  setOutput("kv_created", kv.created);
  setOutput("r2_bucket_name", r2BucketName);
  setOutput("r2_created", r2.created);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
