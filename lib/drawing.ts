import { Shape, Point, ResizeHandle, BoundingBox } from "@/types/shape";

export const HANDLE_SIZE = 8;
export const HIT_TOLERANCE = 5;

// Render shapes on the canvas
export const renderShapes = (
    ctx: CanvasRenderingContext2D,
    shapes: Shape[],
    selectedShapeId: string | null,
    scale: number,
    panX: number,
    panY: number
) => {
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(scale, scale);

    shapes.forEach((shape) => {
        ctx.save();
        ctx.strokeStyle = shape.strokeColor;
        ctx.fillStyle = shape.fillColor !== "transparent" ? shape.fillColor : "rgba(0,0,0,0)";
        ctx.lineWidth = 2; // Fixed stroke width for simplicity, could be dynamic
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
                drawArrow(ctx, shape.x, shape.y, shape.x + shape.width, shape.y + shape.height);
                if (shape.fillColor !== "transparent") ctx.fill();
                ctx.stroke();
                break;

            case "text":
                if (shape.text) {
                    ctx.font = "16px sans-serif";
                    ctx.fillStyle = shape.strokeColor; // Use stroke color for text color
                    ctx.textBaseline = "top";
                    ctx.fillText(shape.text, shape.x, shape.y);
                    // Optional: Render bounding box for debug or during edit
                }
                break;
        }
        ctx.restore();

        // Draw selection handles if this is the selected shape
        if (shape.id === selectedShapeId) {
            drawSelectionBox(ctx, shape);
        }
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

const drawSelectionBox = (ctx: CanvasRenderingContext2D, shape: Shape) => {
    ctx.save();
    ctx.strokeStyle = "#0d6efd"; // Primary blue for selection
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);

    const padding = 4; // Padding around the shape
    const { minX, minY, maxX, maxY } = getBoundingBox(shape);

    // Draw bounding box
    ctx.strokeRect(minX - padding, minY - padding, maxX - minX + padding * 2, maxY - minY + padding * 2);

    // Draw resize handles
    ctx.setLineDash([]);
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#0d6efd";
    ctx.lineWidth = 1.5;

    const handles = getResizeHandles(shape);
    handles.forEach((handle) => {
        ctx.fillRect(handle.x, handle.y, handle.width, handle.height);
        ctx.strokeRect(handle.x, handle.y, handle.width, handle.height);
    });

    ctx.restore();
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
        // Estimating width since we don't have ctx here to measure exactly,
        // though ideally text width is updated on the shape when edited.
        // For simplicity, we rely on updated width/height on shape object.
        return {
            minX: shape.x,
            minY: shape.y,
            maxX: shape.x + shape.width,
            maxY: shape.y + shape.height,
        };
    } else {
        // For rect, circle, diamond
        // width/height can be negative if drawn backwards
        return {
            minX: Math.min(shape.x, shape.x + shape.width),
            minY: Math.min(shape.y, shape.y + shape.height),
            maxX: Math.max(shape.x, shape.x + shape.width),
            maxY: Math.max(shape.y, shape.y + shape.height),
        };
    }
};

export const getResizeHandles = (shape: Shape): ResizeHandle[] => {
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
