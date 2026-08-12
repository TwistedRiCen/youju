import { getDocument, GlobalWorkerOptions, version } from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api.js'
import type { UuidV4 } from '@youju/domain'
import { deriveImagePage, type DerivedMedia } from './derived-media.js'

GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

function checkAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError')
  }
}

async function renderPage(
  document: PDFDocumentProxy,
  evidenceId: UuidV4,
  pageNumber: number,
  signal: AbortSignal,
  sourceToken: UuidV4,
): Promise<DerivedMedia> {
  checkAborted(signal)
  const page = await document.getPage(pageNumber)
  checkAborted(signal)
  const viewport = page.getViewport({ scale: 1 })
  const canvas = window.document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(viewport.width))
  canvas.height = Math.max(1, Math.ceil(viewport.height))
  const context = canvas.getContext('2d')
  if (context === null) {
    throw new Error('canvas_context_unavailable')
  }
  await page.render({ canvas, canvasContext: context, viewport }).promise
  checkAborted(signal)
  const source = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) {
        reject(new Error('pdf_page_encode_failed'))
        return
      }
      resolve(blob)
    }, 'image/png')
  })
  return deriveImagePage({
    evidenceId,
    source,
    page: pageNumber,
    signal,
    sourceToken,
  })
}

export async function renderPdfPages(input: {
  readonly evidenceId: UuidV4
  readonly source: Blob
  readonly pages: readonly number[]
  readonly signal: AbortSignal
  readonly sourceTokenFactory: () => UuidV4
}): Promise<readonly DerivedMedia[]> {
  checkAborted(input.signal)
  const data = new Uint8Array(await input.source.arrayBuffer())
  checkAborted(input.signal)
  const loadingTask = getDocument({
    data,
    disableAutoFetch: true,
    disableRange: true,
    disableStream: true,
    enableXfa: false,
    isImageDecoderSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    useWorkerFetch: false,
  })
  let document: PDFDocumentProxy
  try {
    document = await loadingTask.promise
    checkAborted(input.signal)
  } catch (error) {
    await loadingTask.destroy()
    throw error
  }
  const rendered: DerivedMedia[] = []
  try {
    const pages = [...new Set(input.pages)].sort((left, right) => left - right)
    for (const pageNumber of pages) {
      if (pageNumber < 1 || pageNumber > document.numPages) {
        throw new Error('pdf_page_out_of_range')
      }
      rendered.push(
        await renderPage(
          document,
          input.evidenceId,
          pageNumber,
          input.signal,
          input.sourceTokenFactory(),
        ),
      )
    }
    return rendered
  } catch (error) {
    for (const item of rendered) {
      URL.revokeObjectURL(item.previewUrl)
      item.bytes.fill(0)
    }
    throw error
  } finally {
    await loadingTask.destroy()
  }
}

export { version as pdfJsVersion }
