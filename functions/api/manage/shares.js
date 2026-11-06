/**
 * 自定义短分享链接管理 API（管理员）
 * GET    /api/manage/shares           列出所有分享码
 * POST   /api/manage/shares           创建/更新分享  body: { code, fileIds: [], ttlHours }（同码重复提交=追加/更新文件）
 * DELETE /api/manage/shares?code=x    删除分享码
 *
 * 分享链接形式：https://<域名>/?share=<code>，访客打开后看到文件预览页，
 * 可在线预览（图片/视频/音频/文本）或下载，无需登录。
 * 文件记录存储于 KV：share:<code>，索引：shares::index。
 */
import { getDatabase } from '../../utils/databaseAdapter.js';

const INDEX_KEY = 'shares::index';
const CODE_PREFIX = 'share:';

// 码格式：1-32 位字母/数字/连字符/下划线（短、方便键入）
const CODE_RE = /^[A-Za-z0-9_-]{1,32}$/;

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

async function getIndex(db) {
    const v = await db.get(INDEX_KEY);
    try { return JSON.parse(v) || []; } catch { return []; }
}

async function saveIndex(db, codes) {
    await db.put(INDEX_KEY, JSON.stringify(codes));
}

async function getRecord(db, code) {
    const v = await db.get(CODE_PREFIX + code);
    try { return JSON.parse(v); } catch { return null; }
}

export async function onRequest(context) {
    const { request, env } = context;
    const db = getDatabase(env);
    const url = new URL(request.url);

    if (request.method === 'GET') {
        const index = await getIndex(db);
        const codes = [];
        for (const code of index) {
            const rec = await getRecord(db, code);
            if (rec) codes.push(rec);
        }
        codes.sort((a, b) => b.createdAt - a.createdAt);
        return json({ success: true, codes });
    }

    if (request.method === 'POST') {
        let body;
        try { body = await request.json(); } catch { return json({ success: false, message: '请求体须为 JSON' }, 400); }
        const code = String(body.code || '').trim();
        const fileIds = Array.isArray(body.fileIds) ? [...new Set(body.fileIds.map(id => String(id).trim()).filter(Boolean))] : [];
        const ttlHours = Number(body.ttlHours ?? 0);
        const note = String(body.note || '').slice(0, 100);

        if (!CODE_RE.test(code)) {
            return json({ success: false, message: '分享码须为 1-32 位字母/数字/连字符/下划线（如 app、photos2026）' }, 400);
        }
        if (!fileIds.length) {
            return json({ success: false, message: '请至少选择一个文件' }, 400);
        }
        if (!Number.isFinite(ttlHours) || ttlHours < 0) {
            return json({ success: false, message: '有效期参数不合法' }, 400);
        }

        // 同码已存在 = 更新（追加文件），否则新建
        const existing = await getRecord(db, code);
        const rec = existing || {
            code,
            createdAt: Date.now(),
            expiry: 0,
            ttlHours: 0,
        };
        // 合并文件列表（保留原有文件，追加新选文件）
        const merged = [...new Set([...(existing ? existing.fileIds : []), ...fileIds])];
        rec.fileIds = merged;
        rec.note = note || existing?.note || '';
        if (!existing) {
            rec.createdAt = Date.now();
            rec.ttlHours = ttlHours;
            rec.expiry = ttlHours > 0 ? Date.now() + ttlHours * 3600 * 1000 : 0;
        } else if (body.resetTtl === true) {
            rec.ttlHours = ttlHours;
            rec.expiry = ttlHours > 0 ? Date.now() + ttlHours * 3600 * 1000 : 0;
        }

        await db.put(CODE_PREFIX + code, JSON.stringify(rec));
        const index = await getIndex(db);
        if (!index.includes(code)) index.push(code);
        await saveIndex(db, index);

        return json({ success: true, code: rec });
    }

    if (request.method === 'DELETE') {
        const code = url.searchParams.get('code');
        if (!code) return json({ success: false, message: '缺少 code 参数' }, 400);
        await db.delete(CODE_PREFIX + code);
        const index = await getIndex(db);
        await saveIndex(db, index.filter(c => c !== code));
        return json({ success: true });
    }

    return json({ success: false, message: 'Method Not Allowed' }, 405);
}
