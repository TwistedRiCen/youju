# 有据 M2 No-AI Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task with checkpoints. Project policy requires single-agent Inline Execution and prohibits subagent-driven execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一个无需注册、无需 API、无需 AI，即可在浏览器本地完成事件创建、材料导入、事实确认、时间线整理、规则检查、事实陈述、材料包导出和可验证删除的网购退款纠纷闭环。

**Architecture:** Vue Web/PWA 通过 `CaseRepository` 在 IndexedDB 保存结构化数据，通过 `EvidenceBlobStore` 在 OPFS 保存原始文件；跨存储操作使用显式操作日志恢复。领域确认、时间线、规则、摘要和导出均由独立的确定性 TypeScript 模块实现，`apps/api` 保持 M1 无状态健康检查边界。

**Tech Stack:** Node.js 24 LTS, pnpm 10.34.0, TypeScript strict, Vue 3, Vite 8, TypeBox, Vitest, Playwright, IndexedDB, OPFS, Web Locks, BroadcastChannel, `idb@8.0.3`, `@noble/hashes@2.2.0`, `fflate@0.8.3`, `pdf-lib@1.17.1`, `@pdf-lib/fontkit@1.1.1`.

## Global Constraints

- V0.1 只支持 `ecommerce_refund`，不增加法律判断、赔偿、结果预测、自动投诉或其他场景。
- 原始文件、事件、事实、时间线和导出内容不得发送给 `apps/api`；服务端不得增加业务持久化。
- 未配置 AI 时核心流程完整可用；M2 不创建 AI 设置、Provider、候选审核或 API Key 功能。
- 结构化数据只保存在 IndexedDB；原始文件只保存在 OPFS；不得使用 `localStorage`、Cookie、IndexedDB Blob 或内存文件回退。
- OPFS 不可用时允许结构化编辑，但禁用文件导入和含附件的正式导出，并显示明确能力说明。
- 每事件最多 50 个文件、单文件最多 50 MiB、事件总文件最多 500 MiB；导入前检查浏览器报告的剩余配额。
- 文件扩展名、MIME 和签名必须交叉检查；支持 JPEG、PNG、WebP 和 PDF。
- 同一事件内相同 SHA-256 不创建第二条材料记录；不同事件不共享文件。
- ID 使用 UUID v4，时间使用 ISO 8601 UTC，金额使用整数分或十进制定点字符串。
- 只有当前有效的 `ConfirmedFact`、已确认时间线、未过期的 `ConfirmedStatement` 和确定性规则结果可以进入正式输出。
- M2 导出为未加密标准提交包；不实现加密备份、恢复、云同步或回收站。
- 每个事件只允许一个写入标签页；其他标签页只读；冲突停止自动保存，不自动合并。
- 所有运行时行为严格执行 TDD：有效 RED、最小 GREEN、目标测试、受影响包测试和 Task 门禁。
- 浏览器存储、OPFS、Web Locks、刷新恢复和删除必须在 Playwright 真实浏览器中验证，不以自制 DOM mock 代替。
- 默认单智能体 Inline Execution，不创建 worktree 或子智能体；每次只执行用户明确授权的一个 Task，完成后提交并停止。
- 新依赖必须在 `docs/development/m2-dependencies.md` 记录用途、精确版本、许可证、维护状态、替代方案和采用理由。
- 不修改已批准的 V0.1 或 M2 设计规格；发现冲突时停止并报告。

---

## Execution Protocol for Every Task

每个 Task 开始时必须：

1. 在 `D:\Codex\youju` 按顺序阅读 `AGENTS.md`、V0.1 设计、Master Plan、本计划和本 Task 相关实现；
2. 确认 Node 为 `v24.x`、pnpm 为 `10.34.0`；
3. Task 1 创建分支后确认当前分支为 `feat/m2-no-ai-core`；Task 2 及之后在开始时确认该分支，且 `git status --short` 无输出；
4. 只修改该 Task 的 `Files`；
5. 完成有效 RED 后才写实现；
6. 运行该 Task 列出的全部命令、`git diff --check` 和 `git status --short`；
7. 只勾选本 Task 已取得证据的复选框，按指定信息提交，然后停止。

本计划经用户批准并提交后，Task 1 从包含该计划的当前干净 HEAD 创建 `feat/m2-no-ai-core`，并运行 `git merge-base --is-ancestor ac49e5abf9a2098f6caf2ff08886f0d73c33d126 HEAD` 确认已批准 M2 设计提交在历史中。不得创建或使用 worktree。

---

## File Map

### Existing modules changed during M2

- `packages/domain/src/schemas.ts`：M2 草稿、版本化确认事实、陈述和操作日志 Schema。
- `packages/domain/src/formal-facts.ts`：手工确认、替换和当前事实选择纯函数。
- `apps/web/src/storage/*`：`CaseRepository`、IndexedDB Schema、迁移和实现。
- `apps/web/src/views/*`：事件创建、工作台、材料、事实、时间线、缺口、陈述、导出和删除页面。
- `apps/web/src/services/*`：浏览器能力、用例编排、自动保存、导入、导出和删除。
- `apps/web/src/router.ts`：仅在对应页面可用时增加路由。
- `fixtures/ecommerce-refund/case-001-transport-damage/*`：迁移后的正式事实和 M2 完全虚构二进制材料。
- `tests/e2e/*`：真实浏览器存储、完整流程和移动端回归。

### New focused packages

- `packages/evidence-hash`：分块 SHA-256，不负责存储或 UI。
- `packages/evidence-store`：`EvidenceBlobStore` 端口和 OPFS 实现，不负责领域元数据。
- `packages/timeline`：稳定排序和确定性冲突检测，不负责持久化。
- `packages/document-export`：不可变导出快照、预检、安全文本输出、PDF 和流式 ZIP。

### M2 documentation

- `docs/development/m2-dependencies.md`：新增依赖审查记录。
- `docs/security/m2-threat-checklist.md`：M2 威胁模型、控制证据和最终验证记录。

---

### Task 1: Extend Domain Contracts and Formal Fact Versioning

**Files:**

- Modify: `packages/domain/src/schemas.ts`
- Modify: `packages/domain/src/index.ts`
- Create: `packages/domain/src/formal-facts.ts`
- Create: `packages/domain/src/case-status.ts`
- Modify: `packages/domain/tests/schemas.test.ts`
- Create: `packages/domain/tests/formal-facts.test.ts`
- Create: `packages/domain/tests/case-status.test.ts`
- Modify: `fixtures/ecommerce-refund/case-001-transport-damage/expected/facts.json`
- Modify: `docs/superpowers/plans/2026-07-31-youju-m2-no-ai-core-plan.md` checkboxes for Task 1 only

**Interfaces:**

- Consumes: M1 `CaseEvent`, `EvidenceFile`, `FactType`, `FactFieldName`, `SourceReference` and candidate provenance.
- Produces: `FactDraftSchema`, versioned `ConfirmedFactSchema`, `StatementDraftSchema`, `ConfirmedStatementSchema`, `OperationJournalEntrySchema`, `M2ErrorCodeSchema`, formal fact functions and `deriveCaseStatus()`.

- [x] **Step 1: Create the implementation branch and verify the baseline**

Run:

```powershell
git switch -c feat/m2-no-ai-core
git merge-base --is-ancestor ac49e5abf9a2098f6caf2ff08886f0d73c33d126 HEAD
node --version
pnpm --version
git status --short
```

Expected: branch creation succeeds; Node is `v24.x`; pnpm is `10.34.0`; status has no output.

- [x] **Step 2: Write failing schema and lifecycle tests**

Add assertions that the following objects validate and reject unknown fields:

```typescript
const draft = {
  id: '00000000-0000-4000-8000-000000000501',
  caseId: validCase.id,
  factType: 'payment',
  fieldName: 'paid_amount',
  value: '89900',
  sourceRefs: [{ evidenceId: '00000000-0000-4000-8000-000000000020' }],
  updatedAt: '2026-07-31T01:00:00.000Z',
  revision: 1,
}

const confirmed = confirmManualFact({
  draft,
  id: '00000000-0000-4000-8000-000000000601',
  confirmedAt: '2026-07-31T01:01:00.000Z',
})

expect(confirmed).toMatchObject({
  fieldName: 'paid_amount',
  confirmationMethod: 'manual',
  derivedFromCandidateId: null,
  replacesFactId: null,
  version: 1,
})
expect(selectCurrentConfirmedFacts([confirmed])).toEqual([confirmed])
```

Also assert:

- payment drafts reject `899.123`;
- `factType`/`fieldName` mismatches fail;
- a replacement has `replacesFactId` equal to the old ID and `version: 2`;
- two unrelated current facts for the same `fieldName` remain visible to later conflict detection;
- a statement draft requires content, fact IDs, timeline IDs, rule version, update time and positive revision;
- a confirmed statement requires fact IDs, timeline IDs, rule version, confirmation time and positive version;
- operation journal variants accept only their discriminated stages;
- candidate-derived confirmed facts retain candidate provenance while receiving `fieldName`, `replacesFactId` and `version`.
- case status is `draft` without formal content, `in_progress` after confirmation, `ready_to_export` after successful current preflight and `exported` only while the successful export still matches current content.
- M2 error codes accept only `storage_not_supported`, `storage_quota_exceeded`, `file_type_mismatch`, `file_too_large`, `duplicate_evidence`, `hash_mismatch`, `concurrent_edit_conflict`, `export_validation_failed` and `delete_verification_failed`.

- [x] **Step 3: Run RED**

Run:

```powershell
pnpm exec vitest run packages/domain/tests/schemas.test.ts packages/domain/tests/formal-facts.test.ts packages/domain/tests/case-status.test.ts
```

Expected: FAIL because `FactDraftSchema`, statement/operation schemas and formal fact lifecycle functions do not exist. This is valid RED because the M2 domain behavior is absent.

- [x] **Step 4: Implement the minimal contracts and pure functions**

Use these public signatures:

