type CacheEntry<T> = {
  value: T
  expiresAt: number
}

const valueCache = new Map<string, CacheEntry<unknown>>()
const inflight = new Map<string, Promise<unknown>>()

const now = () => Date.now()

const getCached = <T>(key: string): T | null => {
  const hit = valueCache.get(key)
  if (!hit) return null
  if (hit.expiresAt <= now()) {
    valueCache.delete(key)
    return null
  }
  return hit.value as T
}

export const setCached = <T>(key: string, value: T, ttlMs: number) => {
  valueCache.set(key, { value, expiresAt: now() + Math.max(1, ttlMs) })
}

export const deleteCached = (key: string) => {
  valueCache.delete(key)
  inflight.delete(key)
}

export const deleteCachedByPrefix = (prefix: string) => {
  for (const key of valueCache.keys()) {
    if (key.startsWith(prefix)) valueCache.delete(key)
  }
  for (const key of inflight.keys()) {
    if (key.startsWith(prefix)) inflight.delete(key)
  }
}

export const withCached = async <T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> => {
  const hit = getCached<T>(key)
  if (hit !== null) return hit

  const pending = inflight.get(key) as Promise<T> | undefined
  if (pending) return pending

  const task = (async () => {
    try {
      const next = await load()
      setCached(key, next, ttlMs)
      return next
    } finally {
      inflight.delete(key)
    }
  })()

  inflight.set(key, task)
  return task
}

