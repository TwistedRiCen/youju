# YouJu Goal State

## Project Goal

在不改变既有产品、安全和隐私边界的前提下，将已经完成 M1–M3 的有据 YouJu V0.1 推进到 M4「公开演示与部署」完成状态，使中国普通用户无需注册即可安全试用公开演示版本，并能完成可验证的无 AI 核心演示流程。

## Current Phase

`EXECUTION`

M4 方向设计和详细实施计划均已有用户批准证据。执行采用 `AUTONOMOUS WITH HARD GATES`，在批准边界内持续推进，直到 Goal Acceptance 完成或触发真正的 Hard Stop。

## Execution Policy

### Execution Mode

`AUTONOMOUS WITH HARD GATES`

- 在已批准的 M4 Goal、Architecture、Frozen Decisions、Implementation Plan 和 Acceptance Criteria 范围内自主执行。
- Task 满足验收标准、相关验证通过、阻断性 Review finding 已解决且本文件已同步后，可以自动选择下一个 dependency-ready Task。
- 普通测试失败、编译失败、局部实现修正、Review finding、可逆设计细节和回归修复由 Codex 自主诊断、修复并重新验证，不构成人工 checkpoint。
- TDD、minimal correct change、root-cause、兼容性、安全、隐私和确定性工程纪律保持不变。

### Delegation and Writers

- 允许 bounded named subagents：`explorer`、`docs_researcher`、`test_analyst`、`reviewer`、`routine_worker`。
- 默认模式为 Many Readers → Evidence Convergence → One Writer → Verification → Independent Review。
- concurrent read-only agents 不超过 3；active writers 不超过 1；不得并行修改重叠核心文件。
- Main Sol Thread 负责歧义高、架构或安全敏感、跨模块复杂实现；`routine_worker` 仅用于范围冻结、行为明确、文件面有界且无未决架构或安全决定的工作。
- significant implementation 在主验证后由具名 `reviewer` 做独立只读 Review；BLOCKER / MAJOR finding 修复后重新验证，必要时重新 Review。

### Commits and External Actions

- 当前 M4 Goal 内 verified local commits 已获授权；每个完成并验收的 Task 保持独立提交，提交后无需人工 checkpoint 即可继续。
- `PUSH / PR / MERGE / TAG / RELEASE / DEPLOY / PRODUCTION MUTATION = DENY`，首次真正需要时进入 Hard Stop 并请求授权。
- `REAL PROVIDER CALL = REQUIRE EXPLICIT AUTHORIZATION`。
- no worktree unless explicitly justified and authorized；不得为了 Multi-Agent 创建 worktree。

### Policy Precedence

根 `AGENTS.md` 与本节取代 M4 详细实施计划中历史性的“单智能体”“逐 Task 单独授权”“提交并停止”等执行节奏描述。M4 Task 顺序、依赖、文件范围、TDD 步骤、验证门禁、Frozen Decisions、Locked Implementation Parameters 和 Acceptance Criteria 仍保持批准状态，不因本次迁移而改变。

## Scope / Non-Goals

### Scope

- 恢复并维护 M4 的可信 Goal 状态。
- 以已批准的 V0.1 与 M4 设计为架构依据，以仓库现实为完成证据。
- M4 覆盖无注册公开演示、虚构演示身份、受控 PWA 离线与更新、隐私说明、同源静态 Web 与单实例 Fastify 部署边界、安全响应头、真实环境验证、可回滚部署证据。

### Non-Goals

- 不扩展到网购退款纠纷以外的场景。
- 不增加账号、云同步、服务端业务数据持久化、共享 AI Key、自动投诉、法律结论、遥测、广告或用户画像。
- 不把 M5 用户研究、匿名指标或第二场景设计并入 M4。
- 本次 execution-policy migration 不实现任何 M4 Task，不修改生产代码，也不执行部署、发布或 push。

## Confirmed Facts

