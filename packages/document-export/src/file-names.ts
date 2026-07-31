export function sanitizeFileName(raw: string): string {
  const cleaned = raw
    .replace(/[^0-9A-Za-z\u4e00-\u9fff._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+/, '')
    .replace(/\.{2,}/g, '.')
    .trim()
  return cleaned === '' ? 'file' : cleaned
}

export function uniqueAttachmentNames(names: readonly string[]): readonly string[] {
  const counts = new Map<string, number>()
  const result: string[] = []
  for (const name of names) {
    const sanitized = sanitizeFileName(name)
    const seen = counts.get(sanitized) ?? 0
    counts.set(sanitized, seen + 1)
    if (seen === 0) {
      result.push(sanitized)
      continue
    }
    const dotIndex = sanitized.lastIndexOf('.')
    const base = dotIndex === -1 ? sanitized : sanitized.slice(0, dotIndex)
    const extension = dotIndex === -1 ? '' : sanitized.slice(dotIndex)
    result.push(`${base}-${seen + 1}${extension}`)
  }
  return result
}

export function isSafeZipEntryName(name: string): boolean {
  if (name.length === 0 || name.startsWith('/') || /^[A-Za-z]:/.test(name)) {
    return false
  }
  if (name.includes('\\')) {
    return false
  }
  if ([...name].some((char) => char.charCodeAt(0) < 32)) {
    return false
  }
  return name.split('/').every((segment) => segment !== '..' && segment !== '.')
}