```typescript
export interface StatementDraft {
  readonly id: UuidV4
  readonly caseId: UuidV4
  readonly content: string
  readonly confirmedFactIds: readonly UuidV4[]
  readonly confirmedTimelineEntryIds: readonly UuidV4[]
  readonly ruleVersion: string
  readonly updatedAt: UtcTimestamp
  readonly revision: number
}

export type ImportOperationStage = 'validating' | 'hashing' | 'writing' | 'committing' | 'failed'
export type DeleteOperationStage = 'deleting' | 'verifying' | 'failed'
export type ExportOperationStage = 'preparing' | 'writing' | 'finalizing' | 'failed'

export interface EvidenceDeleteOperation {
  readonly operationId: UuidV4
  readonly operationType: 'evidence_delete'
  readonly caseId: UuidV4
  readonly evidenceId: UuidV4
  readonly storageRef: string
  readonly stage: DeleteOperationStage
  readonly startedAt: UtcTimestamp
  readonly errorCode: M2ErrorCode | null
}

export type M2ErrorCode =
  | 'storage_not_supported'
  | 'storage_quota_exceeded'
  | 'file_type_mismatch'
  | 'file_too_large'
  | 'duplicate_evidence'
  | 'hash_mismatch'
  | 'concurrent_edit_conflict'
  | 'export_validation_failed'
  | 'delete_verification_failed'

export interface ConfirmManualFactInput {
  readonly draft: FactDraft
  readonly id: UuidV4
  readonly confirmedAt: UtcTimestamp
}

export function confirmManualFact(input: ConfirmManualFactInput): ConfirmedFact

export function replaceConfirmedFact(input: {
  readonly current: ConfirmedFact
  readonly draft: FactDraft
  readonly id: UuidV4
  readonly confirmedAt: UtcTimestamp
}): ConfirmedFact

export function selectCurrentConfirmedFacts(facts: readonly ConfirmedFact[]): ConfirmedFact[]

export function deriveCaseStatus(input: {
  readonly hasFormalContent: boolean
  readonly currentPreflightReady: boolean
  readonly currentSnapshotExported: boolean
}): CaseStatus
```

`selectCurrentConfirmedFacts()` excludes any fact whose ID is referenced by another fact's `replacesFactId`, preserves deterministic order by `fieldName` then `version` then ID, and never mutates input. Update the six golden facts with exact `fieldName` values, `replacesFactId: null` and `version: 1`.

- [x] **Step 5: Run GREEN and regression gates**

Run:

```powershell
pnpm --filter @youju/domain test
pnpm --filter @youju/domain typecheck
pnpm validate:fixtures
pnpm lint
pnpm typecheck
pnpm test
git diff --check
git status --short
```

Expected: all commands pass; status lists only Task 1 files and this plan checkbox update.

- [x] **Step 6: Commit and stop**

```powershell
git add packages/domain fixtures/ecommerce-refund/case-001-transport-damage/expected/facts.json docs/superpowers/plans/2026-07-31-youju-m2-no-ai-core-plan.md
git commit -m "feat: extend no-AI domain contracts"
```

---

### Task 2: Add the CaseRepository Port and IndexedDB Implementation

**Files:**

- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/web/src/storage/case-repository.ts`
- Create: `apps/web/src/storage/database-schema.ts`
- Create: `apps/web/src/storage/open-database.ts`
- Create: `apps/web/src/storage/indexeddb-case-repository.ts`
- Create: `apps/web/src/storage/index.ts`
- Create: `tests/e2e/case-repository.spec.ts`
- Create: `docs/development/m2-dependencies.md`
- Modify: `docs/superpowers/plans/2026-07-31-youju-m2-no-ai-core-plan.md` checkboxes for Task 2 only

**Interfaces:**

- Consumes: M2 domain contracts from Task 1.
- Produces: `CaseRepository`, `IndexedDbCaseRepository`, ordered database migrations through version 2 and the eight approved object stores.

- [x] **Step 1: Write the failing real-browser repository contract**

The Playwright test dynamically imports `/src/storage/index.ts` in the served browser and asserts:

```typescript
const created = await repository.createCase(caseEvent, initialDrafts, 'writer-a')
expect(created.revision).toBe(1)

const loaded = await repository.getCase(caseEvent.id)
expect(loaded?.caseEvent.title).toBe('运输破损退款纠纷')
expect(loaded?.factDrafts).toHaveLength(6)

const updated = await repository.updateCase({
  caseId: caseEvent.id,
  expectedRevision: 1,
  patch: { title: '运输破损退款纠纷（已保存）' },
  updatedAt: '2026-07-31T02:00:00.000Z',
  writerId: 'writer-a',
})
expect(updated.revision).toBe(2)
```

Add a second writer update with `expectedRevision: 1` and assert a typed `concurrent_edit_conflict`. Close and reopen the repository and assert data survives. Create a legacy version 1 database with a case, open the current version 2 database and assert migration preserves it. Inject a migration that throws, assert its upgrade transaction aborts and the version 1 data remains readable. Open an artificial database at a newer version and assert the app refuses writes without deleting it.

- [x] **Step 2: Run RED**

```powershell
pnpm exec playwright test tests/e2e/case-repository.spec.ts --project=chromium-desktop
```

Expected: FAIL because the repository module does not exist. The dev server and Playwright must start successfully, making this a valid behavior RED.

- [x] **Step 3: Add the reviewed dependency**

Install exactly:

```powershell
pnpm --filter @youju/web add idb@8.0.3
```

Record in `m2-dependencies.md`: ISC license, Promise/typed IndexedDB purpose, active modern-browser support, native IndexedDB alternative, and rejection of callback-heavy transaction code. Do not add `idb-keyval`.

- [x] **Step 4: Implement the port and schema**

Use:

```typescript
export interface StoredCase {
  readonly caseEvent: CaseEvent
  readonly revision: number
  readonly lastWriterId: string
}

export interface CaseAggregate extends StoredCase {
  readonly factDrafts: readonly FactDraft[]
}

export interface UpdateCaseCommand {
  readonly caseId: UuidV4
  readonly expectedRevision: number
  readonly patch: Partial<Pick<CaseEvent, 'title' | 'requestedResolution' | 'status'>>
  readonly updatedAt: UtcTimestamp
  readonly writerId: string
}

export interface CaseRepository {
  createCase(
    caseEvent: CaseEvent,
    drafts: readonly FactDraft[],
    writerId: string,
  ): Promise<StoredCase>
  listCases(): Promise<readonly StoredCase[]>
  getCase(caseId: UuidV4): Promise<CaseAggregate | null>
  updateCase(command: UpdateCaseCommand): Promise<StoredCase>
  replaceFactDrafts(
    caseId: UuidV4,
    expectedRevision: number,
    drafts: readonly FactDraft[],
    writerId: string,
  ): Promise<number>
  close(): void
}
```

Database `youju-local` current version 2 uses ordered migrations. Version 1 creates `cases` and `factDrafts`; version 2 adds `confirmedFacts`, `timelineEntries`, `statementDrafts`, `confirmedStatements`, `evidenceMetadata` and `operationJournal` plus child `caseId` indexes. A fresh database executes both migrations in one upgrade transaction. `openYoujuDatabase()` accepts an explicit migration list so failure-abort behavior is testable, while production always passes the exported fixed list. `blocked`, `blocking` and `terminated` produce low-sensitivity storage errors. A newer unknown database version reports `storage_not_supported` and blocks writes; it is never deleted automatically.

- [x] **Step 5: Run GREEN and regression gates**

```powershell
pnpm exec playwright test tests/e2e/case-repository.spec.ts --project=chromium-desktop
pnpm --filter @youju/web typecheck
pnpm lint
pnpm typecheck
pnpm test
git diff --check
git status --short
```

- [x] **Step 6: Commit and stop**

```powershell
git add apps/web/package.json apps/web/src/storage tests/e2e/case-repository.spec.ts docs/development/m2-dependencies.md pnpm-lock.yaml docs/superpowers/plans/2026-07-31-youju-m2-no-ai-core-plan.md
git commit -m "feat: add IndexedDB case repository"
```

---

### Task 3: Add Local Case Creation, Workspace, and Autosave

**Files:**

- Modify: `apps/web/src/router.ts`
- Modify: `apps/web/src/views/HomeView.vue`
- Create: `apps/web/src/views/CreateCaseView.vue`
- Create: `apps/web/src/views/CaseWorkspaceView.vue`
- Create: `apps/web/src/services/case-service.ts`
- Create: `apps/web/src/composables/use-autosave.ts`
- Create: `apps/web/tests/create-case.test.ts`
- Create: `apps/web/tests/autosave.test.ts`
- Create: `tests/e2e/local-case-workspace.spec.ts`
- Modify: `docs/superpowers/plans/2026-07-31-youju-m2-no-ai-core-plan.md` checkboxes for Task 3 only

**Interfaces:**

- Consumes: `CaseRepository` and `FactDraft`.
- Produces: routes `/cases/new` and `/cases/:caseId`, six-field creation flow, autosave state and refresh recovery.

- [ ] **Step 1: Write failing component and browser tests**

The component test asserts the creation form has exactly these fields: title, purchase time, merchant name, product name, paid amount and requested resolution. It contains the local-data risk statement and no account, telephone, password or AI control.

The E2E test:

```typescript
await page.goto('/')
await page.getByRole('link', { name: '创建本地事件' }).click()
await page.getByLabel('事件标题').fill('运输破损退款纠纷')
await page.getByLabel('购买时间').fill('2026-07-01T12:16')
await page.getByLabel('商家名称').fill('晴川生活示例店')
await page.getByLabel('商品名称').fill('便携折叠桌（虚构商品）')
await page.getByLabel('实付金额（元）').fill('899.00')
await page.getByLabel('期望处理结果').fill('退货并退还已支付金额')
await page.getByRole('button', { name: '创建事件' }).click()
await expect(page.getByText('已保存到此设备')).toBeVisible()
await page.reload()
await expect(page.getByDisplayValue('晴川生活示例店')).toBeVisible()
```

- [ ] **Step 2: Run RED**

```powershell
pnpm exec vitest run apps/web/tests/create-case.test.ts apps/web/tests/autosave.test.ts
pnpm exec playwright test tests/e2e/local-case-workspace.spec.ts --project=chromium-desktop
```

Expected: FAIL because the routes, forms and services do not exist; existing M1 tests still start successfully.

- [ ] **Step 3: Implement minimal creation and autosave**

Use:

```typescript
export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'conflict' | 'failed'

