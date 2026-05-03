import { errorResponse } from '../utils.js';

const FILE_BROWSER_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const BLOCKED_MIME_TYPES = new Set([
  'text/html',
  'application/xhtml+xml',
  'image/svg+xml',
  'text/javascript',
  'application/javascript',
  'text/xml',
  'application/xml'
]);

// 禁止的文件扩展名（可能导致代码执行）
const BLOCKED_EXTENSIONS = new Set([
  '.php', '.phtml', '.php3', '.php4', '.php5', '.php7', '.phps',
  '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js',
  '.sh', '.bash', '.zsh', '.csh',
  '.asp', '.aspx', '.jsp', '.jspx', '.jspf',
  '.jar', '.war', '.ear',
  '.htaccess', '.htpasswd', '.htgroups',
  '.zip', '.rar', '.7z', '.tar', '.gz',  // 压缩包可能包含脚本
  '.dll', '.so', '.dylib', '.sys',  // 动态库
  '.app', '.deb', '.rpm', '.dmg',   // 可执行包
  '.msi', '.msix'                    // Windows 安装程序
]);

function normalizeContentType(value) {
  return String(value || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
}

function isInlineContentType(contentType) {
  if (!contentType) {
    return false;
  }
  if (contentType === 'application/pdf') {
    return true;
  }
  if (contentType.startsWith('image/')) {
    return contentType !== 'image/svg+xml';
  }
  if (contentType.startsWith('video/')) {
    return true;
  }
  return false;
}

function sanitizeFilename(value) {
  const cleaned = String(value || '')
    .trim()
    .replace(/[/\\]/g, '_')
    .split('')
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join('');
  return cleaned.slice(0, 180) || 'file';
}

function contentDispositionValue(kind, filename) {
  const safeUtf8 = sanitizeFilename(filename);
  const safeAscii = safeUtf8
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/"/g, '')
    .trim()
    .slice(0, 150) || 'file';
  return `${kind}; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(safeUtf8)}`;
}

function validateUpload(env, file) {
  const maxFileSize = Number(env.MAX_FILE_SIZE || 20971520);
  if (file.size > maxFileSize) {
    throw new Error(`文件大小不能超过 ${Math.round(maxFileSize / 1024 / 1024)}MB`);
  }

  // 检查文件扩展名（第一道防线）
  const filename = file.name.toLowerCase();
  const extIndex = filename.lastIndexOf('.');
  if (extIndex > 0) {
    const ext = filename.slice(extIndex);
    if (BLOCKED_EXTENSIONS.has(ext)) {
      throw new Error(`不允许上传 ${ext} 文件`);
    }
  }

  const contentType = normalizeContentType(file.type);
  if (BLOCKED_MIME_TYPES.has(contentType)) {
    throw new Error('该文件类型不允许上传');
  }

  const allowed = String(env.ALLOWED_FILE_TYPES || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (allowed.length && !allowed.some((prefix) => contentType.startsWith(prefix))) {
    throw new Error('该文件类型不允许上传');
  }
}

export function registerUploadRoutes(app) {
  app.post('/api/upload', async (c) => {
    const session = c.get('session');
    const formData = await c.req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return errorResponse('请选择文件');
    }

    try {
      validateUpload(c.env, file);
    } catch (error) {
      return errorResponse(error.message);
    }

    const extension = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
    const key = `${session.userId}/${Date.now()}-${crypto.randomUUID()}${extension}`;
    await c.env.FILES.put(key, await file.arrayBuffer(), {
      httpMetadata: {
        contentType: normalizeContentType(file.type) || 'application/octet-stream',
        cacheControl: FILE_BROWSER_CACHE_CONTROL
      },
      customMetadata: {
        filename: sanitizeFilename(file.name)
      }
    });

    return c.json({
      file: {
        key,
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        url: `/files/${encodeURIComponent(key)}`
      }
    });
  });

  app.get('/files/:key{.+}', async (c) => {
    const key = decodeURIComponent(c.req.param('key'));
    const object = await c.env.FILES.get(key);
    if (!object) {
      return new Response('Not Found', { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('cache-control', headers.get('cache-control') || FILE_BROWSER_CACHE_CONTROL);
    if (object.uploaded) {
      headers.set('last-modified', object.uploaded.toUTCString());
    }

    headers.set('x-content-type-options', 'nosniff');
    headers.set('referrer-policy', 'no-referrer');
    headers.set(
      'content-security-policy',
      "sandbox; default-src 'none'; base-uri 'none'; form-action 'none'"
    );

    const contentType = normalizeContentType(headers.get('content-type'));
    const inlineAllowed = isInlineContentType(contentType);
    const dispositionKind =
      inlineAllowed && !contentType.startsWith('text/') ? 'inline' : 'attachment';
    const filename = object.customMetadata?.filename || key.split('/').pop() || 'file';
    headers.set('content-disposition', contentDispositionValue(dispositionKind, filename));

    const ifNoneMatch = c.req.header('if-none-match');
    if (ifNoneMatch && ifNoneMatch === object.httpEtag) {
      return new Response(null, {
        status: 304,
        headers
      });
    }

    return new Response(object.body, { headers });
  });
}
