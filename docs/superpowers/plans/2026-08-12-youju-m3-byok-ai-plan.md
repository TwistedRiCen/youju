# 有据 M3 BYOK AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task with checkpoints. Project policy requires single-agent Inline Execution and prohibits subagent-driven execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保持 M2 无 AI 闭环、本地优先和正式数据隔离的前提下，交付通过 Fastify 临时转发的 BYOK AI 分类、事实提取、时间线候选、陈述草拟、用户审核和可重复评测。

**Architecture:** 浏览器只在当前页面内存保存 Provider 配置和 API Key，从 OPFS 原件派生受限图片或 PDF 页面图，并在用户授权后调用无状态 Fastify 转发。`packages/ai-core` 定义 Provider 无关契约、来源映射、校验、冲突和审核资格；IndexedDB 只保存分析版本、结构化候选和审核状态，正式写入仍由 M2 领域模型和本地事务控制。

**Tech Stack:** Node.js 24 LTS, pnpm 10.34.0, TypeScript strict, ESM, Vue 3, Vite 8, Fastify 5, TypeBox / JSON Schema, Vitest, Playwright, IndexedDB, OPFS, Web Crypto API, Node `https` / `dns`, `pdfjs-dist@6.2.108`.

## Global Constraints

- V0.1 只支持 `ecommerce_refund`；不增加法律判断、赔偿、结果预测、自动投诉或其他场景。
- M2 无 AI 路径必须完整可用；AI 未配置、关闭、失败、取消或能力不足时不得阻断手工流程。
- AI 请求只能经过 Fastify 临时转发；浏览器不得直连 Provider。
- API Key 只保存在当前页面 JavaScript 内存和当前 HTTPS 请求调用栈，不得进入任何持久化、日志、快照、导出、缓存或队列。
- 不发送原始文件字节；图片和 PDF 只发送浏览器内派生副本，派生字节不得落盘。
- 发送到 API 和 Provider 的来源只使用本次任务随机 `sourceToken`，不得包含稳定 `caseId`、`evidenceId`、事件标题或原始文件名。
- OpenAI 预设使用 Responses API；阿里云百炼、DeepSeek、SiliconFlow 和自定义 Provider 使用 Chat Completions。
- 自定义 Base URL 仅允许 HTTPS 默认 443 端口、无凭据/查询/片段/IP 字面量，且必须通过 DNS、地址范围、TLS SNI、固定已校验地址、禁重定向和禁代理检查。
- AI 只能生成候选；用户确认前不得修改分类、正式事实、正式时间线、陈述或导出输入。
- 自动化测试只使用固定响应、受控 DNS/TLS 设施或 Mock Provider，不调用真实模型或产生费用。
- 单次任务最多 10 个材料、30 页；单图派生字节最多 2 MiB；单批派生字节最多 20 MiB；单任务派生字节最多 60 MiB。
- 派生图统一为 WebP，最长边不超过 2048 像素、总像素不超过 4,000,000，初始质量 0.82，必要时按固定质量序列压缩但不低于 0.60。
- API JSON 请求体最多 32 MiB；标准化响应最多 2 MiB；连接测试超时 10 秒，文本任务 60 秒，视觉任务 120 秒，结构修复 45 秒。
- 服务端每 IP 同时最多 2 个 AI 请求、每 60 秒最多 10 个请求；进程全局同时最多 8 个 AI 请求。计数仅在内存短期保存，不形成用户画像。
- M3 首版模型名由用户手填，不实现模型列表查询；不内置易过期价格表，只展示文本 Token 粗略估算、图像像素、派生字节和批次数。
- 文本 Token 粗略估算固定为 `ceil(UTF-8 byteLength / 4)`；图像不猜测 Provider Token，只显示像素与字节。
- 结构修复最多一次，由 Fastify 在同一次任务请求内部完成；原输出和修复提示不返回浏览器、不记录、不持久化。网络、认证、限流、余额、超时和内容拒绝不自动重试。
- 每个运行时 Task 严格执行 TDD：有效 RED、最小 GREEN、目标测试、受影响包测试、Task 门禁、独立提交并停止。
- 默认单智能体 Inline Execution；不创建 worktree 或子智能体。每次只执行用户明确授权的一个 Task。
- 不修改 CI/CD、部署、PWA 缓存策略或 M4 功能；发现必须修改时停止并请求新的明确授权。
- 新依赖必须在 `docs/development/m3-dependencies.md` 记录精确版本、用途、许可证、维护状态、替代方案和采用理由。

---

## Execution Protocol for Every Task

每个 Task 开始时必须：

1. 在 `D:\Codex\youju` 按顺序阅读 `AGENTS.md`、V0.1 设计、Master Plan、M3 设计、本计划和本 Task 相关实现与测试；
2. 确认 Node 为 `v24.x`、pnpm 为 `10.34.0`，不得安装或下载另一套 Node/pnpm；
3. Task 1 从包含本计划的干净 `main` 创建 `codex/m3-byok-ai`；Task 2 及之后确认当前分支为该分支且 `git status --short` 无输出；
4. 只修改本 Task 的 `Files`，不提前创建后续 Task 文件；
5. 先写行为级失败测试并实际观察有效 RED，再写最小实现；
6. 运行本 Task 全部验证、`git diff --check` 和 `git status --short`；
7. 只勾选本 Task 已有执行证据的复选框，暂存本 Task 文件，按指定信息提交并停止；
8. 完成报告必须包含 RED 证据、文件清单、接口/行为、全部命令结果、分支、完整提交号、提交信息、提交后状态、风险，以及“未执行下一个 Task”。

本计划获用户批准后仍不等于一次性授权全部实现。用户每次明确批准一个 Task 后才执行该 Task。Task 1 创建分支后运行：

```powershell
git merge-base --is-ancestor 5242c1b0085e78e3a50bc07b92bda4f31817bb54 HEAD
```

Expected: exit code 0，证明已批准 M3 设计提交在当前历史中。不得 push、创建 PR、合并、打标签或发布。

---

## Locked Implementation Parameters

| 参数                 | M3 固定值                                                                 |
| -------------------- | ------------------------------------------------------------------------- |
| Provider 模型输入    | 用户手填，不查询远端模型列表                                              |
| 图片派生             | WebP；最长边 2048；最多 4,000,000 像素；质量序列 `0.82, 0.74, 0.66, 0.60` |
| 单图 / 单批 / 单任务 | 2 MiB / 20 MiB / 60 MiB 派生字节                                          |
| 材料 / 页面          | 每任务最多 10 个材料、30 页                                               |
| API 请求 / 响应      | JSON 最多 32 MiB / 标准化响应最多 2 MiB                                   |
| 超时                 | 连接 10 秒；文本 60 秒；视觉 120 秒；修复 45 秒                           |
| 并发与速率           | 每 IP 并发 2、60 秒内 10 次；进程全局并发 8                               |
| Token 估算           | 文本 `ceil(UTF-8 byteLength / 4)`；图像只显示像素和字节                   |
| 费用估算             | M3 不内置价格表；UI 明确显示“费用以 Provider 实际账单为准”                |
| PDF 渲染             | `pdfjs-dist@6.2.108`，本地 worker，禁网络取件和脚本能力                   |
| Provider 输出修复    | 每分析版本最多一次，不执行网络重试或模型切换                              |

改变以上参数需要先修改并重新评审本计划；不得在实现 Task 中临时变更。

---

## File Map

### Existing modules extended

- `packages/domain/src/schemas.ts`：分析版本状态、正式分类/时间线/陈述候选来源字段，以及 AI/规则置信模型分离。
- `packages/domain/src/formal-facts.ts`、`packages/domain/src/statements.ts`：候选确认产生正式事实/陈述时的确定性来源复制。
- `packages/ai-core/src/*`：Provider、任务、清单、wire/local 来源、输出、候选、冲突、审核和估算契约。
- `apps/web/src/storage/*`：IndexedDB v3、AI Repository、原子候选发布、正式写入和删除核验。
- `apps/web/src/services/*`：会话配置、派生材料、AI 客户端、任务生命周期、候选审核。
- `apps/web/src/views/*`、`apps/web/src/components/*`：AI 设置、发送预览、任务进度和候选审核。
- `apps/api/src/*`：受控目标解析、固定地址 HTTPS、Provider 适配、无状态路由、限流和日志脱敏。
- `fixtures/ecommerce-refund/case-001-transport-damage/ai/*`：完全虚构的固定模型输入/输出和评测期望。
- `tests/e2e/*`、`tests/integration/*`：Mock Provider、正式数据隔离、删除和无 AI 回归。

### New focused files and responsibilities

- `packages/ai-core/src/provider.ts`：预设、协议、能力和稳定错误码。
- `packages/ai-core/src/task-contracts.ts`：连接测试、四类 AI 任务和 wire 输出 Schema。
- `packages/ai-core/src/input-manifest.ts`：本地清单、发送投影、限制、批次和估算。
- `packages/ai-core/src/candidates.ts`：四类持久化候选和分析版本关联。
- `packages/ai-core/src/output-validation.ts`：`sourceToken` 本地映射、Schema、坐标、去重和冲突。
- `packages/ai-core/src/review.ts`：审核状态机和批量确认资格。
- `apps/web/src/storage/ai-repository.ts`：AI 持久化端口和原子正式写入命令。
- `apps/web/src/storage/indexeddb-ai-repository.ts`：IndexedDB v3 实现。
- `apps/web/src/ai/ai-session.ts`：仅内存 Provider 会话和授权失效。
- `apps/web/src/ai/derived-media.ts`：图片派生与内存释放。
- `apps/web/src/ai/pdf-page-renderer.ts`：PDF.js 本地页面渲染。
- `apps/web/src/ai/ai-api-client.ts`：Fastify 路由客户端与 Abort 传播。
- `apps/web/src/ai/ai-task-runner.ts`：分批、原子发布、顺序一键分析。
- `apps/api/src/ai/target-policy.ts`：预设目标与自定义 URL 规范化。
- `apps/api/src/ai/address-policy.ts`：DNS 地址分类和全部结果校验。
- `apps/api/src/ai/pinned-https-client.ts`：固定 IP、原 hostname SNI/证书、禁代理/重定向的 HTTPS 端口。
- `apps/api/src/ai/provider-adapters.ts`：Responses 与 Chat Completions 请求/响应标准化。
- `apps/api/src/ai/request-guard.ts`：超时、请求/响应上限、内存速率和并发。
- `apps/api/src/routes/ai.ts`：两个同步无状态 AI 路由。
- `scripts/evaluate-ai-golden-case.ts`：固定结果评测，不发网络请求。
- `docs/development/m3-dependencies.md`：PDF.js 依赖审查。
- `docs/security/m3-threat-checklist.md`：M3 信任边界、控制和验证证据。

