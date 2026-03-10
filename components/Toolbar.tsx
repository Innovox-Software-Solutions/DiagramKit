import React from 'react';
import { MousePointer2, Hand, Pencil, Square, Circle, Diamond, ArrowRight, Type, ImagePlus, Trash2, Undo2, Redo2, Plus, Minus, Download, Share2, Upload } from 'lucide-react';
import { ToolType } from '@/types/shape';
import styles from './Toolbar.module.css';

interface ToolbarProps {
    currentTool: ToolType;
    setCurrentTool: (tool: ToolType) => void;
    onUndo: () => void;
    onRedo: () => void;
    canUndo: boolean;
    canRedo: boolean;
    showFontControls?: boolean;
    onIncreaseFontSize?: () => void;
    onDecreaseFontSize?: () => void;
    onOpenExport?: () => void;
    onSaveFile?: () => void;
    onLoadFile?: () => void;
    onAddImage?: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
    currentTool,
    setCurrentTool,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
    showFontControls,
    onIncreaseFontSize,
    onDecreaseFontSize,
    onOpenExport,
    onSaveFile,
    onLoadFile,
    onAddImage,
}) => {
    return (
        <div className={styles.toolbar}>
            <div className={styles.toolGroup}>
                <button
                    className={`${styles.iconButton} ${currentTool === 'pointer' ? styles.active : ''}`}
                    onClick={() => setCurrentTool('pointer')}
                    title="Pointer"
                >
                    <MousePointer2 size={18} />
                </button>
                <button
                    className={`${styles.iconButton} ${currentTool === 'hand' ? styles.active : ''}`}
                    onClick={() => setCurrentTool('hand')}
                    title="Hand Tool"
                >
                    <Hand size={18} />
                </button>
                <button
                    className={`${styles.iconButton} ${currentTool === 'pencil' ? styles.active : ''}`}
                    onClick={() => setCurrentTool('pencil')}
                    title="Pencil"
                >
                    <Pencil size={18} />
                </button>
            </div>

            <div className={styles.divider} />

            <div className={styles.toolGroup}>
                <button
                    className={`${styles.iconButton} ${currentTool === 'rectangle' ? styles.active : ''}`}
                    onClick={() => setCurrentTool('rectangle')}
                    title="Rectangle"
                >
                    <Square size={18} />
                </button>
                <button
                    className={`${styles.iconButton} ${currentTool === 'diamond' ? styles.active : ''}`}
                    onClick={() => setCurrentTool('diamond')}
                    title="Diamond"
                >
                    <Diamond size={18} />
                </button>
                <button
                    className={`${styles.iconButton} ${currentTool === 'circle' ? styles.active : ''}`}
                    onClick={() => setCurrentTool('circle')}
                    title="Circle"
                >
                    <Circle size={18} />
                </button>
                <button
                    className={`${styles.iconButton} ${currentTool === 'rounded-rectangle' ? styles.active : ''}`}
                    onClick={() => setCurrentTool('rounded-rectangle')}
                    title="Rounded Rectangle"
                >
                    <Square size={18} rx={4} />
                </button>
                <button
                    className={`${styles.iconButton} ${currentTool === 'arrow' ? styles.active : ''}`}
                    onClick={() => setCurrentTool('arrow')}
                    title="Arrow"
                >
                    <ArrowRight size={18} />
                </button>
                <button
                    className={`${styles.iconButton} ${currentTool === 'text' ? styles.active : ''}`}
                    onClick={() => setCurrentTool('text')}
                    title="Text"
                >
                    <Type size={18} />
                </button>
                <button
                    className={styles.iconButton}
                    onClick={onAddImage}
                    title="Add Image"
                >
                    <ImagePlus size={18} />
                </button>
            </div>

            {showFontControls && (
                <>
                    <div className={styles.divider} />
                    <div className={styles.toolGroup}>
                        <button
                            className={styles.iconButton}
                            onClick={onDecreaseFontSize}
                            title="Decrease Font Size"
                        >
                            <Minus size={18} />
                        </button>
                        <button
                            className={styles.iconButton}
                            onClick={onIncreaseFontSize}
                            title="Increase Font Size"
                        >
                            <Plus size={18} />
                        </button>
                    </div>
                </>
            )}

            <div className={styles.divider} />

            <div className={styles.toolGroup}>
                <button
                    className={`${styles.iconButton} ${currentTool === 'delete' ? styles.active : ''}`}
                    onClick={() => setCurrentTool('delete')}
                    title="Delete Selection (or press Delete)"
                >
                    <Trash2 size={18} />
                </button>
                <button
                    className={styles.iconButton}
                    onClick={onUndo}
                    disabled={!canUndo}
                    title="Undo (Ctrl+Z)"
                    style={{ opacity: canUndo ? 1 : 0.5, cursor: canUndo ? 'pointer' : 'not-allowed' }}
                >
                    <Undo2 size={18} />
                </button>
                <button
                    className={styles.iconButton}
                    onClick={onRedo}
                    disabled={!canRedo}
                    title="Redo (Ctrl+Shift+Z)"
                    style={{ opacity: canRedo ? 1 : 0.5, cursor: canRedo ? 'pointer' : 'not-allowed' }}
                >
                    <Redo2 size={18} />
                </button>
            </div>

            <div className={styles.divider} />

            <div className={styles.toolGroup}>
                <button className={styles.iconButton} onClick={onLoadFile} title="Open File">
                    <Upload size={18} />
                </button>
                <button className={styles.iconButton} onClick={onSaveFile} title="Share to File">
                    <Share2 size={18} />
                </button>
                <div className={styles.divider} style={{ margin: '0 4px', height: '24px' }} />
                <button className={styles.iconButton} onClick={onOpenExport} title="Export Image">
                    <Download size={18} />
                </button>
            </div>
        </div>
    );
};
