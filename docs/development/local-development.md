# 本地开发指南

## 1. 前置环境

- Node.js 24 LTS；
- pnpm 10.34.0；
- Git；
- Chromium 和 WebKit，用于 Playwright E2E。

确认版本：

```bash
node --version
pnpm --version
```

Node 应为 `v24.x`，pnpm 应为 `10.34.0`。仓库通过 `.nvmrc`、`engines` 和 `packageManager` 固定基线。

## 2. 安装

从仓库根目录运行：

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium webkit
```

Linux CI 使用以下命令同时安装浏览器系统依赖：

```bash
pnpm exec playwright install --with-deps chromium webkit
```

项目不需要数据库、容器编排、云对象存储或 `.env` 文件。不要为本地开发提交 API Key。

## 3. 启动开发外壳

同时启动 Web 和 API：

```bash
pnpm dev
```

- Web 由 Vite 提供，终端会显示实际端口；
- API 默认监听 `http://localhost:3000`；
- `GET http://localhost:3000/health` 返回固定健康状态；
- Web 的 `/dev/diagnostics` 只在开发模式注册，用于查看黄金案例低敏汇总。

M2 已开放本地事件创建、材料导入与分类、事实确认、时间线、缺口检查、事实陈述、材料包导出与删除。诊断页不是生产用户数据入口。

## 4. 常用命令

| 命令                           | 用途                                                        |
| ------------------------------ | ----------------------------------------------------------- |
| `pnpm lint`                    | 运行根级 ESLint                                             |
| `pnpm typecheck`               | 检查根项目及各 workspace 包类型                             |
| `pnpm test`                    | 运行全部 Vitest 项目                                        |
| `pnpm validate:fixtures`       | 校验完全虚构的黄金案例和期望规则结果                        |
| `pnpm build`                   | 构建或检查所有可构建 workspace 包                           |
| `pnpm e2e`                     | 在桌面 Chromium、移动 Chromium 和移动 WebKit 运行 smoke E2E |
| `pnpm check:forbidden-content` | 扫描密钥、环境文件、真实材料标记和 fixture 手机号           |
| `pnpm verify`                  | 依次执行 lint、类型检查、测试、fixture 校验、构建和 E2E     |

完整 M2 本地验收：

```bash
pnpm install --frozen-lockfile
pnpm check:forbidden-content
pnpm verify
git diff --check
git status --short
```

## 5. 黄金案例

黄金案例位于 `fixtures/ecommerce-refund/`，必须完全虚构。修改后先运行：

```bash
pnpm --filter @youju/test-support test
pnpm validate:fixtures
pnpm check:forbidden-content
```

不得使用真实平台标识、店铺、姓名、手机号、地址、订单、支付记录、聊天记录或文件。

案例 001 的 `binary/` 二进制材料由以下命令确定性生成，重跑后应逐字节一致：

```bash
pnpm exec tsx scripts/generate-m2-binary-fixtures.ts
pnpm validate:fixtures
```

## 6. M2 浏览器能力

M2 使用 IndexedDB 保存结构化数据、OPFS 保存原始文件。桌面 Chromium、移动 Chromium 与移动 WebKit 均纳入自动化；不支持 OPFS 的浏览器（如部分内置浏览器）会显示「当前浏览器不能可靠保存原始材料」，结构化编辑仍可用，材料导入与含附件导出被禁用。

支持的文件类型：JPG/JPEG、PNG、WebP、PDF；每事件最多 50 个文件、单文件最多 50 MiB、总量最多 500 MiB。扩展名、MIME 与文件签名不一致时拒绝导入。

材料包固定结构：`有据_事件材料包_YYYYMMDD_HHmm/` 下包含三份 PDF、摘要 CSV、离线附件索引 HTML 与 `06_原始材料/`。

## 7. 故障排查

### Node 或 pnpm 版本不匹配

切换到 Node 24，再使用根 `package.json` 指定的 pnpm 10.34.0。不要升级到 pnpm 11，也不要关闭 `engine-strict`。

### Playwright 找不到浏览器

重新执行浏览器安装命令。Linux 环境需要 `--with-deps`；Windows 和 macOS 通常只需安装浏览器二进制。

### 冻结安装报告 lockfile 不一致