---

### Task 1: Establish M3 Domain Provenance and Analysis Contracts

**Files:**

- Modify: `packages/domain/src/schemas.ts`
- Modify: `packages/domain/src/formal-facts.ts`
- Modify: `packages/domain/src/statements.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/domain/tests/schemas.test.ts`
- Modify: `packages/domain/tests/formal-facts.test.ts`
- Modify: `packages/domain/tests/statements.test.ts`
- Modify: `apps/web/src/services/evidence-import-service.ts`
- Modify: `apps/web/src/services/statement-service.ts`
- Modify: `apps/web/src/storage/indexeddb-case-repository.ts`
- Modify: `apps/web/src/views/TimelineView.vue`
- Modify: `apps/web/tests/facts.test.ts`
- Modify: `apps/web/tests/materials.test.ts`
- Modify: `apps/web/tests/timeline.test.ts`
- Modify: `packages/document-export/tests/pdf-renderer.test.ts`
- Modify: `packages/document-export/tests/preflight.test.ts`
- Modify: `packages/document-export/tests/zip-writer.test.ts`
- Modify: `fixtures/ecommerce-refund/case-001-transport-damage/evidence/01-order-record.json`
- Modify: `fixtures/ecommerce-refund/case-001-transport-damage/evidence/02-payment-record.json`
- Modify: `fixtures/ecommerce-refund/case-001-transport-damage/evidence/03-product-issue.json`
- Modify: `fixtures/ecommerce-refund/case-001-transport-damage/evidence/04-merchant-communication.json`
- Modify: `fixtures/ecommerce-refund/case-001-transport-damage/expected/timeline.json`
- Modify: `docs/superpowers/plans/2026-08-12-youju-m3-byok-ai-plan.md` Task 1 checkboxes only

**Interfaces:**

- Consumes: M2 `EvidenceFile`, `FactCandidate`, `ConfirmedFact`, `TimelineEntry`, `StatementDraft`, `ConfirmedStatement`, `AnalysisVersion`.
- Produces: `AiConfidenceLevel`, `FormalContentOrigin`, expanded formal provenance, persisted analysis lifecycle, and candidate-derived fact/statement builders.

- [x] **Step 1: Create the implementation branch and verify baseline**

```powershell
git switch -c codex/m3-byok-ai
git merge-base --is-ancestor 5242c1b0085e78e3a50bc07b92bda4f31817bb54 HEAD
node --version
pnpm --version
pnpm --filter @youju/domain test
git status --short
```

Expected: branch creation and ancestry check succeed; Node is `v24.x`; pnpm is `10.34.0`; domain baseline passes; status has no output.

- [x] **Step 2: Write failing domain tests**

Add exact schema and lifecycle assertions for:

```typescript
const analysis: AnalysisVersion = {
  id: analysisVersionId,
  caseId,
  taskType: 'extract_facts',
  providerPreset: 'aliyun_bailian',
  protocol: 'chat_completions',
  baseUrlFingerprint: 'sha256:fixture',
  modelName: 'fixture-model',
  promptVersion: 'extract-facts-v1',
  outputSchemaVersion: 1,
  inputManifestDigest: 'a'.repeat(64),
  inputItemCount: 2,
  inputPageCount: 3,
  inputDerivedBytes: 1024,
  batchCount: 1,
  completedBatchCount: 0,
  securityPolicyVersion: 'm3-network-policy-v1',
  repairAttempted: false,
  startedAt,
  completedAt: null,
  status: 'running',
  errorCode: null,
  providerRequestIdFingerprint: null,
  usage: null,
}
```

Assert that persisted status accepts only `running / completed / failed / cancelled`; `pending`, `preparing`, `awaiting_consent` and `repairing` fail. `AnalysisVersion` records `repairAttempted: boolean` and merged usage returned by the server. Assert manual M2 records accept only `contentOrigin: 'manual'` with null candidate ID, candidate-derived records require `candidate_confirmed` or `candidate_edited` with a UUID, and unknown fields fail. Assert AI candidates use `high / needs_confirmation / conflicted / unknown` while rule candidates retain `high / medium / low / unknown`.

Add builder assertions:

```typescript
expect(
  buildCandidateConfirmedFact({ candidate, id, confirmedAt, replacesFactId: null, version: 1 }),
).toMatchObject({
  confirmationMethod: 'candidate_confirmed',
  derivedFromCandidateId: candidate.id,
  sourceRefs: [{ evidenceId }],
})

expect(confirmStatement({ draft: candidateDraft, id, confirmedAt, version: 1 })).toMatchObject({
  contentOrigin: 'candidate_edited',
  derivedFromCandidateId: candidateId,
})
```

- [x] **Step 3: Run RED**

```powershell
pnpm exec vitest run packages/domain/tests/schemas.test.ts packages/domain/tests/formal-facts.test.ts packages/domain/tests/statements.test.ts
```

Expected: FAIL because M3 analysis statuses, formal provenance fields and candidate-derived builders do not exist. This is valid RED for absent M3 domain behavior.

- [x] **Step 4: Implement minimal domain contracts**

Use these public types and signatures:

```typescript
export type AiConfidenceLevel = 'high' | 'needs_confirmation' | 'conflicted' | 'unknown'
export type FormalContentOrigin = 'manual' | 'candidate_confirmed' | 'candidate_edited'
export type AiTaskType =
  'classify_evidence' | 'extract_facts' | 'build_timeline' | 'draft_statement'
export type AnalysisStatus = 'running' | 'completed' | 'failed' | 'cancelled'

export interface BuildCandidateConfirmedFactInput {
  readonly candidate: FactCandidate
  readonly editedValue?: string
  readonly id: UuidV4
  readonly confirmedAt: UtcTimestamp
  readonly replacesFactId: UuidV4 | null
  readonly version: number
}

export function buildCandidateConfirmedFact(input: BuildCandidateConfirmedFactInput): ConfirmedFact
```

Extend `EvidenceFile` with `categoryOrigin` and nullable `categoryCandidateId`; extend `TimelineEntry`, `StatementDraft` and `ConfirmedStatement` with `contentOrigin` and nullable `derivedFromCandidateId`. Update every current M2 constructor, fixture and typed test object in the Task file list to emit `manual + null`, so the canonical domain type never has an optional provenance gap. Manual category updates clear the candidate ID; candidate builders copy the candidate ID and never accept a missing source for candidate-derived facts.

- [x] **Step 5: Run GREEN and domain gates**

```powershell
pnpm --filter @youju/domain test
pnpm --filter @youju/domain typecheck
pnpm --filter @youju/web typecheck
pnpm --filter @youju/document-export test
pnpm validate:fixtures
pnpm lint
git diff --check
git status --short
```

Expected: all commands pass; status contains only Task 1 files and its checkbox update.

- [x] **Step 6: Commit and stop**

```powershell
git add packages/domain apps/web/src/services/evidence-import-service.ts apps/web/src/services/statement-service.ts apps/web/src/storage/indexeddb-case-repository.ts apps/web/src/views/TimelineView.vue apps/web/tests packages/document-export/tests fixtures/ecommerce-refund/case-001-transport-damage docs/superpowers/plans/2026-08-12-youju-m3-byok-ai-plan.md
git commit -m "feat: add M3 analysis provenance contracts"
```

---

### Task 2: Define Provider, Task, Manifest, and Wire Contracts

**Files:**

- Create: `packages/ai-core/src/provider.ts`
- Create: `packages/ai-core/src/task-contracts.ts`
- Create: `packages/ai-core/src/input-manifest.ts`
- Modify: `packages/ai-core/src/source-location.ts`
- Modify: `packages/ai-core/src/classification.ts`
- Modify: `packages/ai-core/src/fact-extraction.ts`
- Modify: `packages/ai-core/src/timeline.ts`
- Modify: `packages/ai-core/src/statement.ts`
- Modify: `packages/ai-core/src/index.ts`
- Create: `packages/ai-core/tests/provider.test.ts`
- Create: `packages/ai-core/tests/input-manifest.test.ts`
- Modify: `packages/ai-core/tests/contracts.test.ts`
- Update: `packages/ai-core/tests/__snapshots__/contracts.test.ts.snap`
- Modify: `fixtures/ecommerce-refund/case-001-transport-damage/expected/facts.json`
- Modify: `packages/test-support/src/fixture-schema.ts`
- Modify: `packages/test-support/tests/load-fixture.test.ts`
- Modify: `tests/integration/golden-case-contracts.test.ts`
- Modify: `docs/superpowers/plans/2026-08-12-youju-m3-byok-ai-plan.md` Task 2 checkboxes only

**Interfaces:**

