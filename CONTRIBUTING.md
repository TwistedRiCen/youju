# 参与有据开发

感谢参与有据。所有变更必须遵守 [AGENTS.md](AGENTS.md)、已批准设计和当前里程碑计划，优先保护用户材料、API Key 和正式事实边界。

## 开发环境

使用 Node.js 24 LTS 和 pnpm 10.34.0：

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium webkit
```

具体命令见[本地开发指南](docs/development/local-development.md)。

## 变更流程

1. 从当前里程碑的功能分支开始，只处理一个已批准 Task。
2. 行为变更先写最小失败测试，确认失败由目标行为缺失导致。
3. 编写最小实现，不提前创建后续模块或占位接口。
4. 运行目标测试、受影响包测试及当前 Task 指定的根级门禁。
5. 使用 Conventional Commits 创建单一职责提交。

不得通过降低 TypeScript 严格度、关闭 ESLint 规则、删除正确测试或放宽 Schema 来规避失败。

## 模块边界

- 包之间只通过 `@youju/*` 的公开入口导入，禁止穿透其他包的 `src`。
- `apps/api` 保持无状态，不引入业务数据库、队列、对象存储或用户系统。
- AI 只能产生候选内容；正式事实与正式输出必须保留用户确认门槛。
- 不在未经设计评审的情况下扩展场景、持久化 API Key 或增加真实 AI 调用。
- 新依赖必须说明用途、许可证、维护状态和不可使用现有能力替代的原因。

## 数据与安全

- 不提交 `.env`、API Key、访问令牌、用户提供的真实材料、真实订单、真实支付或聊天信息。
- fixture 必须完全虚构，并通过 manifest、Schema 和禁止内容扫描。
- 测试中的敏感模式必须在运行时拼接，避免把可识别密钥字面量写入仓库。
- 不记录请求体、文件内容、授权头或模型敏感输入。
- 安全问题不要提交公开 Issue；请按 [SECURITY.md](SECURITY.md) 私密报告。

## 验证

开发循环可运行目标包命令；提交前至少运行当前计划要求的检查。M1 里程碑完整门禁为：

```bash
pnpm check:forbidden-content
pnpm verify
git diff --check
```

CI 会从 lockfile 冻结安装依赖，运行禁止内容扫描、lint、类型检查、测试、fixture 校验、构建和 Playwright E2E。

## 提交信息

使用英文 Conventional Commits，例如：

- `feat:` 新功能；
- `fix:` 缺陷修复；
- `test:` 测试或 fixture；
- `docs:` 文档；
- `chore:` 工程配置；
- `refactor:` 有测试保护且不改变行为的重构。
