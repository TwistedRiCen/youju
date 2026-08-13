# M3 BYOK AI 威胁检查清单

更新时间：2026-08-13
范围：M3 Fastify 临时转发、浏览器会话配置、AI 派生输入、候选审核和 M2 手工降级。

## 1. 结论与证据边界

M3 的代码和自动化验收已覆盖设计中批准的主要控制点。服务端不保存用户业务数据或 API Key；浏览器只把 API Key 保存在页面会话内存；AI 结果先进入带来源的候选记录，正式输出仍由用户确认产生。

以下内容没有在本次自动化验收中声称完成：真实 Provider 请求、真实 API Key、现实数据样本、真实手机、国内厂商浏览器、生产域名、Provider 的当前服务条款或数据保留政策。这些是 M4 发布验证和部署审查的输入，不是 M3 的自动化通过条件。

证据分为三类：

- 自动化证据：本清单列出的 Vitest、Playwright、集成测试和 `pnpm verify`；
- 人工检查：需要真实设备、部署环境、Provider 账户或条款阅读的项目；
- 剩余风险：代码控制之外仍需由部署者、用户或 Provider 明确确认的事项。

## 2. 威胁到控制的映射

| 威胁                                                                   | 代码控制                                                                                                                                                                                           | 自动化证据                                                                                                                                                                      | 状态                                    |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| API Key 出现在会话状态、日志、错误、快照或浏览器存储                   | `apps/web/src/ai/ai-session.ts` 仅保存模块内存；`apps/web/src/ai/ai-api-client.ts` 仅随请求体发送；`apps/api/src/logging.ts` 遮蔽请求体、授权头和敏感字段；不把会话配置接入 IndexedDB/OPFS         | `tests/e2e/ai-session-privacy.spec.ts`、`apps/api/tests/log-redaction.test.ts`、`apps/api/tests/ai-routes.test.ts`、`pnpm check:forbidden-content`                              | 自动化已验证                            |
| 原始材料被上传，或页码、文字字段授权过宽                               | `apps/web/src/ai/derived-media.ts` 与 `pdf-page-renderer.ts` 只生成内存 WebP；`consent-scope.ts` 限制事件、材料页和文字字段；`input-manifest.ts` 分离本地清单与线上清单；API 校验 `sourceToken`    | `tests/e2e/ai-derived-media.spec.ts`、`tests/e2e/byok-ai-flow.spec.ts`、`packages/ai-core/tests/input-manifest.test.ts`、`apps/api/tests/ai-routes.test.ts`                     | 自动化已验证                            |
| SSRF、编码绕过、混合 DNS、DNS 重绑定、TLS 主机名错配、重定向或代理变量 | `apps/api/src/ai/target-policy.ts` 拒绝非 HTTPS、IP、凭据、查询、片段、点段和编码分隔符；解析结果全部检查公网地址；`pinned-https-client.ts` 固定地址、使用原主机名校验 TLS、禁止重定向、关闭 Agent | `apps/api/tests/target-policy.test.ts`、`apps/api/tests/address-policy.test.ts`、`apps/api/tests/pinned-https-client.test.ts`、`apps/api/tests/ai-routes.test.ts`               | 自动化已验证；生产 DNS/TLS 仍需人工检查 |
| Provider 的保留期限、训练使用和数据处理政策不确定                      | UI 与文档不作永久性可用性、价格、保留期限或准确性承诺；发送前显示 Provider 和输入范围；用户自行承担 Provider 选择责任                                                                              | `tests/e2e/byok-ai-flow.spec.ts` 的发送范围断言；文档扫描                                                                                                                       | 代码无法替代条款确认                    |
| Prompt injection、工具调用、主动模型输出或法律结论                     | `apps/api/src/ai/prompt-catalog.ts` 明确禁止工具、外部访问和 Provider 侧文件；材料放入不可信标记；任务只请求结构化候选；产品边界不生成法律责任、赔偿或成功率结论                                   | `apps/api/tests/prompt-catalog.test.ts`、`apps/api/tests/provider-adapters.test.ts`、`packages/ai-core/tests/output-validation.test.ts`                                         | 自动化已验证；Provider 行为仍属外部风险 |
| Schema、来源、区域失败，幻觉或污染正式数据                             | `output-validation.ts` 严格校验任务 Schema、来源 token、坐标和冲突；`review.ts` 只允许审核状态流转；导出包使用正式快照，不依赖 AI 候选                                                             | `packages/ai-core/tests/output-validation.test.ts`、`packages/ai-core/tests/review.test.ts`、`tests/e2e/byok-ai-flow.spec.ts`、`tests/integration/ai-golden-evaluation.test.ts` | 自动化已验证                            |
| 批次部分发布、修复重放、取消或刷新后残留任务                           | `ai-task-runner.ts` 在全部批次完成后事务发布；失败和取消不发布部分候选；Provider adapter 最多一次修复；AbortSignal 贯穿 API 与上游；分析版本不覆盖历史版本                                         | `tests/e2e/byok-ai-errors.spec.ts`、`apps/api/tests/provider-adapters.test.ts`、`apps/api/tests/ai-routes.test.ts`、`apps/web/src/storage/indexeddb-ai-repository.ts` 相关单测  | 自动化已验证                            |
| 速率、并发、请求体、响应体或内存耗尽                                   | `request-guard.ts` 限制每 IP 请求数、每 IP 活跃请求和进程活跃请求；API 与 AI manifest 设置请求、响应、文本、图片、批次和任务上限；派生媒体不进入持久化                                             | `apps/api/tests/request-guard.test.ts`、`apps/api/tests/ai-routes.test.ts`、`packages/ai-core/tests/input-manifest.test.ts`、`tests/e2e/ai-derived-media.spec.ts`               | 自动化已验证                            |
| 候选、分析版本删除后仍有引用或事件删除残留                             | `indexeddb-ai-repository.ts` 拒绝仍被正式记录引用的分析删除；事件删除包含分析、候选和正式记录，并核验 OPFS 引用；内存 AI 会话由关闭操作清除                                                        | `tests/e2e/ai-repository.spec.ts`、`tests/e2e/verified-deletion.spec.ts`、`tests/e2e/ai-session-privacy.spec.ts`、`apps/web/src/services/delete-case-service.ts`                | 自动化已验证                            |
| 关闭 AI 后核心流程回归，或候选进入导出                                 | M2 页面和服务不依赖 AI；导出模型只接收正式事实、时间线、陈述和原始材料；候选确认是显式操作                                                                                                         | `tests/e2e/no-ai-core.spec.ts`、`tests/e2e/submission-package.spec.ts`、`tests/e2e/byok-ai-errors.spec.ts`、`packages/document-export/tests`                                    | 自动化已验证                            |

