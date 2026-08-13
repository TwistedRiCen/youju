# 有据 YouJu

有据是一款面向中国普通用户的本地优先事实与材料整理工具。V0.1 只处理以下场景：

> 网购商品出现质量、破损、描述不符等问题，商家拒绝退款或未妥善处理。

用户可以在浏览器中保存原始材料、确认事实、建立时间线、识别材料缺口，并导出可打印、可长期保存的材料包。有据不提供法律咨询或法律结论，不计算赔偿或预测结果，也不自动投诉、维权、曝光或评价商家。

## 当前状态

M1、M2 和 M3 已完成实现与自动化验收：

- **M1 工程底座**：pnpm workspace、严格 TypeScript、运行时领域契约、确定性规则、AI 结构化输出契约、虚构黄金案例、Vue PWA、无状态 Fastify API、跨包测试和 CI。
- **M2 无 AI 核心闭环**：无需注册或配置 AI，即可在浏览器本地创建事件，导入、校验和分类材料，确认事实与时间线，查看规则缺口，编辑并确认陈述，导出材料包，以及核验式删除事件。
- **M3 BYOK AI 副驾驶**：可选的材料分类、事实提取、时间线候选和陈述草稿；支持用户审核、编辑和确认候选，并通过无状态 Fastify 临时转发连接用户选择的 Provider。

M4「公开演示与部署」的设计和详细计划已经确认，但实现尚未开始。当前仓库仍是本地开发版本，没有可以承诺稳定性或国内网络可达性的公开部署地址。M5 真实使用验证也尚未开始。

自动化测试覆盖桌面 Chromium、移动 Chromium 和移动 WebKit。真实手机、国内厂商浏览器、真实 Provider、生产 HTTPS 代理和公网可达性尚未验证，将在 M4 中处理。自动化测试只使用 Mock Provider 和完全虚构的数据，不调用真实付费模型。

## 已实现能力

### 无 AI 核心流程

1. 创建本地事件并填写基础信息；
2. 导入 JPG、PNG、WebP、PDF 或纯文本材料；
3. 交叉检查文件扩展名、MIME 和文件签名，并计算 SHA-256；
4. 手工分类材料，录入并确认正式事实；
5. 添加、排序和确认时间线，检测冲突；
6. 运行确定性规则并查看材料或事实缺口；
7. 生成、编辑并确认事实陈述；
8. 通过导出预检后生成三份 PDF、摘要 CSV、离线 HTML 索引和原始附件 ZIP；
9. 删除事件，并核验 IndexedDB 与 OPFS 中没有事件残留。

所有业务数据默认保存在当前浏览器的 IndexedDB 和 OPFS。导出包未加密，可能包含敏感信息，应由用户自行妥善保存。不支持 OPFS 的浏览器会降级为结构化编辑可用，但材料导入和附件导出不可用。

### 可选 BYOK AI

M3 提供四个预设 Provider：OpenAI、阿里云百炼、DeepSeek、SiliconFlow，并支持严格受限的自定义 HTTPS Base URL。预设表示仓库已经实现对应协议和目标配置，不代表相关 Provider、账户、模型或网络在当前时间一定可用。

AI 使用边界：

- 浏览器只请求同源 `/ai` 路径，由 Fastify 在一次请求范围内临时转发；
- API Key 只存在于当前页面会话内存，刷新页面或关闭 AI 后需要重新填写；
- 不上传原始文件字节，图片和 PDF 只发送用户确认范围内的浏览器内存派生图；
- 发送前展示 Provider、模型、文字字段、材料页、图片尺寸和估算范围；
- 模型输出必须通过运行时 Schema、来源和区域校验；
- AI 只产生带分析版本和来源的候选，用户确认前不得修改正式数据；
- 未确认、被拒绝、冲突或无来源的候选不会进入正式导出；
- AI 失败、取消、关闭或能力不足时，无 AI 手工流程继续可用。

自定义目标继续受到 HTTPS、DNS、公网地址、TLS 主机名、固定连接地址、禁止重定向和禁止代理等限制。Provider 对已授权内容的保留、训练、跨境处理和费用由 Provider 的当前条款决定，使用前需要用户自行确认。

## 产品与安全原则

- **本地优先**：原始材料和业务记录默认留在用户设备，不默认上传业务服务器。
- **AI 可选**：未配置 AI、模型不可用或用户关闭 AI 时，核心流程仍然完整可用。
- **用户确认**：只有用户确认操作可以产生正式事实；AI 不得自动覆盖正式数据。
- **来源可追溯**：AI 候选关联来源材料、页码或区域以及独立分析版本。
- **无状态服务端**：API 不保存事件、原始材料、事实、时间线、候选、模型响应或 API Key。
- **确定性优先**：摘要、状态、规则、冲突、导出过滤、Schema 校验和删除核验由可测试代码完成。
- **最小发送**：材料视为不可信输入，AI 没有工具调用或外部访问能力，只接收用户确认的受限派生内容。

项目没有账号体系、云端同步、服务端业务数据库、消息队列、云对象存储、共享 AI Key、加密备份、自动投诉、埋点、广告、用户画像、会话回放或远程错误追踪。

## 环境要求

