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
