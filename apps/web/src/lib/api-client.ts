import type { AppType } from '@floorplandesigner/api'
import { hc } from 'hono/client'

/**
 * Typed client for the backend. Requests go to the same origin; in development the Vite server
 * proxies /api to the backend.
 */
export const api = hc<AppType>('/').api

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** Builds an `ApiError` from a failed response, using the backend's `error` message if present. */
export async function toApiError(response: Response): Promise<ApiError> {
  let message = `Request failed with status ${response.status}`
  try {
    const body: unknown = await response.json()
    if (typeof body === 'object' && body !== null && 'error' in body) {
      message = String(body.error)
    }
  } catch {
    // The body was not JSON, for example when the backend is not running behind the proxy.
  }
  return new ApiError(response.status, message)
}

/**
 * What went wrong, in words fit to show. The backend's own message is used when it answered;
 * anything else means the request never got an answer.
 */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message
  return 'The server could not be reached. Check that it is running, then try again.'
}
