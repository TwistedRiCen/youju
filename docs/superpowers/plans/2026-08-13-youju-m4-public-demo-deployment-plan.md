# 有据 M4 Public Demo and Deployment Implementation Plan

> 状态：详细实施计划已批准（实现尚未开始）
>
> 日期：2026-08-13
>
> 批准日期：2026-08-17
>
> 对应设计：`docs/superpowers/specs/2026-08-13-youju-m4-public-demo-deployment-design.md`
>
> 执行方式：单智能体 Inline Execution；每次只执行用户明确批准的一个 Task

**Goal:** 在不改变本地优先、无 AI 可用和 Fastify 临时转发边界的前提下，交付无需注册即可试用的公开演示、受控 PWA 离线与更新能力、明确隐私说明、可移植同源部署、真实环境验证和可回滚发布证据。

**Architecture:** 同一 HTTPS 源下，边缘入口提供静态 Vue PWA、SPA fallback、安全响应头和 `/ai/*` 反向代理；单实例 Fastify 继续只做健康检查与 BYOK AI 临时转发。IndexedDB v4 保存业务数据与低敏应用偏好，OPFS 保存原始材料；Service Worker 只缓存应用壳和批准的完全虚构演示资产，绝不缓存用户材料、API Key 或 AI 流量。

**Tech Stack:** Node.js 24 LTS, pnpm 10.34.0, TypeScript strict, ESM, Vue 3, Vite 8, `vite-plugin-pwa`, Fastify 5, TypeBox / JSON Schema, Vitest, Playwright, IndexedDB, OPFS, Web Crypto API, Nginx 配置模板与现有 workspace 工具链。

## Global Constraints

- V0.1 仍只支持 `ecommerce_refund`，不得扩展到劳动、租房、校园、医疗、债务或其他场景。
- 无注册、无 AI、Provider 不可用和 `/health` 不可用时，M2 手工核心流程必须继续可用。
- 用户业务数据只默认存在于当前浏览器 IndexedDB/OPFS；不得新增服务端业务数据库、对象存储、队列、账号或跨设备同步。
- API Key 继续只保存在当前页面会话内存和本次 HTTPS 调用栈；不得进入 IndexedDB、OPFS、Cache Storage、Cookie、localStorage、日志、导出、测试或发布物。
- 浏览器只调用同源相对路径 `/ai/*`；不得直连 Provider，不开放通用 CORS，不烘焙独立 API 域名。
- 首版生产 API 固定单实例；多实例扩容前必须重新评审进程内限流的全局语义。
- Service Worker 只缓存应用壳和批准的虚构演示资产；`/ai/*`、`/health`、用户文件、导出、AI 请求/响应一律 NetworkOnly 或不接管。
- 公开版 BYOK AI 默认关闭，不提供共享 Key；无 AI 演示是发布阻断门禁。
- 首版不采集埋点、匿名完成率、设备指纹、会话回放或远程错误追踪；反馈基础能力是本地复制模板。
- 低敏运行日志最长保留 7 天，平台允许时更短；应用代码不得记录原始 IP、完整 User-Agent、请求体、响应体、文件名、事件标题、Key 或模型内容。
- 演示案例必须持续标记为完全虚构；演示 PDF、CSV、HTML、ZIP 和文件名不得遗漏 `DEMO` 标记。
- 不增加加密备份、超大材料包、后台同步、推送、离线 AI 或自动部署流水线。
- 自动化测试只使用虚构固定数据与 Mock Provider；真实 Key、真实 Provider、真实设备和公开部署只在对应人工 Task 获得单独授权后执行。
- 所有运行时 Task 遵循有效 RED、最小 GREEN、目标测试、受影响回归、质量门禁、独立提交并停止。
- 不创建 worktree 或子智能体；不得提前创建后续 Task 的文件、接口或占位 UI。
- 不下载或安装另一套 Node/pnpm；使用用户已配置的 Node 24 与 pnpm 10.34.0。
- 不 push、建 PR、合并、打标签、创建远端发布或修改外部部署，除非用户在对应 Task 中明确授权。

---

## Execution Protocol for Every Task

每个 Task 开始时必须：

1. 按顺序阅读 `AGENTS.md`、V0.1 设计、Master Plan、M4 设计、本计划，以及本 Task 相关实现、测试和文档；
2. 确认 `node --version` 为 `v24.x`、`pnpm --version` 为 `10.34.0`，不得触发 Corepack 下载；
3. Task 1 仅在 M4 设计与计划已进入干净 `main` 后创建 `codex/m4-public-demo`；Task 2 及之后确认当前分支与干净状态；
4. 只修改本 Task 的 `Files`，不顺手重构、不升级依赖、不创建后续目录；
5. 运行行为级失败测试并确认失败由目标行为未实现导致；纯文档或人工 Task 明确记录 RED 不适用；
6. 编写最小实现，运行目标测试、受影响包测试、Task 门禁、`git diff --check` 与敏感内容扫描；
7. 只勾选有真实执行证据的当前 Task 复选框，暂存当前 Task 文件，按指定信息提交并停止；
8. 报告 RED、实现与未实现内容、文件、契约、全部命令结果、目录、分支、完整提交号、提交信息、提交后状态、风险，以及“未执行下一个 Task”。

Task 1 创建分支前运行：

```powershell
git cat-file -e HEAD:docs/superpowers/specs/2026-08-13-youju-m4-public-demo-deployment-design.md
git cat-file -e HEAD:docs/superpowers/plans/2026-08-13-youju-m4-public-demo-deployment-plan.md
git status --short
git switch -c codex/m4-public-demo
```

Expected: 两个文档都已存在于当前提交，状态无输出，分支创建成功。不得使用 worktree。

---

## Locked Implementation Parameters

| 参数           | M4 固定值                                                  |
| -------------- | ---------------------------------------------------------- |
| 生产拓扑       | 同源静态 Web + 边缘反向代理 + 单实例无状态 Fastify         |
| 数据库版本     | IndexedDB v4                                               |
| 事件来源       | `user_created` / `fictional_demo`                          |
| 演示夹具 ID    | `m4-ecommerce-refund-demo-v1`                              |
| 演示导出       | 所有正式格式和文件名强制 `DEMO` 标记                       |
| 应用偏好       | IndexedDB `appPreferences`，只存引导、发布确认与持久化结果 |
| PWA 更新       | 提示式更新；用户确认后激活，不自动强刷                     |
| PWA 运行时缓存 | 空；`/ai/*`、`/health` 明确不缓存                          |
| 首屏预算       | HTML + CSS + 关键 JS 压缩传输总量不超过 500 KiB            |
| 应用壳预算     | 预缓存不超过 2 MiB，不含按需 PDF worker、大字体和演示附件  |
| BYOK 状态      | 展示但默认关闭，无共享 Key                                 |
| 反馈           | 本地复制模板必选；可选 GitHub/Gitee HTTPS Issue 链接       |
| 日志           | 低敏元数据最长 7 天，无原始 IP/完整 User-Agent/内容        |
| HSTS 首版      | `max-age=31536000`，不含 `includeSubDomains` 和 preload    |
| CSP            | 强制同源，不允许 `unsafe-inline`、`unsafe-eval` 或远程脚本 |
| COEP           | 首版不启用                                                 |
| 真实 Provider  | 不进 CI；无法验证时明确标记“本版本未做真实验证”            |
| 自动发布       | 不建设；外部部署必须单独授权                               |

