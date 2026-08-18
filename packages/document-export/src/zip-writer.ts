import { Zip, ZipDeflate, ZipPassThrough } from 'fflate'
import type { EvidenceFile } from '@youju/domain'
import type { ExportSnapshot } from './export-model.js'
import { buildAttachmentIndexHtml } from './attachment-index.js'
import { buildDigestCsv } from './digest-csv.js'
import { uniqueAttachmentNames } from './file-names.js'
import { DEMO_EXPORT_WARNING, getDemoExportPolicy } from './export-model.js'

export interface ZipChunkSink {
  write(chunk: Uint8Array): Promise<void>
  close(): Promise<void>
  abort(): Promise<void>
}

export const ZIP_CHUNK_BOUND = 64 * 1024

export function buildPackageDirectoryName(
  generatedAt: string,
  dataOrigin: 'user_created' | 'fictional_demo' = 'user_created',
): string {
  const date = generatedAt.slice(0, 10).replace(/-/g, '')
  const time = generatedAt.slice(11, 16).replace(':', '')
  return `${dataOrigin === 'fictional_demo' ? 'DEMO-' : ''}有据_事件材料包_${date}_${time}`
}

export interface WriteSubmissionPackageInput {
  readonly snapshot: ExportSnapshot
  readonly pdfs: {
    readonly statement: Uint8Array
    readonly timeline: Uint8Array
    readonly evidenceList: Uint8Array
  }
  readonly openEvidence: (evidence: EvidenceFile) => Promise<Blob>
  readonly sink: ZipChunkSink
}

export async function writeSubmissionPackage(
  input: WriteSubmissionPackageInput,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const policy = getDemoExportPolicy(input.snapshot.caseEvent)
    const directory = buildPackageDirectoryName(
      input.snapshot.generatedAt,
      input.snapshot.caseEvent.dataOrigin,
    )
    const mtime = new Date(input.snapshot.generatedAt)
    let chain: Promise<void> = Promise.resolve()
    let finished = false

    const fail = (error: unknown): void => {
      if (finished) {
        return
      }
      finished = true
      const abortChain = chain
        .then(() => input.sink.abort())
        .catch(() => undefined)
      void abortChain.then(() => reject(error))
    }

    const zip = new Zip((error, chunk, final) => {
      if (error !== null) {
        fail(error)
        return
      }
      if (chunk !== undefined && chunk !== null) {
        chain = chain.then(() => input.sink.write(chunk))
      }
      if (final) {
        chain = chain
          .then(() => input.sink.close())
          .then(() => {
            finished = true
            resolve()
          }, fail)
      }
    })

    const addBytes = (path: string, bytes: Uint8Array): void => {
      const entry = new ZipPassThrough(path)
      entry.mtime = mtime
      zip.add(entry)
      entry.push(bytes, true)
    }
    const addText = (path: string, content: string): void => {
      const entry = new ZipDeflate(path, { level: 6 })
      entry.mtime = mtime
      zip.add(entry)
      entry.push(new TextEncoder().encode(content), true)
    }

    addBytes(`${directory}/01_事件说明.pdf`, input.pdfs.statement)
    addBytes(`${directory}/02_事件时间线.pdf`, input.pdfs.timeline)
    addBytes(`${directory}/03_证据材料清单.pdf`, input.pdfs.evidenceList)

    const names = uniqueAttachmentNames(
      input.snapshot.evidence.map((item) => item.metadata.originalName),
    )
    const digestRows = input.snapshot.evidence.map((item, index) => ({
      relativePath: `06_原始材料/${String(index + 1).padStart(3, '0')}_${names[index] ?? 'file'}`,
      size: item.metadata.size,
      mediaType: item.metadata.mediaType,
      sha256: item.metadata.sha256,
    }))
    addText(
      `${directory}/04_材料摘要校验表.csv`,
      buildDigestCsv(digestRows, input.snapshot.caseEvent.dataOrigin),
    )
    addText(
      `${directory}/05_附件索引.html`,
      buildAttachmentIndexHtml(
        digestRows.map((row) => ({
          fileName: row.relativePath.split('/').at(-1) ?? row.relativePath,
          path: row.relativePath,
          size: row.size,
          sha256: row.sha256,
        })),
        input.snapshot.caseEvent.dataOrigin,
      ),
    )
    if (policy.isDemo) {
      addText(
        `${directory}/DEMO-README.txt`,
        `${DEMO_EXPORT_WARNING}\n\n本材料包及其中全部材料均为完全虚构的公开演示内容。\n`,
      )
    }

    const writeAttachment = async (
      evidence: EvidenceFile,
      entryName: string,
    ): Promise<void> => {
      const entry = new ZipPassThrough(`${directory}/06_原始材料/${entryName}`)
      entry.mtime = mtime
      zip.add(entry)
      const blob = await input.openEvidence(evidence)
      let offset = 0
      while (offset < blob.size) {
        const end = Math.min(offset + ZIP_CHUNK_BOUND, blob.size)
        const bytes = new Uint8Array(await blob.slice(offset, end).arrayBuffer())
        entry.push(bytes, false)
        offset = end
      }
      entry.push(new Uint8Array(0), true)
    }

    const writeAllAttachments = async (): Promise<void> => {
      for (let index = 0; index < input.snapshot.evidence.length; index += 1) {
        const item = input.snapshot.evidence[index]
        if (item === undefined) {
          continue
        }
        const entryName = `${String(index + 1).padStart(3, '0')}_${names[index] ?? 'file'}`
        await writeAttachment(item.metadata, entryName)
      }
    }

    void writeAllAttachments().then(
      () => {
        zip.end()
      },
      (error: unknown) => {
        fail(error)
      },
    )
  })
}
