// ============================================
// POST /api/auth/register  —  用户注册
// Body: { email, password, nickname? }
// ============================================

import { getDb, now, jsonResponse, errorResponse } from '../_utils/db.js';
import { hashPassword, createSession } from '../_utils/auth.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const db = getDb(context);

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('无效的 JSON');
  }

  const { email, password, nickname } = body;

  if (!email || !password) {
    return errorResponse('邮箱和密码不能为空');
  }
  if (password.length < 6) {
    return errorResponse('密码至少 6 位');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return errorResponse('邮箱格式不正确');
  }

  // 检查邮箱是否已存在
  const existing = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email.toLowerCase()).first();
  if (existing) {
    return errorResponse('邮箱已注册');
  }

  const t = now();
  const pwdHash = await hashPassword(password);

  const result = await db.prepare(
    'INSERT INTO users (email, password_hash, nickname, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(email.toLowerCase(), pwdHash, nickname || '', t, t).run();

  const userId = result.meta.last_row_id;

  // 创建设置记录
  await db.prepare(
    'INSERT INTO user_settings (user_id, api_base, api_model, api_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(userId, '', '', '', t, t).run();

  // 自动登录
  const { token, expiresAt } = await createSession(db, userId);

  return new Response(JSON.stringify({
    success: true,
    user: { id: userId, email: email.toLowerCase(), nickname: nickname || '' },
    token
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${(expiresAt - t)}`,
      'Access-Control-Allow-Origin': '*'
    }
  });
}

export async function onRequestOptions() {
  return new Response('', {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
