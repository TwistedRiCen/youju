# YouJu Goal State

## Project Goal

在不改变既有产品、安全和隐私边界的前提下，将已经完成 M1–M3 的有据 YouJu V0.1 推进到 M4「公开演示与部署」完成状态，使中国普通用户无需注册即可安全试用公开演示版本，并能完成可验证的无 AI 核心演示流程。

## Current Phase

`EXECUTION`

M4 方向设计和详细实施计划均已有用户批准证据。执行继续受仓库单智能体、单 Task 明确授权和完成后 STOP 的规则约束。

## Scope / Non-Goals

### Scope

- 恢复并维护 M4 的可信 Goal 状态。
- 以已批准的 V0.1 与 M4 设计为架构依据，以仓库现实为完成证据。
- M4 覆盖无注册公开演示、虚构演示身份、受控 PWA 离线与更新、隐私说明、同源静态 Web 与单实例 Fastify 部署边界、安全响应头、真实环境验证、可回滚部署证据。

### Non-Goals

- 不扩展到网购退款纠纷以外的场景。
- 不增加账号、云同步、服务端业务数据持久化、共享 AI Key、自动投诉、法律结论、遥测、广告或用户画像。
- 不把 M5 用户研究、匿名指标或第二场景设计并入 M4。
- 本次 readiness checkpoint 不实现任何 M4 Task，不执行部署、发布、push 或 `/goal` 长期执行。

## Confirmed Facts

- V0.1 只支持网购商品质量、破损或描述不符且商家未妥善处理的材料整理场景；本地优先、无 AI 可用、AI 候选须用户确认、API Key 仅驻留页面会话内存是仓库强制边界。依据：`AGENTS.md`、`docs/superpowers/specs/2026-07-29-youju-v0.1-design.md`。
- M1、M2、M3 的实施计划复选项均已关闭，仓库包含对应实现、测试、威胁检查与完成提交。
- 2026-08-17 在 `371bbd6082daa071f535c8113fbe9c5bf0c6596a` 上重新运行 `pnpm verify` 成功：54 个 Vitest 文件、310 个测试通过；Playwright 112 个通过、8 个跳过；fixture、构建、lint 和 typecheck 通过。
- 同日 `pnpm check:forbidden-content`、`pnpm test:ai-contract`（5 文件、34 测试）和 `pnpm eval:golden-case` 通过；评测使用虚构固定数据，未调用真实 Provider。
- M4 设计方向已确认，D-01 至 D-06 有 2026-08-13 用户批准记录。依据：`docs/superpowers/specs/2026-08-13-youju-m4-public-demo-deployment-design.md`。
- M4 详细实施计划已由用户于 2026-08-17 正式批准；该批准不改变冻结架构、Locked Implementation Parameters、Task 顺序或产品边界。
- M4 生产实现尚未开始：当前仍使用 PWA `autoUpdate`；领域模型没有 `dataOrigin` / `demoFixtureId`；没有公开演示资产、首次引导、隐私/关于页、提示式更新控制器、显式 `trustProxy`、生产安全头、部署资产、生产 PWA 配置或 M4 专项测试。
- 当前工作分支在本文件创建前为干净的 `codex/m4-public-demo`，HEAD 为 `371bbd6082daa071f535c8113fbe9c5bf0c6596a`；其上游同名远端一致。`main` 为 `8a4c11852efc85e87cf67af7b82f7cc80312c0d0`，比当前分支多一个合并提交，但两者文件树相同。

## Design Assumptions

- A-01：首版公开演示采用单一公开站点域名，静态 Web 与 Fastify `/ai` 同源；以部署冒烟验证。
- A-02：首版只运行一个 Fastify 实例并保留进程内保护；扩容前重新评审全局限流语义。
- A-03：首次引导与更新偏好属于低敏数据，进入独立 IndexedDB 偏好存储并随全量本地删除清除。
- A-04：首次真实事件创建或材料导入后请求持久化存储权限；不支持或拒绝时诚实降级。
- A-05：M4 不采集使用指标，自愿反馈仅使用本地复制模板或经批准的外部入口。
- A-06：公开版本保留最近一个可回滚发布物，Web 与 API 按同一发布编号成对回滚。

## Pending Decisions

- P-01 `RESOLVED`（2026-08-17）：用户正式批准当前 M4 详细实施计划；计划状态与 README 语义现已一致，且实现仍未开始。
- P-02 `RESOLVED`（2026-08-17）：保留现有 `codex/m4-public-demo`，在 readiness commit 后通过 `git merge --ff-only main` 对齐最新批准 baseline；不删除分支、不重写历史、不创建替代分支。
- P-03（Task 15 前）：公开供应商、区域、域名、DNS、证书、受信代理 CIDR、访问方式及适用备案/合规前提尚未选择或确认。
- P-04（Task 14 前）：可用真实设备/浏览器矩阵及任何真实 Provider 测试 Key/条款核对尚未授权；无法验证的 Provider 必须诚实标记。

## Frozen Decisions

- FD-01：V0.1 产品范围、本地优先、无 AI 核心完整可用、AI 仅产候选、正式输出只使用确认内容、服务端无业务数据持久化。
- FD-02：首版部署形态为同源静态 Web、边缘反向代理和单实例无状态 Fastify；供应商、区域、域名和证书另行选择。
- FD-03：公开 BYOK AI 展示但默认关闭，不提供共享 Key；无 AI 演示是发布阻断门禁。
- FD-04：`CaseEvent` 使用 `dataOrigin` 与 `demoFixtureId` 显式区分真实事件和完全虚构演示，演示导出全部强制标记。
- FD-05：低敏运行日志最长保留 7 天，禁止原始 IP、完整 User-Agent、请求体、Key 与模型内容。
- FD-06：反馈基础能力为本地复制模板；外部 Issue 链接需有已确认公开仓库且跳转前提示，绝不附带事件内容。
- FD-07：真实 Provider 不进入 CI；只有获得专用低额度 Key 并核对条款后才用完全虚构最小样本人工验证，否则标记未验证。
- FD-08：PWA 使用提示式更新，Service Worker 只缓存批准的应用壳，不缓存 `/ai/*`、`/health`、用户材料、导出或 AI 数据。

