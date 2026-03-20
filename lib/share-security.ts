import crypto from "node:crypto"

const KEYLEN = 64
const COST = 16_384
const BLOCK_SIZE = 8
const PARALLEL = 1

const normalize = (value: string) => value.trim().slice(0, 128)

export const hashSharePasscode = (raw: string) => {
  const passcode = normalize(raw)
  if (!passcode) return ""
  const salt = crypto.randomBytes(16).toString("hex")
  const derived = crypto.scryptSync(passcode, salt, KEYLEN, { N: COST, r: BLOCK_SIZE, p: PARALLEL }).toString("hex")
  return `${salt}:${derived}`
}

export const verifySharePasscode = (raw: string, packed: string | null | undefined) => {
  if (!packed) return false
  const passcode = normalize(raw)
  if (!passcode) return false
  const [salt, expected] = packed.split(":")
  if (!salt || !expected) return false
  const computed = crypto.scryptSync(passcode, salt, KEYLEN, { N: COST, r: BLOCK_SIZE, p: PARALLEL })
  const expectedBuffer = Buffer.from(expected, "hex")
  if (computed.byteLength !== expectedBuffer.byteLength) return false
  return crypto.timingSafeEqual(computed, expectedBuffer)
}

