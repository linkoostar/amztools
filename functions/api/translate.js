// ============================================
// POST /api/translate  —  AI 翻译代理（非流式）
// 取用户翻译器配置，未配置则回退到管理员共享配置
// Body: { text, target_lang }
// 响应：JSON { content }
// ============================================

import { getDb, now, jsonResponse, errorResponse } from './_utils/db.js';
import { requireAuth } from './_utils/auth.js';

// 管理员预置的翻译器兜底配置（环境变量，在 Pages 项目变量里配置）
// 变量名: TR_API_BASE / TR_API_MODEL / TR_API_KEY
function getEnvFallback(context) {
  const env = (context && context.env) || {};
  return {
    api_base: env.TR_API_BASE || '',
    api_model: env.TR_API_MODEL || '',
    api_key: env.TR_API_KEY || ''
  };
}

// 取用户翻译器配置；未配置回退到管理员共享；都没有再回退到环境变量
async function getTranslatorConfig(db, userId, context) {
  // 1) 用户自己的配置
  const own = await db.prepare(
    'SELECT tr_api_base, tr_api_model, tr_api_key FROM translator_settings WHERE user_id = ?'
  ).bind(userId).first();
  if (own && own.tr_api_base && own.tr_api_model && own.tr_api_key) {
    return { api_base: own.tr_api_base, api_model: own.tr_api_model, api_key: own.tr_api_key, source: 'user' };
  }

  // 2) 管理员共享配置
  const admin = await db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").first();
  if (admin && admin.id !== userId) {
    const adminCfg = await db.prepare(
      'SELECT tr_api_base, tr_api_model, tr_api_key FROM translator_settings WHERE user_id = ?'
    ).bind(admin.id).first();
    if (adminCfg && adminCfg.tr_api_base && adminCfg.tr_api_model && adminCfg.tr_api_key) {
      return { api_base: adminCfg.tr_api_base, api_model: adminCfg.tr_api_model, api_key: adminCfg.tr_api_key, source: 'shared' };
    }
  }

  // 3) 环境变量兜底（管理员预置的 Cloudflare Pages 变量）
  const env = getEnvFallback(context);
  if (env.api_base && env.api_model && env.api_key) {
    return { api_base: env.api_base, api_model: env.api_model, api_key: env.api_key, source: 'env' };
  }

  return null;
}

export async function onRequestPost(context) {
  const { user, error } = await requireAuth(context.request, context);
  if (error) return error;

  let body;
  try { body = await context.request.json(); } catch { return errorResponse('无效的 JSON'); }
  const { text, target_lang } = body;
  if (!text) return errorResponse('翻译内容不能为空', 400);
  if (!target_lang) return errorResponse('目标语言不能为空', 400);

  const db = await getDb(context);
  const cfg = await getTranslatorConfig(db, user.id, context);
  if (!cfg) {
    return errorResponse('请先在设置中配置翻译器 API（也可由管理员在环境变量预置）', 400);
  }

  // 调用 OpenAI 兼容接口
  let baseUrl = cfg.api_base.replace(/\/+$/, '');
  if (!baseUrl.endsWith('/v1')) baseUrl += '/v1';
  const url = baseUrl + '/chat/completions';
  const prompt = '把以下文本翻译成' + target_lang + '：\n\n' + text;

  try {
    const aiRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cfg.api_key
      },
      body: JSON.stringify({
        model: cfg.api_model,
        messages: [{ role: 'user', content: prompt }],
        stream: false
      })
    });
    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => '');
      return errorResponse('AI 接口错误: ' + aiRes.status + ' ' + errText.slice(0, 300), 502);
    }
    const data = await aiRes.json();
    const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    if (!content) return errorResponse('AI 返回空内容', 502);
    return jsonResponse({ content: content.trim(), source: cfg.source });
  } catch (e) {
    return errorResponse('调用 AI 接口失败: ' + e.message, 500);
  }
}

export async function onRequestOptions() {
  return new Response('', {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization'
    }
  });
}