改变固定参数需要先修改并重新评审设计与计划，不得在实现 Task 中临时变更。

---

## File Map

### Existing modules extended

- `packages/domain/src/*`：演示来源、夹具标识和演示加载操作契约。
- `packages/document-export/src/*`：演示水印、文件名、PDF/CSV/HTML/ZIP 标记。
- `apps/web/src/storage/*`：IndexedDB v4、旧事件迁移、应用偏好与删除覆盖。
- `apps/web/src/demo/*`：公开演示清单校验、UUID 重写、加载、重置和状态。
- `apps/web/src/browser/*`：持久化存储、在线状态和能力降级。
- `apps/web/src/views/*`、`components/*`：公开首页、首次引导、隐私、关于、反馈、演示横幅、离线与更新提示。
- `apps/web/src/router.ts`、`App.vue`、`main.ts`：按需路由和全局公开状态。
- `apps/web/vite.config.ts`：提示式 Service Worker、精确预缓存和生产 Manifest。
- `apps/api/src/*`：显式代理信任、同源请求保护、发布信息、健康检查、日志和优雅退出。
- `scripts/*`：公开夹具校验、发布描述、包体预算与生产候选检查。
- `tests/e2e/*`：生产 PWA、演示、缓存、安全头、离线更新和无 AI 回归。
- `docs/security/*`、`docs/deployment/*`、`docs/development/*`：威胁检查、部署、回滚、日志和发布操作。

### New focused files and responsibilities

- `apps/web/src/storage/app-preferences-repository.ts`：低敏偏好端口。
- `apps/web/src/storage/indexeddb-app-preferences-repository.ts`：IndexedDB v4 偏好实现。
- `apps/web/src/demo/demo-fixture.ts`：只读清单 Schema 和解析。
- `apps/web/src/demo/demo-case-loader.ts`：容量检查、UUID 重写、OPFS/IndexedDB 写入与恢复。
- `apps/web/src/demo/demo-case-service.ts`：查找、打开、重置和删除隔离。
- `apps/web/src/browser/storage-persistence.ts`：`persisted()` / `persist()` 能力和结果。
- `apps/web/src/pwa/update-controller.ts`：离线就绪与待更新状态机。
- `apps/web/src/components/AppStatusBanner.vue`：离线和更新提示。
- `apps/web/src/components/DemoCaseBanner.vue`：持续演示身份提示。
- `apps/web/src/views/PrivacyView.vue`、`AboutView.vue`：公开说明与版本信息。
- `apps/web/public/demo/m4-ecommerce-refund-demo-v1/*`：完全虚构、可公开分发的演示资产。
- `scripts/validate-public-demo.ts`：夹具 Schema、摘要、隐私和引用校验。
- `scripts/generate-release-descriptor.ts`：无秘密 `release.json`。
- `scripts/check-web-build-budget.ts`：首屏和预缓存预算门禁。
- `scripts/serve-production-candidate.ts`：仅用于本地 E2E 的同源静态/API 候选服务器。
- `playwright.production.config.ts`：生产构建与 Service Worker 专用 E2E。
- `deploy/nginx/youju.conf.template`：同源路由、安全头和缓存模板。
- `docs/deployment/public-demo.md`：部署、回滚和冒烟步骤。
- `docs/deployment/operations.md`：健康、日志、证书、DNS 和故障手册。
- `docs/security/m4-threat-checklist.md`：M4 自动、人工和剩余风险证据。
- `docs/release/m4-release-checklist.md`：设备、Provider、部署与公开发布记录。

不创建新 workspace 包，不计划增加第三方运行时依赖。

---

### Task 1: Establish Demo Identity and Load Operation Contracts

**Files:**

- Modify: `packages/domain/src/schemas.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/domain/tests/schemas.test.ts`
- Modify: `packages/domain/tests/statements.test.ts`
- Modify: `packages/document-export/tests/pdf-renderer.test.ts`
- Modify: `packages/document-export/tests/preflight.test.ts`
- Modify: `packages/document-export/tests/zip-writer.test.ts`
- Modify: `apps/web/src/services/case-service.ts`
- Modify: `apps/web/src/storage/indexeddb-case-repository.ts`
- Modify: `apps/web/src/views/CreateCaseView.vue`
- Modify: `apps/web/tests/create-case.test.ts`
- Modify: `fixtures/ecommerce-refund/case-001-transport-damage/case.json`
- Modify: `packages/test-support/src/fixture-schema.ts`
- Modify: `scripts/validate-fixtures.ts`
- Modify: `docs/superpowers/plans/2026-08-13-youju-m4-public-demo-deployment-plan.md` Task 1 checkboxes only

**Interfaces:**

- Add `CaseDataOrigin = 'user_created' | 'fictional_demo'`.
- Add required `CaseEvent.dataOrigin`.
- Add `CaseEvent.demoFixtureId: string | null` with invariant: only `fictional_demo` may use non-null ID.
- Add `demo_case_load` operation with `validating | writing | verifying | failed` stage and `demoFixtureId`.
- Normal case creation always produces `user_created` and `demoFixtureId: null`.
- Golden fixture is explicitly fictional and uses `m4-ecommerce-refund-demo-v1`.

- [x] **Step 1: Write contract and creation RED tests**

Add tests rejecting missing/invalid origin combinations, accepting both valid variants, validating the new operation type, and asserting normal creation uses `user_created`.

```powershell
pnpm exec vitest run packages/domain/tests/schemas.test.ts apps/web/tests/create-case.test.ts
```

Expected RED: current `CaseEventSchema` has no origin fields and normal creation does not produce them.

- [x] **Step 2: Implement minimal domain contracts and creators**

Do not infer demo origin from title, fixture path or UUID. Keep `additionalProperties: false` and existing UUID/timestamp rules. Update every typed test fixture and repository projection that constructs `CaseEvent`; the temporary read projection may normalize absent legacy fields, while Task 2 performs the durable v4 backfill.

- [x] **Step 3: Update fictional fixture and validator**

The validator must enforce exact fixture ID and reject a fictional fixture without explicit origin. Do not add public Web assets yet.

- [x] **Step 4: Run Task 1 gates**

```powershell
pnpm exec vitest run packages/domain/tests apps/web/tests/create-case.test.ts
pnpm validate:fixtures
pnpm typecheck
git diff --check
```

Expected: all pass; status contains only Task 1 files and this plan checkbox update.

- [x] **Step 5: Commit and stop**