- Consumes: Task 1 `AiTaskType`, `AiConfidenceLevel`, UUID and timestamp contracts.
- Produces: Provider presets/capabilities/errors, local `InputManifest`, redacted wire projection, four strict task outputs, deterministic batching and load estimate.

- [x] **Step 1: Write failing contract tests**

Test the exact presets and endpoint policy metadata:

```typescript
expect(PROVIDER_PRESETS.openai).toMatchObject({
  protocol: 'responses',
  endpoint: 'https://api.openai.com/v1/responses',
})
expect(PROVIDER_PRESETS.aliyun_bailian.endpoint).toBe(
  'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
)
expect(PROVIDER_PRESETS.deepseek.endpoint).toBe('https://api.deepseek.com/chat/completions')
expect(PROVIDER_PRESETS.siliconflow.endpoint).toBe('https://api.siliconflow.cn/v1/chat/completions')
expect(PROVIDER_PRESETS.custom.endpoint).toBeNull()
```

Create a local manifest containing both stable local IDs and random source tokens, then assert `toWireInputManifest()` excludes `caseId`, `evidenceId`, title and original name. Assert 11 materials, 31 pages, a 2 MiB + 1 byte image, a 20 MiB + 1 byte batch and a 60 MiB + 1 byte task fail with stable limit errors.

Require model wire outputs to use `sourceToken` and page, never `evidenceId` or `analysisVersionId`. Require statement requests/results to reference current confirmed fact and timeline IDs, while rejecting candidate IDs, legal conclusions, compensation and success-rate fields.

Migrate the existing golden `aiExtraction` fixture to the wire contract in the same RED/GREEN cycle: replace stable evidence IDs with deterministic fictional source tokens and remove model-supplied `analysisVersionId`. Update fixture Schema and integration assertions so no later Task inherits a broken M1/M2 fixture.

- [x] **Step 2: Run RED**

```powershell
pnpm exec vitest run packages/ai-core/tests/provider.test.ts packages/ai-core/tests/input-manifest.test.ts packages/ai-core/tests/contracts.test.ts
```

Expected: FAIL because provider metadata, local/wire manifest separation and new task contracts do not exist. This is valid RED for the missing M3 protocol boundary.

- [x] **Step 3: Implement public contracts and deterministic limits**

Use these signatures:

```typescript
export type ProviderPreset = 'openai' | 'aliyun_bailian' | 'deepseek' | 'siliconflow' | 'custom'
export type AiProtocol = 'responses' | 'chat_completions'

export interface ProviderCapabilities {
  readonly text: boolean
  readonly vision: boolean
  readonly jsonMode: boolean
  readonly jsonSchema: boolean
  readonly streaming: boolean
}

export interface InputManifestItem {
  readonly sourceToken: UuidV4
  readonly evidenceId: UuidV4
  readonly page: number
  readonly derivedMediaType: 'image/webp'
  readonly pixelWidth: number
  readonly pixelHeight: number
  readonly byteSize: number
  readonly derivedSha256: string
}

export function validateInputManifest(manifest: InputManifest): void
export function toWireInputManifest(manifest: InputManifest): WireInputManifest
export function splitManifestBatches(manifest: InputManifest): readonly WireManifestBatch[]
export function estimateTextTokens(text: string): number
```

`sourceToken` 使用每次任务新生成的 UUID v4，但只是 wire alias，不得在任务间复用。`splitManifestBatches()` preserves manifest item order and starts a new batch before crossing 20 MiB. It never splits a page. Provider capability snapshots remain memory-only contracts and contain no API key.

- [x] **Step 4: Run GREEN and package gates**

```powershell
pnpm --filter @youju/ai-core test
pnpm --filter @youju/ai-core typecheck
pnpm --filter @youju/test-support test
pnpm validate:fixtures
pnpm exec vitest run tests/integration/golden-case-contracts.test.ts
pnpm lint
git diff --check
git status --short
```

Expected: all contract and snapshot tests pass; no output contract accepts stable local IDs from the model.

- [x] **Step 5: Commit and stop**

```powershell
git add packages/ai-core packages/test-support fixtures/ecommerce-refund/case-001-transport-damage/expected/facts.json tests/integration/golden-case-contracts.test.ts docs/superpowers/plans/2026-08-12-youju-m3-byok-ai-plan.md
git commit -m "feat: define M3 AI task contracts"
```

---

### Task 3: Validate, Localize, Deduplicate, and Review AI Candidates

**Files:**

- Create: `packages/ai-core/src/candidates.ts`
- Create: `packages/ai-core/src/output-validation.ts`
- Create: `packages/ai-core/src/review.ts`
- Modify: `packages/ai-core/src/index.ts`
- Create: `packages/ai-core/tests/output-validation.test.ts`
- Create: `packages/ai-core/tests/review.test.ts`
- Modify: root `package.json`
- Modify: `docs/superpowers/plans/2026-08-12-youju-m3-byok-ai-plan.md` Task 3 checkboxes only

**Interfaces:**

- Consumes: Task 2 wire outputs and local `InputManifest`; Task 1 review statuses and formal types.
- Produces: localized persisted candidates, atomic candidate set, deterministic conflicts, review transitions and batch-confirm eligibility.

- [x] **Step 1: Write failing validation and review tests**

Cover unknown/duplicate `sourceToken`, page mismatch, zero/negative/out-of-bounds region, absent required source, unknown field, duplicate normalized values and conflicting normalized values. Assert no output is returned if any item in a stage fails.

Use exact review expectations:

```typescript
expect(canBatchConfirm(candidate, context)).toBe(true)
expect(canBatchConfirm({ ...candidate, confidenceLevel: 'needs_confirmation' }, context)).toBe(
  false,
)
expect(transitionReview(candidate, { type: 'reject', reviewedAt })).toMatchObject({
  reviewStatus: 'rejected',
})
expect(() => transitionReview(rejected, { type: 'confirm', reviewedAt })).toThrow(
  'invalid_review_transition',
)
```

Assert `high` alone is insufficient: source completeness, valid Schema, no candidate conflict and no conflict with current formal data are all required.

- [x] **Step 2: Run RED**

```powershell
pnpm exec vitest run packages/ai-core/tests/output-validation.test.ts packages/ai-core/tests/review.test.ts
```

Expected: FAIL because localization, conflict and review functions are absent. This is valid RED for missing deterministic candidate safety behavior.

- [x] **Step 3: Implement candidate conversion and review state machine**

Use these public APIs:

```typescript
export type AiCandidate =
  EvidenceClassificationCandidate | AiFactCandidate | AiTimelineCandidate | AiStatementCandidate

export function localizeTaskOutput(input: {
  readonly analysisVersionId: UuidV4
  readonly caseId: UuidV4
  readonly taskType: AiTaskType
  readonly manifest: InputManifest
  readonly output: unknown
  readonly createdAt: UtcTimestamp
  readonly idFactory: () => UuidV4
}): readonly AiCandidate[]

export function detectCandidateConflicts(input: {
  readonly candidates: readonly AiCandidate[]
  readonly currentFacts: readonly ConfirmedFact[]
  readonly currentTimeline: readonly TimelineEntry[]
}): readonly CandidateConflict[]

export function transitionReview(candidate: AiCandidate, command: ReviewCommand): AiCandidate
export function canBatchConfirm(candidate: AiCandidate, context: ReviewContext): boolean
```

Localization first validates the entire wire result, then resolves every `sourceToken` through the immutable manifest. Any unknown token or invalid page/region rejects the whole stage; callers never receive partial candidates. Sanitize text as plain text and preserve URLs/Markdown only as inert characters.

- [x] **Step 4: Add the contract test script and run GREEN**

Add root script:

```json
"test:ai-contract": "vitest run packages/ai-core/tests"
```

Run:

```powershell
pnpm test:ai-contract
pnpm --filter @youju/ai-core typecheck
pnpm lint
git diff --check
git status --short
```

Expected: all tests pass and the root command performs no network access.

- [x] **Step 5: Commit and stop**

```powershell
git add packages/ai-core package.json docs/superpowers/plans/2026-08-12-youju-m3-byok-ai-plan.md
git commit -m "feat: validate and review AI candidates"
```

---

### Task 4: Add IndexedDB v3 AI Storage and Safe Migration

**Files:**

- Create: `apps/web/src/storage/ai-repository.ts`
- Create: `apps/web/src/storage/indexeddb-ai-repository.ts`
- Modify: `apps/web/src/storage/database-schema.ts`
- Modify: `apps/web/src/storage/open-database.ts`
- Modify: `apps/web/src/storage/index.ts`
- Modify: `apps/web/src/storage/case-repository.ts`
- Modify: `apps/web/src/storage/indexeddb-case-repository.ts`
- Create: `tests/e2e/ai-repository.spec.ts`
- Modify: `tests/e2e/case-repository.spec.ts`
- Modify: `docs/superpowers/plans/2026-08-12-youju-m3-byok-ai-plan.md` Task 4 checkboxes only

**Interfaces:**

- Consumes: Task 1 formal provenance and analysis versions; Task 3 `AiCandidate`.
- Produces: IndexedDB v3 stores, `AiRepository`, atomic stage publication, startup cancellation and backward-compatible M2 record migration.

- [x] **Step 1: Write failing real-browser storage tests**

Create a v2 database containing M2 evidence, timeline and statement records, open with v3 migrations, and assert:

```typescript
expect(migratedEvidence).toMatchObject({ categoryOrigin: 'manual', categoryCandidateId: null })
expect(migratedTimeline).toMatchObject({ contentOrigin: 'manual', derivedFromCandidateId: null })
expect(migratedStatement).toMatchObject({ contentOrigin: 'manual', derivedFromCandidateId: null })
```