## 3. M3 验收标准逐项记录

| 已批准能力                           | 具体实现与测试证据                                                                                                                                                                                 |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responses 与 Chat Completions 双协议 | `packages/ai-core/src/provider.ts`、`apps/api/src/ai/provider-adapters.ts`；`apps/api/tests/provider-adapters.test.ts`、`tests/e2e/byok-ai-flow.spec.ts`                                           |
| 四个预设与自定义目标                 | `PROVIDER_PRESETS` 包含 OpenAI、阿里云百炼、DeepSeek、SiliconFlow 和 custom；`apps/api/src/ai/target-policy.ts`；`packages/ai-core/tests/provider.test.ts`、`apps/api/tests/target-policy.test.ts` |
| API Key 只在页面会话内存             | `apps/web/src/ai/ai-session.ts`、`apps/web/src/ai/ai-api-client.ts`；`tests/e2e/ai-session-privacy.spec.ts`、`apps/api/tests/log-redaction.test.ts`                                                |
| 不上传原始文件                       | `apps/web/src/ai/derived-media.ts`、`pdf-page-renderer.ts`、`input-manifest-builder.ts`；`tests/e2e/ai-derived-media.spec.ts`                                                                      |
| 严格确认与会话便捷确认               | `apps/web/src/ai/consent-scope.ts`、`ai-session.ts`；`tests/e2e/byok-ai-flow.spec.ts`                                                                                                              |
| 来源、页码和区域关联                 | `packages/ai-core/src/output-validation.ts`、`packages/ai-core/src/candidates.ts`、`SourceRegionPreview.vue`；`packages/ai-core/tests/output-validation.test.ts`                                   |
| 能力门控                             | `apps/api/src/routes/ai.ts` 的 `validateTaskBody` 与 Provider 能力声明；`apps/api/tests/ai-routes.test.ts`、`tests/e2e/byok-ai-errors.spec.ts`                                                     |
| 候选与正式数据隔离                   | `apps/web/src/services/ai-review-service.ts`、`packages/document-export/src/export-model.ts`；`tests/e2e/byok-ai-flow.spec.ts`、`tests/e2e/submission-package.spec.ts`                             |
| 单任务、快捷分析和批处理入口         | `apps/web/src/ai/ai-task-runner.ts`、`AiAssistantView.vue`；`tests/e2e/byok-ai-flow.spec.ts`                                                                                                       |
| 用户取消                             | `ai-task-runner.ts`、`ai-api-client.ts`、`apps/api/src/routes/ai.ts`；`tests/e2e/byok-ai-errors.spec.ts`、`apps/api/tests/ai-routes.test.ts`                                                       |
| 最多一次结构化修复                   | `apps/api/src/ai/provider-adapters.ts` 的 repair 分支；`apps/api/tests/provider-adapters.test.ts`、`tests/e2e/byok-ai-errors.spec.ts`                                                              |
| 输入、请求和响应上限                 | `packages/ai-core/src/input-manifest.ts`、`apps/api/src/routes/ai.ts`、`pinned-https-client.ts`；`packages/ai-core/tests/input-manifest.test.ts`、`apps/api/tests/ai-routes.test.ts`               |
| 限流与并发保护                       | `apps/api/src/ai/request-guard.ts`；`apps/api/tests/request-guard.test.ts`、`tests/e2e/byok-ai-errors.spec.ts`                                                                                     |
| 分析/候选删除与事件删除核验          | `apps/web/src/storage/indexeddb-ai-repository.ts`、`delete-case-service.ts`；`tests/e2e/ai-repository.spec.ts`、`tests/e2e/verified-deletion.spec.ts`                                              |
| AI 关闭后 M2 手工流程继续可用        | M2 页面、服务和导出包未依赖 `@youju/ai-core`；`tests/e2e/no-ai-core.spec.ts`、`tests/e2e/byok-ai-errors.spec.ts`                                                                                   |
| 全浏览器 E2E                         | `tests/e2e/byok-ai-flow.spec.ts`、`byok-ai-errors.spec.ts` 和 Playwright 配置的桌面 Chromium、移动 Chromium、移动 WebKit；本次 `pnpm verify` 负责执行全部项目                                      |

