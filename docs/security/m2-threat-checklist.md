# M2 威胁模型与验收检查

- 审查范围：M2 No-AI Core；
- 审查日期：2026-07-31；
- 依据：已批准 V0.1 设计规格、M2 无 AI 核心闭环设计规格与 M2 实施计划；
- 数据边界：仅完全虚构黄金案例与用户本地浏览器数据，不涉及真实模型调用。

## 1. 威胁与控制证据

| 风险                        | M2 控制                                                                                                | 代码或测试证据                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| IndexedDB 与 OPFS 部分提交  | 导入/删除/导出使用操作日志（validating/hashing/writing/committing/deleting/verifying），启动时幂等恢复 | `packages/evidence-store`、`apps/web/src/services/evidence-import-service.ts`、`recover-local-operations.ts`、`tests/e2e/evidence-import.spec.ts` |
| XSS 读取本地数据            | 严格 CSP 配置、用户文本在 HTML/PDF/CSV 各自转义、导出 HTML 无脚本/事件属性/远程资源                    | `packages/document-export/src/attachment-index.ts`、`safe-text-output.test.ts`、`m2-package-boundaries.test.ts`                                   |
| 扩展名/MIME/签名不一致      | 三重交叉校验，签名覆盖 JPEG/PNG/WebP/PDF                                                               | `apps/web/src/evidence/file-validation.ts`、`file-validation.test.ts`                                                                             |
| 配额与内存耗尽              | 文件数量/单文件/总量上限，导入前配额检查，分块 SHA-256 与分块 ZIP 写入                                 | `evidence-hash`、`zip-writer.ts`（64 KiB 分块）、`evidence-import.spec.ts`                                                                        |
| 重复或材料混用              | 同事件 SHA-256 去重并返回既有材料；正式路径只用事件/材料 UUID                                          | `evidence-import-service.ts`、`opfs-paths.ts`                                                                                                     |
| 恶意文件名或 CSV/ZIP 穿越   | 文件名清洗、CSV 公式前缀、ZIP 条目拒绝绝对路径/反斜杠/控制字符/`..`                                    | `file-names.ts`、`digest-csv.ts`、`safe-text-output.test.ts`                                                                                      |
| 上传 PDF 活动内容           | 上传的 PDF 仅作为原始附件字节复制，绝不解析或重新排版                                                  | `zip-writer.ts`、`pdf-renderer.ts`                                                                                                                |
| 多标签页静默覆盖            | Web Locks 单写入者 + 修订号并发检查，冲突停止自动保存并要求重载                                        | `case-write-lock.ts`、`case-concurrency.spec.ts`                                                                                                  |
| 未确认/过期内容进入正式输出 | 草稿/候选/正式分离；陈述按事实/时间线/规则版本身份判定过期；导出预检阻止                               | `domain/statements.ts`、`document-export/preflight.ts`、`statement-workflow.spec.ts`                                                              |
| 删除不彻底                  | 分阶段删除（OPFS → 结构化记录 → case 记录），删除后逐存储核验，失败保留 journal 可重试                 | `delete-case-service.ts`、`verified-deletion.spec.ts`                                                                                             |
| Service Worker 或 API 泄露  | SW 仅预缓存应用静态资源；API 不引入 M2 存储/导出包；边界测试扫描生产构建                               | `m2-package-boundaries.test.ts`、`apps/api/src`                                                                                                   |
| 本地与导出数据未加密        | 产品在创建与导出位置明确提示设备安全与敏感信息风险                                                     | `CreateCaseView.vue`、`ExportView.vue`                                                                                                            |

## 2. M2 规格追踪

| M2 验收项                                            | 证据                                                                                     |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 无需账号/API/AI 完成创建到导出                       | `tests/e2e/no-ai-core.spec.ts`（chromium-desktop / chromium-mobile）                     |
| 原始材料仅存本地、刷新可恢复、摘要可核验             | `opfs-evidence-store.spec.ts`、`evidence-import.spec.ts`、`local-case-workspace.spec.ts` |
| 文件类型/数量/大小/总量/配额限制                     | `file-validation.test.ts`、`evidence-import.spec.ts`                                     |
| 未确认/过期/冲突/缺失来源不进入正式输出              | `document-export/preflight.test.ts`、`statement-workflow.spec.ts`                        |
| 规则结果确定且只表达缺口                             | `rule-engine` 精确输出测试、`findings-and-statement.test.ts`                             |
| 导出 ZIP 固定目录、附件与摘要一致                    | `zip-writer.test.ts`、`submission-package.spec.ts`、`no-ai-core.spec.ts`                 |
| HTML/CSV/ZIP 与用户文本安全                          | `safe-text-output.test.ts`、`m2-package-boundaries.test.ts`                              |
| 删除仅在 IndexedDB、OPFS、临时数据核验为空后报告成功 | `deletion.test.ts`、`verified-deletion.spec.ts`、`no-ai-core.spec.ts`                    |
| 不支持浏览器能力时诚实降级                           | `material-management.spec.ts`（OPFS 缺失场景）                                           |
| 桌面/移动 Chromium、移动 WebKit 自动化               | Playwright 三项目配置；当前 WebKit 构建无 OPFS，相关用例按降级设计跳过并保留降级用例     |
| 根级 `pnpm verify`、禁止内容检查与 M2 威胁复查       | 见下方验证记录                                                                           |
| API 仍无用户业务数据持久化                           | `m2-package-boundaries.test.ts`、`apps/api`                                              |

## 3. 2026-07-31 本地验收记录

- `pnpm install --frozen-lockfile`：通过；
- `pnpm check:forbidden-content`：通过；
- `pnpm verify`：通过（lint、typecheck、150 项 Vitest、fixture 校验含 4 份二进制材料、全部构建、Playwright 61 项通过 / 8 项按设计跳过）；
- `git diff --check`：通过；
- 依赖与字体：`idb@8.0.3`、`@noble/hashes@2.2.0`、`pdf-lib@1.17.1`、`@pdf-lib/fontkit@1.1.1`、`fflate@0.8.3`、Noto Sans CJK SC 字体均记录于 `docs/development/m2-dependencies.md`。

## 4. 剩余产品风险（不做虚假承诺）

- 本地数据依赖设备与浏览器源隔离，不提供应用层静态加密；
- 导出包未加密，可能包含敏感信息；
- 真实手机上的大图导入性能与国产浏览器兼容性仍需 M4 人工发布检查；
- 当前 Playwright WebKit 构建不支持 OPFS，完整材料流程仅在 Chromium 项目自动化覆盖。
