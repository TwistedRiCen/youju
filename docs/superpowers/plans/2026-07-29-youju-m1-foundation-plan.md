# 有据 M1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立有据V0.1可持续开发的仓库底座，交付运行时领域契约、规则引擎基础、AI Schema、黄金案例1、Web/API外壳、自动化测试和CI。

**Architecture:** 使用pnpm TypeScript monorepo，包之间只通过公开入口通信。M1不实现真实证据存储、PDF导出或AI调用，只建立这些后续能力依赖的稳定契约和可运行集成骨架。Web提供项目边界首页和开发态黄金案例诊断页；API只提供无状态健康检查与安全日志基线。

**Tech Stack:** Node.js 24 LTS, pnpm 10.34.5, TypeScript strict, Vue 3, Vite 8, Fastify 5, TypeBox, YAML, Vitest, Playwright, ESLint, Prettier, GitHub Actions.

## Global Constraints

- V0.1只支持“网购商品存在问题且商家拒绝退款”。
- 原始材料默认保存在用户设备，不默认上传业务服务器。
- 无AI路径必须完整可用。
- API Key默认只保存在当前会话内存；M1不得实现API Key持久化。
- AI只产生候选内容；M1只定义契约，不调用真实模型。
- 服务端不得引入数据库、队列、用户系统或对象存储。
- 不创建法律规则、赔偿计算、投诉发送、商家评分或社区功能。
- 用户界面文案使用简体中文；代码标识符和提交信息使用英文。

---

## File Map

M1创建或修改以下文件：

```text
AGENTS.md                                      # 已存在，项目级Codex约束
package.json                                   # 根脚本和开发依赖
pnpm-workspace.yaml                            # workspace范围
.nvmrc                                         # Node 24
.npmrc                                         # pnpm安全和一致性配置
tsconfig.base.json                             # strict TypeScript基线
eslint.config.js                               # 根lint配置
prettier.config.mjs                            # 格式化配置
vitest.config.ts                               # 多项目测试配置
playwright.config.ts                           # E2E浏览器和Web服务
.github/workflows/ci.yml                       # CI
apps/web/...                                   # Vue/PWA外壳
apps/api/...                                   # Fastify无状态外壳
packages/domain/...                            # 领域Schema和类型
packages/rule-engine/...                       # 规则Schema、加载和评估
packages/ai-core/...                           # AI结构化输出Schema
packages/test-support/...                      # 固定ID和fixture读取
rules/consumer/ecommerce-refund.v1.yaml        # V0.1稳定规则
fixtures/ecommerce-refund/case-001-transport-damage/... # 虚构案例1
scripts/validate-fixtures.ts                   # 黄金案例验证命令
tests/e2e/home-and-diagnostics.spec.ts         # M1 smoke E2E
```

---

### Task 1: Initialize the pnpm TypeScript Workspace

**Files:**
- Create: `.nvmrc`
- Create: `.npmrc`
- Create: `pnpm-workspace.yaml`
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `tsconfig.json`
- Create: `eslint.config.js`
- Create: `prettier.config.mjs`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `.editorconfig`
- Test: `tests/config/root-config.test.ts`

**Interfaces:**
- Consumes: approved design spec and `AGENTS.md`.
- Produces: root commands `lint`, `typecheck`, `test`, `validate:fixtures`, `build`, `e2e`, `verify`; workspace package naming convention `@youju/*`.

- [ ] **Step 1: Rename the default branch and create an isolated implementation branch**

Run:

```bash
if [ "$(git branch --show-current)" = "master" ]; then git branch -m main; fi
if [ "$(git branch --show-current)" != "feat/m1-foundation" ]; then
  git switch -c feat/m1-foundation
fi
```

Expected: current branch is `feat/m1-foundation`; `git status --short` contains no implementation changes. When an isolated worktree already created this branch, the command leaves it unchanged.

- [ ] **Step 2: Write the failing root configuration test**

Create `tests/config/root-config.test.ts`:

```typescript
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const readJson = async (path: string) =>
  JSON.parse(await readFile(new URL(`../../${path}`, import.meta.url), 'utf8')) as Record<string, unknown>

describe('root workspace configuration', () => {
  it('pins Node 24 and exposes the required quality gates', async () => {
    const packageJson = await readJson('package.json')
    const scripts = packageJson.scripts as Record<string, string>
    const engines = packageJson.engines as Record<string, string>

    expect(engines.node).toBe('>=24 <25')
    expect(scripts).toMatchObject({
      lint: 'eslint .',
      typecheck: 'tsc -p tsconfig.json --noEmit && pnpm -r --if-present typecheck',
      test: 'vitest run',
      'validate:fixtures': 'tsx scripts/validate-fixtures.ts',
      build: 'pnpm -r --if-present build',
      e2e: 'playwright test',
      verify: 'pnpm lint && pnpm typecheck && pnpm test && pnpm validate:fixtures && pnpm build && pnpm e2e',
    })
  })
})
```

- [ ] **Step 3: Run the test to verify it fails before configuration exists**

Run:

```bash
pnpm exec vitest run tests/config/root-config.test.ts
```

