# M1 威胁模型与验收检查

- 审查范围：M1 Foundation；
- 审查日期：2026-07-30；
- 依据：已批准 V0.1 设计规格第 11、12、13、15、16 节及 M1 实施计划；
- 数据边界：仅完全虚构黄金案例，不处理真实材料，不调用真实模型。

## 1. 威胁与控制证据

| 风险                        | M1 控制                                                                            | 代码或测试证据                                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| API Key 泄露                | 无 Key 输入或持久化；API 日志配置脱敏；仓库扫描密钥模式                            | `apps/api/src/logging.ts`、`apps/api/tests/log-redaction.test.ts`、`scripts/check-forbidden-content.ts`  |
| 服务端保存用户业务数据      | API 仅注册健康检查，不包含数据库、队列、对象存储或业务 Repository                  | `apps/api/src/app.ts`、`apps/api/src/routes/health.ts`                                                   |
| AI 无来源或越权字段         | AI 对象使用严格 Schema，事实和时间线候选至少包含一个来源，未知法律字段被拒绝       | `packages/ai-core/src/`、`packages/ai-core/tests/contracts.test.ts`                                      |
| 候选事实误作正式事实        | `FactCandidate` 与 `ConfirmedFact` 使用不同 Schema，候选事实保留审核状态与分析版本 | `packages/domain/src/schemas.ts`、`packages/domain/tests/schemas.test.ts`                                |
| 真实材料进入仓库            | fixture manifest 强制 `fictional: true`；禁止内容扫描密钥、标记和 fixture 手机号   | `packages/test-support/src/fixture-schema.ts`、`tests/config/forbidden-content.test.ts`                  |
| 规则产生不确定结论          | 规则文件版本化并带来源元数据；评估器为纯确定性逻辑，仅报告事实或材料缺口           | `rules/consumer/ecommerce-refund.v1.yaml`、`packages/rule-engine/tests/evaluate-rule.test.ts`            |
| 开发诊断信息进入生产        | 诊断路由只在开发模式动态注册，浏览器测试只读取虚构案例低敏汇总                     | `apps/web/src/router.ts`、`apps/web/tests/diagnostics.test.ts`、`tests/e2e/home-and-diagnostics.spec.ts` |
| Service Worker 缓存用户数据 | M1 只预缓存应用壳资源，没有运行时业务数据缓存                                      | `apps/web/vite.config.ts`                                                                                |
| 依赖或 CI 供应链风险        | pnpm 与 lockfile 固定；CI 冻结安装、只读权限并执行全部质量门禁                     | `package.json`、`pnpm-lock.yaml`、`.github/workflows/ci.yml`                                             |
| 移动端外壳回归              | 桌面 Chromium、移动 Chromium 与移动 WebKit smoke 覆盖边界文案、诊断汇总和横向溢出  | `playwright.config.ts`、`tests/e2e/home-and-diagnostics.spec.ts`                                         |

## 2. M1 规格追踪

| 验收项                   | 证据                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 仓库结构与公开包边界     | `pnpm-workspace.yaml`；domain、rule-engine、ai-core、test-support 均通过各自 `src/index.ts` 导出                                                 |
| 领域模型名称与状态       | `CaseEventSchema`、`EvidenceFileSchema`、`FactCandidateSchema`、`ConfirmedFactSchema`、`TimelineEntrySchema`、`AnalysisVersionSchema` 及契约测试 |
| 规则版本元数据           | `consumer.ecommerce.refund.basic@1.0.0` 包含来源说明、范围、稳定性、核验日期和维护者                                                             |
| AI 来源关联与严格 Schema | AI 来源数组最少一项；对象拒绝未知字段；Schema 快照受测试保护                                                                                     |
| 完全虚构黄金案例         | case 001 manifest、四份合成材料、六项确认事实、四个时间线条目和期望规则结果                                                                      |
| 无状态 API 与日志脱敏    | Fastify 只提供 `/health`；敏感日志字段替换为 `[Redacted]`                                                                                        |
| 移动 Web smoke           | Playwright 三个浏览器/视口项目覆盖首页与开发诊断页                                                                                               |
| CI                       | PR 与 `main` push 触发冻结安装、扫描、lint、类型检查、测试、fixture 校验、构建和 E2E                                                             |

## 3. M1 自检结论

- 公共 Schema 通过包公开入口导出；
- 包之间未使用相对路径穿透其他包源码；
- API 不存在用户数据持久化；
- Web 不存在 API Key 输入或存储界面；
- fixture 仅含虚构名称和合成记录；
- 生产 Web 构建不注册开发诊断路由；
- AI 契约拒绝无来源事实和未知法律字段；
- 规则评估结果确定且由精确输出测试保护；
- 每个 M1 实施 Task 均有独立、聚焦的 Git 提交。

## 4. 后续里程碑重新评审点

M1 未实现真实文件解析、IndexedDB、OPFS、PDF/ZIP 导出或 AI 临时转发。M2 和 M3 开始相关实现前，必须针对文件签名、容量限制、XSS、本地删除核验、证据关联、导出完整性、API Key 生命周期、超时与取消重新执行威胁评审。

## 5. 2026-07-30 本地验收记录

- `pnpm check:forbidden-content`：通过，无禁止内容；
- 占位符与敏感模式精确扫描：通过，无匹配；
- `pnpm verify`：通过；
- Vitest：11 个测试文件、49 项测试通过；
- 黄金案例：1 个案例通过，包含 4 份材料、6 项确认事实和 4 个时间线条目；
- 构建：API、Web 和四个公共包通过；
- Playwright：桌面 Chromium、移动 Chromium、移动 WebKit 共 6 项通过；
- `git diff --check`：通过；
- 结构审查：未发现跨包源码穿透、API 持久化导入、Web API Key 界面或生产诊断路由。

GitHub Actions 工作流已定义本地等价门禁，但本次按计划不推送分支，因此没有新增远程 CI 运行记录。
