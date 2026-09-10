// ============================================
// POST /api/aba-research  —  SellerSprite ABA 数据代理
// 使用环境变量 SS_COOKIE（管理员共享账号 cookie）
// 支持 KV 短缓存（5 分钟）
// Body: { market, q, page, size, order:[field,desc], ...其他透传字段 }
// ============================================

import { jsonResponse, errorResponse } from './_utils/db.js';

const ENDPOINT = 'https://www.sellersprite.com/v3/api/aba-research';
const CACHE_TTL = 300; // 5 分钟

// 简单稳定 hash：把对象按 key 排序后 JSON.stringify
function stableHash(obj) {
  const sorted = {};
  Object.keys(obj).sort().forEach(k => { sorted[k] = obj[k]; });
  return btoa(unescape(encodeURIComponent(JSON.stringify(sorted))));
}

async function fetchWithCache(env, cacheKey, requestBody) {
  // 1) 尝试 KV 缓存
  if (env.SS_CACHE) {
    try {
      const cached = await env.SS_CACHE.get(cacheKey);
      if (cached) {
        return { data: JSON.parse(cached), cached: true };
      }
    } catch (e) {}
  }

  // 2) 调用 SellerSprite
  const ssRes = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      'Accept': 'application/json, text/plain, */*',
      'Cookie': env.SS_COOKIE || '',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36 Edg/147.0.0.0',
      'Origin': 'https://www.sellersprite.com',
      'Referer': 'https://www.sellersprite.com/v3/aba-research'
    },
    body: JSON.stringify(requestBody)
  });

  const text = await ssRes.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  // 3) 写缓存（仅成功响应）
  if (ssRes.ok && env.SS_CACHE) {
    try {
      await env.SS_CACHE.put(cacheKey, JSON.stringify(data), { expirationTtl: CACHE_TTL });
    } catch (e) {}
  }

  return { data, cached: false, status: ssRes.status };
}

export async function onRequestPost(context) {
  const env = (context && context.env) || {};

  if (!env.SS_COOKIE) {
    return errorResponse('服务器未配置 SS_COOKIE 环境变量（管理员请在 Cloudflare Pages 环境变量里填 SellerSprite 完整 cookie 字符串）', 500);
  }

  let body;
  try { body = await context.request.json(); } catch { return errorResponse('无效的 JSON'); }

  // 透传所有字段，但兜底默认值
  const reqBody = {
    rankGrowthType: 'W4',
    searchModels: 3,
    size: 50,
    page: 1,
    rankGrowthValue: 10000,
    minRankGrowthRate: 10,
    market: 'COM',
    q: '',
    keywordBidMatchType: 'exact',
    order: { field: 'searchfrequencyrank', desc: false },
    ...body
  };

  // 缓存 key
  const cacheKey = 'aba:' + stableHash(reqBody);

  try {
    const r = await fetchWithCache(env, cacheKey, reqBody);
    return jsonResponse({ ...r.data, _cache: r.cached ? 'hit' : 'miss' });
  } catch (e) {
    return errorResponse('调用 SellerSprite 失败: ' + e.message, 502);
  }
}

export async function onRequestGet() {
  return jsonResponse({
    name: 'ABA Research 代理',
    desc: 'POST { market, q, page, size, order }，5 分钟 KV 缓存',
    env_required: 'SS_COOKIE',
    env_optional: 'SS_CACHE (KV 命名空间)'
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
