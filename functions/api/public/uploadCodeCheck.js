/**
 * 上传码校验 API（公开，供访客上传页使用）
 * POST /api/public/uploadCodeCheck   body: { code }
 * 返回 { success, valid, expiry }  不泄露其他信息
 */
import { getDatabase } from '../../utils/databaseAdapter.js';

const CODE_PREFIX = 'uploadCode:';

export async function onRequest(context) {
    const { request, env } = context;

    if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
    }

    let body;
    try { body = await request.json(); } catch {
        return new Response(JSON.stringify({ success: false, valid: false }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const code = String(body.code || '').trim();
    let valid = false, expiry = 0;
    if (code) {
        const db = getDatabase(env);
        const v = await db.get(CODE_PREFIX + code);
        try {
            const rec = JSON.parse(v);
            if (rec && (!rec.expiry || rec.expiry > Date.now())) {
                valid = true;
                expiry = rec.expiry || 0;
            }
        } catch { /* 无效记录按未通过处理 */ }
    }

    return new Response(JSON.stringify({ success: true, valid, expiry }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
}