```powershell
git add packages/domain packages/document-export/tests apps/web/src/services/case-service.ts apps/web/src/storage/indexeddb-case-repository.ts apps/web/src/views/CreateCaseView.vue apps/web/tests/create-case.test.ts fixtures packages/test-support/src/fixture-schema.ts scripts/validate-fixtures.ts docs/superpowers/plans/2026-08-13-youju-m4-public-demo-deployment-plan.md
git commit -m "feat: define M4 demo case identity"
```

---

### Task 2: Migrate IndexedDB v4 and Add Local App Preferences

**Files:**

- Modify: `apps/web/src/storage/database-schema.ts`
- Modify: `apps/web/src/storage/open-database.ts`
- Modify: `apps/web/src/storage/index.ts`
- Create: `apps/web/src/storage/app-preferences-repository.ts`
- Create: `apps/web/src/storage/indexeddb-app-preferences-repository.ts`
- Modify: `apps/web/src/storage/indexeddb-case-repository.ts`
- Modify: `apps/web/src/services/delete-case-service.ts`
- Modify: `apps/web/tests/deletion.test.ts`
- Modify: `tests/e2e/case-repository.spec.ts`
- Create: `tests/e2e/app-preferences.spec.ts`
- Modify: `docs/superpowers/plans/2026-08-13-youju-m4-public-demo-deployment-plan.md` Task 2 checkboxes only

**Interfaces:**

- IndexedDB version becomes 4.
- v4 migration backfills every legacy case with `dataOrigin: 'user_created'` and `demoFixtureId: null`.
- Add singleton-key `appPreferences` store with `schemaVersion`, `onboardingVersionSeen`, `lastAcknowledgedReleaseId`, and `storagePersistence`.
- Preference repository exposes `get`, `put`, and `clear`; it has no event or AI fields.
- Full local-data deletion clears preferences; single-case deletion does not.

- [x] **Step 1: Write real-browser migration and deletion RED tests**

Seed a v3 database, open v4, assert legacy records survive with user origin, preferences round-trip, and full clearing removes all stores without touching unrelated browser origins.

```powershell
pnpm exec playwright test tests/e2e/case-repository.spec.ts tests/e2e/app-preferences.spec.ts --project=chromium-desktop
```

Expected RED: v4 store and backfill do not exist.

- [x] **Step 2: Implement v4 migration and preference repository**

Migration must be additive and cursor-based. Any blocked or failed migration keeps current error semantics and must never delete the database.

- [x] **Step 3: Extend verified full deletion**

Only the explicit “delete all local data” path clears app preferences. Preserve per-case verified deletion behavior.

- [x] **Step 4: Run Task 2 gates**

```powershell
pnpm exec vitest run apps/web/tests/deletion.test.ts
pnpm exec playwright test tests/e2e/case-repository.spec.ts tests/e2e/app-preferences.spec.ts --project=chromium-desktop
pnpm --filter @youju/web typecheck
git diff --check
```

- [x] **Step 5: Commit and stop**

```powershell
git add apps/web/src/storage apps/web/src/services/delete-case-service.ts apps/web/tests/deletion.test.ts tests/e2e/case-repository.spec.ts tests/e2e/app-preferences.spec.ts docs/superpowers/plans/2026-08-13-youju-m4-public-demo-deployment-plan.md
git commit -m "feat: migrate M4 local preferences"
```

---

### Task 3: Publish and Validate the Fictional Public Demo Fixture

**Files:**

- Create: `apps/web/public/demo/m4-ecommerce-refund-demo-v1/manifest.json`
- Create: `apps/web/public/demo/m4-ecommerce-refund-demo-v1/evidence/*`
- Create: `apps/web/public/demo/m4-ecommerce-refund-demo-v1/binary/*`
- Create: `apps/web/src/demo/demo-fixture.ts`
- Create: `apps/web/tests/demo-fixture.test.ts`
- Create: `scripts/validate-public-demo.ts`
- Modify: `scripts/check-forbidden-content.ts`
- Modify: `package.json`
- Modify: `docs/superpowers/plans/2026-08-13-youju-m4-public-demo-deployment-plan.md` Task 3 checkboxes only

**Interfaces:**

- Public manifest contains fixture ID/version, case template, facts, timeline, statement, evidence metadata, relative asset paths, size and SHA-256.
- Manifest IDs are template-local tokens, not persisted UUIDs.
- Runtime parser rejects unknown fields, unsafe paths, duplicate tokens, broken references, hash/size mismatch and non-fictional origin.
- Public assets are copied from the validated golden case and total less than the fixed application-shell budget.

- [x] **Step 1: Write fixture parser and validation RED tests**

Test valid manifest plus traversal, external URL, duplicate ID, missing source, unexpected property and privacy-pattern failures.

```powershell
pnpm exec vitest run apps/web/tests/demo-fixture.test.ts
pnpm validate:public-demo
```

Expected RED: parser, script, package command and public assets do not exist.

- [x] **Step 2: Add minimal public fixture and runtime parser**

Do not include AI fixture responses, Provider settings, API Keys or external URLs. Reuse the four small fictional golden binaries; do not add large media.

- [x] **Step 3: Extend forbidden-content coverage**

Scan public demo text and manifest for phone, ID-card, address and secret-like patterns. Validate all asset summaries from bytes.

- [x] **Step 4: Run Task 3 gates**

```powershell
pnpm validate:fixtures
pnpm validate:public-demo
pnpm check:forbidden-content
pnpm exec vitest run apps/web/tests/demo-fixture.test.ts
pnpm --filter @youju/web build
git diff --check
```

- [x] **Step 5: Commit and stop**

```powershell
git add apps/web/public/demo apps/web/src/demo/demo-fixture.ts apps/web/tests/demo-fixture.test.ts scripts/validate-public-demo.ts scripts/check-forbidden-content.ts package.json docs/superpowers/plans/2026-08-13-youju-m4-public-demo-deployment-plan.md
git commit -m "feat: add validated public demo fixture"
```

---

### Task 4: Load, Recover, and Reset the Demo Case Safely

**Files:**

- Create: `apps/web/src/demo/demo-case-loader.ts`
- Create: `apps/web/src/demo/demo-case-service.ts`
- Create: `apps/web/src/demo/index.ts`
- Create: `apps/web/tests/demo-case-loader.test.ts`
- Modify: `apps/web/src/services/recover-local-operations.ts`
- Modify: `apps/web/src/services/delete-case-service.ts`
- Modify: `apps/web/tests/deletion.test.ts`
- Create: `tests/e2e/public-demo-storage.spec.ts`
- Modify: `docs/superpowers/plans/2026-08-13-youju-m4-public-demo-deployment-plan.md` Task 4 checkboxes only

**Interfaces:**

