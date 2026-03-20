import { deflateRawSync, inflateRawSync } from "node:zlib"

const GZIP_PREFIX = "gz:"
const PLAIN_PREFIX = "pl:"

export function encodeDocumentHtml(html: string): string {
  const input = html ?? ""
  if (!input.length) return PLAIN_PREFIX

  try {
    const compressed = deflateRawSync(Buffer.from(input, "utf8"), { level: 9 })
    const encoded = compressed.toString("base64url")
    const gzValue = `${GZIP_PREFIX}${encoded}`
    const plainValue = `${PLAIN_PREFIX}${input}`
    return gzValue.length < plainValue.length ? gzValue : plainValue
  } catch {
    return `${PLAIN_PREFIX}${input}`
  }
}

export function decodeDocumentHtml(value: string | null | undefined): string {
  if (!value) return ""

  if (value.startsWith(PLAIN_PREFIX)) {
    return value.slice(PLAIN_PREFIX.length)
  }

  if (value.startsWith(GZIP_PREFIX)) {
    try {
      const compressed = Buffer.from(value.slice(GZIP_PREFIX.length), "base64url")
      return inflateRawSync(compressed).toString("utf8")
    } catch {
      return ""
    }
  }

  // Backward compatibility for older rows stored as raw HTML.
  return value
}

