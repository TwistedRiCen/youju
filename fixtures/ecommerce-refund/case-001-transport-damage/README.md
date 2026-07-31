# 黄金案例 001：运输破损退款纠纷

本目录仅包含完全虚构的 JSON、文本与合成二进制材料，用于验证领域、规则和 AI 输出契约。

- 平台、店铺、商品和事件均为虚构内容。
- 不包含真实姓名、手机号、地址、订单号、支付记录或聊天记录。
- `evidence` 目录中的记录是合成文本表示。
- `expected/facts.json` 同时保存用户确认后的正式事实和人工预期 AI 候选输出，两者保持明确分离。

## 二进制材料

`binary/` 目录包含四份完全虚构的二进制材料，由 `scripts/generate-m2-binary-fixtures.ts` 确定性生成（固定像素、固定元数据日期、本地 Noto 字体子集），不包含任何真实品牌、姓名、手机号、地址、订单或聊天记录：

- `01-order-record.png`（订单信息）
- `02-payment-record.pdf`（支付凭证）
- `03-product-issue.png`（商品问题照片）
- `04-merchant-communication.pdf`（商家沟通记录）

尺寸与 SHA-256 记录在 `manifest.json` 的 `binaryEvidence` 中，`pnpm validate:fixtures` 会逐一核验。
