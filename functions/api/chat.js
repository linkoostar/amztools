// ============================================
// POST /api/chat  —  发送消息（流式响应）
// Body: { conversation_id, message, content_type, product_info? }
// - 新对话：不传 conversation_id，传 content_type + product_info + message
// - 续对话：传 conversation_id + message
//
// 响应：SSE 流式（text/event-stream）
// ============================================

import { getDb, now, uuid, errorResponse } from './_utils/db.js';
import { requireAuth } from './_utils/auth.js';

// 文案类型 → system prompt
const SYSTEM_PROMPTS = {
  title: `你是一位资深亚马逊运营文案专家，擅长撰写高转化率的产品标题。
要求：
1. 标题控制在 200 字符以内（主标题+副标题总和）
2. 前5个词必须包含品牌+核心关键词+最大卖点
3. 自然嵌入搜索流量词，避免堆砌
4. 格式：品牌 + 核心关键词 + 核心卖点 + 适用场景 + 次要特性
5. 用英文输出，语法地道，符合美国消费者阅读习惯`,

  bullets: `你是一位资深亚马逊运营文案专家，擅长撰写高转化率的五点描述（Bullet Points）。
要求：
1. 5 条，每条前 1-2 个词大写加粗作为卖点标题
2. 每条 150-200 字符，突出用户利益而非功能
3. 按重要性排序：最大卖点放第一条
4. 自然嵌入关键词，帮助 SEO
5. 用英文输出，地道、有说服力`,

  search_terms: `你是一位资深亚马逊关键词研究专家，擅长挖掘高流量高转化的搜索词。
要求：
1. 输出 5 组后台 Search Terms，每组 250 字符以内
2. 覆盖：核心词、长尾词、场景词、同义词、错拼词
3. 不要重复标题和五点里已有的词
4. 用空格或逗号分隔，无需标点
5. 全部小写，不重复
6. 按相关度排序，最相关的放第一组`,

  description: `你是一位资深亚马逊运营文案专家，擅长撰写产品详情描述（Product Description / A+ Content 文案）。
要求：
1. 300-500 词，故事化叙述，代入用户场景
2. 结构：场景引入 → 痛点 → 解决方案 → 核心卖点展开 → 社会证明 → 行动号召
3. 使用 <p> <strong> <br> 等基础 HTML 标签排版
4. 自然埋入关键词
5. 用英文输出，专业可信，避免夸张`
};

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

  const db = getDb(context);
  const t = now();

  // 获取用户 API 配置
  const settings = await db.prepare(
    'SELECT api_base, api_model, api_key FROM user_settings WHERE user_id = ?'
  ).bind(user.id).first();

  if (!settings || !settings.api_base || !settings.api_model || !settings.api_key) {
    return errorResponse('请先在设置中配置 API 地址、模型和密钥', 400);
  }

  let convId = conversation_id;
  let conv = null;

  if (convId) {
    // 续对话：校验归属
    conv = await db.prepare(
      'SELECT * FROM conversations WHERE id = ? AND user_id = ?'
    ).bind(convId, user.id).first();
    if (!conv) return errorResponse('对话不存在', 404);
  } else {
    // 新对话
    if (!content_type || !product_info) {
      return errorResponse('新对话需要 content_type 和 product_info');
    }
    convId = uuid();
    const title = product_info.product_name || '新对话';
    await db.prepare(
      'INSERT INTO conversations (id, user_id, title, content_type, product_info, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(convId, user.id, title, content_type, JSON.stringify(product_info), t, t).run();
    conv = { id: convId, content_type, product_info: JSON.stringify(product_info) };
  }

  // 组装 messages
  const messages = [];

  // system prompt
  const sysPrompt = SYSTEM_PROMPTS[conv.content_type] || SYSTEM_PROMPTS.title;
  messages.push({ role: 'system', content: sysPrompt });

  // 如果是新对话，加入产品信息上下文
  let prodInfo = conv.product_info;
  if (typeof prodInfo === 'string') {
    try { prodInfo = JSON.parse(prodInfo); } catch { prodInfo = {}; }
  }
  if (!conversation_id && prodInfo) {
    const productDesc = `【产品信息】
产品名：${prodInfo.product_name || ''}
品牌：${prodInfo.brand || ''}
类目：${prodInfo.category || ''}
核心卖点：${prodInfo.key_selling_points || ''}
目标受众：${prodInfo.target_audience || ''}
材质/规格：${prodInfo.specs || ''}
竞品差异：${prodInfo.differentiators || ''}
其他信息：${prodInfo.other || ''}`;
    messages.push({ role: 'user', content: productDesc + '\n\n请根据以上产品信息，为我生成优质的亚马逊文案。' });
  }

  // 加载历史消息
  if (conversation_id) {
    const history = await db.prepare(
      'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
    ).bind(convId).all();
    for (const m of history.results) {
      messages.push({ role: m.role, content: m.content });
    }
  }

  // 加入当前用户消息
  messages.push({ role: 'user', content: message });

  // 保存用户消息
  await db.prepare(
    'INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)'
  ).bind(convId, 'user', message, t).run();
  await db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').bind(t, convId).run();

  // 调用 AI API（流式）
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
        stream: true
      })
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      return errorResponse('AI 接口错误: ' + aiResponse.status + ' ' + errText.slice(0, 200), 502);
    }

    // 流式转发 + 收集完整回复
    const reader = aiResponse.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';

    const stream = new ReadableStream({
      async start(controller) {
        // 先发 conversation_id
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ conversation_id: convId })}\n\n`));

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data:')) continue;
            const dataStr = trimmed.slice(5).trim();
            if (dataStr === '[DONE]') {
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              // 保存完整回复到数据库
              await saveAssistantMessage(db, convId, fullContent);
              controller.close();
              return;
            }
            try {
              const data = JSON.parse(dataStr);
              const delta = data.choices?.[0]?.delta?.content || '';
              if (delta) {
                fullContent += delta;
              }
              // 原样转发
              controller.enqueue(encoder.encode('data: ' + dataStr + '\n\n'));
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
        // 如果流结束但没收到 [DONE]
        if (fullContent) {
          await saveAssistantMessage(db, convId, fullContent);
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    });

    const encoder = new TextEncoder();
    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (e) {
    return errorResponse('调用 AI 接口失败: ' + e.message, 500);
  }
}

async function saveAssistantMessage(db, convId, content) {
  if (!content || !content.trim()) return;
  const t = now();
  await db.prepare(
    'INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)'
  ).bind(convId, 'assistant', content, t).run();
  await db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').bind(t, convId).run();
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
