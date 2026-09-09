// ============================================
// GET  /api/translate-settings  —  获取翻译器 API 配置
// PUT  /api/translate-settings  —  更新当前用户的翻译器配置
// DELETE /api/translate-settings — 清除个人配置，回退到管理员共享或环境变量
// ============================================

import { getDb, now, jsonResponse, errorResponse } from './_utils/db.js';
import { requireAuth } from './_utils/auth.js';

// 环境变量兜底配置
function getEnvFallback(context) {
  const env = (context && context.env) || {};
  return {
    api_base: env.TR_API_BASE || '',
    api_model: env.TR_API_MODEL || '',
    api_key: env.TR_API_KEY || ''
  };
}

function maskKey(key) {
  if (!key) return '';
  return '••••' + key.slice(-4);
}

export async function onRequestGet(context) {
  const { user, error } = await requireAuth(context.request, context);
  if (error) return error;

  const db = await getDb(context);
  const own = await db.prepare(
    'SELECT tr_api_base, tr_api_model, tr_api_key FROM translator_settings WHERE user_id = ?'
  ).bind(user.id).first();

  const userInfo = { id: user.id, email: user.email, nickname: user.nickname, role: user.role || 'user' };
  const hasOwn = own && own.tr_api_base && own.tr_api_model && own.tr_api_key;

  if (hasOwn) {
    return jsonResponse({
      api_base: own.tr_api_base,
      api_model: own.tr_api_model,
      api_key: maskKey(own.tr_api_key),
      user: userInfo,
      is_shared: false,
      source: 'user'
    });
  }

  // 回退到管理员共享
  const admin = await db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").first();
  if (admin && admin.id !== user.id) {
    const adminCfg = await db.prepare(
      'SELECT tr_api_base, tr_api_model, tr_api_key FROM translator_settings WHERE user_id = ?'
    ).bind(admin.id).first();
    if (adminCfg && adminCfg.tr_api_base && adminCfg.tr_api_model && adminCfg.tr_api_key) {
      return jsonResponse({
        api_base: adminCfg.tr_api_base,
        api_model: adminCfg.tr_api_model,
        api_key: maskKey(adminCfg.tr_api_key),
        user: userInfo,
        is_shared: true,
        source: 'shared'
      });
    }
  }

  // 回退到环境变量
  const env = getEnvFallback(context);
  if (env.api_base && env.api_model && env.api_key) {
    return jsonResponse({
      api_base: env.api_base,
      api_model: env.api_model,
      api_key: maskKey(env.api_key),
      user: userInfo,
      is_shared: true,
      source: 'env'
    });
  }

  // 都没有：返回空，前端使用本地默认值
  return jsonResponse({
    api_base: '', api_model: '', api_key: '',
    user: userInfo, is_shared: false, source: 'none'
  });
}

export async function onRequestPut(context) {
  const { user, error } = await requireAuth(context.request, context);
  if (error) return error;

  let body;
  try { body = await context.request.json(); } catch { return errorResponse('无效的 JSON'); }
  const { api_base, api_model, api_key } = body;
  const db = await getDb(context);
  const t = now();

  const existing = await db.prepare('SELECT id FROM translator_settings WHERE user_id = ?').bind(user.id).first();
  if (existing) {
    // api_key 以 •••• 开头表示用户未改 key，保留原值
    if (api_key && api_key.startsWith('••••')) {
      await db.prepare(
        'UPDATE translator_settings SET tr_api_base = ?, tr_api_model = ?, updated_at = ? WHERE user_id = ?'
      ).bind(api_base || '', api_model || '', t, user.id).run();
    } else {
      await db.prepare(
        'UPDATE translator_settings SET tr_api_base = ?, tr_api_model = ?, tr_api_key = ?, updated_at = ? WHERE user_id = ?'
      ).bind(api_base || '', api_model || '', api_key || '', t, user.id).run();
    }
  } else {
    await db.prepare(
      'INSERT INTO translator_settings (user_id, tr_api_base, tr_api_model, tr_api_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(user.id, api_base || '', api_model || '', api_key || '', t, t).run();
  }
  return jsonResponse({ success: true });
}

export async function onRequestDelete(context) {
  const { user, error } = await requireAuth(context.request, context);
  if (error) return error;
  const db = await getDb(context);
  await db.prepare('DELETE FROM translator_settings WHERE user_id = ?').bind(user.id).run();
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