- `loadDemoCase(fixtureId)` validates, checks quota, generates UUID v4 for every persisted entity, rewrites all references, stages OPFS files, commits records and verifies completion.
- `findDemoCase(fixtureId)` returns at most one matching case.
- `resetDemoCase(fixtureId)` deletes and verifies only that demo case, then reloads it.
- Interrupted `demo_case_load` recovery removes partial structured records and staged blobs, never a `user_created` case.
- Loading performs no AI call, feedback call or external fetch outside same-origin demo assets.

- [ ] **Step 1: Write loader/recovery RED tests**

Cover fresh load, duplicate load, UUID rewriting, source integrity, OPFS unavailable, quota failure, interruption at each stage, retry and user-case isolation.

```powershell
pnpm exec vitest run apps/web/tests/demo-case-loader.test.ts apps/web/tests/deletion.test.ts
pnpm exec playwright test tests/e2e/public-demo-storage.spec.ts --project=chromium-desktop
```

Expected RED: no demo loader or operation recovery exists.

- [ ] **Step 2: Implement minimal loader and idempotent service**

Use existing repositories, `EvidenceBlobStore`, operation journal, SHA-256 verification and delete service. Do not directly manipulate unrelated object stores.

- [ ] **Step 3: Implement interruption recovery and verified reset**

No path may report success before all structured records and blobs are readable and summaries match the manifest.

- [ ] **Step 4: Run Task 4 gates**

```powershell
pnpm exec vitest run apps/web/tests/demo-case-loader.test.ts apps/web/tests/deletion.test.ts
pnpm exec playwright test tests/e2e/public-demo-storage.spec.ts tests/e2e/verified-deletion.spec.ts --project=chromium-desktop
pnpm --filter @youju/web typecheck
git diff --check
```

- [ ] **Step 5: Commit and stop**

```powershell
git add apps/web/src/demo apps/web/src/services/recover-local-operations.ts apps/web/src/services/delete-case-service.ts apps/web/tests/demo-case-loader.test.ts apps/web/tests/deletion.test.ts tests/e2e/public-demo-storage.spec.ts docs/superpowers/plans/2026-08-13-youju-m4-public-demo-deployment-plan.md
git commit -m "feat: load and reset fictional demo cases"
```

---

### Task 5: Mark Demo Cases in Every Formal Export

**Files:**

- Modify: `packages/document-export/src/export-model.ts`
- Modify: `packages/document-export/src/file-names.ts`
- Modify: `packages/document-export/src/pdf-sections.ts`
- Modify: `packages/document-export/src/digest-csv.ts`
- Modify: `packages/document-export/src/attachment-index.ts`
- Modify: `packages/document-export/src/zip-writer.ts`
- Modify: `packages/document-export/src/index.ts`
- Modify: `packages/document-export/tests/pdf-renderer.test.ts`
- Modify: `packages/document-export/tests/safe-text-output.test.ts`
- Modify: `packages/document-export/tests/zip-writer.test.ts`
- Modify: `apps/web/src/services/export-service.ts`
- Modify: `apps/web/tests/export.test.ts`
- Create: `tests/e2e/public-demo-export.spec.ts`
- Modify: `docs/superpowers/plans/2026-08-13-youju-m4-public-demo-deployment-plan.md` Task 5 checkboxes only

**Interfaces:**

- Export snapshot reads origin only from `CaseEvent`.
- Demo ZIP and directory names start with `DEMO-`.
- Every generated PDF page or section has “完全虚构演示数据，请勿作为真实材料提交”.
- Digest CSV adds a fixed `数据性质` column to every row: demo uses `完全虚构演示数据`, real cases use `用户事件`; existing path/size/media type/SHA-256 columns keep their meaning and remain spreadsheet-safe.
- HTML title, heading and body include the demo warning without script or external resources.
- Demo ZIP adds `DEMO-README.txt` and repeats the warning in its manifest/index; real-case output keeps its existing filenames and content apart from the approved CSV column and release metadata.

- [ ] **Step 1: Write cross-format RED tests**

Assert the marker exists in every demo artifact and does not appear in real-case artifacts. Test filename sanitization and formula-injection safety.

```powershell
pnpm exec vitest run packages/document-export/tests apps/web/tests/export.test.ts
```

Expected RED: origin is not rendered or included in filenames.

- [ ] **Step 2: Implement a single deterministic demo-marking policy**

Expose one helper from `@youju/document-export`; renderers consume it rather than duplicating title checks.

- [ ] **Step 3: Add browser export regression**

Load the public demo, export, inspect ZIP entries and extracted text, then export a user case and assert no demo marker contamination.

- [ ] **Step 4: Run Task 5 gates**

```powershell
pnpm exec vitest run packages/document-export/tests apps/web/tests/export.test.ts
pnpm exec playwright test tests/e2e/public-demo-export.spec.ts tests/e2e/submission-package.spec.ts --project=chromium-desktop
pnpm typecheck
git diff --check
```

- [ ] **Step 5: Commit and stop**

```powershell
git add packages/document-export apps/web/src/services/export-service.ts apps/web/tests/export.test.ts tests/e2e/public-demo-export.spec.ts docs/superpowers/plans/2026-08-13-youju-m4-public-demo-deployment-plan.md
git commit -m "feat: mark all fictional demo exports"
```

---

### Task 6: Add First-Use Guidance and Persistent Storage Status

**Files:**

- Modify: `apps/web/src/browser/browser-capabilities.ts`
- Create: `apps/web/src/browser/storage-persistence.ts`
- Create: `apps/web/src/components/FirstUseGuide.vue`
- Create: `apps/web/src/components/StoragePersistenceNotice.vue`
- Modify: `apps/web/src/App.vue`
- Modify: `apps/web/src/views/CreateCaseView.vue`
- Modify: `apps/web/src/components/EvidenceImportField.vue`
- Create: `apps/web/tests/storage-persistence.test.ts`
- Create: `apps/web/tests/first-use-guide.test.ts`
- Create: `tests/e2e/first-use-and-storage.spec.ts`
- Modify: `docs/superpowers/plans/2026-08-13-youju-m4-public-demo-deployment-plan.md` Task 6 checkboxes only

**Interfaces:**

- Capability adds `storagePersistence` support without claiming permission state.
- `requestStoragePersistence()` returns `granted | denied | unsupported`; exceptions map to denied without hiding the user warning.
- Guide has at most three steps, is skippable, and records only version seen.
- Persistence request occurs after user-created case creation or first real material import, never on blank landing page or demo load.
- Denied/unsupported shows export-backup advice; granted never claims cloud backup.

- [ ] **Step 1: Write capability, permission and guide RED tests**

Cover absent APIs, granted/denied/rejected promise, no request on demo load, skip/reopen behavior and full local-data clear.

```powershell
pnpm exec vitest run apps/web/tests/storage-persistence.test.ts apps/web/tests/first-use-guide.test.ts
```

Expected RED: persistence adapter and guide do not exist.

- [ ] **Step 2: Implement adapters and accessible guide**

Use native dialog semantics or an accessible in-page pattern with focus management, Escape/close behavior and keyboard controls.

