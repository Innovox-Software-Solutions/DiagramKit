"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type SharedDocument = {
  title: string
  contentHtml: string
  updatedAt: string
}

export default function SharedDocumentPage() {
  const params = useParams<{ shareId: string }>()
  const shareId = typeof params?.shareId === "string" ? params.shareId : ""
  const [theme, setTheme] = useState<"dark" | "light">("dark")
  const [doc, setDoc] = useState<SharedDocument | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [errorMessage, setErrorMessage] = useState("")
  const [passcode, setPasscode] = useState("")
  const [submittedPasscode, setSubmittedPasscode] = useState("")
  const [locked, setLocked] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem("diagramkit.docs.theme.v1")
    if (stored === "light" || stored === "dark") {
      setTheme(stored)
      return
    }
    const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)").matches
    setTheme(prefersLight ? "light" : "dark")
  }, [])

  useEffect(() => {
    localStorage.setItem("diagramkit.docs.theme.v1", theme)
  }, [theme])

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      try {
        const query = submittedPasscode.trim().length ? `?passcode=${encodeURIComponent(submittedPasscode.trim())}` : ""
        const res = await fetch(`/api/shared-document/${encodeURIComponent(shareId)}${query}`, {
          method: "GET",
          headers: { Accept: "application/json" },
        })
        const data = (await res.json()) as { error?: string; locked?: boolean } & Partial<SharedDocument>
        if (!res.ok) {
          setLocked(data.locked === true)
          throw new Error(data.error ?? "Unable to load shared document")
        }
        if (cancelled) return
        setLocked(false)
        setDoc({
          title: String(data.title ?? "Untitled Document"),
          contentHtml: typeof data.contentHtml === "string" ? data.contentHtml : "",
          updatedAt: String(data.updatedAt ?? ""),
        })
        setStatus("ready")
      } catch (error) {
        if (cancelled) return
        setStatus("error")
        setErrorMessage(error instanceof Error ? error.message : "Unable to load shared document")
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [shareId, submittedPasscode])

  return (
    <main
      style={{
        minHeight: "100vh",
        background: theme === "dark" ? "#0b1220" : "#f8fafc",
        color: theme === "dark" ? "#e5e7eb" : "#0f172a",
        display: "flex",
        justifyContent: "center",
        padding: "28px 16px 56px",
      }}
    >
      <article style={{ width: "min(980px, 100%)" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
          <button
            onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
            style={{
              border: "1px solid",
              borderColor: theme === "dark" ? "rgba(148, 163, 184, 0.28)" : "rgba(100, 116, 139, 0.3)",
              background: theme === "dark" ? "rgba(2, 6, 23, 0.35)" : "rgba(255, 255, 255, 0.92)",
              color: theme === "dark" ? "#e5e7eb" : "#0f172a",
              borderRadius: 10,
              padding: "8px 12px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </button>
        </div>
        {status === "loading" && <p>Loading shared chat...</p>}
        {status === "error" && (
          <div>
            <p>{errorMessage}</p>
            {locked && (
              <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  type="password"
                  value={passcode}
                  onChange={(event) => setPasscode(event.target.value)}
                  placeholder="Enter passcode"
                  style={{
                    borderRadius: 10,
                    border: "1px solid",
                    borderColor: theme === "dark" ? "rgba(148, 163, 184, 0.3)" : "rgba(100, 116, 139, 0.34)",
                    background: theme === "dark" ? "rgba(15, 23, 42, 0.62)" : "rgba(255,255,255,0.94)",
                    color: theme === "dark" ? "#e5e7eb" : "#0f172a",
                    padding: "8px 10px",
                    minWidth: 220,
                  }}
                />
                <button
                  onClick={() => {
                    setStatus("loading")
                    setSubmittedPasscode(passcode)
                  }}
                  style={{
                    borderRadius: 10,
                    border: "1px solid",
                    borderColor: theme === "dark" ? "rgba(148, 163, 184, 0.3)" : "rgba(100, 116, 139, 0.34)",
                    background: theme === "dark" ? "rgba(30, 41, 59, 0.8)" : "rgba(248,250,252,0.98)",
                    color: theme === "dark" ? "#e5e7eb" : "#0f172a",
                    padding: "8px 12px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Unlock
                </button>
              </div>
            )}
          </div>
        )}
        {status === "ready" && doc && (
          <>
            <h1 style={{ fontSize: 42, fontWeight: 900, margin: 0 }}>{doc.title}</h1>
            <p style={{ marginTop: 8, color: theme === "dark" ? "rgba(226, 232, 240, 0.75)" : "#64748b" }}>
              View only
              {doc.updatedAt ? ` • Updated ${new Date(doc.updatedAt).toLocaleString()}` : ""}
            </p>
            <section
              style={{ marginTop: 22, fontSize: 16, lineHeight: 1.65 }}
              dangerouslySetInnerHTML={{ __html: doc.contentHtml }}
            />
          </>
        )}
      </article>
    </main>
  )
}