## 4. 人工检查与剩余风险

### 尚未执行的人工检查

- 使用独立测试 Key 和完全虚构小样本，逐个验证四个预设在目标网络中的连接、能力声明、错误映射和账单提示；
- 在真实桌面、Android、iOS 和国内厂商浏览器中检查页面显示、文件派生、取消、刷新、清理和导出；
- 在部署后的 HTTPS 域名检查 `/ai` 同源路由、反向代理、请求体限制、响应头、TLS、超时和断开连接行为；
- 阅读并记录所选 Provider 当前服务条款、数据保留、训练使用、跨境传输和企业控制项；
- 对自定义 Base URL 进行部署环境的 DNS、证书、出口网络和代理配置复核。

### M3 保留风险

1. Provider 的协议、模型能力、网络可达性和数据政策可能随外部服务变化；仓库中的预设不能替代发布前的逐项验证。
2. Fastify 临时转发只控制本项目服务端的存储与日志边界，不能阻止 Provider 按其服务条款处理用户明确授权发送的派生内容。
3. 严格 HTTPS 目标策略降低了 SSRF 和重定向风险，但部署环境的 DNS、出口代理、证书链和运行时补丁仍需要单独运维审查。
4. 当前 E2E 使用同源 Mock 路由，证明客户端契约、取消和错误恢复，不证明真实 Provider 的内容质量、地区可达性或服务稳定性。
5. M3 不提供密钥持久化、服务端任务恢复或跨设备同步；用户刷新页面后需要重新配置 AI，这属于安全边界而非故障。

## 5. 本次可复现命令

```powershell
pnpm exec prettier --check README.md docs
pnpm check:forbidden-content
pnpm test:ai-contract
pnpm eval:golden-case
pnpm verify
git diff --check
git status --short
```

这些命令不访问真实 Provider。完整结果以 Task 15 完成提交和提交后的工作区状态为准。
