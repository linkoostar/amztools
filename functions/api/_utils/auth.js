// ============================================
// 认证工具：密码哈希、Session 校验
// ============================================

import { getDb, now, jsonResponse, errorResponse } from './db.js';

const SESSION_DAYS = 30;
const TOKEN_BYTES = 32;

// 生成随机 token
function generateToken() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let token = '';
  const arr = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(arr);
  for (let i = 0; i < TOKEN_BYTES; i++) {
    token += chars[arr[i] % chars.length];
  }
  return token;
}

// 使用 Web Crypto API 做 PBKDF2 哈希
export async function hashPassword(password) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  const hash = btoa(String.fromCharCode(...new Uint8Array(derived)));
  const saltStr = btoa(String.fromCharCode(...salt));
  return saltStr + '$' + hash;
}

export async function verifyPassword(password, stored) {
  const [saltStr, hashStr] = stored.split('$');
  const encoder = new TextEncoder();
  const salt = Uint8Array.from(atob(saltStr), c => c.charCodeAt(0));
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  const hash = btoa(String.fromCharCode(...new Uint8Array(derived)));
  return hash === hashStr;
}

// 创建 session，返回 token
export async function createSession(db, userId) {
  const token = generateToken();
  const createdAt = now();
  const expiresAt = createdAt + SESSION_DAYS * 86400;
  await db.prepare(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).bind(token, userId, createdAt, expiresAt).run();
  return { token, expiresAt };
}

// 从请求中获取当前用户
export async function getCurrentUser(request, context) {
  // 先从 Authorization header 取，再从 cookie 取
  let token = null;
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else {
    const cookieHeader = request.headers.get('Cookie');
    if (cookieHeader) {
      const match = cookieHeader.match(/session=([^;]+)/);
      if (match) token = match[1];
    }
  }
  if (!token) return null;

  const db = await getDb(context);
  const result = await db.prepare(
    'SELECT s.user_id, s.expires_at, u.email, u.nickname, u.role FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ?'
  ).bind(token).first();

  if (!result) return null;
  if (result.expires_at < now()) {
    // 过期了，删除
    await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    return null;
  }
  return { id: result.user_id, email: result.email, nickname: result.nickname, role: result.role || 'user', token };
}

// 需要登录的中间件
export async function requireAuth(request, context) {
  const user = await getCurrentUser(request, context);
  if (!user) {
    return { user: null, error: errorResponse('未登录', 401) };
  }
  return { user, error: null };
}
