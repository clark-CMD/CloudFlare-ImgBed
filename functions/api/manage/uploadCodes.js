/**
 * 上传码管理 API（管理员）
 * GET    /api/manage/uploadCodes          列出所有上传码
 * POST   /api/manage/uploadCodes          创建上传码  body: { code, ttlHours }  ttlHours: 0=永久
 * DELETE /api/manage/uploadCodes?code=x   删除上传码
 *
 * 上传码用于生成"一次性扫码上传"二维码/短链：访客携带 uploadCode 参数即可免登录上传，
 * 文件强制归档到「他人上传/<日期>」目录，渠道由后端自动决策。
 */
import { getDatabase } from '../../utils/databaseAdapter.js';

const INDEX_KEY = 'uploadCodes::index';
const CODE_PREFIX = 'uploadCode:';

// 码格式：2-32 位字母/数字/连字符/下划线，有意义文本（非随机乱码）
const CODE_RE = /^[A-Za-z0-9_-]{2,32}$/;

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

async function getCodeIndex(db) {
    const v = await db.get(INDEX_KEY);
    try { return JSON.parse(v) || []; } catch { return []; }
}

async function saveCodeIndex(db, codes) {
    await db.put(INDEX_KEY, JSON.stringify(codes));
}

async function getCodeRecord(db, code) {
    const v = await db.get(CODE_PREFIX + code);
    try { return JSON.parse(v); } catch { return null; }
}

export async function onRequest(context) {
    const { request, env } = context;
    const db = getDatabase(env);
    const url = new URL(request.url);

    if (request.method === 'GET') {
        const index = await getCodeIndex(db);
        const codes = [];
        for (const code of index) {
            const rec = await getCodeRecord(db, code);
            if (rec) codes.push(rec);
        }
        codes.sort((a, b) => b.createdAt - a.createdAt);
        return json({ success: true, codes });
    }

    if (request.method === 'POST') {
        let body;
        try { body = await request.json(); } catch { return json({ success: false, message: '请求体须为 JSON' }, 400); }
        const code = String(body.code || '').trim();
        const ttlHours = Number(body.ttlHours ?? 0);

        if (!CODE_RE.test(code)) {
            return json({ success: false, message: '码须为 2-32 位字母/数字/连字符/下划线（方便手动键入的有意义文本）' }, 400);
        }
        if (!Number.isFinite(ttlHours) || ttlHours < 0) {
            return json({ success: false, message: '有效期参数不合法' }, 400);
        }
        if (await getCodeRecord(db, code)) {
            return json({ success: false, message: `上传码「${code}」已存在` }, 400);
        }

        const rec = {
            code,
            createdAt: Date.now(),
            // 0 = 永久有效
            expiry: ttlHours > 0 ? Date.now() + ttlHours * 3600 * 1000 : 0,
            ttlHours,
        };
        await db.put(CODE_PREFIX + code, JSON.stringify(rec));
        const index = await getCodeIndex(db);
        if (!index.includes(code)) index.push(code);
        await saveCodeIndex(db, index);

        return json({ success: true, code: rec });
    }

    if (request.method === 'DELETE') {
        const code = url.searchParams.get('code');
        if (!code) return json({ success: false, message: '缺少 code 参数' }, 400);
        await db.delete(CODE_PREFIX + code);
        const index = await getCodeIndex(db);
        await saveCodeIndex(db, index.filter(c => c !== code));
        return json({ success: true });
    }

    return json({ success: false, message: 'Method Not Allowed' }, 405);
}
