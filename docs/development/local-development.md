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
