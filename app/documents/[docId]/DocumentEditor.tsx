"use client";

import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { UserMenu } from "@/components/UserMenu";
import RichTextEditor, { type RichTextCommand } from "@/components/RichTextEditor";
import { Bold, Italic, List, ListOrdered, Heading1, Heading2, SeparatorHorizontal, Eraser, Download } from "lucide-react";
import styles from "../documents.module.css";

const FONT_OPTIONS = [
  { label: "Inter", value: "var(--font-inter), Inter, sans-serif" },
  { label: "Manrope", value: "var(--font-manrope), Manrope, sans-serif" },
  { label: "Space Grotesk", value: "var(--font-space-grotesk), sans-serif" },
  { label: "Roboto", value: "var(--font-roboto), Roboto, sans-serif" },
  { label: "Open Sans", value: "var(--font-open-sans), 'Open Sans', sans-serif" },
  { label: "Lobster Two", value: "var(--font-lobster-two), serif" },
]

type LoadedDocument = {
  title: string
  contentHtml: string
}

type StoredDocument = {
  title: string
  contentHtml?: string
  content?: string
  updatedAt: number
}

const DOCS_THEME_KEY = "diagramkit.docs.theme.v1"
const DOCS_GUEST_MODE_KEY = "diagramkit.docs.guestmode.v1"
const DOCS_LIST_KEY = "diagramkit.documents.v1"
const docKey = (id: string) => `diagramkit.document.${id}.v1`
const STARTER_HTML = `<h2>Highlights</h2><ul><li>Write bullet points</li><li>Use <strong>bold</strong> for important words</li><li>Add headings with H1 / H2</li></ul>`

const safeParseDoc = (value: string | null): StoredDocument => {
  if (!value) return { title: "Untitled Document", contentHtml: STARTER_HTML, updatedAt: Date.now() }
  try {
    const parsed = JSON.parse(value) as Partial<StoredDocument>
    return {
      title: String(parsed.title ?? "Untitled Document"),
      contentHtml: typeof parsed.contentHtml === "string" ? parsed.contentHtml : undefined,
      content: typeof parsed.content === "string" ? parsed.content : undefined,
      updatedAt: Number(parsed.updatedAt ?? Date.now()),
    }
  } catch {
    return { title: "Untitled Document", contentHtml: STARTER_HTML, updatedAt: Date.now() }
  }
}

const safeParseList = (value: string | null): { id: string; title: string; updatedAt: number }[] => {
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => {
        const record = item as { id?: unknown; title?: unknown; updatedAt?: unknown }
        if (!record.id) return null
        return {
          id: String(record.id),
          title: String(record.title ?? "Untitled Document"),
          updatedAt: Number(record.updatedAt ?? Date.now()),
        }
      })
      .filter(Boolean) as { id: string; title: string; updatedAt: number }[]
  } catch {
    return []
  }
}

