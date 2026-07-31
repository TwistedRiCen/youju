import { sha256Blob } from '@youju/evidence-hash'
import { OpfsEvidenceBlobStore } from '@youju/evidence-store'
import type { EvidenceBlobStore } from '@youju/evidence-store'
import type { EvidenceCategory, EvidenceFile, UuidV4 } from '@youju/domain'
import { EvidenceImportError } from '../evidence/evidence-errors.js'
import type { EvidenceImportErrorCode } from '../evidence/evidence-errors.js'
import { importEvidence } from './evidence-import-service.js'
import { getCaseRepository } from './case-service.js'

export const EVIDENCE_CATEGORY_LABELS: Readonly<Record<EvidenceCategory, string>> = {
  order_record: '订单信息',
  payment_record: '支付凭证',
  product_description: '商品宣传或详情页',
  product_issue_photo: '商品问题照片',
  merchant_communication: '商家沟通记录',
  after_sales_record: '退款或售后记录',
  logistics_record: '物流与快递信息',
  invoice_or_contract: '发票或合同',
  user_statement: '用户补充说明',
  other: '其他材料',
}

let blobStore: EvidenceBlobStore | null = null

export function getEvidenceBlobStore(): EvidenceBlobStore {
  if (blobStore === null) {
    blobStore = new OpfsEvidenceBlobStore()
  }
  return blobStore
}

export interface FileImportOutcome {
  readonly fileName: string
  readonly outcome: 'imported' | 'duplicate' | 'rejected'
  readonly evidenceId?: UuidV4
  readonly errorCode?: EvidenceImportErrorCode
}

export async function importEvidenceFiles(
  caseId: UuidV4,
  files: readonly File[],
  category: EvidenceCategory,
): Promise<readonly FileImportOutcome[]> {
  const repository = await getCaseRepository()
  const outcomes: FileImportOutcome[] = []

  for (const file of files) {
    const current = await repository.listEvidence(caseId)
    const currentTotalBytes = current.reduce((sum, item) => sum + item.size, 0)
    try {
      const result = await importEvidence(
        {
          caseId,
          evidenceId: crypto.randomUUID(),
          operationId: crypto.randomUUID(),
          file,
          category,
          importedAt: new Date().toISOString(),
          limits: {
            currentFileCount: current.length,
            currentTotalBytes,
            remainingQuotaBytes: null,
          },
        },
        {
          repository,
          blobStore: getEvidenceBlobStore(),
          hashBlob: (blob) => sha256Blob(blob),
        },
      )
      if (result.status === 'duplicate') {
        outcomes.push({
          fileName: file.name,
          outcome: 'duplicate',
          evidenceId: result.existingEvidenceId,
        })
      } else {
        outcomes.push({
          fileName: file.name,
          outcome: 'imported',
          evidenceId: result.evidence.id,
        })
      }
    } catch (error) {
      outcomes.push({
        fileName: file.name,
        outcome: 'rejected',
        errorCode:
          error instanceof EvidenceImportError ? error.code : 'storage_unavailable',
      })
    }
  }

  return outcomes
}

export async function listCaseEvidence(caseId: UuidV4): Promise<readonly EvidenceFile[]> {
  const repository = await getCaseRepository()
  return repository.listEvidence(caseId)
}

export async function updateEvidenceCategory(
  caseId: UuidV4,
  evidenceId: UuidV4,
  category: EvidenceCategory,
): Promise<EvidenceFile> {
  const repository = await getCaseRepository()
  return repository.updateEvidenceCategory(caseId, evidenceId, category)
}
