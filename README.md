# 有据 YouJu

有据是一款面向中国普通用户的事实与材料整理工具。V0.1 只面向“网购商品出现质量、破损、描述不符等问题，商家拒绝退款或未妥善处理”这一场景。

项目帮助用户保存原始材料、整理已确认事实、建立时间线、识别材料缺口，并为后续生成可打印、可长期保存的材料包建立基础。项目不提供法律咨询、法律结论、赔偿计算、胜诉率或投诉成功率预测，也不自动投诉、自动维权、曝光或评价商家。

## 当前状态

当前仓库完成 M1 Foundation 与 M2 无 AI 核心闭环：

- M1：运行时领域契约、确定性规则基础、AI 结构化输出契约、完全虚构的黄金案例、Web/PWA 与无状态 API 外壳、跨包测试和 CI。
- M2：无需注册、无需 AI，即可在浏览器本地创建事件、导入并分类材料（JPG/PNG/WebP/PDF，SHA-256 核验）、确认事实、建立时间线、查看规则缺口、生成并确认事实陈述、导出标准材料包（三份 PDF + CSV + HTML + 原始材料 ZIP）、删除事件并核验无残留。

M2 仍不包含真实 AI 调用、云端同步、账号体系、加密备份或法律结论。这些能力只能在后续里程碑通过设计和任务审查后实现。

浏览器支持：桌面与移动 Chromium、移动 WebKit 完成自动化覆盖；不支持 OPFS 的浏览器（如当前 Playwright WebKit 构建）会明确降级为结构化编辑可用、材料导入与附件导出不可用。

## 核心原则

- 本地优先：原始材料默认保存在用户设备，不默认上传业务服务器。
- AI 可选：未配置 AI 时，核心流程仍需完整可用。
- 用户确认：AI 只能产生候选内容，未经用户确认不得进入正式输出。
- 无状态服务端：API 不保存用户事件、材料、事实、时间线或 API Key。
- 确定性优先：规则、状态、完整性检查和正式输出过滤由可测试代码完成。

## M2 使用流程

1. 首页点击「创建本地事件」，填写六项基础信息；
2. 在「材料」导入原始文件并手工分类；
3. 在「事实」逐项录入并确认正式事实；
4. 在「时间线」添加并确认事件条目；
5. 在「缺口检查」查看确定性规则结果；
6. 在「陈述」生成、编辑并确认事实陈述；
7. 在「导出」通过预检后生成材料包；
8. 在「删除事件」按标题确认后永久删除本地数据。

所有数据只保存在当前浏览器（IndexedDB + OPFS）。导出包未加密，可能包含敏感信息，请妥善保存。

## 环境要求

- Node.js 24 LTS
- pnpm 10.34.0

根 `package.json` 的 `packageManager` 固定 pnpm 版本，`.nvmrc` 固定 Node 主版本。

## 本地开始

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium webkit
pnpm dev
```

开发服务器默认提供：

- Web：Vite 默认地址；
- API：`http://localhost:3000`，健康检查为 `GET /health`；
- 开发态诊断页：`/dev/diagnostics`，生产构建不包含该路由。

完整质量门禁：

```bash
pnpm check:forbidden-content
pnpm verify
```

详细环境、单项命令和故障排查见[本地开发指南](docs/development/local-development.md)。

## 黄金案例政策

`fixtures/` 只能包含完全虚构的合成材料，不得包含真实姓名、手机号、地址、平台或店铺身份、订单、支付记录、聊天记录和 API Key。案例 001 的 `binary/` 目录包含四份由 `scripts/generate-m2-binary-fixtures.ts` 确定性生成的虚构 PNG/PDF 材料，尺寸与 SHA-256 记录在 `manifest.json`。

新增或修改案例后必须运行：

```bash
pnpm validate:fixtures
pnpm check:forbidden-content
```

## 参与与安全

- 贡献流程：[CONTRIBUTING.md](CONTRIBUTING.md)
- 安全报告：[SECURITY.md](SECURITY.md)
- 已批准设计：[有据 V0.1 产品与技术设计规格](docs/superpowers/specs/2026-07-29-youju-v0.1-design.md)
- 总实施计划：[V0.1 Master Implementation Plan](docs/superpowers/plans/2026-07-29-youju-v0.1-master-plan.md)
- M1 实施计划：[M1 Foundation Implementation Plan](docs/superpowers/plans/2026-07-29-youju-m1-foundation-plan.md)
- M2 设计规格：[M2 无 AI 核心闭环设计](docs/superpowers/specs/2026-07-30-youju-m2-no-ai-core-design.md)
- M2 实施计划：[M2 No-AI Core Implementation Plan](docs/superpowers/plans/2026-07-31-youju-m2-no-ai-core-plan.md)

## M3 BYOK AI 当前状态

M3 已完成实现与自动化验收。它是可选的辅助能力：原始材料、正式事实、时间线、陈述和导出仍由本地 M2 流程负责；未配置 AI 或主动关闭 AI 时，手工流程不受影响。

M3 的 Fastify 服务端只做一次请求范围内的临时转发，不保存事件、原始材料、分析内容或 API Key。浏览器把 API Key 保留在当前页面会话内存中，并只在请求体中发送。AI 只能写入带来源的候选内容，用户确认后才可能进入正式记录；候选内容不会直接进入导出包。

M3 提供四个预设 Provider（OpenAI、阿里云百炼、DeepSeek、SiliconFlow）以及一个严格受限的自定义 HTTPS Base URL。预设仅代表仓库中的协议和目标配置，不代表 Provider 在某个网络、账户、模型或时间点一定可用。自定义目标必须通过 HTTPS、公网 DNS、TLS 主机名和重定向检查，且不能带凭据、查询参数或已拼接的具体接口路径。

本地运行、测试边界、输入上限和安全复核见[本地开发指南](docs/development/local-development.md)与[M3 威胁检查清单](docs/security/m3-threat-checklist.md)。自动化测试全部使用固定 Mock 或虚构黄金案例，不使用生产 API Key，也不会调用真实付费模型。真实 Provider、真实设备和国内浏览器的兼容性检查属于 M4 发布工作。

M3 相关设计和实施记录：

- [M3 BYOK AI 设计规格](docs/superpowers/specs/2026-08-12-youju-m3-byok-ai-design.md)
- [M3 BYOK AI 详细实施计划](docs/superpowers/plans/2026-08-12-youju-m3-byok-ai-plan.md)
