# 个人 Ceru 音源（Cloudflare）

此部署专用适配器调用聆澜插件使用的固定解析接口，不执行或分发插件代码，不兼容任意 Ceru 插件。
搜索、歌词、歌单仍由 Folia 原平台处理；已授权浏览器的网易云、QQ、酷狗播放地址由 Ceru 解析。
酷我、咪咕尚未接入 Folia 搜索。音源可用性和音质取决于音源服务，不能保证返回文件的实际编码等级。

Worker secrets：`CERU_API_KEY` 保存插件密钥，`CERU_ACCESS_TOKEN` 保存随机生成的个人访问口令。
通过 `wrangler secret put` 设置；不要将任何密钥写进源代码、VITE 环境变量或 Git。

网页左下角「个人音源」输入访问口令。授权用 Secure、HttpOnly、SameSite=Strict cookie 保存八小时。
关闭个人音源会删除 cookie。已缓存音频不会被替换；切换后请用未缓存歌曲验证。
平台音质设置对应标准 128k、高 320k、无损 flac、Hi-Res hires；仅返回新解析地址，不改变歌单身份。

`GET /api/ceru/session` 只返回配置和授权状态。
`POST /api/ceru/session` 接受 `{token}`；`DELETE` 退出授权。
`POST /api/ceru/resolve` 接受 `{providerId,mediaId,quality}`，必须已授权且同源。
解析请求仅跟随同源 HTTPS 重定向，最多三次，密钥不会发送至其他域名。解析超时十五秒，限流时暂停客户端请求六十秒，服务错误后暂停十五秒；不静默切回其他音源。
不缓存临时播放链接、不返回上游错误原文或密钥。只接受支持平台的音频 CDN，并将 HTTP 地址改为 HTTPS。
播放器直连 CDN；未增加音频转发。HTTPS、CORS 或音频格式不兼容时仍可能播放失败。

验证：`npm run test:unit -- test/unit/ceru`、`npm run typecheck`。
这是 Cloudflare 部署入口；其他部署和 Electron 不会启用它。
