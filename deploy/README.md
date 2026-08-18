# 有据 YouJu M4 部署资产

本目录只包含部署模板与说明；不包含真实域名、证书路径、密钥或已生效的服务器配置。

## nginx/youju.conf.template

同源单域部署模板：静态 Vue PWA + SPA 回退 + 安全响应头 + `/ai/*` 同源反向代理 + `/health`。

部署前必须替换全部 `${...}` 占位符：

- `${YOUJU_DOMAIN}`：公开域名；
- `${TLS_CERT_PATH}` / `${TLS_KEY_PATH}`：证书与私钥路径；
- `${STATIC_ROOT}`：`apps/web/dist` 的部署路径；
- `${UPSTREAM_HOST}` / `${UPSTREAM_PORT}`：Fastify 上游地址（通常 `127.0.0.1:3000`）。

模板引用的 `youju-security-headers.conf`（安全头集合）与 `youju-proxy-params.conf`（代理参数）已随本目录提供，部署时与模板一起复制到 `/etc/nginx/conf.d/`。`youju-proxy-params.conf` 的关键约束：客户端体上限必须与 `apps/api` 的 `MAX_REQUEST_BYTES`（32 MiB）一致，不得更大；读取超时（130s）必须覆盖 API 最长的任务预算（`draft_statement` 120s），避免边缘提前 504。

注意：nginx 的 `add_header` 不跨层级继承，任何自带 `add_header` 的 location 都必须 `include youju-security-headers.conf`；模板已按此编写，自行修改时必须保持该约定。

关键约束（与 M4 设计一致）：

- 必须过滤客户端透传的 `X-Forwarded-*` 头并自行设置 `X-Forwarded-Proto`；否则生产 https 同源请求会因 Origin 判定误拒绝（Task 10 Review 结转）。
- `TRUSTED_PROXY_CIDRS` 必须显式列出边缘代理出口地址；禁止 `true`、`*`、`0.0.0.0/0` 与 `::/0`。
- CSP 不允许 `unsafe-inline`/`unsafe-eval`/远程脚本；不启用 COEP；HSTS 一年不含子域与 preload。
- `index.html`、`sw.js`、`manifest.webmanifest`、`release.json` 重新校验；`/assets/*` 与 `/demo/*` 不可变长缓存；`/ai/*`、`/health` 与错误响应 no-store。
- 开发构建的 `/health` 返回 `releaseId: dev-build`；生产构建返回发布时生成的校验 releaseId。

## 生成发布描述

构建完成后运行：

```powershell
pnpm build
pnpm generate:release
```

生成 `apps/web/dist/release.json`（仅含 releaseId、完整 commit、UTC 构建时间、IndexedDB 版本、case schema 版本与演示夹具 ID，无任何密钥）。

## 本地生产候选验证

```powershell
pnpm build
pnpm generate:release
pnpm check:production-headers
```

`serve:production-candidate` 会以本地候选服务器（静态缓存规则 + SPA 回退排除 + `/ai/*` 代理到 `127.0.0.1:3000`）提供构建产物，仅用于本地测试。
