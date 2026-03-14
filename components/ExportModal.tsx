import React from 'react';
import { Download, Image as ImageIcon, Copy, X } from 'lucide-react';
import styles from './ExportModal.module.css';

export interface ExportOptions {
    backgroundColor: string; // 'transparent' or hex color
}

interface ExportModalProps {
    previewUrl: string;
    onClose: () => void;
    onExportPNG: (opts: ExportOptions) => void;
    onExportJPG: (opts: ExportOptions) => void;
    onCopyClipboard: (opts: ExportOptions) => void;
    onDownloadBoardFile: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
    previewUrl,
    onClose,
    onExportPNG,
    onExportJPG,
    onCopyClipboard,
    onDownloadBoardFile,
}) => {
    const [bgType, setBgType] = React.useState<'transparent' | 'custom'>('transparent');
    const [customColor, setCustomColor] = React.useState('#ffffff');

    const currentBgColor = bgType === 'transparent' ? 'transparent' : customColor;

    const handleExportPNG = () => onExportPNG({ backgroundColor: currentBgColor });
    const handleExportJPG = () => onExportJPG({ backgroundColor: currentBgColor });
    const handleCopyClipboard = () => onCopyClipboard({ backgroundColor: currentBgColor });

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div className={styles.header}>
                    <h2 className={styles.title}>Export Whiteboard</h2>
                    <button className={styles.closeButton} onClick={onClose} title="Close">
                        <X size={20} />
                    </button>
                </div>

                <div className={styles.previewContainer}>
                    <div style={{ backgroundColor: currentBgColor === 'transparent' ? '#f3f4f6' : currentBgColor, padding: 10, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e5e7eb' }}>
                        <img src={previewUrl} alt="Whiteboard Preview" className={styles.previewImage} style={{ boxShadow: 'none', border: 'none', backgroundColor: 'transparent' }} />
                    </div>
                </div>

                <div className={styles.optionsContainer} style={{ padding: '0 24px 24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <label style={{ fontWeight: 500, fontSize: 14 }}>Background:</label>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
                            <input
                                type="radio"
                                name="bgType"
                                checked={bgType === 'transparent'}
                                onChange={() => setBgType('transparent')}
                            />
                            Transparent
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, cursor: 'pointer' }}>
                            <input
                                type="radio"
                                name="bgType"
                                checked={bgType === 'custom'}
                                onChange={() => setBgType('custom')}
                            />
                            Solid Color
                        </label>
                        {bgType === 'custom' && (
                            <input
                                type="color"
                                value={customColor}
                                onChange={(e) => setCustomColor(e.target.value)}
                                style={{ width: 32, height: 32, padding: 0, cursor: 'pointer', border: '1px solid #d1d5db', borderRadius: 4 }}
                            />
                        )}
                    </div>
                </div>

                <div className={styles.actions}>
                    <button className={styles.actionButton} onClick={onDownloadBoardFile}>
                        <Download size={18} />
                        Download .ivxboard
                    </button>
                    <button className={styles.actionButton} onClick={handleExportPNG}>
                        <Download size={18} />
                        Export PNG
                    </button>
                    <button className={styles.actionButton} onClick={handleExportJPG}>
                        <ImageIcon size={18} />
                        Export JPG
                    </button>
                    <button className={styles.actionButton} onClick={handleCopyClipboard}>
                        <Copy size={18} />
                        Copy Image
                    </button>
                </div>
            </div>
        </div>
    );
};
