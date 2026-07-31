# M2 新增依赖审查记录

本文档记录 M2 里程碑引入的每个外部依赖。只有在对应 Task 首次使用该能力时才添加条目；版本以 `pnpm-lock.yaml` 为准。

## idb@8.0.3（Task 2，已批准）

| 项目 | 内容 |
| --- | --- |
| 用途 | 以 Promise 和 TypeScript 类型封装原生 IndexedDB，用于 `CaseRepository` 的事务、游标和迁移实现 |
| 精确版本 | `8.0.3`（`apps/web/package.json` 使用 `--save-exact` 固定） |
| 许可证 | ISC |
| 维护状态 | 活跃；作者 Jake Archibald，长期维护且在现代浏览器（Chromium、WebKit、Firefox）中广泛使用 |
| 替代方案 | 原生 IndexedDB 回调 API：可行，但事务错误处理、版本升级和游标删除代码更易出错且难以保持类型安全；`idb-keyval`：仅覆盖 key-value 场景，不支持多对象存储事务和版本迁移，已拒绝 |
| 采用理由 | 需要原子多存储事务（cases + factDrafts）、索引查询和可注入迁移的版本升级，`idb` 是满足这些要求的最小 Promise 封装 |

未引入 `idb-keyval` 或其他 IndexedDB 封装。

## pdf-lib@1.17.1、@pdf-lib/fontkit@1.1.1、fflate@0.8.3（Task 13，已批准）

| 项目 | 内容 |
| --- | --- |
| 用途 | 浏览器内生成三份 PDF（pdf-lib + fontkit 嵌入本地中文字体并子集化）、流式生成 ZIP 材料包（fflate） |
| 精确版本 | `pdf-lib@1.17.1`、`@pdf-lib/fontkit@1.1.1`、`fflate@0.8.3`（`--save-exact` 固定） |
| 许可证 | 均为 MIT |
| 维护状态 | pdf-lib / fontkit：维护活跃、广泛使用；fflate：活跃维护、体积小、支持流式 ZIP |
| 替代方案 | 浏览器打印 PDF：输出不稳定且依赖用户操作，已拒绝；手写 ZIP：风险高且无法流式，已拒绝；远程字体：违反离线与隐私边界，已拒绝 |
| 采用理由 | 三者在浏览器端可确定性生成 PDF 与流式 ZIP，不产生网络请求；上传的 PDF 只作为原始附件复制，绝不解析 |

## Noto Sans CJK SC 本地字体资产（Task 13，已批准）

| 项目 | 内容 |
| --- | --- |
| 文件 | `apps/web/src/assets/fonts/NotoSansCJKsc-Regular.otf`（16,437,364 字节） |
| SHA-256 | `2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b` |
| 上游来源 | notofonts/noto-cjk 官方仓库 `Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf`，HEAD commit `f8d157532fbfaeda587e826d4cd5b21a49186f7c` |
| 许可证 | SIL Open Font License 1.1，`apps/web/src/assets/fonts/OFL.txt`（SHA-256 `6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2`） |
| 使用方式 | 本地静态资产，运行时同源加载字节并 `subset: true` 嵌入 PDF；无任何远程请求 |

## @noble/hashes@2.2.0（Task 5，已批准）

| 项目 | 内容 |
| --- | --- |
| 用途 | 增量 SHA-256 摘要，用于大文件分块读取与证据完整性校验 |
| 精确版本 | `2.2.0`（`packages/evidence-hash/package.json` 使用 `--save-exact` 固定） |
| 许可证 | MIT |
| 维护状态 | 活跃；作者 Paul Miller，广泛使用、审计记录良好，零运行时依赖 |
| 替代方案 | Web Crypto `subtle.digest()`：只支持一次性整体输入，无法对分块流做增量更新，大文件内存不友好，已拒绝；手写 SHA-256：风险高且无必要，已拒绝 |
| 采用理由 | 提供 `create().update().digest()` 增量 API，可在浏览器与 Node 中一致运行，且不引入额外依赖树 |