export interface AutosaveController<T> {
  readonly status: Readonly<Ref<AutosaveStatus>>
  schedule(value: T): void
  flush(): Promise<void>
  dispose(): Promise<void>
}
```

Create the `CaseEvent` and six `FactDraft` records in one IndexedDB transaction. Convert `899.00` to `89900` without floating-point arithmetic. Use a 400 ms debounce, flush on route leave and `visibilitychange`, and preserve unsaved form values if persistence fails. Workspace navigation initially exposes only Overview; later Tasks add real sections, so do not add disabled placeholder controls.

- [ ] **Step 4: Run GREEN and Task gates**

```powershell
pnpm --filter @youju/web test
pnpm exec playwright test tests/e2e/local-case-workspace.spec.ts --project=chromium-desktop
pnpm --filter @youju/web typecheck
pnpm lint
pnpm typecheck
pnpm test
git diff --check
git status --short
```

- [ ] **Step 5: Commit and stop**

```powershell
git add apps/web/src apps/web/tests tests/e2e/local-case-workspace.spec.ts docs/superpowers/plans/2026-07-31-youju-m2-no-ai-core-plan.md
git commit -m "feat: add local case workspace"
```

---

### Task 4: Detect Browser Capabilities and Enforce Single-Writer Editing

**Files:**

- Create: `apps/web/src/browser/browser-capabilities.ts`
- Create: `apps/web/src/concurrency/case-write-lock.ts`
- Create: `apps/web/src/composables/use-case-write-lock.ts`
- Modify: `apps/web/src/views/CaseWorkspaceView.vue`
- Create: `apps/web/tests/browser-capabilities.test.ts`
- Create: `tests/e2e/case-concurrency.spec.ts`
- Modify: `docs/superpowers/plans/2026-07-31-youju-m2-no-ai-core-plan.md` checkboxes for Task 4 only

**Interfaces:**

- Consumes: repository revision checks and workspace autosave.
- Produces: `BrowserCapabilities`, `CaseWriteLock`, read-only secondary tabs and `concurrent_edit_conflict` feedback.

- [ ] **Step 1: Write failing capability and multi-page tests**

```typescript
export interface BrowserCapabilities {
  readonly indexedDb: boolean
  readonly opfs: boolean
  readonly webCrypto: boolean
  readonly webLocks: boolean
  readonly broadcastChannel: boolean
  readonly quotaEstimate: boolean
}

export interface CaseWriteLease {
  readonly mode: 'writer' | 'reader'
  release(): Promise<void>
}
```

Playwright opens two pages in one context on the same case. Assert the first shows `可编辑`, the second shows `另一标签页正在编辑，本页只读`, and the second has disabled form inputs. After closing the first page, the second can explicitly acquire editing. A repository test with stale revision must still return `concurrent_edit_conflict` when Web Locks are absent.

- [ ] **Step 2: Run RED**

```powershell
pnpm exec vitest run apps/web/tests/browser-capabilities.test.ts
pnpm exec playwright test tests/e2e/case-concurrency.spec.ts --project=chromium-desktop
```

Expected: FAIL because capability detection and write-lock coordination are absent.

- [ ] **Step 3: Implement capability detection and locking**

Use the lock name `youju:case:<caseId>`. When `navigator.locks` exists, request an exclusive lock with `ifAvailable: true` and retain it until lease release. Use `BroadcastChannel('youju:case-locks')` only for notifications, never as the authority. Without Web Locks, allow repository revision checks to remain the final write guard. On conflict, stop autosave, keep the visible form values and require reload; do not merge.

Show:

- IndexedDB missing: event creation blocked;
- OPFS missing: structured editing available, materials and formal attachment export unavailable;
- missing Web Locks/BroadcastChannel: editing continues with revision protection and a compatibility notice.

- [ ] **Step 4: Run GREEN and Task gates**

```powershell
pnpm --filter @youju/web test
pnpm exec playwright test tests/e2e/case-concurrency.spec.ts --project=chromium-desktop
pnpm lint
pnpm typecheck
pnpm test
pnpm e2e
git diff --check
git status --short
```

- [ ] **Step 5: Commit and stop**

```powershell
git add apps/web/src/browser apps/web/src/concurrency apps/web/src/composables apps/web/src/views/CaseWorkspaceView.vue apps/web/tests tests/e2e/case-concurrency.spec.ts docs/superpowers/plans/2026-07-31-youju-m2-no-ai-core-plan.md
git commit -m "feat: enforce single-writer case editing"
```

---

### Task 5: Add Incremental SHA-256 Evidence Hashing

**Files:**

- Create: `packages/evidence-hash/package.json`
- Create: `packages/evidence-hash/tsconfig.json`
- Create: `packages/evidence-hash/vitest.config.ts`
- Create: `packages/evidence-hash/src/sha256.ts`
- Create: `packages/evidence-hash/src/index.ts`
- Create: `packages/evidence-hash/tests/sha256.test.ts`
- Modify: `docs/development/m2-dependencies.md`
- Modify: `pnpm-lock.yaml`
- Modify: `docs/superpowers/plans/2026-07-31-youju-m2-no-ai-core-plan.md` checkboxes for Task 5 only

**Interfaces:**

- Consumes: byte chunks and browser `Blob` objects.
- Produces: `sha256Hex()` and `sha256Blob()` with bounded chunk reads.

- [ ] **Step 1: Write failing known-vector and chunk-equivalence tests**

```typescript
expect(await sha256Hex([new TextEncoder().encode('abc')])).toBe(
  'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
)

const bytes = new Uint8Array(2 * 1024 * 1024 + 17).map((_, index) => index % 251)
expect(await sha256Blob(new Blob([bytes]), 64 * 1024)).toBe(
  await sha256Blob(new Blob([bytes]), 1024 * 1024),
)
```

Add a test that records each `Blob.slice()` size and asserts no read exceeds the requested chunk size.

- [ ] **Step 2: Run RED**

```powershell
pnpm exec vitest run packages/evidence-hash/tests/sha256.test.ts
```

Expected: FAIL because `@youju/evidence-hash` does not exist.

- [ ] **Step 3: Create the package and install the reviewed dependency**

Create `package.json` first with package name `@youju/evidence-hash`, public export `./src/index.ts` and the standard `lint`, `typecheck`, `test` and `build` scripts used by existing packages. Then run:

```powershell
pnpm --filter @youju/evidence-hash add @noble/hashes@2.2.0
```

The package exports only:

```typescript
export async function sha256Hex(
  chunks: Iterable<Uint8Array> | AsyncIterable<Uint8Array>,
): Promise<string>

export async function sha256Blob(blob: Blob, chunkSize?: number): Promise<string>
```

Import `sha256` from `@noble/hashes/sha2.js` and use `sha256.create().update(chunk).digest()`. Default chunk size is exactly 1 MiB. Record MIT license, zero runtime dependencies, incremental API, Web Crypto one-shot limitation and the exact version in `m2-dependencies.md`.

- [ ] **Step 4: Run GREEN and package gates**

```powershell
pnpm --filter @youju/evidence-hash test
pnpm --filter @youju/evidence-hash typecheck
pnpm lint
pnpm typecheck
pnpm test
git diff --check
git status --short
```

- [ ] **Step 5: Commit and stop**

```powershell
git add packages/evidence-hash docs/development/m2-dependencies.md pnpm-lock.yaml docs/superpowers/plans/2026-07-31-youju-m2-no-ai-core-plan.md
git commit -m "feat: add streaming evidence hashing"
```

---

### Task 6: Add the EvidenceBlobStore Port and OPFS Implementation

**Files:**

- Create: `packages/evidence-store/package.json`
- Create: `packages/evidence-store/tsconfig.json`
- Create: `packages/evidence-store/vitest.config.ts`
- Create: `packages/evidence-store/src/evidence-blob-store.ts`
- Create: `packages/evidence-store/src/opfs-paths.ts`
- Create: `packages/evidence-store/src/opfs-evidence-blob-store.ts`
- Create: `packages/evidence-store/src/index.ts`
- Create: `packages/evidence-store/tests/opfs-paths.test.ts`
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `tests/e2e/opfs-evidence-store.spec.ts`
- Modify: `docs/superpowers/plans/2026-07-31-youju-m2-no-ai-core-plan.md` checkboxes for Task 6 only

**Interfaces:**

- Consumes: UUID v4 case, evidence and operation IDs plus byte streams.
- Produces: `EvidenceBlobStore` and `OpfsEvidenceBlobStore` with staging, commit, read, enumerate and verified deletion.

- [ ] **Step 1: Write failing path and real-browser storage tests**

The path test asserts exact internal paths:

```typescript
expect(evidenceStoragePath(caseId, evidenceId)).toBe(
  'cases/00000000-0000-4000-8000-000000000001/evidence/00000000-0000-4000-8000-000000000101',
)
expect(temporaryStoragePath(operationId)).toBe('temporary/00000000-0000-4000-8000-000000000701')
expect(() => evidenceStoragePath('../case', evidenceId)).toThrow('invalid_uuid')
```

The Playwright test stages three chunks, reads the staged file, commits it, verifies byte equality, closes and recreates the store, verifies persistence, deletes the case and asserts both formal and temporary paths are absent.

- [ ] **Step 2: Run RED**

```powershell
pnpm exec vitest run packages/evidence-store/tests/opfs-paths.test.ts
pnpm exec playwright test tests/e2e/opfs-evidence-store.spec.ts --project=chromium-desktop
```

Expected: FAIL because the package and browser implementation do not exist.

- [ ] **Step 3: Implement the package**

Create `package.json` first with package name `@youju/evidence-store`, public export `./src/index.ts` and standard package scripts. Add its domain dependency and connect the Web consumer:

```powershell
pnpm --filter @youju/evidence-store add @youju/domain@workspace:*
pnpm --filter @youju/web add @youju/evidence-store@workspace:*
```

```typescript
export interface StagedEvidenceBlob {
  readonly operationId: UuidV4
  readonly temporaryStorageRef: string
  readonly size: number
}

