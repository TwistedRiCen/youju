# AGENTS.md

## 1. 项目定位

有据（YouJu）帮助中国普通用户保存原始材料、整理事实、建立时间线、识别材料缺口，并导出可提交、可打印、可长期保存的材料包。

V0.1 仅支持：

> 网购商品出现质量、破损、描述不符等问题，商家拒绝退款或未妥善处理。

本项目只帮助用户整理事实和材料，不提供：

- 法律咨询或法律结论；
- 赔偿计算、胜诉率或投诉成功率预测；
- 自动投诉、自动维权或商家曝光；
- 商家评分、黑名单或用户社区。

未经新的设计评审和用户批准，不得扩展到劳动、租房、校园、医疗、债务等其他场景。

---

## 2. 必读文档与优先级

开始任何 Goal 或 Task 前，按顺序阅读：

1. `AGENTS.md`
2. `docs/superpowers/specs/2026-07-29-youju-v0.1-design.md`
3. `docs/superpowers/plans/2026-07-29-youju-v0.1-master-plan.md`
4. 当前 Task 对应的详细计划
5. 与当前修改直接相关的测试、README 和现有实现

约束优先级：

本文件不覆盖 Codex 平台、系统级或用户配置的全局指令。

项目上下文内的约束优先级为：

1. 用户在当前任务中明确批准的范围和操作；
2. 仓库根目录及适用范围内更深层的 `AGENTS.md`；
3. 已批准的产品设计规格；
4. 当前里程碑和 Task 实施计划；
5. 包内文档、测试和现有实现惯例。

当前提示词可以缩小任务范围，但不得突破产品、安全、隐私和架构边界。

如上层指令与项目指令存在冲突，遵循上层指令并在最终报告中明确说明，不得静默忽略任一约束。

发现要求冲突、关键信息缺失、工具版本不兼容或验证持续失败时，停止执行并报告，不得自行更换技术路线。

---

## 3. 核心产品边界

### 3.1 本地优先

- 原始材料默认保存在用户设备。
- 不默认上传用户事件、文件、事实或时间线。
- 服务端不得长期保存上述数据。
- 未经评审不得将本地优先改为云端优先。

### 3.2 无 AI 也必须可用

未配置 AI、模型不可用或用户关闭 AI 时，用户仍应能够完成：

- 创建事件；
- 导入和分类材料；
- 手工填写并确认事实；
- 建立时间线；
- 查看缺失材料；
- 编辑事实陈述；
- 导出材料包；
- 删除本地数据。

AI 是可选增强，不是核心流程依赖。

### 3.3 AI 只能产生候选内容

AI 可以辅助分类、提取信息、生成时间线候选、缺失提醒和陈述草稿。

AI 不得：

- 自动确认或覆盖正式事实；
- 删除或修改原始文件；
- 生成法律责任、赔偿或成功率结论；
- 自动发送投诉或联系第三方。

所有 AI 候选内容必须：

- 关联来源文件；
- 记录分析版本和审核状态；
- 由用户确认后才能进入正式输出。

未确认、已拒绝、存在冲突或无来源的内容不得进入 PDF、ZIP、CSV、HTML 或正式事实陈述。

### 3.4 API Key

API Key 默认只保存在当前页面会话内存，不得写入：

- 数据库；
- IndexedDB、OPFS、localStorage 或 Cookie；
- 日志、错误追踪或统计事件；
- 队列、缓存、导出文件或测试快照。

未经新的安全设计评审，不得增加 API Key 持久化功能。

### 3.5 服务端边界

服务端仅允许承担：

- 健康检查；
- 规则版本；
- 静态配置；
- 可选 AI 临时转发；
- 经批准的低敏运行指标。

不得默认引入：

- 服务端业务数据库；
- 消息队列；
- 云对象存储；
- 用户画像；
- 用户业务数据持久化。

浏览器端 IndexedDB、OPFS 和 Web Crypto API 属于已批准的本地方案。

---

## 4. 工程原则

### 4.1 TDD

所有具有运行时行为的变更遵循：

