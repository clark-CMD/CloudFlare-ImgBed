/**
 * 分享内容查询 API（公开，供 ?share=<code> 预览页使用）
 * GET /api/public/shareInfo?code=x
 * 返回 { success, valid, code, note, files: [{ id, name, size, time, type }] }
 * 已被删除的文件自动从结果中过滤；/file/<id> 直链本身公开，访客可直接预览/下载。
 */
import { getDatabase } from '../../utils/databaseAdapter.js';

const CODE_PREFIX = 'share:';

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);

    if (request.method !== 'GET') {
        return new Response(JSON.stringify({ success: false, message: 'Method Not Allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const code = String(url.searchParams.get('code') || '').trim();
    if (!code) {
        return new Response(JSON.stringify({ success: true, valid: false, message: '缺少分享码' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
    }

    const db = getDatabase(env);
    let rec = null;
    try { rec = JSON.parse(await db.get(CODE_PREFIX + code)); } catch { /* 无效记录 */ }

    if (!rec || (rec.expiry && rec.expiry < Date.now())) {
        return new Response(JSON.stringify({ success: true, valid: false, message: '分享不存在或已过期' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
    }

    // 逐个读取文件元数据（过滤已删除的文件），保持分享创建时的顺序
    const files = [];
    for (const id of rec.fileIds || []) {
        try {
            const r = await db.getWithMetadata(id);
            if (!r || (!r.value && !r.metadata)) continue;
            const m = r.metadata || {};
            files.push({
                id,
                name: m.FileName || id.split('/').pop(),
                size: m.FileSizeBytes || 0,
                time: m.TimeStamp || 0,
                type: m.FileType || '',
            });
        } catch { /* 单个文件读取失败不影响整体 */ }
    }

    return new Response(JSON.stringify({
        success: true,
        valid: true,
        code: rec.code,
        note: rec.note || '',
        expiry: rec.expiry || 0,
        files,
    }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
}