export interface EvidenceBlobStore {
  stage(operationId: UuidV4, chunks: AsyncIterable<Uint8Array>): Promise<StagedEvidenceBlob>
  commit(staged: StagedEvidenceBlob, caseId: UuidV4, evidenceId: UuidV4): Promise<string>
  read(storageRef: string): Promise<Blob>
  exists(storageRef: string): Promise<boolean>
  delete(storageRef: string): Promise<void>
  deleteTemporary(operationId: UuidV4): Promise<void>
  listCaseStorageRefs(caseId: UuidV4): Promise<readonly string[]>
  deleteCase(caseId: UuidV4): Promise<void>
}
```

Obtain the root only through `navigator.storage.getDirectory()`. Write chunks through `createWritable()`, close before verification, copy staged content to the final UUID-only path without loading the whole file, and delete the temporary file only after the final size matches. Convert `NotAllowedError` and `QuotaExceededError` to stable low-sensitivity codes. Do not expose `FileSystemHandle` from the public interface.

- [ ] **Step 4: Run GREEN and Task gates**

```powershell
pnpm --filter @youju/evidence-store test
pnpm --filter @youju/evidence-store typecheck
pnpm exec playwright test tests/e2e/opfs-evidence-store.spec.ts --project=chromium-desktop
pnpm lint
pnpm typecheck
pnpm test
git diff --check
git status --short
```

- [ ] **Step 5: Commit and stop**

```powershell
git add packages/evidence-store apps/web/package.json tests/e2e/opfs-evidence-store.spec.ts pnpm-lock.yaml docs/superpowers/plans/2026-07-31-youju-m2-no-ai-core-plan.md
git commit -m "feat: add OPFS evidence storage"
```

---

### Task 7: Validate and Import Evidence with Recovery

**Files:**

- Modify: `apps/web/src/storage/case-repository.ts`
- Modify: `apps/web/src/storage/indexeddb-case-repository.ts`
- Create: `apps/web/src/evidence/file-validation.ts`
- Create: `apps/web/src/evidence/evidence-errors.ts`
- Create: `apps/web/src/services/evidence-import-service.ts`
- Create: `apps/web/src/services/recover-local-operations.ts`
- Create: `apps/web/tests/file-validation.test.ts`
- Create: `apps/web/tests/evidence-import-service.test.ts`
- Create: `tests/e2e/evidence-import.spec.ts`
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `docs/superpowers/plans/2026-07-31-youju-m2-no-ai-core-plan.md` checkboxes for Task 7 only

**Interfaces:**

- Consumes: `CaseRepository`, `EvidenceBlobStore` and `sha256Blob()`.
- Produces: deterministic file validation, `importEvidence()`, same-case dedupe and idempotent import recovery.

- [ ] **Step 1: Write failing validation tests**

Create exact signature cases:

| Extension | MIME              | Leading bytes             | Result                      |
| --------- | ----------------- | ------------------------- | --------------------------- |
| `.jpg`    | `image/jpeg`      | `ff d8 ff`                | accept                      |
| `.png`    | `image/png`       | `89 50 4e 47 0d 0a 1a 0a` | accept                      |
| `.webp`   | `image/webp`      | `RIFF....WEBP`            | accept                      |
| `.pdf`    | `application/pdf` | `%PDF-`                   | accept                      |
| `.png`    | `image/jpeg`      | JPEG bytes                | reject `file_type_mismatch` |
| `.exe`    | `application/pdf` | PDF bytes                 | reject `file_type_mismatch` |

Also assert 51st file, a file larger than 50 MiB, total larger than 500 MiB and insufficient reported quota are rejected without changing existing records.

- [ ] **Step 2: Write failing import orchestration and browser tests**

Use injected fakes to assert stage order:

```typescript
expect(events).toEqual([
  'journal:validating',
  'journal:hashing',
  'journal:writing',
  'blob:stage',
  'journal:committing',
  'blob:commit',
  'repository:add-ready-evidence',
  'journal:remove',
])
```

The browser test imports a valid synthetic PNG, asserts `EvidenceFile.sha256` and OPFS bytes, imports the same file again and receives `duplicate_evidence` with the existing evidence ID, then creates an interrupted `writing` journal entry, reloads and asserts temporary data and the entry are removed.

- [ ] **Step 3: Run RED**

```powershell
pnpm exec vitest run apps/web/tests/file-validation.test.ts apps/web/tests/evidence-import-service.test.ts
pnpm exec playwright test tests/e2e/evidence-import.spec.ts --project=chromium-desktop
```

Expected: FAIL because validation, repository evidence methods and import orchestration are absent.

- [ ] **Step 4: Implement validation and repository methods**

Connect the hashing package before implementation:

```powershell
pnpm --filter @youju/web add @youju/evidence-hash@workspace:*
```

```typescript
export interface EvidenceImportLimits {
  readonly currentFileCount: number
  readonly currentTotalBytes: number
  readonly remainingQuotaBytes: number | null
}

export type ImportEvidenceResult =
  | { readonly status: 'imported'; readonly evidence: EvidenceFile }
  | {
      readonly status: 'duplicate'
      readonly errorCode: 'duplicate_evidence'
      readonly existingEvidenceId: UuidV4
    }

export interface ImportEvidenceCommand {
  readonly caseId: UuidV4
  readonly evidenceId: UuidV4
  readonly operationId: UuidV4
  readonly file: File
  readonly category: EvidenceCategory
  readonly importedAt: UtcTimestamp
  readonly limits: EvidenceImportLimits
}

export interface EvidenceImportDependencies {
  readonly repository: CaseRepository
  readonly blobStore: EvidenceBlobStore
  readonly hashBlob: (blob: Blob) => Promise<string>
}

export async function importEvidence(
  command: ImportEvidenceCommand,
  dependencies: EvidenceImportDependencies,
): Promise<ImportEvidenceResult>
```

Repository additions are explicit: `listEvidence(caseId)`, `findEvidenceByHash(caseId, sha256)`, `addReadyEvidence(evidence, operationId)`, `putOperation(entry)`, `listOperations()` and `deleteOperation(operationId)`. Only `addReadyEvidence` can create `evidenceMetadata`. Recovery rules are exact: `validating`/`hashing` remove journal; `writing` deletes temp then journal; `committing` verifies final file and metadata, completing or rolling back.

- [ ] **Step 5: Run GREEN and Task gates**

```powershell
pnpm --filter @youju/web test
pnpm exec playwright test tests/e2e/evidence-import.spec.ts --project=chromium-desktop
pnpm --filter @youju/web typecheck
pnpm lint
pnpm typecheck
pnpm test
git diff --check
git status --short
```

- [ ] **Step 6: Commit and stop**

```powershell
git add apps/web/src/storage apps/web/src/evidence apps/web/src/services apps/web/tests tests/e2e/evidence-import.spec.ts apps/web/package.json pnpm-lock.yaml docs/superpowers/plans/2026-07-31-youju-m2-no-ai-core-plan.md
git commit -m "feat: add verified evidence import"
```

---

### Task 8: Add Material Management and Manual Classification

**Files:**

- Modify: `apps/web/src/router.ts`
- Modify: `apps/web/src/views/CaseWorkspaceView.vue`
- Create: `apps/web/src/views/MaterialsView.vue`
- Create: `apps/web/src/components/EvidenceImportField.vue`
- Create: `apps/web/src/components/EvidenceList.vue`
- Create: `apps/web/src/services/evidence-service.ts`
- Create: `apps/web/tests/materials.test.ts`
- Create: `tests/e2e/material-management.spec.ts`
- Modify: `docs/superpowers/plans/2026-07-31-youju-m2-no-ai-core-plan.md` checkboxes for Task 8 only

**Interfaces:**

- Consumes: capability detection, `importEvidence()` and evidence repository methods.
- Produces: real Materials workspace section, multi-file sequential import, category updates and visible digest/status feedback.

- [ ] **Step 1: Write failing UI and browser tests**

Assert every category from `EvidenceCategorySchema` appears with Simplified Chinese labels. Import two valid files and one MIME/signature mismatch; the two valid materials remain, the bad file shows `文件扩展名、类型与内容不一致`, and only that file is rejected. Change a category, reload and assert it persists. Assert displayed fields include original name, category, byte size, imported time and full SHA-256.

Simulate missing `navigator.storage.getDirectory` before app load and assert:

- structured event editing remains available;
- file input is absent or disabled;
- text says `当前浏览器不能可靠保存原始材料`;
- no IndexedDB Blob record is created.

- [ ] **Step 2: Run RED**

```powershell
pnpm exec vitest run apps/web/tests/materials.test.ts
pnpm exec playwright test tests/e2e/material-management.spec.ts --project=chromium-desktop
```

Expected: FAIL because no Materials route or UI exists.

- [ ] **Step 3: Implement the minimal materials flow**

Add route `/cases/:caseId/materials` only with working import and list behavior. Process selected files sequentially so one failure cannot roll back earlier successful imports. Use repository:

```typescript
updateEvidenceCategory(
  caseId: UuidV4,
  evidenceId: UuidV4,
  category: EvidenceCategory,
): Promise<EvidenceFile>
```

Use object URLs only for optional local preview and revoke them on component unmount or replacement. Do not parse PDF contents, upload files, add remote icons or create AI classification controls.

- [ ] **Step 4: Run GREEN and Task gates**

```powershell
pnpm --filter @youju/web test
pnpm exec playwright test tests/e2e/material-management.spec.ts --project=chromium-desktop
pnpm lint
pnpm typecheck
pnpm test
pnpm e2e
git diff --check
git status --short
```

- [ ] **Step 5: Commit and stop**

```powershell
git add apps/web/src apps/web/tests tests/e2e/material-management.spec.ts docs/superpowers/plans/2026-07-31-youju-m2-no-ai-core-plan.md
git commit -m "feat: add material management flow"
```

---

### Task 9: Add Manual Fact Entry, Confirmation, and Replacement

**Files:**

- Modify: `packages/domain/src/formal-facts.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/domain/tests/formal-facts.test.ts`
- Modify: `apps/web/src/storage/case-repository.ts`
- Modify: `apps/web/src/storage/indexeddb-case-repository.ts`
- Modify: `apps/web/src/router.ts`
- Modify: `apps/web/src/views/CaseWorkspaceView.vue`
- Create: `apps/web/src/views/FactsView.vue`
- Create: `apps/web/src/components/FactEditor.vue`
- Create: `apps/web/src/services/fact-service.ts`
- Create: `apps/web/tests/facts.test.ts`
- Create: `tests/e2e/manual-facts.spec.ts`
- Modify: `docs/superpowers/plans/2026-07-31-youju-m2-no-ai-core-plan.md` checkboxes for Task 9 only

**Interfaces:**

- Consumes: M2 formal fact functions, ready evidence and repository drafts.
- Produces: source requirement policy, persisted confirmations, replacements and current formal fact view.

- [ ] **Step 1: Write failing policy and UI tests**

Add:

```typescript
expect(requiresEvidenceSource('purchase_time')).toBe(true)
expect(requiresEvidenceSource('paid_amount')).toBe(true)
expect(requiresEvidenceSource('problem_description')).toBe(false)
expect(requiresEvidenceSource('requested_resolution')).toBe(false)
```

The component test confirms a transaction fact may be manually confirmed without evidence so the structured OPFS-degraded flow remains usable, but it shows `正式导出前必须关联材料`; problem description and requested resolution do not show that required-source warning. The E2E test confirms six facts, edits merchant name, reconfirms it, and asserts the old version remains in IndexedDB but only version 2 appears as current. Task 12 must block export until required-source warnings are resolved.

- [ ] **Step 2: Run RED**

```powershell
pnpm exec vitest run packages/domain/tests/formal-facts.test.ts apps/web/tests/facts.test.ts
pnpm exec playwright test tests/e2e/manual-facts.spec.ts --project=chromium-desktop
```

Expected: FAIL because source policy, confirmed fact repository methods and Facts UI are absent.

- [ ] **Step 3: Implement fact persistence and UI**

Expose:

```typescript
export function requiresEvidenceSource(fieldName: FactFieldName): boolean

