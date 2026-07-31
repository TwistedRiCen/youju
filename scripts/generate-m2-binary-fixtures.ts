import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { deflateSync } from 'node:zlib'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument } from 'pdf-lib'

const CASE_DIR = resolve('fixtures/ecommerce-refund/case-001-transport-damage')
const BINARY_DIR = join(CASE_DIR, 'binary')
const FONT_PATH = resolve('apps/web/src/assets/fonts/NotoSansCJKsc-Regular.otf')

const CRC_TABLE = new Uint32Array(256)
for (let index = 0; index < 256; index += 1) {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  CRC_TABLE[index] = value >>> 0
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const length = new Uint8Array(4)
  new DataView(length.buffer).setUint32(0, data.length)
  const typeBytes = new TextEncoder().encode(type)
  const crcInput = concat([typeBytes, data])
  const crc = new Uint8Array(4)
  new DataView(crc.buffer).setUint32(0, crc32(crcInput))
  return concat([length, typeBytes, data, crc])
}

function buildPng(
  width: number,
  height: number,
  pixel: readonly [number, number, number],
  title: string,
): Uint8Array {
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  ihdr[8] = 8
  ihdr[9] = 2
  const scanlineLength = 1 + width * 3
  const raw = new Uint8Array(scanlineLength * height)
  for (let y = 0; y < height; y += 1) {
    const row = y * scanlineLength
    raw[row] = 0
    for (let x = 0; x < width; x += 1) {
      const offset = row + 1 + x * 3
      raw[offset] = pixel[0]
      raw[offset + 1] = pixel[1]
      raw[offset + 2] = pixel[2]
    }
  }
  const text = new TextEncoder().encode(`Software\0YouJu M2 fixture ${title}`)
  return concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('tEXt', text),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', new Uint8Array(0)),
  ])
}

async function buildPdf(title: string, lines: readonly string[]): Promise<Uint8Array> {
  const fontBytes = await readFile(FONT_PATH)
  const document = await PDFDocument.create()
  document.registerFontkit(fontkit)
  const font = await document.embedFont(fontBytes, { subset: true })
  document.setTitle(title)
  document.setCreator('YouJu Fixture Generator')
  document.setProducer('YouJu Fixture Generator')
  const fixed = new Date('2026-07-29T00:00:00.000Z')
  document.setCreationDate(fixed)
  document.setModificationDate(fixed)
  const page = document.addPage([595.28, 841.89])
  let y = 791
  for (const line of lines) {
    page.drawText(line, { x: 50, y, size: 10, font })
    y -= 16
  }
  return document.save()
}

async function writeFixture(
  relativePath: string,
  bytes: Uint8Array,
): Promise<void> {
  const target = resolve(BINARY_DIR, relativePath)
  const expectedRoot = resolve(BINARY_DIR)
  if (!target.startsWith(expectedRoot) || isAbsolute(relativePath)) {
    throw new Error('refusing to write outside the case binary directory')
  }
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, bytes)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  console.log(`${relativePath}\t${bytes.length}\t${sha256}`)
}

async function main(): Promise<void> {
  await writeFixture(
    '01-order-record.png',
    buildPng(16, 16, [52, 94, 76], 'order record'),
  )
  await writeFixture(
    '02-payment-record.pdf',
    await buildPdf('示例商城支付凭证（虚构）', [
      '平台：示例商城',
      '商家：晴川生活示例店',
      '商品：便携折叠桌（虚构商品）',
      '实付金额：899.00 元',
      '订单时间：2026-07-01 12:16',
    ]),
  )
  await writeFixture(
    '03-product-issue.png',
    buildPng(16, 16, [160, 59, 30], 'product issue'),
  )
  await writeFixture(
    '04-merchant-communication.pdf',
    await buildPdf('商家沟通记录（虚构）', [
      '用户：商品外箱凹陷，桌板边角开裂，申请退货退款。',
      '商家：破损由用户使用造成，拒绝退货退款。',
      '用户：已申请平台介入。',
    ]),
  )
}

void main()
