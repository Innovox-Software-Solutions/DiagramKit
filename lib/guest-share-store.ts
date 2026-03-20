import { MongoClient } from "mongodb"

type GuestShareRecord = {
  shareId: string
  title: string
  contentHtml?: string | null
  shareLocked?: boolean | null
  sharePassHash?: string | null
  shareOneTime?: boolean | null
  shareViewCount?: number | null
  createdAt: Date
  updatedAt: Date
}

const mongoUrl = process.env.DATABASE_URL ?? ""
const dbName = (() => {
  try {
    const parsed = new URL(mongoUrl)
    const fromPath = parsed.pathname.replace(/^\//, "")
    return fromPath || "test"
  } catch {
    return "test"
  }
})()

let clientPromise: Promise<MongoClient> | null = null
const getClient = () => {
  if (!clientPromise) {
    clientPromise = MongoClient.connect(mongoUrl)
  }
  return clientPromise
}

const getCollections = async () => {
  const client = await getClient()
  const db = client.db(dbName)
  return {
    shares: db.collection<GuestShareRecord>("GuestDocumentShare"),
    views: db.collection<{ shareId: string; viewerId: string; viewedAt: Date }>("GuestDocumentShareView"),
  }
}

export const findGuestShare = async (shareId: string) => {
  const { shares } = await getCollections()
  return shares.findOne({ shareId }, { projection: { _id: 0 } })
}

export const upsertGuestShare = async (input: {
  shareId: string
  title: string
  contentHtml: string
  shareLocked: boolean
  sharePassHash: string | null
}) => {
  const { shares } = await getCollections()
  const now = new Date()
  const existing = await shares.findOne({ shareId: input.shareId }, { projection: { _id: 0 } })
  if (existing) {
    await shares.updateOne(
      { shareId: input.shareId },
      {
        $set: {
          title: input.title,
          contentHtml: input.contentHtml,
          shareLocked: input.shareLocked,
          sharePassHash: input.sharePassHash,
          shareOneTime: false,
          updatedAt: now,
        },
      },
    )
  } else {
    await shares.insertOne({
      shareId: input.shareId,
      title: input.title,
      contentHtml: input.contentHtml,
      shareLocked: input.shareLocked,
      sharePassHash: input.sharePassHash,
      shareOneTime: false,
      shareViewCount: 0,
      createdAt: now,
      updatedAt: now,
    })
  }
}

export const findGuestShareView = async (shareId: string, viewerId: string) => {
  const { views } = await getCollections()
  return views.findOne({ shareId, viewerId }, { projection: { _id: 1 } })
}

export const createGuestShareViewAndIncrement = async (shareId: string, viewerId: string) => {
  const { shares, views } = await getCollections()
  const now = new Date()
  await views.insertOne({ shareId, viewerId, viewedAt: now })
  await shares.updateOne({ shareId }, { $inc: { shareViewCount: 1 }, $set: { updatedAt: now } })
}

