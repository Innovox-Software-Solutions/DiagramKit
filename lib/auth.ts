import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import prisma from "./prisma"

// Auth.js/NextAuth v5 prefers AUTH_URL. Keep backward-compat with NEXTAUTH_URL.
if (!process.env.AUTH_URL && process.env.NEXTAUTH_URL) {
  process.env.AUTH_URL = process.env.NEXTAUTH_URL
}

function parseUrls(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

function toOrigin(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

function getAllowedOrigins(baseUrl: string): Set<string> {
  const allowed = new Set<string>()

  const baseOrigin = toOrigin(baseUrl)
  if (baseOrigin) allowed.add(baseOrigin)

  const envUrls = [process.env.AUTH_URL, process.env.NEXTAUTH_URL]
  for (const value of envUrls) {
    if (!value) continue
    const origin = toOrigin(value)
    if (origin) allowed.add(origin)
  }

  for (const value of parseUrls(process.env.APP_URLS)) {
    const origin = toOrigin(value)
    if (origin) allowed.add(origin)
  }

  return allowed
}

function requiredEnv(name: string): string | undefined {
  const value = process.env[name]?.trim()
  if (value) return value
  if (process.env.NODE_ENV === "production") {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  console.warn(`[auth] Missing environment variable: ${name}`)
  return undefined
}

const googleClientId = requiredEnv("AUTH_GOOGLE_ID") ?? ""
const googleClientSecret = requiredEnv("AUTH_GOOGLE_SECRET") ?? ""
const authSecret = requiredEnv("AUTH_SECRET")
const trustHost =
  process.env.NODE_ENV !== "production" ||
  !!process.env.AUTH_URL?.trim() ||
  process.env.AUTH_TRUST_HOST?.trim() === "true"

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: authSecret,
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: googleClientId,
      clientSecret: googleClientSecret,
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === "google") {
        const emailVerified = (profile as { email_verified?: boolean } | null)?.email_verified
        if (emailVerified === false) return false
      }
      return true
    },
    async session({ session, token }) {
      if (token.userDeleted || !token.sub) {
        return {
          ...session,
          user: undefined,
        }
      }

      if (session.user && token.sub) {
        session.user.id = token.sub
      }
      return session
    },
    async jwt({ token, user }) {
      const userId =
        (typeof user?.id === "string" && user.id) ||
        (typeof token.sub === "string" && token.sub) ||
        ""

      if (!userId) {
        return token
      }

      const existingUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      })

      if (!existingUser) {
        token.userDeleted = true
        delete token.sub
        return token
      }

      token.sub = existingUser.id
      delete token.userDeleted
      return token
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`
      try {
        const redirectUrl = new URL(url)
        const allowedOrigins = getAllowedOrigins(baseUrl)
        if (allowedOrigins.has(redirectUrl.origin)) return url
      } catch {
        // ignore
      }
      return baseUrl
    },
  },
  pages: {
    signIn: '/auth/signin',
  },
  debug: process.env.NODE_ENV !== "production",
  trustHost,
  logger: {
    error(code, ...message) {
      if (process.env.NODE_ENV === "production") {
        console.error("[auth]", code)
        return
      }
      console.error("[auth]", code, ...message)
    },
    warn(code, ...message) {
      if (process.env.NODE_ENV === "production") {
        console.warn("[auth]", code)
        return
      }
      console.warn("[auth]", code, ...message)
    },
    debug(code, ...message) {
      if (process.env.NODE_ENV === "production") return
      console.debug("[auth]", code, ...message)
    },
  },
})