- V0.1 只支持网购商品质量、破损或描述不符且商家未妥善处理的材料整理场景；本地优先、无 AI 可用、AI 候选须用户确认、API Key 仅驻留页面会话内存是仓库强制边界。依据：`AGENTS.md`、`docs/superpowers/specs/2026-07-29-youju-v0.1-design.md`。
- M1、M2、M3 的实施计划复选项均已关闭，仓库包含对应实现、测试、威胁检查与完成提交。
- 2026-08-17 在 `371bbd6082daa071f535c8113fbe9c5bf0c6596a` 上重新运行 `pnpm verify` 成功：54 个 Vitest 文件、310 个测试通过；Playwright 112 个通过、8 个跳过；fixture、构建、lint 和 typecheck 通过。
- 同日 `pnpm check:forbidden-content`、`pnpm test:ai-contract`（5 文件、34 测试）和 `pnpm eval:golden-case` 通过；评测使用虚构固定数据，未调用真实 Provider。
- M4 设计方向已确认，D-01 至 D-06 有 2026-08-13 用户批准记录。依据：`docs/superpowers/specs/2026-08-13-youju-m4-public-demo-deployment-design.md`。
- M4 详细实施计划已由用户于 2026-08-17 正式批准；该批准不改变冻结架构、Locked Implementation Parameters、Task 顺序或产品边界。
- M4 Task 1–10 已完成实现与验证：领域模型与 IndexedDB v4 已支持显式演示身份、加载 journal 和低敏偏好；公开夹具使用 template token、四个虚构小型材料及严格校验；演示加载现具备同源读取、quota preflight、UUID 重写、OPFS/IndexedDB 分阶段持久化、逐字段 readback、幂等/并发隔离、可信恢复与仅演示事件重置；正式 PDF、CSV、HTML、ZIP、目录及下载文件名均按 `CaseEvent.dataOrigin` 确定性标记演示数据；首次引导与浏览器持久化请求现仅记录低敏偏好；公开首页、持久演示横幅、隐私/关于/反馈页及用户可达的全量本地删除已经完成；PWA 已改为提示式更新，具备显式 idle/offline_ready/update_available/updating 状态机、活动门控、10 秒激活/空闲回退与严格离线壳；路由级懒加载与 `check:web-budget` 门禁已落地（首屏 gzip 125.7 KiB、应用壳预缓存 765.6 KiB，均低于预算），生产构建不发布 sourcemap；生产 Fastify 边界已加固（显式受信代理 CIDR 启动校验、Origin/Fetch Metadata 同源策略、releaseId 健康响应、有界优雅关闭、日志去 IP/User-Agent 白名单序列化）。Task 11 及之后的同源生产打包、安全响应头与部署资产尚未开始。
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
- M4 Public Demo and Deployment：`IN PROGRESS`；readiness 为 `APPROVED / READY`。Task 1–10 已验收，生产真实环境验证和部署尚未开始。
- M5 Validation：`BLOCKED`。只有 M4 发布证据完整后才能开始。

## Current Milestone

M4 Public Demo and Deployment — `IN PROGRESS`；`APPROVED / READY`

Canonical architecture evidence：`docs/superpowers/specs/2026-08-13-youju-m4-public-demo-deployment-design.md`。

Approved implementation sequence：`docs/superpowers/plans/2026-08-13-youju-m4-public-demo-deployment-plan.md`。

Next Action：M4 Task 11 — Add Portable Same-Origin Production Packaging and Security Headers。Task 10 已通过 API 90/91 测试、ai-contract、forbidden-content、typecheck/lint，并完成安全侧重独立 Review（PASS，3 项加固采纳、2 项结转 Task 13 部署文档）。

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

- 入口链外的懒加载 chunk 仍会被 SW 预缓存（应用壳 765.6 KiB ≤ 2 MiB 预算内）；若未来 eager 视图静态引入字体/worker 级资产，`check:web-budget` 已将 chunk `assets` 计入首屏门禁（Review 加固）。
- Playwright 离线仿真在 SW 服务的 reload 后 `navigator.onLine` 复位，生产 E2E 通过显式派发 offline 事件驱动控制器监听路径；真实断网场景由浏览器原生事件覆盖。
- Fastify 默认不信任代理且使用 `request.ip` 做进程内保护；反向代理后需要显式受信 CIDR，直接设 `true` 会扩大伪造风险。
- 当前开发服务器 E2E 不能证明生产 Service Worker、缓存头、安全头、HTTPS 代理或发布回滚。
- 真实设备、国产浏览器、Provider、国内网络与运营合规条件尚未验证，不能由代码或历史计划替代。
- 用户浏览器业务数据没有服务端备份；公开说明、持久化存储提示和用户主动导出必须保持一致。
- 当前 `/about` 在 Task 11 生成正式 `release.json` 前诚实显示开发构建/发布编号尚未生成；不得提前把该降级状态当作生产发布证据。

## Blockers

- M4 Task 10 当前没有未解决的设计、计划或分支 readiness blocker；已知后置 MINOR 已记录（见下）。
- M4 Task 14/15：分别需要真实设备/Provider 授权和公开部署目标/外部操作授权。
- M5：受 M4 完整验收与公开部署证据阻塞。

## Known Deferred Findings

- Task 7 独立 Review 5 条 MINOR（后置）：`PrivacyView.vue:24` 失败提示的英文残留标记未中文化；全局页脚裸 `<a>` 全量刷新且与首页导航重复；`no-ai-core.spec.ts:45` 未显式断言引导可见；`FeedbackTemplate.vue` 消毒保留 C1 控制字符且 slice 可能切断代理对；`HomeView.vue` `openDemo` 缺 busy 防重（幂等）。
- Task 8 Review：`endActivity` 的 `Math.max(0, …)` 钳制是防御性设计（接受）；`waiting === null` 时直接 reload 已论证安全并有测试覆盖（接受）。
- Task 10 Review（结转 Task 13 部署文档）：受信代理必须设置 `X-Forwarded-Proto` 并过滤客户端透传（否则生产 https 同源请求会被误拒）；dev 模式 `/health` 的 `dev-build` releaseId 语义需在部署文档注明；跨站请求携带非法 body 时现在也统一 403（origin 检查提前到 onRequest，已修复）。

## Verified Progress

