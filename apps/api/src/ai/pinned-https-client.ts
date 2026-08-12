import { request as httpsRequest } from 'node:https'
import type { LookupAddress, LookupOneOptions, LookupAllOptions } from 'node:dns'
import type { DnsResolver, TargetInput } from './target-policy.js'
import { resolveAllowedTarget } from './target-policy.js'

export interface PinnedHttpsResponse {
  readonly statusCode: number
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>
  readonly body: Uint8Array
}

export interface PinnedHttpsRequestOptions {
  readonly address: string
  readonly family: 4 | 6
  readonly servername: string
  readonly port: 443
  readonly path: string
  readonly method: 'POST'
  readonly rejectUnauthorized: true
  readonly headers: Readonly<Record<string, string>>
  readonly signal: AbortSignal
}

export interface HttpsConnector {
  request(options: PinnedHttpsRequestOptions, body: Uint8Array): Promise<PinnedHttpsResponse>
}

export interface PinnedHttpsClientOptions {
  readonly target: TargetInput
  readonly resolver: DnsResolver
  readonly connector?: HttpsConnector
  readonly maxResponseBytes?: number
}

export interface PinnedHttpsClient {
  post(input: {
    readonly apiKey: string
    readonly body: Uint8Array
    readonly signal: AbortSignal
  }): Promise<PinnedHttpsResponse>
}

const DEFAULT_MAX_RESPONSE_BYTES = 8 * 1024 * 1024

function isRedirect(statusCode: number): boolean {
  return statusCode >= 300 && statusCode < 400
}

function createNodeConnector(maxResponseBytes: number): HttpsConnector {
  return {
    request(options, body) {
      return new Promise((resolve, reject) => {
        const lookup = (
          _hostname: string,
          lookupOptions: LookupOneOptions | LookupAllOptions,
          callback: (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
        ): void => {
          if (lookupOptions.all) {
            callback(null, [{ address: options.address, family: options.family }])
            return
          }
          callback(null, options.address, options.family)
        }
        const requestOptions = {
          hostname: options.address,
          port: options.port,
          path: options.path,
          method: options.method,
          servername: options.servername,
          family: options.family,
          rejectUnauthorized: options.rejectUnauthorized,
          agent: false,
          headers: options.headers,
          lookup,
        }
        const request = httpsRequest(requestOptions, (response) => {
          const chunks: Buffer[] = []
          let total = 0
          response.on('data', (chunk: Buffer) => {
            total += chunk.byteLength
            if (total > maxResponseBytes) {
              request.destroy(new Error('provider_response_too_large'))
              return
            }
            chunks.push(chunk)
          })
          response.on('end', () => {
            resolve({
              statusCode: response.statusCode ?? 0,
              headers: response.headers,
              body: new Uint8Array(Buffer.concat(chunks)),
            })
          })
          response.on('error', reject)
        })
        const abort = () => request.destroy(new Error('request_cancelled'))
        options.signal.addEventListener('abort', abort, { once: true })
        request.once('close', () => options.signal.removeEventListener('abort', abort))
        request.once('error', reject)
        request.end(body)
      })
    },
  }
}

export function createPinnedHttpsClient(options: PinnedHttpsClientOptions): PinnedHttpsClient {
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES
  const connector = options.connector ?? createNodeConnector(maxResponseBytes)

  return {
    async post(input) {
      const target = await resolveAllowedTarget(options.target, options.resolver)
      const address = target.addresses[0]
      if (address === undefined) {
        throw new Error('target_not_allowed')
      }
      const response = await connector.request({
        address: address.address,
        family: address.family,
        servername: target.hostname,
        port: target.port,
        path: target.path,
        method: 'POST',
        rejectUnauthorized: true,
        headers: {
          authorization: `Bearer ${input.apiKey}`,
          'content-type': 'application/json',
          'content-length': String(input.body.byteLength),
        },
        signal: input.signal,
      }, input.body)
      if (isRedirect(response.statusCode)) {
        throw new Error('target_not_allowed')
      }
      if (response.body.byteLength > maxResponseBytes) {
        throw new Error('provider_response_too_large')
      }
      return response
    },
  }
}
