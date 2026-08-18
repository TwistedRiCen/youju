# M4 发布检查清单

发布编号：`2026.08.18-cf2201c`　完整 commit：`cf2201c20e0028960f2de8367261f93321f87148`　构建时间（UTC）：`2026-08-18T07:47:38Z`

每一行必须填写真实证据来源或明确标注「未执行」。自动化行已由 `pnpm verify` 与 `pnpm verify:release-candidate` 提供证据；Task 14 于 2026-08-18 记录了部分真实环境证据（Windows Chrome/Edge 真实浏览器、Provider 端点网络探针），缺失外部条件的设备/Provider 行保持未勾选；国内可达性与公开部署行在 Task 15 获得授权并执行前保持未勾选。

## 自动化证据

| 检查                                             | 自动化证据（文件/命令）                                                                                                   | 状态                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 根级门禁（lint/typecheck/测试/fixture/构建/E2E） | `pnpm verify`                                                                                                             | [x] 2026-08-18 全绿（vitest 全项目通过；e2e 130 通过/14 跳过，见 PLAN.md Verified Progress） |
| 生产候选门禁                                     | `pnpm verify:release-candidate`（build→release→预算→头→集成→生产 E2E）                                                    | [x] 2026-08-18 全绿（生产 E2E 6/6）                                                          |
| 首屏/应用壳预算                                  | `scripts/check-web-build-budget.ts`                                                                                       | [x] 首屏 125.7 KiB ≤ 500；应用壳 765.6 KiB ≤ 2048                                            |
| 无 AI 公开演示全流程                             | `tests/e2e/production-public-demo.spec.ts`                                                                                | [x] 生产头下加载/材料/导出 DEMO zip 读回/删除核验，无 /ai 请求                               |
| 缓存隐私                                         | `tests/e2e/production-cache-privacy.spec.ts`                                                                              | [x] 全部 Cache Storage 无 /ai、/health、用户数据、Key 标记、导出数据                         |
| 提示式更新与离线壳                               | `tests/e2e/pwa-offline-update.spec.ts`、`tests/e2e/production-release-update.spec.ts`                                     | [x] 无自动重载；确认后更新；本地数据保留、页面内存清空                                       |
| Web/API 发布配对                                 | `tests/e2e/production-public-demo.spec.ts`（配对测试）                                                                    | [x] `/health` releaseId === `/release.json` === `/about`                                     |
| 安全响应头与缓存规则                             | `scripts/check-production-headers.ts`、`tests/integration/security-headers.test.ts`                                       | [x] CSP/HSTS/COOP/CORP/PP + 缓存矩阵                                                         |
| 生产 API 边界                                    | `apps/api/tests/production-config.test.ts`、`request-origin-policy.test.ts`、`log-redaction.test.ts`、`ai-routes.test.ts` | [x] 受信 CIDR、跨站 403、日志白名单                                                          |
| 演示夹具与敏感内容                               | `pnpm validate:public-demo`、`pnpm check:forbidden-content`                                                               | [x] 见 PLAN.md Verified Progress（Task 3 记录与 2026-08-18 运行）                            |

## 设备矩阵（Task 14，待授权）

| 设备/浏览器                | 直接访问 | 演示 | 导入 | 刷新 | 导出 | 删除 | 安装/离线/更新 | 证据 |
| -------------------------- | -------- | ---- | ---- | ---- | ---- | ---- | -------------- | ---- |
| Windows Chrome/Edge        | [x]      | [x]  | [x]  | [x]  | [x]  | [x]  | [x]            | 2026-08-18：Playwright 驱动本机真实安装的 Chrome/Edge（channel: chrome/msedge）生产套件 12/12 通过（缓存隐私、完整无 AI 演示+发布配对、发布更新数据保留、离线壳、提示式更新）；真实 Chrome 补充检查 9/9（直接访问/演示/材料导入/OPFS/刷新持久/SW 注册+控制/manifest，无页面错误）。安装/离线/更新列分解：离线壳与提示式更新已验证；安装=SW 注册、manifest 与可安装性前提已验证，安装提示的人工点击未自动化（未覆盖）。 |
| Android Chrome             | [ ]      | [ ]  | [ ]  | [ ]  | [ ]  | [ ]  | [ ]            | 无可用设备：adb 无设备连接、无 Android 模拟器（Hard Stop）                                                |
| 国内 Android 浏览器        | [ ]      | [ ]  | [ ]  | [ ]  | [ ]  | [ ]  | [ ]            | 无可用设备（Hard Stop）                                                                                   |
| iOS Safari                 | [ ]      | [ ]  | [ ]  | [ ]  | [ ]  | [ ]  | [ ]            | 无 macOS/iPhone 验证条件（Hard Stop）                                                                     |
| 微信内置浏览器（仅可用性） | [ ]      | [ ]  | [ ]  | [ ]  | [ ]  | [ ]  | N/A            | 本机未安装微信且无手机端（Hard Stop）                                                                     |

## Provider 核对（Task 14，待授权）

| Provider    | 模型 | 协议             | 日期       | 网络                                      | 结果                                  | 条款核对           | 状态       |
| ----------- | ---- | ---------------- | ---------- | ----------------------------------------- | ------------------------------------- | ------------------ | ---------- |
| OpenAI      |      | responses        | 2026-08-18 | 本机 TLS 可达（HEAD 401=需鉴权响应）      | 未执行（无专用低额度测试 Key）        | 未核对（无账号）   | [ ] 未验证 |
| 阿里云百炼  |      | chat_completions | 2026-08-18 | 本机 TLS 可达（HEAD 404=根路径响应）      | 未执行（无专用低额度测试 Key）        | 未核对（无账号）   | [ ] 未验证 |
| DeepSeek    |      | chat_completions | 2026-08-18 | 本机 TLS 可达（HEAD 401=需鉴权响应）      | 未执行（无专用低额度测试 Key）        | 未核对（无账号）   | [ ] 未验证 |
| SiliconFlow |      | chat_completions | 2026-08-18 | 本机 TLS 可达（HEAD 404=根路径响应）      | 未执行（无专用低额度测试 Key）        | 未核对（无账号）   | [ ] 未验证 |

网络列仅记录本机 TLS 连通性探针（2026-08-18，`curl -I` 至各 preset 端点主机，未携带 Key、未发送任何数据）；模型为运行时用户配置值，未在代码中固定。无专用低额度测试 Key 时，各 Provider 保持「本版本未做真实验证」。

不可验证的 Provider 在 `/about` 保持「真实 Provider 尚未验证」的诚实标记。

## 国内可达性与部署（Task 15，待授权）

| 检查                                      | 状态 | 证据 |
| ----------------------------------------- | ---- | ---- |
| 普通国内网络 HTTPS 冒烟（第 7 节全项）    | [ ]  |      |
| 部署目标/域名/DNS/证书/备案前提确认       | [ ]  |      |
| 成对回滚演练并恢复发布                    | [ ]  |      |
| 生产日志抽查（无原始 IP/User-Agent/内容） | [ ]  |      |
| 公开地址与发布状态更新（README/roadmap）  | [ ]  |      |

## 结论

- [ ] 全部必选自动化证据与授权后的人工/部署证据齐备，M4 可声明验收。
- 未勾选项如实保留，不得以文档替代真实证据。
- 2026-08-18 Task 14 部分证据已记录：Windows Chrome/Edge 真实浏览器验证通过、Provider 端点网络探针完成；Android/iOS/微信设备与 Provider 专用低额度测试 Key 当前不可用，Task 14 未完整验收（Hard Stop）。
