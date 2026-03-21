"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useMemo, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { compressToUTF16 } from "lz-string";
import { UserMenu } from "@/components/UserMenu";
import styles from "./documents.module.css";

type DocumentRecord = {
  id: string
  title: string
  updatedAt: number
}

const DOCS_THEME_KEY = "diagramkit.docs.theme.v1"
const DOCS_GUEST_MODE_KEY = "diagramkit.docs.guestmode.v1"
const DOCS_LIST_KEY = "diagramkit.documents.v1"
const DOC_COMPRESSED_PREFIX = "lz:"

const compactHtmlForStorage = (html: string) =>
  html
    .replace(/>\s+</g, "><")
    .replace(/\sstyle=""/g, "")
    .trim()

const encodeLocalHtml = (html: string) => {
  const compact = compactHtmlForStorage(html)
  const compressed = compressToUTF16(compact)
  if (!compressed) return compact
  const packed = `${DOC_COMPRESSED_PREFIX}${compressed}`
  return packed.length < compact.length ? packed : compact
}

const safeParse = (value: string | null): DocumentRecord[] => {
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => {
        const record = item as Partial<DocumentRecord>
        if (!record.id) return null
        return {
          id: String(record.id),
          title: String(record.title ?? "Untitled Document"),
          updatedAt: Number(record.updatedAt ?? Date.now()),
        } satisfies DocumentRecord
      })
      .filter(Boolean) as DocumentRecord[]
  } catch {
    return []
  }
}

const createId = () => {
  const randomUuid = globalThis.crypto?.randomUUID?.()
  if (randomUuid) return randomUuid
  return `doc_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

const docKey = (docId: string) => `diagramkit.document.${docId}.v1`

export default function DocumentsHome() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [documents, setDocuments] = React.useState<DocumentRecord[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [guestMode, setGuestMode] = useState(true);

  React.useEffect(() => {
    const stored = localStorage.getItem(DOCS_THEME_KEY)
    if (stored === "light" || stored === "dark") {
      setTheme(stored)
      return
    }
    const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)").matches
    setTheme(prefersLight ? "light" : "dark")
  }, [])

  React.useEffect(() => {
    localStorage.setItem(DOCS_THEME_KEY, theme)
  }, [theme])

  React.useEffect(() => {
    if (status === "authenticated") {
      setGuestMode(false)
      localStorage.removeItem(DOCS_GUEST_MODE_KEY)
      return
    }
    if (status === "unauthenticated") {
      setGuestMode(true)
      localStorage.setItem(DOCS_GUEST_MODE_KEY, "1")
    }
  }, [status])

  React.useEffect(() => {
    let cancelled = false

    const run = async () => {
      if (status === "loading") return

      if (status !== "authenticated" && !guestMode) {
        if (!cancelled) setDocuments([])
        setHasLoaded(true)
        return
      }

      setHasLoaded(false)
      try {
        if (status === "authenticated") {
          const res = await fetch("/api/documents", {
            method: "GET",
            headers: { Accept: "application/json" },
            cache: "no-store",
          })
          const data = (await res.json()) as { error?: string } | DocumentRecord[]
          if (!res.ok) {
            throw new Error((data as { error?: string }).error ?? "Unable to load documents")
          }
          if (cancelled) return
          setDocuments(Array.isArray(data) ? data : [])
          return
        }

        if (cancelled) return
        setDocuments(safeParse(localStorage.getItem(DOCS_LIST_KEY)))
      } catch {
        if (cancelled) return
        setDocuments([])
      } finally {
        if (!cancelled) setHasLoaded(true)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [guestMode, status])

  const sortedDocuments = useMemo(() => {
    return [...documents].sort((a, b) => b.updatedAt - a.updatedAt)
  }, [documents]);

  const openDocument = (id: string) => {
    router.push(`/documents/${encodeURIComponent(id)}`)
  }

  const handleCreate = async () => {
    if (session?.user?.id) {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({}),
      })
      const data = (await res.json()) as { id?: string; error?: string }
      if (!res.ok || !data.id) {
        alert(data.error ?? "Unable to create document")
        return
      }
      openDocument(data.id)
      return
    }

    if (!guestMode) {
      await signIn("google", { callbackUrl: "/documents" })
      return
    }

    const id = createId()
    const now = Date.now()
    const record: DocumentRecord = { id, title: "Untitled Document", updatedAt: now }
    const nextDocs = [record, ...documents.filter((doc) => doc.id !== id)]
    setDocuments(nextDocs)
    localStorage.setItem(DOCS_LIST_KEY, JSON.stringify(nextDocs))
    localStorage.setItem(
      docKey(id),
      JSON.stringify({
        title: record.title,
        contentHtml: encodeLocalHtml(`<h2>Highlights</h2><ul><li>Write bullet points</li><li>Use <strong>bold</strong> for important words</li><li>Add headings with H1 / H2</li></ul>`),
        updatedAt: now,
      }),
    )
    openDocument(id)
  };

  const handleDelete = async (docId: string) => {
    if (session?.user?.id) {
      const res = await fetch(`/api/documents/${encodeURIComponent(docId)}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        alert(data.error ?? "Unable to delete document")
        return
      }
      setDocuments((prev) => prev.filter((doc) => doc.id !== docId))
      return
    }

    if (!guestMode) return
    const nextDocs = documents.filter((doc) => doc.id !== docId)
    setDocuments(nextDocs)
    localStorage.setItem(DOCS_LIST_KEY, JSON.stringify(nextDocs))
    localStorage.removeItem(docKey(docId))
  };

  return (
    <div className={`${styles.container} ${theme === "light" ? styles.containerLight : ""}`}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div>
            <div className={styles.heading}>Documents</div>
            <div className={styles.subheading}>
              {session?.user?.id
                ? "Your chat notes are securely stored to your signed-in account."
                : "Guest mode: chat notes are saved only on this browser."}
            </div>
          </div>
        </div>

        <nav className={styles.modeTabs} aria-label="Workspace mode">
          <Link href="/documents" className={`${styles.modeTab} ${styles.modeTabActive}`}>
            Document
          </Link>
          <Link href="/both" className={styles.modeTab}>
            Both
          </Link>
          <Link href="/canvas" className={styles.modeTab}>
            Canvas
          </Link>
        </nav>

        <div className={styles.headerRight}>
          <button className={`${styles.headerActionButton} ${styles.hideOnMobile}`} onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}>
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </button>
          <button className={styles.primaryButton} onClick={handleCreate}>
            New Document
          </button>
          <UserMenu />
        </div>
      </header>

      <div className={styles.list}>
        {status === "loading" || !hasLoaded ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>Loading…</div>
          </div>
        ) : sortedDocuments.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>No documents yet</div>
            <div className={styles.emptyDesc}>Create your first document to get started.</div>
            <button className={styles.primaryButton} onClick={handleCreate}>
              Create Document
            </button>
          </div>
        ) : (
          sortedDocuments.map((doc) => (
            <div key={doc.id} className={styles.item}>
              <Link className={styles.itemLink} href={`/documents/${encodeURIComponent(doc.id)}`}>
                <div className={styles.itemTitle}>{doc.title}</div>
                <div className={styles.itemMeta}>Updated {new Date(doc.updatedAt).toLocaleString()}</div>
              </Link>
              <button className={styles.dangerButton} onClick={() => handleDelete(doc.id)} aria-label={`Delete ${doc.title}`}>
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
