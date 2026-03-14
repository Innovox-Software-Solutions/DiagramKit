import { gzipSync, gunzipSync } from "node:zlib"

export const encodeShapes = (shapes: unknown): string => {
  const json = JSON.stringify(shapes ?? [])
  const gz = gzipSync(Buffer.from(json, "utf-8"))
  return gz.toString("base64")
}

export const decodeShapes = (payload: string): unknown => {
  const buf = Buffer.from(payload, "base64")
  const json = gunzipSync(buf).toString("utf-8")
  return JSON.parse(json)
}

export const safeDecodeShapes = (payload: string | null | undefined): unknown => {
  if (!payload) return []
  try {
    return decodeShapes(payload)
  } catch (error) {
    console.error("Failed to decode shapes payload", error)
    return []
  }
}