- [ ] **Step 3: Connect only approved user actions**

Do not repeatedly prompt after denied result; provide a manual retry in storage notice.

- [ ] **Step 4: Run Task 6 gates**

```powershell
pnpm exec vitest run apps/web/tests/storage-persistence.test.ts apps/web/tests/first-use-guide.test.ts apps/web/tests/browser-capabilities.test.ts
pnpm exec playwright test tests/e2e/first-use-and-storage.spec.ts --project=chromium-desktop
pnpm --filter @youju/web typecheck
git diff --check
```

- [ ] **Step 5: Commit and stop**

```powershell
git add apps/web/src/browser apps/web/src/components/FirstUseGuide.vue apps/web/src/components/StoragePersistenceNotice.vue apps/web/src/App.vue apps/web/src/views/CreateCaseView.vue apps/web/src/components/EvidenceImportField.vue apps/web/tests tests/e2e/first-use-and-storage.spec.ts docs/superpowers/plans/2026-08-13-youju-m4-public-demo-deployment-plan.md
git commit -m "feat: explain first-use local storage"
```

---

### Task 7: Build the Public Home, Privacy, About, Feedback, and Demo UI

**Files:**

- Modify: `apps/web/src/views/HomeView.vue`
- Create: `apps/web/src/views/PrivacyView.vue`
- Create: `apps/web/src/views/AboutView.vue`
- Create: `apps/web/src/components/DemoCaseBanner.vue`
- Create: `apps/web/src/components/FeedbackTemplate.vue`
- Modify: `apps/web/src/views/CaseWorkspaceView.vue`
- Modify: `apps/web/src/router.ts`
- Modify: `apps/web/src/App.vue`
- Modify: `apps/web/tests/home.test.ts`
- Create: `apps/web/tests/public-information.test.ts`
- Create: `apps/web/tests/demo-case-banner.test.ts`
- Create: `tests/e2e/public-demo-flow.spec.ts`
- Modify: `docs/superpowers/plans/2026-08-13-youju-m4-public-demo-deployment-plan.md` Task 7 checkboxes only

**Interfaces:**

- Home exposes “加载完全虚构演示” and “创建我的事件” as equal clear choices.
- Existing demo offers open/reset, never silent duplicate creation.
- Workspace persistently displays demo banner based on `dataOrigin`.
- `/privacy` explains local stores, clearing/eviction, AI relay, Provider boundary, deletion and export sensitivity.
- `/about` shows release ID, browser/Provider verification state and product boundary.
- Feedback copies a sanitized template containing only release ID and user-entered text; optional repository URL must be build-time validated HTTPS GitHub/Gitee.

- [ ] **Step 1: Write public UX RED tests**

Test stale milestone copy removal, no-account/no-AI claims, demo loading states, persistent banner, all privacy topics, feedback sanitization and absent external link when unconfigured.

```powershell
pnpm exec vitest run apps/web/tests/home.test.ts apps/web/tests/public-information.test.ts apps/web/tests/demo-case-banner.test.ts
```

Expected RED: routes, pages, banner and current-version content are absent.

- [ ] **Step 2: Implement public pages and demo actions**

All text must remain factual and avoid legal conclusions, Provider availability promises or “server backup” implications.

- [ ] **Step 3: Add complete no-AI demo E2E**

From a fresh profile: skip/complete guide, load demo, inspect materials/facts/timeline/statement, export and delete without opening AI settings or making `/ai` requests.

- [ ] **Step 4: Run Task 7 gates**

```powershell
pnpm exec vitest run apps/web/tests/home.test.ts apps/web/tests/public-information.test.ts apps/web/tests/demo-case-banner.test.ts
pnpm exec playwright test tests/e2e/public-demo-flow.spec.ts tests/e2e/no-ai-core.spec.ts --project=chromium-desktop
pnpm --filter @youju/web typecheck
git diff --check
```

- [ ] **Step 5: Commit and stop**

```powershell
git add apps/web/src/views apps/web/src/components/DemoCaseBanner.vue apps/web/src/components/FeedbackTemplate.vue apps/web/src/router.ts apps/web/src/App.vue apps/web/tests tests/e2e/public-demo-flow.spec.ts docs/superpowers/plans/2026-08-13-youju-m4-public-demo-deployment-plan.md
git commit -m "feat: add M4 public demo experience"
```

---

### Task 8: Add Prompted PWA Updates and a Strict Offline Shell

**Files:**

- Modify: `apps/web/vite.config.ts`
- Modify: `apps/web/src/main.ts`
- Modify: `apps/web/src/App.vue`
- Create: `apps/web/src/pwa/update-controller.ts`
- Create: `apps/web/src/components/AppStatusBanner.vue`
- Create: `apps/web/tests/pwa-update-controller.test.ts`
- Create: `playwright.production.config.ts`
- Create: `tests/e2e/pwa-offline-update.spec.ts`
- Modify: `docs/superpowers/plans/2026-08-13-youju-m4-public-demo-deployment-plan.md` Task 8 checkboxes only

**Interfaces:**

- Replace `autoUpdate` with prompt registration and explicit `offline_ready | update_available | updating | idle` state.
- Runtime caching remains empty; demo JSON/PDF/PNG may be precached only by explicit allowlist.
- `/ai/*`, `/health`, downloads and blob URLs are excluded from navigation fallback and cache.
- Update waits while import/export/AI or pending local writes are active; confirmation explains page-memory Key clearing.
- Offline status is advisory; actual failed requests retain their own errors and are never queued.

- [ ] **Step 1: Write update-state and production SW RED tests**

Build production output, install SW, inspect Cache Storage, go offline, reopen shell, simulate update, and assert no automatic reload.

```powershell
pnpm exec vitest run apps/web/tests/pwa-update-controller.test.ts
pnpm --filter @youju/web build
pnpm exec playwright test --config=playwright.production.config.ts tests/e2e/pwa-offline-update.spec.ts --project=chromium-desktop
```

Expected RED: current config auto-updates and no production PWA harness or prompt controller exists.

- [ ] **Step 2: Implement strict Workbox allowlist and update controller**

Do not add background sync, push, periodic sync or runtime Provider caching.

- [ ] **Step 3: Implement accessible global status banner**

Preserve API Key in memory while merely offline; clear it only through existing refresh/disable/session lifecycle.

- [ ] **Step 4: Run Task 8 gates**

```powershell
pnpm exec vitest run apps/web/tests/pwa-update-controller.test.ts apps/web/tests/ai-session.test.ts
pnpm --filter @youju/web build
pnpm exec playwright test --config=playwright.production.config.ts tests/e2e/pwa-offline-update.spec.ts --project=chromium-desktop
git diff --check
```

- [ ] **Step 5: Commit and stop**

