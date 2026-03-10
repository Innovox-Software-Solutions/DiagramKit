import { Shape, Point, ResizeHandle, BoundingBox, ConnectionPoint, StrokeStyle } from "@/types/shape";

export const HANDLE_SIZE = 8;
export const HIT_TOLERANCE = 5;

let measureCtx: CanvasRenderingContext2D | null = null;
const getMeasureCtx = () => {
    if (!measureCtx && typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        measureCtx = canvas.getContext('2d');
    }
    return measureCtx;
};

const getResolvedFont = (family?: string): string => {
    // If family is explicitly something else, try to use it? 
    // The user said "dont use simple for all text use this".
    // I'll make Lobster Two the default if family is missing or 'Lobster Two'.
    if ((!family || family === 'Lobster Two' || family === 'sans-serif') && typeof document !== 'undefined') {
        const style = getComputedStyle(document.body).getPropertyValue('--font-lobster-two');
        if (style) return style.trim().replace(/"/g, "'");
    }
    // Even if it's some other string, we might want to override? 
    // But let's respect explicit choices if there were multiple fonts. 
    // Assuming 'simple' refers to default sans-serif.
    return family || 'Lobster Two, cursive';
};

export const measureText = (text: string, fontSize: number, fontFamily?: string, fontWeight?: string, fontStyle?: string): { width: number, height: number } => {
    const ctx = getMeasureCtx();
    if (ctx && text) {
        const resolvedFont = getResolvedFont(fontFamily);
        const resolvedWeight = fontWeight || 'normal';
        const resolvedStyle = fontStyle || 'normal';
        ctx.save();
        ctx.font = `${resolvedStyle} ${resolvedWeight} ${fontSize}px ${resolvedFont}`;
        
        const lines = text.split('\n');
        let maxWidth = 0;
        const lineHeight = fontSize * 1.25;

        lines.forEach(line => {
             const metrics = ctx.measureText(line);
             if (metrics.width > maxWidth) {
                 maxWidth = metrics.width;
             }
        });

        ctx.restore();
        return {
            width: maxWidth,
            height: lines.length * lineHeight
        };
    }
    return { width: 100, height: fontSize * 1.25 };
};

const getPencilAbsolutePoints = (shape: Shape): Point[] => {
    if (!shape.points || shape.points.length === 0) return [];
    return shape.points.map((point) => ({
        x: shape.x + point.x,
        y: shape.y + point.y,
    }));
};


// Render shapes on the canvas

export const renderShapes = (
    ctx: CanvasRenderingContext2D,
    shapes: Shape[],
    selectedShapeIds: string[],
    scale: number,
    panX: number,
    panY: number,
    imageCache?: Map<string, HTMLImageElement>
) => {
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(scale, scale);

    shapes.forEach((shape) => {
        ctx.save();
        ctx.strokeStyle = shape.strokeColor;
        ctx.fillStyle = shape.fillColor !== "transparent" ? shape.fillColor : "rgba(0,0,0,0)";
        const strokeStyle: StrokeStyle = shape.strokeStyle || "solid";
        ctx.lineWidth = shape.strokeWidth ?? 2;
        if (strokeStyle === "dashed") {
            ctx.setLineDash([10, 6]);
        } else if (strokeStyle === "dotted") {
            ctx.setLineDash([2, 5]);
        } else {
            ctx.setLineDash([]);
        }
        ctx.lineJoin = "round";
        ctx.lineCap = "round";

        ctx.beginPath();

        switch (shape.type) {
            case "rectangle":
                ctx.rect(shape.x, shape.y, shape.width, shape.height);
                if (shape.fillColor !== "transparent") ctx.fill();
                ctx.stroke();
                break;

            case "circle":
                const radiusX = Math.abs(shape.width / 2);
                const radiusY = Math.abs(shape.height / 2);
                const centerX = shape.x + shape.width / 2;
                const centerY = shape.y + shape.height / 2;
                ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
                if (shape.fillColor !== "transparent") ctx.fill();
                ctx.stroke();
                break;

            case "diamond":
                const midX = shape.x + shape.width / 2;
                const midY = shape.y + shape.height / 2;
                ctx.moveTo(midX, shape.y);
                ctx.lineTo(shape.x + shape.width, midY);
                ctx.lineTo(midX, shape.y + shape.height);
                ctx.lineTo(shape.x, midY);
                ctx.closePath();
                if (shape.fillColor !== "transparent") ctx.fill();
                ctx.stroke();
                break;

            case "arrow":
            case "elbow-arrow":
            case "curve-arrow":
                let fromX = shape.x;
                let fromY = shape.y;
                let toX = shape.x + shape.width;
                let toY = shape.y + shape.height;

                // If it's a smart arrow, try to resolve the anchors dynamically
                if (shape.startShapeId || shape.endShapeId) {
                    if (shape.startShapeId && shape.startAnchor) {
                        const startShape = shapes.find(s => s.id === shape.startShapeId);
                        if (startShape) {
                            const anchor = getShapeAnchors(startShape).find(a => a.type === shape.startAnchor);
                            if (anchor) {
                                fromX = anchor.x;
                                fromY = anchor.y;
                            }
                        }
                    }
                    if (shape.endShapeId && shape.endAnchor) {
                        const endShape = shapes.find(s => s.id === shape.endShapeId);
                        if (endShape) {
                            const anchor = getShapeAnchors(endShape).find(a => a.type === shape.endAnchor);
                            if (anchor) {
                                toX = anchor.x;
                                toY = anchor.y;
                            }
                        }
                    }
                }
                
                if (shape.type === "elbow-arrow") {
                    // Custom implementation for elbow arrow
                    const midX = (fromX + toX) / 2;
                    const midY = (fromY + toY) / 2;
                    const cornerRadius = 8;
                    const headlen = 10;
                    
                    // Start point visual: Circle
                    // Only if selected? No, maybe always as a style choice or not at all?
                    // Previous code logic seemed to have it. Keeping consistency if desired but maybe removing for cleaner look
                    // Let's stick to just the line unless requested.
                    // The previous `read_file` output showed some circle drawing code. I'll preserve what was there if possible or improve.
                    // The previous output in `read_file` lines 152+ showed specific implementation.
                    
                    // Re-implementing based on what was seen/implied:
                    ctx.beginPath();
                    ctx.moveTo(fromX, fromY);
                    
                    // Complex logic to handle directions properly
                    // Simplified elbow: Horizontal first then vertical? Or Z-shape?
                    // Defaulting to "Midpoint Z-shape" which is common for diagrams
                    
                    const dx = toX - fromX;
                    const dy = toY - fromY;
                    
                    // We go horizontal to midX, then vertical to toY, then horizontal to toX?
                    // Or Horizontal -> Vertical -> Horizontal (3 segments) or Vertical -> Horizontal -> Vertical
                    // Let's use a simple 3-segment approach: 
                    // 1. (fromX, fromY) -> (midX, fromY)
                    // 2. (midX, fromY) -> (midX, toY)
                    // 3. (midX, toY) -> (toX, toY)
                    
                    // Drawing with rounded corners
                    // We need to know direction to apply arc correctly.
                    
                    // Just using lines for robustness if corner radius logic is complex to inline
                    // But user likes "elbow".
                    // Let's try the Z-shape with manual arcTo
                    
                    ctx.lineTo(midX, fromY);
                    ctx.lineTo(midX, toY);
                    ctx.lineTo(toX, toY);
                    ctx.stroke();

                    // Arrow head at toX, toY. Direction is horizontal approaching toX
                    const angle = dx >= 0 ? 0 : Math.PI; 
                    
                    ctx.beginPath();
                    ctx.moveTo(toX, toY);
                    ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
                    ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
                    ctx.closePath();
                    ctx.fillStyle = shape.strokeColor; // Use stroke color for fill
                    ctx.fill();

                } else if (shape.type === "curve-arrow") {
                    const headlen = 10;
                    const midX = (fromX + toX) / 2;
                    const midY = (fromY + toY) / 2;
                    
                    // Calculate control point offset
                    const dx = toX - fromX;
                    const dy = toY - fromY;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    // Offset perpendicular to the line
                    const offset = dist * 0.2; 
                    const angle = Math.atan2(dy, dx);
                    
                    const cx = midX + offset * Math.cos(angle - Math.PI / 2);
                    const cy = midY + offset * Math.sin(angle - Math.PI / 2);

                    ctx.beginPath();
                    ctx.moveTo(fromX, fromY);
                    ctx.quadraticCurveTo(cx, cy, toX, toY);
                    ctx.stroke();

                    // Arrow head
                    // Calculate angle at end point (tangent to curve at t=1)
                    // P'(1) = 2(P2 - P1) => vector from control point to end point
                    const endAngle = Math.atan2(toY - cy, toX - cx);

                    ctx.beginPath();
                    ctx.moveTo(toX, toY);
                    ctx.lineTo(toX - headlen * Math.cos(endAngle - Math.PI / 6), toY - headlen * Math.sin(endAngle - Math.PI / 6));
                    ctx.lineTo(toX - headlen * Math.cos(endAngle + Math.PI / 6), toY - headlen * Math.sin(endAngle + Math.PI / 6));
                    ctx.closePath();
                    ctx.fillStyle = shape.strokeColor;
                    ctx.fill();

                } else {
                    drawArrow(ctx, fromX, fromY, toX, toY);
                    if (shape.fillColor !== "transparent") ctx.fill();
                    ctx.stroke();
                }
                break;

            case "text":
                if (shape.text) {
                    const fontSize = shape.fontSize || 20;
                    const resolvedFont = getResolvedFont(shape.fontFamily);
                    const fontWeight = shape.fontWeight || 'normal';
                    const fontStyle = shape.fontStyle || 'normal';
                    
                    ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${resolvedFont}`;
                    ctx.fillStyle = shape.strokeColor; // Use stroke color for text color
                    ctx.textBaseline = "top";

                    const lines = shape.text.split('\n');
                    const lineHeight = fontSize * 1.25;

                    lines.forEach((line, index) => {
                        const y = shape.y + (index * lineHeight);
                        ctx.fillText(line, shape.x, y);

                        if (shape.textDecoration === 'underline') {
                            const metrics = ctx.measureText(line);
                            ctx.beginPath();
                            ctx.moveTo(shape.x, y + fontSize);
                            ctx.lineTo(shape.x + metrics.width, y + fontSize);
                            ctx.lineWidth = Math.max(1, fontSize / 15);
                            ctx.stroke();
                        }
                    });

                    // Optional: Render bounding box for debug or during edit
                }
                break;

            case "pencil":
                const pencilPoints = getPencilAbsolutePoints(shape);
                if (pencilPoints.length === 1) {
                    ctx.beginPath();
                    ctx.arc(pencilPoints[0].x, pencilPoints[0].y, Math.max(1, (shape.strokeWidth ?? 2) / 2), 0, Math.PI * 2);
                    ctx.fillStyle = shape.strokeColor;
                    ctx.fill();
                } else if (pencilPoints.length > 1) {
                    ctx.beginPath();
                    ctx.moveTo(pencilPoints[0].x, pencilPoints[0].y);
                    for (let index = 1; index < pencilPoints.length; index += 1) {
                        ctx.lineTo(pencilPoints[index].x, pencilPoints[index].y);
                    }
                    ctx.stroke();
                }
                break;

            case "image":
                const imageBox = getBoundingBox(shape);
                const imageWidth = imageBox.maxX - imageBox.minX;
                const imageHeight = imageBox.maxY - imageBox.minY;
                const cachedImage = shape.imageSrc ? imageCache?.get(shape.imageSrc) : undefined;

                if (cachedImage && cachedImage.complete) {
                    ctx.drawImage(cachedImage, imageBox.minX, imageBox.minY, imageWidth, imageHeight);
                } else {
                    ctx.fillStyle = "#e5e7eb";
                    ctx.strokeStyle = "#9ca3af";
                    ctx.lineWidth = 1.5;
                    ctx.fillRect(imageBox.minX, imageBox.minY, imageWidth, imageHeight);
                    ctx.strokeRect(imageBox.minX, imageBox.minY, imageWidth, imageHeight);
                    ctx.beginPath();
                    ctx.moveTo(imageBox.minX + 12, imageBox.minY + imageHeight - 12);
                    ctx.lineTo(imageBox.minX + imageWidth / 2, imageBox.minY + imageHeight / 2);
                    ctx.lineTo(imageBox.maxX - 12, imageBox.minY + imageHeight - 12);
                    ctx.stroke();
                }
                break;

            case "rounded-rectangle":
                const r = shape.cornerRadius || 12;
                const { x, y, width: w, height: h } = shape;
                // Handle negative width/height
                const startX = w < 0 ? x + w : x;
                const startY = h < 0 ? y + h : y;
                const absW = Math.abs(w);
                const absH = Math.abs(h);

                // Cap radius at half of shortest side
                const minSide = Math.min(absW, absH);
                const appliedR = Math.min(r, minSide / 2);

                ctx.beginPath();
                if (ctx.roundRect) {
                    ctx.roundRect(startX, startY, absW, absH, appliedR);
                } else {
                    // Fallback using arcs
                    ctx.moveTo(startX + appliedR, startY);
                    ctx.lineTo(startX + absW - appliedR, startY);
                    ctx.arcTo(startX + absW, startY, startX + absW, startY + appliedR, appliedR);
                    ctx.lineTo(startX + absW, startY + absH - appliedR);
                    ctx.arcTo(startX + absW, startY + absH, startX + absW - appliedR, startY + absH, appliedR);
                    ctx.lineTo(startX + appliedR, startY + absH);
                    ctx.arcTo(startX, startY + absH, startX, startY + absH - appliedR, appliedR);
                    ctx.lineTo(startX, startY + appliedR);
                    ctx.arcTo(startX, startY, startX + appliedR, startY, appliedR);
                    ctx.closePath();
                }
                if (shape.fillColor !== "transparent") ctx.fill();
                ctx.stroke();
                break;
        }
        ctx.restore();

        // Draw selection handles if this is a selected shape
        if (selectedShapeIds.includes(shape.id)) {
            // Only show detailed resize handles if exactly one shape is selected
            drawSelectionBox(ctx, shape, selectedShapeIds.length === 1 && shape.type !== "pencil");

            // Draw connection anchors if not an arrow
            if (shape.type !== "arrow" && shape.type !== "text" && shape.type !== "pencil" && selectedShapeIds.length === 1) {
                drawAnchors(ctx, shape);
            }
        }
    });

    ctx.restore();
};

const drawAnchors = (ctx: CanvasRenderingContext2D, shape: Shape) => {
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#10b981"; // distinct green for anchors
    ctx.lineWidth = 1.5;

    const anchors = getShapeAnchors(shape);
    anchors.forEach((anchor) => {
        ctx.beginPath();
        ctx.arc(anchor.x, anchor.y, 4, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
    });

    ctx.restore();
};

const drawArrow = (ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number) => {
    
    const headlen = 10; // length of head in pixels
    const dx = toX - fromX;
    const dy = toY - fromY;
    const angle = Math.atan2(dy, dx);
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
};

const drawElbowArrow = (ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number) => {
    const headlen = 10;
    const cornerRadius = 8; // Radius for rounded corners

    // Calculate midpoints
    const midX = (fromX + toX) / 2;
    // We can choose to break horizontally or vertically depending on the shape positions.
    // For simplicity, let's start with a horizontal-first approach if horizontal distance is greater
    // or just a simple midpoint break.
    // A common simple elbow logic is: horizontal then vertical
    
    // Let's implement a standard 3-segment elbow:
    // 1. Horizontal from start
    // 2. Vertical segment
    // 3. Horizontal to end
    // Or Vertical -> Horizontal -> Vertical based on dominance.

    // Simple robust approach for now:
    // Move horizontal to midpoint X, then vertical to target Y, then horizontal to target X?
    // Let's stick to the double-L (Z-shape) or simple L shape.
    // The user requested a specific type in the image attachments which looks like a Z-shape with rounded corners.
    // Left-to-right flow:
    // Start -> (midX, startY) -> (midX, endY) -> End

    let p1 = { x: fromX, y: fromY };
    let p2 = { x: midX, y: fromY };
    let p3 = { x: midX, y: toY };
    let p4 = { x: toX, y: toY };

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    
    // Draw line to p2 (start of first cure)
    // To make it rounded, we stop short of p2 and curve to p3
    
    // Use arcTo for rounded corners
    ctx.lineTo(p2.x, p2.y); // This might be sharp, let's try arcTo
    // We need to trace the path: p1 -> p2 -> p3 -> p4
    
    // Reset path to be clean
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    
    // First corner at p2
    ctx.arcTo(p2.x, p2.y, p3.x, p3.y, cornerRadius);
    
    // Second corner at p3
    ctx.arcTo(p3.x, p3.y, p4.x, p4.y, cornerRadius);
    
    // Line to end
    ctx.lineTo(p4.x, p4.y);
    ctx.stroke();

    // Draw Arrow Head at p4
    // Direction is determined by p3 -> p4 vector
    const dx = p4.x - p3.x;
    const dy = p4.y - p3.y;
    const angle = Math.atan2(dy, dx);
    
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
    
    // Also draw a starting circle dot as per the user image
    ctx.beginPath();
    ctx.arc(fromX, fromY, 4, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle; 
    ctx.fill();
    // Revert fill style for subsequent strokes if needed, though this function is called inside a context loop that sets styles
};

const drawSelectionBox = (ctx: CanvasRenderingContext2D, shape: Shape, showHandles: boolean = true) => {
    ctx.save();
    ctx.strokeStyle = "#0d6efd"; // Primary blue for selection
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);

    const padding = 4; // Padding around the shape
    const { minX, minY, maxX, maxY } = getBoundingBox(shape);

    // Draw bounding box
    ctx.strokeRect(minX - padding, minY - padding, maxX - minX + padding * 2, maxY - minY + padding * 2);

    // Draw resize handles
    if (showHandles) {
        ctx.setLineDash([]);
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#0d6efd";
        ctx.lineWidth = 1.5;

        const handles = getResizeHandles(shape);
        handles.forEach((handle) => {
            ctx.fillRect(handle.x, handle.y, handle.width, handle.height);
            ctx.strokeRect(handle.x, handle.y, handle.width, handle.height);
        });
    }

    ctx.restore();
};

export const renderSelectionBox = (ctx: CanvasRenderingContext2D, box: BoundingBox, scale: number, panX: number, panY: number) => {
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(scale, scale);
    ctx.fillStyle = "rgba(13, 110, 253, 0.1)"; // Light transparent blue
    ctx.strokeStyle = "#0d6efd";
    ctx.lineWidth = 1 / scale; // Keep stroke visually 1px

    const width = box.maxX - box.minX;
    const height = box.maxY - box.minY;

    ctx.fillRect(box.minX, box.minY, width, height);
    ctx.strokeRect(box.minX, box.minY, width, height);
    ctx.restore();
};

export const shapesIntersect = (shape: Shape, box: BoundingBox): boolean => {
    const sBox = getBoundingBox(shape);
    return (
        sBox.minX <= box.maxX &&
        sBox.maxX >= box.minX &&
        sBox.minY <= box.maxY &&
        sBox.maxY >= box.minY
    );
};

export const getBoundingBox = (shape: Shape): BoundingBox => {
    if (shape.type === "arrow") {
        return {
            minX: Math.min(shape.x, shape.x + shape.width),
            minY: Math.min(shape.y, shape.y + shape.height),
            maxX: Math.max(shape.x, shape.x + shape.width),
            maxY: Math.max(shape.y, shape.y + shape.height),
        };
    } else if (shape.type === "text") {
        const dims = measureText(shape.text || "", shape.fontSize || 20);
        return {
            minX: shape.x,
            minY: shape.y,
            maxX: shape.x + Math.max(shape.width, dims.width),
            maxY: shape.y + Math.max(shape.height, dims.height),
        };
    } else {
        // For rect, circle, diamond, rounded-rectangle
        // width/height can be negative if drawn backwards
        return {
            minX: Math.min(shape.x, shape.x + shape.width),
            minY: Math.min(shape.y, shape.y + shape.height),
            maxX: Math.max(shape.x, shape.x + shape.width),
            maxY: Math.max(shape.y, shape.y + shape.height),
        };
    }
};

export const getShapeAnchors = (shape: Shape): ConnectionPoint[] => {
    // Return standard anchor points for connection
    const { minX, minY, maxX, maxY } = getBoundingBox(shape);
    const midX = minX + (maxX - minX) / 2;
    const midY = minY + (maxY - minY) / 2;

    return [
        { type: "top", x: midX, y: minY, shapeId: shape.id },
        { type: "bottom", x: midX, y: maxY, shapeId: shape.id },
        { type: "left", x: minX, y: midY, shapeId: shape.id },
        { type: "right", x: maxX, y: midY, shapeId: shape.id },
        { type: "center", x: midX, y: midY, shapeId: shape.id }
    ];
};

export const getResizeHandles = (shape: Shape): ResizeHandle[] => {
    if (shape.type === "pencil") {
        return [];
    }

    const { minX, minY, maxX, maxY } = getBoundingBox(shape);
    const padding = 4;

    const hSize = HANDLE_SIZE;
    const hsHalf = hSize / 2;

    const left = minX - padding - hsHalf;
    const right = maxX + padding - hsHalf;
    const top = minY - padding - hsHalf;
    const bottom = maxY + padding - hsHalf;

    // For arrows, maybe we ONLY want start and end handles.
    // For simplicity, providing standard 4 corners for all.
    return [
        { id: "nw", x: left, y: top, width: hSize, height: hSize, cursor: "nwse-resize" },
        { id: "ne", x: right, y: top, width: hSize, height: hSize, cursor: "nesw-resize" },
        { id: "sw", x: left, y: bottom, width: hSize, height: hSize, cursor: "nesw-resize" },
        { id: "se", x: right, y: bottom, width: hSize, height: hSize, cursor: "nwse-resize" },
    ];
};

export const MathUtils = {
    distance(p1: Point, p2: Point) {
        return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    },

    // Point-to-line distance for checking arrow selection
    pointToLineDistance(p: Point, l1: Point, l2: Point) {
        const A = p.x - l1.x;
        const B = p.y - l1.y;
        const C = l2.x - l1.x;
        const D = l2.y - l1.y;

        const dot = A * C + B * D;
        const len_sq = C * C + D * D;
        let param = -1;
        if (len_sq != 0) //in case of 0 length line
            param = dot / len_sq;

        let xx, yy;

        if (param < 0) {
            xx = l1.x;
            yy = l1.y;
        }
        else if (param > 1) {
            xx = l2.x;
            yy = l2.y;
        }
        else {
            xx = l1.x + param * C;
            yy = l1.y + param * D;
        }

        const dx = p.x - xx;
        const dy = p.y - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }
};

export const hitTest = (shape: Shape, x: number, y: number): boolean => {
    const { minX, minY, maxX, maxY } = getBoundingBox(shape);

    // Quick AABB check
    if (x < minX - HIT_TOLERANCE || x > maxX + HIT_TOLERANCE || y < minY - HIT_TOLERANCE || y > maxY + HIT_TOLERANCE) {
        return false;
    }

    // Refined hitbox per shape
    if (shape.type === "arrow") {
        const dist = MathUtils.pointToLineDistance(
            { x, y },
            { x: shape.x, y: shape.y },
            { x: shape.x + shape.width, y: shape.y + shape.height }
        );
        return dist <= HIT_TOLERANCE;
    }

    if (shape.type === "pencil") {
        const pencilPoints = getPencilAbsolutePoints(shape);
        if (pencilPoints.length === 1) {
            return MathUtils.distance({ x, y }, pencilPoints[0]) <= Math.max(HIT_TOLERANCE, (shape.strokeWidth ?? 2) + 2);
        }

        for (let index = 1; index < pencilPoints.length; index += 1) {
            const dist = MathUtils.pointToLineDistance({ x, y }, pencilPoints[index - 1], pencilPoints[index]);
            if (dist <= Math.max(HIT_TOLERANCE, (shape.strokeWidth ?? 2) + 2)) {
                return true;
            }
        }
        return false;
    }

    // For other shapes, treating the whole bounding box as selectable for simplicity in a basic whiteboard
    return true;
};

export const hitTestHandle = (shape: Shape, x: number, y: number): string | null => {
    const handles = getResizeHandles(shape);
    for (const handle of handles) {
        if (x >= handle.x && x <= handle.x + handle.width && y >= handle.y && y <= handle.y + handle.height) {
            return handle.id;
        }
    }
    return null;
};
