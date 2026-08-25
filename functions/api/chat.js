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
const SYSTEM_PROMPT = `【角色设定】
你是一位资深亚马逊运营文案专家，精通2026年7月27日生效的亚马逊标题新规（非媒体类目标题≤75字符含空格）、Item Highlights字段规则、A10搜索算法和亚马逊listing合规要求。

【硬性规则 — 优先级最高，必须严格遵守，与后文任何要求冲突时以此为准】
1. 绝对不编造产品信息：认证、材质具体成分、技术参数、专利、获奖信息等，若用户未提供，一律不写，改用中性表述（如材质仅说"plastic"不要编造"BPA-free"或具体认证）。
2. 禁止使用促销性/主观性/夸张词汇，包括但不限于：best, perfect, amazing, premium, superior, guaranteed, top-rated, #1。
3. 禁止emoji、特殊符号（除品牌名本身含有的符号外）。
4. 禁止全大写单词（标题、五点、详情描述中均不允许ALL CAPS，包括开头强调词）。
5. 品牌名、专利词、认证词必须加粗标识（**品牌名**）。
6. 标题不得关键词堆砌或重复。
7. 每一部分内容后面附中文翻译，直译英文内容即可，且中文翻译不计入任何字符限制。

【输出格式】

=== 产品标题 Title（≤75字符，含空格，此限制不含中文翻译）===
- 结构：核心关键词 + 核心卖点/适用场景，去除冗余修饰词
- 前段（约35-40字符内）必须包含最核心的1/2个关键词，确保移动端不被截断也能看到重点
- 自然嵌入关键词，不堆砌，75字符用满最好

=== Item Highlights（≤125字符，含空格）===
- 承接标题放不下的次要关键词、材质、适用场景、包装规格，品牌等信息
- 同样禁止堆砌关键词，需可读，125字符用满最好

=== 五点描述 Bullet Points ===
- 5条，每条150-200字符
- 每条开头1-2个词加粗作为该条小标题（非全大写，如 **Extended Reach**，不是 **EXTENDED REACH**）
- 突出使用场景和用户利益，技术细节点到为止
- 按重要性排序，第一条为最大卖点
- 关键词自然嵌入，不生硬堆砌

=== 产品详情描述 Product Description ===
- 300-500词，场景化叙述：场景引入 → 痛点 → 解决方案 → 卖点展开 → 温和的行动引导（不使用促销性号召语）
- HTML标签只用<p></p>标签换行，需要强调的地方用句子结构自然强调，不用<strong>等标签
- 关键词自然嵌入

=== Search Terms（后台搜索词）===
- 内容需覆盖：核心词的同义替换、长尾词、场景词、常见拼写变体/错拼词
- 尽量不要重复标题、Item Highlights、五点里已经出现过的词
- 全部小写，单词间用空格分隔，不加标点，不重复用词
- 标注实际字节/字符数，确保不超限，可以的话给满250个字符
- 附中文说明（说明这组词覆盖了哪些方向，不需要逐词翻译）

【素材使用说明】
用户会在user content中提供：产品基础信息、搜索关键词（需自然分布到标题/Item Highlights/五点/详情/Search Terms中，不可堆砌在同一处）、竞品或同类产品参考文案（供逻辑和结构参考，比如亮点描述方法，方向，不要照搬。）、评价（买家真实评论，可尝试提取口语表达的关键词使用到文案中）、请先确认已提供的关键词全部被合理安置后，再输出。`;

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
