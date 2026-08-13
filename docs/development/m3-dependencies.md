# M3 新增依赖审查记录

## `pdfjs-dist@6.2.108`（Task 6）

| 项目     | 结论                                                                                                                                                                                                                                                           |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 用途     | 在浏览器内从本地 PDF `Blob` 渲染用户选中的页面，生成受限的内存 WebP 派生材料                                                                                                                                                                                   |
| 精确版本 | `pdfjs-dist@6.2.108`，由 `apps/web/package.json` 与 `pnpm-lock.yaml` 固定                                                                                                                                                                                      |
| 许可证   | Apache-2.0，随包提供 `LICENSE`                                                                                                                                                                                                                                 |
| 维护状态 | Mozilla PDF.js 的预构建发行包，版本与 Node.js 24 / 当前浏览器基线兼容                                                                                                                                                                                          |
| 采用理由 | 提供成熟的 PDF 页面解析与渲染能力，支持只读取内存 `Uint8Array`，避免自定义 PDF 解析器                                                                                                                                                                          |
| 替代方案 | 原生 Provider PDF 上传会发送原始材料；iframe/原生 PDF 查看器无法提供选页派生与边界控制；自定义解析器成本和安全风险过高                                                                                                                                         |
| 网络边界 | PDF.js worker 由 Vite 本地打包；不使用 CDN、远程字体、CMap、标准字体、WASM 或运行时网络资源                                                                                                                                                                    |
| 请求限制 | `getDocument()` 仅接收 `Uint8Array`，并设置 `disableAutoFetch`、`disableRange`、`disableStream`、`useWorkerFetch: false`、`enableXfa: false`、`disableFontFace: true`、`useSystemFonts: false`；渲染路径不执行 PDF JavaScript；不传入 URL、凭据或 HTTP headers |
| 数据边界 | 派生字节只保存在当前调用的浏览器内存；不写入 EvidenceBlobStore、IndexedDB、Cache Storage 或下载文件                                                                                                                                                            |
