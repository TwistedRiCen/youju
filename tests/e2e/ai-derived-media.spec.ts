import { PDFDocument, rgb } from 'pdf-lib'
import { expect, test } from '@playwright/test'
import type * as AiModule from '../../apps/web/src/ai/index.js'

async function createFourPagePdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  for (let pageNumber = 1; pageNumber <= 4; pageNumber += 1) {
    const page = document.addPage([420, 300])
    page.drawRectangle({
      x: 24 + pageNumber * 8,
      y: 120,
      width: 140,
      height: 48,
      color: rgb(0.1, 0.2, 0.3),
    })
  }
  return document.save()
}

test('derives bounded image bytes, renders selected PDF pages, and performs no external fetch', async ({
  page,
  baseURL,
}) => {
  const requests: string[] = []
  page.on('request', (request) => requests.push(request.url()))

  await page.goto('/')
  const pdfBytes = Array.from(await createFourPagePdf())
  const result = await page.evaluate(async (payload) => {
    const module = (await import('/src/ai/index.ts')) as typeof AiModule
    const canvas = document.createElement('canvas')
    canvas.width = 4000
    canvas.height = 3000
    const context = canvas.getContext('2d')
    if (context === null) {
      throw new Error('canvas_context_unavailable')
    }
    context.fillStyle = '#173f35'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#f4f1ea'
    context.font = '160px sans-serif'
    context.fillText('Fictional evidence', 180, 420)
    const imageBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob === null ? reject(new Error('image_encode_failed')) : resolve(blob)), 'image/png')
    })

    const image = await module.deriveImagePage({
      evidenceId: payload.evidenceId,
      source: imageBlob,
      page: 1,
      signal: new AbortController().signal,
      sourceToken: payload.imageToken,
    })
    const pages = await module.renderPdfPages({
      evidenceId: payload.evidenceId,
      source: new Blob([Uint8Array.from(payload.pdfBytes)], { type: 'application/pdf' }),
      pages: [4, 2],
      signal: new AbortController().signal,
      sourceTokenFactory: (() => {
        let index = 0
        return () => payload.pdfTokens[index++] ?? payload.imageToken
      })(),
    })
    const manifest = module.buildInputManifest({
      taskId: payload.taskId,
      caseId: payload.caseId,
      title: 'Fictional case',
      taskType: 'extract_facts',
      providerPreset: 'openai',
      protocol: 'responses',
      baseUrlFingerprint: 'sha256:provider.example',
      modelName: 'fictional-model',
      selections: [
        { evidenceId: payload.evidenceId, originalName: 'image.png', pages: [image] },
        { evidenceId: payload.evidenceId, originalName: 'document.pdf', pages },
      ],
    })
    const output = {
      image: {
        mediaType: image.mediaType,
        width: image.width,
        height: image.height,
        byteSize: image.bytes.byteLength,
        sha256: image.sha256,
        calculatedSha256: Array.from(
          new Uint8Array(await crypto.subtle.digest('SHA-256', image.bytes as unknown as BufferSource)),
        ).map((byte) => byte.toString(16).padStart(2, '0')).join(''),
      },
      pages: pages.map((item) => item.page),
      manifestPages: manifest.items.map((item) => item.page),
      manifestTokens: manifest.items.map((item) => item.sourceToken),
      manifestBytes: manifest.totalDerivedBytes,
    }
    module.releaseDerivedMedia([image, ...pages])
    return output
  }, {
    evidenceId: '00000000-0000-4000-8000-000000000101',
    caseId: '00000000-0000-4000-8000-000000000001',
    taskId: '00000000-0000-4000-8000-000000000301',
    imageToken: '00000000-0000-4000-8000-000000000201',
    pdfTokens: [
      '00000000-0000-4000-8000-000000000202',
      '00000000-0000-4000-8000-000000000203',
    ],
      pdfBytes,
  })

  expect(result.image.mediaType).toBe('image/webp')
  expect(Math.max(result.image.width, result.image.height)).toBeLessThanOrEqual(2048)
  expect(result.image.width * result.image.height).toBeLessThanOrEqual(4_000_000)
  expect(result.image.byteSize).toBeLessThanOrEqual(2 * 1024 * 1024)
  expect(result.image.sha256).toMatch(/^[0-9a-f]{64}$/)
  expect(result.image.sha256).toBe(result.image.calculatedSha256)
  expect(result.pages).toEqual([2, 4])
  expect(result.manifestPages).toEqual([1, 2, 4])
  expect(result.manifestTokens).toEqual([
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000203',
  ])
  expect(result.manifestBytes).toBeGreaterThan(0)
  expect(requests.filter((url) => !url.startsWith(baseURL ?? ''))).toEqual([])
})