Assert `analysisVersions` and `aiCandidates` use `by_caseId` and `by_analysisVersionId` indexes; candidate publication commits version completion and all candidates in one transaction; injected failure leaves no candidates and the version failed; startup converts only `running` to `cancelled`; API keys, raw model output and derived bytes cannot be stored through the typed repository.

- [x] **Step 2: Run RED**

```powershell
pnpm exec playwright test tests/e2e/ai-repository.spec.ts --project=chromium-desktop
```

Expected: FAIL because v3 stores, migration and AI Repository do not exist. Vite and Playwright must start successfully, making this a valid behavior RED.

- [x] **Step 3: Implement v3 migration and repository**

Use these interfaces:

```typescript
export interface AiRepository {
  createAnalysis(version: AnalysisVersion): Promise<void>
  updateAnalysis(version: AnalysisVersion): Promise<void>
  publishCompletedAnalysis(
    version: AnalysisVersion,
    candidates: readonly AiCandidate[],
  ): Promise<void>
  getAnalysis(id: UuidV4): Promise<AnalysisVersion | null>
  listAnalyses(caseId: UuidV4): Promise<readonly AnalysisVersion[]>
  listCandidates(caseId: UuidV4): Promise<readonly AiCandidate[]>
  putCandidate(candidate: AiCandidate): Promise<void>
  cancelInterruptedAnalyses(cancelledAt: UtcTimestamp): Promise<number>
  deleteAnalysis(id: UuidV4): Promise<void>
  deleteAllAiRecords(caseId: UuidV4): Promise<void>
}
```

Migrations update existing records in the upgrade transaction and never wipe a database on parse or migration failure. `CaseRepository.deleteAllCaseRecords()` includes both AI stores so event deletion remains one IndexedDB transaction.

- [x] **Step 4: Run GREEN and storage regression**

```powershell
pnpm exec playwright test tests/e2e/ai-repository.spec.ts tests/e2e/case-repository.spec.ts --project=chromium-desktop
pnpm --filter @youju/web test
pnpm --filter @youju/web typecheck
pnpm lint
git diff --check
git status --short
```

Expected: migration and atomicity tests pass; existing M2 repository flows remain green.

- [x] **Step 5: Commit and stop**

```powershell
git add apps/web/src/storage tests/e2e/ai-repository.spec.ts tests/e2e/case-repository.spec.ts docs/superpowers/plans/2026-08-12-youju-m3-byok-ai-plan.md
git commit -m "feat: persist M3 analyses and candidates"
```

---

### Task 5: Enforce Transactional Candidate Confirmation and Deletion Protection

**Files:**

- Modify: `apps/web/src/storage/ai-repository.ts`
- Modify: `apps/web/src/storage/indexeddb-ai-repository.ts`
- Modify: `apps/web/src/storage/case-repository.ts`
- Modify: `apps/web/src/storage/indexeddb-case-repository.ts`
- Create: `apps/web/src/services/ai-review-service.ts`
- Modify: `apps/web/src/services/reference-service.ts`
- Modify: `apps/web/src/services/delete-case-service.ts`
- Modify: `apps/web/src/services/recover-local-operations.ts`
- Create: `apps/web/tests/ai-review-service.test.ts`
- Modify: `apps/web/tests/deletion.test.ts`
- Modify: `tests/e2e/ai-repository.spec.ts`
- Modify: `tests/e2e/verified-deletion.spec.ts`
- Modify: `docs/superpowers/plans/2026-08-12-youju-m3-byok-ai-plan.md` Task 5 checkboxes only

**Interfaces:**

- Consumes: Task 4 repository and Task 3 review eligibility.
- Produces: atomic review commands that update candidate plus formal record, analysis deletion reference blocking, event deletion and recovery including AI records.

- [x] **Step 1: Write failing service and browser tests**

Assert no formal store changes when a candidate is merely published, rejected, conflicted or invalid. For each candidate type, assert confirmation changes candidate review status and formal data in the same IndexedDB transaction. Inject an error between the two writes and assert both roll back.

Assert manual reclassification clears `categoryCandidateId`; manual independent statement editing clears candidate provenance; candidate editing uses `candidate_edited`. Assert deleting an analysis referenced by current category, confirmed fact, timeline, statement draft or confirmed statement throws `analysis_is_referenced`. Assert event deletion removes both AI stores and reports failure if either remains.

- [x] **Step 2: Run RED**

```powershell
pnpm exec vitest run apps/web/tests/ai-review-service.test.ts apps/web/tests/deletion.test.ts
pnpm exec playwright test tests/e2e/ai-repository.spec.ts tests/e2e/verified-deletion.spec.ts --project=chromium-desktop
```

Expected: FAIL because atomic candidate-to-formal commands and AI deletion checks do not exist. This is valid RED for missing formal-data isolation.

- [x] **Step 3: Implement transactional review commands**

Expose only typed commands:

```typescript
export type ConfirmAiCandidateCommand =
  | {
      readonly type: 'classification'
      readonly candidateId: UuidV4
      readonly editedCategory?: EvidenceCategory
      readonly reviewedAt: UtcTimestamp
    }
  | {
      readonly type: 'fact'
      readonly candidateId: UuidV4
      readonly editedValue?: string
      readonly confirmedFactId: UuidV4
      readonly replacesFactId: UuidV4 | null
      readonly reviewedAt: UtcTimestamp
    }
  | {
      readonly type: 'timeline'
      readonly candidateId: UuidV4
      readonly edited?: TimelineCandidateEdit
      readonly timelineEntryId: UuidV4
      readonly reviewedAt: UtcTimestamp
    }
  | {
      readonly type: 'statement'
      readonly candidateId: UuidV4
      readonly editedText?: string
      readonly statementDraftId: UuidV4
      readonly reviewedAt: UtcTimestamp
    }

export interface AiReviewService {
  confirm(command: ConfirmAiCandidateCommand): Promise<void>
  reject(candidateId: UuidV4, reviewedAt: UtcTimestamp): Promise<void>
  confirmEligibleBatch(candidateIds: readonly UuidV4[], reviewedAt: UtcTimestamp): Promise<void>
}
```

Batch confirmation validates the complete set before opening a write transaction. Any ineligible item rejects the entire batch. Statement confirmation creates only `StatementDraft`; the existing explicit final statement confirmation remains required.

- [x] **Step 4: Run GREEN and deletion gates**

```powershell
pnpm exec vitest run apps/web/tests/ai-review-service.test.ts apps/web/tests/deletion.test.ts
pnpm exec playwright test tests/e2e/ai-repository.spec.ts tests/e2e/verified-deletion.spec.ts --project=chromium-desktop
pnpm --filter @youju/web typecheck
pnpm lint
git diff --check
git status --short
```

Expected: formal data remains unchanged before explicit confirmation; rollback, reference blocking and verified deletion pass.

- [x] **Step 5: Commit and stop**

```powershell
git add apps/web tests/e2e/ai-repository.spec.ts tests/e2e/verified-deletion.spec.ts docs/superpowers/plans/2026-08-12-youju-m3-byok-ai-plan.md
git commit -m "feat: confirm AI candidates transactionally"
```

---

### Task 6: Derive Bounded Images and PDF Pages in Browser Memory

**Files:**

- Create: `apps/web/src/ai/derived-media.ts`
- Create: `apps/web/src/ai/pdf-page-renderer.ts`
- Create: `apps/web/src/ai/input-manifest-builder.ts`
- Create: `apps/web/src/ai/index.ts`
- Create: `apps/web/tests/derived-media.test.ts`
- Create: `tests/e2e/ai-derived-media.spec.ts`
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `docs/development/m3-dependencies.md`
- Modify: `docs/superpowers/plans/2026-08-12-youju-m3-byok-ai-plan.md` Task 6 checkboxes only

**Interfaces:**

- Consumes: M2 `EvidenceBlobStore.read()`, evidence metadata and Task 2 manifest limits.
- Produces: bounded in-memory WebP pages, deterministic hashes, immutable local `InputManifest` and explicit cleanup.

- [x] **Step 1: Write failing derivation tests**

Use generated fictional image/PDF bytes and assert:

- 4000×3000 input becomes at most 2048 on the longest edge and at most 4,000,000 pixels;
- output is `image/webp`, no more than 2 MiB and uses the first quality in `0.82, 0.74, 0.66, 0.60` that fits;
- if 0.60 still exceeds 2 MiB, fail with `derived_image_too_large` instead of silently reducing visibility further;
- a four-page PDF renders only pages `[2, 4]` and does not load external URLs, embedded files or JavaScript;
- derived SHA-256 is over the exact sent WebP bytes;
- cleanup revokes every Object URL and releases byte references after success, failure and abort;
- manifest order is evidence selection order then ascending page; each item receives a fresh random task-scoped token.

- [x] **Step 2: Run RED**

```powershell
pnpm exec vitest run apps/web/tests/derived-media.test.ts
pnpm exec playwright test tests/e2e/ai-derived-media.spec.ts --project=chromium-desktop
```

Expected: FAIL because browser derivation and PDF rendering modules do not exist. Browser startup and fixture generation must succeed, making this valid behavior RED.

- [x] **Step 3: Add and document PDF.js dependency**

```powershell
pnpm --filter @youju/web add pdfjs-dist@6.2.108
```

Record in `docs/development/m3-dependencies.md`:

- package `pdfjs-dist@6.2.108`;
- Apache-2.0 license;
- maintained Mozilla PDF.js prebuilt distribution;
- purpose: selected-page browser rendering only;
- alternatives rejected: native Provider PDF upload, iframe/native PDF viewer and custom parser;
- worker is bundled locally by Vite; no CDN, remote font, CMap or standard-font fetch;
- API options disable auto-fetch, range fetch, streaming, JavaScript and network-loaded assets for local Blob input.

