"use client";

import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { compressToUTF16, decompressFromUTF16 } from "lz-string";
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

type ShareInfo = {
  isShared: boolean
  views: number
  lockEnabled: boolean
  oneTimeView: boolean
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
const DOC_COMPRESSED_PREFIX = "lz:"
const STARTER_HTML = `<h2>Highlights</h2><ul><li>Write bullet points</li><li>Use <strong>bold</strong> for important words</li><li>Add headings with H1 / H2</li></ul>`

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

const decodeLocalHtml = (value: string | undefined) => {
  if (!value) return ""
  if (!value.startsWith(DOC_COMPRESSED_PREFIX)) return value
  const decoded = decompressFromUTF16(value.slice(DOC_COMPRESSED_PREFIX.length))
  return decoded ?? ""
}

const safeParseDoc = (value: string | null): StoredDocument => {
  if (!value) return { title: "Untitled Document", contentHtml: STARTER_HTML, updatedAt: Date.now() }
  try {
    const parsed = JSON.parse(value) as Partial<StoredDocument>
    return {
      title: String(parsed.title ?? "Untitled Document"),
      contentHtml: typeof parsed.contentHtml === "string" ? decodeLocalHtml(parsed.contentHtml) : undefined,
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
  const [guestMode, setGuestMode] = useState(true);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [selectionUi, setSelectionUi] = useState<{ visible: boolean; x: number; y: number }>({ visible: false, x: 0, y: 0 });
  const [tableHoverUi, setTableHoverUi] = useState<{ visible: boolean; rightX: number; leftX: number; y: number }>({
    visible: false,
    rightX: 0,
    leftX: 0,
    y: 0,
  });
  const [shareInfo, setShareInfo] = useState<ShareInfo>({ isShared: false, views: 0, lockEnabled: false, oneTimeView: false })

  const saveTimer = useRef<number | null>(null);
  const editorApi = useRef<null | { run: (command: RichTextCommand) => void; focus: () => void }>(null);
  const lastDocIdForAutosaveRef = useRef(docId);
  const tableResizeDragRef = useRef<null | {
    axis: "x" | "y"
    startX: number
    startY: number
    startSize: number
    table: HTMLTableElement
    cellIndex: number
    row: HTMLTableRowElement
  }>(null);
  const tableMoveDragRef = useRef<null | { table: HTMLTableElement }>(null);

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
          contentHtml: encodeLocalHtml(doc.contentHtml ?? STARTER_HTML),
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
          contentHtml: encodeLocalHtml(nextContentHtml),
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
    if (!session?.user?.id && !guestMode) {
      await signIn("google", { callbackUrl: `/documents/${docId}` })
      return
    }
    await persist(title, contentHtml)

    const lockEnabled = window.confirm("Lock this share link with passcode?")
    const passcode = lockEnabled ? window.prompt("Set passcode for this shared link (min 4 chars)", "") ?? "" : ""
    if (lockEnabled && passcode.trim().length < 4) {
      alert("Passcode must be at least 4 characters.")
      return
    }
    const oneTimeView = window.confirm("Allow one-time view only per browser/device?")

    const endpoint = session?.user?.id ? "/api/share-document" : "/api/share-guest-document"
    const payload = session?.user?.id
      ? {
          docId,
          lockEnabled,
          passcode: passcode.trim(),
          oneTimeView,
        }
      : {
          title,
          contentHtml,
          lockEnabled,
          passcode: passcode.trim(),
          oneTimeView,
        }

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    })

    const data = (await res.json()) as { error?: string; shareUrl?: string; views?: number; lockEnabled?: boolean; oneTimeView?: boolean }
    if (!res.ok || !data.shareUrl) {
      alert(data.error ?? "Unable to create share link")
      return
    }

    setShareInfo({
      isShared: true,
      views: Number(data.views ?? 0),
      lockEnabled: data.lockEnabled === true,
      oneTimeView: data.oneTimeView === true,
    })

    try {
      await navigator.clipboard.writeText(data.shareUrl)
      alert("View-only share link copied")
    } catch {
      alert(data.shareUrl)
    }
  };

  useEffect(() => {
    if (!session?.user?.id) return
    let cancelled = false
    const run = async () => {
      try {
        const res = await fetch(`/api/share-document?docId=${encodeURIComponent(docId)}`, {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
        })
        if (!res.ok) return
        const data = (await res.json()) as Partial<ShareInfo>
        if (cancelled) return
        setShareInfo({
          isShared: data.isShared === true,
          views: Number(data.views ?? 0),
          lockEnabled: data.lockEnabled === true,
          oneTimeView: data.oneTimeView === true,
        })
      } catch {
        // ignore
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [docId, session?.user?.id, saveState])

  const handleDownloadPdf = async () => {
    if (isExportingPdf) return
    setIsExportingPdf(true)
    try {
      const html2canvas = (await import("html2canvas")).default
      const { jsPDF } = await import("jspdf")
      const titleText = title.trim().length > 0 ? title.trim() : "Untitled Document"
      const wrapper = document.createElement("div")
      wrapper.style.position = "absolute"
      wrapper.style.left = "-100000px"
      wrapper.style.top = "0"
      wrapper.style.zIndex = "0"
      wrapper.style.opacity = "1"
      wrapper.style.visibility = "visible"
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
        if ("fonts" in document) {
          await (document as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready
        }
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

        const filenameBase = titleText
          .replace(/[\\/:*?"<>|]/g, "")
          .replace(/\s+/g, " ")
          .trim()

        const isMostlyBlank = (canvas: HTMLCanvasElement) => {
          const ctx = canvas.getContext("2d")
          if (!ctx) return true
          const { width, height } = canvas
          const step = Math.max(1, Math.floor(Math.min(width, height) / 80))
          const sample = ctx.getImageData(0, 0, width, height).data
          let nonWhite = 0
          let total = 0
          for (let y = 0; y < height; y += step) {
            for (let x = 0; x < width; x += step) {
              const i = (y * width + x) * 4
              const r = sample[i]
              const g = sample[i + 1]
              const b = sample[i + 2]
              const a = sample[i + 3]
              if (a > 10 && (r < 245 || g < 245 || b < 245)) {
                nonWhite += 1
              }
              total += 1
            }
          }
          return total === 0 || nonWhite / total < 0.003
        }

        let canvas = await html2canvas(wrapper, {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
          foreignObjectRendering: false,
          windowWidth: wrapper.scrollWidth,
          windowHeight: wrapper.scrollHeight,
        })

        if (isMostlyBlank(canvas)) {
          canvas = await html2canvas(wrapper, {
            scale: 2,
            backgroundColor: "#ffffff",
            useCORS: true,
            foreignObjectRendering: true,
            windowWidth: wrapper.scrollWidth,
            windowHeight: wrapper.scrollHeight,
          })
        }

        if (isMostlyBlank(canvas)) {
          throw new Error("Export render returned blank canvas")
        }

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
    } finally {
      setIsExportingPdf(false)
    }
  }

  const keepSelectionOnMouseDown: React.MouseEventHandler<HTMLElement> = (event) => {
    event.preventDefault()
  }

  const getEditorElement = () => document.getElementsByClassName(styles.docEditor)[0] as HTMLElement | undefined

  const focusEditorAtEnd = () => {
    const editorEl = getEditorElement()
    if (!editorEl) return
    editorApi.current?.focus()
    const selection = window.getSelection()
    if (!selection) return
    const range = document.createRange()
    range.selectNodeContents(editorEl)
    range.collapse(false)
    selection.removeAllRanges()
    selection.addRange(range)
  }

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

  const syncEditorHtml = useCallback(() => {
    const editorEl = getEditorElement()
    if (!editorEl) return
    setContentHtml(editorEl.innerHTML)
  }, [])

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

  const getTableCellForResize = (table: HTMLTableElement): HTMLTableCellElement | null => {
    const active = getActiveCell()
    if (active && table.contains(active)) return active

    const firstBodyRow = table.tBodies[0]?.rows[0]
    if (firstBodyRow?.cells[0]) return firstBodyRow.cells[0] as HTMLTableCellElement

    const firstHeadRow = table.tHead?.rows[0]
    if (firstHeadRow?.cells[0]) return firstHeadRow.cells[0] as HTMLTableCellElement

    return null
  }

  const resizeTableCellFromHover = (axis: "width" | "height", deltaPx: number) => {
    const table = getTableFromHoverUi()
    if (!table) return
    const cell = getTableCellForResize(table)
    if (!cell) return

    const current = axis === "width" ? cell.getBoundingClientRect().width : cell.getBoundingClientRect().height
    const next = Math.max(axis === "width" ? 72 : 30, Math.min(axis === "width" ? 620 : 260, current + deltaPx))
    cell.style.setProperty(axis, `${Math.round(next)}px`)
    table.style.tableLayout = "fixed"
    table.style.width = table.style.width || "100%"
    syncEditorHtml()
    showHoverForTable(table)
  }

  const removeTableFromHover = () => {
    const table = getTableFromHoverUi()
    if (!table) return
    table.remove()
    syncEditorHtml()
    setTableHoverUi((prev) => ({ ...prev, visible: false }))
  }

  const toggleHeaderFromHover = () => {
    const table = getTableFromHoverUi()
    if (!table) return

    const tbody = table.tBodies[0] ?? table.createTBody()
    if (table.tHead) {
      const headRows = Array.from(table.tHead.rows)
      headRows.reverse().forEach((row) => {
        const newRow = tbody.insertRow(0)
        Array.from(row.cells).forEach((cell) => {
          const td = document.createElement("td")
          td.innerHTML = cell.innerHTML || "&nbsp;"
          newRow.appendChild(td)
        })
      })
      table.deleteTHead()
    } else {
      const sourceRow = tbody.rows[0]
      if (!sourceRow) return
      const thead = table.createTHead()
      const headRow = thead.insertRow(0)
      Array.from(sourceRow.cells).forEach((cell) => {
        const th = document.createElement("th")
        th.innerHTML = cell.innerHTML || "Header"
        headRow.appendChild(th)
      })
      tbody.deleteRow(0)
      if (tbody.rows.length === 0) {
        const row = tbody.insertRow(0)
        for (let i = 0; i < headRow.cells.length; i += 1) {
          row.insertCell(i).innerHTML = "&nbsp;"
        }
      }
    }
    syncEditorHtml()
    showHoverForTable(table)
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

  const addTableRowFromHover = () => {
    const table = getTableFromHoverUi()
    if (!table) return
    const cols = Math.max(1, table.rows[0]?.cells.length ?? 1)
    const tbody = table.tBodies[0] ?? table.createTBody()
    const row = tbody.insertRow(-1)
    for (let i = 0; i < cols; i += 1) {
      row.insertCell(-1).innerHTML = "&nbsp;"
    }
    syncEditorHtml()
    showHoverForTable(table)
  }

  const removeTableRowFromHover = () => {
    const table = getTableFromHoverUi()
    if (!table) return
    const tbody = table.tBodies[0]
    if (!tbody || tbody.rows.length <= 1) return
    tbody.deleteRow(tbody.rows.length - 1)
    syncEditorHtml()
    showHoverForTable(table)
  }

  const moveTableStep = (direction: "up" | "down") => {
    const table = getTableFromHoverUi()
    if (!table || !table.parentElement) return
    const siblings = Array.from(table.parentElement.children).filter((el) => el !== table)
    if (siblings.length === 0) return
    if (direction === "up") {
      const prev = table.previousElementSibling
      if (!prev) return
      table.parentElement.insertBefore(table, prev)
    } else {
      const next = table.nextElementSibling
      if (!next) return
      table.parentElement.insertBefore(next, table)
    }
    syncEditorHtml()
    showHoverForTable(table)
  }

  const adjustTableWidthFromHover = (deltaPercent: number) => {
    const table = getTableFromHoverUi()
    if (!table) return
    const current = Number((table.style.width || "100%").replace("%", "")) || 100
    const next = Math.max(35, Math.min(100, current + deltaPercent))
    table.style.width = `${next}%`
    table.style.maxWidth = "100%"
    table.style.tableLayout = "fixed"
    syncEditorHtml()
    showHoverForTable(table)
  }

  const startMoveTableDrag: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    event.preventDefault()
    const table = getTableFromHoverUi()
    if (!table) return
    tableMoveDragRef.current = { table }
    table.classList.add(styles.tableDragging)
  }

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
      const isOverPanel = !!target?.closest(`.${styles.tableHoverPanel}`)
      if (isOverPanel) return
      const table = target?.closest("table")
      if (table && editorEl.contains(table)) {
        if (!tableResizeDragRef.current) {
          const cell = target?.closest("td,th") as HTMLTableCellElement | null
          if (cell) {
            const rect = cell.getBoundingClientRect()
            const edge = 6
            const nearRight = Math.abs(event.clientX - rect.right) <= edge
            const nearBottom = Math.abs(event.clientY - rect.bottom) <= edge
            if (nearRight && nearBottom) {
              editorEl.style.cursor = "nwse-resize"
            } else if (nearRight) {
              editorEl.style.cursor = "col-resize"
            } else if (nearBottom) {
              editorEl.style.cursor = "row-resize"
            } else {
              editorEl.style.cursor = "text"
            }
          } else {
            editorEl.style.cursor = "text"
          }
        }
        showHoverForTable(table as HTMLTableElement)
        return
      }
      editorEl.style.cursor = "text"
      setTableHoverUi((prev) => (prev.visible ? { ...prev, visible: false } : prev))
    }

    const handleMouseDown = (event: MouseEvent) => {
      const editorEl = getEditorElement()
      if (!editorEl) return
      const target = event.target as HTMLElement | null
      const cell = target?.closest("td,th") as HTMLTableCellElement | null
      if (!cell || !editorEl.contains(cell)) return
      const table = cell.closest("table") as HTMLTableElement | null
      const row = cell.parentElement as HTMLTableRowElement | null
      if (!table || !row) return

      const rect = cell.getBoundingClientRect()
      const edge = 6
      const nearRight = Math.abs(event.clientX - rect.right) <= edge
      const nearBottom = Math.abs(event.clientY - rect.bottom) <= edge
      if (!nearRight && !nearBottom) return

      tableResizeDragRef.current = {
        axis: nearRight ? "x" : "y",
        startX: event.clientX,
        startY: event.clientY,
        startSize: nearRight ? rect.width : rect.height,
        table,
        cellIndex: cell.cellIndex,
        row,
      }
      event.preventDefault()
    }

    const handleMouseMoveForDrag = (event: MouseEvent) => {
      const resize = tableResizeDragRef.current
      if (resize) {
        event.preventDefault()
        if (resize.axis === "x") {
          const delta = event.clientX - resize.startX
          const next = Math.max(72, Math.min(720, resize.startSize + delta))
          Array.from(resize.table.rows).forEach((row) => {
            const cell = row.cells[resize.cellIndex]
            if (cell) cell.style.width = `${Math.round(next)}px`
          })
          resize.table.style.tableLayout = "fixed"
          resize.table.style.width = resize.table.style.width || "100%"
        } else {
          const delta = event.clientY - resize.startY
          const next = Math.max(28, Math.min(320, resize.startSize + delta))
          Array.from(resize.row.cells).forEach((cell) => {
            cell.style.height = `${Math.round(next)}px`
          })
        }
        return
      }

      const move = tableMoveDragRef.current
      if (!move) return
      event.preventDefault()
      const editorEl = getEditorElement()
      if (!editorEl) return
      const table = move.table
      if (!editorEl.contains(table)) return

      const siblings = Array.from(editorEl.children).filter((el) => el !== table)
      const before = siblings.find((el) => {
        const rect = el.getBoundingClientRect()
        return event.clientY < rect.top + rect.height / 2
      })
      if (before) {
        editorEl.insertBefore(table, before)
      } else {
        editorEl.appendChild(table)
      }
    }

    const handleMouseUp = () => {
      const resize = tableResizeDragRef.current
      if (resize) {
        tableResizeDragRef.current = null
        syncEditorHtml()
        showHoverForTable(resize.table)
      }

      const move = tableMoveDragRef.current
      if (move) {
        move.table.classList.remove(styles.tableDragging)
        tableMoveDragRef.current = null
        syncEditorHtml()
        showHoverForTable(move.table)
      }
    }

    document.addEventListener("selectionchange", updateSelectionUi)
    window.addEventListener("scroll", updateSelectionUi, true)
    window.addEventListener("resize", updateSelectionUi)
    document.addEventListener("mousemove", updateTableHoverUi)
    document.addEventListener("mousedown", handleMouseDown)
    document.addEventListener("mousemove", handleMouseMoveForDrag)
    document.addEventListener("mouseup", handleMouseUp)
    return () => {
      document.removeEventListener("selectionchange", updateSelectionUi)
      window.removeEventListener("scroll", updateSelectionUi, true)
      window.removeEventListener("resize", updateSelectionUi)
      document.removeEventListener("mousemove", updateTableHoverUi)
      document.removeEventListener("mousedown", handleMouseDown)
      document.removeEventListener("mousemove", handleMouseMoveForDrag)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [syncEditorHtml])

  if (!hasLoaded) {
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
      {isExportingPdf && (
        <div className={styles.exportOverlay} role="status" aria-live="polite" aria-label="Downloading PDF">
          <div className={styles.exportOverlayCard}>
            <div className={styles.exportSpinner} />
            <div className={styles.exportText}>Downloading PDF...</div>
            <div className={styles.exportSubtext}>Please wait while we prepare your file.</div>
          </div>
        </div>
      )}
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
          <button className={`${styles.headerActionButton} ${styles.hideOnMobile}`} onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}>
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </button>
          {session?.user?.id ? (
            <>
              <button className={`${styles.headerActionButton} ${styles.hideOnTablet}`} type="button" title="Current save status">
                {saveState === "saving" ? "Saving…" : saveState === "error" ? "Save Failed" : "Saved"}
              </button>
              <button
                className={`${styles.headerActionButton} ${styles.hideOnTablet}`}
                type="button"
                title="Shared link viewers"
              >
                {shareInfo.isShared ? `Views ${shareInfo.views}` : "Not Shared"}
              </button>
              {shareInfo.isShared && (
                <button className={`${styles.headerActionButton} ${styles.hideOnTablet}`} type="button" title="Share settings">
                  {shareInfo.lockEnabled ? "Locked" : "Open"}{shareInfo.oneTimeView ? " • 1-Time" : ""}
                </button>
              )}
              <button className={styles.headerActionButton} type="button" onClick={() => void persist(title, contentHtml)} title="Save now">
                Save
              </button>
              <button className={styles.headerPrimaryButton} type="button" onClick={handleShare} title="Create view-only link">
                Share View
              </button>
              <UserMenu />
            </>
          ) : (
            <>
              {guestMode && (
                <button className={styles.headerPrimaryButton} type="button" onClick={handleShare} title="Create view-only link">
                  Share View
                </button>
              )}
              <button
                className={styles.headerPrimaryButton}
                type="button"
                onClick={() => signIn("google", { callbackUrl: `/documents/${docId}` })}
                title="Sign in to sync and share"
              >
                Sign In
              </button>
            </>
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
            <div className={styles.tableHoverPanel} style={{ left: tableHoverUi.rightX, top: tableHoverUi.y }}>
              <button className={styles.tableHoverTiny} onMouseDown={startMoveTableDrag} title="Drag to move table">
                Move
              </button>
              <button className={styles.tableHoverTiny} onMouseDown={keepSelectionOnMouseDown} onClick={() => moveTableStep("up")} title="Move table up">
                Up
              </button>
              <button className={styles.tableHoverTiny} onMouseDown={keepSelectionOnMouseDown} onClick={() => moveTableStep("down")} title="Move table down">
                Down
              </button>
              <button className={styles.tableHoverTiny} onMouseDown={keepSelectionOnMouseDown} onClick={addTableColumnFromHover} title="Add column">
                +Col
              </button>
              <button className={styles.tableHoverTiny} onMouseDown={keepSelectionOnMouseDown} onClick={removeTableColumnFromHover} title="Remove column">
                -Col
              </button>
              <button className={styles.tableHoverTiny} onMouseDown={keepSelectionOnMouseDown} onClick={addTableRowFromHover} title="Add row">
                +Row
              </button>
              <button className={styles.tableHoverTiny} onMouseDown={keepSelectionOnMouseDown} onClick={removeTableRowFromHover} title="Remove row">
                -Row
              </button>
              <button className={styles.tableHoverTiny} onMouseDown={keepSelectionOnMouseDown} onClick={() => adjustTableWidthFromHover(-10)} title="Decrease table width">
                T-
              </button>
              <button className={styles.tableHoverTiny} onMouseDown={keepSelectionOnMouseDown} onClick={() => adjustTableWidthFromHover(10)} title="Increase table width">
                T+
              </button>
              <button className={styles.tableHoverTiny} onMouseDown={keepSelectionOnMouseDown} onClick={() => resizeTableCellFromHover("width", -24)} title="Decrease cell width">
                W-
              </button>
              <button className={styles.tableHoverTiny} onMouseDown={keepSelectionOnMouseDown} onClick={() => resizeTableCellFromHover("width", 24)} title="Increase cell width">
                W+
              </button>
              <button className={styles.tableHoverTiny} onMouseDown={keepSelectionOnMouseDown} onClick={() => resizeTableCellFromHover("height", -12)} title="Decrease cell height">
                H-
              </button>
              <button className={styles.tableHoverTiny} onMouseDown={keepSelectionOnMouseDown} onClick={() => resizeTableCellFromHover("height", 12)} title="Increase cell height">
                H+
              </button>
              <button className={styles.tableHoverTiny} onMouseDown={keepSelectionOnMouseDown} onClick={toggleHeaderFromHover} title="Toggle header row">
                Header
              </button>
              <button className={styles.tableHoverTinyDanger} onMouseDown={keepSelectionOnMouseDown} onClick={removeTableFromHover} title="Delete table">
                Delete
              </button>
            </div>
          )}
          <div className={styles.docTitle}>{title.trim().length ? title : "Untitled Document"}</div>
          <div className={styles.docHint}>Type your notes here — use the toolbar for formatting.</div>

          <div
            className={styles.docEditorWrap}
            onMouseDown={(event) => {
              if (event.target !== event.currentTarget) return
              event.preventDefault()
              focusEditorAtEnd()
            }}
          >
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
            const rowsRaw = window.prompt("How many rows?", "3")
            if (rowsRaw === null) return
            const colsRaw = window.prompt("How many columns?", "3")
            if (colsRaw === null) return
            const rows = Math.max(1, Math.min(20, Number(rowsRaw) || 3))
            const cols = Math.max(1, Math.min(10, Number(colsRaw) || 3))
            editorApi.current?.run({ type: "table", rows, cols, header: true })
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
        <div className={styles.bottomSpacer} />
        <button
          className={styles.bottomButton}
          onMouseDown={keepSelectionOnMouseDown}
          onClick={handleDownloadPdf}
          title="Download as PDF"
          disabled={isExportingPdf}
        >
          <Download size={16} />
          {isExportingPdf ? "Preparing..." : "PDF"}
        </button>
        <button className={styles.bottomButton} onMouseDown={keepSelectionOnMouseDown} onClick={() => editorApi.current?.run({ type: "clear" })} title="Clear formatting">
          <Eraser size={16} />
        </button>
      </div>
    </div>
  );
}
