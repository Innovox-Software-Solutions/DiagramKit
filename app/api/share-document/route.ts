import crypto from "node:crypto"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { getClientId, rateLimit } from "@/lib/rate-limit"
import { hashSharePasscode } from "@/lib/share-security"

const isMongoObjectId = (value: string) => /^[a-f\d]{24}$/i.test(value)
const makeShareId = () => crypto.randomBytes(9).toString("base64url")

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
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in to share documents." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      )
    }

    const clientId = getClientId(req)
    const rl = rateLimit({
      key: `share-document:${session.user.id}:${clientId}`,
      limit: 30,
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

    const body = data as { docId?: unknown; passcode?: unknown; lockEnabled?: unknown }
    const docId = typeof body.docId === "string" ? body.docId.trim() : ""
    if (!isMongoObjectId(docId)) {
      return NextResponse.json(
        { error: "Invalid document id" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      )
    }

    const passcode = typeof body.passcode === "string" ? body.passcode.trim() : ""
    const lockEnabledRequested = body.lockEnabled === true || passcode.length > 0
    if (lockEnabledRequested && passcode.length > 0 && passcode.length < 4) {
      return NextResponse.json(
        { error: "Passcode must be at least 4 characters." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      )
    }

    const existing = await prisma.document.findFirst({
      where: { id: docId, userId: session.user.id as string },
      select: { id: true, shareId: true, sharePassHash: true, shareLocked: true, shareViewCount: true },
    })

    if (!existing) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      )
    }

    const nextShareId = existing.shareId?.trim() || makeShareId()
    const alreadyLocked = !!existing.sharePassHash
    const shareLocked = alreadyLocked ? true : lockEnabledRequested
    const sharePassHash = alreadyLocked ? existing.sharePassHash : (shareLocked && passcode ? hashSharePasscode(passcode) : null)
    const updated = await prisma.document.update({
      where: { id: existing.id },
      data: { isPublic: true, shareId: nextShareId, shareLocked, sharePassHash, shareOneTime: false },
      select: { id: true, shareId: true, shareLocked: true, shareViewCount: true },
    })

    const baseUrl = getBaseUrl(req)
    const shareUrl = `${baseUrl}/d/${updated.shareId}`

    return NextResponse.json(
      {
        success: true,
        docId: updated.id,
        shareId: updated.shareId,
        shareUrl,
        lockEnabled: !!updated.shareLocked,
        views: Number(updated.shareViewCount ?? 0),
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    console.error("Failed to share document", error)
    return NextResponse.json(
      { error: "Failed to share document" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    )
  }
}

export async function GET(req: Request) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      )
    }

    const url = new URL(req.url)
    const docId = url.searchParams.get("docId")?.trim() ?? ""
    if (!isMongoObjectId(docId)) {
      return NextResponse.json(
        { error: "Invalid document id" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      )
    }

    const document = await prisma.document.findFirst({
      where: { id: docId, userId: session.user.id as string },
      select: {
        id: true,
        shareId: true,
        isPublic: true,
        shareLocked: true,
        shareOneTime: true,
        shareViewCount: true,
      },
    })

    if (!document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      )
    }

    return NextResponse.json(
      {
        docId: document.id,
        isShared: !!document.isPublic && !!document.shareId,
        shareId: document.shareId,
        lockEnabled: !!document.shareLocked,
        oneTimeView: false,
        views: Number(document.shareViewCount ?? 0),
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    console.error("Failed to load share info", error)
    return NextResponse.json(
      { error: "Failed to load share info" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    )
  }
}
