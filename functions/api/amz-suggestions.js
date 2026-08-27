// 亚马逊联想词 API 代理（解决 CORS 问题）
// GET /api/amz-suggestions?prefix=xxx&mid=ATVPDKIKX0DER&limit=11

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const prefix = url.searchParams.get('prefix') || '';
  const mid = url.searchParams.get('mid') || 'ATVPDKIKX0DER';
  const limit = url.searchParams.get('limit') || '11';

  if (!prefix.trim()) {
    return new Response(JSON.stringify({ error: 'prefix is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const amzUrl = `https://completion.amazon.com/api/2017/suggestions?limit=${encodeURIComponent(limit)}&prefix=${encodeURIComponent(prefix)}&alias=aps&fresh=true&mid=${encodeURIComponent(mid)}&session-id=123-4567890-1234567&client-info=amazon-search-ui`;

  try {
    const resp = await fetch(amzUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      cf: { cacheTtl: 60 }, // 缓存60秒，减少重复请求
    });

    if (!resp.ok) {
      return new Response(JSON.stringify({ error: `Amazon API returned ${resp.status}` }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await resp.json();

    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'max-age=60',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Request failed' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
