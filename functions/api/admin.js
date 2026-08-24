// ============================================
// /api/admin  —  管理员账号管理
// GET    /api/admin          列出所有子账号
// POST   /api/admin          创建子账号
// DELETE /api/admin?id=X    删除子账号
// GET    /api/admin/setup    首次设置管理员账号
// ============================================

import { getDb, now, jsonResponse, errorResponse } from './_utils/db.js';
import { requireAuth, hashPassword } from './_utils/auth.js';

// 首次设置：如果没有管理员，将当前用户提升为管理员
export async function onRequestGet(context) {
  const { user, error } = await requireAuth(context.request, context);
  if (error) return error;

  const db = getDb(context);

  // 检查是否已有管理员
  const admin = await db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").first();

  if (!admin) {
    // 提升当前用户为管理员
    await db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(user.id).run();
    return jsonResponse({ success: true, message: '您已被提升为管理员', promoted: true });
  }

  // 已有管理员，列出所有子账号
  if (user.role !== 'admin') {
    return errorResponse('无权限', 403);
  }

  const users = await db.prepare(
    'SELECT id, email, nickname, role, created_at FROM users ORDER BY created_at ASC'
  ).all();

  return jsonResponse({ users: users.results || [] });
}

// 创建子账号
export async function onRequestPost(context) {
  const { user, error } = await requireAuth(context.request, context);
  if (error) return error;

  if (user.role !== 'admin') {
    return errorResponse('无权限，只有管理员可以创建子账号', 403);
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return errorResponse('无效的 JSON');
  }

  const { email, password, nickname } = body;
  if (!email || !password) return errorResponse('邮箱和密码不能为空');
  if (password.length < 6) return errorResponse('密码至少 6 位');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return errorResponse('邮箱格式不正确');

  const db = getDb(context);
  const t = now();

  const existing = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email.toLowerCase()).first();
  if (existing) return errorResponse('该邮箱已被注册');

  const pwdHash = await hashPassword(password);
  const result = await db.prepare(
    'INSERT INTO users (email, password_hash, nickname, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(email.toLowerCase(), pwdHash, nickname || '', 'user', t, t).run();

  await db.prepare(
    'INSERT INTO user_settings (user_id, api_base, api_model, api_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(result.meta.last_row_id, '', '', '', t, t).run();

  return jsonResponse({ success: true, user: { id: result.meta.last_row_id, email: email.toLowerCase(), nickname: nickname || '', role: 'user' } });
}

// 删除子账号
export async function onRequestDelete(context) {
  const { user, error } = await requireAuth(context.request, context);
  if (error) return error;

  if (user.role !== 'admin') {
    return errorResponse('无权限', 403);
  }

  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');
  if (!id) return errorResponse('缺少 id 参数');

  const db = getDb(context);

  if (parseInt(id) === user.id) {
    return errorResponse('不能删除自己的账号', 400);
  }

  const target = await db.prepare('SELECT role FROM users WHERE id = ?').bind(id).first();
  if (!target) return errorResponse('用户不存在', 404);
  if (target.role === 'admin') return errorResponse('不能删除管理员账号', 400);

  await db.prepare('DELETE FROM users WHERE id = ?').bind(id).run();

  return jsonResponse({ success: true });
}

export async function onRequestOptions() {
  return new Response('', {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization'
    }
  });
}
