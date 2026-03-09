import React from 'react';
import { MousePointer2, Square, Circle, Diamond, ArrowRight, Type, Trash2, Undo2, Redo2, Save, FolderOpen } from 'lucide-react';
import { ToolType } from '@/types/shape';
import styles from './Toolbar.module.css';

interface ToolbarProps {
    currentTool: ToolType;
    setCurrentTool: (tool: ToolType) => void;
    strokeColor: string;
    setStrokeColor: (color: string) => void;
    fillColor: string;
    setFillColor: (color: string) => void;
    onUndo: () => void;
    onRedo: () => void;
    canUndo: boolean;
    canRedo: boolean;
    onSave: () => void;
    onLoad: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
    currentTool,
    setCurrentTool,
    strokeColor,
    setStrokeColor,
    fillColor,
    setFillColor,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
    onSave,
    onLoad,
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
            </div>

            <div className={styles.divider} />

            <div className={styles.toolGroup}>
                <div className={styles.colorPicker}>
                    <input
                        type="color"
                        value={strokeColor}
                        onChange={(e) => setStrokeColor(e.target.value)}
                        className={styles.colorInput}
                        title="Stroke Color"
                    />
                </div>
                <div className={styles.colorPicker}>
                    <input
                        type="color"
                        value={fillColor === 'transparent' ? '#ffffff' : fillColor}
                        onChange={(e) => setFillColor(e.target.value)}
                        className={styles.colorInput}
                        title="Fill Color"
                    />
                    <label style={{ display: 'flex', alignItems: 'center', gap: '2px', cursor: 'pointer', fontSize: '10px' }}>
                        <input
                            type="checkbox"
                            checked={fillColor === 'transparent'}
                            onChange={(e) => setFillColor(e.target.checked ? 'transparent' : '#e2e8f0')}
                        /> No Fill
                    </label>
                </div>
            </div>

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
                <button className={styles.iconButton} onClick={onSave} title="Save to local server">
                    <Save size={18} />
                </button>
                <button className={styles.iconButton} onClick={onLoad} title="Load from local server">
                    <FolderOpen size={18} />
                </button>
            </div>
        </div>
    );
};
