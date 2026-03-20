import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getClientId, rateLimit } from "@/lib/rate-limit"
import { decodeDocumentHtml } from "@/lib/document-serialization"
import { verifySharePasscode } from "@/lib/share-security"
import { createGuestShareViewAndIncrement, findGuestShare, findGuestShareView } from "@/lib/guest-share-store"

type Params = {
  params: Promise<{ shareId: string }>
}

export async function GET(req: Request, { params }: Params) {
  try {
    const { shareId } = await params
    const normalizedShareId = typeof shareId === "string" ? shareId.trim() : ""

    if (!normalizedShareId) {
      return NextResponse.json(
        { error: "Missing share id" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      )
    }

    const clientId = getClientId(req)
    const rl = rateLimit({
      key: `shared-document:${normalizedShareId}:${clientId}`,
      limit: 240,
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

    const document = await prisma.document.findFirst({
      where: { shareId: normalizedShareId, isPublic: true },
      select: {
        id: true,
        title: true,
        contentHtml: true,
        updatedAt: true,
        shareLocked: true,
        sharePassHash: true,
        shareOneTime: true,
        shareViewCount: true,
      },
    })

    if (!document) {
      const hasPrismaGuestModel = Boolean((prisma as unknown as { guestDocumentShare?: unknown }).guestDocumentShare)
      const guestShare = hasPrismaGuestModel
        ? await prisma.guestDocumentShare.findFirst({
            where: { shareId: normalizedShareId },
            select: {
              shareId: true,
              title: true,
              contentHtml: true,
              updatedAt: true,
              shareLocked: true,
              sharePassHash: true,
              shareOneTime: true,
            },
          })
        : await findGuestShare(normalizedShareId)
      if (!guestShare) {
        return NextResponse.json(
          { error: "Shared document not found" },
          { status: 404, headers: { "Cache-Control": "no-store" } },
        )
      }

      const url = new URL(req.url)
      const passcode = url.searchParams.get("passcode")?.trim() ?? ""

      if (guestShare.shareLocked) {
        const ok = verifySharePasscode(passcode, guestShare.sharePassHash)
        if (!ok) {
          return NextResponse.json(
            { error: "This shared document is locked. Enter valid passcode.", locked: true },
            { status: 403, headers: { "Cache-Control": "no-store" } },
          )
        }
      }

      const viewerKey = `${normalizedShareId}:${clientId}`
      const alreadyViewed = hasPrismaGuestModel
        ? await prisma.guestDocumentShareView.findUnique({
            where: {
              shareId_viewerId: {
                shareId: normalizedShareId,
                viewerId: viewerKey,
              },
            },
            select: { id: true },
          })
        : await findGuestShareView(normalizedShareId, viewerKey)

      if (guestShare.shareOneTime && alreadyViewed) {
        return NextResponse.json(
          { error: "One-time view already used on this browser/device.", oneTimeUsed: true },
          { status: 410, headers: { "Cache-Control": "no-store" } },
        )
      }

      if (!alreadyViewed) {
        if (hasPrismaGuestModel) {
          await prisma.$transaction([
            prisma.guestDocumentShareView.create({
              data: {
                shareId: normalizedShareId,
                viewerId: viewerKey,
              },
            }),
            prisma.guestDocumentShare.update({
              where: { shareId: normalizedShareId },
              data: { shareViewCount: { increment: 1 } },
            }),
          ])
        } else {
          await createGuestShareViewAndIncrement(normalizedShareId, viewerKey)
        }
      }

      return NextResponse.json(
        {
          id: guestShare.shareId,
          title: guestShare.title,
          contentHtml: decodeDocumentHtml(guestShare.contentHtml),
          updatedAt: guestShare.updatedAt,
          lockEnabled: !!guestShare.shareLocked,
          oneTimeView: !!guestShare.shareOneTime,
        },
        {
          headers: {
            "Cache-Control": "public, max-age=60, s-maxage=120",
          },
        },
      )
    }

    const url = new URL(req.url)
    const passcode = url.searchParams.get("passcode")?.trim() ?? ""

    if (document.shareLocked) {
      const ok = verifySharePasscode(passcode, document.sharePassHash)
      if (!ok) {
        return NextResponse.json(
          { error: "This shared document is locked. Enter valid passcode.", locked: true },
          { status: 403, headers: { "Cache-Control": "no-store" } },
        )
      }
    }

    const viewerKey = `${normalizedShareId}:${clientId}`
    const alreadyViewed = await prisma.documentShareView.findUnique({
      where: {
        shareId_viewerId: {
          shareId: normalizedShareId,
          viewerId: viewerKey,
        },
      },
      select: { id: true },
    })

    if (document.shareOneTime && alreadyViewed) {
      return NextResponse.json(
        { error: "One-time view already used on this browser/device.", oneTimeUsed: true },
        { status: 410, headers: { "Cache-Control": "no-store" } },
      )
    }

    if (!alreadyViewed) {
      await prisma.$transaction([
        prisma.documentShareView.create({
          data: {
            documentId: document.id,
            shareId: normalizedShareId,
            viewerId: viewerKey,
          },
        }),
        prisma.document.update({
          where: { id: document.id },
          data: { shareViewCount: { increment: 1 } },
        }),
      ])
    }

    return NextResponse.json(
      {
        id: document.id,
        title: document.title,
        contentHtml: decodeDocumentHtml(document.contentHtml),
        updatedAt: document.updatedAt,
        lockEnabled: !!document.shareLocked,
        oneTimeView: !!document.shareOneTime,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=60, s-maxage=120",
        },
      },
    )
  } catch (error) {
    console.error("Failed to load shared document", error)
    return NextResponse.json(
      { error: "Failed to load shared document" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    )
  }
}
