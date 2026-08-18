import { describe, expect, it } from 'vitest'
import {
  buildAttachmentIndexHtml,
  buildDigestCsv,
  escapeCsvCell,
  escapeHtml,
  isSafeZipEntryName,
  sanitizeFileName,
  uniqueAttachmentNames,
} from '../src/index.js'

describe('CSV output safety', () => {
  it('neutralizes spreadsheet formula prefixes and quotes delimiters', () => {
    expect(escapeCsvCell('=SUM(A1)')).toBe("'=SUM(A1)")
    expect(escapeCsvCell('+123')).toBe("'+123")
    expect(escapeCsvCell('-1')).toBe("'-1")
    expect(escapeCsvCell('@cmd')).toBe("'@cmd")
    expect(escapeCsvCell('a,b')).toBe('"a,b"')
    expect(escapeCsvCell('plain')).toBe('plain')
  })

  it('builds a UTF-8 BOM digest CSV with escaped cells', () => {
    const csv = buildDigestCsv([
      {
        relativePath: '=订单.png',
        size: 16,
        mediaType: 'image/png',
        sha256: 'a'.repeat(64),
      },
    ])

    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('附件相对路径,大小,媒体类型,SHA-256,数据性质')
    expect(csv).toContain('用户事件')
    expect(csv).toContain("'=订单.png")
  })
})

describe('HTML output safety', () => {
  it('escapes script tags, quotes and ampersands', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    )
    expect(escapeHtml('"&')).toBe('&quot;&amp;')
    expect(escapeHtml("'")).toBe('&#39;')
  })

  it('generates an inert offline HTML document', () => {
    const html = buildAttachmentIndexHtml([
      {
        fileName: '<订单>.png',
        path: '06_原始材料/<订单>.png',
        size: 16,
        sha256: 'a'.repeat(64),
      },
    ])

    expect(html).toContain('lang="zh-CN"')
    expect(html).not.toContain('<script')
    expect(html).not.toMatch(/on(click|load|error)\s*=/i)
    expect(html).not.toContain('http://')
    expect(html).not.toContain('https://')
    expect(html).not.toContain('<form')
    expect(html).toContain('&lt;订单&gt;.png')
  })

  it('marks demo HTML in its title, heading, and body', () => {
    const html = buildAttachmentIndexHtml([], 'fictional_demo')

    expect(html.match(/完全虚构演示数据，请勿作为真实材料提交/g)).toHaveLength(3)
    expect(html).not.toContain('<script')
  })
})

describe('file naming safety', () => {
  it('sanitizes traversal-prone file names', () => {
    const name = sanitizeFileName('../订单:<记录>.png')

    expect(name).toBe('订单-记录-.png')
    expect(name).not.toContain('..')
    expect(name).not.toContain('/')
    expect(name).not.toContain('\\')
    expect(name).not.toContain('<')
  })

  it('gives duplicate sanitized names deterministic numeric suffixes', () => {
    expect(uniqueAttachmentNames(['a.png', 'a.png', 'b.pdf', 'a.png'])).toEqual([
      'a.png',
      'a-2.png',
      'b.pdf',
      'a-3.png',
    ])
  })

  it('rejects unsafe zip entry names', () => {
    expect(isSafeZipEntryName('C:/absolute/file.png')).toBe(false)
    expect(isSafeZipEntryName('/absolute/file.png')).toBe(false)
    expect(isSafeZipEntryName('dir\\backslash.png')).toBe(false)
    expect(isSafeZipEntryName('dir/a/../b.png')).toBe(false)
    expect(isSafeZipEntryName('dir/\u0000.png')).toBe(false)
    expect(isSafeZipEntryName('06_原始材料/订单.png')).toBe(true)
  })
})
