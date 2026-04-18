export function jsonResponse(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(init.headers || {})
    }
  });
}

export function errorResponse(message, status = 400) {
  return jsonResponse({ error: message }, { status });
}

export function parseJsonRequest(request) {
  return request.json().catch(() => ({}));
}

export function sanitizeLimit(value, fallback = 30, max = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, max);
}

export function pickAttachment(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  if (!payload.key || !payload.name || !payload.type) {
    return null;
  }

  return {
    key: String(payload.key),
    name: String(payload.name),
    type: String(payload.type),
    size: Number(payload.size) || 0,
    url: `/files/${encodeURIComponent(String(payload.key))}`
  };
}

export function publicFileUrl(key) {
  return `/files/${encodeURIComponent(key)}`;
}

export function nextDailyUtcHour(hour) {
  const target = new Date();
  target.setUTCMinutes(0, 0, 0);
  target.setUTCHours(hour);
  if (target <= new Date()) {
    target.setUTCDate(target.getUTCDate() + 1);
  }
  return target;
}

export function randomToken(byteLength = 24) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
