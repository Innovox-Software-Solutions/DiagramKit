"use client";

import { useEffect, useRef } from "react";
import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";
import { signOut, useSession } from "next-auth/react";

function SessionInvalidationWatcher() {
  const { data: session, status } = useSession();
  const signingOutRef = useRef(false);

  useEffect(() => {
    if (status !== "authenticated" || session?.user?.id || signingOutRef.current) {
      return;
    }

    signingOutRef.current = true;
    void signOut({ callbackUrl: "/auth/signin" });
  }, [session?.user?.id, status]);

  return null;
}

export default function SessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <NextAuthSessionProvider refetchOnWindowFocus refetchInterval={60}>
      <SessionInvalidationWatcher />
      {children}
    </NextAuthSessionProvider>
  );
}
