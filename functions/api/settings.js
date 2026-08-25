// ============================================
// GET  /api/settings  —  获取当前用户的 API 配置
// PUT  /api/settings  —  更新 API 配置
// ============================================

import { getDb, now, jsonResponse, errorResponse } from './_utils/db.js';
import { requireAuth } from './_utils/auth.js';

export async function onRequestGet(context) {
  const { user, error } = await requireAuth(context.request, context);
  if (error) return error;

  const db = await getDb(context);
  const settings = await db.prepare(
    'SELECT api_base, api_model, api_key, custom_prompt FROM user_settings WHERE user_id = ?'
  ).bind(user.id).first();

  const userInfo = { id: user.id, email: user.email, nickname: user.nickname, role: user.role || 'user' };

  const hasOwnSettings = settings && settings.api_base && settings.api_model && settings.api_key;
  if (hasOwnSettings) {
    return jsonResponse({
      api_base: settings.api_base,
      api_model: settings.api_model,
      api_key: '••••' + settings.api_key.slice(-4),
      custom_prompt: settings.custom_prompt || null,
      user: userInfo,
      is_shared: false
    });
  }

  // 用户未设置，尝试回退到管理员的共享配置
  const admin = await db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").first();
  if (admin && admin.id !== user.id) {
    const adminSettings = await db.prepare(
      'SELECT api_base, api_model, api_key FROM user_settings WHERE user_id = ?'
    ).bind(admin.id).first();
    if (adminSettings && adminSettings.api_base && adminSettings.api_model && adminSettings.api_key) {
      return jsonResponse({
        api_base: adminSettings.api_base,
        api_model: adminSettings.api_model,
        api_key: '••••' + adminSettings.api_key.slice(-4),
        custom_prompt: (settings && settings.custom_prompt) || null,
        user: userInfo,
        is_shared: true
      });
    }
  }

  return jsonResponse({
    api_base: '', api_model: '', api_key: '',
    custom_prompt: (settings && settings.custom_prompt) || null,
    user: userInfo, is_shared: false
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
  const hasCustomPrompt = 'custom_prompt' in body;
  const custom_prompt = hasCustomPrompt ? body.custom_prompt : undefined;
  const db = await getDb(context);
  const t = now();

  // 检查是否有设置记录
  const existing = await db.prepare('SELECT id, custom_prompt FROM user_settings WHERE user_id = ?').bind(user.id).first();

  if (existing) {
    // custom_prompt 未传则保留原值，传 null 清除，传字符串保存
    const effectivePrompt = hasCustomPrompt ? (custom_prompt ?? null) : existing.custom_prompt;
    // 如果 api_key 是掩码格式（••••开头），说明没改，不更新
    if (api_key && api_key.startsWith('••••')) {
      await db.prepare(
        'UPDATE user_settings SET api_base = ?, api_model = ?, custom_prompt = ?, updated_at = ? WHERE user_id = ?'
      ).bind(api_base || '', api_model || '', effectivePrompt, t, user.id).run();
    } else {
      await db.prepare(
        'UPDATE user_settings SET api_base = ?, api_model = ?, api_key = ?, custom_prompt = ?, updated_at = ? WHERE user_id = ?'
      ).bind(api_base || '', api_model || '', api_key || '', effectivePrompt, t, user.id).run();
    }
  } else {
    await db.prepare(
      'INSERT INTO user_settings (user_id, api_base, api_model, api_key, custom_prompt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(user.id, api_base || '', api_model || '', api_key || '', hasCustomPrompt ? (custom_prompt ?? null) : null, t, t).run();
  }

  return jsonResponse({ success: true });
}

// DELETE /api/settings — 清除个人 API 配置，回退到管理员共享配置
export async function onRequestDelete(context) {
  const { user, error } = await requireAuth(context.request, context);
  if (error) return error;

  const db = await getDb(context);
  await db.prepare('DELETE FROM user_settings WHERE user_id = ?').bind(user.id).run();
  return jsonResponse({ success: true });
}

export async function onRequestOptions() {
  return new Response('', {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization'
    }
  });
}
