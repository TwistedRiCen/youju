export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface AttachmentIndexItem {
  readonly fileName: string
  readonly path: string
  readonly size: number
  readonly sha256: string
}

export function buildAttachmentIndexHtml(
  items: readonly AttachmentIndexItem[],
): string {
  const rows = items
    .map(
      (item) => `    <tr>
      <td>${escapeHtml(item.fileName)}</td>
      <td>${escapeHtml(item.path)}</td>
      <td>${item.size}</td>
      <td>${escapeHtml(item.sha256)}</td>
    </tr>`,
    )
    .join('\n')

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>材料包附件索引</title>
  </head>
  <body>
    <h1>材料包附件索引</h1>
    <p>本索引仅用于离线查看，不包含脚本或外部资源。</p>
    <table>
      <thead>
        <tr>
          <th>文件名</th>
          <th>相对路径</th>
          <th>大小（字节）</th>
          <th>SHA-256</th>
        </tr>
      </thead>
      <tbody>
${rows}
      </tbody>
    </table>
  </body>
</html>
`
}
