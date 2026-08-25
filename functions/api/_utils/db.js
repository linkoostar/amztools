// ============================================
// D1 数据库工具
// ============================================

export async function getDb(context) {
  const db = context.env.DB;
  try { await db.exec("PRAGMA foreign_keys=ON;"); } catch(e) {}
  return db;
}

export function now() {
  return Math.floor(Date.now() / 1000);
}

export function uuid() {
  return crypto.randomUUID();
}

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization'
    }
  });
}

export function errorResponse(message, status = 400) {
  return jsonResponse({ error: message }, status);
}