Expected: FAIL because root package configuration and/or Vitest dependency is missing. If `pnpm` is unavailable, install pnpm 10.34.5 first and record the exact installed version in `packageManager`.

- [ ] **Step 4: Create the root workspace files**

Create `.nvmrc`:

```text
24
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - apps/*
  - packages/*
```

Create `.npmrc`:

```ini
engine-strict=true
strict-peer-dependencies=true
prefer-frozen-lockfile=true
minimum-release-age=1440
```

Create root `package.json` with the pinned pnpm 10.34.5 version in `packageManager`:

```json
{
  "name": "youju",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.34.5",
  "engines": {
    "node": ">=24 <25",
    "pnpm": ">=10 <11"
  },
  "scripts": {
    "dev": "pnpm --parallel --filter @youju/web --filter @youju/api dev",
    "lint": "eslint .",
    "typecheck": "tsc -p tsconfig.json --noEmit && pnpm -r --if-present typecheck",
    "test": "vitest run",
    "validate:fixtures": "tsx scripts/validate-fixtures.ts",
    "build": "pnpm -r --if-present build",
    "e2e": "playwright test",
    "verify": "pnpm lint && pnpm typecheck && pnpm test && pnpm validate:fixtures && pnpm build && pnpm e2e"
  },
  "devDependencies": {
    "@eslint/js": "^9.0.0",
    "@playwright/test": "^1.0.0",
    "@types/node": "^24.0.0",
    "eslint": "^9.0.0",
    "eslint-config-prettier": "^10.0.0",
    "globals": "^16.0.0",
    "prettier": "^3.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.0.0",
    "typescript-eslint": "^8.0.0",
    "vitest": "^4.0.0"
  }
}
```

Before installation, replace only `packageManager` with the exact pnpm 10.34.5 version printed by `pnpm --version`; keep all major-version constraints unchanged.

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "useUnknownInCatchVariables": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

Create root `tsconfig.json`:

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["tests/**/*.ts", "scripts/**/*.ts", "*.ts"]
}
```

Create `eslint.config.js`:

```javascript
import eslint from '@eslint/js'
import prettier from 'eslint-config-prettier'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', 'playwright-report/**', 'test-results/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['**/*.ts'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
)
```

Create `prettier.config.mjs`:

```javascript
export default {
  semi: false,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
}
```

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      'packages/*',
      'apps/*',
      {
        test: {
          name: 'root-config',
          include: ['tests/config/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
  },
})
```

Create `.editorconfig`:

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

Create `.gitignore`:

```gitignore
node_modules/
dist/
coverage/
playwright-report/
test-results/
.env
.env.*
!.env.example
.DS_Store
*.log
```

- [ ] **Step 5: Install dependencies and run the root test**

Run:

```bash
pnpm install
pnpm exec vitest run tests/config/root-config.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run formatting and static checks**

Run:

```bash
pnpm exec prettier --check .
pnpm exec eslint tests/config/root-config.test.ts
```

Expected: both commands PASS.

- [ ] **Step 7: Commit the workspace baseline**

```bash
git add .nvmrc .npmrc pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json tsconfig.json eslint.config.js prettier.config.mjs vitest.config.ts .editorconfig .gitignore tests/config/root-config.test.ts
git commit -m "chore: initialize TypeScript workspace"
```

---

### Task 2: Define Runtime-Validated Domain Contracts

**Files:**
- Create: `packages/domain/package.json`
- Create: `packages/domain/tsconfig.json`
- Create: `packages/domain/vitest.config.ts`
- Create: `packages/domain/src/schemas.ts`
- Create: `packages/domain/src/index.ts`
- Test: `packages/domain/tests/schemas.test.ts`

**Interfaces:**
- Consumes: root TypeScript configuration.
- Produces: `CaseEventSchema`, `EvidenceFileSchema`, `FactCandidateSchema`, `ConfirmedFactSchema`, `TimelineEntrySchema`, `AnalysisVersionSchema`, `ReviewStatusSchema`, and inferred TypeScript types.

- [ ] **Step 1: Write failing domain contract tests**

Create `packages/domain/tests/schemas.test.ts`:

```typescript
import { Value } from '@sinclair/typebox/value'
import { describe, expect, it } from 'vitest'
import {
  CaseEventSchema,
  FactCandidateSchema,
  TimelineEntrySchema,
} from '../src/index.js'

