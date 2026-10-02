import { useState, useEffect, useRef, useCallback } from 'react'

export interface UsePollingOptions<T> {
  intervalMs?: number
  enabled?: boolean
  immediate?: boolean
  onError?: (error: Error) => void
  onSuccess?: (data: T) => void
}

export interface UsePollingResult<T> {
  data: T | null
  error: Error | null
  isLoading: boolean
  isRefreshing: boolean
  lastUpdated: Date | null
  refresh: () => Promise<void>
}

/**
 * Safe, robust polling hook.
 * - Prevents overlapping/concurrent requests if execution time > interval.
 * - Cleans up intervals and handles component unmount safely.
 * - Provides manual refresh, error recovery, and loading states.
 */
export function usePolling<T>(
  fetchFn: () => Promise<T>,
  options: UsePollingOptions<T> = {}
): UsePollingResult<T> {
  const {
    intervalMs = 2500,
    enabled = true,
    immediate = true,
    onError,
    onSuccess,
  } = options

  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(immediate && enabled)
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const isMountedRef = useRef(true)
  const isFetchingRef = useRef(false)
  const fetchFnRef = useRef(fetchFn)
  const onErrorRef = useRef(onError)
  const onSuccessRef = useRef(onSuccess)

  // Keep refs up-to-date to avoid unnecessary interval restarts
  useEffect(() => {
    fetchFnRef.current = fetchFn
    onErrorRef.current = onError
    onSuccessRef.current = onSuccess
  })

  const executeFetch = useCallback(async (isInitial = false) => {
    if (isFetchingRef.current || !isMountedRef.current) return
    isFetchingRef.current = true

    if (isInitial) {
      setIsLoading(true)
    } else {
      setIsRefreshing(true)
    }

    try {
      const result = await fetchFnRef.current()
      if (isMountedRef.current) {
        setData(result)
        setError(null)
        setLastUpdated(new Date())
        onSuccessRef.current?.(result)
      }
    } catch (err) {
      if (isMountedRef.current) {
        const errorObj = err instanceof Error ? err : new Error(String(err))
        setError(errorObj)
        onErrorRef.current?.(errorObj)
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false)
        setIsRefreshing(false)
      }
      isFetchingRef.current = false
    }
  }, [])

  useEffect(() => {
    isMountedRef.current = true

    if (!enabled) {
      return
    }

    const startPolling = async () => {
      if (immediate) {
        await executeFetch(true)
      }
    }

    void startPolling()

    const timer = setInterval(() => {
      void executeFetch(false)
    }, intervalMs)

    return () => {
      isMountedRef.current = false
      clearInterval(timer)
    }
  }, [enabled, immediate, intervalMs, executeFetch])

  const refresh = useCallback(async () => {
    await executeFetch(false)
  }, [executeFetch])

  return {
    data,
    error,
    isLoading: enabled ? isLoading : false,
    isRefreshing,
    lastUpdated,
    refresh,
  }
}
