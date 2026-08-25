// ============================================
// POST /api/chat  —  发送消息（非流式）
// Body: { conversation_id, message, content_type, product_info? }
// - 新对话：不传 conversation_id，传 content_type + product_info + message
// - 续对话：传 conversation_id + message
//
// 响应：JSON { conversation_id, content }
// ============================================

import { getDb, now, uuid, jsonResponse, errorResponse } from './_utils/db.js';
import { requireAuth } from './_utils/auth.js';

// 统一 system prompt — 一次生成全部文案
const SYSTEM_PROMPT = `你是一位资深亚马逊运营文案专家，精通亚马逊A10搜索算法和 listing 优化。请根据提供的产品信息，一次性生成以下全部内容：

【输出格式要求】
请严格按照以下格式输出，每个部分用明确的标题分隔：

=== 产品标题 ===
- 200字符以内（主标题+副标题总和）
- 前5个词必须包含品牌+核心关键词+最大卖点
- 格式：品牌 + 核心关键词 + 核心卖点 + 适用场景 + 次要特性
- 自然嵌入搜索流量词，避免堆砌

=== 五点描述 ===
- 5条 Bullet Points，每条前1-2个词大写加粗作为卖点标题
- 每条150-200字符，突出用户利益而非功能
- 按重要性排序，最大卖点放第一条
- 自然嵌入关键词，帮助SEO

=== 详情描述 ===
- 300-500词，故事化叙述，代入用户场景
- 结构：场景引入 → 痛点 → 解决方案 → 核心卖点展开 → 行动号召
- 使用 <p> <strong> <br> 等基础HTML标签排版
- 自然埋入关键词

=== Search Terms ===
- 5组后台Search Terms，每组250字符以内
- 覆盖：核心词、长尾词、场景词、同义词、错拼词
- 不要重复标题和五点里已有的词
- 用空格分隔，全部小写，不重复

【通用要求】
- 全部用英文输出，语法地道，符合美国消费者阅读习惯
- 避免促销性/主观性/夸张性词汇（如best, perfect, amazing等）
- 不使用emoji和特殊字符
- 品牌名和专利词加粗
- 避免全大写
- 基于提供的竞品参考提取结构和卖点逻辑，但不要照搬不相关的功能描述`;

export async function onRequestPost(context) {
  const { user, error } = await requireAuth(context.request, context);
  if (error) return error;

  let body;
  try {
    body = await context.request.json();
  } catch {
    return errorResponse('无效的 JSON');
  }

  const { conversation_id, message, content_type, product_info } = body;
  if (!message) return errorResponse('消息内容不能为空');

  const db = await getDb(context);
  const t = now();

  // 获取用户 API 配置，若未设置则回退到管理员的共享配置
  let settings = await db.prepare(
    'SELECT api_base, api_model, api_key FROM user_settings WHERE user_id = ?'
  ).bind(user.id).first();

  const hasOwnSettings = settings && settings.api_base && settings.api_model && settings.api_key;
  if (!hasOwnSettings) {
    const admin = await db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").first();
    if (admin && admin.id !== user.id) {
      const adminSettings = await db.prepare(
        'SELECT api_base, api_model, api_key FROM user_settings WHERE user_id = ?'
      ).bind(admin.id).first();
      if (adminSettings && adminSettings.api_base && adminSettings.api_model && adminSettings.api_key) {
        settings = adminSettings;
      }
    }
  }

  if (!settings || !settings.api_base || !settings.api_model || !settings.api_key) {
    const missing = [];
    if (!settings) missing.push('无配置记录');
    else {
      if (!settings.api_base) missing.push('API地址');
      if (!settings.api_model) missing.push('模型');
      if (!settings.api_key) missing.push('密钥');
    }
    return errorResponse(`请先在设置中配置 API（缺少: ${missing.join(', ')}）`, 400);
  }

  let convId = conversation_id;
  let conv = null;

  if (convId) {
    conv = await db.prepare(
      'SELECT * FROM conversations WHERE id = ? AND user_id = ?'
    ).bind(convId, user.id).first();
    if (!conv) return errorResponse('对话不存在', 404);
  } else {
    if (!product_info) {
      return errorResponse('新对话需要 product_info');
    }
    convId = uuid();
    const title = product_info.product_name || '新对话';
    await db.prepare(
      'INSERT INTO conversations (id, user_id, title, content_type, product_info, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(convId, user.id, title, content_type || 'all', JSON.stringify(product_info), t, t).run();
    conv = { id: convId, content_type: content_type || 'all', product_info: JSON.stringify(product_info) };
  }

  // 组装 messages
  const messages = [];
  messages.push({ role: 'system', content: SYSTEM_PROMPT });

  let prodInfo = conv.product_info;
  if (typeof prodInfo === 'string') {
    try { prodInfo = JSON.parse(prodInfo); } catch { prodInfo = {}; }
  }

  // 始终加入产品信息（新对话和续对话都需要，确保 AI 有完整上下文）
  if (prodInfo) {
    const productDesc = `【站点】${prodInfo.marketplace || '美国站'}
【语言】${prodInfo.language || '英语'}
【五点描述需安插的关键词】${prodInfo.keywords || ''}
【产品名称】${prodInfo.product_name || ''}
【销售方式】${prodInfo.packaging || ''}
【产品主要用途和特点】${prodInfo.features || ''}
【产品使用方式】${prodInfo.usage || ''}
【产品主要材质】${prodInfo.material || ''}
【产品包含内容】${prodInfo.includes || ''}
【竞品参考标题和五点】${prodInfo.competitor_bullets || ''}
【竞品产品描述】${prodInfo.competitor_desc || ''}

请根据以上产品信息，为我生成优质的亚马逊文案。注意：竞品仅供参考结构和卖点逻辑，不要照搬不相关的功能描述。`;
    messages.push({ role: 'user', content: productDesc });
  }

  // 续对话：加载历史消息
  if (conversation_id) {
    const history = await db.prepare(
      'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
    ).bind(convId).all();
    for (const m of (history.results || [])) {
      messages.push({ role: m.role, content: m.content });
    }
  }

  messages.push({ role: 'user', content: message });

  await db.prepare(
    'INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)'
  ).bind(convId, 'user', message, t).run();
  await db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').bind(t, convId).run();

  // 调用 AI API（非流式）
  const apiUrl = settings.api_base.replace(/\/$/, '') + '/chat/completions';

  try {
    const aiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + settings.api_key
      },
      body: JSON.stringify({
        model: settings.api_model,
        messages: messages,
        stream: false
      })
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      return errorResponse('AI 接口错误: ' + aiResponse.status + ' ' + errText.slice(0, 300), 502);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || '';

    if (!content) {
      return errorResponse('AI 返回空内容', 502);
    }

    // 保存 AI 回复
    await db.prepare(
      'INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)'
    ).bind(convId, 'assistant', content, t).run();
    await db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').bind(t, convId).run();

    return jsonResponse({ conversation_id: convId, content });

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