describe('domain schemas', () => {
  it('accepts a valid ecommerce refund case', () => {
    expect(
      Value.Check(CaseEventSchema, {
        id: '00000000-0000-4000-8000-000000000001',
        scenarioType: 'ecommerce_refund',
        title: '运输破损退款纠纷',
        createdAt: '2026-07-29T10:00:00.000Z',
        updatedAt: '2026-07-29T10:00:00.000Z',
        status: 'draft',
        requestedResolution: null,
        storageMode: 'local',
        schemaVersion: 1,
      }),
    ).toBe(true)
  })

  it('rejects an unsupported scenario', () => {
    expect(
      Value.Check(CaseEventSchema, {
        id: '00000000-0000-4000-8000-000000000001',
        scenarioType: 'medical_dispute',
        title: 'unsupported',
        createdAt: '2026-07-29T10:00:00.000Z',
        updatedAt: '2026-07-29T10:00:00.000Z',
        status: 'draft',
        requestedResolution: null,
        storageMode: 'local',
        schemaVersion: 1,
      }),
    ).toBe(false)
  })

  it('restricts candidate review status and timeline precision', () => {
    expect(
      Value.Check(FactCandidateSchema, {
        id: '00000000-0000-4000-8000-000000000010',
        caseId: '00000000-0000-4000-8000-000000000001',
        factType: 'payment',
        fieldName: 'paid_amount',
        value: '899.00',
        normalizedValue: '89900',
        sourceRefs: [{ evidenceId: '00000000-0000-4000-8000-000000000020' }],
        confidenceLevel: 'high',
        origin: 'ai',
        reviewStatus: 'pending',
        createdAt: '2026-07-29T10:00:00.000Z',
        analysisVersionId: '00000000-0000-4000-8000-000000000030',
      }),
    ).toBe(true)

    expect(
      Value.Check(TimelineEntrySchema, {
        id: '00000000-0000-4000-8000-000000000040',
        caseId: '00000000-0000-4000-8000-000000000001',
        occurredAt: null,
        timePrecision: 'unknown',
        summary: '商家拒绝退款',
        detail: null,
        sourceRefs: [],
        status: 'draft',
        sortOrder: 1,
      }),
    ).toBe(true)
  })
})
```

- [ ] **Step 2: Run the package test and confirm failure**

Run:

```bash
pnpm exec vitest run packages/domain/tests/schemas.test.ts
```

Expected: FAIL because package and schemas do not exist.

- [ ] **Step 3: Create the domain package and minimal schemas**

Create `packages/domain/package.json`:

```json
{
  "name": "@youju/domain",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "lint": "eslint src tests",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "build": "tsc --noEmit"
  },
  "dependencies": {
    "@sinclair/typebox": "^0.34.0"
  },
  "devDependencies": {
    "vitest": "^4.0.0"
  }
}
```

Create `packages/domain/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "vitest.config.ts"]
}
```

Create `packages/domain/vitest.config.ts`:

```typescript
import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: '@youju/domain',
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
```

Use the TypeBox 0.x LTS package `@sinclair/typebox`, which remains compatible with the TypeScript 5.x baseline. Implement schemas with these exact public literals:

```typescript
export const ScenarioTypeSchema = Type.Literal('ecommerce_refund')
export const CaseStatusSchema = Type.Union([
  Type.Literal('draft'),
  Type.Literal('in_progress'),
  Type.Literal('ready_to_export'),
  Type.Literal('exported'),
])
export const ReviewStatusSchema = Type.Union([
  Type.Literal('pending'),
  Type.Literal('confirmed'),
  Type.Literal('edited_and_confirmed'),
  Type.Literal('rejected'),
  Type.Literal('conflicted'),
])
export const TimePrecisionSchema = Type.Union([
  Type.Literal('minute'),
  Type.Literal('date'),
  Type.Literal('approximate'),
  Type.Literal('unknown'),
])
```

Use `Type.String({ pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' })` for UUIDs and an explicit ISO-8601 UTC pattern for timestamps; `Type.Union([Type.String(), Type.Null()])` for nullable text, and `Type.Integer({ minimum: 1 })` for schema versions. Export inferred `Static<typeof Schema>` types from `src/index.ts`.


- [ ] **Step 4: Run tests and type checking**

Run:

```bash
pnpm --filter @youju/domain test
pnpm --filter @youju/domain typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit the domain contracts**

```bash
git add packages/domain package.json pnpm-lock.yaml
git commit -m "feat: define domain contracts"
```

---

### Task 3: Define the Versioned Rule Schema and Deterministic Evaluator

**Files:**
- Create: `packages/rule-engine/package.json`
- Create: `packages/rule-engine/tsconfig.json`
- Create: `packages/rule-engine/vitest.config.ts`
- Create: `packages/rule-engine/src/rule-schema.ts`
- Create: `packages/rule-engine/src/evaluate-rule.ts`
- Create: `packages/rule-engine/src/index.ts`
- Create: `rules/consumer/ecommerce-refund.v1.yaml`
- Test: `packages/rule-engine/tests/evaluate-rule.test.ts`

**Interfaces:**
- Consumes: `@youju/domain` evidence categories and confirmed fact field names.
- Produces: `EcommerceRefundRuleSchema`, `evaluateRule(input): RuleFinding[]`, and rule file `consumer.ecommerce.refund.basic@1.0.0`.

- [ ] **Step 1: Write failing rule evaluation tests**

Create test cases that pass confirmed fields `purchase_time`, `merchant_name`, `product_name`, `paid_amount`, `problem_description`, `requested_resolution` and evidence categories. Assert:

```typescript
expect(findings).toEqual([
  {
    ruleId: 'consumer.ecommerce.refund.basic',
    ruleVersion: '1.0.0',
    severity: 'warning',
    resultType: 'missing_evidence',
    message: '建议补充：商家沟通记录',
    relatedEvidenceIds: [],
    sourceReference: 'stable-method:merchant-communication',
  },
])
```

Add a second test asserting no missing-required-fact finding when all required facts are present.

- [ ] **Step 2: Run and confirm failure**

```bash
pnpm exec vitest run packages/rule-engine/tests/evaluate-rule.test.ts
```

Expected: FAIL because rule engine is absent.

- [ ] **Step 3: Implement the rule schema and evaluator**

Create `packages/rule-engine/package.json` with:

```json
{
  "name": "@youju/rule-engine",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "lint": "eslint src tests",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "build": "tsc --noEmit"
  },
  "dependencies": {
    "@sinclair/typebox": "^0.34.0",
    "@youju/domain": "workspace:*",
    "yaml": "^2.0.0"
  },
  "devDependencies": { "vitest": "^4.0.0" }
}
```

Create `packages/rule-engine/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "vitest.config.ts"]
}
```

Create `packages/rule-engine/vitest.config.ts`:

```typescript
import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: '@youju/rule-engine',
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
```

The YAML must contain:

```yaml
id: consumer.ecommerce.refund.basic
version: 1.0.0
scenario: ecommerce_refund
source:
  description: 网购退款纠纷材料整理的稳定方法
  scope: 中国大陆普通消费场景，仅用于材料整理
  stable: true
  lastVerifiedAt: '2026-07-29'
  maintainer: YouJu contributors
