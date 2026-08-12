# 有据 M3 BYOK AI 设计规格

- 日期：2026-08-12
- 状态：待用户书面评审
- 适用范围：V0.1 网购商品问题且商家拒绝退款或未妥善处理
- 上游规格：`2026-07-29-youju-v0.1-design.md`
- 前置里程碑：M2 No-AI Core 已完成并合入 `main`

## 1. 问题、目标与范围

### 1.1 问题

M2 已允许用户在不注册、不配置 AI 的情况下完成材料导入、事实确认、时间线、规则检查、陈述、导出和删除。M3 要解决的不是“替代用户判断”，而是减少图片和 PDF 材料中的重复录入工作，同时保持来源可追溯、正式数据由用户确认、本地优先和无 AI 路径完整可用。

BYOK 会新增四类高风险边界：用户 API Key、材料发送授权、可配置上游地址和不可信模型输出。本规格优先定义这些信任边界，再定义功能。

### 1.2 目标

- 支持 OpenAI Responses API 和通用 OpenAI-compatible Chat Completions。
- 通过 Fastify 无状态临时转发使用用户自备 API Key。
- 支持 OpenAI、阿里云百炼、DeepSeek、SiliconFlow 预设以及严格受限的自定义 HTTPS Base URL。
- 在浏览器本地生成受限图片副本和 PDF 页面图，发送前允许用户预览和缩小范围。
- 生成材料分类、事实、时间线和陈述候选，全部经过 Schema、来源和冲突校验。
- 保留逐项用户审核门槛，并对安全子集提供批量确认。
- 提供单项任务和顺序一键分析；失败、取消或停用 AI 后继续 M2 手工流程。
- 使用 Mock Provider 和虚构黄金案例建立可重复 AI 评测，不在 CI 调用真实付费模型。

### 1.3 非目标

- 不持久化 API Key，不提供“永久信任 Provider”。
- 不允许浏览器直连模型服务。
- 不提供服务端数据库、对象存储、队列、后台分析或请求重放。
- 不上传原始文件字节，不把整个事件数据库发送给模型。
- 不支持自动确认、自动覆盖正式事实、自动投诉、法律结论、赔偿计算或成功率预测。
- 不保证任意 OpenAI-compatible Provider 的私有扩展、完整功能或模型效果。
- 不实现预算账户、账单同步、模型路由、失败后自动换模型或跨设备 AI 设置同步。
- 不扩展到劳动、租房、校园、医疗、债务等场景。

## 2. 设计依据

### 2.1 已确认事实

- M2 的事件、材料、事实、时间线和导出数据只保存在 IndexedDB 与 OPFS。
- M2 的正式输出只读取已确认事实、已确认时间线、当前已确认陈述和确定性规则结果。
- `packages/domain` 已定义 `FactCandidate`、`ConfirmedFact`、`AnalysisVersion` 和审核状态基础模型。
- `packages/ai-core` 已定义材料分类、事实提取、时间线、缺失建议、陈述和来源区域的运行时 Schema。
- `apps/api` 当前为无状态 Fastify 服务，并已有 API Key 日志脱敏基线。
- M2 删除流程会核验 IndexedDB、OPFS 和临时数据无残留。
- M2 的真实设备性能和国产浏览器检查仍属于 M4 发布前人工验证；用户已明确批准在这些发布检查前进入 M3 设计，不把它们解释为 M3 设计阻塞项。
- 用户已确认本规格第 2.2 节的产品与架构决策。

### 2.2 已确认设计决策

1. AI 请求只经 Fastify 临时转发，不支持浏览器直连。
2. 采用 Provider 预设和严格受限的自定义 HTTPS Base URL。
3. OpenAI 预设使用 Responses API；通用 Provider 使用 Chat Completions。
4. 只发送受限图片副本和浏览器本地渲染的 PDF 页面图，不发送原始文件字节。
5. 持久化分析版本、结构化候选、来源和审核状态；不持久化密钥、完整请求、原始响应、展开提示词或派生图。
6. 默认每次任务严格确认，可选择当前页面会话内的便捷模式。
7. Provider 可以部分可用，按实测能力开放任务。
8. 逐项审核为基础；只有高置信、来源完整、无冲突候选可批量确认。
9. 提供单项任务和顺序一键分析，不提供后台队列。
10. 可靠时显示费用估算，否则只显示载荷与 Token 估算，并设置材料、页数和载荷上限。
11. 首发预设为 OpenAI、阿里云百炼、DeepSeek、SiliconFlow，加自定义 Provider。

### 2.3 设计假设

- M3 继续使用当前单用户、本地事件模型，不增加账号系统。
- 连接测试可使用固定虚构探测内容，不需要真实事件数据。
- 视觉分析统一以图片输入表达；Provider 原生 PDF 输入不进入 M3。
- 实施计划可以在不改变本规格边界的前提下确定超时、图片尺寸、压缩质量、限流阈值和具体 PDF 渲染依赖。
- Provider 的模型与能力会变化，预设只声明协议、官方目标和安全上限，运行能力以当前连接测试为准。

### 2.4 待决策项（实施计划必须确定）

以下是局部工程参数，不改变核心架构，但必须在对应 Task 开始前固化为测试条件：

