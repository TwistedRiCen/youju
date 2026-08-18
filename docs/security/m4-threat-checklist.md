# M4 威胁检查清单

每条自动化声明必须能对应到具体文件/测试；人工行与真实环境行在 Task 14/15 授权执行前保持未勾选。

## 自动化项

| #    | 威胁                                                | 缓解与证据                                                                                                                                                                                                                                                                                                                              | 状态 |
| ---- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| T-01 | Service Worker 缓存用户材料、导出或 AI 数据         | 运行时缓存为空；precache 仅为应用壳 + 显式 demo allowlist；`/ai/*`、`/health` 经 `navigateFallbackDenylist` 排除。证据：`apps/web/vite.config.ts`、`tests/e2e/production-cache-privacy.spec.ts`（枚举全部 Cache Storage 键与响应体）                                                                                                    | [x]  |
| T-02 | 陈旧更新导致新旧代码混跑或自动强刷                  | 提示式更新：idle/offline_ready/update_available/updating 状态机，用户确认才激活；无自动重载断言。证据：`apps/web/src/pwa/update-controller.ts`、`apps/web/tests/pwa-update-controller.test.ts`、`tests/e2e/pwa-offline-update.spec.ts`、`tests/e2e/production-release-update.spec.ts`                                                   | [x]  |
| T-03 | 演示案例与真实事件混淆                              | 单一 `CaseEvent.dataOrigin` 判别；所有正式格式与文件名强制 `DEMO` 标记；演示横幅持续显示。证据：`packages/document-export/tests/*`、`apps/web/tests/demo-case-banner.test.ts`、`tests/e2e/public-demo-export.spec.ts`、`tests/e2e/production-public-demo.spec.ts`                                                                       | [x]  |
| T-04 | 代理伪造转发头导致限流绕过或 Origin 误判            | 生产配置要求显式 CIDR 列表，拒绝 `true`/`*`/通配；Origin + Fetch Metadata 同源策略在 onRequest 阶段执行。证据：`apps/api/src/production-config.ts`、`apps/api/src/request-origin-policy.ts`、`apps/api/tests/production-config.test.ts`、`apps/api/tests/request-origin-policy.test.ts`、`apps/api/tests/ai-routes.test.ts`（跨站 403） | [x]  |
| T-05 | CSP 缺失或含 unsafe 令牌                            | 全响应 CSP（`default-src 'self'`、无 `unsafe-inline`/`unsafe-eval`/远程源、`object-src 'none'` 等）；生产候选 E2E 在强制 CSP 下运行完整演示。证据：`scripts/serve-production-candidate.ts`、`deploy/nginx/youju-security-headers.conf`、`tests/integration/security-headers.test.ts`、`tests/e2e/production-public-demo.spec.ts`        | [x]  |
| T-06 | 静态回退吞掉 `/ai`、`/health` 或未知文件            | 候选服务器与 Nginx 模板对 `/ai*`、`/health` 排除回退；文件形态 404 不回退壳。证据：`scripts/serve-production-candidate.ts`、`deploy/nginx/youju.conf.template`、`tests/integration/production-routing.test.ts`                                                                                                                          | [x]  |
| T-07 | 发布 sourcemap 泄漏源码                             | 生产构建配置 `build.sourcemap: false`，dist 不产出 `.map`；`check:web-budget` 作为 `verify:release-candidate`/CI 门禁运行（非随 build 运行）。证据：`apps/web/vite.config.ts`、`package.json`（`verify:release-candidate`）、`.github/workflows/ci.yml`                                                                                 | [x]  |
| T-08 | Web 与 API 发布编号错配                             | `release.json` 与 `/health` releaseId 同源生成与配对断言；`/about` 显示同一编号。证据：`scripts/generate-release-descriptor.ts`、`tests/e2e/production-public-demo.spec.ts`（配对测试）                                                                                                                                                 | [x]  |
| T-09 | 首屏/应用壳超预算导致体验或缓存失控                 | `check:web-budget`：首屏 gzip ≤ 500 KiB、应用壳预缓存（排除 demo/PDF worker/字体）≤ 2 MiB，超限具名失败。证据：`scripts/check-web-build-budget.ts`、`package.json`（`check:web-budget`，纳入 `verify:release-candidate`）                                                                                                               | [x]  |
| T-10 | 日志泄漏原始 IP、完整 User-Agent 或敏感字段         | req 白名单序列化（仅 method/url/ipClass/origin/secFetchSite）+ 既有 redact 路径；测试断言不出现 IP/User-Agent。证据：`apps/api/src/logging.ts`、`apps/api/tests/log-redaction.test.ts`                                                                                                                                                  | [x]  |
| T-11 | 更新确认时丢失未决本地写入或页面内存 Key 语义被破坏 | 活动门控（导入/导出/AI/未决 autosave）等待；确认文案说明页面会话 Key 清空；发布更新测试证明数据保留、页面内存清空。证据：`apps/web/src/pwa/update-controller.ts`、`apps/web/src/composables/use-autosave.ts`、`tests/e2e/production-release-update.spec.ts`                                                                             | [x]  |
| T-12 | 回滚破坏发布配对或本地数据                          | 部署文档要求成对回滚并重跑冒烟；回滚不删除浏览器数据（PWA 更新语义）。证据：`docs/deployment/public-demo.md`（第 8 节）                                                                                                                                                                                                                 | [x]  |

## 人工/真实环境项（Task 14/15 授权前保持未勾选）

| #    | 检查                                                                                                    | 状态 |
| ---- | ------------------------------------------------------------------------------------------------------- | ---- |
| T-13 | 真实设备与浏览器矩阵（Windows Chrome/Edge、Android Chrome、国产浏览器、iOS Safari、微信内置浏览器降级） | [ ]  |
| T-14 | 真实 Provider 小样本核对（专用低额度 Key、虚构最小样本、条款核对；不可验证的 Provider 诚实标记）        | [ ]  |
| T-15 | 国内网络可达性与真实 HTTPS 冒烟                                                                         | [ ]  |
| T-16 | 生产日志抽查（无原始 IP/User-Agent/内容）                                                               | [ ]  |
| T-17 | 生产成对回滚演练                                                                                        | [ ]  |
| T-18 | 公开部署后的依赖/证书审计复核                                                                           | [ ]  |