- [x] **Step 4: Implement in-memory derivation**

Use these signatures:

```typescript
export interface DerivedMedia {
  readonly sourceToken: UuidV4
  readonly evidenceId: UuidV4
  readonly page: number
  readonly mediaType: 'image/webp'
  readonly width: number
  readonly height: number
  readonly bytes: Uint8Array
  readonly sha256: string
  readonly previewUrl: string
}

export async function deriveImagePage(input: {
  readonly evidenceId: UuidV4
  readonly source: Blob
  readonly page: number
  readonly signal: AbortSignal
  readonly sourceToken: UuidV4
}): Promise<DerivedMedia>

export async function renderPdfPages(input: {
  readonly evidenceId: UuidV4
  readonly source: Blob
  readonly pages: readonly number[]
  readonly signal: AbortSignal
  readonly sourceTokenFactory: () => UuidV4
}): Promise<readonly DerivedMedia[]>

export function releaseDerivedMedia(media: readonly DerivedMedia[]): void
```

`releaseDerivedMedia()` revokes `previewUrl`, zero-fills each mutable byte buffer and drops module-held references; callers also discard their arrays in `finally`. Never write derived bytes through `EvidenceBlobStore`, IndexedDB, Cache Storage or download APIs. PDF.js receives only an in-memory `Uint8Array`; no URL callback or credential option is exposed.

- [x] **Step 5: Run GREEN and browser gates**

```powershell
pnpm exec vitest run apps/web/tests/derived-media.test.ts
pnpm exec playwright test tests/e2e/ai-derived-media.spec.ts --project=chromium-desktop --project=webkit-mobile
pnpm --filter @youju/web typecheck
pnpm --filter @youju/web build
pnpm check:forbidden-content
pnpm lint
git diff --check
git status --short
```

Expected: derivation passes in Chromium and WebKit; no network request leaves the browser test except local app assets.

- [x] **Step 6: Commit and stop**

```powershell
git add apps/web pnpm-lock.yaml docs/development/m3-dependencies.md tests/e2e/ai-derived-media.spec.ts docs/superpowers/plans/2026-08-12-youju-m3-byok-ai-plan.md
git commit -m "feat: derive bounded AI input pages"
```

---

### Task 7: Add Session-Only Provider Configuration and Consent Scope

**Files:**

- Create: `apps/web/src/ai/ai-session.ts`
- Create: `apps/web/src/ai/consent-scope.ts`
- Create: `apps/web/tests/ai-session.test.ts`
- Create: `tests/e2e/ai-session-privacy.spec.ts`
- Modify: `apps/web/src/ai/index.ts`
- Modify: `docs/superpowers/plans/2026-08-12-youju-m3-byok-ai-plan.md` Task 7 checkboxes only

**Interfaces:**

- Consumes: Task 2 Provider and manifest contracts.
- Produces: module-scoped in-memory session, capability binding, strict/session convenience authorization and deterministic invalidation.

- [x] **Step 1: Write failing session and privacy tests**

Assert default consent is `strict`, `setSession()` retains API key only in module memory, `disableAi()` clears all module-held references, and a full reload leaves no session. Scan IndexedDB, OPFS, localStorage, sessionStorage, cookies, Cache Storage, history state, document HTML and serialized test snapshots for the sentinel key; all must be absent.

Assert convenience consent is bound locally to case ID, Provider, protocol, normalized Base URL fingerprint, model, selected evidence IDs/pages, text field names, security policy version and maximum approved derived bytes. Task-scoped `sourceToken` values are deliberately excluded because they are regenerated for each call. Removing scope is allowed; adding a page/text field, switching event/model/Provider, increasing bytes, capability retest, refresh or disabling AI requires full consent again.

- [x] **Step 2: Run RED**

```powershell
pnpm exec vitest run apps/web/tests/ai-session.test.ts
pnpm exec playwright test tests/e2e/ai-session-privacy.spec.ts --project=chromium-desktop
```

Expected: FAIL because session and consent scope modules do not exist. This is valid RED for absent key lifecycle and authorization behavior.

- [x] **Step 3: Implement memory-only state and consent checks**

Use these interfaces:

```typescript
export interface ProviderSessionConfig {
  readonly providerPreset: ProviderPreset
  readonly protocol: AiProtocol
  readonly baseUrl: string
  readonly modelName: string
  readonly apiKey: string
  readonly capabilities: ProviderCapabilities
  readonly consentMode: 'strict' | 'session_convenience'
  readonly connectionTestedAt: UtcTimestamp
}

export function getAiSession(): ProviderSessionConfig | null
export function setAiSession(config: ProviderSessionConfig): void
export function disableAi(): void
export function recordConsent(scope: ConsentScope): void
export function requiresFullConsent(next: ConsentScope): boolean
```

Do not expose a serializer, persistence adapter or debug dump. Capability snapshots invalidate when Provider, protocol, normalized Base URL fingerprint or model changes.

- [x] **Step 4: Run GREEN and privacy gates**

```powershell
pnpm exec vitest run apps/web/tests/ai-session.test.ts
pnpm exec playwright test tests/e2e/ai-session-privacy.spec.ts --project=chromium-desktop --project=webkit-mobile
pnpm --filter @youju/web typecheck
pnpm check:forbidden-content
pnpm lint
git diff --check
git status --short
```

Expected: sentinel API key is absent from all persistent and rendered locations before and after reload.

- [x] **Step 5: Commit and stop**

```powershell
git add apps/web/src/ai apps/web/tests/ai-session.test.ts tests/e2e/ai-session-privacy.spec.ts docs/superpowers/plans/2026-08-12-youju-m3-byok-ai-plan.md
git commit -m "feat: keep BYOK settings session-only"
```

---

### Task 8: Enforce Preset and Custom Target Network Policy

**Files:**

- Create: `apps/api/src/ai/target-policy.ts`
- Create: `apps/api/src/ai/address-policy.ts`
- Create: `apps/api/src/ai/pinned-https-client.ts`
- Create: `apps/api/src/ai/index.ts`
- Create: `apps/api/tests/target-policy.test.ts`
- Create: `apps/api/tests/address-policy.test.ts`
- Create: `apps/api/tests/pinned-https-client.test.ts`
- Modify: `docs/superpowers/plans/2026-08-12-youju-m3-byok-ai-plan.md` Task 8 checkboxes only

**Interfaces:**

- Consumes: Task 2 Provider preset and protocol metadata.
- Produces: normalized allowed target, full DNS result validation and fixed-address HTTPS transport with original-host TLS verification.

- [x] **Step 1: Write failing URL and address policy tests**

Accept `https://example.com/v1` and normalize the operation to `https://example.com/v1/chat/completions`. Reject HTTP, non-443 ports, username/password, query, fragment, IP literals, backslashes, encoded dot segments, control characters, Unicode hostname ambiguity after `domainToASCII()`, and a Base URL ending in an operation path.

Test all IPv4/IPv6 disallowed groups including loopback, private, link-local, CGNAT, documentation, benchmark, multicast, unspecified, reserved, broadcast and IPv4-mapped IPv6. A DNS answer set with one public and one private result must fail entirely.

- [x] **Step 2: Write failing pinned HTTPS integration tests**

With injected resolver and connector doubles, assert connection uses the exact validated address; TLS `servername` and hostname verification use the original ASCII hostname; resolver is called again for every request; 3xx is never followed; proxy environment variables are ignored; and user headers/cookies cannot enter the transport.

- [x] **Step 3: Run RED**

```powershell
pnpm exec vitest run apps/api/tests/target-policy.test.ts apps/api/tests/address-policy.test.ts apps/api/tests/pinned-https-client.test.ts
```

Expected: FAIL because target and fixed-address transport modules do not exist. This is valid RED for absent SSRF and DNS-rebinding controls.

- [x] **Step 4: Implement the network boundary**

```typescript
export interface DnsResolver {
  resolve(hostname: string): Promise<readonly { address: string; family: 4 | 6 }[]>
}

export interface AllowedTarget {
  readonly protocol: 'https:'
  readonly hostname: string
  readonly port: 443
  readonly path: string
  readonly addresses: readonly { address: string; family: 4 | 6 }[]
}

export async function resolveAllowedTarget(
  input: TargetInput,
  resolver: DnsResolver,
): Promise<AllowedTarget>
export function createPinnedHttpsClient(options: PinnedHttpsClientOptions): PinnedHttpsClient
```

Use Node built-ins only. If tests cannot prove fixed-address connection with original-host SNI and certificate checking, stop without enabling custom Base URL.

- [x] **Step 5: Run GREEN and API gates**

```powershell
pnpm exec vitest run apps/api/tests/target-policy.test.ts apps/api/tests/address-policy.test.ts apps/api/tests/pinned-https-client.test.ts
pnpm --filter @youju/api typecheck
pnpm --filter @youju/api build
pnpm lint
git diff --check
git status --short
```

- [x] **Step 6: Commit and stop**

```powershell
git add apps/api docs/superpowers/plans/2026-08-12-youju-m3-byok-ai-plan.md
git commit -m "feat: secure custom AI targets"
```

---

### Task 9: Implement Responses and Chat Completions Adapters

**Files:**

- Create: `apps/api/src/ai/provider-adapters.ts`
- Create: `apps/api/src/ai/prompt-catalog.ts`
- Create: `apps/api/tests/provider-adapters.test.ts`
- Create: `apps/api/tests/prompt-catalog.test.ts`
- Modify: `apps/api/src/ai/index.ts`
- Modify: `docs/superpowers/plans/2026-08-12-youju-m3-byok-ai-plan.md` Task 9 checkboxes only

**Interfaces:**

- Consumes: Task 8 `PinnedHttpsClient`; Task 2 task/provider contracts.
- Produces: controlled upstream envelopes, capability probes, structured result normalization, stable error mapping and one internal repair attempt.