1. 写最小失败测试；
2. 实际运行并确认失败原因正确；
3. 编写最小实现；
4. 运行目标测试；
5. 运行受影响包测试；
6. 运行当前 Task 规定的质量门禁；
7. 全部通过后提交。

有效 RED 必须由目标行为尚未实现导致，不能是测试框架、依赖、路径或环境故障。

纯文档、注释、`.gitignore`、许可证和不改变行为的格式调整不强制 TDD，但仍须执行相关检查。

### 4.2 最小改动

- 每个 Task 只修改该 Task 要求的内容。
- 当前 Task 未完成验收前，不得混入依赖尚未就绪的后续 Task 内容。
- 不顺手重构、批量改名或调整无关结构。
- 不升级无关依赖。
- 不创建空包、占位接口、占位按钮或虚假成功实现。
- 不用未决占位项代替当前 Task 应完成的内容。

优先使用纯函数、显式输入输出、严格类型和可独立测试的模块。

### 4.3 确定性优先

以下能力必须由确定性代码实现：

- SHA-256 和完整性检查；
- 状态流转；
- 规则评估；
- 时间线排序与冲突检测；
- 导出前校验；
- 正式事实过滤；
- PDF、CSV、HTML 和 ZIP 结构；
- 数据删除和删除核验；
- API Key 生命周期；
- AI 输出 Schema 校验。

AI 不得替代这些能力。

### 4.4 安全默认值

- 所有外部输入均视为不可信。
- 文件扩展名、MIME 和文件签名应交叉检查。
- 设置文件数量、单文件大小和事件总大小上限。
- 不记录完整请求体、原始文件、API Key 或敏感模型输入。
- AI 返回必须通过运行时 Schema 校验。
- 不引入不必要的第三方脚本、远程字体、分析 SDK 或追踪资源。
- 新依赖必须说明用途、许可证、维护状态和必要性。
- 不得通过关闭类型、安全或测试检查来解决问题。

Service Worker 只缓存应用静态资源，不得缓存、同步或上传用户材料、API Key、AI 请求或响应。

未经批准不得引入埋点、广告、用户画像、会话回放或远程错误追踪。

---

## 5. 技术基线

- Node.js 24 LTS；
- pnpm 10.34.0；
- TypeScript strict；
- ESM；
- pnpm workspace；
- Vue 3；
- Vite 8；
- Fastify 5；
- TypeBox / JSON Schema；
- Vitest；
- Playwright；
- IndexedDB；
- OPFS；
- Web Crypto API。

使用 `packageManager` 和 `pnpm-lock.yaml` 固定版本。

不得擅自替换为 React、Nuxt、NestJS、Spring Boot 或其他技术路线。

不得引入 Nx、Turborepo、Lerna、服务端数据库、消息队列或云对象存储。

如 Corepack 无法运行 pnpm 10.34.0，可以临时执行指定版本，但不得静默升级至 pnpm 11，且必须在结果中说明。

---

## 6. 模块边界

- `apps/web`：Vue Web/PWA、页面、组件和浏览器适配。
- `apps/api`：无状态 API、健康检查、规则版本和 AI 临时转发。
- `packages/domain`：领域 Schema、类型、枚举和状态。
- `packages/rule-engine`：规则 Schema、加载、校验和评估。
- `packages/ai-core`：AI 契约、候选内容、来源和分析版本。
- `packages/evidence-*`：摘要、本地存储和文件检查。
- `packages/document-export`：PDF、CSV、HTML 和 ZIP 导出。
- `packages/test-support`：黄金案例和测试辅助。
- `rules`：版本化规则数据。
- `fixtures`：完全虚构的黄金案例。
- `tests`：跨包集成、E2E 和安全回归测试。

仅在对应 Task 开始时创建模块，不得提前创建空包。

包之间只能通过公开入口导入，禁止穿透其他包的 `src`。

正确：

    import { CaseEventSchema } from '@youju/domain'

禁止：

    import { CaseEventSchema } from '../../domain/src/schemas'

---

## 7. 数据规则

- ID 使用 UUID v4。
- 时间持久化为 ISO 8601 UTC 字符串。
- 人民币金额使用整数分或十进制定点字符串，不使用浮点数。
- AI 分析每次生成新的 `AnalysisVersion`，不得覆盖历史版本。
- `ConfirmedFact` 只能由用户确认操作产生。

