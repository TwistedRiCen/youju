import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, rgb } from 'pdf-lib'
import type { PDFFont } from 'pdf-lib'
import type { ExportSnapshot } from './export-model.js'
import { buildPdfSections } from './pdf-sections.js'
import type { PdfSection } from './pdf-sections.js'

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 50
const BODY_SIZE = 10
const TITLE_SIZE = 14
const LINE_GAP = 4

function wrapLines(font: PDFFont, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  let current = ''
  for (const char of text) {
    const candidate = current + char
    if (current === '' || font.widthOfTextAtSize(candidate, BODY_SIZE) <= maxWidth) {
      current = candidate
    } else {
      lines.push(current)
      current = char
    }
  }
  if (current !== '') {
    lines.push(current)
  }
  return lines
}

async function renderPdf(
  title: string,
  sections: readonly PdfSection[],
  fontBytes: Uint8Array,
  generatedAt: string,
): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  document.registerFontkit(fontkit)
  const font = await document.embedFont(fontBytes, { subset: true })
  document.setTitle(title)
  document.setCreator('YouJu')
  document.setProducer('YouJu')
  document.setCreationDate(new Date(generatedAt))
  document.setModificationDate(new Date(generatedAt))

  let page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = PAGE_HEIGHT - MARGIN
  const maxWidth = PAGE_WIDTH - MARGIN * 2
  const dark = rgb(0.09, 0.2, 0.16)

  const ensureSpace = (needed: number): void => {
    if (y - needed < MARGIN) {
      page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      y = PAGE_HEIGHT - MARGIN
    }
  }

  for (const section of sections) {
    ensureSpace(TITLE_SIZE + 8)
    page.drawText(section.title, {
      x: MARGIN,
      y,
      size: TITLE_SIZE,
      font,
      color: dark,
    })
    y -= TITLE_SIZE + 8
    for (const rawLine of section.lines) {
      for (const line of wrapLines(font, rawLine, maxWidth)) {
        ensureSpace(BODY_SIZE)
        page.drawText(line, { x: MARGIN, y, size: BODY_SIZE, font, color: rgb(0, 0, 0) })
        y -= BODY_SIZE + LINE_GAP
      }
    }
    y -= 8
  }

  return document.save()
}

export interface SubmissionPdfs {
  readonly statement: Uint8Array
  readonly timeline: Uint8Array
  readonly evidenceList: Uint8Array
}

export async function renderSubmissionPdfs(
  snapshot: ExportSnapshot,
  fontBytes: Uint8Array,
): Promise<SubmissionPdfs> {
  const sections = buildPdfSections(snapshot)
  return {
    statement: await renderPdf('有据事件说明', sections.statement, fontBytes, snapshot.generatedAt),
    timeline: await renderPdf('有据事件时间线', sections.timeline, fontBytes, snapshot.generatedAt),
    evidenceList: await renderPdf('有据证据材料清单', sections.evidenceList, fontBytes, snapshot.generatedAt),
  }
}
