export class ApiError extends Error {
  status: number
  statusText: string
  details?: unknown

  constructor(message: string, status = 500, statusText = 'Internal Server Error', details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.statusText = statusText
    this.details = details
  }
}

export function formatErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return `[${error.status}] ${error.message}`
  }
  if (error instanceof Error) {
    return error.message
  }
  return String(error ?? 'An unexpected error occurred')
}