```powershell
git add apps/web/vite.config.ts apps/web/src/main.ts apps/web/src/App.vue apps/web/src/pwa apps/web/src/components/AppStatusBanner.vue apps/web/tests/pwa-update-controller.test.ts playwright.production.config.ts tests/e2e/pwa-offline-update.spec.ts docs/superpowers/plans/2026-08-13-youju-m4-public-demo-deployment-plan.md
git commit -m "feat: add controlled PWA offline updates"
```

---

### Task 9: Enforce Route-Level Loading and Web Build Budgets

**Files:**

- Modify: `apps/web/src/router.ts`
- Modify: `apps/web/src/services/export-service.ts`
- Modify: `apps/web/src/ai/pdf-page-renderer.ts`
- Modify: `apps/web/vite.config.ts`
- Create: `scripts/check-web-build-budget.ts`
- Modify: `package.json`
- Create: `apps/web/tests/lazy-boundaries.test.ts`
- Modify: `docs/superpowers/plans/2026-08-13-youju-m4-public-demo-deployment-plan.md` Task 9 checkboxes only

**Interfaces:**

- Home, public information and basic workspace load without PDF.js, PDF generation libraries, export font or AI views.
- Heavy routes and action modules load only when navigated/invoked.
- `check:web-budget` reads Vite manifest and SW precache entries, applies fixed compressed-size budgets, and fails with named assets.
- Source maps are not published in production output.

- [ ] **Step 1: Add budget script and observe valid RED**

```powershell
pnpm --filter @youju/web build
pnpm check:web-budget
```

Expected RED: current main entry exceeds the approved first-screen budget or heavy modules remain in the entry graph.

- [ ] **Step 2: Add import-boundary tests and minimal lazy loading**

Use Vue Router dynamic imports and action-local imports. Do not split tiny domain utilities or add a bundler abstraction.

- [ ] **Step 3: Verify PWA budget and functional regressions**

```powershell
pnpm exec vitest run apps/web/tests/lazy-boundaries.test.ts apps/web/tests/export.test.ts apps/web/tests/ai-assistant.test.ts
pnpm --filter @youju/web build
pnpm check:web-budget
pnpm exec playwright test tests/e2e/public-demo-flow.spec.ts --project=chromium-desktop
git diff --check
```

- [ ] **Step 4: Commit and stop**

```powershell
git add apps/web/src/router.ts apps/web/src/services/export-service.ts apps/web/src/ai/pdf-page-renderer.ts apps/web/vite.config.ts scripts/check-web-build-budget.ts package.json apps/web/tests/lazy-boundaries.test.ts docs/superpowers/plans/2026-08-13-youju-m4-public-demo-deployment-plan.md
git commit -m "perf: enforce M4 web build budgets"
```

---

### Task 10: Harden the Production Fastify Boundary

**Files:**

- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/logging.ts`
- Modify: `apps/api/src/routes/health.ts`
- Create: `apps/api/src/production-config.ts`
- Create: `apps/api/src/request-origin-policy.ts`
- Modify: `apps/api/tests/health.test.ts`
- Modify: `apps/api/tests/log-redaction.test.ts`
- Modify: `apps/api/tests/ai-routes.test.ts`
- Create: `apps/api/tests/production-config.test.ts`
- Create: `apps/api/tests/request-origin-policy.test.ts`
- Modify: `docs/superpowers/plans/2026-08-13-youju-m4-public-demo-deployment-plan.md` Task 10 checkboxes only

**Interfaces:**

- Production config parses explicit trusted proxy IP/CIDR list; `true`, wildcard, malformed and empty production values fail startup.
- Browser cross-site `/ai` requests are rejected using `Origin` and Fetch Metadata; same-origin and controlled non-browser tests retain Schema/security checks.
- `/health` returns only `status` and validated `releaseId`, never environment details or Provider probes.
- Server handles SIGTERM/SIGINT with Fastify close and bounded shutdown.
- Logger removes raw IP and full User-Agent while retaining request ID, route class, status, duration, Provider preset and stable error class.

- [ ] **Step 1: Write proxy, origin, health and log RED tests**

Cover spoofed forwarded headers, trusted/untrusted proxy, cross-site headers, malformed release ID, graceful shutdown hooks and sensitive log fields.

```powershell
pnpm exec vitest run apps/api/tests/production-config.test.ts apps/api/tests/request-origin-policy.test.ts apps/api/tests/health.test.ts apps/api/tests/log-redaction.test.ts apps/api/tests/ai-routes.test.ts
```

Expected RED: current app has no production parser, origin policy or release-aware health response.

- [ ] **Step 2: Implement explicit production configuration**

Development remains usable without proxy config; production startup fails closed. Never set `trustProxy: true`.

- [ ] **Step 3: Implement same-origin and shutdown behavior**

Keep M3 target policy, body limits, timeouts, error mapping and no-store behavior unchanged.

- [ ] **Step 4: Run Task 10 gates**

```powershell
pnpm --filter @youju/api test
pnpm --filter @youju/api typecheck
pnpm test:ai-contract
pnpm check:forbidden-content
git diff --check
```

- [ ] **Step 5: Commit and stop**

```powershell
git add apps/api docs/superpowers/plans/2026-08-13-youju-m4-public-demo-deployment-plan.md
git commit -m "feat: harden M4 production API boundary"
```

---

### Task 11: Add Portable Same-Origin Production Packaging and Security Headers

**Files:**

- Create: `scripts/generate-release-descriptor.ts`
- Create: `scripts/serve-production-candidate.ts`
- Create: `scripts/check-production-headers.ts`
- Create: `deploy/nginx/youju.conf.template`
- Create: `deploy/README.md`
- Modify: `package.json`
- Modify: `apps/web/vite.config.ts`
- Create: `tests/integration/production-routing.test.ts`
- Create: `tests/integration/security-headers.test.ts`
- Modify: `docs/superpowers/plans/2026-08-13-youju-m4-public-demo-deployment-plan.md` Task 11 checkboxes only

**Interfaces:**

- `release.json` contains only validated release ID, full commit, UTC build time, IndexedDB version, case schema version and demo fixture ID.
- Candidate server reproduces static cache rules, SPA fallback exclusions and same-origin `/ai/*` proxy for local tests only.
- Nginx template strips incoming forwarded headers, sets its own, applies body limits/timeouts, routes only approved API paths and serves immutable hashed assets.
- CSP and fixed headers match M4 design; HSTS uses one year without subdomain/preload; no COEP or remote CSP reporting.
- `index.html`, `sw.js`, manifest and `release.json` revalidate; API and errors are no-store.

- [ ] **Step 1: Write production routing/header RED tests**

Test route matrix, static 404, API 404, CSP directives, absence of unsafe tokens, cache headers, request body limit and release pairing.

```powershell
pnpm exec vitest run tests/integration/production-routing.test.ts tests/integration/security-headers.test.ts
```

Expected RED: no release descriptor, production candidate server or deploy template exists.

- [ ] **Step 2: Implement release descriptor and local candidate server**

Use Node built-ins and existing API output; do not introduce a second production application server or dependency.

- [ ] **Step 3: Add reviewed Nginx template**

Template values remain explicit placeholders for domain, certificate paths and trusted upstream address. It is not deployed in this Task.

- [ ] **Step 4: Run Task 11 gates**

```powershell
pnpm build
pnpm check:production-headers
pnpm exec vitest run tests/integration/production-routing.test.ts tests/integration/security-headers.test.ts
pnpm check:web-budget
git diff --check
```

- [ ] **Step 5: Commit and stop**

```powershell
git add scripts/generate-release-descriptor.ts scripts/serve-production-candidate.ts scripts/check-production-headers.ts deploy package.json apps/web/vite.config.ts tests/integration/production-routing.test.ts tests/integration/security-headers.test.ts docs/superpowers/plans/2026-08-13-youju-m4-public-demo-deployment-plan.md
git commit -m "build: add M4 production deployment contract"
```

---

### Task 12: Add Production Candidate E2E and Release Gates

**Files:**

- Modify: `playwright.production.config.ts`
- Create: `tests/e2e/production-public-demo.spec.ts`
- Create: `tests/e2e/production-cache-privacy.spec.ts`
- Create: `tests/e2e/production-release-update.spec.ts`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/superpowers/plans/2026-08-13-youju-m4-public-demo-deployment-plan.md` Task 12 checkboxes only

**Interfaces:**

- Add `e2e:production` and `verify:release-candidate` scripts.
- Production E2E starts built API plus candidate same-origin server; it never contacts a real Provider.
- Cache privacy test enumerates all Cache Storage keys/responses and fails on `/ai`, `/health`, user names, event IDs, Key markers or export data.
- Release update test installs release A, stores local data, activates release B by user confirmation and proves data remains while page-memory Key clears.
- CI adds only release-candidate verification; it does not deploy, push, tag or publish.

- [ ] **Step 1: Write production release RED tests**

```powershell
pnpm e2e:production
```

Expected RED: scripts and complete production flow do not exist.

- [ ] **Step 2: Implement deterministic production E2E harness**

Use fixed localhost ports and Mock Provider only. Tests must fail if the network reaches an unapproved host.

- [ ] **Step 3: Add CI release-candidate gate**

Modify CI only in this explicitly named Task. Preserve existing frozen install and root gates; do not add deployment credentials.

- [ ] **Step 4: Run Task 12 gates**

```powershell
pnpm e2e:production
pnpm verify:release-candidate
git diff --check
git status --short
```

Expected: all unit, integration, regular E2E and production E2E gates pass with no public network calls.

- [ ] **Step 5: Commit and stop**

```powershell
git add playwright.production.config.ts tests/e2e/production-public-demo.spec.ts tests/e2e/production-cache-privacy.spec.ts tests/e2e/production-release-update.spec.ts package.json .github/workflows/ci.yml docs/superpowers/plans/2026-08-13-youju-m4-public-demo-deployment-plan.md
git commit -m "test: add M4 production release gates"
```

---

### Task 13: Write Privacy, Deployment, Operations, and Release Guidance

**Files:**

- Modify: `README.md`
- Modify: `docs/development/local-development.md`
- Modify: `docs/development/roadmap-and-test-order.md`
- Create: `docs/deployment/public-demo.md`
- Create: `docs/deployment/operations.md`
- Create: `docs/security/m4-threat-checklist.md`
- Create: `docs/release/m4-release-checklist.md`
- Modify: `docs/superpowers/plans/2026-08-13-youju-m4-public-demo-deployment-plan.md` Task 13 checkboxes only

**Interfaces:**

- Deployment guide covers domain/region prerequisites without making legal conclusions, certificate/DNS, static/API release pairing, trusted proxy CIDRs, no-volume check, smoke and rollback.
- Operations guide covers health, certificate expiry, 5xx/latency/resource alerts, 7-day maximum log retention, access control and Provider-only degradation.
- Threat checklist maps Service Worker leakage, stale update, demo confusion, proxy spoofing, CSP, static fallback, source maps, release mismatch and rollback to tests/code.
- Release checklist has explicit columns for automated, device, Provider, domestic reachability and external deployment evidence.

- [ ] **Step 1: RED not applicable; review actual implementation evidence**

Do not mark device, Provider, domestic network or public deployment checks complete in this Task.

- [ ] **Step 2: Write operator and privacy guidance**

State clearly that browser data has no server backup, export is user-controlled backup, Provider data is outside local deletion, and no AI is required.

- [ ] **Step 3: Write M4 threat and release checklists**

Every automated claim must link to an actual file/test. Manual rows remain unchecked until Tasks 14/15.

- [ ] **Step 4: Run Task 13 gates**

```powershell
pnpm exec prettier --check README.md docs deploy
pnpm check:forbidden-content
pnpm verify:release-candidate
git diff --check
```

- [ ] **Step 5: Commit and stop**

```powershell
git add README.md docs/development docs/deployment docs/security/m4-threat-checklist.md docs/release/m4-release-checklist.md docs/superpowers/plans/2026-08-13-youju-m4-public-demo-deployment-plan.md
git commit -m "docs: add M4 deployment and operations guidance"
```

---

### Task 14: Run Authorized Real-Device and Provider Validation

**Files:**

- Modify: `docs/release/m4-release-checklist.md` evidence rows only
- Modify: `docs/security/m4-threat-checklist.md` manual evidence rows only
- Modify: `docs/superpowers/plans/2026-08-13-youju-m4-public-demo-deployment-plan.md` Task 14 checkboxes only

**Preconditions:**

- User explicitly authorizes Task 14 and identifies available physical devices/browsers.
- Any real Provider check has a dedicated low-limit test Key, approved fictional sample and current Provider terms review.
- Key entry happens only in the browser UI; it is never pasted into chat, shell, file, screenshot or test code.

- [ ] **Step 1: RED not applicable; freeze release candidate**

Record full commit and production build summary. Do not modify runtime code during evidence collection; discovered defects return to their owning Task as a new fix commit and require rerun.

- [ ] **Step 2: Run physical device/browser matrix**

At minimum record Windows Chrome/Edge, Android Chrome, one available domestic Android browser, iOS Safari and WeChat embedded-browser degradation. Test direct access, demo, OPFS/degradation, import, refresh, export, delete, install, offline and update as applicable.

- [ ] **Step 3: Run authorized Provider checks**

For every available preset, use the smallest fictional sample and record Provider/model/protocol/date/network/result/error mapping/terms status without content or Key. Unavailable presets remain “本版本未做真实验证”.

- [ ] **Step 4: Run regression after manual checks**

```powershell
pnpm verify:release-candidate
pnpm check:forbidden-content
git diff --check
```

- [ ] **Step 5: Commit evidence and stop**

```powershell
git add docs/release/m4-release-checklist.md docs/security/m4-threat-checklist.md docs/superpowers/plans/2026-08-13-youju-m4-public-demo-deployment-plan.md
git commit -m "test: record M4 real environment checks"
```

Do not include screenshots or logs containing user data, Key, full IP or Provider response content.

---

### Task 15: Deploy the Approved Public Target and Complete M4 Acceptance

**Files:**

- Modify: `docs/release/m4-release-checklist.md` deployment evidence only
- Modify: `docs/security/m4-threat-checklist.md` remaining-risk status only
- Modify: `docs/development/roadmap-and-test-order.md` M4 completion status only
- Modify: `README.md` public URL/release status only if approved
- Modify: `docs/superpowers/plans/2026-08-13-youju-m4-public-demo-deployment-plan.md` Task 15 checkboxes only

**Preconditions:**

- User explicitly authorizes external deployment and supplies/approves provider, region, domain, DNS, certificate and access method.
- Operator has separately confirmed applicable filing/compliance requirements; Codex does not infer legal eligibility.
- Task 14 release candidate has no unresolved release blocker.
- Deployment must not require a business database, persistent volume, object storage, queue, shared AI Key or analytics SDK.

- [ ] **Step 1: RED not applicable; preview exact external changes**

List target resources, domain, static artifact hash, API artifact hash, trusted proxy CIDRs, log retention, rollback release and secrets names without values. Stop for approval if scope differs.

- [ ] **Step 2: Deploy static Web and single Fastify service**

Deploy API first, verify health/release ID, then static Web. Do not push, tag, create a release or change DNS beyond the explicitly approved actions.

- [ ] **Step 3: Run public smoke and security checks**

From an ordinary domestic network path verify HTTPS, same-origin `/ai`, headers, SPA/static 404 behavior, no-registration/no-AI demo export, offline shell, update prompt, deletion and log absence of sensitive content.

- [ ] **Step 4: Exercise rollback and restore candidate**

Prove Web/API can roll back as a pair without deleting local browser data, then restore the approved release and repeat smoke.

- [ ] **Step 5: Run final local gates**

```powershell
pnpm install --frozen-lockfile
pnpm check:forbidden-content
pnpm validate:fixtures
pnpm validate:public-demo
pnpm verify:release-candidate
git diff --check
```

- [ ] **Step 6: Review every M4 acceptance criterion**

Any missing implementation requirement returns to the owning earlier Task; it is not waived in documentation. Honest unverified Provider labels are allowed, but no-AI public demo, security headers, deployment rollback and domestic direct access are mandatory.

- [ ] **Step 7: Commit completion evidence and stop**

```powershell
git add README.md docs/development/roadmap-and-test-order.md docs/release/m4-release-checklist.md docs/security/m4-threat-checklist.md docs/superpowers/plans/2026-08-13-youju-m4-public-demo-deployment-plan.md
git commit -m "docs: complete M4 public demo evidence"
```

Do not push, merge, tag, create GitHub/Gitee releases or start M5 without separate explicit user authorization.

---

## M4 Traceability Matrix

| Approved M4 requirement                                             | Owning Task(s) |
| ------------------------------------------------------------------- | -------------- |
| Explicit fictional demo identity and migration                      | 1, 2           |
| Validated public demo fixture with no real data                     | 3              |
| Idempotent load, recovery, reset and user-case isolation            | 4              |
| Demo marker in PDF/CSV/HTML/ZIP and filenames                       | 5              |
| First-use explanation and persistent-storage status                 | 6              |
| Public home, privacy, about, feedback and demo banner               | 7              |
| Prompted PWA update and strict offline shell                        | 8              |
| Initial-load and precache budgets                                   | 9              |
| Trusted proxy, same-origin request policy, log safety and health    | 10             |
| Same-origin deployment contract, headers, cache and release pairing | 11             |
| Production Service Worker/cache/security/no-AI automated gates      | 12             |
| Privacy, deployment, operations, threat and release guidance        | 13             |
| Physical devices, domestic browsers and honest Provider matrix      | 14             |
| Public HTTPS deployment, domestic reachability, smoke and rollback  | 15             |
| No registration and no AI required                                  | 4, 7, 12, 15   |
| No business data/server persistence or shared Key                   | 10, 11, 13, 15 |
| M5 telemetry remains out of scope                                   | 7, 10, 13, 15  |

---

## Planned Validation Commands

The following commands must exist and pass by M4 completion:

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm check:forbidden-content
pnpm validate:fixtures
pnpm validate:public-demo
pnpm test:ai-contract
pnpm eval:golden-case
pnpm build
pnpm check:web-budget
pnpm e2e
pnpm e2e:production
pnpm verify:release-candidate
pnpm verify
```

`verify:release-candidate` must include all root gates plus public fixture validation, Web budget, production header/routing integration tests and production PWA E2E. It must never make a paid or public Provider call.

---

## Dependency Review

M4 不计划增加第三方运行时或开发依赖：

- PWA 更新继续使用已锁定的 `vite-plugin-pwa`；
- 生产候选服务器与发布脚本使用 Node.js 内置模块；
- 安全头和反向代理使用配置模板，不向 Web 注入脚本；
- 设备和真实 Provider 检查是人工门禁，不安装 Provider SDK 或浏览器插件。

如果任何 Task 发现必须增加依赖，应停止并提交独立的依赖评审，说明精确版本、许可证、维护状态、供应链风险、替代方案和不可替代原因。

---

## Plan Self-Review Record

- [x] 每项已批准 M4 设计要求都映射到至少一个 Task。
- [x] 核心数据模型与迁移先于演示加载、UI 和部署。
- [x] 演示身份不是通过标题、固定 UUID 或路径推断。
- [x] 公共夹具完全虚构、体积受限、摘要验证且不含 AI Key/真实数据。
- [x] 演示加载跨 IndexedDB/OPFS 有操作日志、恢复和删除核验。
- [x] 每种正式导出格式都有不可遗漏的演示标记回归。
- [x] PWA 更新由用户确认，缓存边界明确排除用户数据和 AI 流量。
- [x] 持久化存储拒绝或不支持时诚实降级，不宣称服务器备份。
- [x] 公共页面不把 AI、注册或 Provider 可用性作为核心流程前提。
- [x] 首屏与预缓存预算有自动失败门禁，重型模块按需加载。
- [x] 代理信任使用明确 CIDR，不使用 `trustProxy: true`。
- [x] CSP、安全头、cache、SPA fallback 和 release pairing 有集成测试。
- [x] 日志只保留低敏元数据且最长 7 天，不引入遥测或远程错误追踪。
- [x] CI 变化仅位于明确的 Task 12，且不执行自动部署。
- [x] 真实设备、Provider 与公共部署被拆成需要单独授权的人工 Task。
- [x] 无法获得 Key 的 Provider 可以诚实标记未验证，不阻断无 AI 公开演示。
- [x] 每个运行时 Task 都要求有效 RED、最小实现、相关回归、独立提交并停止。
- [x] 没有 Task 自动 push、合并、打标签、发布、创建 worktree、子智能体或开始 M5。
