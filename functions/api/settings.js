// ============================================
// GET  /api/settings  —  获取当前用户的 API 配置
// PUT  /api/settings  —  更新 API 配置
// ============================================

import { getDb, now, jsonResponse, errorResponse } from './_utils/db.js';
import { requireAuth } from './_utils/auth.js';

export async function onRequestGet(context) {
  const { user, error } = await requireAuth(context.request, context);
  if (error) return error;

  const db = getDb(context);
  const settings = await db.prepare(
    'SELECT api_base, api_model, api_key FROM user_settings WHERE user_id = ?'
  ).bind(user.id).first();

  if (!settings) {
    return jsonResponse({ api_base: '', api_model: '', api_key: '', user: { id: user.id, email: user.email, nickname: user.nickname, role: user.role || 'user' } });
  }
  const maskedKey = settings.api_key ? '••••' + settings.api_key.slice(-4) : '';
  return jsonResponse({
    api_base: settings.api_base,
    api_model: settings.api_model,
    api_key: maskedKey,
    user: { id: user.id, email: user.email, nickname: user.nickname, role: user.role || 'user' }
  });
}

export async function onRequestPut(context) {
  const { user, error } = await requireAuth(context.request, context);
  if (error) return error;

  let body;
  try {
    body = await context.request.json();
  } catch {
    return errorResponse('无效的 JSON');
  }

  const { api_base, api_model, api_key } = body;
  const db = getDb(context);
  const t = now();

  // 检查是否有设置记录
  const existing = await db.prepare('SELECT id FROM user_settings WHERE user_id = ?').bind(user.id).first();

  if (existing) {
    // 如果 api_key 是掩码格式（••••开头），说明没改，不更新
    if (api_key && api_key.startsWith('••••')) {
      await db.prepare(
        'UPDATE user_settings SET api_base = ?, api_model = ?, updated_at = ? WHERE user_id = ?'
      ).bind(api_base || '', api_model || '', t, user.id).run();
    } else {
      await db.prepare(
        'UPDATE user_settings SET api_base = ?, api_model = ?, api_key = ?, updated_at = ? WHERE user_id = ?'
      ).bind(api_base || '', api_model || '', api_key || '', t, user.id).run();
    }
  } else {
    await db.prepare(
      'INSERT INTO user_settings (user_id, api_base, api_model, api_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(user.id, api_base || '', api_model || '', api_key || '', t, t).run();
  }

  return jsonResponse({ success: true });
}

export async function onRequestOptions() {
  return new Response('', {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization'
    }
  });
}
