// ============================================
// POST /api/translate  —  AI 翻译代理（非流式，免登录）
// 仅使用环境变量预置的配置作为兜底
// 用户若在浏览器本地填了自己的配置，前端会直接用本地配置直调，不走这里
// Body: { text, target_lang }
// 响应：JSON { content }
// ============================================

import { jsonResponse, errorResponse } from './_utils/db.js';

export async function onRequestPost(context) {
  const env = (context && context.env) || {};
  const apiBase = env.TR_API_BASE || '';
  const apiModel = env.TR_API_MODEL || '';
  const apiKey = env.TR_API_KEY || '';

  if (!apiBase || !apiModel || !apiKey) {
    return errorResponse('服务器未预置翻译 API 配置，请在设置中填写自己的 API Key', 400);
  }

  let body;
  try { body = await context.request.json(); } catch { return errorResponse('无效的 JSON'); }
  const { text, target_lang } = body;
  if (!text) return errorResponse('翻译内容不能为空', 400);
  if (!target_lang) return errorResponse('目标语言不能为空', 400);

  // 调用 OpenAI 兼容接口
  let baseUrl = apiBase.replace(/\/+$/, '');
  if (!baseUrl.endsWith('/v1')) baseUrl += '/v1';
  const url = baseUrl + '/chat/completions';
  const prompt = '把以下文本翻译成' + target_lang + '：\n\n' + text;

  try {
    const aiRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: apiModel,
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
    return jsonResponse({ content: content.trim() });
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
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