requiredFacts:
  - purchase_time
  - merchant_name
  - product_name
  - paid_amount
  - problem_description
  - requested_resolution
recommendedEvidence:
  - category: order_record
    label: 订单记录
    sourceReference: stable-method:order-record
  - category: payment_record
    label: 支付凭证
    sourceReference: stable-method:payment-record
  - category: product_issue_photo
    label: 商品问题照片
    sourceReference: stable-method:product-photo
  - category: merchant_communication
    label: 商家沟通记录
    sourceReference: stable-method:merchant-communication
warnings:
  - preserve_original_files
  - preserve_original_device
  - avoid_editing_original_screenshots
```

`evaluateRule()` must be pure, deterministic, and must not reference UI or AI packages. Missing facts produce `severity: 'blocking'` and `resultType: 'missing_fact'`; missing recommended evidence produces `severity: 'warning'` and `resultType: 'missing_evidence'`.

- [ ] **Step 4: Run package and cross-package tests**

```bash
pnpm --filter @youju/rule-engine test
pnpm --filter @youju/rule-engine typecheck
pnpm --filter @youju/domain test
```

Expected: PASS.

- [ ] **Step 5: Commit the rule engine**

```bash
git add packages/rule-engine rules/consumer/ecommerce-refund.v1.yaml package.json pnpm-lock.yaml
git commit -m "feat: add ecommerce refund rule engine"
```

---

### Task 4: Define AI Structured Output Contracts

**Files:**
- Create: `packages/ai-core/package.json`
- Create: `packages/ai-core/tsconfig.json`
- Create: `packages/ai-core/vitest.config.ts`
- Create: `packages/ai-core/src/source-location.ts`
- Create: `packages/ai-core/src/classification.ts`
- Create: `packages/ai-core/src/fact-extraction.ts`
- Create: `packages/ai-core/src/timeline.ts`
- Create: `packages/ai-core/src/statement.ts`
- Create: `packages/ai-core/src/index.ts`
- Test: `packages/ai-core/tests/contracts.test.ts`

**Interfaces:**
- Consumes: `@youju/domain` categories, fact types and source references.
- Produces: runtime schemas for classification, fact extraction, timeline candidates, missing-material suggestions and statement drafts.

- [ ] **Step 1: Write failing contract tests**

Include tests that:

- accept a fact with `sourceFileId` and page/region;
- reject an AI fact without any source reference;
- reject a statement containing a non-confirmed fact reference;
- reject unknown legal conclusion fields such as `legalLiability` because schemas use `additionalProperties: false`.

Example valid extraction:

```typescript
{
  analysisVersionId: '00000000-0000-4000-8000-000000000030',
  facts: [
    {
      factType: 'payment',
      fieldName: 'paid_amount',
      value: '899.00',
      normalizedValue: '89900',
      confidenceLevel: 'high',
      sources: [
        {
          evidenceId: '00000000-0000-4000-8000-000000000020',
          page: 1,
          region: { x: 112, y: 306, width: 358, height: 53 },
        },
      ],
    },
  ],
  uncertainties: [],
  warnings: [],
}
```

- [ ] **Step 2: Run and confirm failure**

```bash
pnpm exec vitest run packages/ai-core/tests/contracts.test.ts
```

Expected: FAIL because contracts are absent.

- [ ] **Step 3: Implement strict TypeBox schemas**

Create `packages/ai-core/package.json` with:

```json
{
  "name": "@youju/ai-core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "lint": "eslint src tests",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "build": "tsc --noEmit"
  },
  "dependencies": {
    "@sinclair/typebox": "^0.34.0",
    "@youju/domain": "workspace:*"
  },
  "devDependencies": { "vitest": "^4.0.0" }
}
```

Create `packages/ai-core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "vitest.config.ts"]
}
```

Create `packages/ai-core/vitest.config.ts`:

```typescript
import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: '@youju/ai-core',
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
```

Rules:

- Every object uses `{ additionalProperties: false }`;
- every extracted fact has at least one source;
- region coordinates are non-negative integers;
- confidence is `high | needs_confirmation | conflicted | unknown`;
- statement input references only `confirmedFactIds`;
- no field represents legal conclusion, compensation or success probability.

- [ ] **Step 4: Run tests, typecheck and export a JSON Schema snapshot**

Create a test snapshot for `ExtractFactsResultSchema` so accidental contract changes are reviewed.

Run:

```bash
pnpm --filter @youju/ai-core test
pnpm --filter @youju/ai-core typecheck
```

Expected: PASS and a committed stable snapshot.

- [ ] **Step 5: Commit AI contracts**

```bash
git add packages/ai-core package.json pnpm-lock.yaml
git commit -m "feat: define AI output contracts"
```

---

### Task 5: Create Golden Case 001 and Fixture Validation

**Files:**
- Create: `packages/test-support/package.json`
- Create: `packages/test-support/src/fixture-schema.ts`
- Create: `packages/test-support/src/load-fixture.ts`
- Create: `packages/test-support/src/browser-summary.ts`
- Create: `packages/test-support/src/index.ts`
- Create: `fixtures/ecommerce-refund/case-001-transport-damage/manifest.json`
- Create: `fixtures/ecommerce-refund/case-001-transport-damage/case.json`
- Create: `fixtures/ecommerce-refund/case-001-transport-damage/evidence/*.json`
- Create: `fixtures/ecommerce-refund/case-001-transport-damage/expected/facts.json`
- Create: `fixtures/ecommerce-refund/case-001-transport-damage/expected/timeline.json`
- Create: `fixtures/ecommerce-refund/case-001-transport-damage/expected/findings.json`
- Create: `fixtures/ecommerce-refund/case-001-transport-damage/README.md`
- Create: `scripts/validate-fixtures.ts`
- Test: `packages/test-support/tests/load-fixture.test.ts`

**Interfaces:**
- Consumes: domain, rule and AI schemas.
- Produces: `loadGoldenCase(path): GoldenCase`, CLI `pnpm validate:fixtures`, and case ID `case-001-transport-damage`.

- [ ] **Step 1: Write failing fixture loader tests**

The test must load the fixture and assert:

```typescript
expect(fixture.manifest).toMatchObject({
  id: 'case-001-transport-damage',
  fictional: true,
  scenarioType: 'ecommerce_refund',
})
expect(fixture.evidence).toHaveLength(4)
expect(fixture.expected.confirmedFacts).toHaveLength(6)
expect(fixture.expected.timeline).toHaveLength(4)
```

Add a test that changes `fictional` to `false` in an in-memory object and confirms schema validation fails. This prevents accidental real-person fixtures.

- [ ] **Step 2: Run and confirm failure**

```bash
pnpm exec vitest run packages/test-support/tests/load-fixture.test.ts
```

Expected: FAIL because fixture loader and data are absent.

- [ ] **Step 3: Create the test-support package and fully fictional fixture**

Create `packages/test-support/package.json` with:

```json
{
  "name": "@youju/test-support",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./browser": "./src/browser-summary.ts"
  },
  "scripts": {
    "lint": "eslint src tests",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "build": "tsc --noEmit"
  },
  "dependencies": {
    "@sinclair/typebox": "^0.34.0",
    "@youju/ai-core": "workspace:*",
    "@youju/domain": "workspace:*",
    "@youju/rule-engine": "workspace:*"
  },
  "devDependencies": { "vitest": "^4.0.0" }
}
```

Create `packages/test-support/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "vitest.config.ts"]
}
```

Create `packages/test-support/vitest.config.ts`:

```typescript
import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: '@youju/test-support',
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
```

Create `packages/test-support/src/browser-summary.ts` as a browser-safe module with no `node:*` imports:

```typescript
export interface GoldenCaseSummary {
  id: string
  title: string
  evidenceCount: number
  confirmedFactCount: number
  timelineCount: number
  ruleValidation: 'passed' | 'failed'
}

export const goldenCase001Summary: GoldenCaseSummary = {
  id: 'case-001-transport-damage',
  title: '运输破损退款纠纷（完全虚构）',
  evidenceCount: 4,
  confirmedFactCount: 6,
  timelineCount: 4,
  ruleValidation: 'passed',
}
```

The fixture loader test must compare this exported summary with the loaded fixture counts so the browser-safe summary cannot drift from the golden case.

M1 fixture uses JSON/text representations of four synthetic materials; M2 will add image/PDF binary fixtures when file import is implemented. Required fictional values:

- platform: `示例商城`;
- merchant: `晴川生活示例店`;
- product: `便携折叠桌（虚构商品）`;
- paid amount: `89900` fen;
- purchase time: `2026-07-01T12:16:00.000Z`;
- received time: `2026-07-03T06:30:00.000Z`;
- issue: package and tabletop damaged;
- merchant response: rejects refund as alleged user damage;
- requested resolution: return and refund of paid amount.

Every fixture file must contain `fictional: true` or inherit it from a validated manifest. Do not use real platform logos, real store names, real phone numbers, real order numbers or real addresses.

- [ ] **Step 4: Implement validator CLI**

`scripts/validate-fixtures.ts` must:

1. discover fixture directories under `fixtures/ecommerce-refund`;
2. load each manifest;
3. validate all domain records;
4. validate expected rule findings by running `evaluateRule()`;
5. print one line per case;
6. exit non-zero on the first invalid fixture without printing sensitive content.

Expected success output:

```text
PASS case-001-transport-damage: 4 evidence, 6 confirmed facts, 4 timeline entries
Validated 1 golden case.
```

- [ ] **Step 5: Run fixture and package tests**

```bash
pnpm --filter @youju/test-support test
pnpm validate:fixtures
```

Expected: PASS with the exact case count.

- [ ] **Step 6: Commit the golden case**

```bash
git add packages/test-support fixtures scripts/validate-fixtures.ts package.json pnpm-lock.yaml
git commit -m "test: add first fictional golden case"
```

---

### Task 6: Create the Vue Web/PWA Shell and Diagnostics Page

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.ts`
- Create: `apps/web/src/App.vue`
- Create: `apps/web/src/router.ts`
- Create: `apps/web/src/views/HomeView.vue`
- Create: `apps/web/src/views/DiagnosticsView.vue`
- Create: `apps/web/src/services/load-golden-case-summary.ts`
- Test: `apps/web/tests/home.test.ts`
- Test: `apps/web/tests/diagnostics.test.ts`

**Interfaces:**
- Consumes: domain, rule-engine, ai-core and the browser-safe `@youju/test-support/browser` export.
- Produces: routes `/` and development-only `/dev/diagnostics`; PWA manifest; visible product boundary.

- [ ] **Step 1: Write failing Home and diagnostics tests**

Home test must assert visible text:

```text
有据
整理事实与材料，不替你作法律判断
无需注册；不使用AI也能完成核心流程
```

Diagnostics test must assert case ID, evidence count `4`, confirmed fact count `6`, timeline count `4`, and rule validation status `通过`.

- [ ] **Step 2: Run and confirm failure**

```bash
pnpm exec vitest run apps/web/tests/home.test.ts apps/web/tests/diagnostics.test.ts
```

Expected: FAIL because app is absent.

- [ ] **Step 3: Scaffold the minimal Vue application**

Create `apps/web/package.json` with these package identities and scripts; resolve exact compatible patch versions during `pnpm install` and preserve them in `pnpm-lock.yaml`:

```json
{
  "name": "@youju/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "lint": "eslint src tests vite.config.ts",
    "typecheck": "vue-tsc --noEmit",
    "test": "vitest run",
    "build": "vue-tsc --noEmit && vite build",
    "preview": "vite preview --host 0.0.0.0"
  },
  "dependencies": {
    "@youju/ai-core": "workspace:*",
    "@youju/domain": "workspace:*",
    "@youju/rule-engine": "workspace:*",
    "@youju/test-support": "workspace:*",
    "vue": "^3.0.0",
    "vue-router": "^4.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^6.0.0",
    "@vue/test-utils": "^2.0.0",
    "happy-dom": "^20.0.0",
    "vite": "^8.0.0",
    "vite-plugin-pwa": "^1.0.0",
    "vitest": "^4.0.0",
    "vue-tsc": "^3.0.0"
  }
}
```

Use `moduleResolution: Bundler` in the Web tsconfig while retaining all strict flags from the root base config. Use a Vitest project named `@youju/web` with `happy-dom`.

Requirements:

- no UI component framework;
- semantic HTML and mobile-first layout;
- no analytics SDK;
- no remote fonts or scripts;
- `/dev/diagnostics` only included when `import.meta.env.DEV` is true, using a conditional dynamic import so the diagnostics component is absent from production chunks;
- PWA manifest name `有据 YouJu`, display `standalone`, language `zh-CN`;
- service worker in M1 caches only application shell, not user evidence.

Home actions may be disabled placeholders only when clearly labeled `M2开放`; do not create fake working upload or AI controls.

- [ ] **Step 4: Implement fixture summary adapter**

`loadGoldenCaseSummary()` imports `goldenCase001Summary` from `@youju/test-support/browser` and returns only low-risk synthetic counts:

```typescript
export interface GoldenCaseSummary {
  id: string
  title: string
  evidenceCount: number
  confirmedFactCount: number
  timelineCount: number
  ruleValidation: 'passed' | 'failed'
}
```

It must not expose a generic production path for loading user files from the server.

- [ ] **Step 5: Run Web tests and build**

```bash
pnpm --filter @youju/web test
pnpm --filter @youju/web typecheck
pnpm --filter @youju/web build
```

Expected: PASS; production build does not contain `/dev/diagnostics` route.

- [ ] **Step 6: Commit the Web shell**

```bash
git add apps/web package.json pnpm-lock.yaml
git commit -m "feat: add web application shell"
```

---

### Task 7: Create the Stateless Fastify API Shell and Log Redaction

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/tsconfig.build.json`
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/server.ts`
- Create: `apps/api/src/routes/health.ts`
- Create: `apps/api/src/logging.ts`
- Test: `apps/api/tests/health.test.ts`
- Test: `apps/api/tests/log-redaction.test.ts`

**Interfaces:**
- Consumes: no business storage package.
- Produces: `buildApp(): FastifyInstance`, `GET /health`, and redacted logging configuration reusable by M3 relay.

- [ ] **Step 1: Write failing health and redaction tests**

Health response must equal:

```json
{
  "status": "ok",
  "service": "youju-api",
  "version": "0.1.0"
}
```

Redaction test must serialize a request-like object containing:

```typescript
{
  headers: { authorization: 'Bearer sk-test-secret', 'x-api-key': 'sk-test-secret' },
  body: { apiKey: 'sk-test-secret', model: 'test-model' },
}
```

and assert the serialized log contains `[Redacted]` and never contains `sk-test-secret`.

- [ ] **Step 2: Run and confirm failure**

```bash
pnpm exec vitest run apps/api/tests/health.test.ts apps/api/tests/log-redaction.test.ts
```

Expected: FAIL because API package is absent.

- [ ] **Step 3: Implement Fastify app factory**

Create `apps/api/package.json`:

```json
{
  "name": "@youju/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "lint": "eslint src tests",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "build": "tsc -p tsconfig.build.json",
    "start": "node dist/server.js"
  },
  "dependencies": {
    "fastify": "^5.0.0"
  },
  "devDependencies": {
    "tsx": "^4.0.0",
    "vitest": "^4.0.0"
  }
}
```

Create `tsconfig.json` for source and tests with `noEmit: true`, and `tsconfig.build.json` that includes only `src/**/*.ts`, sets `rootDir: src`, `outDir: dist`, and enables emit. Use a Vitest project named `@youju/api`.

`buildApp()` must:

- configure Pino redaction paths for `req.headers.authorization`, `req.headers.x-api-key`, `body.apiKey`, `apiKey`;
- disable request body logging;
- register only `/health` in M1;
- not import filesystem persistence, database clients, queues or object storage;
- expose app injection for tests.

- [ ] **Step 4: Run API tests and build**

```bash
pnpm --filter @youju/api test
pnpm --filter @youju/api typecheck
pnpm --filter @youju/api build
```

Expected: PASS.

- [ ] **Step 5: Commit the API shell**

```bash
git add apps/api package.json pnpm-lock.yaml
git commit -m "feat: add stateless API shell"
```

---

### Task 8: Add Cross-Package Integration and Browser Smoke Tests

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/home-and-diagnostics.spec.ts`
- Create: `tests/integration/golden-case-contracts.test.ts`
- Modify: root `package.json`

