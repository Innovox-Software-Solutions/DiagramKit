export type ShapeType = "rectangle" | "circle" | "arrow" | "elbow-arrow" | "curve-arrow" | "diamond" | "text" | "rounded-rectangle" | "image" | "pencil";

export type AnchorType = "top" | "bottom" | "left" | "right" | "center";
export type StrokeStyle = "solid" | "dashed" | "dotted";

export interface Shape {
    id: string;
    type: ShapeType;
    x: number;
    y: number;
    width: number;
    height: number;
    strokeColor: string;
    fillColor: string;
    strokeWidth?: number;
    strokeStyle?: StrokeStyle;
    text?: string;
    fontSize?: number;
    fontFamily?: string;
    fontWeight?: string;
    fontStyle?: string;
    textDecoration?: string;
    textAlign?: "left" | "center" | "right";

    // Arrow specific
    startShapeId?: string;
    endShapeId?: string;
    startAnchor?: AnchorType;
    endAnchor?: AnchorType;

    // Rounded rectangle specific
    cornerRadius?: number;

    // Image specific
    imageSrc?: string;
    imageName?: string;

    // Pencil specific
    points?: Point[];
}

export type ToolType = "pointer" | "pencil" | "rectangle" | "circle" | "arrow" | "elbow-arrow" | "curve-arrow" | "diamond" | "text" | "rounded-rectangle" | "delete" | "hand";

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

export interface ConnectionPoint {
    x: number;
    y: number;
    type: AnchorType;
    shapeId: string;
}
