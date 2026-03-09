type RateLimitConfig = {
  key: string
  limit: number
  windowMs: number
}

type RateLimitResult = {
  ok: boolean
  limit: number
  remaining: number
  resetAtMs: number
  retryAfterSeconds?: number
}

type Bucket = {
  count: number
  resetAtMs: number
  updatedAtMs: number
}

declare global {
  var __diagramkitRateLimitBuckets: Map<string, Bucket> | undefined
}

function getBuckets(): Map<string, Bucket> {
  if (!globalThis.__diagramkitRateLimitBuckets) {
    globalThis.__diagramkitRateLimitBuckets = new Map()
  }
  return globalThis.__diagramkitRateLimitBuckets
}

function maybePrune(buckets: Map<string, Bucket>, nowMs: number) {
  // Lightweight pruning to avoid unbounded growth in long-lived processes.
  if (buckets.size < 5_000) return
  const cutoffMs = nowMs - 30 * 60_000
  for (const [key, bucket] of buckets) {
    if (bucket.updatedAtMs < cutoffMs) buckets.delete(key)
  }
}

export function rateLimit(config: RateLimitConfig): RateLimitResult {
  const nowMs = Date.now()
  const buckets = getBuckets()
  maybePrune(buckets, nowMs)

  const existing = buckets.get(config.key)
  const resetAtMs =
    existing && existing.resetAtMs > nowMs ? existing.resetAtMs : nowMs + config.windowMs

  const count = existing && existing.resetAtMs > nowMs ? existing.count + 1 : 1
  const remaining = Math.max(0, config.limit - count)
  const ok = count <= config.limit

  const next: Bucket = { count, resetAtMs, updatedAtMs: nowMs }
  buckets.set(config.key, next)

  const result: RateLimitResult = { ok, limit: config.limit, remaining, resetAtMs }
  if (!ok) {
    result.retryAfterSeconds = Math.max(1, Math.ceil((resetAtMs - nowMs) / 1000))
  }
  return result
}

export function getClientIp(req: Request): string {
  const xForwardedFor = req.headers.get("x-forwarded-for")
  if (xForwardedFor) return xForwardedFor.split(",")[0]?.trim() || "unknown"
  const xRealIp = req.headers.get("x-real-ip")
  if (xRealIp) return xRealIp.trim()
  const cfIp = req.headers.get("cf-connecting-ip")
  if (cfIp) return cfIp.trim()
  return "unknown"
}
