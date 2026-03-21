"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { decompressFromUTF16 } from 'lz-string';
import RichTextEditor from '@/components/RichTextEditor';
import styles from './both.module.css';

type DocumentListRecord = {
  id: string;
  title: string;
  updatedAt: number;
};

type StoredDocument = {
  title: string;
  contentHtml?: string;
  content?: string;
  updatedAt: number;
};

const LIST_KEY = 'diagramkit.documents.v1';
const ACTIVE_KEY = 'diagramkit.documents.active.v1';
const docKey = (id: string) => `diagramkit.document.${id}.v1`;
const DOC_COMPRESSED_PREFIX = 'lz:';

const decodeLocalHtml = (value: string | undefined) => {
  if (!value) return '';
  if (!value.startsWith(DOC_COMPRESSED_PREFIX)) return value;
  const decoded = decompressFromUTF16(value.slice(DOC_COMPRESSED_PREFIX.length));
  return decoded ?? '';
};

const safeParseList = (value: string | null): DocumentListRecord[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        const record = item as Partial<DocumentListRecord>;
        if (!record.id) return null;
        return {
          id: String(record.id),
          title: String(record.title ?? 'Untitled Document'),
          updatedAt: Number(record.updatedAt ?? Date.now()),
        } satisfies DocumentListRecord;
      })
      .filter(Boolean) as DocumentListRecord[];
  } catch {
    return [];
  }
};

const safeParseDoc = (value: string | null): StoredDocument => {
  if (!value) return { title: 'Untitled Document', contentHtml: '', updatedAt: Date.now() };
  try {
    const parsed = JSON.parse(value) as Partial<StoredDocument>;
    return {
      title: String(parsed.title ?? 'Untitled Document'),
      contentHtml: typeof parsed.contentHtml === 'string' ? decodeLocalHtml(parsed.contentHtml) : undefined,
      content: typeof parsed.content === 'string' ? parsed.content : undefined,
      updatedAt: Number(parsed.updatedAt ?? Date.now()),
    };
  } catch {
    return { title: 'Untitled Document', contentHtml: '', updatedAt: Date.now() };
  }
};

