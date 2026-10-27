/**
 * 新建文件夹 API（管理员）
 * POST /api/manage/mkdir   body: { path }
 *
 * 文件夹由 .keep 占位记录支撑（前端列表自动隐藏该文件）。
 * 直接写 KV，不经过任何存储渠道，因此不依赖 R2/Telegram 等渠道可用性。
 * metadata.Channel = 'External'：重命名/移动/删除均为纯 KV 键操作，不会触碰存储对象。
 */
import { getDatabase } from '../../utils/databaseAdapter.js';
import { addFileToIndex } from '../../utils/indexManager.js';

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

export async function onRequest(context) {
    const { request, env, waitUntil } = context;

    if (request.method !== 'POST') {
        return json({ success: false, message: 'Method Not Allowed' }, 405);
    }

    let body;
    try { body = await request.json(); } catch {
        return json({ success: false, message: '请求体须为 JSON' }, 400);
    }

    const path = String(body.path || '').trim().replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
    if (!path || path.split('/').some(seg => !seg || seg === '.' || seg === '..')) {
        return json({ success: false, message: '文件夹路径不合法' }, 400);
    }

    const keepId = path + '/.keep';
    const db = getDatabase(env);
    const metadata = {
        FileName: '.keep',
        FileType: 'text/plain',
        FileSizeBytes: 0,
        TimeStamp: Date.now(),
        Directory: path + '/',
        Channel: 'External',
    };
    await db.put(keepId, '', { metadata });
    waitUntil(addFileToIndex(context, keepId, metadata));

    return json({ success: true, path, keepId });
}
