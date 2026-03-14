import { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user?: ({
      id?: string
    } & DefaultSession["user"]) | undefined
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userDeleted?: boolean
  }
}