- Node.js 24 LTS（`v24.x`）
- pnpm 10.34.0
- Git
- Chromium 和 WebKit（运行完整 Playwright E2E 时需要）

根 `package.json` 通过 `engines` 和 `packageManager` 固定版本，`.nvmrc` 固定 Node 主版本。不要升级到 pnpm 11，也不要把 API Key 写入 `.env` 或提交到仓库。

## 本地运行

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium webkit
pnpm dev
```

`pnpm dev` 会并行启动：

- Vue/Vite Web，地址以终端输出为准；
- Fastify API：`http://127.0.0.1:3000`；
- 健康检查：`GET http://127.0.0.1:3000/health`；
- 开发诊断页：`/dev/diagnostics`，生产构建不注册该路由。

开发模式下，Vite 把 Web 的同源 `/ai` 请求转发到本地 Fastify。进入事件工作区后，可以从「AI 设置」配置 Provider、模型与页面会话 API Key，先运行连接测试，再到「AI 助手」选择任务和发送范围，最后在「审核 AI 候选」中逐项处理结果。

详细环境、AI 限制、单项命令和故障排查见[本地开发指南](docs/development/local-development.md)。

## 验证

完整质量门禁：

```bash
pnpm check:forbidden-content
pnpm test:ai-contract
pnpm eval:golden-case
pnpm verify
```

`pnpm verify` 依次运行 lint、类型检查、Vitest、fixture 校验、构建和桌面/移动浏览器 E2E。常用单项命令：

| 命令                     | 用途                                          |
| ------------------------ | --------------------------------------------- |
| `pnpm lint`              | ESLint                                        |
| `pnpm typecheck`         | 根项目和 workspace 类型检查                   |
| `pnpm test`              | 全部 Vitest 测试                              |
| `pnpm validate:fixtures` | 校验虚构黄金案例、二进制摘要和规则结果        |
| `pnpm test:ai-contract`  | AI 契约测试                                   |
| `pnpm eval:golden-case`  | 固定 Mock AI 黄金案例评测                     |
| `pnpm build`             | 构建或检查所有 workspace                      |
| `pnpm e2e`               | 桌面 Chromium、移动 Chromium、移动 WebKit E2E |

## 仓库结构

```text
apps/
  web/                 Vue 3 Web/PWA、本地存储与用户流程
  api/                 Fastify 健康检查和无状态 AI 临时转发
packages/
  domain/              领域 Schema、正式数据和状态契约
  rule-engine/         版本化规则加载、校验和确定性评估
  ai-core/             Provider、任务、输入、候选和审核契约
  evidence-hash/       增量 SHA-256
  evidence-store/      OPFS 材料与临时文件存储
  timeline/            排序与冲突检测
  document-export/     PDF、CSV、HTML 和 ZIP 导出
  test-support/        虚构案例加载和测试辅助
fixtures/              完全虚构的黄金案例与固定 AI 结果
rules/                 版本化确定性规则
tests/                 跨包集成和 Playwright E2E
docs/                  设计、计划、开发、安全与决策记录
```

## 黄金案例政策

`fixtures/` 只能包含完全虚构的合成材料，不得包含真实姓名、手机号、地址、平台或店铺身份、订单、支付记录、聊天记录和 API Key。案例 001 的 `binary/` 目录包含四份由 `scripts/generate-m2-binary-fixtures.ts` 确定性生成的虚构 PNG/PDF 材料，尺寸和 SHA-256 记录在 `manifest.json`。

新增或修改案例后必须运行：

```bash
pnpm validate:fixtures
pnpm check:forbidden-content
```

## 设计与实施记录

- [V0.1 产品与技术设计规格](docs/superpowers/specs/2026-07-29-youju-v0.1-design.md)
- [V0.1 Master Implementation Plan](docs/superpowers/plans/2026-07-29-youju-v0.1-master-plan.md)
- [M1 Foundation Implementation Plan](docs/superpowers/plans/2026-07-29-youju-m1-foundation-plan.md)
- [M2 无 AI 核心闭环设计](docs/superpowers/specs/2026-07-30-youju-m2-no-ai-core-design.md)
- [M2 No-AI Core Implementation Plan](docs/superpowers/plans/2026-07-31-youju-m2-no-ai-core-plan.md)
- [M2 威胁检查清单](docs/security/m2-threat-checklist.md)
- [M3 BYOK AI 设计规格](docs/superpowers/specs/2026-08-12-youju-m3-byok-ai-design.md)
- [M3 BYOK AI Implementation Plan](docs/superpowers/plans/2026-08-12-youju-m3-byok-ai-plan.md)
- [M3 威胁检查清单](docs/security/m3-threat-checklist.md)
- [M4 公开演示与部署设计规格](docs/superpowers/specs/2026-08-13-youju-m4-public-demo-deployment-design.md)
- [M4 Public Demo and Deployment Implementation Plan](docs/superpowers/plans/2026-08-13-youju-m4-public-demo-deployment-plan.md)
- [里程碑与测试顺序](docs/development/roadmap-and-test-order.md)

## 参与与安全

- 贡献流程：[CONTRIBUTING.md](CONTRIBUTING.md)
- 安全报告：[SECURITY.md](SECURITY.md)

提交代码或材料前请先确认不包含真实用户数据、API Key、访问令牌、环境文件或生产 Provider 响应。