**Interfaces:**
- Consumes: Web dev server, fixture loader, domain/rule/AI schemas.
- Produces: browser smoke coverage and a single integration test proving case1 conforms across packages.

- [ ] **Step 1: Write failing integration test**

The integration test must load case1, validate every domain record, run the rule engine, and compare the result to `expected/findings.json` exactly. It must also validate the artificial AI expected output against `ExtractFactsResultSchema`.

- [ ] **Step 2: Write failing Playwright test**

Test projects:

- `chromium-desktop`;
- `chromium-mobile` using a Pixel-class viewport;
- `webkit-mobile` using an iPhone-class viewport.

Assertions:

- Home heading and product boundary visible;
- no login or phone field;
- diagnostics route visible in dev server;
- diagnostics counts equal fixture values;
- viewport has no horizontal overflow.

- [ ] **Step 3: Run and confirm failures before config**

```bash
pnpm exec vitest run tests/integration/golden-case-contracts.test.ts
pnpm exec playwright test tests/e2e/home-and-diagnostics.spec.ts
```

Expected: FAIL because root integration project and Playwright config are absent.

- [ ] **Step 4: Implement test configuration and minimal fixes**

`playwright.config.ts` must start only `@youju/web` for M1. Do not start API unless a browser test needs it. Use deterministic port `4173`, retain trace on first retry, and disable screenshots on success.