- 2026-08-17：完成 Existing Project Goal Onboarding / State Reconstruction；未创建子智能体，未执行任何 M4 实现 Task。
- 2026-08-17：确认 Node.js `v24.19.0`、pnpm `10.34.0`。
- 2026-08-17：`pnpm verify` 通过；Vitest 54/54 文件、310/310 测试通过，Playwright 112 通过、8 跳过，lint、typecheck、fixture、build 通过。
- 2026-08-17：`pnpm check:forbidden-content`、`pnpm test:ai-contract`（34/34）和 `pnpm eval:golden-case` 通过。
- 2026-08-17：只读核对 PWA、领域模型、公开 UX、Fastify、部署资产和测试目录，确认 M4 生产实现为 `NOT STARTED`。
- 2026-08-17：初始化本文件；未复制 M4 设计或实施计划全文，二者继续作为 canonical evidence。
- 2026-08-17：用户正式批准 M4 详细实施计划；Current Phase 转入 `EXECUTION`，M4 readiness 标记为 `APPROVED / READY`，实现保持 `NOT STARTED`。
- 2026-08-17：完成 M4 Execution Readiness Checkpoint 的文档状态与无历史重写分支对齐；下一步固定为 M4 Task 1，尚未执行。
- 2026-08-18：执行策略迁移为 `AUTONOMOUS WITH HARD GATES`；允许 bounded named subagents、保持 One Writer、允许 verified local commits 和 Task 验收后自动续行，外部操作与真实 Provider 调用继续受 Hard Stop 授权边界保护；未执行 M4 Task 1。
- 2026-08-18：M4 Task 1 完成。有效 RED 证明旧 Schema、操作日志与普通创建缺少演示身份契约；实现 `CaseEvent` 判别身份、`demo_case_load`、schema v2 普通创建、仅对完整缺失字段的 legacy 读投影兼容，以及精确黄金演示夹具校验。相关 Vitest 11 文件 71 测试、`pnpm validate:fixtures`、`pnpm typecheck` 与 `git diff --check` 通过；独立 Review 的显式损坏演示记录静默降级 MAJOR 已修复。
- 2026-08-18：M4 Task 2 完成。真实 Chromium RED 以缺少 v4 store、durable backfill 与偏好 repository 的 5 个目标失败证明行为未实现；新增 IndexedDB v4 cursor migration、严格单例偏好 repository、显式全量删除和单事件隔离。Vitest 删除测试 9/9、Chromium 迁移/偏好/删除 9/9、Web package 测试 97/97、Web typecheck 和 forbidden-content 检查通过；独立 Review 的 3 个 MAJOR 已修复并复审关闭。
- 2026-08-18：M4 Task 3 完成。有效 RED 证明公开 parser、校验脚本、命令与资产缺失；新增精确 `m4-ecommerce-refund-demo-v1` manifest、四个共 126688 bytes 的虚构材料、template token 引用闭包、手工确认事实/时间线/陈述、路径与全目录 allowlist、SHA-256/size/预算校验及公共演示隐私扫描。相关 Vitest 3 文件 24 测试、fixture/public-demo/forbidden validator、Web build、root typecheck、lint 与 `git diff --check` 通过；独立 Review 的 3 个 MAJOR 与 1 个 MINOR 已修复并最终 PASS。
- 2026-08-18：M4 Task 4 完成。有效 RED 由缺失 demo service/loader 模块导致；实现固定同源 fixture 读取、quota preflight、全实体 UUID v4/token 引用重写、journal 驱动的 OPFS/IndexedDB 写入、逐实体逐字段及 blob 闭包 readback、顺序与并发幂等、可信中断清理和仅匹配演示事件的 verified reset。Web 23 文件 129 测试、Task 目标 24/24、Chromium public-demo/verified-deletion/evidence-import 3/3、root typecheck、lint、public-demo/forbidden validator 与 `git diff --check` 通过；独立 Review 的 3 个 MAJOR 已修复并复审关闭。
- 2026-08-18：M4 Task 5 完成。有效 RED 以 PDF/CSV/HTML/ZIP/下载名缺少演示标记的 5 个目标失败证明行为未实现；新增单一 `CaseEvent.dataOrigin` 导出策略、PDF 每 section 与每页警示、CSV `数据性质`、HTML 三处警示、`DEMO-` ZIP/目录与 `DEMO-README.txt`，并保持真实事件既有命名和内容边界。document-export/Web 5 文件 29 测试、Chromium 演示与真实导出 2/2、root typecheck、lint 与 `git diff --check` 通过；独立 Review 的跨页警示及真实浏览器无污染 2 个 MAJOR 已修复并复审关闭。
- 2026-08-18：M4 Task 6 完成。有效 RED 由缺失 persistence adapter/guide/notice 及 capability 字段导致；新增 `persisted()`/`persist()` 确定性适配、低敏结果保存、三步以内可跳过原生 modal 引导、诚实的 granted/denied/unsupported 状态与手动 denied retry。自动请求仅发生于真实事件创建或首个成功真实材料导入，空白首页、演示加载/导入、失败与重复材料均不触发；全量删除偏好后引导重现。Web 25 文件 141 测试、Task 目标 13/13、Chromium 2/2、Web typecheck、root lint 与 `git diff --check` 通过；独立 Review 的 unsupported 文案/无效 retry 与 modal 焦点管理 2 个 MAJOR 已修复并复审关闭。
- 2026-08-18：M4 Task 7 完成。有效 RED 由公开页面、路由、演示横幅和当前版本入口缺失导致；新增无需注册/无需 AI 的双入口首页、显式打开/重置演示、按 `CaseEvent.dataOrigin` 持久显示的演示横幅、隐私/关于/本地反馈页面，以及要求精确确认并执行删除核验的用户可达全量本地删除。Task 目标单测 10/10、Web 27 文件 150/150、Chromium public-demo/no-ai 3/3、Web typecheck/build、root lint 与 `git diff --check` 通过；真实设备矩阵、真实 Provider 和发布编号均保持诚实未验证状态；独立 Review 未发现 BLOCKER 或 MAJOR。
- 2026-08-18：M4 Task 8 完成。有效 RED 由 autoUpdate 配置、缺少 prompt 状态机/生产 PWA 测试装备导致；实现 prompt 注册与 idle/offline_ready/update_available/updating 状态机、模块级活动门控（导入/导出/AI 任务/未决 autosave 写入）、10 秒激活与空闲回退、dispose 全路径恢复、严格离线壳（应用壳 + 显式 demo allowlist 预缓存，`/ai/*`、`/health` 经 `navigateFallbackDenylist` 排除，运行时缓存为空）、离线/更新状态横幅与生产 Playwright 装备。目标单测 18/18、Web 28 文件 169/169、生产 Chromium E2E 2/2（3 次连跑稳定）、开发 E2E 子集 5/5、root typecheck/lint 与 `git diff --check` 通过；两轮独立 Review（首轮 FAIL 的 BLOCKER 孤儿计数与 MAJOR 挂起路径均已修复），re-check PASS 无未决 finding。偏差（受 Task 8 Interfaces 驱动的最小文件面扩展，已记录）：`workbox-window` 显式 devDependency、`tsconfig.json` types、`use-autosave.ts`/`MaterialsView.vue`/`ExportView.vue`/`AiAssistantView.vue` 活动上报、`FactsView.vue` dispose 补全、`playwright.config.ts` testIgnore。
- 2026-08-18：修复 Task 6/7 引入的根级 e2e 门禁回归（独立 commit，先于 Task 9）。三族根因：Task 6 首次引导对话框异步出现拦截旧 UI 测试点击（9 个 spec 增加确定性 dismiss helper：等待对话框可见→跳过→等待隐藏）；Task 7 首页文案变更遗留陈旧断言（home-and-diagnostics）；Task 6/7 应用在首页持有 IndexedDB 连接破坏 legacy 播种/删除重置（case-repository 5 个测试与 ai-repository 重置改在静态演示资产页执行，并修正 v3→v4 陈旧版本断言）。WebKit 构建无 OPFS/StorageManager persist 的 spec（public-demo-flow×2、public-demo-storage、first-use-and-storage×2）按仓库既有能力 skip 惯例标记。修复后完整 `pnpm e2e` 130 通过 / 14 跳过，`pnpm verify` 全绿。
- 2026-08-18：M4 Task 9 完成。有效 RED 由预算脚本（首屏 752 KiB 超限）与 lazy-boundaries 契约测试（重路由仍静态导入）双重失败证明；实现 router 级懒加载（export/ai/ai-settings/ai-review 移出静态导入，export-service 与 pdf-page-renderer 经其唯一调用方自然移出入口链，未做非必要修改）、`build.manifest`/`sourcemap: false`、`check:web-budget` 门禁脚本（manifest 入口链 + index.html gzip ≤ 500 KiB；sw.js precache 排除演示附件 ≤ 2048 KiB；超限具名报错）与 package 命令。首屏 gzip 752→125.7 KiB、应用壳 765.6 KiB；lazy-boundaries/export/ai-assistant 11/11、Web 29 文件 172/172、public-demo-flow 2/2、生产 PWA E2E 2/2、root typecheck/lint/diff-check 通过；独立 Review PASS，2 项加固（入口链计入 chunk assets、多入口显式报错）已采纳。
- 2026-08-18：M4 Task 10 完成。有效 RED 由缺失生产配置解析、同源策略与 releaseId 健康响应导致；实现 `parseProductionConfig`（RELEASE_ID 正则校验 + TRUSTED_PROXY_CIDRS 显式 IP/CIDR 校验，拒绝 true/通配/空/畸形/0.0.0.0/0、::/0）、`isSameOriginAiRequest`（sec-fetch-site cross-site 优先拒绝 + Origin 同源 URL 归一化比较，onRequest 阶段先于 body 校验）、`/health` 仅返回 status/releaseId、req 日志白名单序列化（去 raw IP 与完整 User-Agent，保留 requestId/taskType/providerPreset/statusClass/durationMs/errorCode）、SIGTERM/SIGINT 有界优雅关闭（10s 强制退出，信号在 listen 成功后注册）。API 11 文件 91/91、ai-contract 34/34、API/root typecheck、lint、forbidden-content 与 `git diff --check` 通过；安全侧重独立 Review PASS（无 BLOCKER/MAJOR），采纳 3 项加固（onRequest 提前、信号注册时机、边界测试），2 项结转 Task 13 部署文档。

