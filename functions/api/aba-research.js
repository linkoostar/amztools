// ============================================
// POST /api/aba-research  —  SellerSprite ABA 数据代理
// 优先使用前端传入的 cookie（body.cookie），兜底用环境变量 SS_COOKIE
// 支持 KV 短缓存（5 分钟，按 cookie+查询参数 hash 区分）
// Body: { market, q, page, size, order:[field,desc], cookie, ...其他透传字段 }
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

async function fetchWithCache(env, cacheKey, requestBody, cookie) {
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
      'Cookie': cookie,
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

  let body;
  try { body = await context.request.json(); } catch { return errorResponse('无效的 JSON'); }

  // cookie 优先级：前端传入 > 环境变量
  const cookie = body.cookie || env.SS_COOKIE || '';
  if (!cookie) {
    return errorResponse('未提供 SellerSprite cookie。请在工具设置中粘贴你的 cookie，或管理员在 Cloudflare 环境变量中配置 SS_COOKIE', 400);
  }

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
    order: { field: 'searchRank', desc: true },
    ...body
  };
  // 去掉 cookie 字段，不要传给上游
  delete reqBody.cookie;

  // 缓存 key 包含 cookie hash（不同用户隔离缓存）
  const cookieHash = stableHash({ c: cookie });
  const cacheKey = 'aba:' + cookieHash + ':' + stableHash(reqBody);

  try {
    const r = await fetchWithCache(env, cacheKey, reqBody, cookie);
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
