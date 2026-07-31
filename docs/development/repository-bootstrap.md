# 有据仓库初始化方案

## 1. 初始化目标

仓库初始化阶段只建立可验证的工程底座，不实现完整业务流程。完成后应具备：

- pnpm TypeScript monorepo；
- Vue 3 Web/PWA 外壳；
- Fastify 无状态 API 外壳；
- 领域、规则和 AI 契约包；
- 第一个完全虚构黄金案例；
- lint、typecheck、unit、fixture validation、build、E2E 六类质量门禁；
- GitHub Actions 基础 CI；
- 明确的安全、隐私和贡献约束。

## 2. 技术选择

### 2.1 运行时与构建

- Node.js 24 LTS；
- pnpm 10.34.5；
- TypeScript strict；
- ESM；
- pnpm workspace，不引入 Nx、Turborepo 或 Lerna。

选择 pnpm 原生 workspace 是为了减少工具层、配置量和维护成本。V0.1 的包数量和构建规模不需要额外任务编排平台。

### 2.2 Web

- Vue 3；
- Vite 8；
- Vue Router；
- Pinia仅在出现跨页面业务状态时再引入，M1不引入；
- PWA 插件；
- Vitest；
- Playwright。

### 2.3 API

- Fastify 5；
- JSON Schema 路由校验；
- Pino结构化日志；
- 默认日志脱敏；
- 不接数据库、不接队列、不建用户系统。

### 2.4 运行时契约

领域和 AI 数据需要静态类型与运行时 Schema 同源。M1采用与TypeScript 5.x兼容的 `@sinclair/typebox` 0.x LTS：

- 直接表达 JSON Schema；
- 从 Schema 推导 TypeScript 类型；
- 同一契约可被 Web、API、规则验证和 AI 输出校验复用。

## 3. 初始目录

```text
youju/
├── .github/
│   └── workflows/
│       └── ci.yml
├── apps/
│   ├── web/
│   │   ├── src/
│   │   ├── tests/
│   │   ├── index.html
│   │   ├── package.json
│   │   └── vite.config.ts
│   └── api/
│       ├── src/
│       ├── tests/
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   ├── domain/
│   ├── rule-engine/
│   ├── ai-core/
│   └── test-support/
├── rules/
│   └── consumer/
│       └── ecommerce-refund.v1.yaml
├── fixtures/
│   └── ecommerce-refund/
│       └── case-001-transport-damage/
├── scripts/
│   └── validate-fixtures.ts
├── tests/
│   └── e2e/
├── docs/
├── AGENTS.md
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── tsconfig.base.json
├── tsconfig.json
├── eslint.config.js
├── prettier.config.mjs
├── playwright.config.ts
└── vitest.config.ts
```

只创建 M1 实际需要的包。`evidence-store`、`evidence-hash`、`timeline`、`document-export` 和 AI Provider 在对应里程碑创建，避免空包和占位实现。

## 4. 根级脚本约定

根 `package.json` 最终提供：

```json
{
  "scripts": {
    "dev": "pnpm --parallel --filter @youju/web --filter @youju/api dev",
    "lint": "eslint .",
    "typecheck": "tsc -p tsconfig.json --noEmit && pnpm -r --if-present typecheck",
    "test": "vitest run",
    "validate:fixtures": "tsx scripts/validate-fixtures.ts",
    "build": "pnpm -r --if-present build",
    "e2e": "playwright test",
    "verify": "pnpm lint && pnpm typecheck && pnpm test && pnpm validate:fixtures && pnpm build && pnpm e2e"
  }
}
```

## 5. Git策略

- 将默认分支统一为 `main`；
- 实施计划使用独立 feature branch 或 git worktree；
- 每个任务一个可审查提交；
- 不在同一提交中混合工程初始化、领域模型和 UI 功能；
- M1完成后打 `v0.1.0-m1` 预发布标签，标签前必须运行 `pnpm verify`。

推荐分支：

```text
main
└── feat/m1-foundation
```

## 6. 依赖安全

- 只使用 lockfile 安装：CI执行 `pnpm install --frozen-lockfile`；
- 配置依赖最小发布时间，降低刚发布恶意包风险；
- 禁止不必要的 install scripts；
- 每次新增依赖在 PR/提交说明中记录用途和许可证；
- 不加载远程前端脚本；
- 不使用真实 API Key 运行测试。

## 7. M1完成定义

M1只有在以下条件全部满足时完成：

- Web和API可分别启动；
- `/health` 返回固定、无敏感信息的结构；
- 领域、规则和AI Schema均有运行时校验测试；
- 案例1可被 `pnpm validate:fixtures` 验证；
- Web首页显示项目边界，并能进入开发态黄金案例诊断页；
- E2E能在移动端视口验证首页和诊断页；
- CI从全新检出状态通过；
- 仓库内不存在真实材料、密钥或未决占位符。
