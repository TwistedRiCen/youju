import { unzipSync } from 'fflate'
import { expect, test } from '@playwright/test'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const warning = '完全虚构演示数据，请勿作为真实材料提交'

async function extractPageText(bytes: Uint8Array): Promise<readonly string[]> {
  const loadingTask = getDocument({
    data: bytes,
    disableAutoFetch: true,
    disableFontFace: true,
    disableRange: true,
    disableStream: true,
    useSystemFonts: false,
    useWorkerFetch: false,
  })
  const document = await loadingTask.promise
  try {
    const pages: string[] = []
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const text = await page.getTextContent()
      pages.push(
        text.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(''),
      )
    }
    return pages
  } finally {
    await loadingTask.destroy()
  }
}

test('exports the public fixture with unmistakable demo markers', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', '此 WebKit 构建不支持 OPFS')

  await page.goto('/')
  const exported = await page.evaluate(async () => {
    const demoModuleUrl = '/src/demo/index.ts'
    const demo = (await import(demoModuleUrl)) as {
      loadDemoCase(fixtureId: string): Promise<{ status: string; caseId: string }>
    }
    const exportModuleUrl = '/src/services/export-service.ts'
    const exportService = (await import(exportModuleUrl)) as {
      prepareExportBundle(caseId: string): Promise<{
        fileName: string
        blob: Blob
        cleanup(): Promise<void>
      }>
    }

    const loaded = await demo.loadDemoCase('m4-ecommerce-refund-demo-v1')
    const bundle = await exportService.prepareExportBundle(loaded.caseId)
    try {
      return {
        fileName: bundle.fileName,
        bytes: Array.from(new Uint8Array(await bundle.blob.arrayBuffer())),
      }
    } finally {
      await bundle.cleanup()
    }
  })

  expect(exported.fileName).toMatch(/^DEMO-有据_事件材料包_\d{8}_\d{4}\.zip$/)
  const directory = exported.fileName.slice(0, -4)
  const archive = unzipSync(new Uint8Array(exported.bytes))
  const entryNames = Object.keys(archive)
  expect(entryNames).toContain(`${directory}/DEMO-README.txt`)
  expect(entryNames.every((name) => name.startsWith(`${directory}/`))).toBe(true)

  const decode = (name: string): string => new TextDecoder().decode(archive[name])
  expect(decode(`${directory}/DEMO-README.txt`)).toContain(warning)
  expect(decode(`${directory}/04_材料摘要校验表.csv`)).toContain(
    '附件相对路径,大小,媒体类型,SHA-256,数据性质',
  )
  expect(decode(`${directory}/04_材料摘要校验表.csv`)).toContain('完全虚构演示数据')
  expect(decode(`${directory}/05_附件索引.html`)).toContain(warning)
  expect(entryNames).toEqual(
    expect.arrayContaining([
      `${directory}/01_事件说明.pdf`,
      `${directory}/02_事件时间线.pdf`,
      `${directory}/03_证据材料清单.pdf`,
    ]),
  )
  for (const name of [
    `${directory}/01_事件说明.pdf`,
    `${directory}/02_事件时间线.pdf`,
    `${directory}/03_证据材料清单.pdf`,
  ]) {
    const pages = await extractPageText(archive[name]!)
    expect(pages.length).toBeGreaterThan(0)
    expect(pages.every((text) => text.includes(warning))).toBe(true)
  }
  expect(entryNames.filter((name) => name.includes('/06_原始材料/'))).toHaveLength(4)
})