- [x] **Step 1: Write failing adapter tests with fixed upstream envelopes**

For Responses, assert `/v1/responses`, `store:false`, no conversation/previous response/background/files/tools, image data only from derived WebP, and JSON Schema when capability permits. For Chat Completions, assert fixed `messages`, controlled `response_format`, no Provider-private fields and no arbitrary endpoint.

For both protocols, assert connection test uses fixed fictional text and a minimal fictional image only; raw response, reasoning and full upstream errors are not returned; malformed JSON or Schema failure triggers at most one internal repair containing only original output, Schema ID, task type and repair instruction; repair success returns only the standardized result plus `repairAttempted: true` and merged usage; repair failure returns `repair_failed`; auth/model/rate/quota/content/timeout/empty/too-large statuses never repair and map to stable errors.

- [x] **Step 2: Run RED**

```powershell
pnpm exec vitest run apps/api/tests/provider-adapters.test.ts apps/api/tests/prompt-catalog.test.ts
```

Expected: FAIL because protocol adapters and prompt catalog do not exist. This is valid RED for missing provider translation behavior.

- [x] **Step 3: Implement adapters and prompt versions**

```typescript
export interface AiProviderAdapter {
  testConnection(request: ConnectionTestRequest, signal: AbortSignal): Promise<ConnectionTestResult>
  executeTask(request: AiTaskRequest, signal: AbortSignal): Promise<AiTaskResult>
}

export function createProviderAdapter(input: {
  readonly protocol: AiProtocol
  readonly client: PinnedHttpsClient
}): AiProviderAdapter
```

Prompt versions are `connection-v1`, `classify-evidence-v1`, `extract-facts-v1`, `build-timeline-v1`, `draft-statement-v1` and `repair-structured-output-v1`. Every task prompt treats material as untrusted data, forbids tools/external access/legal conclusions and requires source tokens. Do not log expanded prompts.

- [x] **Step 4: Run GREEN and adapter gates**

```powershell
pnpm exec vitest run apps/api/tests/provider-adapters.test.ts apps/api/tests/prompt-catalog.test.ts
pnpm --filter @youju/api typecheck
pnpm lint
git diff --check
git status --short
```

- [x] **Step 5: Commit and stop**

```powershell
git add apps/api docs/superpowers/plans/2026-08-12-youju-m3-byok-ai-plan.md
git commit -m "feat: adapt AI provider protocols"
```

---

### Task 10: Expose Guarded Stateless Fastify AI Routes

**Files:**

- Create: `apps/api/src/ai/request-guard.ts`
- Create: `apps/api/src/routes/ai.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/logging.ts`
- Modify: `apps/api/tests/log-redaction.test.ts`
- Create: `apps/api/tests/ai-routes.test.ts`
- Create: `apps/api/tests/request-guard.test.ts`
- Modify: `apps/api/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `docs/superpowers/plans/2026-08-12-youju-m3-byok-ai-plan.md` Task 10 checkboxes only

**Interfaces:**

- Consumes: Task 8 target resolver, Task 9 adapters and Task 2 request/response Schema.
- Produces: two synchronous no-store routes, abort propagation, hard limits, in-memory rate/concurrency guards and sanitized logging.

- [ ] **Step 1: Write failing route and guard tests**

Using `buildApp()` dependency injection and Fastify `inject()`, assert unknown routes/tasks/additional fields/invalid UUIDs/missing credentials return bounded 4xx; `/ai/tasks/:taskType/repair` is absent; request over 32 MiB and response over 2 MiB fail without echo; timeout classes are 10/60/120 seconds with a 45-second internal repair sub-budget that cannot exceed the outer deadline; per-IP concurrency 2, 10 requests/60 seconds and process concurrency 8 are enforced; counters expire without retaining payload or key; disconnect aborts both initial and repair upstream calls; every response is `no-store`; and errors contain no credential/raw response/reasoning/full URL/upstream body.

Extend log tests with sentinel values for API key, authorization, body, response, filename, case title, prompt and candidate value. Only request ID, task type, Provider preset, Base URL fingerprint, status class, stable error, duration, batch number, byte counts and returned Token counts may appear.

- [ ] **Step 2: Run RED**

```powershell
pnpm exec vitest run apps/api/tests/ai-routes.test.ts apps/api/tests/request-guard.test.ts apps/api/tests/log-redaction.test.ts
```

Expected: FAIL because routes, guard and recursive credential/body redaction do not exist. This is valid RED for missing API boundary behavior.

- [ ] **Step 3: Wire workspace dependency and implement routes**

```powershell
pnpm --filter @youju/api add @youju/ai-core@workspace:*
```

Use:

```typescript
export interface AppDependencies {
  readonly createAdapter: CreateAdapter
  readonly resolver: DnsResolver
  readonly clock: Clock
}

export function buildApp(overrides?: Partial<AppDependencies>): FastifyInstance
```

Implement only `POST /ai/connection-test` and `POST /ai/tasks/:taskType`. API key is removed from any loggable object immediately after Schema parsing. The task adapter may perform one repair internally before the route responds; no raw output crosses the Fastify/browser boundary. Do not add repair, task history, polling, uploads, model listing, cache, queue or persistence routes.

- [ ] **Step 4: Run GREEN and full API regression**

```powershell
pnpm --filter @youju/api test
pnpm --filter @youju/api typecheck
pnpm --filter @youju/api build
pnpm check:forbidden-content
pnpm lint
git diff --check
git status --short
```

Expected: health route remains green and all AI routes are stateless and bounded.

- [ ] **Step 5: Commit and stop**

```powershell
git add apps/api pnpm-lock.yaml docs/superpowers/plans/2026-08-12-youju-m3-byok-ai-plan.md
git commit -m "feat: add guarded AI proxy routes"
```

---

### Task 11: Build the Browser API Client and Atomic Task Runner

**Files:**

- Create: `apps/web/src/ai/ai-api-client.ts`
- Create: `apps/web/src/ai/ai-task-runner.ts`
- Modify: `apps/web/src/ai/index.ts`
- Create: `apps/web/tests/ai-api-client.test.ts`
- Create: `apps/web/tests/ai-task-runner.test.ts`
- Modify: `apps/web/src/services/recover-local-operations.ts`
- Modify: `docs/superpowers/plans/2026-08-12-youju-m3-byok-ai-plan.md` Task 11 checkboxes only

**Interfaces:**

- Consumes: Tasks 4/5 AI storage, Task 6 derived media, Task 7 session/consent, Task 10 routes and Task 3 localization/review.
- Produces: abortable API client, same-case task lock, four single tasks, repair metadata handling, batch atomicity and sequential classify→facts→timeline orchestration.

- [ ] **Step 1: Write failing client and runner tests**

Assert the client sends only the dedicated credential plus redacted wire fields and never stable IDs/names. Assert cancellation maps to `request_cancelled` and publishes nothing.

Inject clocks, IDs, derivers, client and repositories to assert pre-consent preparation creates no analysis; consent creates `running`; a response with `repairAttempted: true` updates only the final completed analysis metadata and never exposes raw output; completion atomically publishes; only one task per case runs; a failed batch publishes zero current-stage candidates; one-click uses three separate versions in fixed order; statement is excluded and consumes current confirmed facts/timeline only; earlier completed stages remain after later failure; and startup cancels interrupted versions without replay.

- [ ] **Step 2: Run RED**

```powershell
pnpm exec vitest run apps/web/tests/ai-api-client.test.ts apps/web/tests/ai-task-runner.test.ts
```

Expected: FAIL because browser API client and task orchestration do not exist. This is valid RED for absent lifecycle behavior.

- [ ] **Step 3: Implement runner ports**

```typescript
export interface AiApiClient {
  testConnection(request: ConnectionTestRequest, signal: AbortSignal): Promise<ConnectionTestResult>
  executeTask(request: AiTaskRequest, signal: AbortSignal): Promise<AiTaskResult>
}