export interface ConfirmFactCommand {
  readonly draftId: UuidV4
  readonly confirmedFactId: UuidV4
  readonly confirmedAt: UtcTimestamp
  readonly sourceRefs: readonly SourceReference[]
  readonly replacesFactId: UuidV4 | null
}
```

Repository methods `listConfirmedFacts(caseId)` and `confirmFact(command)` run in one transaction and preserve history. Validate every supplied source belongs to the same case and exists in `evidenceMetadata`; an empty source array is permitted for manual confirmation and is enforced later by export preflight according to `requiresEvidenceSource()`. Confirmation is always an explicit button; autosave applies to drafts only. The first confirmation moves the case to `in_progress`; any later formal-content change also rolls `ready_to_export` or `exported` back to `in_progress`. Do not construct `FactCandidate` objects in M2.

- [ ] **Step 4: Run GREEN and Task gates**

```powershell
pnpm --filter @youju/domain test
pnpm --filter @youju/web test
pnpm exec playwright test tests/e2e/manual-facts.spec.ts --project=chromium-desktop
pnpm validate:fixtures
pnpm lint
pnpm typecheck
pnpm test
git diff --check
git status --short
```

- [ ] **Step 5: Commit and stop**

```powershell
git add packages/domain apps/web/src apps/web/tests tests/e2e/manual-facts.spec.ts docs/superpowers/plans/2026-07-31-youju-m2-no-ai-core-plan.md
git commit -m "feat: add manual fact confirmation"
```

---

### Task 10: Add Timeline Sorting, Confirmation, and Conflict Detection

**Files:**

- Create: `packages/timeline/package.json`
- Create: `packages/timeline/tsconfig.json`
- Create: `packages/timeline/vitest.config.ts`
- Create: `packages/timeline/src/sort-timeline.ts`
- Create: `packages/timeline/src/detect-conflicts.ts`
- Create: `packages/timeline/src/index.ts`
- Create: `packages/timeline/tests/timeline.test.ts`
- Modify: `apps/web/package.json`
- Modify: `apps/web/src/storage/case-repository.ts`
- Modify: `apps/web/src/storage/indexeddb-case-repository.ts`
- Modify: `apps/web/src/router.ts`
- Modify: `apps/web/src/views/CaseWorkspaceView.vue`
- Create: `apps/web/src/views/TimelineView.vue`
- Create: `apps/web/src/services/timeline-service.ts`
- Create: `apps/web/tests/timeline.test.ts`
- Create: `tests/e2e/manual-timeline.spec.ts`
- Modify: `pnpm-lock.yaml`
- Modify: `docs/superpowers/plans/2026-07-31-youju-m2-no-ai-core-plan.md` checkboxes for Task 10 only

**Interfaces:**

- Consumes: current `ConfirmedFact[]` and `TimelineEntry[]`.
- Produces: `sortTimeline()`, `detectTimelineConflicts()`, timeline persistence and confirmation UI.

- [ ] **Step 1: Write failing pure-function tests**

Use an input containing minute, date, approximate and unknown entries. Assert:

1. known timestamps sort ascending;
2. equal timestamps sort by original `sortOrder` then ID;
3. unknown timestamps follow known entries and retain user order;
4. input arrays are not mutated;
5. a later `sortOrder` with an earlier precise time produces `sequence_conflict`;
6. two current facts with the same `fieldName` but unequal values produce `fact_value_conflict`;
7. replacement history excluded by `selectCurrentConfirmedFacts()` does not create a conflict.

```typescript
export type TimelineConflict =
  | {
      readonly type: 'sequence_conflict'
      readonly timelineEntryIds: readonly [UuidV4, UuidV4]
    }
  | {
      readonly type: 'fact_value_conflict'
      readonly fieldName: FactFieldName
      readonly confirmedFactIds: readonly UuidV4[]
    }
```

- [ ] **Step 2: Write failing UI and browser tests**

The E2E test adds four timeline entries, attaches sources, confirms each, reloads and asserts stable order. It then moves a later dated entry before an earlier dated entry and asserts `时间顺序存在冲突` plus a visible export-blocking status.

- [ ] **Step 3: Run RED**

```powershell
pnpm exec vitest run packages/timeline/tests/timeline.test.ts apps/web/tests/timeline.test.ts
pnpm exec playwright test tests/e2e/manual-timeline.spec.ts --project=chromium-desktop
```

Expected: FAIL because `@youju/timeline` and Timeline UI do not exist.

- [ ] **Step 4: Implement package, repository methods, and UI**

```typescript
export function sortTimeline(entries: readonly TimelineEntry[]): TimelineEntry[]

export function detectTimelineConflicts(input: {
  readonly entries: readonly TimelineEntry[]
  readonly currentFacts: readonly ConfirmedFact[]
}): TimelineConflict[]
```

Create `package.json` with package name `@youju/timeline`, standard scripts and public export `./src/index.ts`, then connect dependencies:

```powershell
pnpm --filter @youju/timeline add @youju/domain@workspace:*
pnpm --filter @youju/web add @youju/timeline@workspace:*
```

Repository methods are `putTimelineDraft(entry)`, `confirmTimelineEntry(id)`, `listTimeline(caseId)` and `reorderTimeline(caseId, orderedIds)`. Confirmation is explicit. `occurredAt` must be null for `unknown` and non-null for other precisions. Only `confirmed` entries feed conflicts and later exports. Any timeline change rolls `ready_to_export` or `exported` back to `in_progress`.

- [ ] **Step 5: Run GREEN and Task gates**

```powershell
pnpm --filter @youju/timeline test
pnpm --filter @youju/timeline typecheck
pnpm --filter @youju/web test
pnpm exec playwright test tests/e2e/manual-timeline.spec.ts --project=chromium-desktop
pnpm lint
pnpm typecheck
pnpm test
git diff --check
git status --short
```

- [ ] **Step 6: Commit and stop**

```powershell
git add packages/timeline apps/web/package.json apps/web/src apps/web/tests tests/e2e/manual-timeline.spec.ts pnpm-lock.yaml docs/superpowers/plans/2026-07-31-youju-m2-no-ai-core-plan.md
git commit -m "feat: add timeline editing and conflicts"
```

---

### Task 11: Add Rule Findings and Versioned Statement Confirmation

**Files:**

- Create: `packages/domain/src/statements.ts`
- Modify: `packages/domain/src/index.ts`
- Create: `packages/domain/tests/statements.test.ts`
- Modify: `apps/web/src/storage/case-repository.ts`
- Modify: `apps/web/src/storage/indexeddb-case-repository.ts`
- Create: `apps/web/src/services/load-ecommerce-rule.ts`
- Create: `apps/web/src/services/statement-service.ts`
- Modify: `apps/web/src/router.ts`
- Modify: `apps/web/src/views/CaseWorkspaceView.vue`
- Create: `apps/web/src/views/FindingsView.vue`
- Create: `apps/web/src/views/StatementView.vue`
- Create: `apps/web/tests/findings-and-statement.test.ts`
- Create: `tests/e2e/statement-workflow.spec.ts`
- Modify: `docs/superpowers/plans/2026-07-31-youju-m2-no-ai-core-plan.md` checkboxes for Task 11 only

**Interfaces:**

- Consumes: current confirmed facts, confirmed timeline, deterministic rule findings and rule version.
- Produces: `buildStatementDraft()`, `confirmStatement()`, rule findings UI and stale-statement invalidation.

- [ ] **Step 1: Write failing deterministic statement tests**

```typescript
const draft = buildStatementDraft({
  caseEvent,
  confirmedFacts,
  confirmedTimeline,
  findings,
})

expect(draft.content).toContain('2026年7月1日')
expect(draft.content).toContain('晴川生活示例店')
expect(draft.content).toContain('退货并退还已支付金额89900分')
expect(draft.content).not.toMatch(/违法|赔偿|胜诉率|成功率/)
expect(draft.confirmedFactIds).toEqual(confirmedFacts.map(({ id }) => id))
```

Assert a statement is current only when its fact IDs, timeline IDs and rule version exactly match the latest formal snapshot. Replacing a fact or confirming another timeline entry makes it stale. Draft, old confirmed versions and stale versions remain stored but are excluded from formal output.

- [ ] **Step 2: Write failing browser workflow**

The E2E test shows exact blocking required-fact findings and warning recommended-evidence findings, confirms the generated statement, edits a confirmed merchant fact, and asserts the statement becomes `内容已过期，请重新确认`.

- [ ] **Step 3: Run RED**

```powershell
pnpm exec vitest run packages/domain/tests/statements.test.ts apps/web/tests/findings-and-statement.test.ts
pnpm exec playwright test tests/e2e/statement-workflow.spec.ts --project=chromium-desktop
```

Expected: FAIL because statement functions, persistence and pages are absent.

- [ ] **Step 4: Implement deterministic statement behavior**

```typescript
export interface FormalSnapshotIdentity {
  readonly confirmedFactIds: readonly UuidV4[]
  readonly confirmedTimelineEntryIds: readonly UuidV4[]
  readonly ruleVersion: string
}

export interface BuildStatementDraftInput {
  readonly caseEvent: CaseEvent
  readonly confirmedFacts: readonly ConfirmedFact[]
  readonly confirmedTimeline: readonly TimelineEntry[]
  readonly findings: readonly RuleFinding[]
  readonly ruleVersion: string
  readonly updatedAt: UtcTimestamp
  readonly revision: number
}

export interface ConfirmStatementInput {
  readonly draft: StatementDraft
  readonly id: UuidV4
  readonly confirmedAt: UtcTimestamp
  readonly version: number
}

