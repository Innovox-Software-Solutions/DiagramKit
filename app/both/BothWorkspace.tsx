"use client";

import React, { useEffect, useState } from 'react';
import { Whiteboard } from '@/components/Whiteboard';
import DocumentsPanel from './DocumentsPanel';
import styles from './both.module.css';

const PANEL_WIDTH = 440;
const TOPBAR_HEIGHT = 56;

export default function BothWorkspace() {
  const [isNarrow, setIsNarrow] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const sync = () => setIsNarrow(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const handleStorage = () => {
      try {
        const storedTheme = localStorage.getItem("diagramkit.docs.theme.v1");
        if (storedTheme === "dark") setTheme("dark");
        else setTheme("light");
      } catch (e) {}
    };
    handleStorage();
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const workspaceLeftOffset = isNarrow ? 0 : PANEL_WIDTH;

  return (
    <div className={`${styles.root} ${theme === 'light' ? styles.rootLight : ''}`}>
      <DocumentsPanel
        width={PANEL_WIDTH}
        topOffset={TOPBAR_HEIGHT}
        variant={isNarrow ? 'overlay' : 'side'}
        isOpen={!isNarrow || showDocs}
        onRequestClose={() => setShowDocs(false)}
      />
      {isNarrow && !showDocs && (
        <button className={styles.docsToggle} onClick={() => setShowDocs(true)}>
          Docs
        </button>
      )}
      <Whiteboard workspaceLeftOffset={workspaceLeftOffset} topbarHeight={TOPBAR_HEIGHT} />
    </div>
  );
}
