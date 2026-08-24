// ============================================
// POST /api/auth/login  —  用户登录
// Body: { email, password }
// ============================================

import { getDb, now, errorResponse } from '../_utils/db.js';
import { verifyPassword, createSession } from '../_utils/auth.js';

export async function onRequestPost(context) {
  const { request } = context;
  const db = getDb(context);

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('无效的 JSON');
  }

  const { email, password } = body;
  if (!email || !password) {
    return errorResponse('邮箱和密码不能为空');
  }

  const user = await db.prepare(
    'SELECT id, email, password_hash, nickname FROM users WHERE email = ?'
  ).bind(email.toLowerCase()).first();

  if (!user) {
    return errorResponse('邮箱或密码错误');
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return errorResponse('邮箱或密码错误');
  }

  const t = now();
  const { token, expiresAt } = await createSession(db, user.id);

  return new Response(JSON.stringify({
    success: true,
    user: { id: user.id, email: user.email, nickname: user.nickname },
    token
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${expiresAt - t}`,
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