export function buildStatementDraft(input: BuildStatementDraftInput): StatementDraft
export function confirmStatement(input: ConfirmStatementInput): ConfirmedStatement
export function isStatementCurrent(
  statement: ConfirmedStatement,
  identity: FormalSnapshotIdentity,
): boolean
```

Load the existing versioned YAML as a Vite raw asset and pass it through `parseEcommerceRefundRule()`; do not duplicate rule data in Web code. Repository methods persist statement drafts and append confirmed statement versions. Any fact, timeline or rule identity change invalidates current status by comparison, not by destructive update.

- [ ] **Step 5: Run GREEN and Task gates**

```powershell
pnpm --filter @youju/domain test
pnpm --filter @youju/rule-engine test
pnpm --filter @youju/web test
pnpm exec playwright test tests/e2e/statement-workflow.spec.ts --project=chromium-desktop
pnpm validate:fixtures
pnpm lint
pnpm typecheck
pnpm test
git diff --check
git status --short
```

- [ ] **Step 6: Commit and stop**

```powershell
git add packages/domain apps/web/src apps/web/tests tests/e2e/statement-workflow.spec.ts docs/superpowers/plans/2026-07-31-youju-m2-no-ai-core-plan.md
git commit -m "feat: add rule and statement workflow"
```

---

### Task 12: Add Export Snapshot, Preflight, CSV, and Safe HTML

**Files:**

- Create: `packages/document-export/package.json`
- Create: `packages/document-export/tsconfig.json`
- Create: `packages/document-export/vitest.config.ts`
- Create: `packages/document-export/src/export-model.ts`
- Create: `packages/document-export/src/preflight.ts`
- Create: `packages/document-export/src/file-names.ts`
- Create: `packages/document-export/src/digest-csv.ts`
- Create: `packages/document-export/src/attachment-index.ts`
- Create: `packages/document-export/src/index.ts`
- Create: `packages/document-export/tests/preflight.test.ts`
- Create: `packages/document-export/tests/safe-text-output.test.ts`
- Modify: `pnpm-lock.yaml`
- Modify: `docs/superpowers/plans/2026-07-31-youju-m2-no-ai-core-plan.md` checkboxes for Task 12 only

**Interfaces:**

- Consumes: immutable current case, facts, timeline, statement, findings and ready evidence metadata.
- Produces: `ExportSnapshot`, `validateExportSnapshot()`, stable names, safe CSV and inert HTML.

- [ ] **Step 1: Write failing preflight tests**

```typescript
expect(validateExportSnapshot(validSnapshot)).toEqual({
  status: 'ready',
  warnings: [{ code: 'recommended_evidence_missing', evidenceCategory: 'payment_record' }],
})

expect(validateExportSnapshot({ ...validSnapshot, statement: staleStatement })).toEqual({
  status: 'blocked',
  reasons: [{ code: 'statement_stale' }],
  warnings: expect.any(Array),
})
```

Add exact blocking cases for missing required fact, required source absent, unresolved conflict, unconfirmed timeline reference, missing ready evidence, missing OPFS capability, missing blob and hash mismatch. Warning-only missing recommended evidence does not block.

- [ ] **Step 2: Write failing output safety tests**

Assert:

- CSV cells beginning with `=`, `+`, `-` or `@` are prefixed safely and quoted;
- HTML escapes `<script>`, quotes and ampersands;
- generated HTML contains no `script`, inline event attribute, remote URL or active form;
- `sanitizeFileName('../订单:<记录>.png')` returns a traversal-free stable name;
- duplicate sanitized attachment names receive deterministic numeric suffixes;
- ZIP entry names reject absolute paths, backslashes, control characters and `..` segments.

- [ ] **Step 3: Run RED**

```powershell
pnpm exec vitest run packages/document-export/tests/preflight.test.ts packages/document-export/tests/safe-text-output.test.ts
```

Expected: FAIL because `@youju/document-export` does not exist.

- [ ] **Step 4: Implement the package without PDF or ZIP dependencies**

Create `package.json` with package name `@youju/document-export`, standard scripts and public export `./src/index.ts`, then connect only the existing workspace contracts:

```powershell
pnpm --filter @youju/document-export add @youju/domain@workspace:* @youju/rule-engine@workspace:* @youju/timeline@workspace:*
```

```typescript
export interface ExportSnapshot {
  readonly caseEvent: CaseEvent
  readonly confirmedFacts: readonly ConfirmedFact[]
  readonly confirmedTimeline: readonly TimelineEntry[]
  readonly statement: ConfirmedStatement
  readonly findings: readonly RuleFinding[]
  readonly evidence: readonly EvidenceExportItem[]
  readonly conflicts: readonly TimelineConflict[]
  readonly generatedAt: UtcTimestamp
  readonly appVersion: string
  readonly opfsAvailable: boolean
}

export interface EvidenceExportItem {
  readonly metadata: EvidenceFile
  readonly integrity:
    | { readonly status: 'verified'; readonly actualSha256: string }
    | { readonly status: 'missing' }
    | { readonly status: 'hash_mismatch'; readonly actualSha256: string }
}

export type ExportBlockReason =
  | { readonly code: 'missing_required_fact'; readonly fieldName: FactFieldName }
  | { readonly code: 'missing_required_source'; readonly confirmedFactId: UuidV4 }
  | { readonly code: 'unresolved_conflict'; readonly conflictIndex: number }
  | { readonly code: 'timeline_unconfirmed'; readonly timelineEntryId: UuidV4 }
  | { readonly code: 'statement_missing' }
  | { readonly code: 'statement_stale' }
  | { readonly code: 'evidence_missing'; readonly evidenceId: UuidV4 }
  | { readonly code: 'evidence_hash_mismatch'; readonly evidenceId: UuidV4 }
  | { readonly code: 'opfs_unavailable' }

export type ExportWarning = {
  readonly code: 'recommended_evidence_missing'
  readonly evidenceCategory: EvidenceCategory
}

export type ExportPreflightResult =
  | { readonly status: 'ready'; readonly warnings: readonly ExportWarning[] }
  | {
      readonly status: 'blocked'
      readonly reasons: readonly ExportBlockReason[]
      readonly warnings: readonly ExportWarning[]
    }
```

Every reason and warning is a discriminated typed object, not a free-form string. CSV uses UTF-8 with BOM for spreadsheet compatibility. HTML is a complete offline document with `lang="zh-CN"` and no script or remote resource. The application service sets case status to `ready_to_export` only for a ready result and to `in_progress` for a previously ready/exported case that becomes blocked.

- [ ] **Step 5: Run GREEN and package gates**

```powershell
pnpm --filter @youju/document-export test
pnpm --filter @youju/document-export typecheck
pnpm lint
pnpm typecheck
pnpm test
git diff --check
git status --short
```

- [ ] **Step 6: Commit and stop**

```powershell
git add packages/document-export pnpm-lock.yaml docs/superpowers/plans/2026-07-31-youju-m2-no-ai-core-plan.md
git commit -m "feat: add export preflight and safe indexes"
```

---

### Task 13: Generate PDF Documents and Stream the Submission ZIP

**Files:**

- Modify: `packages/document-export/package.json`
- Create: `packages/document-export/src/pdf-sections.ts`
- Create: `packages/document-export/src/pdf-renderer.ts`
- Create: `packages/document-export/src/zip-writer.ts`
- Modify: `packages/document-export/src/index.ts`
- Create: `packages/document-export/tests/pdf-renderer.test.ts`
- Create: `packages/document-export/tests/zip-writer.test.ts`
- Modify: `apps/web/package.json`
- Create: `apps/web/src/assets/fonts/NotoSansCJKsc-Regular.otf`
- Create: `apps/web/src/assets/fonts/OFL.txt`
- Create: `apps/web/src/services/export-service.ts`
- Modify: `apps/web/src/services/recover-local-operations.ts`
- Create: `apps/web/src/views/ExportView.vue`
- Modify: `apps/web/src/router.ts`
- Modify: `apps/web/src/views/CaseWorkspaceView.vue`
- Create: `apps/web/tests/export.test.ts`
- Create: `tests/e2e/submission-package.spec.ts`
- Modify: `docs/development/m2-dependencies.md`
- Modify: `pnpm-lock.yaml`
- Modify: `docs/superpowers/plans/2026-07-31-youju-m2-no-ai-core-plan.md` checkboxes for Task 13 only

**Interfaces:**

- Consumes: ready `ExportSnapshot`, original evidence blobs and locally bundled font bytes.
- Produces: three parseable PDFs, fixed package directory, streamed ZIP sink and browser download workflow.

- [ ] **Step 1: Write failing PDF section and rendering tests**

`buildPdfSections(snapshot)` must produce:

1. event statement sections: cover, use boundary, basic facts, statement, missing-material warnings, generation metadata;
2. timeline sections: confirmed entries, precision and source numbers;
3. evidence sections: number, category, original name, size, import time and SHA-256.

Use a long Simplified Chinese statement spanning at least three pages. Assert every generated byte array loads with `PDFDocument.load()`, has the expected title metadata, at least the expected page count, and is deterministic for fixed `generatedAt`.

- [ ] **Step 2: Write failing ZIP structure test**

Given two attachments, collect sink chunks, unzip and assert exact entries:

```text
有据_事件材料包_20260731_1200/01_事件说明.pdf
有据_事件材料包_20260731_1200/02_事件时间线.pdf
有据_事件材料包_20260731_1200/03_证据材料清单.pdf
有据_事件材料包_20260731_1200/04_材料摘要校验表.csv
有据_事件材料包_20260731_1200/05_附件索引.html
有据_事件材料包_20260731_1200/06_原始材料/001_order.png
有据_事件材料包_20260731_1200/06_原始材料/002_payment.pdf
```

Assert attachment bytes and SHA-256 match, no unexpected entry exists, and an aborted writer calls `sink.abort()` without `sink.close()`.

- [ ] **Step 3: Run RED**

```powershell
pnpm exec vitest run packages/document-export/tests/pdf-renderer.test.ts packages/document-export/tests/zip-writer.test.ts apps/web/tests/export.test.ts
```

Expected: FAIL because PDF, ZIP and browser export implementations are absent.

- [ ] **Step 4: Add reviewed dependencies and font asset**

```powershell
pnpm --filter @youju/document-export add pdf-lib@1.17.1 @pdf-lib/fontkit@1.1.1 fflate@0.8.3
```

Obtain `Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf` and the root `LICENSE` from the official Noto CJK repository, save them under the exact target names above, record the resolved upstream commit and SHA-256 in `m2-dependencies.md`, and verify no runtime request leaves the origin. Record MIT licenses for the three libraries, the font's SIL Open Font License, their maintenance state, PDF custom-font/ZIP streaming purpose and rejected print-to-PDF/handwritten format alternatives.

- [ ] **Step 5: Implement PDF and streaming ZIP**

Connect the Web consumer with `pnpm --filter @youju/web add @youju/document-export@workspace:*`, then implement:

```typescript
export interface ZipChunkSink {
  write(chunk: Uint8Array): Promise<void>
  close(): Promise<void>
  abort(): Promise<void>
}