export interface AiTaskRunner {
  runTask(command: RunAiTaskCommand): Promise<RunAiTaskResult>
  runQuickAnalysis(command: RunQuickAnalysisCommand): Promise<readonly RunAiTaskResult[]>
  cancel(caseId: UuidV4): void
  isRunning(caseId: UuidV4): boolean
}
```

All batch outputs remain in memory until the complete stage validates and merges. Always release derived bytes in `finally`. API key never enters analysis, errors or thrown messages.

- [ ] **Step 4: Run GREEN and service gates**

```powershell
pnpm exec vitest run apps/web/tests/ai-api-client.test.ts apps/web/tests/ai-task-runner.test.ts
pnpm --filter @youju/web test
pnpm --filter @youju/web typecheck
pnpm check:forbidden-content
pnpm lint
git diff --check
git status --short
```

- [ ] **Step 5: Commit and stop**

```powershell
git add apps/web/src/ai apps/web/src/services/recover-local-operations.ts apps/web/tests docs/superpowers/plans/2026-08-12-youju-m3-byok-ai-plan.md
git commit -m "feat: orchestrate local AI tasks"
```

---

### Task 12: Add AI Settings, Sending Preview, and Task Progress UI

**Files:**

- Create: `apps/web/src/views/AiSettingsView.vue`
- Create: `apps/web/src/views/AiAssistantView.vue`
- Create: `apps/web/src/components/AiSendingPreview.vue`
- Create: `apps/web/src/components/AiTaskProgress.vue`
- Modify: `apps/web/src/views/CaseWorkspaceView.vue`
- Modify: `apps/web/src/router.ts`
- Modify: `apps/web/vite.config.ts`
- Create: `apps/web/tests/ai-settings.test.ts`
- Create: `apps/web/tests/ai-assistant.test.ts`
- Modify: `docs/superpowers/plans/2026-08-12-youju-m3-byok-ai-plan.md` Task 12 checkboxes only

**Interfaces:**

- Consumes: Task 7 session/consent and Task 11 client/runner.
- Produces: session-only Provider setup, capability test, page/material selection, strict/convenience consent, explicit task controls and honest progress/cancel UI.

- [ ] **Step 1: Write failing component tests**

Assert AI settings offer exactly OpenAI, 阿里云百炼, DeepSeek, SiliconFlow and custom; OpenAI locks Responses, others lock Chat Completions; Base URL is editable only for custom; API key uses password input and never appears in rendered text; model is user-entered; connection results show text/vision/JSON/JSON Schema/streaming independently; changing bound fields invalidates capability state; disable clears fields and session.

Assert sending preview lists Provider/model, original names locally, selected PDF pages, derived thumbnails, sent confirmed text fields, material/page counts, pixels/bytes/batches, text Token estimate, possible repair call and “费用以 Provider 实际账单为准”. It allows removal but any expansion requires a new full confirmation.

Assert assistant exposes four explicit tasks plus one-click classify→facts→timeline, disables tasks by capability, excludes statement from one-click, starts only after consent, displays stage and `currentBatch / totalBatches`, has cancel, states refresh aborts work, and never shows fabricated percentages or background continuation.

- [ ] **Step 2: Run RED**

```powershell
pnpm exec vitest run apps/web/tests/ai-settings.test.ts apps/web/tests/ai-assistant.test.ts
```

Expected: FAIL because settings, preview and task UI do not exist. This is valid RED for the missing user-visible AI flow.

- [ ] **Step 3: Implement settings and task UI**

Add child routes:

```typescript
{ path: 'ai-settings', name: 'case-ai-settings', component: AiSettingsView }
{ path: 'ai', name: 'case-ai', component: AiAssistantView }
```

Vite development proxy may route only `/ai` to local `apps/api` at `http://127.0.0.1:3000`; do not add runtime caching or service-worker handling for AI traffic. Production client uses same-origin relative routes.

The UI must state:

- key is valid only for the current page session and refresh clears it;
- original files are not sent but derived pages may contain sensitive content;
- Provider terms may govern processing/retention;
- AI may be wrong and every candidate requires review;
- AI can be disabled and manual workflow remains available.

- [ ] **Step 4: Run GREEN and UI regression**

```powershell
pnpm exec vitest run apps/web/tests/ai-settings.test.ts apps/web/tests/ai-assistant.test.ts
pnpm --filter @youju/web test
pnpm --filter @youju/web typecheck
pnpm --filter @youju/web build
pnpm lint
git diff --check
git status --short
```

Expected: AI UI tests pass and all existing manual views remain reachable.

- [ ] **Step 5: Commit and stop**

```powershell
git add apps/web docs/superpowers/plans/2026-08-12-youju-m3-byok-ai-plan.md
git commit -m "feat: add BYOK AI task controls"
```

---

### Task 13: Add Candidate Review and Formal Confirmation UI

**Files:**

- Create: `apps/web/src/components/AiCandidateCard.vue`
- Create: `apps/web/src/components/SourceRegionPreview.vue`
- Create: `apps/web/src/views/AiReviewView.vue`
- Modify: `apps/web/src/router.ts`
- Modify: `apps/web/src/views/CaseWorkspaceView.vue`
- Modify: `apps/web/src/views/MaterialsView.vue`
- Modify: `apps/web/src/views/FactsView.vue`
- Modify: `apps/web/src/views/TimelineView.vue`
- Modify: `apps/web/src/views/StatementView.vue`
- Create: `apps/web/tests/ai-review-view.test.ts`
- Modify: `apps/web/tests/materials.test.ts`
- Modify: `apps/web/tests/facts.test.ts`
- Modify: `apps/web/tests/timeline.test.ts`
- Modify: `apps/web/tests/findings-and-statement.test.ts`
- Modify: `docs/superpowers/plans/2026-08-12-youju-m3-byok-ai-plan.md` Task 13 checkboxes only

**Interfaces:**

- Consumes: Task 5 `AiReviewService`, Task 4 persisted candidates and Task 6 local region rendering.
- Produces: pending/conflict/processed review lists, source page/region preview, edit-confirm/reject and eligible-only batch confirmation.

- [ ] **Step 1: Write failing review UI tests**

Assert candidates are visibly labeled “AI 候选” and grouped into 待确认、冲突、已处理. Each card shows candidate type/value, AI confidence, source original name resolved locally, page and highlighted region. URLs/HTML/Markdown in output render as plain text and never create links or executable markup.

Assert pending candidates allow confirm, edit then confirm and reject; conflicts cannot batch confirm; batch action appears only when every selected candidate passes `canBatchConfirm`; failure leaves all selected pending. Classification confirmation updates material only after click; fact/timeline confirmation creates formal records only after click; statement confirmation creates a draft and still requires the existing final “确认陈述”. Manual editing afterward clears candidate provenance where specified.

- [ ] **Step 2: Run RED**

```powershell
pnpm exec vitest run apps/web/tests/ai-review-view.test.ts apps/web/tests/materials.test.ts apps/web/tests/facts.test.ts apps/web/tests/timeline.test.ts apps/web/tests/findings-and-statement.test.ts
```

Expected: FAIL because review route, cards, region preview and UI review operations do not exist. This is valid RED for absent user confirmation behavior.

- [ ] **Step 3: Implement review components and route**

Add:

```typescript
{ path: 'ai-review', name: 'case-ai-review', component: AiReviewView }
```

`SourceRegionPreview` reads the original only through `EvidenceBlobStore`, derives the requested page again in memory, verifies the candidate page/region against stored dimensions, draws an inert overlay, and releases bytes/Object URLs on unmount. It never persists the preview.

Relevant M2 views may display provenance badges but must keep their manual controls and existing export semantics unchanged. Candidate stores are never queried by export services.

- [ ] **Step 4: Run GREEN and formal isolation gates**

```powershell
pnpm exec vitest run apps/web/tests/ai-review-view.test.ts apps/web/tests/materials.test.ts apps/web/tests/facts.test.ts apps/web/tests/timeline.test.ts apps/web/tests/findings-and-statement.test.ts
pnpm --filter @youju/web test
pnpm --filter @youju/web typecheck
pnpm lint
git diff --check
git status --short
```

Expected: all review and M2 view tests pass; unconfirmed candidates never appear as formal content.

- [ ] **Step 5: Commit and stop**

```powershell
git add apps/web docs/superpowers/plans/2026-08-12-youju-m3-byok-ai-plan.md
git commit -m "feat: review AI candidates locally"
```

---

### Task 14: Add Mock-Only E2E and Golden AI Evaluation

**Files:**

- Create: `fixtures/ecommerce-refund/case-001-transport-damage/ai/responses-classification.json`
- Create: `fixtures/ecommerce-refund/case-001-transport-damage/ai/chat-facts.json`
- Create: `fixtures/ecommerce-refund/case-001-transport-damage/ai/chat-timeline.json`
- Create: `fixtures/ecommerce-refund/case-001-transport-damage/ai/chat-statement.json`
- Create: `fixtures/ecommerce-refund/case-001-transport-damage/ai/malformed-first-response.json`
- Create: `fixtures/ecommerce-refund/case-001-transport-damage/ai/repaired-response.json`
- Create: `fixtures/ecommerce-refund/case-001-transport-damage/ai/expected-metrics.json`
- Modify: `fixtures/ecommerce-refund/case-001-transport-damage/manifest.json`
- Modify: `packages/test-support/src/fixture-schema.ts`
- Modify: `packages/test-support/src/load-fixture.ts`
- Modify: `packages/test-support/src/index.ts`
- Modify: `packages/test-support/tests/load-fixture.test.ts`
- Create: `scripts/evaluate-ai-golden-case.ts`
- Modify: `scripts/validate-fixtures.ts`
- Create: `tests/integration/ai-golden-evaluation.test.ts`
- Create: `tests/integration/m3-package-boundaries.test.ts`
- Create: `tests/e2e/byok-ai-flow.spec.ts`
- Create: `tests/e2e/byok-ai-errors.spec.ts`
- Modify: root `package.json`
- Modify: `docs/superpowers/plans/2026-08-12-youju-m3-byok-ai-plan.md` Task 14 checkboxes only

**Interfaces:**

- Consumes: complete M3 behavior from Tasks 1–13 and existing fictional M2 fixture.
- Produces: validated AI fixtures, deterministic metrics, mock protocol UI flows and package-boundary regression.

- [ ] **Step 1: Write failing fixture/evaluation and E2E tests**

Extend fixture validation to reject real-looking phone numbers, addresses, identity numbers, secrets, unknown fields and missing source tokens. `expected-metrics.json` must contain these exact deterministic expectations for the fixed fixture set:

```json
{
  "classification": { "correct": 4, "total": 4 },
  "facts": { "correct": 9, "total": 9 },
  "timeline": { "matched": 4, "expected": 4 },
  "sources": { "correct": 17, "total": 17 },
  "missingSourceCount": 0,
  "conflictCount": 0,
  "hallucinationCount": 0,
  "initialSchema": { "passed": 4, "total": 5 },
  "afterRepairSchema": { "passed": 5, "total": 5 }
}
```

The four normal task fixtures account for the initial passes; `malformed-first-response.json` is the fifth and only initial failure, and `repaired-response.json` makes it pass after the single internal repair. Any future fixture change must intentionally update both numerator and denominator under review.

