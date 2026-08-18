export interface OriginPolicyRequest {
  readonly protocol: string
  readonly headers: {
    readonly origin?: string | string[] | undefined
    readonly 'sec-fetch-site'?: string | string[] | undefined
    readonly host?: string | string[] | undefined
  }
}

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0]
  }
  return value
}

/**
 * Decides whether a browser request to the AI relay is same-origin.
 *
 * Cross-site fetch metadata rejects outright; otherwise an Origin header
 * must parse as a URL whose origin matches the request's own origin.
 * Non-browser clients that send no Origin header remain allowed so the
 * controlled inject-based tests and local tooling keep working.
 */
export function isSameOriginAiRequest(request: OriginPolicyRequest): boolean {
  if (first(request.headers['sec-fetch-site']) === 'cross-site') {
    return false
  }
  const origin = first(request.headers.origin)
  if (origin === undefined) {
    return true
  }
  const host = first(request.headers.host)
  if (host === undefined) {
    return false
  }
  try {
    const expected = new URL(`${request.protocol}://${host}`)
    return new URL(origin).origin === expected.origin
  } catch {
    return false
  }
}