## Repository and Verification State

- Branch：`codex/m4-public-demo`。
- Task 1 起始 baseline：`69a9ab20830f757e1feda46339f43cd77a0083b5`。
- Task 1 acceptance commit：`c1c2a62fb94416f5f3da82c27a0f780e31fcb756`，`feat: define M4 demo case identity`。
- Task 2 acceptance commit：`d8a9f7078686a58789d91425d7008ddae316bdc8`，`feat: migrate M4 local preferences`。
- Task 2 lint repair commit：`908b02ad5e9930761b2c0b771125e072ef12de21`，`test: keep legacy migration fixtures lint-clean`；Chromium case repository 7/7、root typecheck、lint 通过。
- Task 3 acceptance commit：`01e3af2e69a97a66671aa129fed558741e6dece7`，`feat: add validated public demo fixture`。
- Task 4 acceptance commit：`94d5fb7d68dd1259aed18605ed9b09f6b06410fd`，`feat: load and reset fictional demo cases`。
- Task 5 acceptance commit：`5b0b9d5baf9b6e22f97fbb3563588a692c6871d9`，`feat: mark all fictional demo exports`。
- Task 6 acceptance commit：`62524c17e83b74416e6475d467834f05203104ca`，`feat: explain first-use local storage`。
- Task 7 acceptance commit：`5974ea9ed975e3af6f3ee019e3c497d1ca5e122`，`feat: add M4 public demo experience`。
- Task 8 acceptance commit：`c08dbcb222a245e4be8549831bf2b73655b2482e`，`feat: add controlled PWA offline updates`。
- e2e 门禁修复 commit：`5408cfb1ac70ded0b19c1f2403998bf93ecb315e`，`test: restore full e2e gate after public UX regressions`。
- Task 9 acceptance commit：`1805a76b308643a6f6facd8cd3163618168b75f1`，`perf: enforce M4 web build budgets`。
- Task 10 acceptance commit：本次 `PLAN.md` 更新随 `feat: harden M4 production API boundary` 提交；未 push、未部署。
- 当前自动化证据：Task 1 相关 71 测试；Task 2 Web 97/97 与 Chromium 9/9；Task 3 相关 24/24 与四个公开资产 126688 bytes；Task 4 Web 129/129、目标 24/24、Chromium public-demo/verified-deletion/evidence-import 3/3；Task 5 document-export/Web 29/29 与 Chromium demo/user export 2/2；Task 6 Web 141/141、目标 13/13 与 Chromium first-use/storage 2/2；Task 7 Web 150/150、目标 10/10 与 Chromium public-demo/no-ai 3/3；Task 8 Web 169/169、目标 18/18 与生产 Chromium offline/update 2/2；Task 9 Web 172/172、目标 11/11 与预算（首屏 125.7 KiB / 应用壳 765.6 KiB）达标；Task 10 API 91/91 与 ai-contract 34/34；根级完整 `pnpm e2e` 130 通过 / 14 跳过，`pnpm verify` 全绿。
