// ============================================
// POST /api/google-trends  —  Google Trends 数据代理
// 使用 RapidAPI Cognify Google Trends API
// Body: { keyword, geo, date, type }
// type: 'explore' | 'trending' | 'compare'
// ============================================

import { jsonResponse, errorResponse } from './_utils/db.js';

const RAPID_HOST = 'google-trends21.p.rapidapi.com';
const RAPID_KEY = '63990e1ac4msh48fe26069047bc0p122f8djsn4293329c4054';

async function callRapidAPI(path, params) {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const url = `https://${RAPID_HOST}${path}${qs ? '?' + qs : ''}`;

  const res = await fetch(url, {
    headers: {
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

  const { keyword, geo = '', date = 'today 12-m', type = 'explore' } = body;

  try {
    if (type === 'trending') {
      // 获取当前热门趋势
      const data = await callRapidAPI('/getTrendingNow', {
        country: geo || 'US',
        time: '4',
        enableRelated: 'false',
        enableTimeSeries: 'false',
        tz: '480',
        articleCount: '0'
      });
      return jsonResponse(data);
    }

    if (type === 'compare' && keyword && keyword.includes(',')) {
      // 对比多个关键词
      const keywords = keyword.split(',').map(k => k.trim()).filter(Boolean);
      const data = await callRapidAPI('/getExploreCompareSearchTerm', {
        keywords: keywords.join(','),
        country: geo,
        time: date,
        category: '0',
        tz: '480',
        hl: 'zh-CN'
      });
      return jsonResponse(data);
    }

    // 默认：查询单个关键词趋势
    if (!keyword) return errorResponse('缺少关键词', 400);
    const data = await callRapidAPI('/getExploreSearchTerm', {
      keyword,
      country: geo,
      time: date,
      subRegion: 'region',
      category: '0',
      tz: '480',
      hl: 'zh-CN'
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
