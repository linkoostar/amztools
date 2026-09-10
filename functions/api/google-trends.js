// ============================================
// POST /api/google-trends  —  Google Trends 数据代理
// 使用 RapidAPI google-trends8 API
// Body: { keyword, geo, date, type }
// type: 'trending' | 'explore'
// ============================================

import { jsonResponse, errorResponse } from './_utils/db.js';

const RAPID_HOST = 'google-trends8.p.rapidapi.com';
const RAPID_KEY = '63990e1ac4msh48fe26069047bc0p122f8djsn4293329c4054';

async function callRapidAPI(path, params) {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const url = `https://${RAPID_HOST}${path}${qs ? '?' + qs : ''}`;

  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'x-rapidapi-host': RAPID_HOST,
      'x-rapidapi-key': RAPID_KEY
    }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RapidAPI ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

export async function onRequestPost(context) {
  let body;
  try { body = await context.request.json(); } catch { return errorResponse('无效的 JSON'); }

  const { keyword, geo = 'US', date = 'today 12-m', type = 'trending' } = body;

  try {
    if (type === 'explore' && keyword) {
      // 查询特定关键词趋势 - 使用 trendings 端点
      const data = await callRapidAPI('/trendings', {
        region_code: geo,
        hours: '24',
        num: '20',
        include_related_queries: 'true'
      });
      return jsonResponse(data);
    }

    // 默认：获取热门趋势
    const data = await callRapidAPI('/trendings', {
      region_code: geo,
      hours: '24',
      num: '20',
      include_related_queries: 'true'
    });
    return jsonResponse(data);
  } catch (e) {
    return errorResponse('查询失败: ' + e.message, 502);
  }
}

export async function onRequestGet() {
  return jsonResponse({
    name: 'Google Trends API',
    desc: 'POST { keyword, geo, date, type }，获取 Google Trends 数据'
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
