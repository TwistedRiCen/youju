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

## @noble/hashes@2.2.0（Task 5，已批准）

| 项目 | 内容 |
| --- | --- |
| 用途 | 增量 SHA-256 摘要，用于大文件分块读取与证据完整性校验 |
| 精确版本 | `2.2.0`（`packages/evidence-hash/package.json` 使用 `--save-exact` 固定） |
| 许可证 | MIT |
| 维护状态 | 活跃；作者 Paul Miller，广泛使用、审计记录良好，零运行时依赖 |
| 替代方案 | Web Crypto `subtle.digest()`：只支持一次性整体输入，无法对分块流做增量更新，大文件内存不友好，已拒绝；手写 SHA-256：风险高且无必要，已拒绝 |
| 采用理由 | 提供 `create().update().digest()` 增量 API，可在浏览器与 Node 中一致运行，且不引入额外依赖树 |