- 连接测试和正式任务的默认超时；
- 派生图片最长边、像素上限、格式和压缩质量；
- 单图大小、输出大小、IP 速率和全局并发阈值；
- Token 估算算法与价格元数据更新方式；
- PDF 本地渲染库及其版本、许可证和隔离方式；
- Provider 模型列表查询是否在首个切片实现，或首版只允许手填模型。

这些参数不得被用来重新打开已确认的传输、留存、授权或审核决策。

## 3. 推荐架构

```text
OPFS 原始材料
    |
    v
浏览器派生处理 ----> 发送清单与预览 ----> 会话授权
    |                                      |
    |                                      v
    |                            Fastify AI 临时转发
    |                              /              \
    |                   OpenAI Responses    Chat Completions
    |                                      /   /   /   \
    |                                  百炼 DeepSeek SiliconFlow 自定义
    |                                      \   |   |   /
    |                                       标准化结果
    |                                           |
    v                                           v
本地来源映射 <------ Schema/来源/冲突校验 <------ 浏览器接收
    |
    v
AnalysisVersion + 候选记录
    |
    v 用户审核
M2 正式分类、事实、时间线、陈述
```

### 3.1 浏览器职责

- 在内存中保存 `ProviderSessionConfig` 和 API Key。
- 读取用户选中的 OPFS 原件，生成派生图片和 PDF 页面图。
- 构造确定性的 `InputManifest`，展示发送预览并获取授权。
- 管理任务取消、批次顺序和同事件单任务互斥。
- 接收 API 标准化结果，执行本地 Schema、来源范围、去重和冲突校验。
- 持久化分析版本与候选，提供审核和删除。
- 确认候选时调用 M2 正式模型接口，不绕过 M2 版本和导出门槛。

### 3.2 `packages/ai-core` 职责

- Provider 无关任务类型、请求与结果 Schema。
- OpenAI Responses 与 Chat Completions 适配器所共享的内部契约。
- 提示词版本、输出 Schema 版本和一次结构修复规则。
- 来源定位、候选转换、去重、冲突检测和批量确认资格。
- 错误码和 Provider 能力模型。

该包不读取 OPFS、不发网络请求、不持久化 API Key，也不直接写正式事实。

### 3.3 Fastify API 职责

- 校验请求、凭据和任务载荷。
- 选择预设或自定义 Provider 目标并执行 SSRF 防护。
- 注入受控认证头，完成双协议请求与响应标准化。
- 传播取消，执行超时、响应大小、并发和速率限制。
- 记录低敏运行元数据，不记录业务载荷。

API 不保存任何事件、材料、候选、API Key、请求或响应，不创建异步任务。

### 3.4 正式数据所有权

- `CaseRepository` 继续拥有本地事件和所有正式结构化数据。
- `EvidenceBlobStore` 继续拥有原始文件。
- AI Repository 只拥有分析版本与候选。
- 导出模块只读取 M2 正式模型，不读取候选表。
- 确认行为是 AI 模型向 M2 正式模型的唯一写入通道，且必须由用户操作触发。

## 4. Provider 与协议

### 4.1 首发预设

| 预设        | 协议             | 预设目标                      | 能力策略                          |
| ----------- | ---------------- | ----------------------------- | --------------------------------- |
| OpenAI      | Responses API    | 官方 OpenAI API               | 连接测试后开放文本、视觉和 Schema |
| 阿里云百炼  | Chat Completions | 中国大陆官方兼容端点          | 连接测试后按模型开放              |
| DeepSeek    | Chat Completions | 官方 DeepSeek API             | 首发不预设视觉能力                |
| SiliconFlow | Chat Completions | 官方中国区 API                | 模型差异大，以连接测试为准        |
| 自定义      | Chat Completions | 用户提供的受限 HTTPS Base URL | 以严格安全检查和连接测试为准      |

预设固定协议、官方主机、允许路径和安全参数，不固定模型名称。模型可以手填；若实施模型列表查询，只允许调用对应官方目标的受限模型枚举接口，不把 API Key 暴露给第三方。

### 4.2 统一能力模型

连接测试产生以下能力快照：

```json
{
  "text": true,
  "vision": true,
  "jsonMode": true,
  "jsonSchema": false,
  "streaming": true
}
```

- 陈述草拟要求 `text`。
- 材料分类、事实提取和时间线候选要求 `vision`。
- `jsonSchema` 不可用时允许使用 JSON mode 或纯文本 JSON，再做本地严格 Schema 校验。
- Provider 声称支持但探测失败的能力必须关闭。
- 能力快照只保存在会话内存；模型、协议、Base URL 指纹变化后重新测试。
- 连接测试只发送固定虚构文本和最小虚构图片，不发送事件内容。

### 4.3 协议适配

`AiProviderAdapter` 暴露统一操作：

```typescript
interface AiProviderAdapter {
  testConnection(request: ConnectionTestRequest): Promise<ConnectionTestResult>
  executeTask(request: AiTaskRequest): Promise<AiTaskResult>
  repairOutput(request: RepairOutputRequest): Promise<AiTaskResult>
}
```