确认使用 pnpm 10.34.0。只有依赖确实发生经批准的变化时才运行非冻结安装并审查 `pnpm-lock.yaml` 差异。

### 端口被占用

API 可通过当前进程的 `PORT` 环境变量临时指定其他端口。E2E 使用固定 Web 端口 `4173`，运行前应停止占用该端口的进程。

## 8. M3 BYOK AI 本地运行

### 8.1 版本与启动命令

本项目使用 Node.js 24 和 pnpm 10.34.0。先确认当前终端已经指向本机已有的 Node 24 运行时；不要为了本项目另行下载或升级 Node、pnpm：

```powershell
node --version
pnpm --version
```

期望结果为 Node `v24.x` 和 pnpm `10.34.0`。根 `package.json` 的 `engines` 与 `packageManager` 声明并固定了项目基线；若版本不符合，应先切换到本机已有的正确运行时。

在仓库根目录执行：

```powershell
pnpm install --frozen-lockfile
pnpm exec playwright install chromium webkit
pnpm dev
```

`pnpm dev` 并行启动 Web 和 API：

- Web 使用 Vite，默认访问地址为 `http://localhost:5173`；
- API 默认监听 `http://localhost:3000`，健康检查为 `GET /health`；
- `PORT` 只改变 API 监听端口；若修改端口，须同步调整 Vite 开发代理和测试配置。

### 8.2 `/ai` 同源路由与临时转发

Web 端 AI 客户端只请求相对路径 `/ai/connection-test` 和 `/ai/tasks/:taskType`。开发模式下 Vite 将 `/ai` 转发到 `http://127.0.0.1:3000`；因此浏览器不会直接请求 Provider，也不会把 Provider URL 暴露为前端跨域请求。API 再根据预设或自定义目标建立一次 HTTPS POST，响应完成、失败或取消后释放本次请求资源。

API 是无状态临时转发边界：不使用数据库、队列、对象存储或 AI 结果缓存。日志只保留请求类型、状态类别、耗时、错误码、用量和 Base URL 指纹等低敏元数据；请求体、API Key、原始输入、图片、提示词和模型输出均由日志脱敏规则遮蔽。

### 8.3 Provider 选择与自定义目标

AI 设置中的 Provider 选择包括：

| 选择        | 协议             | 说明                               |
| ----------- | ---------------- | ---------------------------------- |
| OpenAI      | Responses        | 使用仓库内置 HTTPS 目标和能力声明  |
| 阿里云百炼  | Chat Completions | 使用仓库内置兼容协议目标和能力声明 |
| DeepSeek    | Chat Completions | 使用仓库内置兼容协议目标和能力声明 |
| SiliconFlow | Chat Completions | 使用仓库内置兼容协议目标和能力声明 |
| 自定义      | Chat Completions | 仅接受严格受限的 HTTPS Base URL    |

预设的协议、能力和路径来自 `packages/ai-core/src/provider.ts`；预设不构成可用性、价格、保留期限、输出准确性或网络可达性的承诺。使用前应由用户自行确认 Provider 的账户、模型、服务条款和数据处理设置。

自定义 Base URL 的规则由 `apps/api/src/ai/target-policy.ts` 执行：

- 必须是 HTTPS；端口只能省略或为 `443`；
- 不得包含用户名、密码、查询参数、片段、控制字符、反斜杠、点段、编码后的路径分隔符或空字节；
- 主机名必须是 ASCII 域名，不得是 IP 地址或尾随点；
- 不得把 `/chat/completions` 或 `/responses` 作为 Base URL 的末尾路径；服务端会追加 Chat Completions 路径；
- DNS 必须解析出至少一个 IPv4 或 IPv6 公网地址，所有解析结果都必须通过公网地址策略；实际连接固定到本次解析得到的地址，并用原主机名校验 TLS；
- 服务端不跟随 3xx 重定向，连接使用 `agent: false`，不读取代理环境变量；
- 预设不能携带 `baseUrl`，自定义目标不能省略 `baseUrl`。

### 8.4 会话密钥、授权范围和输入边界

API Key 只存在于当前页面 JavaScript 会话内存。它不写入 IndexedDB、OPFS、`localStorage`、Cookie、导出包、队列、缓存、错误对象或测试快照；点击“关闭 AI”或刷新页面后需要重新设置。更换 Provider、协议、Base URL、模型或能力测试时间会使已批准范围失效。

