"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { getBoundingBox, renderShapes } from "@/lib/drawing"
import { Shape } from "@/types/shape"

type SharedBoardResponse = {
  id: string
  name: string
  shapes: Shape[]
  updatedAt: string
}

const fitTransform = (
  shapes: Shape[],
  width: number,
  height: number,
): { scale: number; panX: number; panY: number } => {
  if (!shapes.length || width <= 0 || height <= 0) {
    return { scale: 1, panX: 0, panY: 0 }
  }

  const first = getBoundingBox(shapes[0])
  const bounds = shapes.slice(1).reduce(
    (acc, shape) => {
      const box = getBoundingBox(shape)
      return {
        minX: Math.min(acc.minX, box.minX),
        minY: Math.min(acc.minY, box.minY),
        maxX: Math.max(acc.maxX, box.maxX),
        maxY: Math.max(acc.maxY, box.maxY),
      }
    },
    first,
  )

  const contentWidth = Math.max(1, bounds.maxX - bounds.minX)
  const contentHeight = Math.max(1, bounds.maxY - bounds.minY)
  const padding = 48
  const innerWidth = Math.max(1, width - padding * 2)
  const innerHeight = Math.max(1, height - padding * 2)

  const scale = Math.min(innerWidth / contentWidth, innerHeight / contentHeight)
  const panX = (width - contentWidth * scale) / 2 - bounds.minX * scale
  const panY = (height - contentHeight * scale) / 2 - bounds.minY * scale

  return {
    scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
    panX,
    panY,
  }
}

export default function SharedBoardPage() {
  const params = useParams<{ shareId: string }>()
  const shareId = typeof params?.shareId === "string" ? params.shareId : ""
  const [board, setBoard] = useState<SharedBoardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const renderTickRef = useRef(0)

  useEffect(() => {
    if (!shareId) {
      setError("Invalid share link")
      setLoading(false)
      return
    }

    let mounted = true
    const load = async () => {
      try {
        setLoading(true)
        const res = await fetch(`/api/shared/${encodeURIComponent(shareId)}`, {
          cache: "no-store",
        })
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error("This shared diagram was not found.")
          }
          throw new Error("Failed to load shared diagram.")
        }

        const data = (await res.json()) as SharedBoardResponse
        if (!mounted) return
        setBoard({
          id: data.id,
          name: data.name,
          shapes: Array.isArray(data.shapes) ? data.shapes : [],
          updatedAt: data.updatedAt,
        })
        setError("")
      } catch (e) {
        if (!mounted) return
        setBoard(null)
        setError(e instanceof Error ? e.message : "Failed to load shared diagram.")
      } finally {
        if (mounted) setLoading(false)
      }
    }

    load()
    return () => {
      mounted = false
    }
  }, [shareId])

  const imageSources = useMemo(() => {
    if (!board?.shapes?.length) return [] as string[]
    return board.shapes
      .filter(
        (shape): shape is Shape & { type: "image"; imageSrc: string } =>
          shape.type === "image" && typeof shape.imageSrc === "string" && shape.imageSrc.length > 0,
      )
      .map((shape) => shape.imageSrc)
  }, [board])

  useEffect(() => {
    if (!board) return

    imageSources.forEach((src) => {
      if (imageCacheRef.current.has(src)) return
      const img = new Image()
      imageCacheRef.current.set(src, img)
      img.onload = () => {
        renderTickRef.current += 1
        const canvas = canvasRef.current
        const wrapper = wrapperRef.current
        if (!canvas || !wrapper) return
        const rect = wrapper.getBoundingClientRect()
        const transform = fitTransform(board.shapes, rect.width, rect.height)
        const ctx = canvas.getContext("2d")
        if (!ctx) return
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        renderShapes(ctx, board.shapes, [], transform.scale, transform.panX, transform.panY, imageCacheRef.current)
      }
      img.src = src
    })
  }, [board, imageSources])

  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current
      const wrapper = wrapperRef.current
      if (!canvas || !wrapper) return
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      const dpr = window.devicePixelRatio || 1
      const rect = wrapper.getBoundingClientRect()
      canvas.width = Math.max(1, Math.floor(rect.width * dpr))
      canvas.height = Math.max(1, Math.floor(rect.height * dpr))
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, rect.width, rect.height)

      if (!board) return
      const transform = fitTransform(board.shapes, rect.width, rect.height)
      renderShapes(ctx, board.shapes, [], transform.scale, transform.panX, transform.panY, imageCacheRef.current)
    }

    draw()

    const resizeObserver = new ResizeObserver(draw)
    if (wrapperRef.current) {
      resizeObserver.observe(wrapperRef.current)
    }

    window.addEventListener("resize", draw)
    return () => {
      resizeObserver.disconnect()
      window.removeEventListener("resize", draw)
    }
  }, [board, imageSources])

  return (
    <main
      style={{
        width: "100dvw",
        height: "100dvh",
        background: "#f8f9fa",
        display: "grid",
        gridTemplateRows: "64px 1fr",
      }}
    >
      <header
        style={{
          borderBottom: "1px solid #e5e7eb",
          background: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, color: "#6b7280" }}>View only</div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "#111827",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "70vw",
            }}
          >
            {board?.name || "Shared Diagram"}
          </div>
        </div>
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid #d1d5db",
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 13,
            fontWeight: 600,
            color: "#111827",
            textDecoration: "none",
            background: "#fff",
          }}
        >
          Open DiagramKit
        </Link>
      </header>

      <div ref={wrapperRef} style={{ position: "relative", width: "100%", height: "100%" }}>
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />

        {loading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              color: "#374151",
              fontWeight: 600,
              background: "rgba(255,255,255,0.7)",
            }}
          >
            Loading shared diagram...
          </div>
        )}

        {!loading && error && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              color: "#991b1b",
              fontWeight: 600,
              background: "rgba(255,255,255,0.8)",
              padding: 16,
              textAlign: "center",
            }}
          >
            {error}
          </div>
        )}
      </div>
    </main>
  )
}
