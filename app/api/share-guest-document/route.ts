import crypto from "node:crypto"
import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getClientId, rateLimit } from "@/lib/rate-limit"
import { encodeDocumentHtml } from "@/lib/document-serialization"
import { hashSharePasscode } from "@/lib/share-security"

const makeShareId = () => crypto.randomBytes(9).toString("base64url")

const sanitizeHtml = (html: string) =>
  html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "")

const getBaseUrl = (req: Request) => {
  const envBase =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim()
  if (envBase) return envBase.replace(/\/$/, "")

  const incoming = new URL(req.url)
  return `${incoming.protocol}//${incoming.host}`
}

export async function POST(req: Request) {
  try {
    const clientId = getClientId(req)
    const rl = rateLimit({
      key: `share-guest-document:${clientId}`,
      limit: 20,
      windowMs: 60_000,
    })
    if (!rl.ok) {
      return new NextResponse("Too Many Requests", {
        status: 429,
        headers: {
          "Retry-After": String(rl.retryAfterSeconds ?? 60),
          "Cache-Control": "no-store",
        },
      })
    }

    let data: unknown
    try {
      data = await req.json()
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      )
    }

    const body = data as { title?: unknown; contentHtml?: unknown; passcode?: unknown; lockEnabled?: unknown; shareId?: unknown }
    const title =
      typeof body.title === "string" && body.title.trim().length > 0
        ? body.title.trim().slice(0, 160)
        : "Untitled Document"
    const contentHtml =
      typeof body.contentHtml === "string"
        ? sanitizeHtml(body.contentHtml.slice(0, 300_000))
        : ""
    const lockEnabled = body.lockEnabled === true
    const passcode = typeof body.passcode === "string" ? body.passcode.trim() : ""
    const shareIdInput = typeof body.shareId === "string" ? body.shareId.trim() : ""
    if ((lockEnabled || passcode.length > 0) && passcode.length > 0 && passcode.length < 4) {
      return NextResponse.json(
        { error: "Passcode must be at least 4 characters." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      )
    }
    const existing =
      shareIdInput.length > 0
        ? await prisma.guestDocumentShare.findFirst({
            where: { shareId: shareIdInput },
            select: { shareId: true, sharePassHash: true, shareViewCount: true },
          })
        : null

    const shareId = existing?.shareId ?? makeShareId()
    const alreadyLocked = !!existing?.sharePassHash
    const finalLocked = alreadyLocked ? true : (lockEnabled || passcode.length > 0)
    const finalPassHash = alreadyLocked ? existing?.sharePassHash : (finalLocked && passcode ? hashSharePasscode(passcode) : null)

    if (existing) {
      await prisma.guestDocumentShare.update({
        where: { shareId },
        data: {
          title,
          contentHtml: encodeDocumentHtml(contentHtml),
          shareLocked: finalLocked,
          sharePassHash: finalPassHash,
          shareOneTime: false,
        },
        select: { shareId: true },
      })
    } else {
      await prisma.guestDocumentShare.create({
        data: {
          shareId,
          title,
          contentHtml: encodeDocumentHtml(contentHtml),
          shareLocked: finalLocked,
          sharePassHash: finalPassHash,
          shareOneTime: false,
          shareViewCount: 0,
        },
        select: { shareId: true },
      })
    }

    const baseUrl = getBaseUrl(req)
    const shareUrl = `${baseUrl}/d/${shareId}`

    return NextResponse.json(
      {
        success: true,
        shareId,
        shareUrl,
        lockEnabled: finalLocked,
        views: Number(existing?.shareViewCount ?? 0),
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    console.error("Failed to share guest document", error)
    return NextResponse.json(
      { error: "Failed to share document" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    )
  }
}
