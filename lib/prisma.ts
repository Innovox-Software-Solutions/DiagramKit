import { PrismaClient } from '@prisma/client'

const prismaClientSingleton = () => {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })
}

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>
}

const existing = globalThis.prismaGlobal as (ReturnType<typeof prismaClientSingleton> & {
  user?: unknown
  board?: unknown
  document?: unknown
  documentShareView?: unknown
  guestDocumentShare?: unknown
  guestDocumentShareView?: unknown
}) | undefined

const hasCoreModels =
  !!existing?.user &&
  !!existing?.board &&
  !!existing?.document &&
  !!existing?.documentShareView

const hasGuestShareModels = !!existing?.guestDocumentShare && !!existing?.guestDocumentShareView

const prisma = existing && hasCoreModels && hasGuestShareModels ? existing : prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma
