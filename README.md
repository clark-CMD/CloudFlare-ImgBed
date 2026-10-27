# 个人网盘（PersonalCloudDrive）

基于 Cloudflare Pages 的私人网盘，仅管理员单人登录，无数据库依赖。

## 功能

- 类网盘 UI：文件夹新建 / 重命名 / 移动 / 删除，列表与网格双视图，搜索
- 多渠道上传：Cloudflare R2 / Telegram / S3 / WebDAV 等，支持多渠道并发与后台自动决策
- 大文件分片上传、文本在线编辑、重命名 / 移动 / 批量管理
- Raw 直链分享（免密）、访客上传码（二维码 + 短链，可设有效期，自动归档到「他人上传」目录）

## 部署

1. Fork / 推送本仓库到 GitHub
2. Cloudflare Pages 连接仓库，构建命令留空，输出目录 `frontend-dist`
3. 绑定 KV 命名空间（变量名 `img_url`），可选绑定 R2（变量名 `img_r2`）
4. 部署完成后进入「设置」完成管理员注册与渠道配置