`FactCandidate.reviewStatus` 仅允许：

- `pending`
- `confirmed`
- `edited_and_confirmed`
- `rejected`
- `conflicted`

`TimelineEntry.timePrecision` 仅允许：

- `minute`
- `date`
- `approximate`
- `unknown`

正式输出只能使用用户已确认事实、用户手工确认内容、确定性规则结果和用户填写的期望处理结果。

---

## 8. 测试与质量门禁

- 领域逻辑：Vitest Node。
- 浏览器存储和文件能力：真实浏览器或 Playwright。
- API：Fastify `inject()`。
- AI：Mock Server 或固定响应，不调用真实付费模型。
- E2E：至少 Chromium；关键本地存储流程增加 WebKit。
- 黄金案例必须完全虚构，不包含真实用户、商家、手机号、地址、订单或聊天记录。

根级门禁：

    pnpm lint
    pnpm typecheck
    pnpm test
    pnpm validate:fixtures
    pnpm build
    pnpm e2e

里程碑完整验证：

    pnpm verify

不得：

- 跳过失败测试；
- 删除测试以通过构建；
- 降低 TypeScript 严格度；
- 关闭 ESLint 规则掩盖问题；
- 修改正确测试去迎合错误实现；
- 将未运行的命令描述为通过。

---

## 9. Git 与执行方式

### 9.1 执行模式

默认执行模式为：

> `AUTONOMOUS WITH HARD GATES`

当 Goal、Architecture、Frozen Decisions、Implementation Plan 和 Acceptance Criteria 已经批准且稳定时，Codex 可以在该 Goal 范围内持续执行。普通工程问题，包括测试失败、编译失败、局部实现修正、Review finding、可逆设计细节和回归修复，由 Codex 自行诊断、修复并重新验证。

一个 Task 同时满足以下条件后，可以选择下一个 dependency-ready Task 并继续，不得仅因该 Task 完成而停止：

- acceptance criteria satisfied；
- relevant verification passed；
- blocking review findings resolved；
- `PLAN.md` 已同步真实状态。

Task 顺序、依赖、文件范围和验收门禁继续以已批准实施计划为准。不得在当前 Task 验收前混入后续 Task，也不得提前创建后续 Task 的目录、依赖、接口、测试、实现或占位内容。历史计划中的“单智能体”“逐 Task 单独授权”“提交并停止”等执行节奏描述，由本节与根 `PLAN.md` 的当前 Execution Policy 取代；这不改变计划中的产品范围、架构、Frozen Decisions、Locked Implementation Parameters、Task 内容、依赖或 Acceptance Criteria。

### 9.2 Hard Stop

只有以下情况要求停止并请求人类决策或授权：

1. PRODUCT SCOPE CHANGE；
2. material ARCHITECTURE CHANGE；
3. 必须重新打开 Frozen Decision；
4. security/privacy boundary 发生实质变化；
5. irreversible or destructive operation；
6. existing user work cannot be safely preserved；
7. required credentials or secrets are unavailable；
8. real Provider invocation requires authorization；
9. external deployment or production mutation；
10. push、PR、merge、tag 或 release；
11. required external dependency is unavailable；
12. Goal cannot be satisfied under approved constraints。

普通测试失败、Review finding、实现困难或可逆的局部设计选择不是 Hard Stop。

### 9.3 Role-Based Subagents

允许在边界清晰的工作上使用具名 subagent。优先角色为：

- `explorer`：只读仓库探索与调用链证据；
- `docs_researcher`：只读官方文档与版本证据；
- `test_analyst`：只读测试、回归、边界与缺口分析；
- `reviewer`：独立只读 Review；
- `routine_worker`：仅承担已冻结、已理解且文件范围明确的实现。

只有独立工作能够显著降低不确定性、减少主上下文污染、提供独立证据或缩短墙钟时间时才委派；不得仅因为 Agent 可用而创建。优先委派仓库探索、文档核验、测试与回归分析、兼容性或安全调查以及独立 Review。