`byok-ai-flow.spec.ts` uses Playwright route interception for same-origin `/ai/*` and fixed fixtures; it never starts or contacts a public Provider. Cover OpenAI Responses success, Chat Completions success, strict consent, session convenience invalidation, single classify/facts/timeline/statement, one-click sequence, eligible batch confirmation, edit-confirm, reject, conflict, final statement confirmation and formal export filtering.

`byok-ai-errors.spec.ts` covers auth, capability missing, rate, quota, timeout, invalid output, repair success/failure, cancellation, refresh and mid-sequence failure. Assert manual editing/export remains available after every error.

- [ ] **Step 2: Run RED**

```powershell
pnpm exec vitest run tests/integration/ai-golden-evaluation.test.ts tests/integration/m3-package-boundaries.test.ts
pnpm exec playwright test tests/e2e/byok-ai-flow.spec.ts tests/e2e/byok-ai-errors.spec.ts --project=chromium-desktop
```

Expected: FAIL because AI fixtures, evaluator and E2E scenarios do not exist. Existing app/test servers must start, making this valid RED.

- [ ] **Step 3: Implement evaluator and root scripts**

Add:

```json
"eval:golden-case": "tsx scripts/evaluate-ai-golden-case.ts"
```

Evaluator uses only exported `@youju/ai-core` functions and fixture files, returns nonzero on any mismatch, prints only case ID plus aggregate metrics, and never prints fixture content. Package-boundary test forbids browser direct Provider hosts, package `src` penetration, candidate imports in `document-export`, API persistence packages and real-network test helpers.

- [ ] **Step 4: Run GREEN across all browsers**

```powershell
pnpm --filter @youju/test-support test
pnpm validate:fixtures
pnpm test:ai-contract
pnpm eval:golden-case
pnpm exec vitest run tests/integration/ai-golden-evaluation.test.ts tests/integration/m3-package-boundaries.test.ts
pnpm exec playwright test tests/e2e/byok-ai-flow.spec.ts tests/e2e/byok-ai-errors.spec.ts
pnpm check:forbidden-content
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
git status --short
```

Expected: desktop Chromium, mobile Chromium and mobile WebKit pass; no test performs public network or real paid calls; formal data change count before confirmation is exactly zero.

- [ ] **Step 5: Commit and stop**

```powershell
git add fixtures packages/test-support scripts tests package.json docs/superpowers/plans/2026-08-12-youju-m3-byok-ai-plan.md
git commit -m "test: add M3 AI golden workflow"
```

---

### Task 15: Document, Threat-Review, and Verify M3

**Files:**

- Modify: `README.md`
- Modify: `docs/development/local-development.md`
- Modify: `docs/development/roadmap-and-test-order.md`
- Create: `docs/security/m3-threat-checklist.md`
- Modify: `docs/superpowers/plans/2026-08-12-youju-m3-byok-ai-plan.md` completed checkboxes only after evidence exists

**Interfaces:**

- Consumes: completed M3 implementation and actual verification evidence.
- Produces: accurate operator guidance, security traceability, final M3 verification record and explicit remaining risks.

- [ ] **Step 1: Update operational documentation**

Document exact Node/pnpm commands, API/Web local startup, same-origin `/ai` routing, all Provider presets, custom Base URL restrictions, session-only key behavior, source/page authorization, hard limits, cancellation, one repair, candidate review, AI disable/manual fallback, Mock-only tests and prohibition on production key use in automated tests.

Do not claim Provider availability, pricing, retention, accuracy or domestic reachability as permanent facts. State that M2 real-device and domestic-browser checks remain M4 release work.

- [ ] **Step 2: Write the M3 threat checklist**

Map each threat to code and tests:

- key leakage through state, logs, errors, snapshots, browser stores and service worker;
- original material upload or over-broad page/text authorization;
- SSRF, encoded URL bypass, mixed DNS answers, rebinding, TLS hostname mismatch, redirects and proxy variables;
- Provider retention and data-policy uncertainty;
- prompt injection, tool use, active model output and legal conclusions;
- Schema/source/region failure, hallucination and formal data contamination;
- batch partial publication, repair replay, cancellation and refresh;
- rate/memory/request/response exhaustion;
- candidate/analysis deletion references and event deletion residue;
- no-AI regression and export candidate isolation.

Separate automated evidence, manual checks and remaining risks. Do not mark manual real-Provider or real-device checks as performed unless actually run.

- [ ] **Step 3: Run document and contradiction scans**

```powershell
pnpm exec prettier --check README.md docs
pnpm check:forbidden-content
$scanPatterns = @('TB' + 'D', 'TO' + 'DO', 'FIX' + 'ME', 'implement ' + 'later', 'sk-' + '[A-Za-z0-9_-]{20,}')
rg -n ($scanPatterns -join '|') README.md docs/security docs/development
```

Expected: formatting and forbidden-content pass; scan has no matches. Plan files are excluded because self-review commands intentionally contain those tokens.

- [ ] **Step 4: Run frozen install and complete milestone verification**

```powershell
pnpm install --frozen-lockfile
pnpm check:forbidden-content
pnpm test:ai-contract
pnpm eval:golden-case
pnpm verify
git diff --check
git status --short
```

Expected: frozen install, all root gates, all browser projects, AI contract tests and golden evaluation pass. No real Provider is contacted.

- [ ] **Step 5: Review every approved M3 acceptance criterion**

Record concrete file/test evidence in `m3-threat-checklist.md` for dual protocols, four presets/custom target, memory-only key, no original upload, strict/convenience consent, source mapping, capability gating, candidate/formal isolation, one-click stages, cancellation, repair, limits, rate guard, deletion, AI-off M2 flow and all-browser E2E.

Any missing requirement is fixed in the owning earlier Task before Task 15 completion; it is not deferred in documentation.

- [ ] **Step 6: Commit and stop**

```powershell
git add README.md docs/development docs/security docs/superpowers/plans/2026-08-12-youju-m3-byok-ai-plan.md
git commit -m "docs: complete M3 BYOK AI guidance"
```

Do not push, merge, tag, create a PR, start M4 or run a real Provider without explicit user authorization.

---

## M3 Traceability Matrix

| Approved M3 requirement                                            | Owning Task(s)     |
| ------------------------------------------------------------------ | ------------------ |
| Analysis versions and formal candidate provenance                  | 1                  |
| Provider, capability, task and local/wire contracts                | 2                  |
| Schema/source/region validation, conflict and review eligibility   | 3                  |
| IndexedDB migration, AI stores and atomic candidate publication    | 4                  |
| User-confirmed formal writes and analysis/deletion protection      | 5                  |
| Bounded image/PDF page derivation without persistence              | 6                  |
| Session-only key and strict/convenience authorization              | 7                  |
| Presets, custom URL, SSRF, DNS rebinding and pinned TLS            | 8                  |
| OpenAI Responses, Chat Completions, prompts and repair             | 9                  |
| Fastify routes, limits, rate/concurrency, abort and log safety     | 10                 |
| Browser client, batching, cancellation and one-click sequence      | 11                 |
| Provider settings, sending preview and honest task progress        | 12                 |
| Candidate review, region preview and formal confirmation UI        | 13                 |
| Mock protocol E2E, golden metrics and package boundaries           | 14                 |
| Threat review, documentation, frozen install and full verification | 15                 |
| AI unavailable/disabled retains M2 manual workflow                 | 10, 11, 12, 14, 15 |
| Event deletion removes all AI data and temporary memory            | 5, 6, 14, 15       |

---

## Dependency Review Sources

Dependency choice was checked on 2026-08-12 against the official distribution and repository:

- [`pdfjs-dist@6.2.108`](https://www.npmjs.com/package/pdfjs-dist) is the prebuilt Mozilla PDF.js package and declares Apache-2.0;
- [Mozilla PDF.js repository](https://github.com/mozilla/pdf.js) documents the project and Apache-2.0 license.

Task 6 must verify the exact installed version and lockfile, record its package metadata, and stop if Vite/browser compatibility or local-worker isolation cannot be demonstrated. No Provider SDK is planned; Fastify uses Node built-ins and the existing workspace contracts.

---

## Plan Self-Review Record

The plan was reviewed against every section of `2026-08-12-youju-m3-byok-ai-design.md` before initial commit:

- [x] Every approved design and acceptance item maps to at least one Task in the traceability matrix.
- [x] Every runtime Task begins with a behavior-level failing test and an explicit valid RED reason.
- [x] Domain provenance and formal-data isolation precede browser/API/UI feature exposure.
- [x] Stable local IDs are present only in the local manifest and persisted provenance; wire contracts use task-scoped `sourceToken`.
- [x] `AiConfidenceLevel` is separate from existing rule confidence and batch confirmation reads only AI confidence plus deterministic eligibility.
- [x] Persisted analysis statuses exclude pre-consent and repair intermediates; server repair is represented only by final low-sensitivity metadata.
- [x] Provider presets, protocols, capabilities, request/response bounds, timeouts, limits, batching and repair count are fixed consistently.
- [x] Custom targets cannot bypass DNS/address/TLS/rebinding/redirect/proxy controls; inability to prove pinning is a stop condition.
- [x] API key has no serializer or persistence interface and is explicitly scanned across browser, API log, error and snapshot surfaces.
- [x] Derived media has explicit size/pixel/quality rules, never enters local stores and is released on every exit path.
- [x] Partial batches never publish; quick analysis uses separate versions and does not include statement generation.
- [x] Statement candidates create drafts only; the M2 final statement confirmation remains explicit.
- [x] Candidate/analysis deletion protection and event-wide verified deletion include all M3 stores and memory.
- [x] Mock and golden tests contain only fictional data and no automated path can call a real paid Provider.
- [x] Every Task ends with target tests, affected regression gates, `git diff --check`, focused commit and stop.
- [x] No Task includes push, PR, merge, tag, release, worktree, subagent, CI/CD or M4 implementation.
