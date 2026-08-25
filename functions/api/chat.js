// ============================================
// POST /api/chat  —  发送消息（非流式）
// Body: { conversation_id, message, content_type, product_info?, images? }
// - 新对话：不传 conversation_id，传 content_type + product_info + message
// - 续对话：传 conversation_id + message
// - images: [{ dataUrl, type }] 可选，图片 base64 数据
//
// 响应：JSON { conversation_id, content }
// ============================================

import { getDb, now, uuid, jsonResponse, errorResponse } from './_utils/db.js';
import { requireAuth } from './_utils/auth.js';
import { DEFAULT_SYSTEM_PROMPT } from './_utils/prompt.js';

export async function onRequestPost(context) {
  const { user, error } = await requireAuth(context.request, context);
  if (error) return error;

  let body;
  try {
    body = await context.request.json();
  } catch {
    return errorResponse('无效的 JSON');
  }

  const { conversation_id, message, content_type, product_info, images } = body;
  if (!message && (!images || images.length === 0)) return errorResponse('消息内容不能为空');

  const db = await getDb(context);
  const t = now();

  // 获取用户 API 配置，若未设置则回退到管理员的共享配置
  let settings = await db.prepare(
    'SELECT api_base, api_model, api_key, custom_prompt FROM user_settings WHERE user_id = ?'
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

  // 组装 messages — 优先使用用户自定义提示词，否则使用系统预置
  const effectivePrompt = (settings && settings.custom_prompt) || DEFAULT_SYSTEM_PROMPT;
  const messages = [];
  messages.push({ role: 'system', content: effectivePrompt });

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
【其他补充信息（评论、详情描述等）】${prodInfo.other_info || ''}

请根据以上产品信息，为我生成优质的亚马逊文案。注意：竞品和补充信息仅供参考，不要照搬不相关的功能描述。`;
    messages.push({ role: 'user', content: productDesc });
  }

  // 续对话：加载历史消息
  if (conversation_id) {
    const history = await db.prepare(
      'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
    ).bind(convId).all();
    for (const m of (history.results || [])) {
      // 尝试解析 JSON 内容（可能包含图片）
      let msgContent = m.content;
      try {
        const parsed = JSON.parse(m.content);
        if (parsed && typeof parsed === 'object' && parsed.text !== undefined) {
          // 这是带图片的消息，重构为 content 数组格式
          const contentParts = [{ type: 'text', text: parsed.text || '' }];
          if (parsed.images && Array.isArray(parsed.images)) {
            for (const img of parsed.images) {
              contentParts.push({ type: 'image_url', image_url: { url: img.dataUrl } });
            }
          }
          msgContent = contentParts;
        }
      } catch {
        // 普通文本消息，保持原样
      }
      messages.push({ role: m.role, content: msgContent });
    }
  }

  // 构建当前用户消息（支持图片）
  let userMessageContent = message || '';
  let storedContent = message || '';

  if (images && images.length > 0) {
    // 有图片时，使用 content 数组格式（OpenAI vision API）
    const contentParts = [{ type: 'text', text: message || '请分析这张图片' }];
    for (const img of images) {
      contentParts.push({ type: 'image_url', image_url: { url: img.dataUrl } });
    }
    userMessageContent = contentParts;
    // 存储为 JSON 字符串
    storedContent = JSON.stringify({ text: message || '', images });
  }

  messages.push({ role: 'user', content: userMessageContent });

  await db.prepare(
    'INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)'
  ).bind(convId, 'user', storedContent, t).run();
  await db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').bind(t, convId).run();

  // 调用 AI API（非流式）
  let baseUrl = settings.api_base.replace(/\/+$/, '');
  if (!baseUrl.endsWith('/v1')) baseUrl += '/v1';
  const apiUrl = baseUrl + '/chat/completions';

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
