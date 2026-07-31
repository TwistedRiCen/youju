import type { ExportSnapshot } from './export-model.js'
import type { EvidenceFile, TimePrecision } from '@youju/domain'

export interface PdfSection {
  readonly title: string
  readonly lines: readonly string[]
}

export interface SubmissionPdfSections {
  readonly statement: readonly PdfSection[]
  readonly timeline: readonly PdfSection[]
  readonly evidenceList: readonly PdfSection[]
}

const PRECISION_LABELS: Readonly<Record<TimePrecision, string>> = {
  minute: '精确到分钟',
  date: '精确到日期',
  approximate: '约略时间',
  unknown: '时间未知',
}

const BOUNDARY_LINES: readonly string[] = [
  '有据只帮助整理事实与材料，不提供法律咨询或法律结论。',
  '材料整理结果不保证退款、投诉或协商结果。',
  '文件摘要不等于司法鉴定或公证。',
  '请保存原始设备和原始文件。',
  '涉及重大权益时，请咨询专业机构。',
]

function evidenceNumberById(evidence: readonly EvidenceFile[]): ReadonlyMap<string, number> {
  const numbers = new Map<string, number>()
  evidence.forEach((item, index) => {
    numbers.set(item.id, index + 1)
  })
  return numbers
}

function sourceNumbers(sourceRefs: readonly { evidenceId: string }[], numbers: ReadonlyMap<string, number>): string {
  if (sourceRefs.length === 0) {
    return '无'
  }
  return sourceRefs
    .map((source) => numbers.get(source.evidenceId) ?? '?')
    .join('、')
}

export function buildPdfSections(snapshot: ExportSnapshot): SubmissionPdfSections {
  const numbers = evidenceNumberById(snapshot.evidence.map((item) => item.metadata))

  const factLine = (fieldName: string): string => {
    const fact = snapshot.confirmedFacts.find((item) => item.fieldName === fieldName)
    return fact === undefined ? `-` : `${fact.value}`
  }

  const statementSections: readonly PdfSection[] = [
    {
      title: '封面',
      lines: ['有据', '网购退款纠纷事件材料包', `事件：${snapshot.caseEvent.title}`],
    },
    { title: '使用边界', lines: BOUNDARY_LINES },
    {
      title: '事件基本信息',
      lines: [
        `事件标题：${snapshot.caseEvent.title}`,
        `购买时间：${factLine('purchase_time')}`,
        `商家名称：${factLine('merchant_name')}`,
        `商品名称：${factLine('product_name')}`,
        `实付金额：${factLine('paid_amount')}`,
        `问题描述：${factLine('problem_description')}`,
        `期望处理结果：${factLine('requested_resolution')}`,
      ],
    },
    { title: '事实陈述', lines: snapshot.statement.content.split('\n') },
    {
      title: '缺失材料提醒',
      lines:
        snapshot.findings.length === 0
          ? ['无缺失提醒。']
          : snapshot.findings.map((finding) => finding.message),
    },
    {
      title: '生成信息',
      lines: [`生成时间：${snapshot.generatedAt}`, `应用版本：${snapshot.appVersion}`],
    },
  ]

  const timelineSections: readonly PdfSection[] = [
    {
      title: '事件时间线',
      lines: snapshot.confirmedTimeline.map(
        (entry, index) =>
          `${String(index + 1).padStart(2, '0')}. ${entry.summary}（${PRECISION_LABELS[entry.timePrecision]}）来源：${sourceNumbers(entry.sourceRefs, numbers)}`,
      ),
    },
  ]

  const evidenceSections: readonly PdfSection[] = [
    {
      title: '证据材料清单',
      lines: snapshot.evidence.map((item) => {
        const metadata = item.metadata
        return `${String(numbers.get(metadata.id) ?? snapshot.evidence.length).padStart(3, '0')}. ${metadata.originalName}｜分类：${metadata.category}｜大小：${metadata.size} 字节｜导入时间：${metadata.importedAt}｜SHA-256：${metadata.sha256}`
      }),
    },
  ]

  return {
    statement: statementSections,
    timeline: timelineSections,
    evidenceList: evidenceSections,
  }
}
