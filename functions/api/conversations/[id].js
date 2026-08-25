// ============================================
// GET    /api/conversations/:id  —  对话详情（含消息）
// DELETE /api/conversations/:id  —  删除对话
// ============================================

import { getDb, jsonResponse, errorResponse } from '../_utils/db.js';
import { requireAuth } from '../_utils/auth.js';

export async function onRequestGet(context) {
  const { user, error } = await requireAuth(context.request, context);
  if (error) return error;

  const id = context.params.id;
  if (!id) return errorResponse('缺少对话 ID');

  const db = await getDb(context);

  const conv = await db.prepare(
    'SELECT id, title, content_type, product_info, created_at, updated_at FROM conversations WHERE id = ? AND user_id = ?'
  ).bind(id, user.id).first();

  if (!conv) return errorResponse('对话不存在', 404);

  const messages = await db.prepare(
    'SELECT role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
  ).bind(id).all();

  return jsonResponse({
    conversation: conv,
    messages: messages.results || []
  });
}

export async function onRequestDelete(context) {
  const { user, error } = await requireAuth(context.request, context);
  if (error) return error;

  const id = context.params.id;
  if (!id) return errorResponse('缺少对话 ID');

  const db = await getDb(context);

  const conv = await db.prepare(
    'SELECT id FROM conversations WHERE id = ? AND user_id = ?'
  ).bind(id, user.id).first();

  if (!conv) return errorResponse('对话不存在', 404);

  await db.prepare('DELETE FROM messages WHERE conversation_id = ?').bind(id).run();
  await db.prepare('DELETE FROM conversations WHERE id = ? AND user_id = ?').bind(id, user.id).run();

  return jsonResponse({ success: true });
}

export async function onRequestOptions() {
  return new Response('', {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization'
    }
  });
}
