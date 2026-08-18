# M4 发布检查清单

发布编号：`<生成后填写>`　完整 commit：`<生成后填写>`　构建时间（UTC）：`<生成后填写>`

每一行必须填写真实证据来源或明确标注「未执行」。自动化行已由 `pnpm verify` 与 `pnpm verify:release-candidate` 提供证据；设备、Provider、国内可达性与公开部署行在 Task 14/15 获得授权并执行前保持未勾选。

## 自动化证据

| 检查                                             | 自动化证据（文件/命令）                                                                                                   | 状态                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 根级门禁（lint/typecheck/测试/fixture/构建/E2E） | `pnpm verify`                                                                                                             | [x] 2026-08-18 全绿（vitest 全项目通过；e2e 130 通过/14 跳过，见 PLAN.md Verified Progress） |
| 生产候选门禁                                     | `pnpm verify:release-candidate`（build→release→预算→头→集成→生产 E2E）                                                    | [x] 2026-08-18 全绿（生产 E2E 6/6）                                                          |
| 首屏/应用壳预算                                  | `scripts/check-web-build-budget.ts`                                                                                       | [x] 首屏 125.7 KiB ≤ 500；应用壳 765.6 KiB ≤ 2048                                            |
| 无 AI 公开演示全流程                             | `tests/e2e/production-public-demo.spec.ts`                                                                                | [x] 生产头下加载/材料/导出 DEMO zip 读回/删除核验，无 /ai 请求                               |
| 缓存隐私                                         | `tests/e2e/production-cache-privacy.spec.ts`                                                                              | [x] 全部 Cache Storage 无 /ai、/health、用户数据、Key 标记、导出数据                         |
| 提示式更新与离线壳                               | `tests/e2e/pwa-offline-update.spec.ts`、`tests/e2e/production-release-update.spec.ts`                                     | [x] 无自动重载；确认后更新；本地数据保留、页面内存清空                                       |
| Web/API 发布配对                                 | `tests/e2e/production-public-demo.spec.ts`（配对测试）                                                                    | [x] `/health` releaseId === `/release.json` === `/about`                                     |
| 安全响应头与缓存规则                             | `scripts/check-production-headers.ts`、`tests/integration/security-headers.test.ts`                                       | [x] CSP/HSTS/COOP/CORP/PP + 缓存矩阵                                                         |
| 生产 API 边界                                    | `apps/api/tests/production-config.test.ts`、`request-origin-policy.test.ts`、`log-redaction.test.ts`、`ai-routes.test.ts` | [x] 受信 CIDR、跨站 403、日志白名单                                                          |
| 演示夹具与敏感内容                               | `pnpm validate:public-demo`、`pnpm check:forbidden-content`                                                               | [x] 见 PLAN.md Verified Progress（Task 3 记录与 2026-08-18 运行）                            |

## 设备矩阵（Task 14，待授权）

| 设备/浏览器                | 直接访问 | 演示 | 导入 | 刷新 | 导出 | 删除 | 安装/离线/更新 | 证据 |
| -------------------------- | -------- | ---- | ---- | ---- | ---- | ---- | -------------- | ---- |
| Windows Chrome/Edge        | [ ]      | [ ]  | [ ]  | [ ]  | [ ]  | [ ]  | [ ]            |      |
| Android Chrome             | [ ]      | [ ]  | [ ]  | [ ]  | [ ]  | [ ]  | [ ]            |      |
| 国内 Android 浏览器        | [ ]      | [ ]  | [ ]  | [ ]  | [ ]  | [ ]  | [ ]            |      |
| iOS Safari                 | [ ]      | [ ]  | [ ]  | [ ]  | [ ]  | [ ]  | [ ]            |      |
| 微信内置浏览器（仅可用性） | [ ]      | [ ]  | [ ]  | [ ]  | [ ]  | [ ]  | N/A            |      |

## Provider 核对（Task 14，待授权）

| Provider    | 模型 | 协议      | 日期 | 网络 | 结果 | 条款核对 | 状态       |
| ----------- | ---- | --------- | ---- | ---- | ---- | -------- | ---------- |
| OpenAI      |      | responses |      |      |      |          | [ ] 未验证 |
| 阿里云百炼  |      | chat      |      |      |      |          | [ ] 未验证 |
| DeepSeek    |      | chat      |      |      |      |          | [ ] 未验证 |
| SiliconFlow |      | chat      |      |      |      |          | [ ] 未验证 |

不可验证的 Provider 在 `/about` 保持「真实 Provider 尚未验证」的诚实标记。

## 国内可达性与部署（Task 15，待授权）

| 检查                                      | 状态 | 证据 |
| ----------------------------------------- | ---- | ---- |
| 普通国内网络 HTTPS 冒烟（第 7 节全项）    | [ ]  |      |
| 部署目标/域名/DNS/证书/备案前提确认       | [ ]  |      |
| 成对回滚演练并恢复发布                    | [ ]  |      |
| 生产日志抽查（无原始 IP/User-Agent/内容） | [ ]  |      |
| 公开地址与发布状态更新（README/roadmap）  | [ ]  |      |

## 结论

- [ ] 全部必选自动化证据与授权后的人工/部署证据齐备，M4 可声明验收。
- 未勾选项如实保留，不得以文档替代真实证据。
