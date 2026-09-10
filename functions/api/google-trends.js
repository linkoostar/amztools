// ============================================
// POST /api/google-trends  —  Google Trends 数据代理
// Body: { keyword, geo, date }
// 使用 serpapi 或其他免费接口
// ============================================

import { jsonResponse, errorResponse } from './_utils/db.js';

export async function onRequestPost(context) {
  const env = (context && context.env) || {};

  let body;
  try { body = await context.request.json(); } catch { return errorResponse('无效的 JSON'); }

  const { keyword, geo = '', date = 'today 12-m' } = body;
  if (!keyword) return errorResponse('缺少关键词', 400);

  // 使用 Google Trends 的公开 explore endpoint
  // 这个 endpoint 返回 JSONP，需要解析
  const url = `https://trends.google.com/trends/api/dailytrends?hl=en-US&geo=${geo}&ed=${date}&ns=15`;

  try {
    // 尝试获取趋势数据
    const res = await fetch(
      `https://trends.google.com/trends/api/explore?hl=en-US&tz=-480&req={"comparisonItem":[{"keyword":"${encodeURIComponent(keyword)}","geo":"${geo}","time":"${date}"}],"category":0,"property":""}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
      }
    );

    if (!res.ok) {
      // 如果直接 API 失败，返回基本信息
      return jsonResponse({
        keyword,
        geo,
        date,
        url: `https://trends.google.com/trends/explore?geo=${geo}&q=${encodeURIComponent(keyword)}&date=${encodeURIComponent(date)}`,
        source: 'direct'
      });
    }

    const text = await res.text();
    // 解析 Google Trends 返回的 JSONP
    let data;
    try {
      // 移除 )]}', 前缀
      const jsonStr = text.replace(/^\)\]\}'/, '');
      data = JSON.parse(jsonStr);
    } catch {
      data = { raw: text };
    }

    return jsonResponse({
      keyword,
      geo,
      date,
      data,
      url: `https://trends.google.com/trends/explore?geo=${geo}&q=${encodeURIComponent(keyword)}&date=${encodeURIComponent(date)}`,
      source: 'api'
    });
  } catch (e) {
    // 失败时返回基本信息和链接
    return jsonResponse({
      keyword,
      geo,
      date,
      url: `https://trends.google.com/trends/explore?geo=${geo}&q=${encodeURIComponent(keyword)}&date=${encodeURIComponent(date)}`,
      source: 'fallback',
      error: e.message
    });
  }
}

export async function onRequestGet() {
  return jsonResponse({
    name: 'Google Trends API',
    desc: 'POST { keyword, geo, date }，获取 Google Trends 数据',
    env_optional: 'none'
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
