// ============================================
// GET    /api/conversations        —  对话列表
// POST   /api/conversations        —  新建对话
// GET    /api/conversations/:id    —  对话详情（含消息）
// DELETE /api/conversations/:id    —  删除对话
// ============================================

import { getDb, now, uuid, jsonResponse, errorResponse } from './_utils/db.js';
import { requireAuth } from './_utils/auth.js';

export async function onRequestGet(context) {
  const { user, error } = await requireAuth(context.request, context);
  if (error) return error;

  const url = new URL(context.request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  // path: api/conversations 或 api/conversations/:id
  const id = pathParts[2];

  const db = getDb(context);

  if (id) {
    // 单条对话详情 + 消息
    const conv = await db.prepare(
      'SELECT id, title, content_type, product_info, created_at, updated_at FROM conversations WHERE id = ? AND user_id = ?'
    ).bind(id, user.id).first();
    if (!conv) return errorResponse('对话不存在', 404);

    const messages = await db.prepare(
      'SELECT role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
    ).bind(id).all();

    return jsonResponse({
      conversation: conv,
      messages: messages.results
    });
  } else {
    // 列表
    const limit = parseInt(url.searchParams.get('limit')) || 50;
    const offset = parseInt(url.searchParams.get('offset')) || 0;
    const result = await db.prepare(
      'SELECT id, title, content_type, created_at, updated_at FROM conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?'
    ).bind(user.id, limit, offset).all();

    // 统计每条对话的消息数
    const convs = result.results;
    for (const c of convs) {
      const cnt = await db.prepare(
        'SELECT COUNT(*) as cnt FROM messages WHERE conversation_id = ? AND role = ?'
      ).bind(c.id, 'assistant').first();
      c.message_count = cnt.cnt;
    }

    return jsonResponse({ conversations: convs });
  }
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

  const db = getDb(context);
  const t = now();
  const id = uuid();

  await db.prepare(
    'INSERT INTO conversations (id, user_id, title, content_type, product_info, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, user.id, title, content_type, JSON.stringify(product_info), t, t).run();

  return jsonResponse({ id, title, content_type, created_at: t, updated_at: t });
}

export async function onRequestDelete(context) {
  const { user, error } = await requireAuth(context.request, context);
  if (error) return error;

  const url = new URL(context.request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const id = pathParts[2];

  if (!id) return errorResponse('缺少对话 ID');

  const db = getDb(context);

  // 先确认归属
  const conv = await db.prepare('SELECT id FROM conversations WHERE id = ? AND user_id = ?').bind(id, user.id).first();
  if (!conv) return errorResponse('对话不存在', 404);

  // 删除消息（外键级联也会删，但显式删更保险）
  await db.prepare('DELETE FROM messages WHERE conversation_id = ?').bind(id).run();
  await db.prepare('DELETE FROM conversations WHERE id = ? AND user_id = ?').bind(id, user.id).run();

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