- OpenAI 适配器使用 `/v1/responses`，显式设置 `store: false`，不使用 conversation、previous response、后台模式、托管文件或工具。
- Chat Completions 适配器使用受控 `/v1/chat/completions` 路径，不使用 Provider 私有扩展。
- 请求为单轮、非持久会话；M3 不依赖 Provider 侧对话状态。
- Provider 支持流式响应时，服务端可以流式读取并执行输出字节上限，但只向浏览器返回完整且标准化的最终结果；不支持流式时使用非流式调用。`streaming` 不作为任务可用性的必要条件。
- 适配器只返回标准化结构化结果、低敏用量和 Provider 请求 ID 的不可逆指纹；不把原始响应透传给前端。

## 5. 材料派生、发送清单与授权

### 5.1 派生材料

- 图片在浏览器内生成受限像素和大小的副本。
- PDF 只在浏览器本地渲染用户选中页面为图片。
- 不发送原始 PNG、JPEG、WebP 或 PDF 字节。
- 派生图不写入 IndexedDB、OPFS、Cache Storage、日志或测试快照。
- Object URL 和像素缓冲在任务结束、取消或失败后释放。
- 派生处理不执行 PDF 脚本、外部链接、嵌入文件或网络请求。

### 5.2 `InputManifest`

每次任务在浏览器构造不可变发送清单，至少记录：

```json
{
  "taskId": "UUID v4",
  "caseId": "UUID v4",
  "taskType": "extract_facts",
  "providerPreset": "aliyun_bailian",
  "baseUrlFingerprint": "sha256:...",
  "modelName": "用户选择的模型",
  "items": [
    {
      "sourceToken": "本次任务内随机且不可复用的标识",
      "evidenceId": "UUID v4",
      "page": 1,
      "derivedMediaType": "image/webp",
      "pixelWidth": 1600,
      "pixelHeight": 2200,
      "byteSize": 350000,
      "derivedSha256": "64 位十六进制"
    }
  ],
  "batchCount": 2,
  "totalDerivedBytes": 7000000
}
```

`sourceToken` 由浏览器为本次任务随机生成，只用于 Provider 输出和本地材料之间的映射。发送到 API 和 Provider 的清单投影不包含稳定的 `caseId`、`evidenceId`、事件标题或原始文件名，只包含 `sourceToken`、页码、派生元数据和任务必需内容。模型返回后，浏览器必须先将 `sourceToken` 映射回 `evidenceId`，再按本地 `InputManifest` 校验页码和区域，最终持久化现有 `SourceLocation` 结构。未知、重复或越界的 `sourceToken` 一律判为无效输出。

用户授权并创建分析版本后，本地清单摘要可以随分析版本持久化；只保留材料 ID、任务内来源标识、页码、派生摘要、尺寸、批次和总量等元数据，不保留派生字节或发送正文。授权前的清单只存在于当前页面内存。

### 5.3 发送预览

预览必须显示：

- Provider、模型和数据处理提示；
- 原始文件名、所选页码和派生缩略图；
- 将发送的已确认文本字段；
- 材料数、页数、派生总大小、批次数和 Token 估算；
- 有可靠价格元数据时的费用估算区间及“以 Provider 实际账单为准”提示；
- Schema 修复可能额外产生一次调用；
- 逐项移除材料或页面的操作。

未知模型或自定义 Provider 不猜测费用，只展示载荷和 Token 估算。

### 5.4 两档授权

#### 严格确认（默认）

每次 AI 任务均展示完整预览并要求确认。

#### 会话便捷模式

首次完整确认后，当前页面会话、当前事件、当前 Provider、Base URL 指纹和模型内，由用户主动启动的后续任务只显示发送摘要，不再弹出完整确认框。

以下任一变化使便捷授权失效：

- 刷新、关闭页面或停用 AI；
- 切换事件、Provider、协议、Base URL 或模型；
- 新增材料、扩大页码或增加发送数据类型；
- 派生载荷超过首次授权范围；
- 连接能力重新探测或安全策略版本变化。

便捷模式不允许后台分析、定时分析或页面加载时自动发送。用户仍须主动启动每个任务。

## 6. 数据模型与持久化

### 6.1 会话配置

`ProviderSessionConfig` 只存在于当前页面 JavaScript 内存：

```typescript
interface ProviderSessionConfig {
  providerPreset: 'openai' | 'aliyun_bailian' | 'deepseek' | 'siliconflow' | 'custom'
  protocol: 'responses' | 'chat_completions'
  baseUrl: string
  modelName: string
  apiKey: string
  capabilities: ProviderCapabilities
  consentMode: 'strict' | 'session_convenience'
  connectionTestedAt: UtcTimestamp
}
```

禁止将该对象整体或部分写入 IndexedDB、OPFS、localStorage、Cookie、Cache Storage、日志、错误追踪、导出文件或快照。刷新或关闭页面后配置与 Key 一并清除。

### 6.2 `AnalysisVersion`

M3 扩展现有分析版本，记录：

- `id`、`caseId`、`taskType`；
- `providerPreset`、`protocol`、`baseUrlFingerprint`、`modelName`；
- `promptVersion`、`schemaVersion`、`securityPolicyVersion`；
- 输入清单摘要、批次数、完成批次数；
- `running / repairing / completed / failed / cancelled`；
- `startedAt`、`completedAt`、低敏错误码；
- Provider 返回的输入、输出和总 Token 用量（可用时）。