冻结决定的 canonical 依据是 `docs/superpowers/specs/2026-08-13-youju-m4-public-demo-deployment-design.md`；出现新安全、兼容或部署证据时才重新打开。

## Existing Milestone Status

- M1 Foundation：`ACCEPTED`。已实现；历史完成计划、`v0.1.0-m1` 本地标签和当前全量验证提供证据。
- M2 No-AI Core：`ACCEPTED`。已实现；无 AI 创建、导入、事实、时间线、规则、陈述、导出和核验删除在当前全量门禁通过。
- M3 BYOK AI：`ACCEPTED`。已实现并通过当前自动化门禁；真实 Provider、真实设备和生产 HTTPS 不属于其自动化验收结论。
- M4 Public Demo and Deployment：`NOT STARTED`；readiness 为 `APPROVED / READY`。设计方向与详细计划均已批准；实现、生产验证和部署尚未开始。
- M5 Validation：`BLOCKED`。只有 M4 发布证据完整后才能开始。

## Current Milestone

M4 Public Demo and Deployment — `NOT STARTED`；`APPROVED / READY`

Canonical architecture evidence：`docs/superpowers/specs/2026-08-13-youju-m4-public-demo-deployment-design.md`。

Approved implementation sequence：`docs/superpowers/plans/2026-08-13-youju-m4-public-demo-deployment-plan.md`。

Next Action：M4 Task 1 — Establish Demo Identity and Load Operation Contracts。必须由用户单独授权后执行。

## Acceptance Criteria

- AC-01 `OPEN`：公开 HTTPS 地址无需注册、无需 AI、无需 Provider 即可加载完全虚构演示并完成整理、导出和删除主流程。
- AC-02 `OPEN`：本地优先与服务端无业务持久化边界在生产拓扑、日志和发布物中可验证。
- AC-03 `OPEN`：演示身份、幂等加载/重置、真实事件隔离及 PDF/CSV/HTML/ZIP/文件名演示标记均通过回归。
- AC-04 `OPEN`：提示式 PWA 更新、离线应用壳和严格缓存边界通过生产 Service Worker 测试，恢复在线不自动发送数据。
- AC-05 `OPEN`：同源代理信任、请求来源策略、CSP、安全响应头、缓存规则、SPA fallback 与 Web/API 发布配对可重复验证。
- AC-06 `OPEN`：公开隐私、AI 数据流、非法律服务、本地删除和导出敏感性说明完整且与实现一致。
- AC-07 `OPEN`：根级门禁、生产候选门禁、真实设备矩阵、国内网络可达性、部署冒烟和成对回滚均有真实证据。
- AC-08 `OPEN`：运维与发布材料覆盖日志保留、证书、DNS、API 降级、故障恢复和诚实的 Provider 验证状态。

## Risks

- 当前入口 JS gzip 约 763 KiB，超过 M4 首屏 500 KiB 目标；构建也报告大块警告。
- 当前 PWA `autoUpdate` 可能在刷新时清除页面会话 API Key，并缺少用户可控更新状态。
- Fastify 默认不信任代理且使用 `request.ip` 做进程内保护；反向代理后需要显式受信 CIDR，直接设 `true` 会扩大伪造风险。
- 当前开发服务器 E2E 不能证明生产 Service Worker、缓存头、安全头、HTTPS 代理或发布回滚。
- 真实设备、国产浏览器、Provider、国内网络与运营合规条件尚未验证，不能由代码或历史计划替代。
- 用户浏览器业务数据没有服务端备份；公开说明、持久化存储提示和用户主动导出必须保持一致。

## Blockers

- M4 Task 1 当前没有未解决的设计、计划或分支 readiness blocker；仍需用户按仓库规则单独授权该 Task。
- M4 Task 14/15：分别需要真实设备/Provider 授权和公开部署目标/外部操作授权。
- M5：受 M4 完整验收与公开部署证据阻塞。

## Verified Progress

- 2026-08-17：完成 Existing Project Goal Onboarding / State Reconstruction；未创建子智能体，未执行任何 M4 实现 Task。
- 2026-08-17：确认 Node.js `v24.19.0`、pnpm `10.34.0`。
- 2026-08-17：`pnpm verify` 通过；Vitest 54/54 文件、310/310 测试通过，Playwright 112 通过、8 跳过，lint、typecheck、fixture、build 通过。
- 2026-08-17：`pnpm check:forbidden-content`、`pnpm test:ai-contract`（34/34）和 `pnpm eval:golden-case` 通过。
- 2026-08-17：只读核对 PWA、领域模型、公开 UX、Fastify、部署资产和测试目录，确认 M4 生产实现为 `NOT STARTED`。
- 2026-08-17：初始化本文件；未复制 M4 设计或实施计划全文，二者继续作为 canonical evidence。
- 2026-08-17：用户正式批准 M4 详细实施计划；Current Phase 转入 `EXECUTION`，M4 readiness 标记为 `APPROVED / READY`，实现保持 `NOT STARTED`。
- 2026-08-17：完成 M4 Execution Readiness Checkpoint 的文档状态与无历史重写分支对齐；下一步固定为 M4 Task 1，尚未执行。
