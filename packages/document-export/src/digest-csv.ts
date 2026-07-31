export function escapeCsvCell(value: string): string {
  let cell = value
  if (/^[=+\-@]/.test(cell)) {
    cell = `'${cell}`
  }
  if (/[",\r\n]/.test(cell)) {
    cell = `"${cell.replace(/"/g, '""')}"`
  }
  return cell
}

export interface DigestCsvRow {
  readonly relativePath: string
  readonly size: number
  readonly mediaType: string
  readonly sha256: string
}

export function buildDigestCsv(rows: readonly DigestCsvRow[]): string {
  const header = ['附件相对路径', '大小', '媒体类型', 'SHA-256']
  const lines = [
    header.map(escapeCsvCell).join(','),
    ...rows.map((row) =>
      [row.relativePath, String(row.size), row.mediaType, row.sha256]
        .map(escapeCsvCell)
        .join(','),
    ),
  ]
  return `\uFEFF${lines.join('\r\n')}\r\n`
}
