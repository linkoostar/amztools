// ============================================
// POST /api/google-trends  —  Google Keyword Insight API 代理
// 使用 RapidAPI google-keyword-insight1 API
// Body: { keyword, geo, lang }
// ============================================

import { jsonResponse, errorResponse } from './_utils/db.js';

const RAPID_HOST = 'google-keyword-insight1.p.rapidapi.com';
const RAPID_KEY = '63990e1ac4msh48fe26069047bc0p122f8djsn4293329c4054';

export async function onRequestPost(context) {
  let body;
  try { body = await context.request.json(); } catch { return errorResponse('无效的 JSON'); }

  const { keyword, geo = 'US', lang = 'en' } = body;
  if (!keyword) return errorResponse('请输入关键词');

  const qs = `keyword=${encodeURIComponent(keyword)}&location=${encodeURIComponent(geo)}&lang=${encodeURIComponent(lang)}`;
  const url = `https://${RAPID_HOST}/keysuggest/?${qs}`;

  try {
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'x-rapidapi-host': RAPID_HOST,
        'x-rapidapi-key': RAPID_KEY
      }
    });

    if (!res.ok) {
      const text = await res.text();
      return errorResponse(`API 错误 ${res.status}: ${text.slice(0, 300)}`, 502);
    }

    const data = await res.json();
    return jsonResponse(data);
  } catch (e) {
    return errorResponse('请求失败: ' + e.message, 502);
  }
}

export async function onRequestGet() {
  return jsonResponse({
    name: 'Google Keyword Insight API',
    desc: 'POST { keyword, geo, lang }，获取关键词建议、搜索量、竞争度、竞价估算'
  });
}

export async function onRequestOptions() {
  return new Response('', {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST,GET,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
