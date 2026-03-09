export type ShapeType = "rectangle" | "circle" | "arrow" | "diamond" | "text";

export interface Shape {
    id: string;
    type: ShapeType;
    x: number;
    y: number;
    width: number;
    height: number;
    strokeColor: string;
    fillColor: string;
    text?: string;
}

export type ToolType = "pointer" | "rectangle" | "circle" | "arrow" | "diamond" | "text" | "delete";

export interface Point {
    x: number;
    y: number;
}

export interface ResizeHandle {
    id: string; // e.g., 'nw', 'ne', 'sw', 'se'
    x: number;
    y: number;
    width: number;
    height: number;
    cursor: string;
}

export interface BoundingBox {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}