发送前页面展示本次范围。严格模式要求每次范围确认；会话便捷模式只允许在原事件、Provider、协议、Base URL 指纹、模型、能力、版本和上限不变且新选择是已批准范围的子集时复用确认。材料通过 `sourceToken` 与页码授权，文字字段也必须在授权范围内；服务端拒绝不在清单中的图片和不匹配清单的协议、模型或能力。

M3 的 AI 派生输入上限如下：

| 项目                 |      上限 |
| -------------------- | --------: |
| 单次任务涉及的材料数 |        10 |
| 派生页数             |        30 |
| 单张 WebP 派生图片   |     2 MiB |
| 单批派生图片总量     |    20 MiB |
| 单任务派生图片总量   |    60 MiB |
| API 请求体           |    32 MiB |
| API 响应体           |     2 MiB |
| 输入文字             |   512 KiB |
| 单张图片 Data URL    |     3 MiB |
| 模型名               |  256 字符 |
| API Key 与 Base URL  | 2048 字符 |

超出批次上限时客户端拆分批次；任一批次失败、超时或用户取消时，整次分析不发布部分候选。一次结构化输出修复最多追加一次请求，修复仍失败则返回稳定错误码。任务可取消，刷新或关闭页面不会让服务端继续持有本地任务状态。

### 8.5 候选审核与手工降级

AI 任务包括材料分类、事实提取、时间线候选和陈述草稿。每个分析版本记录来源、版本和审核状态。候选必须在审核界面逐条确认、编辑确认、拒绝或处理冲突；批量确认只接受满足来源、页码、置信度和冲突规则的候选。正式事实、时间线和陈述仍由本地确定性存储和用户确认操作产生，导出只读取正式记录，不读取待审核候选。

未配置 AI、连接测试失败、Provider 不可用、能力不足、超时、限流、输出校验失败或用户主动关闭 AI 时，继续使用 M2 手工流程：导入并分类材料、手工确认事实和时间线、编辑陈述、预检并导出、删除本地事件。AI 错误不得阻断这些手工入口。

### 8.6 M3 验证命令

所有自动化 Provider 流程均使用 Mock；不要在测试、快照、fixture、`.env` 或提交中填写生产 API Key。常用 M3 检查：

```powershell
pnpm check:forbidden-content
pnpm test:ai-contract
pnpm eval:golden-case
pnpm verify
git diff --check
```

完整证据和未执行的人工检查见[M3 威胁检查清单](../security/m3-threat-checklist.md)。真实 Provider、真实 API Key、真实手机和国内浏览器检查不属于本地自动化门禁，保留到 M4 发布验证。

## 9. M4 生产候选本地验证

开发模式下 Vite 不注册 Service Worker；生产构建、安全响应头、缓存规则与发布配对必须针对构建产物验证：

```powershell
pnpm build
pnpm generate:release
pnpm check:web-budget
pnpm check:production-headers
pnpm e2e:production
```

组合命令 `pnpm verify:release-candidate` 依次执行构建、release 描述生成、首屏/应用壳预算门禁、生产头检查、集成测试（候选服务器路由/安全头/release 配对）与生产 E2E（无 AI 演示、缓存隐私枚举、发布更新、严格离线壳）。

相关说明：

- `pnpm serve:production-candidate` 以本地候选服务器提供 `apps/web/dist`（静态缓存规则 + SPA 回退排除 + 同源 `/ai/*` 代理到 `127.0.0.1:3000`），仅用于本地测试，不是第二个生产服务器；
- `release.json` 由 `pnpm generate:release` 写入 `apps/web/dist`（仅含 releaseId、完整 commit、UTC 构建时间、IndexedDB 版本、case schema 版本与演示夹具 ID）；`/about` 在无该文件时诚实显示「发布编号尚未生成（开发构建）」；
- 生产 E2E 以 `NODE_ENV=production` + `RELEASE_ID`（取自 release.json）+ `TRUSTED_PROXY_CIDRS=127.0.0.1` 启动 API，从而验证 Web/API 发布编号配对与生产失败封闭语义；
- 生产配置要求 `TRUSTED_PROXY_CIDRS` 为显式列表，禁止 `true`、`*`、`0.0.0.0/0` 与 `::/0`；详见[公开演示部署指南](../deployment/public-demo.md)。
