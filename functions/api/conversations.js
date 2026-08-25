// ============================================
// GET    /api/conversations  —  对话列表
// POST   /api/conversations  —  新建对话
// 单条对话的详情/删除由 [id].js 处理
// ============================================

import { getDb, now, uuid, jsonResponse, errorResponse } from './_utils/db.js';
import { requireAuth } from './_utils/auth.js';

export async function onRequestGet(context) {
  const { user, error } = await requireAuth(context.request, context);
  if (error) return error;

  const url = new URL(context.request.url);
  const limit = parseInt(url.searchParams.get('limit')) || 50;
  const offset = parseInt(url.searchParams.get('offset')) || 0;

  const db = await getDb(context);
  const result = await db.prepare(
    'SELECT id, title, content_type, created_at, updated_at FROM conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?'
  ).bind(user.id, limit, offset).all();

  const convs = result.results || [];
  for (const c of convs) {
    const cnt = await db.prepare(
      'SELECT COUNT(*) as cnt FROM messages WHERE conversation_id = ? AND role = ?'
    ).bind(c.id, 'assistant').first();
    c.message_count = cnt ? cnt.cnt : 0;
  }

  return jsonResponse({ conversations: convs });
}

export async function onRequestPost(context) {
  const { user, error } = await requireAuth(context.request, context);
  if (error) return error;

  let body;
  try {
    body = await context.request.json();
  } catch {
    return errorResponse('无效的 JSON');
  }

  const { title, content_type, product_info } = body;
  if (!title || !content_type || !product_info) {
    return errorResponse('标题、类型、产品信息不能为空');
  }

  const db = await getDb(context);
  const t = now();
  const id = uuid();

  await db.prepare(
    'INSERT INTO conversations (id, user_id, title, content_type, product_info, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, user.id, title, content_type, JSON.stringify(product_info), t, t).run();

  return jsonResponse({ id, title, content_type, created_at: t, updated_at: t });
}

export async function onRequestOptions() {
  return new Response('', {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization'
    }
  });
}