默认协作模式为：

> Many Readers → Evidence Convergence → One Writer → Verification → Independent Review

- 并发只读 agents 不超过 3；
- active writers 不超过 1；
- 不得并行修改重叠的核心文件；
- subagent 必须遵守本仓库的产品、安全、隐私、最小改动、测试和外部操作边界；
- 不为 Multi-Agent 创建 worktree。

### 9.4 Writer Policy

Main Sol Thread 用于歧义较高、架构敏感、安全或隐私敏感、跨模块复杂实现和困难调试。

`routine_worker` 仅可在以下条件全部满足时担任 Writer：

- scope 已冻结；
- behavior 已理解；
- 文件和修改面有明确边界；
- 没有未解决的架构、安全或隐私决定。

无论由谁写入，始终保持 `ACTIVE WRITERS <= 1`。Writer 必须保留现有用户工作，不得回退或覆盖其他人的修改。

### 9.5 Independent Review

significant implementation 在主 verification 后使用具名 `reviewer` 做独立只读 Review。Reviewer 不修改代码、不获得预设 PASS 结论，并检查 correctness、security、acceptance、regressions 和 missing tests。

BLOCKER 或 MAJOR finding 由当前 Writer 修复，随后重新运行相关验证；修复 materially changes behavior 时重新 Review。

### 9.6 Git、Commit 与外部操作

- 默认采用 Inline Execution，不使用 Git worktree；除非有明确理由并获得用户授权，不得创建、切换或删除 worktree。
- 当前已批准 Goal 范围内允许创建 verified local commits；每个完成并验收的 Task 原则上形成一个独立提交。
- Commit 前必须确认目标验证和所需回归通过、Review disposition 完成、diff 已检查且 `PLAN.md` 状态同步。
- 不得把多个未验收 Task 混入同一提交；local commit 完成后可以继续下一个 dependency-ready Task，不需要人工 checkpoint。
- CI/CD 配置只能在已批准实施计划明确包含该变更的 Task 中修改。
- push、PR、merge、tag、release、deploy、production mutation 和删除远端分支默认禁止；首次真正需要时进入 Hard Stop 并请求明确授权。
- 真实 Provider 调用必须获得明确授权；自动化测试和 CI 只使用 Mock Server 或固定响应。
- M1 历史分支为 `feat/m1-foundation`；M1 完整验收前不得合并到 `main` 的历史约束不改变。

---

## 10. Codex 完成报告

每完成一个 Task，必须在 `PLAN.md` 记录或在 Goal 完成 / Hard Stop 报告中提供：

1. RED 阶段命令、失败原因以及为何是有效失败；
2. 完成内容和未完成内容；
3. 所有新增、修改和删除文件；
4. 新增的 Schema、类型、接口、规则或行为；
5. 实际运行的每条验证命令及结果；
6. 当前目录、分支、完整提交号和提交信息；
7. 提交后的 `git status --short`；
8. 风险、偏差或未解决问题；
9. 下一 dependency-ready Task、Goal Acceptance 状态或触发的 Hard Stop。

纯文档 Task 应说明不适用 RED，并列出实际执行的文档和回归检查。

不得用“应该通过”“理论上可用”或“大概率没问题”代替真实验证结果。

---

## 11. 完成定义

只有以下条件全部满足，才能声明 Task 完成并进入下一 dependency-ready Task：

- 有效 RED 已被观察，或明确属于不适用 TDD 的任务；
- 最小实现完成；
- 目标测试和受影响测试通过；
- 当前计划要求的质量门禁通过；
- `git diff --check` 通过；
- 没有提交敏感信息；
- 没有扩大范围或提前实现后续内容；
- 已创建符合要求的独立提交；
- 提交后工作区状态符合预期；
- `PLAN.md` 已同步验收证据、Review disposition 和下一步；
- 已完整记录真实结果。

Task 完成不等于 Goal 完成。只有 `PLAN.md` 中全部 Goal Acceptance Criteria 已验证、无未解决 blocker、最终系统验证和独立 Review 完成时，才能声明 Goal 完成；否则继续执行或按 Hard Stop 规则请求人类决策。
