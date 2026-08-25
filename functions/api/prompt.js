// ============================================
// GET /api/prompt — 返回当前生效的提示词
//   优先返回用户自定义提示词，无则返回系统预置
// ============================================

import { getDb, jsonResponse } from './_utils/db.js';
import { requireAuth } from './_utils/auth.js';
import { DEFAULT_SYSTEM_PROMPT } from './_utils/prompt.js';

export async function onRequestGet(context) {
  const { user, error } = await requireAuth(context.request, context);
  if (error) return error;

  const db = await getDb(context);
  const row = await db.prepare(
    'SELECT custom_prompt FROM user_settings WHERE user_id = ?'
  ).bind(user.id).first();

  const customPrompt = row && row.custom_prompt ? row.custom_prompt : null;

  return jsonResponse({
    prompt: customPrompt || DEFAULT_SYSTEM_PROMPT,
    is_custom: !!customPrompt
  });
}

export async function onRequestOptions() {
  return new Response('', {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization'
    }
  });
}