Add a second inline project named `root-integration` with `include: ['tests/integration/**/*.test.ts']` to `vitest.config.ts`.

- [ ] **Step 5: Run integration and E2E tests**

```bash
pnpm exec vitest run tests/integration/golden-case-contracts.test.ts
pnpm e2e
```

Expected: PASS in all configured projects.

- [ ] **Step 6: Commit integration coverage**

```bash
git add playwright.config.ts vitest.config.ts tests package.json pnpm-lock.yaml
git commit -m "test: add foundation integration coverage"
```

---

### Task 9: Add CI and Supply-Chain Guardrails

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `scripts/check-forbidden-content.ts`
- Test: `tests/config/forbidden-content.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: all root quality commands.
- Produces: CI job and `pnpm check:forbidden-content` guard.

- [ ] **Step 1: Write a failing forbidden-content test**

The test constructs a temporary secret with `'sk-' + 'a'.repeat(32)` at runtime and asserts the scanner reports it, while a normal synthetic fixture passes. Do not commit a literal long secret-like token. Scanner patterns must include:

- OpenAI-style `sk-` secrets with sufficient length;
- `.env` files except `.env.example`;
- text markers `REAL_USER_DATA` and `真实用户材料`;
- real-looking mainland mobile numbers in fixture directories, allowing only documented fake ranges in tests.

- [ ] **Step 2: Run and confirm failure**

```bash
pnpm exec vitest run tests/config/forbidden-content.test.ts
```

Expected: FAIL because scanner is absent.

- [ ] **Step 3: Implement scanner and root command**

Add:

```json
"check:forbidden-content": "tsx scripts/check-forbidden-content.ts"
```

The scanner must skip `.git`, `node_modules`, `dist`, reports and lockfile; print file path and rule ID but never echo the matched secret value.

- [ ] **Step 4: Create GitHub Actions workflow**

Workflow triggers on pull requests and pushes to `main`. Steps:

1. checkout;
2. setup Node 24 with pnpm cache;
3. install pnpm matching `packageManager`;
4. `pnpm install --frozen-lockfile`;
5. install Playwright Chromium and WebKit dependencies;
6. `pnpm check:forbidden-content`;
7. `pnpm lint`;
8. `pnpm typecheck`;
9. `pnpm test`;
10. `pnpm validate:fixtures`;
11. `pnpm build`;
12. `pnpm e2e`;
13. upload Playwright report only on failure.

Do not add deployment, secrets or real model calls.

- [ ] **Step 5: Run the complete local CI sequence**

```bash
pnpm check:forbidden-content
pnpm lint
pnpm typecheck
pnpm test
pnpm validate:fixtures
pnpm build
pnpm e2e
```

Expected: all PASS.

- [ ] **Step 6: Commit CI guardrails**

```bash
git add .github/workflows/ci.yml scripts/check-forbidden-content.ts tests/config/forbidden-content.test.ts package.json pnpm-lock.yaml
git commit -m "chore: add CI and repository safety checks"
```

---

### Task 10: Document M1 Operation and Verify the Milestone

**Files:**
- Create: `README.md`
- Create: `CONTRIBUTING.md`
- Create: `SECURITY.md`
- Create: `docs/development/local-development.md`
- Create: `docs/security/m1-threat-checklist.md`
- Modify: `docs/superpowers/plans/2026-07-29-youju-m1-foundation-plan.md` checkboxes only after evidence exists

**Interfaces:**
- Consumes: completed M1 implementation.
- Produces: reproducible setup, security reporting path and final verification evidence.

- [ ] **Step 1: Write operational documentation**

README must state:

- what YouJu does and does not do;
- V0.1 scenario;
- local-first and optional-AI principles;
- Node/pnpm requirements;
- install, dev and verify commands;
- synthetic fixture policy;
- links to design and implementation plans.

`SECURITY.md` must explicitly request private reporting for API Key leakage, XSS, file parsing and evidence mix-up issues; it must not promise a response time you cannot guarantee.

- [ ] **Step 2: Run a placeholder and contradiction scan**

Run:

```bash
rg -n "TBD|TODO|FIXME|implement later|真实用户材料|sk-[A-Za-z0-9_-]{20,}" . \
  --glob '!node_modules/**' --glob '!.git/**' --glob '!pnpm-lock.yaml' \
  --glob '!docs/superpowers/plans/**'