export interface SubmissionPdfs {
  readonly statement: Uint8Array
  readonly timeline: Uint8Array
  readonly evidenceList: Uint8Array
}

export async function renderSubmissionPdfs(
  snapshot: ExportSnapshot,
  fontBytes: Uint8Array,
): Promise<SubmissionPdfs>

export async function writeSubmissionPackage(input: {
  readonly snapshot: ExportSnapshot
  readonly pdfs: SubmissionPdfs
  readonly openEvidence: (evidence: EvidenceFile) => Promise<Blob>
  readonly sink: ZipChunkSink
}): Promise<void>
```

Before creating the immutable snapshot, the Web service reopens every referenced OPFS blob and recomputes SHA-256 with `@youju/evidence-hash`; missing or mismatched blobs become `EvidenceExportItem.integrity` failures and stop before document generation. Register fontkit, embed the local font with `subset: true`, wrap text by measured width, paginate deterministically and never parse uploaded PDFs. Use `fflate.Zip` plus `ZipPassThrough` for already-compressed attachments. Serialize asynchronous sink writes through a promise chain so chunks remain ordered. The Web service writes a `package_export/preparing` journal, advances it through `writing` and `finalizing`, and streams to an OPFS temporary export file. After package completion, it creates a download Object URL, triggers download, revokes it, deletes temporary output and removes the journal. Startup recovery deletes incomplete export files and journals idempotently. A successful export sets case status to `exported`; later formal changes roll it back through the rules in Tasks 9–12.

- [ ] **Step 6: Implement export UI and browser verification**

The Export page shows all typed block reasons and warnings, the unencrypted-sensitive-data warning and one working `生成材料包` button only when ready. Playwright imports fictional material, completes the minimum formal snapshot, downloads the ZIP, parses entries in the test process and verifies attachment digests.

- [ ] **Step 7: Run GREEN, performance proof, and Task gates**

```powershell
pnpm --filter @youju/document-export test
pnpm --filter @youju/document-export typecheck
pnpm --filter @youju/web test
pnpm exec playwright test tests/e2e/submission-package.spec.ts --project=chromium-desktop
pnpm exec playwright test tests/e2e/submission-package.spec.ts --project=webkit-mobile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
git status --short
```

Expected: long Chinese text paginates; a 50 MiB synthetic attachment test proves reads and sink writes stay within the configured chunk bound; both browser projects and all gates pass. If font subsetting, pagination or streaming fails, stop and return to design review; do not replace it with remote fonts, print dialogs or full-memory ZIP.

- [ ] **Step 8: Commit and stop**

```powershell
git add packages/document-export apps/web/package.json apps/web/src apps/web/tests tests/e2e/submission-package.spec.ts docs/development/m2-dependencies.md pnpm-lock.yaml docs/superpowers/plans/2026-07-31-youju-m2-no-ai-core-plan.md
git commit -m "feat: generate submission packages"
```

---

### Task 14: Add Referenced-Evidence Protection and Verified Hard Deletion

**Files:**

- Modify: `apps/web/src/storage/case-repository.ts`
- Modify: `apps/web/src/storage/indexeddb-case-repository.ts`
- Create: `apps/web/src/services/reference-service.ts`
- Create: `apps/web/src/services/delete-case-service.ts`
- Modify: `apps/web/src/services/recover-local-operations.ts`
- Modify: `apps/web/src/views/MaterialsView.vue`
- Create: `apps/web/src/views/DeleteCaseView.vue`
- Modify: `apps/web/src/router.ts`
- Modify: `apps/web/src/views/CaseWorkspaceView.vue`
- Create: `apps/web/tests/deletion.test.ts`
- Create: `tests/e2e/verified-deletion.spec.ts`
- Modify: `docs/superpowers/plans/2026-07-31-youju-m2-no-ai-core-plan.md` checkboxes for Task 14 only

**Interfaces:**

- Consumes: all case child stores and `EvidenceBlobStore`.
- Produces: material reference inspection, blocked referenced deletion, journaled hard deletion and post-delete verification.

- [ ] **Step 1: Write failing reference and service tests**

```typescript
expect(await referenceService.findEvidenceReferences(caseId, evidenceId)).toEqual([
  { type: 'confirmed_fact', id: confirmedFactId },
  { type: 'timeline_entry', id: timelineEntryId },
])

await expect(referenceService.deleteEvidence(caseId, evidenceId)).rejects.toMatchObject({
  code: 'evidence_is_referenced',
  references: expect.any(Array),
})
```

For individual unreferenced evidence deletion, assert an `evidence_delete` journal survives a one-time OPFS failure and recovery completes only after both the blob and metadata are absent. For whole-case deletion, inject a blob store that fails once. Assert the first run returns `delete_verification_failed` with `remaining: ['opfs']`, does not report success, leaves a `deleting` journal entry, and a second run completes idempotently.

- [ ] **Step 2: Write failing real-browser deletion test**

Create a case with material, facts, timeline and statement. Assert individual deletion of a referenced material is blocked and lists references. Open the event deletion page, verify counts, enter an incorrect title and remain blocked, enter the exact title, delete, then assert:

- case route returns to the local case list;
- every IndexedDB store has zero records for the case;
- `listCaseStorageRefs(caseId)` is empty;
- no temporary import or export file remains;
- no hidden backup or trash record exists.

- [ ] **Step 3: Run RED**

```powershell
pnpm exec vitest run apps/web/tests/deletion.test.ts
pnpm exec playwright test tests/e2e/verified-deletion.spec.ts --project=chromium-desktop
```

Expected: FAIL because reference protection and verified cross-storage deletion are absent.

- [ ] **Step 4: Implement deletion and verification**

```typescript
export type DeleteCaseResult =
  | { readonly status: 'deleted' }
  | {
      readonly status: 'failed'
      readonly code: 'delete_verification_failed'
      readonly remaining: readonly ('indexeddb' | 'opfs' | 'temporary')[]
    }

export interface DeleteCaseCommand {
  readonly caseId: UuidV4
  readonly operationId: UuidV4
  readonly expectedTitle: string
  readonly enteredTitle: string
  readonly startedAt: UtcTimestamp
}

export interface DeleteCaseDependencies {
  readonly repository: CaseRepository
  readonly blobStore: EvidenceBlobStore
}

export async function deleteCasePermanently(
  command: DeleteCaseCommand,
  dependencies: DeleteCaseDependencies,
): Promise<DeleteCaseResult>
```

Individual evidence deletion uses `evidence_delete/deleting`, removes the OPFS blob, removes metadata, changes to `verifying`, verifies both are absent, then clears the journal. Whole-case order is fixed: create `case_delete/deleting` journal, delete formal and temporary OPFS data, delete structured child records, delete case record, change journal to `verifying`, query every store and enumerate OPFS, then remove the journal. Because the journal itself must survive deletion until verification, store it by `operationId` and exclude that active entry from the “case records absent” check. Startup recovery resumes `evidence_delete` and `case_delete` entries in both `deleting` and `verifying`.

The UI shows counts and recommends export without requiring it. Deletion requires exact event title, is immediate, has no undo and only shows success after verification.

- [ ] **Step 5: Run GREEN and Task gates**

```powershell
pnpm --filter @youju/web test
pnpm exec playwright test tests/e2e/verified-deletion.spec.ts --project=chromium-desktop
pnpm exec playwright test tests/e2e/verified-deletion.spec.ts --project=webkit-mobile
pnpm lint
pnpm typecheck
pnpm test
pnpm e2e
git diff --check
git status --short
```

- [ ] **Step 6: Commit and stop**

```powershell
git add apps/web/src apps/web/tests tests/e2e/verified-deletion.spec.ts docs/superpowers/plans/2026-07-31-youju-m2-no-ai-core-plan.md
git commit -m "feat: verify local case deletion"
```

---

### Task 15: Add Binary Golden Materials and the Complete No-AI E2E

**Files:**

- Create: `fixtures/ecommerce-refund/case-001-transport-damage/binary/01-order-record.png`
- Create: `fixtures/ecommerce-refund/case-001-transport-damage/binary/02-payment-record.pdf`
- Create: `fixtures/ecommerce-refund/case-001-transport-damage/binary/03-product-issue.png`
- Create: `fixtures/ecommerce-refund/case-001-transport-damage/binary/04-merchant-communication.pdf`
- Modify: `fixtures/ecommerce-refund/case-001-transport-damage/manifest.json`
- Modify: `fixtures/ecommerce-refund/case-001-transport-damage/README.md`
- Create: `scripts/generate-m2-binary-fixtures.ts`
- Modify: `scripts/validate-fixtures.ts`
- Modify: `packages/test-support/src/fixture-schema.ts`
- Modify: `packages/test-support/src/load-fixture.ts`
- Modify: `packages/test-support/tests/load-fixture.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `tests/e2e/no-ai-core.spec.ts`
- Create: `tests/integration/m2-package-boundaries.test.ts`
- Modify: `docs/superpowers/plans/2026-07-31-youju-m2-no-ai-core-plan.md` checkboxes for Task 15 only

**Interfaces:**

- Consumes: the complete M2 user flow and document package.
- Produces: reproducible fictional binary fixture set, boundary regression and full no-AI golden E2E.

- [ ] **Step 1: Write failing fixture and boundary tests**

Fixture validation asserts exact files, supported media types, non-zero sizes and fixed SHA-256 values recorded in the manifest. It rejects a missing file, hash mismatch, unsupported extension and `fictional: false`.

The boundary test scans imports and production build output to assert:

- Web business modules do not import `apps/api` or call `/health` during case work;
- API imports no M2 storage/export package;
- no `localStorage`, analytics SDK, remote font URL or IndexedDB Blob fallback appears in M2 sources;
- package imports use public `@youju/*` entries.

- [ ] **Step 2: Write the failing complete E2E**

In one test:

1. create the event with the six-field wizard;
2. import the four binary files;
3. reload and verify four materials;
4. classify them into the four golden categories;
5. confirm the six golden facts;
6. add and confirm four golden timeline entries;
7. verify deterministic rule findings;
8. generate, edit and confirm the statement;
9. export and parse the fixed ZIP structure;
10. compare every attachment digest with the manifest;
11. delete the event;
12. verify IndexedDB, OPFS and temporary data contain no case residue.

Run the same behavioral test for `chromium-desktop`, `chromium-mobile` and `webkit-mobile`. Assertions use visible labels and downloaded artifacts, not internal component state.

- [ ] **Step 3: Run RED**

```powershell
pnpm exec vitest run packages/test-support/tests/load-fixture.test.ts tests/integration/m2-package-boundaries.test.ts
pnpm exec playwright test tests/e2e/no-ai-core.spec.ts
```

Expected: FAIL because binary fixtures, manifest fields and complete workflow test are absent. Existing fixture tests must still start.

- [ ] **Step 4: Implement reproducible fictional fixtures**

Connect the root-only generator to the existing export package with:

```powershell
pnpm add -Dw @youju/document-export@workspace:*
```

`generate-m2-binary-fixtures.ts` writes only the four exact target files:

- PNG files use a deterministic minimal PNG encoder with fixed dimensions, fixed pixel data, fixed text metadata and no timestamps;
- PDF files use `pdf-lib` with fixed metadata dates, the local Noto font and `subset: true`;
- all content uses the existing fictional platform, merchant, product and amounts;
- the generator refuses output outside the case `binary` directory;
- after generation it prints path, size and SHA-256, never file content.

Run it once, record exact hashes in the manifest, commit the outputs, then rerun and assert byte-for-byte equality. Do not add real logos, names, phone numbers, addresses, orders or chats.

- [ ] **Step 5: Implement validator, boundary check, and E2E helpers**

Extend the fixture schema with:

```typescript
binaryEvidence: Type.Array(
  Type.Object(
    {
      evidenceId: UuidV4Schema,
      relativePath: Type.String({ pattern: '^binary/[0-9]{2}-[a-z0-9-]+[.](?:png|pdf)$' }),
      mediaType: Type.Union([Type.Literal('image/png'), Type.Literal('application/pdf')]),
      size: Type.Integer({ minimum: 1 }),
      sha256: Type.String({ pattern: '^[0-9a-f]{64}$' }),
    },
    { additionalProperties: false },
  ),
  { minItems: 4, maxItems: 4 },
)
```

`validate-fixtures.ts` reads each binary file, checks actual size and SHA-256 and reports only case ID/counts. E2E helper reads fixture files from the test process and supplies buffers through Playwright `setInputFiles()`.

- [ ] **Step 6: Run GREEN and complete regression**

```powershell
pnpm --filter @youju/test-support test
pnpm validate:fixtures
pnpm exec vitest run tests/integration/m2-package-boundaries.test.ts
pnpm exec playwright test tests/e2e/no-ai-core.spec.ts
pnpm check:forbidden-content
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
git diff --check
git status --short
```

Expected: all three browser projects pass and fixture validation reports four binary materials with exact digests.

- [ ] **Step 7: Commit and stop**

```powershell
git add fixtures packages/test-support scripts tests package.json pnpm-lock.yaml docs/superpowers/plans/2026-07-31-youju-m2-no-ai-core-plan.md
git commit -m "test: add no-AI golden workflow"
```

---

### Task 16: Document and Verify the M2 Milestone

**Files:**

- Modify: `README.md`
- Modify: `docs/development/local-development.md`
- Modify: `docs/development/roadmap-and-test-order.md`
- Create: `docs/security/m2-threat-checklist.md`
- Modify: `docs/superpowers/plans/2026-07-31-youju-m2-no-ai-core-plan.md` completed checkboxes only after evidence exists

**Interfaces:**

- Consumes: completed M2 implementation and verification evidence.
- Produces: accurate operator guidance, M2 security traceability and final milestone record.

- [ ] **Step 1: Update operational documentation**

Document:

- current M2 features and explicit non-AI/non-cloud boundary;
- Node 24 and pnpm 10.34.0 commands;
- browser support and OPFS degradation;
- file limits and supported formats;
- local data loss and unencrypted export warnings;
- complete manual flow and deletion semantics;
- dependency and font provenance links;
- no claim of permanent storage, encryption, legal advice or guaranteed outcome.

- [ ] **Step 2: Write the M2 threat checklist**

Map each risk to concrete code and tests:

- IndexedDB/OPFS partial commit;
- XSS reading local data;
- extension/MIME/signature mismatch;
- quota and memory exhaustion;
- duplicate/material mix-up;
- malicious filename, CSV formula and ZIP traversal;
- uploaded PDF active content;
- multi-tab overwrite;
- stale/unconfirmed content in formal output;
- incomplete deletion;
- Service Worker or API data leakage;
- local and exported data not encrypted.

Record confirmed facts, remaining product risks and manual browser checks separately. Do not claim manual device checks that were not run.

- [ ] **Step 3: Run document and contradiction scans**

```powershell
pnpm exec prettier --check README.md docs
pnpm check:forbidden-content
$scanPatterns = @('TB' + 'D', 'TO' + 'DO', 'FIX' + 'ME', 'implement ' + 'later', 'sk-' + '[A-Za-z0-9_-]{20,}')
rg -n ($scanPatterns -join '|') README.md docs/security docs/development
```

Expected: Prettier and forbidden-content pass; `rg` has no matches. The plan directory is excluded from the placeholder scan because it contains command examples used for self-review.

- [ ] **Step 4: Run the full milestone verification**

```powershell
pnpm install --frozen-lockfile
pnpm check:forbidden-content
pnpm verify
git diff --check
git status --short
```

Expected: frozen install succeeds; lint, typecheck, unit/integration tests, fixture validation, all builds and all E2E projects pass; status lists only Task 16 documentation and checkbox changes.

- [ ] **Step 5: Review line-by-line against approved M2 design**

Record evidence in `m2-threat-checklist.md` for:

- local event creation and autosave;
- refresh recovery and single writer;
- OPFS import, hash, dedupe, limits and recovery;
- manual categories, facts, timeline, rules and statement;
- formal-output filtering and preflight;
- fixed PDF/CSV/HTML/ZIP structure and digest consistency;
- verified hard deletion;
- OPFS degradation;
- desktop Chromium, mobile Chromium and mobile WebKit;
- unchanged stateless API boundary.

Any missing requirement is fixed in the owning earlier Task before completing Task 16; it is not deferred in documentation.

- [ ] **Step 6: Commit and stop**

```powershell
git add README.md docs/development docs/security docs/superpowers/plans/2026-07-31-youju-m2-no-ai-core-plan.md
git commit -m "docs: complete M2 no-AI guidance"
```

Do not push, merge, tag, create a PR or start M3 without explicit user authorization.

---

## M2 Traceability Matrix

| Approved M2 requirement                                            | Owning Task(s) |
| ------------------------------------------------------------------ | -------------- |
| M2 domain drafts, versions, statements, operation journal          | 1              |
| IndexedDB, migrations, revision checks, no wipe-on-failure         | 2              |
| Minimal creation wizard, autosave, refresh recovery                | 3              |
| Capability detection, single writer, read-only secondary tab       | 4              |
| Bounded incremental SHA-256                                        | 5              |
| OPFS UUID paths, staging, read and delete                          | 6              |
| File signatures, limits, quota, dedupe, import recovery            | 7              |
| Materials UI, manual category and OPFS degradation                 | 8              |
| Manual fact confirmation, required sources and replacement history | 9              |
| Timeline precision, sorting, confirmation and conflicts            | 10             |
| Deterministic rule findings and versioned statement confirmation   | 11             |
| Immutable export snapshot, preflight, safe CSV/HTML/names          | 12             |
| Chinese PDF, fixed ZIP, original bytes and streaming cleanup       | 13             |
| Reference protection and verified hard deletion                    | 14             |
| Binary golden case and full desktop/mobile no-AI E2E               | 15             |
| Threat review, documentation, frozen install and `pnpm verify`     | 16             |

---

## Dependency Review Sources

Version and API checks for this plan were performed on 2026-07-31 against the package registries and official project documentation:

- [`idb` repository and API](https://github.com/jakearchibald/idb), [`idb@8.0.3`](https://www.npmjs.com/package/idb/v/8.0.3);
- [`@noble/hashes` repository and incremental API](https://github.com/paulmillr/noble-hashes), [`@noble/hashes@2.2.0`](https://www.npmjs.com/package/@noble/hashes/v/2.2.0);
- [`fflate` streaming ZIP API](https://github.com/101arrowz/fflate), [`fflate@0.8.3`](https://www.npmjs.com/package/fflate/v/0.8.3);
- [`pdf-lib` custom font guidance](https://github.com/Hopding/pdf-lib), [`pdf-lib@1.17.1`](https://www.npmjs.com/package/pdf-lib/v/1.17.1), [`@pdf-lib/fontkit@1.1.1`](https://www.npmjs.com/package/@pdf-lib/fontkit/v/1.1.1);
- [Noto CJK official repository](https://github.com/notofonts/noto-cjk).

Execution Tasks must still preserve these exact versions in `pnpm-lock.yaml` and record the actual font asset commit and digest.

---

## Plan Self-Review Checklist

Before approving this plan for execution, verify:

- [ ] Every approved design section maps to at least one Task in the traceability matrix.
- [ ] Every runtime Task begins with a behavior-level failing test and an explicit valid RED reason.
- [ ] No Task creates an empty package, disabled placeholder UI, API business storage or AI behavior.
- [ ] `ConfirmedFact.fieldName`, replacement versioning and statement staleness use consistent names across Tasks.
- [ ] Repository methods introduced by later Tasks are named exactly once and consumed consistently.
- [ ] Operation stages remain discriminated and recovery rules cover `validating`, `hashing`, `writing`, `committing`, `deleting` and `verifying`.
- [ ] Only ready evidence, current confirmed facts, confirmed timeline and current statement reach `ExportSnapshot`.
- [ ] File limits, MIME/signature rules, same-case dedupe and quota behavior are exact.
- [ ] PDF/ZIP work has a stop condition when Chinese font, pagination or streaming proof fails.
- [ ] Deletion cannot report success before IndexedDB, OPFS and temporary verification.
- [ ] All external dependencies have exact versions and a required review record.
- [ ] Every Task ends with target tests, affected regression gates, `git diff --check`, focused commit and stop.
- [ ] No Task includes push, PR, merge, tag, release, worktree or subagent actions.
- [ ] M3 features and unrelated refactors are absent.