export default function DocumentEditor({ docId }: { docId: string }) {
  const router = useRouter();
  const { data: session, status } = useSession();

  const [title, setTitle] = useState("Untitled Document");
  const [contentHtml, setContentHtml] = useState("");
  const [hasLoaded, setHasLoaded] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [textColor, setTextColor] = useState("#f8fafc");
  const [highlightColor, setHighlightColor] = useState("#fef08a");
  const [fontFamily, setFontFamily] = useState(FONT_OPTIONS[0].value);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [guestMode, setGuestMode] = useState(false);

  const saveTimer = useRef<number | null>(null);
  const editorApi = useRef<null | { run: (command: RichTextCommand) => void; focus: () => void }>(null);
  const lastDocIdForAutosaveRef = useRef(docId);

  useEffect(() => {
    const stored = localStorage.getItem(DOCS_THEME_KEY)
    if (stored === "light" || stored === "dark") {
      setTheme(stored)
      return
    }
    const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)").matches
    setTheme(prefersLight ? "light" : "dark")
  }, [])

  useEffect(() => {
    localStorage.setItem(DOCS_THEME_KEY, theme)
    setTextColor(theme === "light" ? "#0f172a" : "#f8fafc")
  }, [theme])

  useEffect(() => {
    setGuestMode(localStorage.getItem(DOCS_GUEST_MODE_KEY) === "1")
  }, [])

  const enableGuestMode = () => {
    const now = Date.now()
    localStorage.setItem(DOCS_GUEST_MODE_KEY, "1")
    const existing = localStorage.getItem(docKey(docId))
    const doc = safeParseDoc(existing)
    if (!existing) {
      localStorage.setItem(
        docKey(docId),
        JSON.stringify({
          title: doc.title,
          contentHtml: doc.contentHtml ?? STARTER_HTML,
          updatedAt: now,
        } satisfies StoredDocument),
      )
    }
    const list = safeParseList(localStorage.getItem(DOCS_LIST_KEY))
    const next = [{ id: docId, title: doc.title, updatedAt: now }, ...list.filter((item) => item.id !== docId)]
    localStorage.setItem(DOCS_LIST_KEY, JSON.stringify(next))
    setGuestMode(true)
  }

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      if (status !== "authenticated" && !guestMode) {
        const existingGuestDoc = localStorage.getItem(docKey(docId))
        if (existingGuestDoc) {
          localStorage.setItem(DOCS_GUEST_MODE_KEY, "1")
          setGuestMode(true)
          return
        }
        router.replace("/documents")
        setHasLoaded(true)
        return
      }

      setHasLoaded(false)
      try {
        if (status === "authenticated") {
          const res = await fetch(`/api/documents/${encodeURIComponent(docId)}`, {
            method: "GET",
            headers: { Accept: "application/json" },
            cache: "no-store",
          })
          const data = (await res.json()) as { error?: string } & Partial<LoadedDocument>
          if (!res.ok) throw new Error(data.error ?? "Unable to load document")
          if (cancelled) return
          setTitle(String(data.title ?? "Untitled Document"))
          setContentHtml(typeof data.contentHtml === "string" ? data.contentHtml : "")
          return
        }

        const rawGuestDoc = localStorage.getItem(docKey(docId))
        const list = safeParseList(localStorage.getItem(DOCS_LIST_KEY))
        const existsInList = list.some((item) => item.id === docId)

        if (!rawGuestDoc) {
          if (existsInList) {
            const nextList = list.filter((item) => item.id !== docId)
            localStorage.setItem(DOCS_LIST_KEY, JSON.stringify(nextList))
          }
          router.replace("/documents")
          return
        }

        const guestDoc = safeParseDoc(rawGuestDoc)
        if (cancelled) return
        setTitle(guestDoc.title)
        setContentHtml(guestDoc.contentHtml ?? guestDoc.content ?? STARTER_HTML)
        const next = [{ id: docId, title: guestDoc.title, updatedAt: Date.now() }, ...list.filter((item) => item.id !== docId)]
        localStorage.setItem(DOCS_LIST_KEY, JSON.stringify(next))
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "Unable to load document"
          alert(message)
          router.push("/documents")
        }
      } finally {
        if (!cancelled) setHasLoaded(true)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [docId, guestMode, router, status]);

  const persist = useMemo(() => {
    return async (nextTitle: string, nextContentHtml: string) => {
      if (session?.user?.id) {
        setSaveState("saving")
        const res = await fetch(`/api/documents/${encodeURIComponent(docId)}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            title: nextTitle,
            contentHtml: nextContentHtml,
          }),
        })
        if (!res.ok) {
          setSaveState("error")
          return
        }
        setSaveState("saved")
        return
      }

      if (!guestMode) return

      const updatedAt = Date.now()
      setSaveState("saving")
      localStorage.setItem(
        docKey(docId),
        JSON.stringify({
          title: nextTitle,
          contentHtml: nextContentHtml,
          updatedAt,
        }),
      )
      const list = safeParseList(localStorage.getItem(DOCS_LIST_KEY))
      const next = [{ id: docId, title: nextTitle, updatedAt }, ...list.filter((item) => item.id !== docId)]
      localStorage.setItem(DOCS_LIST_KEY, JSON.stringify(next))
      setSaveState("saved")
    };
  }, [docId, guestMode, session?.user?.id]);

  const scheduleSave = (nextTitle: string, nextContent: string) => {
    if (!hasLoaded || (!session?.user?.id && !guestMode)) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void persist(nextTitle, nextContent);
      saveTimer.current = null;
    }, 350);
  };

  useEffect(() => {
    if (lastDocIdForAutosaveRef.current !== docId) {
      lastDocIdForAutosaveRef.current = docId
      return
    }
    scheduleSave(title, contentHtml);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, title, contentHtml]);

  useEffect(() => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    setHasLoaded(false)
    setSaveState("idle")
    setTitle("Untitled Document")
    setContentHtml("")
  }, [docId])

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, []);

  const handleBack = async () => {
    if (session?.user?.id || guestMode) await persist(title, contentHtml);
    router.push("/documents");
  };

  const handleShare = async () => {
    if (guestMode && !session?.user?.id) {
      alert("Guest mode is local only. Sign in with Google to create a share link.")
      return
    }

    if (!session?.user?.id) {
      await signIn("google", { callbackUrl: `/documents/${docId}` })
      return
    }
    await persist(title, contentHtml)

    const res = await fetch("/api/share-document", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ docId }),
    })

    const data = (await res.json()) as { error?: string; shareUrl?: string }
    if (!res.ok || !data.shareUrl) {
      alert(data.error ?? "Unable to create share link")
      return
    }

    try {
      await navigator.clipboard.writeText(data.shareUrl)
      alert("View-only share link copied")
    } catch {
      alert(data.shareUrl)
    }
  };

  const handleDownloadPdf = async () => {
    try {
      const html2canvas = (await import("html2canvas")).default
      const { jsPDF } = await import("jspdf")
      const titleText = title.trim().length > 0 ? title.trim() : "Untitled Document"
      const wrapper = document.createElement("div")
      wrapper.style.position = "fixed"
      wrapper.style.left = "-100000px"
      wrapper.style.top = "0"
      wrapper.style.width = "840px"
      wrapper.style.background = "#ffffff"
      wrapper.style.color = "#0f172a"
      wrapper.style.padding = "44px 56px"
      wrapper.style.boxSizing = "border-box"
      wrapper.style.fontFamily = "Inter, Arial, sans-serif"
      wrapper.style.lineHeight = "1.6"

      const safeTitle = titleText
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")

      wrapper.innerHTML = `
        <style>
          .pdf-title { font-size: 38px; font-weight: 800; margin: 0 0 4px 0; line-height: 1.2; color: #020617; }
          .pdf-meta { margin: 0 0 18px 0; color: #64748b; font-size: 12px; }
          .pdf-content h1 { font-size: 30px; margin: 18px 0 8px; line-height: 1.25; color: #020617; }
          .pdf-content h2 { font-size: 22px; margin: 16px 0 8px; line-height: 1.3; color: #020617; }
          .pdf-content p { margin: 0 0 10px 0; }
          .pdf-content ul, .pdf-content ol { margin: 10px 0 12px 24px; padding: 0; }
          .pdf-content li { margin: 4px 0; }
          .pdf-content hr { border: 0; border-top: 1px solid #cbd5e1; margin: 18px 0; }
          .pdf-content code { background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; padding: 1px 6px; }
          .pdf-content a { color: #1d4ed8; text-decoration: underline; }
        </style>
        <h1 class="pdf-title">${safeTitle}</h1>
        <p class="pdf-meta">Generated ${new Date().toLocaleString()}</p>
        <div class="pdf-content">${contentHtml}</div>
      `

      document.body.appendChild(wrapper)
      let canvas: HTMLCanvasElement
      try {
        canvas = await html2canvas(wrapper, {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
        })
      } finally {
        if (document.body.contains(wrapper)) {
          document.body.removeChild(wrapper)
        }
      }

      const pdf = new jsPDF({ unit: "pt", format: "a4" })
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margin = 24
      const renderWidth = pageWidth - margin * 2
      const renderHeight = (canvas.height * renderWidth) / canvas.width
      const pageContentHeight = pageHeight - margin * 2
      const imageData = canvas.toDataURL("image/png")

      let offsetY = 0
      while (offsetY < renderHeight) {
        pdf.addImage(imageData, "PNG", margin, margin - offsetY, renderWidth, renderHeight)
        offsetY += pageContentHeight
        if (offsetY < renderHeight) {
          pdf.addPage()
        }
      }

      const filenameBase = titleText
        .replace(/[\\/:*?"<>|]/g, "")
        .replace(/\s+/g, " ")
        .trim()
      pdf.save(`${filenameBase || "document"}.pdf`)
    } catch (error) {
      console.error("Failed to export PDF", error)
      alert("Unable to download PDF right now.")
    }
  }

  const keepSelectionOnMouseDown: React.MouseEventHandler<HTMLElement> = (event) => {
    event.preventDefault()
  }

  if (!hasLoaded || status === "loading") {
    return <div className={`${styles.container} ${theme === "light" ? styles.containerLight : ""}`} />
  }

  if (!session?.user?.id && !guestMode) {
    return (
      <div className={`${styles.container} ${theme === "light" ? styles.containerLight : ""}`}>
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <button className={styles.secondaryButton} onClick={() => router.push("/documents")}>
              Back
            </button>
          </div>
          <div className={styles.headerRight}>
            <button className={styles.headerActionButton} onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}>
              {theme === "dark" ? "Light Mode" : "Dark Mode"}
            </button>
          </div>
        </header>
        <div className={styles.list}>
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>Sign in required</div>
            <div className={styles.emptyDesc}>Sign in for cloud save/share, or continue in guest mode with local save.</div>
            <button className={styles.primaryButton} onClick={() => signIn("google", { callbackUrl: `/documents/${docId}` })}>
              Sign in with Google
            </button>
            <button className={styles.secondaryButton} onClick={enableGuestMode}>
              Maybe Later (Guest Mode)
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`${styles.container} ${theme === "light" ? styles.containerLight : ""}`}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <button className={styles.secondaryButton} onClick={handleBack}>
            Back
          </button>
          <input
            className={styles.titleInput}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Document title"
          />
        </div>

        <div className={styles.headerRight}>
          <button className={styles.headerActionButton} onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}>
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </button>
          {session?.user?.id ? (
            <>
              <button className={styles.headerActionButton} type="button" title="Current save status">
                {saveState === "saving" ? "Saving…" : saveState === "error" ? "Save Failed" : "Saved"}
              </button>
              <button className={styles.headerActionButton} type="button" onClick={() => void persist(title, contentHtml)} title="Save now">
                Save
              </button>
              <button className={styles.headerPrimaryButton} type="button" onClick={handleShare} title="Create view-only link">
                Share View
              </button>
              <UserMenu />
            </>
          ) : (
            <button
              className={styles.headerPrimaryButton}
              type="button"
              onClick={() => signIn("google", { callbackUrl: `/documents/${docId}` })}
              title="Sign in to sync and share"
            >
              Sign In
            </button>
          )}
        </div>
      </header>

      <div className={styles.docCanvas}>
        <div className={styles.docPaper}>
          <div className={styles.docTitle}>{title.trim().length ? title : "Untitled Document"}</div>
          <div className={styles.docHint}>Type your notes here — use the toolbar for formatting.</div>

          <div className={styles.docEditorWrap}>
            <RichTextEditor
              valueHtml={contentHtml}
              onChangeHtml={setContentHtml}
              placeholder="Start writing…"
              className={styles.docEditor}
              onReady={(api) => {
                editorApi.current = api;
              }}
            />
          </div>
        </div>
      </div>

      <div className={styles.bottomBar} role="toolbar" aria-label="Document tools">
        <button className={styles.bottomButton} onMouseDown={keepSelectionOnMouseDown} onClick={() => editorApi.current?.run({ type: "bold" })} title="Bold (Ctrl+B)">
          <Bold size={16} />
        </button>
        <button className={styles.bottomButton} onMouseDown={keepSelectionOnMouseDown} onClick={() => editorApi.current?.run({ type: "italic" })} title="Italic (Ctrl+I)">
          <Italic size={16} />
        </button>
        <div className={styles.bottomDivider} />
        <button className={styles.bottomButton} onMouseDown={keepSelectionOnMouseDown} onClick={() => editorApi.current?.run({ type: "h1" })} title="Heading 1">
          <Heading1 size={16} />
        </button>
        <button className={styles.bottomButton} onMouseDown={keepSelectionOnMouseDown} onClick={() => editorApi.current?.run({ type: "h2" })} title="Heading 2">
          <Heading2 size={16} />
        </button>
        <div className={styles.bottomDivider} />
        <button className={styles.bottomButton} onMouseDown={keepSelectionOnMouseDown} onClick={() => editorApi.current?.run({ type: "ul" })} title="Bulleted list">
          <List size={16} />
        </button>
        <button className={styles.bottomButton} onMouseDown={keepSelectionOnMouseDown} onClick={() => editorApi.current?.run({ type: "ol" })} title="Numbered list">
          <ListOrdered size={16} />
        </button>
        <button className={styles.bottomButton} onMouseDown={keepSelectionOnMouseDown} onClick={() => editorApi.current?.run({ type: "divider" })} title="Divider">
          <SeparatorHorizontal size={16} />
        </button>
        <div className={styles.bottomDivider} />
        <label className={styles.bottomLabel}>
          Font
          <select
            className={styles.bottomSelect}
            value={fontFamily}
            onChange={(event) => {
              const value = event.target.value
              setFontFamily(value)
              editorApi.current?.run({ type: "fontFamily", value })
            }}
            title="Font family"
          >
            {FONT_OPTIONS.map((font) => (
              <option key={font.value} value={font.value}>
                {font.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.bottomLabel}>
          Text
          <input
            className={styles.bottomColor}
            type="color"
            value={textColor}
            onChange={(event) => {
              const value = event.target.value
              setTextColor(value)
              editorApi.current?.run({ type: "textColor", value })
            }}
            title="Text color"
          />
        </label>
        <label className={styles.bottomLabel}>
          Highlight
          <input
            className={styles.bottomColor}
            type="color"
            value={highlightColor}
            onChange={(event) => {
              const value = event.target.value
              setHighlightColor(value)
              editorApi.current?.run({ type: "highlightColor", value })
            }}
            title="Highlight color"
          />
        </label>
        <div className={styles.bottomSpacer} />
        <button className={styles.bottomButton} onMouseDown={keepSelectionOnMouseDown} onClick={handleDownloadPdf} title="Download as PDF">
          <Download size={16} />
          PDF
        </button>
        <button className={styles.bottomButton} onMouseDown={keepSelectionOnMouseDown} onClick={() => editorApi.current?.run({ type: "clear" })} title="Clear formatting">
          <Eraser size={16} />
        </button>
      </div>
    </div>
  );
}