`preparing / awaiting_consent` 属于浏览器内存中的任务准备状态，不写入 IndexedDB。用户授权后才创建状态为 `running` 的分析版本；同一任务的一次结构修复属于同一个分析版本。顺序一键分析的分类、事实和时间线分别创建分析版本。历史版本不可覆盖。

### 6.3 候选记录

M3 持久化四类候选：

- `EvidenceClassificationCandidate`；
- 现有 `FactCandidate`；
- `TimelineCandidateRecord`；
- `StatementDraftCandidate`。

共同字段包括：

- 候选 ID、事件 ID、分析版本 ID；
- 来源位置、置信级别、审核状态、创建时间；
- 候选值与规范化值；
- 可选的冲突类型和被冲突正式记录 ID。

来源位置扩展为 `evidenceId + page + region`。`region` 使用派生图像像素坐标，并记录派生宽高，以便确定性映射回页面预览；不得只保存模型自然语言描述的“附近位置”。

AI 候选使用独立的 `AiConfidenceLevel`：`high / needs_confirmation / conflicted / unknown`。现有规则候选继续使用规则自身的确定性或置信模型；二者通过 `origin` 判别，不在 UI 或服务层使用散落的字符串转换。

### 6.4 正式记录的候选来源

为使分类、时间线和陈述与现有 `ConfirmedFact.derivedFromCandidateId` 一样可追溯，M3 扩展正式模型：

- `EvidenceFile` 增加分类来源 `manual / candidate_confirmed / candidate_edited` 和可空 `categoryCandidateId`；M2 记录迁移为 `manual + null`。用户之后手工改分类时清除候选关联。
- `TimelineEntry` 增加创建来源 `manual / candidate_confirmed / candidate_edited` 和可空 `derivedFromCandidateId`；M2 记录迁移为 `manual + null`。
- `StatementDraft` 与 `ConfirmedStatement` 增加内容来源和可空 `derivedFromCandidateId`；手工生成或编辑为独立手工陈述时清除候选关联，基于候选编辑并确认时保留 `candidate_edited` 关联。

这些字段必须与正式记录在同一 IndexedDB 事务内更新。导出仍只读取正式值，不读取候选正文；来源字段只用于追溯、引用保护和删除判断。

### 6.5 不持久化内容

- API Key；
- 完整 Base URL；
- 完整请求和响应；
- 展开后的系统提示词、用户提示词或修复提示词；
- 模型推理内容；
- 派生图片和 PDF 页面图；
- Provider 原始错误体；
- 用户发送预览的完整正文副本。

### 6.6 AI Repository 与迁移

IndexedDB 增加分析版本和候选 Object Store，并通过版本化迁移创建。迁移失败必须沿用 M2 的“保留旧数据、阻止写入、不删除数据库”规则。

AI Repository 提供最小公开能力：创建/完成分析版本、原子发布某阶段候选、查询待审核候选、更新审核状态、检查引用和删除分析版本。不得允许业务层绕过审核状态直接写正式表。

批次结果先留在当前任务内存中；只有当前阶段全部批次成功、合并和校验完成后，才以单个 IndexedDB 事务发布候选。任一批失败时，该阶段不发布部分候选。

## 7. 候选审核与正式数据

### 7.1 状态流

```text
pending ----------------------> confirmed
   |                               ^
   +--------------------------> edited_and_confirmed
   |
   +--------------------------> rejected
   |
   +--> conflicted -----------> edited_and_confirmed
              |
              +---------------> rejected
```

- `confirmed` 表示用户按候选原值确认。
- `edited_and_confirmed` 表示用户修改后确认，必须保存最终值和原候选关联。
- `rejected` 保留在分析历史中，默认审核列表折叠。
- `conflicted` 不能直接批量确认。
- 已完成状态不得由后续 AI 任务改回 `pending`。

### 7.2 冲突检测

确定性代码在发布候选前检查：

- 同字段候选与当前正式事实规范化值不一致；
- 同一分析内相同字段出现多个不同规范化值；
- 时间线候选与正式时间线的日期、金额或顺序矛盾；
- 分类候选与当前用户分类不一致；
- 来源材料、页码或区域不在 `InputManifest` 授权范围；
- 候选引用已删除、非 ready 或摘要变化的材料。

程序不得按置信度静默择优覆盖。冲突统一进入用户审核。

### 7.3 批量确认资格

只有同时满足以下条件的候选可批量确认：

- `reviewStatus === 'pending'`；
- 置信级别为 `high`；
- 至少一个合法来源，且全部来源在授权清单内；
- 无正式数据、候选或来源冲突；
- 值和规范化值通过领域 Schema；
- 分析版本状态为 `completed`；
- 候选所依赖材料仍为 ready 且摘要一致。

`needs_confirmation`、`conflicted`、`unknown` 必须逐项处理。批量确认资格只读取 `AiConfidenceLevel`，不得把规则候选的 `medium / low` 映射为 AI 置信状态。

### 7.4 正式写入规则

- 事实：用户确认后生成新的 `ConfirmedFact` 版本，填写 `derivedFromCandidateId` 和候选来源。
- 分类：用户确认后才更新 `EvidenceFile.category`、分类来源和 `categoryCandidateId`，并保留分类候选审核记录。
- 时间线：用户确认后创建带候选来源的正式 `TimelineEntry`；AI 候选本身不是正式时间线。
- 陈述：候选确认后写入带候选来源的 `StatementDraft`，用户仍需执行现有最终确认；最终确认把来源复制到 `ConfirmedStatement`。
- 缺失材料提醒优先使用确定性规则；M3 不用 AI 结果覆盖规则 finding。

