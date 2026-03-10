"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useSession } from 'next-auth/react';
import { ZoomIn, ZoomOut, PanelLeftClose, PanelLeftOpen, Plus, Pencil, Check, X, Trash2 } from 'lucide-react';
import { Toolbar } from './Toolbar';
import { UserMenu } from './UserMenu';
import { AuthModal } from './AuthModal';
import { ExportModal, ExportOptions } from './ExportModal';
import { Shape, ToolType, Point, AnchorType, StrokeStyle } from '@/types/shape';
import { renderShapes, hitTest, hitTestHandle, getBoundingBox, getShapeAnchors, getResizeHandles, MathUtils, measureText, renderSelectionBox, shapesIntersect } from '@/lib/drawing';
import styles from './Whiteboard.module.css';

interface BoardRecord {
    id: string;
    name: string;
    shapes: Shape[];
    createdAt: number;
    updatedAt: number;
}

const STORAGE_BOARDS_KEY = 'whiteboard.boards';
const STORAGE_ACTIVE_BOARD_KEY = 'whiteboard.activeBoardId';
const LEGACY_STORAGE_KEY = 'whiteboard';

const DEFAULT_STROKE_COLOR = '#1f2937';
const DEFAULT_FILL_COLOR = '#ffffff';
const DEFAULT_STROKE_WIDTH = 2;
const DEFAULT_STROKE_STYLE: StrokeStyle = 'solid';

const STROKE_PALETTE = ['#1f2937', '#dc2626', '#16a34a', '#2563eb', '#f59e0b', '#111827'];
const FILL_PALETTE = ['transparent', '#fecaca', '#bbf7d0', '#bfdbfe', '#fde68a', '#ffffff'];
const STROKE_WIDTH_OPTIONS = [1, 2, 4];
const STROKE_STYLE_OPTIONS: StrokeStyle[] = ['solid', 'dashed', 'dotted'];

const getToolCursor = (tool: ToolType): string => {
    if (tool === 'text') return 'text';
    if (tool === 'delete') return 'not-allowed';
    if (tool === 'pointer') return 'default';
    if (tool === 'elbow-arrow') return 'crosshair';
    return 'crosshair';
};

const createBoardRecord = (name: string, shapes: Shape[] = []): BoardRecord => {
    const now = Date.now();
    return {
        id: uuidv4(),
        name,
        shapes,
        createdAt: now,
        updatedAt: now,
    };
};

const getNextBoardName = (boards: BoardRecord[]): string => {
    const usedNames = new Set(boards.map(board => board.name.trim().toLowerCase()));
    let index = 1;
    while (usedNames.has(`chat ${index}`)) {
        index += 1;
    }
    return `Chat ${index}`;
};

