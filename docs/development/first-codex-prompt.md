# 首个可执行 Codex 开发提示词

将以下内容作为新 Codex 会话的第一条任务提示词。它只执行 M1 的 Task 1，不允许自动继续后续任务。

```text
你正在实现开源项目“有据（YouJu）”。

工作目录：当前 Git 仓库根目录。

开始前必须依次阅读：
1. AGENTS.md
2. docs/superpowers/specs/2026-07-29-youju-v0.1-design.md
3. docs/superpowers/plans/2026-07-29-youju-v0.1-master-plan.md
4. docs/superpowers/plans/2026-07-29-youju-m1-foundation-plan.md

本次只执行：
“有据 M1 Foundation Implementation Plan”的 Task 1：Initialize the pnpm TypeScript Workspace。

禁止执行 Task 2 及之后任务，禁止提前创建 apps、packages、规则、黄金案例、Web或API业务代码。

执行要求：
- 若环境支持 superpowers skills，先使用 using-git-worktrees 创建隔离工作区，再按 test-driven-development 执行 Task 1；若不支持，仍须在独立 feature branch 中工作。
- 严格按计划先写失败测试、实际运行并确认失败，再创建最小配置使其通过。
- Node.js 使用24 LTS；pnpm使用10.34.5，并在 packageManager 中固定该版本。
- 不添加计划之外的工具，不引入Nx、Turborepo、Lerna、数据库、容器编排或CI。
- 不修改已批准的设计规格。
- 不写占位业务代码，不创建空包。
- 不提交任何API Key、.env、真实用户材料或真实订单信息。
- 仅在所有Task 1验证命令实际通过后提交。

完成前必须运行并报告真实结果：
1. pnpm exec vitest run tests/config/root-config.test.ts
2. pnpm exec prettier --check .
3. pnpm exec eslint tests/config/root-config.test.ts
4. git diff --check
5. git status --short

提交信息必须为：
chore: initialize TypeScript workspace

最终回复格式：
1. 完成内容
2. 修改文件
3. 测试与命令结果
4. 当前分支与提交号
5. 风险或偏差；没有则写“无”
6. 明确说明未执行Task 2

遇到计划命令与当前工具版本不兼容时：
- 先查阅对应工具的官方文档；
- 采用最小兼容调整；
- 不改变任务目标和目录边界；
- 在最终回复中列出调整原因和具体差异。
```

## 使用建议

首轮完成后，先检查：

- 是否真的先看到了失败测试；
- 是否只完成 Task 1；
- 是否写入精确 pnpm 版本；
- 是否没有提前生成业务目录；
- 是否给出了实际命令输出和提交号。

确认无误后，再单独发送：

```text
继续执行 M1计划 Task 2。仍然只做一个Task，严格遵循AGENTS.md、TDD、验证和独立提交要求。
```