### 7.5 分析版本删除

- 无正式记录引用时，可以删除分析版本及其候选。
- 若正式事实、当前材料分类、时间线、陈述草稿或已确认陈述仍引用候选，则阻止删除并展示引用关系。
- 删除候选或分析版本不删除原始材料。
- 删除事件时必须删除全部分析版本、候选和未完成任务状态，并纳入 M2 删除核验。

## 8. 任务编排

### 8.1 单项任务

支持：

- `classify_evidence`；
- `extract_facts`；
- `build_timeline`；
- `draft_statement`。

每个任务经过“选择输入 → 派生 → 预览 → 授权 → 分批调用 → 校验与合并 → 原子发布 → 审核”。陈述任务只接收当前有效的已确认事实和已确认时间线，不接收未确认候选或原始材料。

### 8.2 一键分析

顺序固定为：

1. 材料分类；
2. 事实提取；
3. 时间线候选。

每个阶段有独立分析版本。任一阶段失败后不再启动后续阶段，已成功阶段保留。陈述草拟不在一键分析中。

### 8.3 并发和生命周期

- 同一事件同时只允许一个 AI 任务。
- 服务端不保存任务状态，不建立队列。
- 页面刷新、关闭、断开或用户取消后，前端发出取消信号并清除派生内存。
- 任务取消或超时后不发布当前阶段部分候选。
- 应用启动时把遗留的 `running / repairing` 分析版本确定性标记为 `cancelled`，不尝试恢复网络调用；授权前状态从不持久化。

### 8.4 分批

- 单次任务最多选择 10 个材料和 30 页。
- 单批派生载荷默认不超过 20 MiB。
- 超过单批上限时按清单稳定顺序分批，预览显示批次数。
- 用户一次授权整个批次组；便捷授权不能扩大已批准范围。
- 合并按来源、字段和规范化值去重；不同值标记冲突，不由 AI 或程序选择最终值。

## 9. API 设计边界

### 9.1 路由

- `POST /ai/connection-test`
- `POST /ai/tasks/:taskType`
- `POST /ai/tasks/:taskType/repair`

所有入口都是同步无状态请求。API 不提供任务查询、轮询、历史、文件上传、Provider 配置保存或模型代理通用端点。

### 9.2 请求与响应

请求包含：

- 客户端生成的 UUID v4 请求 ID；
- Provider 预设、协议、模型和受控 Base URL；
- 专用凭据字段中的 API Key；
- 任务输入、输出 Schema 标识、提示词版本和批次信息；
- 派生图片与任务内 `sourceToken` 来源映射；不发送本地 `caseId`、`evidenceId`、事件标题或原始文件名。

服务端在 Schema 校验后立即从可记录对象中移除 API Key。响应只包含标准化任务结果、低敏用量、能力或稳定错误码，不回传凭据、原始响应、推理内容或完整上游错误。

### 9.3 缓存和留存

- API 响应设置 `Cache-Control: no-store`。
- OpenAI Responses 请求设置 `store: false`，不使用 conversation、background、files 或托管工具。
- 其他 Provider 使用协议支持的最低留存设置；UI 明确提示数据处理仍受 Provider 条款约束。
- 网关、反向代理和应用不得记录请求体或响应体。
- 不进行应用级缓存、重试队列或请求重放。

## 10. 自定义 Base URL 与 SSRF 防护

### 10.1 URL 约束

自定义目标必须：

- 使用 HTTPS；
- 不包含用户名、密码、片段或查询参数；
- 不使用 IP 字面量；
- 使用默认 443 端口；
- Base URL 只表示经过规范化的 API 前缀（例如 `/v1`），最终请求路径由服务端按该前缀追加固定的 `chat/completions` 相对路径；
- 不包含编码后的路径穿越、反斜杠或控制字符。

预设 Provider 使用固定官方主机和路径，不接受用户修改。

### 10.2 网络地址约束

拒绝所有解析到以下范围的目标：

- 回环、私网、链路本地；
- CGNAT、文档、基准测试、保留、未指定；
- 多播和广播；
- IPv4-mapped IPv6 及其他可绕过表示；
- 云元数据和本机管理地址。

DNS 的全部 A/AAAA 结果都必须是允许的公网地址。连接测试和每次正式请求均重新校验。

### 10.3 防 DNS rebinding

出站连接必须固定使用已校验的目标地址，同时使用原 hostname 完成 TLS SNI 和证书校验。不得在校验后让通用客户端自行重新解析目标。若选用的 Node HTTP 客户端无法提供这一保证，自定义 Base URL 不得进入 M3 验收。

### 10.4 重定向、代理和请求头

