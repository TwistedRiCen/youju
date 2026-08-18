# M4 公开演示部署指南

本文描述有据 YouJu V0.1 M4 公开演示的部署步骤。本文只提供工程步骤；域名、备案、网络接入等资质与合规要求必须由运营方自行向适用的主管部门确认，本文不构成法律意见。

## 1. 目标形态

- 同一 HTTPS 源下：边缘入口提供静态 Vue PWA + SPA 回退 + 安全响应头，`/ai/*` 与 `/health` 反向代理到单实例无状态 Fastify。
- 首版固定单实例；扩容到多实例前必须重新评审进程内限流的全局语义。
- 不部署业务数据库、持久卷、队列、对象存储、共享 AI Key、分析 SDK 或远程错误追踪。浏览器数据（IndexedDB/OPFS）没有服务端副本，导出材料包是用户自控的备份。

## 2. 部署前提

- 域名与 DNS：公开域名（示例占位 `${YOUJU_DOMAIN}`）、A/AAAA 记录与证书（全链证书文件与私钥路径）。
- 区域与合规：由运营方确认适用的备案/接入要求；本文不推断法律上的可部署性。
- 边缘代理：固定出口地址的受信反向代理（Nginx 或其他等价实现）。
- 服务器：可运行 Node.js 24 的单台主机；不需要持久卷（无业务数据落盘；日志按 7 天上限滚动）。
- 构建产物：`pnpm build` 生成的 `apps/web/dist` 与 `pnpm generate:release` 生成的 `dist/release.json`。

## 3. 发布配对

Web 与 API 必须按同一发布编号成对发布：

1. `pnpm build` 构建 Web；
2. `pnpm generate:release` 生成 `apps/web/dist/release.json`（releaseId = 构建日期 + 完整 commit 前 7 位，格式 `YYYY.MM.DD-<shortsha>`）；
3. API 以 `NODE_ENV=production RELEASE_ID=<release.json 的 releaseId>` 启动；
4. 冒烟时验证 `/health` 的 `releaseId` 与 Web `/release.json`、`/about` 页显示的编号三者一致；
5. 回滚时 Web 静态目录与 API 进程按同一历史发布编号成对回退（见第 8 节）。

## 4. Fastify 生产配置

生产模式必须提供且仅提供：

- `RELEASE_ID`：校验格式 `^[A-Za-z0-9._-]{1,80}$`，与 release.json 一致；
- `TRUSTED_PROXY_CIDRS`：逗号分隔的显式代理出口 IP/CIDR 列表。禁止 `true`、`*`、`0.0.0.0/0`、`::/0`、空值或畸形条目；配置错误时进程启动即失败（fail closed）。

进程内限流以 `request.ip` 为键。受信代理必须：

- 重写并覆盖客户端伪造的 `X-Forwarded-For` / `X-Forwarded-Proto` / `X-Forwarded-Host`；
- 将 `X-Forwarded-Proto` 设置为实际对外协议（`https`）。若代理未设置该头，浏览器 https 同源请求的 Origin 校验会按 http 计算而误拒绝。

开发模式不需要代理配置；开发 `/health` 返回固定 `releaseId: dev-build`，不得把该值当作发布证据。

## 5. 边缘代理（Nginx 模板）

使用 `deploy/nginx/youju.conf.template` 与同目录的 `youju-security-headers.conf`、`youju-proxy-params.conf`（参数内容见 `deploy/README.md`）。部署前替换全部 `${...}` 占位符。关键约束：

- 每个自带 `add_header` 的 location 都必须 include 安全头文件（nginx 的 `add_header` 不跨层级继承）；
- `/assets/*` 与 `/demo/*` 不可变长缓存；`index.html`、`sw.js`、`manifest.webmanifest`、`release.json` 重新校验；`/ai/*`、`/health` 与错误响应 no-store；
- 仅允许 `POST /ai/connection-test` 与 `POST /ai/tasks/:taskType` 到达上游，其余 `/ai/*` 返回 404；
- `client_max_body_size` 不得大于 API 的 32 MiB；`proxy_read_timeout` 必须覆盖最长的任务预算（模板/参数使用 130s）；
- 修改模板后运行 `nginx -t` 并用真实请求复核响应头。

## 6. 部署步骤

1. 部署 API：上传构建产物与依赖，`NODE_ENV=production` 下启动；先验证 `GET /health` 返回 `{status, releaseId}` 且 releaseId 与发布编号一致。
2. 部署静态 Web：上传 `apps/web/dist` 到 `${STATIC_ROOT}`；确认 `index.html`、`sw.js`、`manifest.webmanifest`、`release.json` 与哈希资产就位。
3. 配置 DNS 与证书：确认公开域名解析与全链证书生效。
4. 配置边缘代理：应用模板与安全头/代理参数文件；`nginx -t` 后重载。
5. 冒烟（第 7 节）。
6. 记录发布编号、静态/API 产物摘要与冒烟证据到 `docs/release/m4-release-checklist.md`。

## 7. 冒烟检查

从普通国内网络路径执行：

1. HTTPS 访问首页：无需注册、无需 AI 即可「加载完全虚构演示」；
2. 演示流程：材料 → 事实 → 时间线 → 缺口 → 陈述 → 导出（文件名与内容均带 `DEMO` 标记）→ 删除并核验；
3. 隐私页删除全部本地数据后引导重现；
4. `/about` 显示与 `/health`、`/release.json` 一致的发布编号；
5. `/privacy`、`/about` 直接访问（SPA 回退）正常；
6. 安全头：CSP、HSTS（一年，无子域/preload）、`X-Content-Type-Options`、`Referrer-Policy`、COOP/CORP、Permissions-Policy 存在且无 COEP；
7. 缓存：哈希资产 immutable；壳入口 no-cache；`/ai`、`/health` 错误响应 no-store；
8. 离线壳：安装 PWA 后断网刷新可打开应用壳；
9. 更新：发布 release B 后提示更新、用户确认后生效，本地事件数据保留；
10. 日志抽查：确认不出现原始 IP、完整 User-Agent、请求体、Key 或模型内容。

## 8. 回滚

- Web 与 API 按同一发布编号成对回滚：恢复上一个发布编号的静态目录与 API 进程/配置。
- 回滚不删除浏览器本地数据；用户端由提示式 PWA 更新自动回到旧版本或保持当前版本。
- 回滚后重复第 7 节冒烟，确认 `/health` 与 `/release.json` 重新配对。
- 保留最近一个可回滚发布物（A-06）；不建议回滚超过一个发布编号。

## 9. 运维与威胁

日常告警与日志保留见[运维手册](operations.md)；安全项与测试映射见[M4 威胁检查清单](../security/m4-threat-checklist.md)。
