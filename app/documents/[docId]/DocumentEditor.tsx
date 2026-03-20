"use client";

import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { UserMenu } from "@/components/UserMenu";
import RichTextEditor, { type RichTextCommand } from "@/components/RichTextEditor";
import { Bold, Italic, Underline, List, ListOrdered, Heading1, Heading2, SeparatorHorizontal, Eraser, Download, Table2 } from "lucide-react";
import styles from "../documents.module.css";

const FONT_OPTIONS = [
  { label: "Inter", value: "var(--font-inter), Inter, sans-serif" },
  { label: "Geist Sans", value: "var(--font-geist-sans), sans-serif" },
  { label: "Manrope", value: "var(--font-manrope), Manrope, sans-serif" },
  { label: "Space Grotesk", value: "var(--font-space-grotesk), sans-serif" },
  { label: "Roboto", value: "var(--font-roboto), Roboto, sans-serif" },
  { label: "Open Sans", value: "var(--font-open-sans), 'Open Sans', sans-serif" },
  { label: "Lobster Two", value: "var(--font-lobster-two), serif" },
  { label: "Geist Mono", value: "var(--font-geist-mono), ui-monospace, monospace" },
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
  const [selectionUi, setSelectionUi] = useState<{ visible: boolean; x: number; y: number }>({ visible: false, x: 0, y: 0 });
  const [tableHoverUi, setTableHoverUi] = useState<{ visible: boolean; rightX: number; leftX: number; y: number }>({
    visible: false,
    rightX: 0,
    leftX: 0,
    y: 0,
  });

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
      wrapper.style.left = "0"
      wrapper.style.top = "0"
      wrapper.style.zIndex = "-1"
      wrapper.style.opacity = "0"
      wrapper.style.pointerEvents = "none"
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
      try {
        const filenameBase = titleText
          .replace(/[\\/:*?"<>|]/g, "")
          .replace(/\s+/g, " ")
          .trim()

        const canvas = await html2canvas(wrapper, {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
          windowWidth: wrapper.scrollWidth,
          windowHeight: wrapper.scrollHeight,
        })

        const pdf = new jsPDF({ unit: "pt", format: "a4" })
        const pageWidth = pdf.internal.pageSize.getWidth()
        const pageHeight = pdf.internal.pageSize.getHeight()
        const margin = 24
        const renderWidthPt = pageWidth - margin * 2
        const renderHeightPt = pageHeight - margin * 2

        const pxPerPt = canvas.width / renderWidthPt
        const sliceHeightPx = Math.max(1, Math.floor(renderHeightPt * pxPerPt))
        const totalHeightPx = canvas.height

        let offsetPx = 0
        let pageIndex = 0

        while (offsetPx < totalHeightPx) {
          const currentSlicePx = Math.min(sliceHeightPx, totalHeightPx - offsetPx)
          const sliceCanvas = document.createElement("canvas")
          sliceCanvas.width = canvas.width
          sliceCanvas.height = currentSlicePx
          const ctx = sliceCanvas.getContext("2d")
          if (!ctx) break
          ctx.drawImage(
            canvas,
            0,
            offsetPx,
            canvas.width,
            currentSlicePx,
            0,
            0,
            sliceCanvas.width,
            sliceCanvas.height,
          )

          const sliceData = sliceCanvas.toDataURL("image/png")
          const sliceHeightPt = sliceCanvas.height / pxPerPt

          if (pageIndex > 0) {
            pdf.addPage()
          }
          pdf.addImage(sliceData, "PNG", margin, margin, renderWidthPt, sliceHeightPt, undefined, "FAST")

          offsetPx += currentSlicePx
          pageIndex += 1
        }

        pdf.save(`${filenameBase || "document"}.pdf`)
      } finally {
        if (document.body.contains(wrapper)) {
          document.body.removeChild(wrapper)
        }
      }
    } catch (error) {
      console.error("Failed to export PDF", error)
      alert("Unable to download PDF right now.")
    }
  }

  const keepSelectionOnMouseDown: React.MouseEventHandler<HTMLElement> = (event) => {
    event.preventDefault()
  }

  const getEditorElement = () => document.getElementsByClassName(styles.docEditor)[0] as HTMLElement | undefined

  const getSelectionContext = () => {
    const editorEl = getEditorElement()
    const sel = window.getSelection()
    if (!editorEl || !sel || sel.rangeCount === 0) return { editorEl, sel, anchorEl: null as HTMLElement | null }
    const anchorNode = sel.anchorNode
    const anchorEl =
      anchorNode?.nodeType === Node.ELEMENT_NODE
        ? (anchorNode as HTMLElement)
        : (anchorNode?.parentElement ?? null)
    return { editorEl, sel, anchorEl }
  }

  const syncEditorHtml = () => {
    const editorEl = getEditorElement()
    if (!editorEl) return
    setContentHtml(editorEl.innerHTML)
  }

  const getActiveCell = (): HTMLTableCellElement | null => {
    const { editorEl, anchorEl } = getSelectionContext()
    if (!editorEl || !anchorEl || !editorEl.contains(anchorEl)) return null
    const cell = anchorEl.closest("td,th")
    return (cell as HTMLTableCellElement | null) ?? null
  }

  const getActiveTable = (): HTMLTableElement | null => {
    const cell = getActiveCell()
    if (cell) return cell.closest("table") as HTMLTableElement | null
    const { editorEl, anchorEl } = getSelectionContext()
    if (!editorEl || !anchorEl || !editorEl.contains(anchorEl)) return null
    return (anchorEl.closest("table") as HTMLTableElement | null) ?? null
  }

  const addTableColumn = (table?: HTMLTableElement | null) => {
    const t = table ?? getActiveTable()
    if (!t) return
    Array.from(t.rows).forEach((row, rowIndex) => {
      if (row.parentElement?.tagName === "THEAD" || (rowIndex === 0 && !t.tHead)) {
        row.insertCell(-1).outerHTML = "<th>Header</th>"
      } else {
        row.insertCell(-1).innerHTML = "&nbsp;"
      }
    })
    syncEditorHtml()
  }

  const removeLastTableColumn = (table?: HTMLTableElement | null) => {
    const t = table ?? getActiveTable()
    if (!t) return
    const cols = t.rows[0]?.cells.length ?? 0
    if (cols <= 1) return
    Array.from(t.rows).forEach((row) => {
      row.deleteCell(row.cells.length - 1)
    })
    syncEditorHtml()
  }

  const resizeCell = (axis: "width" | "height", deltaPx: number) => {
    const cell = getActiveCell()
    if (!cell) return
    const current = axis === "width" ? cell.getBoundingClientRect().width : cell.getBoundingClientRect().height
    const next = Math.max(axis === "width" ? 72 : 30, Math.min(axis === "width" ? 520 : 260, current + deltaPx))
    cell.style.setProperty(axis, `${Math.round(next)}px`)
    const table = cell.closest("table")
    if (table) {
      table.style.tableLayout = "fixed"
      table.style.width = table.style.width || "100%"
    }
    syncEditorHtml()
  }

  const getTableFromHoverUi = (): HTMLTableElement | null => {
    const sel = window.getSelection()
    const anchor =
      sel?.anchorNode?.nodeType === Node.ELEMENT_NODE
        ? (sel?.anchorNode as HTMLElement)
        : (sel?.anchorNode?.parentElement ?? null)
    if (anchor) {
      const fromSel = anchor.closest("table")
      if (fromSel) return fromSel as HTMLTableElement
    }
    const el = document.elementFromPoint(tableHoverUi.rightX - window.scrollX - 8, tableHoverUi.y - window.scrollY) as HTMLElement | null
    return (el?.closest("table") as HTMLTableElement | null) ?? null
  }

  const showHoverForTable = (table: HTMLTableElement) => {
    const rect = table.getBoundingClientRect()
    setTableHoverUi({
      visible: true,
      rightX: rect.right + window.scrollX + 10,
      leftX: rect.left + window.scrollX - 10,
      y: rect.top + window.scrollY + 26,
    })
  }

  const addTableColumnFromHover = () => {
    const table = getTableFromHoverUi()
    if (!table) return
    addTableColumn(table)
    showHoverForTable(table)
  }

  const removeTableColumnFromHover = () => {
    const table = getTableFromHoverUi()
    if (!table) return
    removeLastTableColumn(table)
    showHoverForTable(table)
  }

  const _deprecatedKeep = () => {
    // keep function positions stable after simplification
    return undefined
  }

  const oldAddTableColumn = () => {
    const table = getActiveTable()
    if (!table) return
    Array.from(table.rows).forEach((row, rowIndex) => {
      if (row.parentElement?.tagName === "THEAD" || (rowIndex === 0 && !table.tHead)) {
        row.insertCell(-1).outerHTML = "<th>Header</th>"
      } else {
        row.insertCell(-1).innerHTML = "&nbsp;"
      }
    })
    syncEditorHtml()
  }

  const oldRemoveTableColumn = () => _deprecatedKeep()

  useEffect(() => {
    const updateSelectionUi = () => {
      const editorEl = getEditorElement()
      if (!editorEl) {
        setSelectionUi((prev) => (prev.visible ? { ...prev, visible: false } : prev))
        return
      }
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0) {
        setSelectionUi((prev) => (prev.visible ? { ...prev, visible: false } : prev))
        return
      }
      const range = sel.getRangeAt(0)
      const common = range.commonAncestorContainer
      if (!editorEl.contains(common)) {
        setSelectionUi((prev) => (prev.visible ? { ...prev, visible: false } : prev))
        return
      }
      const rect = range.getBoundingClientRect()
      if (!rect.width && !rect.height) {
        setSelectionUi((prev) => (prev.visible ? { ...prev, visible: false } : prev))
        return
      }

      if (sel.isCollapsed) {
        setSelectionUi((prev) => (prev.visible ? { ...prev, visible: false } : prev))
        return
      }

      setSelectionUi({
        visible: true,
        x: rect.left + rect.width / 2 + window.scrollX,
        y: rect.top + window.scrollY - 10,
      })
    }

    const updateTableHoverUi = (event: MouseEvent) => {
      const editorEl = getEditorElement()
      if (!editorEl) return
      const target = event.target as HTMLElement | null
      const table = target?.closest("table")
      if (table && editorEl.contains(table)) {
        showHoverForTable(table as HTMLTableElement)
        return
      }
      setTableHoverUi((prev) => (prev.visible ? { ...prev, visible: false } : prev))
    }

    document.addEventListener("selectionchange", updateSelectionUi)
    window.addEventListener("scroll", updateSelectionUi, true)
    window.addEventListener("resize", updateSelectionUi)
    document.addEventListener("mousemove", updateTableHoverUi)
    return () => {
      document.removeEventListener("selectionchange", updateSelectionUi)
      window.removeEventListener("scroll", updateSelectionUi, true)
      window.removeEventListener("resize", updateSelectionUi)
      document.removeEventListener("mousemove", updateTableHoverUi)
    }
  }, [])

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
          {selectionUi.visible && (
            <div
              className={styles.selectionToolbar}
              style={{ left: selectionUi.x, top: selectionUi.y }}
              role="toolbar"
              aria-label="Selection actions"
            >
              <button className={styles.selectionButton} onMouseDown={keepSelectionOnMouseDown} onClick={() => editorApi.current?.run({ type: "bold" })} title="Bold">
                <Bold size={14} />
              </button>
              <button className={styles.selectionButton} onMouseDown={keepSelectionOnMouseDown} onClick={() => editorApi.current?.run({ type: "italic" })} title="Italic">
                <Italic size={14} />
              </button>
              <button className={styles.selectionButton} onMouseDown={keepSelectionOnMouseDown} onClick={() => editorApi.current?.run({ type: "underline" })} title="Underline">
                <Underline size={14} />
              </button>
              <label className={styles.selectionColorLabel}>
                <input
                  className={styles.selectionColor}
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
              <label className={styles.selectionColorLabel}>
                <input
                  className={styles.selectionColor}
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
            </div>
          )}
          {tableHoverUi.visible && (
            <>
              <button
                className={styles.tableHoverAdd}
                style={{ left: tableHoverUi.rightX, top: tableHoverUi.y }}
                onMouseDown={keepSelectionOnMouseDown}
                onClick={addTableColumnFromHover}
                title="Add column on right"
              >
                +
              </button>
              <button
                className={styles.tableHoverRemove}
                style={{ left: tableHoverUi.leftX, top: tableHoverUi.y }}
                onMouseDown={keepSelectionOnMouseDown}
                onClick={removeTableColumnFromHover}
                title="Remove last column"
              >
                -
              </button>
            </>
          )}
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
        <button className={styles.bottomButton} onMouseDown={keepSelectionOnMouseDown} onClick={() => editorApi.current?.run({ type: "underline" })} title="Underline (Ctrl+U)">
          <Underline size={16} />
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
        <button
          className={styles.bottomButton}
          onMouseDown={keepSelectionOnMouseDown}
          onClick={() => {
            editorApi.current?.run({ type: "table", rows: 3, cols: 3, header: true })
          }}
          title="Insert table"
        >
          <Table2 size={16} />
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