- 禁止自动跟随 3xx 重定向。
- 不读取或使用 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY` 等代理环境变量。
- 只允许 `Authorization: Bearer`、`Content-Type` 和协议所需固定头。
- 不允许用户提供自定义请求头、Cookie、组织 ID 或任意认证方案。

## 11. 错误、取消与结构修复

### 11.1 稳定错误码

- `provider_auth_failed`
- `provider_model_not_found`
- `provider_rate_limited`
- `provider_quota_exceeded`
- `provider_content_rejected`
- `provider_unreachable`
- `provider_timeout`
- `provider_response_too_large`
- `provider_capability_missing`
- `target_not_allowed`
- `invalid_structured_output`
- `repair_failed`
- `request_cancelled`
- `task_already_running`

错误对象不包含 API Key、完整 URL、完整上游响应、材料字节、提示词或用户正文。

### 11.2 取消和超时

- 浏览器使用 `AbortController`；Fastify 在客户端断开时取消上游请求。
- 服务端超时与用户取消使用不同错误码。
- 取消、超时或页面关闭后不发布当前阶段候选。
- 已成功的一键分析前序阶段不回滚。
- 取消不能删除原始材料、正式数据或已完成分析版本。

### 11.3 一次结构修复

首次输出解析或 Schema 校验失败时，允许同一分析版本执行一次修复请求：

- 只发送原模型输出、目标 Schema、任务类型和修复指令；
- 不增加材料、页码、正式事实或其他业务内容；
- 不改变 Provider、模型、协议或授权范围；
- 修复结果重新经过完整 Schema、来源和冲突校验；
- 再次失败后终止任务并记录 `repair_failed`。

结构修复不是网络重试。认证、限流、余额、超时、连接和内容拒绝错误不自动重试。

### 11.4 批次失败

批次结果在当前阶段内存中暂存。任一批失败时：

- 当前阶段标记 `failed`；
- 当前阶段所有未发布结果丢弃；
- 不生成看似完整的部分候选；
- 用户可以缩小范围后创建新的分析版本重试。

## 12. 界面设计

### 12.1 AI 设置

- 明确显示“当前页面会话有效，刷新后清除”。
- 提供 Provider、Base URL（仅自定义）、模型、API Key 和连接测试。
- 显示文本、视觉、JSON、JSON Schema、流式能力矩阵。
- 提供严格确认、会话便捷模式和停用 AI。
- 不显示“已保存密钥”等误导文案。

### 12.2 发送预览

- 以文件和页为单位展示缩略图、原始名称和勾选状态。
- 单独列出将发送的文本字段。
- 展示 Provider、模型、载荷、批次、估算成本和可能的一次修复调用。
- 用户可移除材料或页面；任何扩大范围都重新计算授权。

### 12.3 任务进度

- 展示任务类型、阶段、当前批次和总批次。
- 提供取消按钮。
- 明确说明关闭或刷新页面会中止任务。
- 不显示虚假百分比，不承诺后台继续。

### 12.4 候选审核

- 分为待确认、冲突和已处理。
- AI 候选与正式数据使用明确视觉标识。
- 每项显示值、置信级别、来源文件、页码和区域预览。
- 支持确认、编辑后确认、拒绝；符合资格时显示批量确认。
- AI 失败、未启用或能力不足时保留并突出原 M2 手工入口。

## 13. 日志、隐私和提示注入

### 13.1 低敏日志

允许记录：

- 请求 ID；
- 任务类型和 Provider 预设；
- Base URL 指纹；
- 状态码类别、稳定错误码和耗时；
- 批次序号、派生载荷字节数；
- 输入/输出 Token 数（Provider 返回时）。

禁止记录 API Key、Authorization、完整 Base URL、请求体、响应体、文件名、事件标题、材料内容、候选值、提示词或模型推理。

### 13.2 数据处理提示

启用 AI 和每次发送预览必须说明：

- 哪些派生页面和文本将发送；
- 原始文件不会发送，但派生图仍可能包含敏感信息；
- API Key 由用户提供且只在当前页面会话使用；
- Provider 可能依据其条款处理或保留数据；
- AI 可停用，手工流程始终可用；
- AI 结果可能错误，必须审核。

### 13.3 提示注入边界

- 材料中的指令、网页文本、二维码和聊天内容全部视为不可信数据。
- 系统提示明确禁止遵循材料内指令、访问外部资源或生成法律结论。
- 不为模型启用网页、代码执行、文件搜索、MCP 或其他工具。
- 提示注入防护不能替代 Schema、来源校验和用户确认。
- 模型输出中的 URL、HTML 或 Markdown 不作为可执行内容渲染。

## 14. 成本、配额与资源限制

- 单次任务最多 10 个材料、30 页。
- 单批派生载荷默认最多 20 MiB。
- 请求体、单图、总图片和标准化响应均有硬上限。
- 有可靠且带版本日期的价格元数据时显示估算区间；否则只显示 Token 和载荷估算。
- 费用提示必须标注币种、价格元数据日期和“以 Provider 实际账单为准”。
- 不自动选择更贵模型、不失败切换模型、不后台续跑。
- 修复调用计入同一任务用量，并在首次预览中明确。
- 服务端实施每 IP 短时速率和全局并发限制，但不保存长期用户画像或业务用量历史。

## 15. 测试与评测

### 15.1 契约和纯函数测试

`packages/ai-core` 覆盖：

- 两种协议的请求和标准化结果；
- 所有任务输出 Schema 和未知字段拒绝；
- 来源必须属于授权清单；
- 来源页和区域坐标边界；
- 候选去重、冲突和批量确认资格；
- 审核状态流和正式写入命令；
- 一次结构修复边界；
- 稳定错误映射；
- 费用与批次估算的确定性。

### 15.2 浏览器测试

- API Key 和会话配置不写入任何浏览器存储；
- 刷新、关闭、停用 AI 后配置清除；
- 派生图片不落盘，任务后内存与 Object URL 清理；
- PDF 页码、区域与来源映射；
- 严格确认与便捷授权失效条件；
- 同事件单任务互斥、取消和遗留状态清理；
- 分析版本与候选迁移、引用阻断和事件删除核验。

### 15.3 API 与网络安全测试

使用 Fastify `inject()` 和受控本地 TLS/DNS 测试设施覆盖：

- 请求 Schema、凭据提取、大小和响应上限；
- API Key、请求体和响应体日志脱敏；
- 预设主机白名单；
- HTTP、用户信息、非标准端口、IP 字面量和路径绕过拒绝；
- IPv4/IPv6 私网、回环、链路本地、保留和 mapped 地址拒绝；
- 多结果 DNS、DNS rebinding、TLS hostname 和固定地址连接；
- 重定向、代理环境变量和用户自定义头拒绝；
- 超时、断开和取消传播；
- 速率、并发和超大响应限制。

### 15.4 Mock Provider 测试

Responses 与 Chat Completions 均覆盖：

- 文本、视觉、JSON mode 和 JSON Schema 能力探测；
- 合法结果；
- 非法 JSON、Schema 不符、未知字段和来源越界；
- 修复成功与修复失败；
- 认证失败、模型不存在、限流、余额不足、内容拒绝、超时和空响应；
- Provider 原始错误不透传；
- 不调用真实付费模型。

### 15.5 E2E

- OpenAI Responses mock 成功路径；
- Chat Completions mock 成功路径；
- 严格确认与会话便捷模式；
- 单项分类、事实、时间线和陈述；
- 一键分析阶段成功与中途失败；
- 高置信批量确认、逐项编辑、拒绝和冲突；
- 取消、刷新、Key 错误和能力不足；
- AI 停用后继续 M2 手工导出；
- 删除事件后 AI 数据无残留。

关键浏览器覆盖桌面 Chromium、移动 Chromium 和移动 WebKit。真实 Provider 仅允许人工、非 CI、使用虚构材料联调。

### 15.6 黄金案例评测

使用完全虚构的 M2 黄金材料和固定 Mock 输出测量：

- 材料分类准确率；
- 日期、金额、商家、商品和订单号准确率；
- 时间线候选召回率；
- 来源页与区域准确率；
- 无来源率、冲突率和虚构事实率；
- 首次 Schema 成功率和修复后成功率；
- 用户确认前正式数据变更数，必须为零。

评测首要目标是“不虚构、可回溯、可确认”，语言流畅度不是首要门槛。

## 16. 兼容性、删除和失败恢复

### 16.1 无 AI 兼容

- M3 不改变 M2 的手工页面、正式模型和导出输入。
- 未配置 Key、连接测试失败、Provider 不支持或用户停用 AI 时，M2 全流程继续可用。
- 数据库迁移后旧事件无 AI 数据也必须正常打开、编辑、导出和删除。

### 16.2 删除

事件删除顺序扩展为：先取消活动任务并清理派生内存，再删除分析版本和候选，然后继续 M2 的 OPFS 与结构化删除流程。成功前必须核验所有 AI Object Store 对该事件无记录。

单独删除分析版本时执行引用检查；被正式记录引用时阻止删除，不级联删除正式数据。

### 16.3 失败恢复

- 网络任务不恢复、不重放；启动后把遗留运行态标记取消。
- 未原子发布的批次结果不存在持久残留。
- 已完成候选保留，用户可以继续审核或删除。
- 任何错误不得修改原始材料和现有正式数据。

## 17. 主要替代方案与取舍

### 17.1 浏览器直连模型

拒绝。虽然减少服务端成本，但 CORS、Provider 差异、出站安全、统一取消和错误脱敏难以控制，也不符合已确认的普通 Web 使用方式。桌面安全存储属于后续独立设计。

### 17.2 只支持 OpenAI Responses API

拒绝。实现最简单但不满足国内 Provider 和 BYOK 兼容目标。采用双协议会增加适配测试，但上层保持统一契约。

### 17.3 直接上传原始 PDF

拒绝。Provider 支持不一致，发送范围难以按页审查，原始 PDF 可能包含额外对象和元数据。浏览器派生页面图牺牲部分版面语义和增加客户端成本，但发送边界更可见、更一致。

### 17.4 每次确认与永久授权

永久授权拒绝。默认严格确认更安全；会话便捷模式只在不扩大范围的当前事件和 Provider 上减少重复交互，兼顾易用性。

### 17.5 服务端任务队列

拒绝。队列要求持久化凭据或业务载荷，并引入后台状态、取消和清理复杂度。M3 使用页面生命周期内同步请求。

### 17.6 自动选择最高置信候选

拒绝。模型置信不是正式事实依据。确定性代码只判定审核资格和冲突，最终值由用户确认。

## 18. 威胁与控制

| 风险                   | 核心控制                                                               |
| ---------------------- | ---------------------------------------------------------------------- |
| API Key 泄露           | 只存页面内存、专用字段、日志递归脱敏、禁止快照和持久化                 |
| 原始材料意外上传       | 只发送派生页面图、发送清单、预览授权、边界测试                         |
| SSRF 与云元数据访问    | HTTPS、固定预设、地址范围拒绝、固定已解析 IP、SNI 校验、禁重定向和代理 |
| DNS rebinding          | 每次解析并固定已校验地址；不允许客户端再次解析                         |
| Provider 记录敏感数据  | 数据最小化、Provider 提示、OpenAI `store:false`、用户可缩小范围        |
| 提示注入               | 无工具、材料视为数据、结构化输出、来源校验、用户审核                   |
| 模型虚构事实           | 来源必填、Schema、冲突检测、逐项确认、正式写入隔离                     |
| 部分批次伪装完整结果   | 阶段内存暂存、全部批次成功后原子发布                                   |
| AI 候选进入正式导出    | 导出只读 M2 正式模型，候选表无导出入口                                 |
| 便捷授权范围悄然扩大   | 授权绑定事件、Provider、模型、输入类型和载荷范围；变化即失效           |
| 超大图片或响应耗尽资源 | 页数、像素、字节、批次、请求和响应硬上限                               |
| 删除后 AI 数据残留     | 候选/版本纳入事件删除和逐 Store 核验                                   |
| 错误体泄露用户内容     | 稳定错误码，禁止透传完整上游错误                                       |

## 19. 验收标准

M3 只有在以下条件全部满足后完成：

- OpenAI Responses 和 Chat Completions mock 协议测试通过。
- 四个 Provider 预设和自定义 Provider 均通过配置与能力协商测试。
- API Key 不出现在 IndexedDB、OPFS、localStorage、Cookie、Cache Storage、日志、快照、导出或错误信息。
- 原始文件字节不进入 AI API 请求；派生图在任务后不落盘。
- 严格确认和会话便捷模式的授权边界通过浏览器测试。
- 自定义 Base URL 的 SSRF、DNS rebinding、TLS 和重定向测试通过。
- 错误、恶意、无来源或冲突模型输出不能进入正式数据。
- 用户确认前正式数据变更数为零。
- 取消和超时能终止上游请求，不发布部分候选。
- 一键分析按阶段隔离，失败不污染已完成阶段或正式数据。
- 删除事件后分析版本、候选、原始材料和临时数据均无残留。
- AI 关闭后 M2 无 AI 黄金流程继续通过。
- `pnpm test:ai-contract`、`pnpm eval:golden-case` 和根级 `pnpm verify` 全部通过。
- 所有自动测试和 CI 未调用真实付费模型。

## 20. 规格追踪

| V0.1 / M3 要求           | 本规格落实                                            |
| ------------------------ | ----------------------------------------------------- |
| OpenAI-compatible 可配置 | 双协议适配、四预设和受限自定义 Provider               |
| API Key 不持久化         | 页面会话配置、专用凭据字段和日志/存储禁止清单         |
| 发送前用户知情           | 不可变发送清单、完整预览、两档授权及失效条件          |
| 来源可追溯               | `evidenceId + page + region` 和派生尺寸               |
| 未确认内容不进入正式输出 | 候选 Repository、审核状态、M2 正式写入门槛            |
| AI 失败后手工继续        | 无状态任务、稳定错误码、M2 页面和导出不依赖 AI        |
| 用户可以取消             | Abort 传播、无部分发布、遗留运行态标记取消            |
| Schema 修复一次          | 同分析版本、原授权范围、一次修复后终止                |
| API 不保存业务数据       | 无数据库、队列、缓存、请求重放或后台任务              |
| AI 不生成法律结论        | 任务 Schema、提示词边界、无工具、候选审核             |
| 国内网络环境可用         | 百炼、DeepSeek、SiliconFlow 预设与按能力开放          |
| 黄金案例 AI 评测         | 固定 Mock、准确率、来源率、虚构率和正式数据零变更指标 |

## 21. 官方协议依据与适用边界

本规格在 2026-08-12 依据以下官方资料确认协议方向；Provider 能力和数据政策会变化，实施连接测试和用户提示不得把这些资料当作永久保证：

- OpenAI Responses API 支持图片输入与 JSON Schema；M3 显式关闭存储且不使用托管会话、文件或后台模式：<https://platform.openai.com/docs/api-reference/responses>
- OpenAI API 数据控制说明：<https://platform.openai.com/docs/models/default-usage-policies-by-endpoint>
- 阿里云百炼 OpenAI 兼容与多模态能力说明：<https://help.aliyun.com/zh/model-studio/what-is-model-studio>
- DeepSeek OpenAI-compatible Chat Completions 与 JSON 输出说明：<https://api-docs.deepseek.com/zh-cn/>
- SiliconFlow OpenAI 兼容调用说明：<https://docs.siliconflow.cn/cn/userguide/quickstart>

## 22. 下一步

本规格获用户书面批准后，下一项工作是编写 M3 详细实施计划。计划必须：

- 将参数决策、技术验证、领域契约、浏览器派生处理、API 安全、Provider 适配、候选审核和 E2E 拆成可独立验证的小 Task；
- 每个运行时 Task 从有效 RED 开始；
- 先建立安全和正式数据隔离，再开放实际 AI 用户流程；
- 不调用真实付费模型，不提前进入 M4 部署和公开演示。