export const Whiteboard: React.FC = () => {
    // Auth
    const { data: session } = useSession();
    
    // State
    const [shapes, setShapes] = useState<Shape[]>([]);
    const [boards, setBoards] = useState<BoardRecord[]>([]);
    const [activeBoardId, setActiveBoardId] = useState('');
    const [history, setHistory] = useState<Shape[][]>([[]]);
    const [historyIndex, setHistoryIndex] = useState(0);

    const [currentTool, setCurrentTool] = useState<ToolType>('pointer');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [renamingBoardId, setRenamingBoardId] = useState<string | null>(null);
    const [renameInputValue, setRenameInputValue] = useState('');

    const [selectedShapeIds, setSelectedShapeIds] = useState<string[]>([]);
    const [selectionBox, setSelectionBox] = useState<{ startX: number, startY: number, endX: number, endY: number } | null>(null);
    const [hoveredAnchor, setHoveredAnchor] = useState<{ shapeId: string, type: AnchorType } | null>(null);

    // Canvas & Interaction state
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const selectionBoxBaseSelectedIdsRef = useRef<string[]>([]);
    const multiResizeRef = useRef<null | {
        startPointer: Point;
        startBox: { minX: number; minY: number; maxX: number; maxY: number };
        startShapes: Map<string, Shape>;
    }>(null);
    const arrowDraftRef = useRef<null | {
        start?: { shapeId: string; anchor: AnchorType; point: Point };
        end?: { shapeId: string; anchor: AnchorType; point: Point };
    }>(null);
    const clipboardRef = useRef<Shape[] | null>(null);
    const pasteCountRef = useRef(0);
    const [isDrawing, setIsDrawing] = useState(false);
    const [isPanning, setIsPanning] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState<string | null>(null);

    const [startPoint, setStartPoint] = useState<Point | null>(null);
    const [currentPoint, setCurrentPoint] = useState<Point | null>(null);
    const [freehandPoints, setFreehandPoints] = useState<Point[]>([]);
    const [panOffset, setPanOffset] = useState<Point>({ x: 0, y: 0 });
    const [scale, setScale] = useState(1);

    // Text editing state
    const [editingText, setEditingText] = useState<{ id: string, text: string, x: number, y: number, fontSize: number } | null>(null);
    const textInputRef = useRef<HTMLTextAreaElement>(null);

    // Export Modal State
    const [exportModalVisible, setExportModalVisible] = useState(false);
    const [authModalVisible, setAuthModalVisible] = useState(false);
    const [authModalMessage, setAuthModalMessage] = useState('');
    const pendingActionRef = useRef<(() => void) | null>(null);
    const [previewDataUrl, setPreviewDataUrl] = useState('');
    const [customStrokeColor, setCustomStrokeColor] = useState(DEFAULT_STROKE_COLOR);
    const [customFillColor, setCustomFillColor] = useState(DEFAULT_FILL_COLOR);
    const strokeColorInputRef = useRef<HTMLInputElement>(null);
    const fillColorInputRef = useRef<HTMLInputElement>(null);
    const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
    const [imageCacheVersion, setImageCacheVersion] = useState(0);
    const [zoomCursor, setZoomCursor] = useState<'in' | 'out' | null>(null);
    const zoomCursorTimeoutRef = useRef<number | null>(null);
    const [canvasCursor, setCanvasCursor] = useState('default');
    const isSpacePressedRef = useRef(false);

    const minimapCanvasRef = useRef<HTMLCanvasElement>(null);
    const minimapTransformRef = useRef<{ scale: number; panX: number; panY: number } | null>(null);
    const isMinimapDraggingRef = useRef(false);

    const styleTools: ToolType[] = ['pencil', 'rectangle', 'circle', 'diamond', 'rounded-rectangle', 'arrow', 'text'];
    const selectedShapes = shapes.filter(shape => selectedShapeIds.includes(shape.id));
    const styleEligibleSelectedShapes = selectedShapes.filter(shape => shape.type !== 'image');
    const shouldShowStyleSidebar = styleEligibleSelectedShapes.length > 0 || styleTools.includes(currentTool);
    const styleSourceShape = styleEligibleSelectedShapes[0];

    const activeStrokeColor = styleSourceShape?.strokeColor ?? DEFAULT_STROKE_COLOR;
    const activeFillColor = styleSourceShape?.fillColor ?? DEFAULT_FILL_COLOR;
    const activeStrokeWidth = styleSourceShape?.strokeWidth ?? DEFAULT_STROKE_WIDTH;
    const activeStrokeStyle = styleSourceShape?.strokeStyle ?? DEFAULT_STROKE_STYLE;
    const canEditSelectedStyles = styleEligibleSelectedShapes.length > 0;

    // Always start with the boards sidebar closed, including page restores from browser cache.
    useEffect(() => {
        const closeSidebar = () => setIsSidebarOpen(false);
        closeSidebar();
        window.addEventListener('pageshow', closeSidebar);
        return () => {
            window.removeEventListener('pageshow', closeSidebar);
        };
    }, []);

    // Initialize boards from local storage (with migration from legacy single-board key)
    useEffect(() => {
        try {
            const storedBoards = localStorage.getItem(STORAGE_BOARDS_KEY);
            const storedActiveBoardId = localStorage.getItem(STORAGE_ACTIVE_BOARD_KEY);
            let parsedBoards: BoardRecord[] = [];

            if (storedBoards) {
                const decoded = JSON.parse(storedBoards);
                if (Array.isArray(decoded)) {
                    parsedBoards = decoded
                        .map((entry): BoardRecord | null => {
                            if (!entry || typeof entry !== 'object') return null;
                            const now = Date.now();
                            const name = typeof entry.name === 'string' && entry.name.trim().length > 0 ? entry.name.trim() : 'Untitled';
                            const shapesData = Array.isArray(entry.shapes) ? entry.shapes : [];
                            return {
                                id: typeof entry.id === 'string' && entry.id.length > 0 ? entry.id : uuidv4(),
                                name,
                                shapes: shapesData,
                                createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : now,
                                updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : now,
                            };
                        })
                        .filter((entry): entry is BoardRecord => entry !== null);
                }
            }

            if (parsedBoards.length === 0) {
                const legacyBoard = localStorage.getItem(LEGACY_STORAGE_KEY);
                if (legacyBoard) {
                    try {
                        const legacyShapes = JSON.parse(legacyBoard);
                        if (Array.isArray(legacyShapes)) {
                            parsedBoards = [createBoardRecord('Chat 1', legacyShapes)];
                        }
                    } catch (error) {
                        console.error('Failed to migrate legacy board', error);
                    }
                }
            }

            if (parsedBoards.length === 0) {
                parsedBoards = [createBoardRecord('Chat 1', [])];
            }

            const defaultActiveBoardId = storedActiveBoardId && parsedBoards.some(board => board.id === storedActiveBoardId)
                ? storedActiveBoardId
                : parsedBoards[0].id;
            const initialBoard = parsedBoards.find(board => board.id === defaultActiveBoardId) ?? parsedBoards[0];

            // eslint-disable-next-line react-hooks/set-state-in-effect
            setBoards(parsedBoards);
            setActiveBoardId(initialBoard.id);
            setShapes(initialBoard.shapes);
            setHistory([initialBoard.shapes]);
            setHistoryIndex(0);
            localStorage.removeItem(LEGACY_STORAGE_KEY);
        } catch (error) {
            console.error('Failed to initialize boards from local storage', error);
            const fallbackBoard = createBoardRecord('Chat 1', []);
            setBoards([fallbackBoard]);
            setActiveBoardId(fallbackBoard.id);
            setShapes([]);
            setHistory([[]]);
            setHistoryIndex(0);
        }
    }, []);

    // Keep active board shapes synced when drawing changes
    useEffect(() => {
        if (!activeBoardId) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setBoards(prevBoards => {
            const boardIndex = prevBoards.findIndex(board => board.id === activeBoardId);
            if (boardIndex === -1) return prevBoards;

            const currentBoard = prevBoards[boardIndex];
            if (currentBoard.shapes === shapes) return prevBoards;

            const nextBoards = [...prevBoards];
            nextBoards[boardIndex] = {
                ...currentBoard,
                shapes,
                updatedAt: Date.now(),
            };
            return nextBoards;
        });
    }, [shapes, activeBoardId]);

    // Persist board collection + active board to local storage
    useEffect(() => {
        if (!activeBoardId || boards.length === 0) return;
        localStorage.setItem(STORAGE_BOARDS_KEY, JSON.stringify(boards));
        localStorage.setItem(STORAGE_ACTIVE_BOARD_KEY, activeBoardId);
    }, [boards, activeBoardId]);

    useEffect(() => {
        const imageShapes = shapes.filter(
            (shape): shape is Shape & { type: 'image'; imageSrc: string } =>
                shape.type === 'image' && typeof shape.imageSrc === 'string' && shape.imageSrc.length > 0
        );

        imageShapes.forEach((shape) => {
            if (imageCacheRef.current.has(shape.imageSrc)) return;

            const img = new Image();
            imageCacheRef.current.set(shape.imageSrc, img);
            img.onload = () => {
                setImageCacheVersion((version) => version + 1);
            };
            img.onerror = () => {
                imageCacheRef.current.delete(shape.imageSrc);
            };
            img.src = shape.imageSrc;
        });
    }, [shapes]);

    // Push to history
    const saveHistory = useCallback((newShapes: Shape[]) => {
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(newShapes);
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
        setShapes(newShapes);
    }, [history, historyIndex]);

    const undo = () => {
        if (historyIndex > 0) {
            setHistoryIndex(historyIndex - 1);
            setShapes(history[historyIndex - 1]);
            setSelectedShapeIds([]);
        }
    };

    const redo = () => {
        if (historyIndex < history.length - 1) {
            setHistoryIndex(historyIndex + 1);
            setShapes(history[historyIndex + 1]);
            setSelectedShapeIds([]);
        }
    };

    // Render loop
    const renderCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Handle high DPI displays
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.parentElement?.getBoundingClientRect();
        if (rect) {
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            ctx.scale(dpr, dpr);
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Grid (optional) - omitted for pure minimalist look, but nice if needed.

        // Draw all standard shapes
        renderShapes(ctx, shapes, selectedShapeIds, scale, panOffset.x, panOffset.y, imageCacheRef.current);

        // Group selection handles (multi-select)
        if (selectedShapeIds.length > 1) {
            const selected = shapes.filter(s => selectedShapeIds.includes(s.id));
            if (selected.length > 0) {
                const firstBox = getBoundingBox(selected[0]);
                const groupBox = selected.slice(1).reduce((acc, s) => {
                    const b = getBoundingBox(s);
                    return {
                        minX: Math.min(acc.minX, b.minX),
                        minY: Math.min(acc.minY, b.minY),
                        maxX: Math.max(acc.maxX, b.maxX),
                        maxY: Math.max(acc.maxY, b.maxY),
                    };
                }, firstBox);

                const padding = 4;
                const handleShape: Shape = {
                    id: "__group__",
                    type: "rectangle",
                    x: groupBox.minX - padding,
                    y: groupBox.minY - padding,
                    width: (groupBox.maxX - groupBox.minX) + padding * 2,
                    height: (groupBox.maxY - groupBox.minY) + padding * 2,
                    strokeColor: "#0d6efd",
                    fillColor: "transparent",
                };

                ctx.save();
                ctx.translate(panOffset.x, panOffset.y);
                ctx.scale(scale, scale);
                ctx.strokeStyle = "#0d6efd";
                ctx.lineWidth = 1 / scale;
                ctx.setLineDash([5, 5]);
                ctx.strokeRect(handleShape.x, handleShape.y, handleShape.width, handleShape.height);
                ctx.setLineDash([]);

                // Handles
                ctx.fillStyle = "#ffffff";
                ctx.strokeStyle = "#0d6efd";
                ctx.lineWidth = 1.5 / scale;
                const handles = getResizeHandles(handleShape);
                handles.forEach((handle) => {
                    ctx.fillRect(handle.x, handle.y, handle.width, handle.height);
                    ctx.strokeRect(handle.x, handle.y, handle.width, handle.height);
                });

                ctx.restore();
            }
        }

        if (selectionBox) {
            const minX = Math.min(selectionBox.startX, selectionBox.endX);
            const maxX = Math.max(selectionBox.startX, selectionBox.endX);
            const minY = Math.min(selectionBox.startY, selectionBox.endY);
            const maxY = Math.max(selectionBox.startY, selectionBox.endY);
            renderSelectionBox(ctx, { minX, minY, maxX, maxY }, scale, panOffset.x, panOffset.y);
        }

        // Draw current active shape if creating
        if (isDrawing && currentTool === 'pencil' && freehandPoints.length > 0) {
            const pencilBounds = freehandPoints.reduce((acc, point) => ({
                minX: Math.min(acc.minX, point.x),
                minY: Math.min(acc.minY, point.y),
                maxX: Math.max(acc.maxX, point.x),
                maxY: Math.max(acc.maxY, point.y),
            }), {
                minX: freehandPoints[0].x,
                minY: freehandPoints[0].y,
                maxX: freehandPoints[0].x,
                maxY: freehandPoints[0].y,
            });
            const tempPencilShape: Shape = {
                id: 'temp-pencil',
                type: 'pencil',
                x: pencilBounds.minX,
                y: pencilBounds.minY,
                width: Math.max(1, pencilBounds.maxX - pencilBounds.minX),
                height: Math.max(1, pencilBounds.maxY - pencilBounds.minY),
                strokeColor: DEFAULT_STROKE_COLOR,
                fillColor: 'transparent',
                strokeWidth: DEFAULT_STROKE_WIDTH,
                strokeStyle: DEFAULT_STROKE_STYLE,
                points: freehandPoints.map((point) => ({
                    x: point.x - pencilBounds.minX,
                    y: point.y - pencilBounds.minY,
                })),
            };
            renderShapes(ctx, [tempPencilShape], [], scale, panOffset.x, panOffset.y, imageCacheRef.current);
        } else if (isDrawing && startPoint && currentPoint && currentTool !== 'pointer' && currentTool !== 'text' && currentTool !== 'delete') {
            ctx.save();
            ctx.translate(panOffset.x, panOffset.y);
            ctx.scale(scale, scale);

            const width = currentPoint.x - startPoint.x;
            const height = currentPoint.y - startPoint.y;

            const tempShape: Shape = {
                id: 'temp',
                type: currentTool as Shape['type'],
                x: startPoint.x,
                y: startPoint.y,
                width,
                height,
                strokeColor: DEFAULT_STROKE_COLOR,
                fillColor: DEFAULT_FILL_COLOR,
                strokeWidth: DEFAULT_STROKE_WIDTH,
                strokeStyle: DEFAULT_STROKE_STYLE,
            };

            // Ensure draw color is visible during preview
            renderShapes(ctx, [tempShape], [], 1, 0, 0, imageCacheRef.current); // pan is handled in outer restore
            ctx.restore();
        }

        // Draw hover target anchor point if hovering with arrow tool
        if (currentTool === 'arrow' && hoveredAnchor) {
            const shp = shapes.find(s => s.id === hoveredAnchor.shapeId);
            if (shp) {
                ctx.save();
                ctx.translate(panOffset.x, panOffset.y);
                ctx.scale(scale, scale);
                const anchor = getShapeAnchors(shp).find(a => a.type === hoveredAnchor.type);
                if (anchor) {
                    ctx.fillStyle = "#3b82f6";
                    ctx.strokeStyle = "#ffffff";
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(anchor.x, anchor.y, 6, 0, 2 * Math.PI);
                    ctx.fill();
                    ctx.stroke();
                }
                ctx.restore();
            }
        }
    }, [shapes, selectedShapeIds, selectionBox, scale, panOffset, isDrawing, startPoint, currentPoint, currentTool, hoveredAnchor, imageCacheVersion, freehandPoints]);

    useEffect(() => {
        requestAnimationFrame(renderCanvas);
    }, [renderCanvas]);

    useEffect(() => {
        const handleResize = () => requestAnimationFrame(renderCanvas);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [renderCanvas]);

    useEffect(() => {
        return () => {
            if (zoomCursorTimeoutRef.current) {
                window.clearTimeout(zoomCursorTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCanvasCursor(isSpacePressedRef.current ? 'grab' : getToolCursor(currentTool));
    }, [currentTool]);

    const canUseSpacePan = useCallback(() => {
        if (editingText) return false;
        const active = document.activeElement;
        if (!active) return true;
        const tag = active.tagName;
        if (tag === 'TEXTAREA' || tag === 'INPUT') return false;
        if (tag === 'BUTTON' || tag === 'A' || tag === 'SELECT' || tag === 'OPTION') return false;
        if ((active as HTMLElement).isContentEditable) return false;
        return true;
    }, [editingText]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code !== 'Space') return;
            if (!canUseSpacePan()) return;
            if (isSpacePressedRef.current) return;
            e.preventDefault();
            isSpacePressedRef.current = true;
            if (!isPanning && !isDrawing && !isDragging && !isResizing && !selectionBox) {
                setCanvasCursor('grab');
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.code !== 'Space') return;
            if (!isSpacePressedRef.current) return;
            e.preventDefault();
            isSpacePressedRef.current = false;
            if (!isPanning) {
                setCanvasCursor(getToolCursor(currentTool));
            }
        };

        window.addEventListener('keydown', handleKeyDown, { passive: false });
        window.addEventListener('keyup', handleKeyUp, { passive: false });
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [canUseSpacePan, currentTool, isDrawing, isDragging, isPanning, isResizing, selectionBox]);

    // Event Handlers
    const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        // Convert to un-scaled, un-panned coordinates
        return {
            x: (e.clientX - rect.left - panOffset.x) / scale,
            y: (e.clientY - rect.top - panOffset.y) / scale
        };
    };

    const ARROW_SNAP_RADIUS = 18;

    const findClosestAnchor = (point: Point) => {
        // 1) Prefer explicit proximity to an edge anchor (top/bottom/left/right).
        let best: null | { shapeId: string; anchor: AnchorType; point: Point; dist: number } = null;
        for (const s of shapes) {
            if (s.type === 'arrow' || s.type === 'text' || s.type === 'pencil') continue;
            const anchors = getShapeAnchors(s);
            for (const a of anchors) {
                if (a.type === 'center') continue; // edges only
                const d = MathUtils.distance(point, { x: a.x, y: a.y });
                if (d <= ARROW_SNAP_RADIUS && (!best || d < best.dist)) {
                    best = { shapeId: a.shapeId, anchor: a.type, point: { x: a.x, y: a.y }, dist: d };
                }
            }
        }

        if (best) return best;

        // 2) If the pointer is on/inside a shape, snap to the nearest edge (midpoint anchor).
        for (let i = shapes.length - 1; i >= 0; i--) {
            const s = shapes[i];
            if (s.type === 'arrow' || s.type === 'text' || s.type === 'pencil') continue;
            if (!hitTest(s, point.x, point.y)) continue;

            const box = getBoundingBox(s);
            const dTop = Math.abs(point.y - box.minY);
            const dBottom = Math.abs(point.y - box.maxY);
            const dLeft = Math.abs(point.x - box.minX);
            const dRight = Math.abs(point.x - box.maxX);
            const min = Math.min(dTop, dBottom, dLeft, dRight);
            let anchor: AnchorType = 'right';
            if (min === dTop) anchor = 'top';
            else if (min === dBottom) anchor = 'bottom';
            else if (min === dLeft) anchor = 'left';
            else anchor = 'right';

            const snapped = getShapeAnchors(s).find(a => a.type === anchor);
            if (snapped) {
                return { shapeId: snapped.shapeId, anchor: snapped.type, point: { x: snapped.x, y: snapped.y }, dist: 0 };
            }
            break;
        }

        return null;
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);

        // Middle click or Space + Drag to pan
        if (e.button === 1 || (e.button === 0 && isSpacePressedRef.current)) {
            setCanvasCursor('grabbing');
            setIsPanning(true);
            setStartPoint({ x: e.clientX, y: e.clientY });
            return;
        }

        const point = getCanvasPoint(e);

        // Save current point for text edit commit if clicking away
        if (editingText && currentTool !== 'text') {
            commitTextEdit();
        }

        if (currentTool === 'arrow') {
            const snap = findClosestAnchor(point);
            const start = snap ? snap.point : point;
            if (snap) {
                arrowDraftRef.current = { start: { shapeId: snap.shapeId, anchor: snap.anchor, point: start } };
                setHoveredAnchor({ shapeId: snap.shapeId, type: snap.anchor });
            } else {
                arrowDraftRef.current = null;
                setHoveredAnchor(null);
            }
            setCanvasCursor(getToolCursor('arrow'));
            setIsDrawing(true);
            setStartPoint(start);
            setCurrentPoint(start);
            setSelectedShapeIds([]);
            return;
        }

        if (currentTool === 'pointer' || currentTool === 'delete') {
            // Group resize handles (only in pointer mode)
            if (currentTool === 'pointer' && selectedShapeIds.length > 1) {
                const selected = shapes.filter(s => selectedShapeIds.includes(s.id));
                if (selected.length > 0) {
                    const firstBox = getBoundingBox(selected[0]);
                    const groupBox = selected.slice(1).reduce((acc, s) => {
                        const b = getBoundingBox(s);
                        return {
                            minX: Math.min(acc.minX, b.minX),
                            minY: Math.min(acc.minY, b.minY),
                            maxX: Math.max(acc.maxX, b.maxX),
                            maxY: Math.max(acc.maxY, b.maxY),
                        };
                    }, firstBox);
                    const padding = 4;
                    const handleShape: Shape = {
                        id: "__group__",
                        type: "rectangle",
                        x: groupBox.minX - padding,
                        y: groupBox.minY - padding,
                        width: (groupBox.maxX - groupBox.minX) + padding * 2,
                        height: (groupBox.maxY - groupBox.minY) + padding * 2,
                        strokeColor: "#0d6efd",
                        fillColor: "transparent",
                    };
                    const handle = hitTestHandle(handleShape, point.x, point.y);
                    if (handle) {
                        const resizeHandle = getResizeHandles(handleShape).find(item => item.id === handle);
                        if (resizeHandle) setCanvasCursor(resizeHandle.cursor);
                        setIsResizing(handle);
                        setStartPoint(point);
                        multiResizeRef.current = {
                            startPointer: point,
                            startBox: groupBox,
                            startShapes: new Map(selected.map(s => [s.id, { ...s, points: s.points ? s.points.map(p => ({ ...p })) : undefined }])),
                        };
                        return;
                    }
                }
            }

            // Check handles first
            if (selectedShapeIds.length === 1) {
                const selectedShape = shapes.find(s => s.id === selectedShapeIds[0]);
                if (selectedShape) {
                    const handle = hitTestHandle(selectedShape, point.x, point.y);
                    if (handle) {
                        const resizeHandle = getResizeHandles(selectedShape).find(item => item.id === handle);
                        if (resizeHandle) {
                            setCanvasCursor(resizeHandle.cursor);
                        }
                        setIsResizing(handle);
                        setStartPoint(point);
                        return;
                    }
                }
            }

            // Check shapes (reverse for top-down hit detection)
            let hitShapeId = null;
            for (let i = shapes.length - 1; i >= 0; i--) {
                if (hitTest(shapes[i], point.x, point.y)) {
                    hitShapeId = shapes[i].id;
                    break;
                }
            }

            if (hitShapeId) {
                if (currentTool === 'delete') {
                    saveHistory(shapes.filter(s => s.id !== hitShapeId));
                    if (selectedShapeIds.includes(hitShapeId)) setSelectedShapeIds(selectedShapeIds.filter(id => id !== hitShapeId));
                } else {
                    setCanvasCursor('grabbing');
                    if (e.shiftKey) {
                        if (selectedShapeIds.includes(hitShapeId)) {
                            setSelectedShapeIds(selectedShapeIds.filter(id => id !== hitShapeId));
                            return;
                        }
                        setSelectedShapeIds([...selectedShapeIds, hitShapeId]);
                    } else if (!selectedShapeIds.includes(hitShapeId) || selectedShapeIds.length > 1) {
                        setSelectedShapeIds([hitShapeId]);
                    }
                    setIsDragging(true);
                    setStartPoint(point);
                }
            } else {
                if (currentTool === 'pointer') {
                    selectionBoxBaseSelectedIdsRef.current = e.shiftKey ? selectedShapeIds : [];
                    if (!e.shiftKey) setSelectedShapeIds([]);
                    setSelectionBox({ startX: point.x, startY: point.y, endX: point.x, endY: point.y });
                }
            }
        } else if (currentTool === 'pencil') {
            setCanvasCursor('crosshair');
            setIsDrawing(true);
            setStartPoint(point);
            setCurrentPoint(point);
            setFreehandPoints([point]);
            setSelectedShapeIds([]);
        } else if (currentTool === 'text') {
            // Just start text editing
            setCanvasCursor('text');
            const newId = uuidv4();
            setEditingText({ id: newId, text: '', x: point.x, y: point.y, fontSize: 20 });
            setCurrentTool('pointer');
            setTimeout(() => textInputRef.current?.focus(), 0);
        } else {
            // Drawing a shape
            setCanvasCursor(getToolCursor(currentTool));
            setIsDrawing(true);
            setStartPoint(point);
            setCurrentPoint(point);
            setSelectedShapeIds([]);
        }
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (isPanning && startPoint) {
            setCanvasCursor('grabbing');
            setPanOffset({
                x: panOffset.x + (e.clientX - startPoint.x),
                y: panOffset.y + (e.clientY - startPoint.y)
            });
            setStartPoint({ x: e.clientX, y: e.clientY });
            return;
        }

        const point = getCanvasPoint(e);
        if (isDrawing && currentTool === 'arrow') {
            const snap = findClosestAnchor(point);
            const nextPoint = snap ? snap.point : point;
            setCurrentPoint(nextPoint);
            if (snap) {
                setHoveredAnchor({ shapeId: snap.shapeId, type: snap.anchor });
                const existing = arrowDraftRef.current ?? {};
                arrowDraftRef.current = {
                    ...existing,
                    end: { shapeId: snap.shapeId, anchor: snap.anchor, point: snap.point },
                };
            } else {
                setHoveredAnchor(null);
                if (arrowDraftRef.current) {
                    arrowDraftRef.current = { ...arrowDraftRef.current, end: undefined };
                }
            }
            return;
        }

        setCurrentPoint(point);

        if (isDrawing && currentTool === 'pencil') {
            setCanvasCursor('crosshair');
            setFreehandPoints((prevPoints) => {
                if (prevPoints.length === 0) {
                    return [point];
                }

                const lastPoint = prevPoints[prevPoints.length - 1];
                if (MathUtils.distance(lastPoint, point) < 1) {
                    return prevPoints;
                }

                return [...prevPoints, point];
            });
            return;
        }

        if (selectionBox) {
            setCanvasCursor('crosshair');
            setSelectionBox({ ...selectionBox, endX: point.x, endY: point.y });
            const minX = Math.min(selectionBox.startX, point.x);
            const maxX = Math.max(selectionBox.startX, point.x);
            const minY = Math.min(selectionBox.startY, point.y);
            const maxY = Math.max(selectionBox.startY, point.y);

            const newSelectedIds = shapes.filter(s => shapesIntersect(s, { minX, minY, maxX, maxY })).map(s => s.id);
            const base = selectionBoxBaseSelectedIdsRef.current;
            const merged = base.length > 0 ? Array.from(new Set([...base, ...newSelectedIds])) : newSelectedIds;
            setSelectedShapeIds(merged);
            return;
        }

        if (isResizing && multiResizeRef.current && startPoint) {
            const { startPointer, startBox, startShapes } = multiResizeRef.current;
            const dx = point.x - startPointer.x;
            const dy = point.y - startPointer.y;

            let newMinX = startBox.minX;
            let newMinY = startBox.minY;
            let newMaxX = startBox.maxX;
            let newMaxY = startBox.maxY;

            switch (isResizing) {
                case 'se': newMaxX += dx; newMaxY += dy; break;
                case 'sw': newMinX += dx; newMaxY += dy; break;
                case 'ne': newMaxX += dx; newMinY += dy; break;
                case 'nw': newMinX += dx; newMinY += dy; break;
            }

            const minSize = 10;
            if (newMaxX - newMinX < minSize) {
                if (isResizing === 'sw' || isResizing === 'nw') newMinX = newMaxX - minSize;
                else newMaxX = newMinX + minSize;
            }
            if (newMaxY - newMinY < minSize) {
                if (isResizing === 'ne' || isResizing === 'nw') newMinY = newMaxY - minSize;
                else newMaxY = newMinY + minSize;
            }

            const startW = Math.max(1, startBox.maxX - startBox.minX);
            const startH = Math.max(1, startBox.maxY - startBox.minY);
            const scaleX = (newMaxX - newMinX) / startW;
            const scaleY = (newMaxY - newMinY) / startH;

            setShapes(prev => prev.map((shape) => {
                if (!selectedShapeIds.includes(shape.id)) return shape;
                const baseShape = startShapes.get(shape.id);
                if (!baseShape) return shape;

                const box = getBoundingBox(baseShape);
                const boxW = Math.max(1, box.maxX - box.minX);
                const boxH = Math.max(1, box.maxY - box.minY);
                const targetMinX = newMinX + (box.minX - startBox.minX) * scaleX;
                const targetMinY = newMinY + (box.minY - startBox.minY) * scaleY;
                const targetW = boxW * scaleX;
                const targetH = boxH * scaleY;

                const widthSign = baseShape.width >= 0 ? 1 : -1;
                const heightSign = baseShape.height >= 0 ? 1 : -1;

                if (baseShape.type === 'pencil') {
                    const nextPoints = baseShape.points?.map(p => ({
                        x: p.x * scaleX,
                        y: p.y * scaleY,
                    }));
                    return {
                        ...shape,
                        x: targetMinX,
                        y: targetMinY,
                        width: targetW,
                        height: targetH,
                        points: nextPoints,
                    };
                }

                if (baseShape.type === 'text') {
                    const factor = (Math.abs(scaleX) + Math.abs(scaleY)) / 2;
                    const nextFontSize = Math.max(10, Math.round((baseShape.fontSize || 20) * factor));
                    const dims = measureText(baseShape.text || '', nextFontSize);
                    return { ...shape, x: targetMinX, y: targetMinY, width: dims.width, height: dims.height, fontSize: nextFontSize };
                }

                const nextX = widthSign >= 0 ? targetMinX : targetMinX + targetW;
                const nextY = heightSign >= 0 ? targetMinY : targetMinY + targetH;
                const nextW = widthSign >= 0 ? targetW : -targetW;
                const nextH = heightSign >= 0 ? targetH : -targetH;

                return { ...shape, x: nextX, y: nextY, width: nextW, height: nextH };
            }));
        } else if (isResizing && selectedShapeIds.length === 1 && startPoint) {
            const selectedShapeId = selectedShapeIds[0];
            const resizingShape = shapes.find(s => s.id === selectedShapeId);
            if (resizingShape) {
                const resizeHandle = getResizeHandles(resizingShape).find(handle => handle.id === isResizing);
                if (resizeHandle) {
                    setCanvasCursor(resizeHandle.cursor);
                }
            }
            setShapes(prev => prev.map(s => {
                if (s.id !== selectedShapeId) return s;
                // Basic resize logic (can be complex, kept simple here to change width/height)
                const dx = point.x - startPoint.x;
                const dy = point.y - startPoint.y;
                let newX = s.x;
                let newY = s.y;
                let newW = s.width;
                let newH = s.height;

                switch (isResizing) {
                    case 'se': newW += dx; newH += dy; break;
                    case 'sw': newX += dx; newW -= dx; newH += dy; break;
                    case 'ne': newY += dy; newW += dx; newH -= dy; break;
                    case 'nw': newX += dx; newY += dy; newW -= dx; newH -= dy; break;
                }

                if (s.type === 'text') {
                    // Proportionally scale font size along with height stretch
                    const ratio = newH / Math.max(1, s.height);
                    const newFontSize = Math.max(10, Math.round((s.fontSize || 20) * ratio));
                    const dims = measureText(s.text || '', newFontSize);
                    return { ...s, x: newX, y: newY, width: dims.width, height: dims.height, fontSize: newFontSize };
                }

                return { ...s, x: newX, y: newY, width: newW, height: newH };
            }));
            setStartPoint(point); // iter step
        } else if (isDragging && selectedShapeIds.length > 0 && startPoint) {
            setCanvasCursor('grabbing');
            const dx = point.x - startPoint.x;
            const dy = point.y - startPoint.y;
            setShapes(prev => prev.map(s => {
                if (!selectedShapeIds.includes(s.id)) return s;
                return { ...s, x: s.x + dx, y: s.y + dy };
            }));
            setStartPoint(point);
        } else if (e.ctrlKey || e.metaKey) {
            setCanvasCursor('zoom-in');
        } else if (currentTool === 'pointer') {
            if (selectedShapeIds.length === 1) {
                const selectedShape = shapes.find(s => s.id === selectedShapeIds[0]);
                if (selectedShape) {
                    const hoveredHandle = getResizeHandles(selectedShape).find(handle => (
                        point.x >= handle.x &&
                        point.x <= handle.x + handle.width &&
                        point.y >= handle.y &&
                        point.y <= handle.y + handle.height
                    ));
                    if (hoveredHandle) {
                        setCanvasCursor(hoveredHandle.cursor);
                    } else {
                        const hoveredShape = shapes.some(shape => hitTest(shape, point.x, point.y));
                        setCanvasCursor(hoveredShape ? 'move' : 'default');
                    }
                } else {
                    const hoveredShape = shapes.some(shape => hitTest(shape, point.x, point.y));
                    setCanvasCursor(hoveredShape ? 'move' : 'default');
                }
            } else {
                if (selectedShapeIds.length > 1) {
                    const selected = shapes.filter(s => selectedShapeIds.includes(s.id));
                    if (selected.length > 0) {
                        const firstBox = getBoundingBox(selected[0]);
                        const groupBox = selected.slice(1).reduce((acc, s) => {
                            const b = getBoundingBox(s);
                            return {
                                minX: Math.min(acc.minX, b.minX),
                                minY: Math.min(acc.minY, b.minY),
                                maxX: Math.max(acc.maxX, b.maxX),
                                maxY: Math.max(acc.maxY, b.maxY),
                            };
                        }, firstBox);
                        const padding = 4;
                        const handleShape: Shape = {
                            id: "__group__",
                            type: "rectangle",
                            x: groupBox.minX - padding,
                            y: groupBox.minY - padding,
                            width: (groupBox.maxX - groupBox.minX) + padding * 2,
                            height: (groupBox.maxY - groupBox.minY) + padding * 2,
                            strokeColor: "#0d6efd",
                            fillColor: "transparent",
                        };
                        const hoveredHandle = getResizeHandles(handleShape).find(handle => (
                            point.x >= handle.x &&
                            point.x <= handle.x + handle.width &&
                            point.y >= handle.y &&
                            point.y <= handle.y + handle.height
                        ));
                        if (hoveredHandle) {
                            setCanvasCursor(hoveredHandle.cursor);
                        } else {
                            const hoveredShape = shapes.some(shape => hitTest(shape, point.x, point.y));
                            setCanvasCursor(hoveredShape ? 'move' : 'default');
                        }
                    } else {
                        const hoveredShape = shapes.some(shape => hitTest(shape, point.x, point.y));
                        setCanvasCursor(hoveredShape ? 'move' : 'default');
                    }
                } else {
                    const hoveredShape = shapes.some(shape => hitTest(shape, point.x, point.y));
                    setCanvasCursor(hoveredShape ? 'move' : 'default');
                }
            }
        } else {
            setCanvasCursor(getToolCursor(currentTool));
        }

        // Pointer hover effects (for arrow anchors)
        if (currentTool === 'arrow' && !isDrawing) {
            const snap = findClosestAnchor(point);
            if (snap) setHoveredAnchor({ shapeId: snap.shapeId, type: snap.anchor });
            else if (hoveredAnchor) setHoveredAnchor(null);
        } else if (currentTool !== 'arrow' && hoveredAnchor) {
            setHoveredAnchor(null);
        }
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
        (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);

        if (isPanning) {
            setIsPanning(false);
            setStartPoint(null);
            setCanvasCursor(isSpacePressedRef.current ? 'grab' : getToolCursor(currentTool));
            return;
        }

        if (isResizing) {
            setIsResizing(null);
            setStartPoint(null);
            multiResizeRef.current = null;
            setCanvasCursor(getToolCursor(currentTool));
            saveHistory(shapes); // Commit resize
            return;
        }

        if (selectionBox) {
            setSelectionBox(null);
            setCanvasCursor(getToolCursor(currentTool));
            return;
        }

        if (isDragging) {
            setIsDragging(false);
            setCanvasCursor(isSpacePressedRef.current ? 'grab' : getToolCursor(currentTool));
            saveHistory(shapes); // Commit move
            return;
        }

        if (isDrawing && currentTool === 'pencil') {
            if (freehandPoints.length > 0) {
                const bounds = freehandPoints.reduce((acc, point) => ({
                    minX: Math.min(acc.minX, point.x),
                    minY: Math.min(acc.minY, point.y),
                    maxX: Math.max(acc.maxX, point.x),
                    maxY: Math.max(acc.maxY, point.y),
                }), {
                    minX: freehandPoints[0].x,
                    minY: freehandPoints[0].y,
                    maxX: freehandPoints[0].x,
                    maxY: freehandPoints[0].y,
                });

                const newShape: Shape = {
                    id: uuidv4(),
                    type: 'pencil',
                    x: bounds.minX,
                    y: bounds.minY,
                    width: Math.max(1, bounds.maxX - bounds.minX),
                    height: Math.max(1, bounds.maxY - bounds.minY),
                    strokeColor: DEFAULT_STROKE_COLOR,
                    fillColor: 'transparent',
                    strokeWidth: DEFAULT_STROKE_WIDTH,
                    strokeStyle: DEFAULT_STROKE_STYLE,
                    points: freehandPoints.map((point) => ({
                        x: point.x - bounds.minX,
                        y: point.y - bounds.minY,
                    })),
                };
                saveHistory([...shapes, newShape]);
                setSelectedShapeIds([newShape.id]);
            }
            setCanvasCursor(getToolCursor('pencil'));
            setIsDrawing(false);
            setStartPoint(null);
            setCurrentPoint(null);
            setFreehandPoints([]);
            return;
        }

        if (isDrawing && startPoint && currentPoint && currentTool !== 'pointer' && currentTool !== 'text') {
            const width = currentPoint.x - startPoint.x;
            const height = currentPoint.y - startPoint.y;

            // Smart arrow connection logic
            let startShapeId, endShapeId, startAnchor, endAnchor;
            if (currentTool === 'arrow') {
                const draft = arrowDraftRef.current;
                const start = draft?.start ?? findClosestAnchor(startPoint);
                const end = draft?.end ?? findClosestAnchor(currentPoint);

                if (start && 'shapeId' in start) {
                    startShapeId = start.shapeId;
                    startAnchor = start.anchor;
                }
                if (end && 'shapeId' in end) {
                    endShapeId = end.shapeId;
                    endAnchor = end.anchor;
                }
            }

            // Prevent microscopic shapes (unless it's a smart arrow connecting two different shapes which might be entirely dynamically sized)
            if (Math.abs(width) > 5 || Math.abs(height) > 5 || (startShapeId && endShapeId && startShapeId !== endShapeId)) {
                const newShape: Shape = {
                    id: uuidv4(),
                    type: currentTool as Shape['type'],
                    x: startPoint.x,
                    y: startPoint.y,
                    width,
                    height,
                    strokeColor: DEFAULT_STROKE_COLOR,
                    fillColor: 'transparent',
                    strokeWidth: DEFAULT_STROKE_WIDTH,
                    strokeStyle: DEFAULT_STROKE_STYLE,
                    startShapeId,
                    endShapeId,
                    startAnchor,
                    endAnchor
                };
                saveHistory([...shapes, newShape]);
                if (currentTool !== 'arrow' && currentTool !== 'pencil') {
                    setCurrentTool('pointer');
                }
                setSelectedShapeIds([newShape.id]);
            }
            setCanvasCursor(getToolCursor(currentTool === 'arrow' ? 'arrow' : 'pointer'));
            setIsDrawing(false);
            setStartPoint(null);
            setCurrentPoint(null);
            setFreehandPoints([]);
            arrowDraftRef.current = null;
        }
    };

    const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        // Double click creates text or edits existing text
        if (currentTool !== 'pointer' && currentTool !== 'text') return;

        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        const point = {
            x: (e.clientX - rect.left - panOffset.x) / scale,
            y: (e.clientY - rect.top - panOffset.y) / scale
        };

        // Check if double clicking on existing text shape
        let hitTextShape = null;
        for (let i = shapes.length - 1; i >= 0; i--) {
            const s = shapes[i];
            if (s.type === 'text' && hitTest(s, point.x, point.y)) {
                hitTextShape = s;
                break;
            }
        }

        if (hitTextShape) {
            // Edit existing
            setEditingText({ id: hitTextShape.id, text: hitTextShape.text || '', x: hitTextShape.x, y: hitTextShape.y, fontSize: hitTextShape.fontSize || 20 });
            // Hide the actual shape while editing so it doesn't double-render
            setShapes(prev => prev.filter(s => s.id !== hitTextShape!.id));
        } else {
            // Create New
            setEditingText({ id: uuidv4(), text: '', x: point.x, y: point.y, fontSize: 20 });
        }

        setCurrentTool('pointer');
        setTimeout(() => textInputRef.current?.focus(), 0);
    };

    const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            // Lowered sensitivity based on user feedback
            const zoomSensitivity = 0.0005;
            const delta = -e.deltaY * zoomSensitivity;
            const newScale = Math.min(Math.max(0.1, scale + delta), 5);
            showZoomCursor(delta >= 0 ? 'in' : 'out');

            // Zoom towards mouse pointer
            const rect = canvasRef.current?.getBoundingClientRect();
            if (rect) {
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;

                const newPanX = mouseX - (mouseX - panOffset.x) * (newScale / scale);
                const newPanY = mouseY - (mouseY - panOffset.y) * (newScale / scale);

                setScale(newScale);
                setPanOffset({ x: newPanX, y: newPanY });
            }
        } else {
            // Pan
            setPanOffset({
                x: panOffset.x - e.deltaX,
                y: panOffset.y - e.deltaY
            });
        }
    };

    const panToWorldPoint = useCallback((world: Point) => {
        const boardCanvas = canvasRef.current;
        const rect = boardCanvas?.parentElement?.getBoundingClientRect();
        if (!rect) return;
        setPanOffset({
            x: (rect.width / 2) - (world.x * scale),
            y: (rect.height / 2) - (world.y * scale),
        });
    }, [scale]);

    const getMinimapWorldPoint = useCallback((e: React.PointerEvent<HTMLCanvasElement>): Point | null => {
        const minimap = minimapCanvasRef.current;
        const t = minimapTransformRef.current;
        if (!minimap || !t) return null;
        const rect = minimap.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        return {
            x: (x - t.panX) / t.scale,
            y: (y - t.panY) / t.scale,
        };
    }, []);

    const handleMinimapPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
        isMinimapDraggingRef.current = true;
        const world = getMinimapWorldPoint(e);
        if (world) panToWorldPoint(world);
    };

    const handleMinimapPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!isMinimapDraggingRef.current) return;
        const world = getMinimapWorldPoint(e);
        if (world) panToWorldPoint(world);
    };

    const handleMinimapPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
        (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);
        isMinimapDraggingRef.current = false;
    };

    const renderMinimap = useCallback(() => {
        const minimap = minimapCanvasRef.current;
        const boardCanvas = canvasRef.current;
        if (!minimap || !boardCanvas) return;
        const ctx = minimap.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const rect = minimap.getBoundingClientRect();
        const boardRect = boardCanvas.parentElement?.getBoundingClientRect();
        if (!boardRect) return;

        minimap.width = Math.max(1, Math.floor(rect.width * dpr));
        minimap.height = Math.max(1, Math.floor(rect.height * dpr));
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        ctx.clearRect(0, 0, rect.width, rect.height);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.fillRect(0, 0, rect.width, rect.height);

        const viewportWorld = {
            x: (-panOffset.x) / scale,
            y: (-panOffset.y) / scale,
            width: boardRect.width / scale,
            height: boardRect.height / scale,
        };

        let minX = viewportWorld.x;
        let minY = viewportWorld.y;
        let maxX = viewportWorld.x + viewportWorld.width;
        let maxY = viewportWorld.y + viewportWorld.height;

        if (shapes.length > 0) {
            const first = getBoundingBox(shapes[0]);
            minX = first.minX;
            minY = first.minY;
            maxX = first.maxX;
            maxY = first.maxY;

            for (let i = 1; i < shapes.length; i++) {
                const b = getBoundingBox(shapes[i]);
                minX = Math.min(minX, b.minX);
                minY = Math.min(minY, b.minY);
                maxX = Math.max(maxX, b.maxX);
                maxY = Math.max(maxY, b.maxY);
            }

            minX = Math.min(minX, viewportWorld.x);
            minY = Math.min(minY, viewportWorld.y);
            maxX = Math.max(maxX, viewportWorld.x + viewportWorld.width);
            maxY = Math.max(maxY, viewportWorld.y + viewportWorld.height);
        }

        const boundsW = Math.max(1, maxX - minX);
        const boundsH = Math.max(1, maxY - minY);
        const paddingPx = 10;
        const usableW = Math.max(1, rect.width - paddingPx * 2);
        const usableH = Math.max(1, rect.height - paddingPx * 2);
        const miniScale = Math.min(usableW / boundsW, usableH / boundsH);

        const panX = paddingPx - minX * miniScale;
        const panY = paddingPx - minY * miniScale;
        minimapTransformRef.current = { scale: miniScale, panX, panY };

        renderShapes(ctx, shapes, [], miniScale, panX, panY, imageCacheRef.current);

        const vx = panX + viewportWorld.x * miniScale;
        const vy = panY + viewportWorld.y * miniScale;
        const vw = viewportWorld.width * miniScale;
        const vh = viewportWorld.height * miniScale;

        ctx.save();
        ctx.fillStyle = 'rgba(59, 130, 246, 0.12)';
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.9)';
        ctx.lineWidth = 1;
        ctx.fillRect(vx, vy, vw, vh);
        ctx.strokeRect(vx, vy, vw, vh);
        ctx.restore();

        ctx.strokeStyle = 'rgba(17, 24, 39, 0.18)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, rect.width - 1, rect.height - 1);
    }, [panOffset.x, panOffset.y, scale, shapes, imageCacheVersion]);

    useEffect(() => {
        requestAnimationFrame(renderMinimap);
    }, [renderMinimap]);

    useEffect(() => {
        const handleResize = () => requestAnimationFrame(renderMinimap);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [renderMinimap]);

    // Text tool commit
    const commitTextEdit = () => {
        if (editingText && editingText.text.trim().length > 0) {
            const dims = measureText(editingText.text, editingText.fontSize);
            const newShape: Shape = {
                id: editingText.id,
                type: 'text',
                x: editingText.x,
                y: editingText.y,
                width: dims.width,
                height: dims.height,
                strokeColor: DEFAULT_STROKE_COLOR,
                fillColor: 'transparent',
                strokeWidth: DEFAULT_STROKE_WIDTH,
                strokeStyle: DEFAULT_STROKE_STYLE,
                text: editingText.text,
                fontSize: editingText.fontSize
            };
            saveHistory([...shapes, newShape]);
            setSelectedShapeIds([newShape.id]);
        }
        setEditingText(null);
    };

    // Keyboard bindings
    useEffect(() => {
        const deepCloneShape = (shape: Shape): Shape => ({
            ...shape,
            points: shape.points ? shape.points.map(p => ({ ...p })) : undefined,
        });

        const getSelectedShapesInOrder = (): Shape[] => {
            if (selectedShapeIds.length === 0) return [];
            const selectedSet = new Set(selectedShapeIds);
            return shapes.filter(s => selectedSet.has(s.id)).map(deepCloneShape);
        };

        const pasteShapes = (sourceShapes: Shape[]) => {
            if (sourceShapes.length === 0) return;

            pasteCountRef.current += 1;
            const offset = 24 * pasteCountRef.current;

            const idMap = new Map<string, string>();
            for (const s of sourceShapes) {
                idMap.set(s.id, uuidv4());
            }

            const next = sourceShapes.map((s) => {
                const nextId = idMap.get(s.id) ?? uuidv4();
                const nextShape: Shape = {
                    ...deepCloneShape(s),
                    id: nextId,
                    x: s.x + offset,
                    y: s.y + offset,
                };

                if (s.type === 'arrow') {
                    const nextStartId = s.startShapeId ? idMap.get(s.startShapeId) : undefined;
                    const nextEndId = s.endShapeId ? idMap.get(s.endShapeId) : undefined;

                    // Only keep smart-linking if both endpoints are part of the paste.
                    if (nextStartId && nextEndId) {
                        nextShape.startShapeId = nextStartId;
                        nextShape.endShapeId = nextEndId;
                    } else {
                        delete nextShape.startShapeId;
                        delete nextShape.endShapeId;
                        delete nextShape.startAnchor;
                        delete nextShape.endAnchor;
                    }
                }

                return nextShape;
            });

            saveHistory([...shapes, ...next]);
            setSelectedShapeIds(next.map(s => s.id));
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            const isEditingText = document.activeElement?.tagName === 'TEXTAREA';
            const isMeta = e.ctrlKey || e.metaKey;
            const key = e.key.toLowerCase();

            if (isMeta && key === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    redo();
                } else {
                    undo();
                }
            } else if (isMeta && key === 'y') {
                e.preventDefault();
                redo();
            } else if (isMeta && key === 'a' && !isEditingText) {
                e.preventDefault();
                setSelectedShapeIds(shapes.map(s => s.id));
            } else if (isMeta && key === 'c' && !isEditingText) {
                if (selectedShapeIds.length === 0) return;
                e.preventDefault();
                clipboardRef.current = getSelectedShapesInOrder();
                pasteCountRef.current = 0;
            } else if (isMeta && key === 'v' && !isEditingText) {
                if (!clipboardRef.current || clipboardRef.current.length === 0) return;
                e.preventDefault();
                pasteShapes(clipboardRef.current);
            } else if (isMeta && key === 'd' && !isEditingText) {
                // Duplicate selection (browser default is bookmark on Ctrl+D)
                if (selectedShapeIds.length === 0) return;
                e.preventDefault();
                pasteCountRef.current = 0;
                pasteShapes(getSelectedShapesInOrder());
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                // Only delete if we're not editing text
                if (selectedShapeIds.length > 0 && document.activeElement?.tagName !== 'TEXTAREA') {
                    saveHistory(shapes.filter(s => !selectedShapeIds.includes(s.id)));
                    setSelectedShapeIds([]);
                }
            } else if (e.key === 'Escape') {
                setSelectedShapeIds([]);
                commitTextEdit();
                setCurrentTool('pointer');
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [shapes, selectedShapeIds, editingText, historyIndex, undo, redo, saveHistory]);

    const isTextSelected = currentTool === 'text' || (selectedShapeIds.length > 0 && selectedShapeIds.some(id => shapes.find(s => s.id === id)?.type === 'text'));

    const handleIncreaseFontSize = () => {
        if (selectedShapeIds.length > 0) {
            let changed = false;
            const nextShapes = shapes.map(s => {
                if (selectedShapeIds.includes(s.id) && s.type === 'text') {
                    const newFontSize = (s.fontSize || 20) + 2;
                    const dims = measureText(s.text || '', newFontSize);
                    changed = true;
                    return { ...s, fontSize: newFontSize, width: dims.width, height: dims.height };
                }
                return s;
            });
            if (changed) saveHistory(nextShapes);
        }
    };

    const handleDecreaseFontSize = () => {
        if (selectedShapeIds.length > 0) {
            let changed = false;
            const nextShapes = shapes.map(s => {
                if (selectedShapeIds.includes(s.id) && s.type === 'text') {
                    const newFontSize = Math.max(10, (s.fontSize || 20) - 2);
                    const dims = measureText(s.text || '', newFontSize);
                    changed = true;
                    return { ...s, fontSize: newFontSize, width: dims.width, height: dims.height };
                }
                return s;
            });
            if (changed) saveHistory(nextShapes);
        }
    };

    const handleOpenExport = () => {
        if (!canvasRef.current) return;
        const dataUrl = canvasRef.current.toDataURL('image/png');
        setPreviewDataUrl(dataUrl);
        setExportModalVisible(true);
    };

    const getExportCanvas = (bgColor: string) => {
        if (!canvasRef.current) return null;
        if (bgColor === 'transparent') {
            return canvasRef.current;
        }

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvasRef.current.width;
        tempCanvas.height = canvasRef.current.height;
        const ctx = tempCanvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
            ctx.drawImage(canvasRef.current, 0, 0);
        }
        return tempCanvas;
    };

    const handleExportPNG = (opts: ExportOptions) => {
        if (!session) {
            pendingActionRef.current = () => handleExportPNG(opts);
            setAuthModalMessage('Sign in to export and download your drawings as images.');
            setAuthModalVisible(true);
            return;
        }
        
        const c = getExportCanvas(opts.backgroundColor);
        if (!c) return;
        const dataUrl = c.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = 'whiteboard-export.png';
        link.href = dataUrl;
        link.click();
    };

    const handleExportJPG = (opts: ExportOptions) => {
        if (!session) {
            pendingActionRef.current = () => handleExportJPG(opts);
            setAuthModalMessage('Sign in to export and download your drawings as images.');
            setAuthModalVisible(true);
            return;
        }
        
        const bgColor = opts.backgroundColor === 'transparent' ? '#ffffff' : opts.backgroundColor;
        const c = getExportCanvas(bgColor);
        if (!c) return;
        const jpgUrl = c.toDataURL('image/jpeg', 1.0);
        const link = document.createElement('a');
        link.download = 'whiteboard-export.jpg';
        link.href = jpgUrl;
        link.click();
    };

    const handleCopyClipboard = async (opts: ExportOptions) => {
        const c = getExportCanvas(opts.backgroundColor);
        if (!c) return;
        try {
            c.toBlob(async (blob) => {
                if (blob) {
                    await navigator.clipboard.write([
                        new ClipboardItem({ 'image/png': blob })
                    ]);
                    alert('Copied to clipboard!');
                }
            }, 'image/png');
        } catch (e) {
            console.error('Failed to copy', e);
            alert('Clipboard API is not supported or permission denied.');
        }
    };

    const handleSaveFile = () => {
        if (!session) {
            setAuthModalMessage('Sign in to save and share your work with others.');
            setAuthModalVisible(true);
            return;
        }
        
        try {
            const jsonString = JSON.stringify(shapes);
            const encodedData = btoa(encodeURIComponent(jsonString));
            const blob = new Blob([encodedData], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.download = 'drawing.ivxboard';
            link.href = url;
            link.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error('Failed to save file:', e);
            alert('Failed to generate save file.');
        }
    };

    const handleLoadFile = () => {
        if (!session) {
            setAuthModalMessage('Sign in to import and load saved drawings.');
            setAuthModalVisible(true);
            return;
        }
        
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.ivxboard';
        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const encodedData = e.target?.result as string;
                    const jsonString = decodeURIComponent(atob(encodedData));
                    const data = JSON.parse(jsonString);
                    setShapes(data);
                    setHistory([data]);
                    setHistoryIndex(0);
                    setSelectedShapeIds([]);
                } catch (err) {
                    console.error('Failed to load file:', err);
                    alert('Invalid or corrupted board file.');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };

    const insertImageShape = (loadedImage: HTMLImageElement, imageSrc: string, imageName: string) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        const naturalWidth = Math.max(1, loadedImage.naturalWidth || loadedImage.width);
        const naturalHeight = Math.max(1, loadedImage.naturalHeight || loadedImage.height);
        const maxWidth = rect ? Math.max(220, (rect.width - 48) / scale) : 420;
        const maxHeight = rect ? Math.max(180, (rect.height - 140) / scale) : 320;
        const fitRatio = Math.min(1, maxWidth / naturalWidth, maxHeight / naturalHeight);
        const width = Math.max(48, Math.round(naturalWidth * fitRatio));
        const height = Math.max(48, Math.round(naturalHeight * fitRatio));
        const centerX = rect ? ((rect.width / 2) - panOffset.x) / scale : width / 2 + 40;
        const centerY = rect ? ((rect.height / 2) - panOffset.y) / scale : height / 2 + 40;

        imageCacheRef.current.set(imageSrc, loadedImage);
        setImageCacheVersion((version) => version + 1);

        const newShape: Shape = {
            id: uuidv4(),
            type: 'image',
            x: centerX - width / 2,
            y: centerY - height / 2,
            width,
            height,
            strokeColor: DEFAULT_STROKE_COLOR,
            fillColor: 'transparent',
            strokeWidth: DEFAULT_STROKE_WIDTH,
            strokeStyle: DEFAULT_STROKE_STYLE,
            imageSrc,
            imageName,
        };

        saveHistory([...shapes, newShape]);
        setSelectedShapeIds([newShape.id]);
        setCurrentTool('pointer');
    };

    const handleAddImage = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (event) => {
            const file = (event.target as HTMLInputElement).files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (loadEvent) => {
                const imageSrc = loadEvent.target?.result;
                if (typeof imageSrc !== 'string') {
                    alert('Failed to read image file.');
                    return;
                }

                const loadedImage = new Image();
                loadedImage.onload = () => {
                    insertImageShape(loadedImage, imageSrc, file.name);
                };
                loadedImage.onerror = () => {
                    alert('Failed to load image.');
                };
                loadedImage.src = imageSrc;
            };
            reader.readAsDataURL(file);
        };
        input.click();
    };

    const sortedBoards = [...boards].sort((a, b) => b.updatedAt - a.updatedAt);

    const handleCreateNewBoard = () => {
        const newBoard = createBoardRecord(getNextBoardName(boards), []);
        setBoards(prevBoards => [newBoard, ...prevBoards]);
        setActiveBoardId(newBoard.id);
        setShapes([]);
        setHistory([[]]);
        setHistoryIndex(0);
        setSelectedShapeIds([]);
        setSelectionBox(null);
        setHoveredAnchor(null);
        setEditingText(null);
        setCurrentTool('pointer');
        setPanOffset({ x: 0, y: 0 });
        setScale(1);
        setRenamingBoardId(null);
        setRenameInputValue('');
    };

    const handleSwitchBoard = (boardId: string) => {
        const board = boards.find(item => item.id === boardId);
        if (!board) return;
        setActiveBoardId(board.id);
        setShapes(board.shapes);
        setHistory([board.shapes]);
        setHistoryIndex(0);
        setSelectedShapeIds([]);
        setSelectionBox(null);
        setHoveredAnchor(null);
        setEditingText(null);
        setCurrentTool('pointer');
        setRenamingBoardId(null);
        setRenameInputValue('');
    };

    const handleRenameStart = (board: BoardRecord) => {
        setRenamingBoardId(board.id);
        setRenameInputValue(board.name);
    };

    const handleRenameCancel = () => {
        setRenamingBoardId(null);
        setRenameInputValue('');
    };

    const handleRenameCommit = () => {
        if (!renamingBoardId) return;
        const trimmedName = renameInputValue.trim();
        if (!trimmedName) return;
        setBoards(prevBoards => prevBoards.map(board => {
            if (board.id !== renamingBoardId) return board;
            return {
                ...board,
                name: trimmedName,
                updatedAt: Date.now(),
            };
        }));
        setRenamingBoardId(null);
        setRenameInputValue('');
    };

    const handleDeleteBoard = (boardId: string) => {
        const remainingBoards = boards.filter(board => board.id !== boardId);

        if (remainingBoards.length === 0) {
            const freshBoard = createBoardRecord('Chat 1', []);
            setBoards([freshBoard]);
            setActiveBoardId(freshBoard.id);
            setShapes([]);
            setHistory([[]]);
            setHistoryIndex(0);
            setSelectedShapeIds([]);
            setSelectionBox(null);
            setHoveredAnchor(null);
            setEditingText(null);
            setCurrentTool('pointer');
            setRenamingBoardId(null);
            setRenameInputValue('');
            return;
        }

        setBoards(remainingBoards);

        if (renamingBoardId === boardId) {
            setRenamingBoardId(null);
            setRenameInputValue('');
        }

        if (activeBoardId === boardId) {
            const nextBoard = [...remainingBoards].sort((a, b) => b.updatedAt - a.updatedAt)[0];
            setActiveBoardId(nextBoard.id);
            setShapes(nextBoard.shapes);
            setHistory([nextBoard.shapes]);
            setHistoryIndex(0);
            setSelectedShapeIds([]);
            setSelectionBox(null);
            setHoveredAnchor(null);
            setEditingText(null);
            setCurrentTool('pointer');
        }
    };

    const applyStyleToSelectedShapes = (stylePatch: Partial<Pick<Shape, 'strokeColor' | 'fillColor' | 'strokeWidth' | 'strokeStyle'>>) => {
        if (selectedShapeIds.length === 0) return;
        const nextShapes = shapes.map(shape => {
            if (!selectedShapeIds.includes(shape.id) || shape.type === 'image') return shape;
            return { ...shape, ...stylePatch };
        });
        saveHistory(nextShapes);
    };

    const applyCustomStrokeColor = () => {
        applyStyleToSelectedShapes({ strokeColor: customStrokeColor });
    };

    const applyCustomFillColor = () => {
        applyStyleToSelectedShapes({ fillColor: customFillColor });
    };

    const openStrokeColorPicker = () => {
        strokeColorInputRef.current?.click();
    };

    const openFillColorPicker = () => {
        fillColorInputRef.current?.click();
    };

    const strokePreviewDash = (style: StrokeStyle): number[] => {
        if (style === 'dashed') return [8, 4];
        if (style === 'dotted') return [2, 4];
        return [];
    };

    const showZoomCursor = (direction: 'in' | 'out') => {
        setZoomCursor(direction);
        if (zoomCursorTimeoutRef.current) {
            window.clearTimeout(zoomCursorTimeoutRef.current);
        }
        zoomCursorTimeoutRef.current = window.setTimeout(() => {
            setZoomCursor(null);
            zoomCursorTimeoutRef.current = null;
        }, 220);
    };

    const containerClassName = [
        styles.container,
        shouldShowStyleSidebar ? styles.withStyleSidebar : '',
    ].filter(Boolean).join(' ');

    return (
        <div className={containerClassName}>
            <button
                className={styles.sidebarToggle}
                onClick={() => setIsSidebarOpen(prev => !prev)}
                title={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            >
                {isSidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
            </button>

            <div className={styles.userMenuContainer}>
                <UserMenu />
            </div>

            {isSidebarOpen && (
                <button
                    type="button"
                    className={styles.sidebarBackdrop}
                    onClick={() => setIsSidebarOpen(false)}
                    aria-label="Close boards sidebar"
                />
            )}

            {isSidebarOpen && (
                <aside className={styles.sidebar}>
                    <div className={styles.sidebarHeader}>
                        <h3 className={styles.sidebarTitle}>Boards</h3>
                        <button className={styles.newBoardButton} onClick={handleCreateNewBoard}>
                            <Plus size={14} />
                            New Chat
                        </button>
                    </div>

                    <div className={styles.sidebarSubheading}>Chat History</div>
                    <div className={styles.historyList}>
                        {sortedBoards.map(board => (
                            <div
                                key={board.id}
                                className={`${styles.historyItem} ${board.id === activeBoardId ? styles.historyItemActive : ''}`}
                            >
                                {renamingBoardId === board.id ? (
                                    <div className={styles.renameRow}>
                                        <input
                                            className={styles.renameInput}
                                            value={renameInputValue}
                                            onChange={(e) => setRenameInputValue(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    handleRenameCommit();
                                                } else if (e.key === 'Escape') {
                                                    e.preventDefault();
                                                    handleRenameCancel();
                                                }
                                            }}
                                            autoFocus
                                        />
                                        <button className={styles.inlineAction} onClick={handleRenameCommit} title="Save name">
                                            <Check size={14} />
                                        </button>
                                        <button className={styles.inlineAction} onClick={handleRenameCancel} title="Cancel rename">
                                            <X size={14} />
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <button
                                            className={styles.historyButton}
                                            onClick={() => handleSwitchBoard(board.id)}
                                            title={board.name}
                                        >
                                            {board.name}
                                        </button>
                                        <button
                                            className={styles.inlineAction}
                                            onClick={() => handleDeleteBoard(board.id)}
                                            title="Delete board"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                        <button
                                            className={styles.inlineAction}
                                            onClick={() => handleRenameStart(board)}
                                            title="Rename board"
                                        >
                                            <Pencil size={14} />
                                        </button>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                </aside>
            )}

            {shouldShowStyleSidebar && (
                <aside className={styles.styleSidebar}>
                    <div className={styles.styleSidebarHeader}>Style</div>

                    <section className={styles.styleSection}>
                        <h4 className={styles.styleLabel}>Stroke</h4>
                        <div className={styles.swatchRow}>
                            {STROKE_PALETTE.map(color => (
                                <button
                                    key={color}
                                    className={`${styles.colorSwatch} ${activeStrokeColor === color ? styles.colorSwatchActive : ''}`}
                                    style={{ backgroundColor: color }}
                                    onClick={() => applyStyleToSelectedShapes({ strokeColor: color })}
                                    disabled={!canEditSelectedStyles}
                                    title={color}
                                />
                            ))}
                        </div>
                        <div className={styles.customColorRow}>
                            <input
                                type="color"
                                ref={strokeColorInputRef}
                                className={styles.hiddenColorInput}
                                value={customStrokeColor}
                                onChange={(e) => setCustomStrokeColor(e.target.value)}
                                title="Pick custom stroke color"
                            />
                            <button
                                className={styles.moreColorButton}
                                onClick={openStrokeColorPicker}
                            >
                                More colors
                            </button>
                            <span className={styles.colorHex}>{customStrokeColor.toUpperCase()}</span>
                            <button
                                className={styles.applyColorButton}
                                onClick={applyCustomStrokeColor}
                                disabled={!canEditSelectedStyles}
                            >
                                Apply
                            </button>
                        </div>
                    </section>

                    <section className={styles.styleSection}>
                        <h4 className={styles.styleLabel}>Background</h4>
                        <div className={styles.swatchRow}>
                            {FILL_PALETTE.map(color => (
                                <button
                                    key={color}
                                    className={`${styles.colorSwatch} ${activeFillColor === color ? styles.colorSwatchActive : ''} ${color === 'transparent' ? styles.transparentSwatch : ''}`}
                                    style={color === 'transparent' ? undefined : { backgroundColor: color }}
                                    onClick={() => applyStyleToSelectedShapes({ fillColor: color })}
                                    disabled={!canEditSelectedStyles}
                                    title={color === 'transparent' ? 'No fill' : color}
                                />
                            ))}
                        </div>
                        <div className={styles.customColorRow}>
                            <input
                                type="color"
                                ref={fillColorInputRef}
                                className={styles.hiddenColorInput}
                                value={customFillColor}
                                onChange={(e) => setCustomFillColor(e.target.value)}
                                title="Pick custom background color"
                            />
                            <button
                                className={styles.moreColorButton}
                                onClick={openFillColorPicker}
                            >
                                More colors
                            </button>
                            <span className={styles.colorHex}>{customFillColor.toUpperCase()}</span>
                            <button
                                className={styles.applyColorButton}
                                onClick={applyCustomFillColor}
                                disabled={!canEditSelectedStyles}
                            >
                                Apply
                            </button>
                        </div>
                    </section>

                    <section className={styles.styleSection}>
                        <h4 className={styles.styleLabel}>Stroke width</h4>
                        <div className={styles.optionRow}>
                            {STROKE_WIDTH_OPTIONS.map(width => (
                                <button
                                    key={width}
                                    className={`${styles.styleOption} ${activeStrokeWidth === width ? styles.styleOptionActive : ''}`}
                                    onClick={() => applyStyleToSelectedShapes({ strokeWidth: width })}
                                    disabled={!canEditSelectedStyles}
                                    title={`${width}px`}
                                >
                                    <span className={styles.strokeWidthPreview} style={{ height: `${Math.max(1, width)}px` }} />
                                </button>
                            ))}
                        </div>
                    </section>

                    <section className={styles.styleSection}>
                        <h4 className={styles.styleLabel}>Stroke style</h4>
                        <div className={styles.optionRow}>
                            {STROKE_STYLE_OPTIONS.map(style => (
                                <button
                                    key={style}
                                    className={`${styles.styleOption} ${activeStrokeStyle === style ? styles.styleOptionActive : ''}`}
                                    onClick={() => applyStyleToSelectedShapes({ strokeStyle: style })}
                                    disabled={!canEditSelectedStyles}
                                    title={style}
                                >
                                    <svg width="30" height="12" viewBox="0 0 30 12" aria-hidden="true">
                                        <line
                                            x1="2"
                                            y1="6"
                                            x2="28"
                                            y2="6"
                                            stroke="#1f2937"
                                            strokeWidth="2"
                                            strokeDasharray={strokePreviewDash(style).join(' ')}
                                        />
                                    </svg>
                                </button>
                            ))}
                        </div>
                    </section>

                    {!canEditSelectedStyles && (
                        <p className={styles.styleHint}>Select a shape on the board to edit stroke and fill.</p>
                    )}
                </aside>
            )}

            <Toolbar
                currentTool={currentTool}
                setCurrentTool={setCurrentTool}
                onUndo={undo}
                onRedo={redo}
                canUndo={historyIndex > 0}
                canRedo={historyIndex < history.length - 1}
                showFontControls={!!isTextSelected}
                onIncreaseFontSize={handleIncreaseFontSize}
                onDecreaseFontSize={handleDecreaseFontSize}
                onOpenExport={handleOpenExport}
                onSaveFile={handleSaveFile}
                onLoadFile={handleLoadFile}
                onAddImage={handleAddImage}
            />

            <div className={styles.canvasContainer}>
                <canvas
                    ref={canvasRef}
                    className={`${styles.canvas} ${styles[`tool-${currentTool}`]}`}
                    style={{ cursor: zoomCursor === 'in' ? 'zoom-in' : zoomCursor === 'out' ? 'zoom-out' : canvasCursor }}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    onPointerLeave={() => setCanvasCursor(isSpacePressedRef.current ? 'grab' : getToolCursor(currentTool))}
                    onDoubleClick={handleDoubleClick}
                    onWheel={handleWheel}
                    tabIndex={0}
                />

                <div className={styles.minimap}>
                    <canvas
                        ref={minimapCanvasRef}
                        className={styles.minimapCanvas}
                        onPointerDown={handleMinimapPointerDown}
                        onPointerMove={handleMinimapPointerMove}
                        onPointerUp={handleMinimapPointerUp}
                        onPointerCancel={handleMinimapPointerUp}
                        aria-label="Minimap"
                    />
                </div>

                {editingText && (
                    <textarea
                        ref={textInputRef}
                        className={styles.textInput}
                        style={{
                            left: editingText.x * scale + panOffset.x,
                            top: editingText.y * scale + panOffset.y,
                            color: DEFAULT_STROKE_COLOR,
                            fontSize: `${editingText.fontSize}px`,
                            transform: `scale(${scale})`,
                            transformOrigin: 'top left',
                        }}
                        value={editingText.text}
                        onChange={(e) => setEditingText({ ...editingText, text: e.target.value })}
                        onBlur={commitTextEdit}
                        autoFocus
                    />
                )}
            </div>

            <div className={styles.zoomControls}>
                <button className={styles.zoomBtn} onClick={() => {
                    showZoomCursor('out');
                    setScale(Math.max(0.1, scale - 0.1));
                }}>
                    <ZoomOut size={16} />
                </button>
                <span className={styles.zoomLevel}>{Math.round(scale * 100)}%</span>
                <button className={styles.zoomBtn} onClick={() => {
                    showZoomCursor('in');
                    setScale(Math.min(5, scale + 0.1));
                }}>
                    <ZoomIn size={16} />
                </button>
            </div>

            {exportModalVisible && (
                <ExportModal
                    previewUrl={previewDataUrl}
                    onClose={() => setExportModalVisible(false)}
                    onExportPNG={handleExportPNG}
                    onExportJPG={handleExportJPG}
                    onCopyClipboard={handleCopyClipboard}
                />
            )}

            <AuthModal
                isOpen={authModalVisible}
                onClose={() => setAuthModalVisible(false)}
                message={authModalMessage}
            />
        </div>
    );
};