const createId = () => {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return randomUuid;
  return `doc_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

export default function DocumentsPanel({
  width,
  topOffset,
  variant,
  isOpen,
  onRequestClose,
}: {
  width: number;
  topOffset: number;
  variant: 'side' | 'overlay';
  isOpen: boolean;
  onRequestClose: () => void;
}) {
  if (!isOpen) return null;
  const [documents, setDocuments] = useState<DocumentListRecord[]>([]);
  const [activeDocId, setActiveDocId] = useState<string>('');
  const [title, setTitle] = useState('Untitled Document');
  const [contentHtml, setContentHtml] = useState('');
  const saveTimer = useRef<number | null>(null);
  const hasLoaded = useRef(false);

  const [overlayHeight, setOverlayHeight] = useState<number | null>(null);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const el = event.currentTarget.closest('aside');
    if (!el) return;
    dragRef.current = { startY: event.clientY, startHeight: el.offsetHeight };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dy = event.clientY - dragRef.current.startY;
    const newHeight = dragRef.current.startHeight - dy;
    const minHeight = 160;
    const maxHeight = typeof window !== 'undefined' ? window.innerHeight - 100 : 800;
    setOverlayHeight(Math.max(minHeight, Math.min(maxHeight, newHeight)));
  };

  const stopDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      dragRef.current = null;
    }
  };

  useEffect(() => {
    const list = safeParseList(localStorage.getItem(LIST_KEY));
    const storedActive = localStorage.getItem(ACTIVE_KEY) ?? '';

    let initialActive = storedActive && list.some((d) => d.id === storedActive) ? storedActive : (list[0]?.id ?? '');

    if (!initialActive) {
      const id = createId();
      const now = Date.now();
      const record: DocumentListRecord = { id, title: 'Untitled Document', updatedAt: now };
      localStorage.setItem(LIST_KEY, JSON.stringify([record]));
      localStorage.setItem(ACTIVE_KEY, id);
      const starterHtml = `<h2>Highlights</h2><ul><li>Write bullet points</li><li>Use <strong>bold</strong> for important words</li><li>Add headings with H1 / H2</li></ul>`;
      localStorage.setItem(docKey(id), JSON.stringify({ title: record.title, contentHtml: starterHtml, updatedAt: now } satisfies StoredDocument));
      setDocuments([record]);
      setActiveDocId(id);
      setTitle(record.title);
      setContentHtml(starterHtml);
      hasLoaded.current = true;
      return;
    }

    localStorage.setItem(ACTIVE_KEY, initialActive);
    setDocuments(list);
    setActiveDocId(initialActive);

    const storedDoc = safeParseDoc(localStorage.getItem(docKey(initialActive)));
    setTitle(storedDoc.title);
    setContentHtml(storedDoc.contentHtml ?? storedDoc.content ?? '');
    hasLoaded.current = true;
  }, []);

  const sortedDocs = useMemo(() => [...documents].sort((a, b) => b.updatedAt - a.updatedAt), [documents]);

  const persist = (nextId: string, nextTitle: string, nextContent: string) => {
    const updatedAt = Date.now();
    localStorage.setItem(docKey(nextId), JSON.stringify({ title: nextTitle, contentHtml: nextContent, updatedAt } satisfies StoredDocument));
    localStorage.setItem(ACTIVE_KEY, nextId);

    setDocuments((prev) => {
      const nextList = [{ id: nextId, title: nextTitle, updatedAt }, ...prev.filter((d) => d.id !== nextId)];
      localStorage.setItem(LIST_KEY, JSON.stringify(nextList));
      return nextList;
    });
  };

  const scheduleSave = (nextId: string, nextTitle: string, nextContent: string) => {
    if (!hasLoaded.current) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      persist(nextId, nextTitle, nextContent);
      saveTimer.current = null;
    }, 250);
  };

  useEffect(() => {
    if (!activeDocId) return;
    scheduleSave(activeDocId, title, contentHtml);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDocId, title, contentHtml]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, []);

  const switchDoc = (nextId: string) => {
    if (!nextId || nextId === activeDocId) return;
    persist(activeDocId, title, contentHtml);
    const storedDoc = safeParseDoc(localStorage.getItem(docKey(nextId)));
    setActiveDocId(nextId);
    setTitle(storedDoc.title);
    setContentHtml(storedDoc.contentHtml ?? storedDoc.content ?? '');
    localStorage.setItem(ACTIVE_KEY, nextId);
  };

  const createNew = () => {
    const id = createId();
    const now = Date.now();
    const record: DocumentListRecord = { id, title: 'Untitled Document', updatedAt: now };
    const starterHtml = `<h2>Highlights</h2><ul><li>Write bullet points</li><li>Use <strong>bold</strong> for important words</li><li>Add headings with H1 / H2</li></ul>`;
    localStorage.setItem(docKey(id), JSON.stringify({ title: record.title, contentHtml: starterHtml, updatedAt: now } satisfies StoredDocument));
    setDocuments((prev) => {
      const next = [record, ...prev];
      localStorage.setItem(LIST_KEY, JSON.stringify(next));
      return next;
    });
    setActiveDocId(id);
    setTitle(record.title);
    setContentHtml(starterHtml);
    localStorage.setItem(ACTIVE_KEY, id);
  };

  return (
    <aside
      className={`${styles.docsPanel} ${variant === 'overlay' ? styles.docsPanelOverlay : ''}`}
      style={{
        width: variant === 'side' ? width : undefined,
        top: variant === 'side' ? topOffset : undefined,
        height: variant === 'overlay' && overlayHeight !== null ? `${overlayHeight}px` : undefined,
        transition: dragRef.current ? 'none' : 'height 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
      }}
    >
      {variant === 'overlay' && (
        <div
          className={styles.dragHandleArea}
          onPointerDown={startDrag}
          onPointerMove={onDrag}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
        >
          <div className={styles.dragHandleBar} />
        </div>
      )}
      <div className={styles.docsHeader}>
        <select
          className={styles.docsSelect}
          value={activeDocId}
          onChange={(event) => switchDoc(event.target.value)}
          aria-label="Select document"
        >
          {sortedDocs.map((doc) => (
            <option key={doc.id} value={doc.id}>
              {doc.title}
            </option>
          ))}
        </select>
        <button className={styles.docsNewButton} onClick={createNew}>
          New
        </button>
        {variant === 'overlay' && (
          <button className={styles.docsCloseButton} onClick={onRequestClose} aria-label="Close documents">
            Close
          </button>
        )}
      </div>

      <input
        className={styles.docsTitle}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        aria-label="Document title"
      />

      <RichTextEditor
        valueHtml={contentHtml}
        onChangeHtml={setContentHtml}
        placeholder="Type your notes…"
        className={styles.docsEditor}
      />
    </aside>
  );
}