```

Expected: no unresolved placeholder in product, configuration or operational documentation and no secret-like value. Implementation plans are reviewed separately during plan self-review because the command itself contains the scanner terms. Test fixtures explicitly testing scanner patterns must be excluded by exact path or use constructed strings rather than literal secrets.

- [ ] **Step 3: Run full milestone verification**

```bash
pnpm verify
git diff --check
git status --short
```

Expected:

- `pnpm verify`: PASS;
- `git diff --check`: no output;
- `git status --short`: only intended documentation/checklist modifications before commit.

- [ ] **Step 4: Review against the approved spec**

Record evidence for M1 sections:

- repository structure;
- domain model names and statuses;
- rule version metadata;
- AI source linkage and strict schema;
- fictional golden case;
- no database or persistence in API;
- mobile Web smoke;
- log redaction;
- CI.

Any uncovered M1 requirement must be fixed before commit; do not defer with a placeholder.

- [ ] **Step 5: Commit documentation and milestone closure**

```bash
git add README.md CONTRIBUTING.md SECURITY.md docs AGENTS.md
git commit -m "docs: complete M1 foundation guidance"
```

- [ ] **Step 6: Create the M1 verification tag only after a clean full run**

```bash
git status --short
pnpm verify
git tag -a v0.1.0-m1 -m "YouJu V0.1 M1 foundation"
```

Expected: clean status, all verification commands PASS, annotated tag created locally. Do not push or open a PR unless the user explicitly asks.

---

## M1 Self-Review Checklist

Before claiming completion, verify:

- [ ] Every public schema is exported through a package public entry.
- [ ] No package imports another package through `../` source traversal.
- [ ] No user data persistence exists in API.
- [ ] No API Key input or storage UI exists in M1.
- [ ] No real brand, person, phone, address, order or payment record is included.
- [ ] Production Web build excludes development diagnostics.
- [ ] AI contracts reject source-free facts and unknown legal fields.
- [ ] Rule evaluation is deterministic and exact-output tested.
- [ ] `pnpm verify` passes from a clean checkout.
- [ ] Git history contains one focused commit per task.
