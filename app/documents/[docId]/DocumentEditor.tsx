"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { UserMenu } from '@/components/UserMenu';
import RichTextEditor, { type RichTextCommand } from '@/components/RichTextEditor';
import { Bold, Italic, List, ListOrdered, Heading1, Heading2, SeparatorHorizontal, Link2, Unlink, Eraser } from 'lucide-react';
import styles from '../documents.module.css';

type StoredDocument = {
  title: string;
  contentHtml?: string;
  content?: string;
  updatedAt: number;
};

const docKey = (docId: string) => `diagramkit.document.${docId}.v1`;
const listKey = 'diagramkit.documents.v1';

const safeParseDoc = (value: string | null): StoredDocument => {
  if (!value) return { title: 'Untitled Document', contentHtml: '', updatedAt: Date.now() };
  try {
    const parsed = JSON.parse(value) as Partial<StoredDocument>;
    return {
      title: String(parsed.title ?? 'Untitled Document'),
      contentHtml: typeof parsed.contentHtml === 'string' ? parsed.contentHtml : undefined,
      content: typeof parsed.content === 'string' ? parsed.content : undefined,
      updatedAt: Number(parsed.updatedAt ?? Date.now()),
    };
  } catch {
    return { title: 'Untitled Document', contentHtml: '', updatedAt: Date.now() };
  }
};

const safeParseList = (value: string | null): { id: string; title: string; updatedAt: number }[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        const record = item as { id?: unknown; title?: unknown; updatedAt?: unknown };
        if (!record.id) return null;
        return {
          id: String(record.id),
          title: String(record.title ?? 'Untitled Document'),
          updatedAt: Number(record.updatedAt ?? Date.now()),
        };
      })
      .filter(Boolean) as { id: string; title: string; updatedAt: number }[];
  } catch {
    return [];
  }
};

export default function DocumentEditor({ docId }: { docId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState('Untitled Document');
  const [contentHtml, setContentHtml] = useState('');
  const saveTimer = useRef<number | null>(null);
  const editorApi = useRef<null | { run: (command: RichTextCommand) => void; focus: () => void }>(null);

  const markdownToHtml = (markdown: string) => {
    const lines = markdown.replace(/\r\n/g, '\n').split('\n');
    const escape = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const inline = (s: string) => {
      const escaped = escape(s);
      return escaped
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');
    };

    const out: string[] = [];
    let i = 0;
    const takeWhile = (pred: (line: string) => boolean) => {
      const buf: string[] = [];
      while (i < lines.length && pred(lines[i])) {
        buf.push(lines[i]);
        i += 1;
      }
      return buf;
    };

    while (i < lines.length) {
      const line = lines[i] ?? '';
      const t = line.trim();
      if (!t) {
        i += 1;
        continue;
      }
      if (t.startsWith('# ')) {
        out.push(`<h1>${inline(t.slice(2))}</h1>`);
        i += 1;
        continue;
      }
      if (t.startsWith('## ')) {
        out.push(`<h2>${inline(t.slice(3))}</h2>`);
        i += 1;
        continue;
      }
      if (/^[-*]\s+/.test(t)) {
        const items = takeWhile((l) => /^[-*]\s+/.test(l.trim())).map((l) => `<li>${inline(l.trim().replace(/^[-*]\s+/, ''))}</li>`);
        out.push(`<ul>${items.join('')}</ul>`);
        continue;
      }
      if (/^\d+\.\s+/.test(t)) {
        const items = takeWhile((l) => /^\d+\.\s+/.test(l.trim())).map((l) => `<li>${inline(l.trim().replace(/^\d+\.\s+/, ''))}</li>`);
        out.push(`<ol>${items.join('')}</ol>`);
        continue;
      }
      const paragraphLines = takeWhile((l) => l.trim() !== '' && !/^#{1,3}\s+/.test(l.trim()) && !/^[-*]\s+/.test(l.trim()) && !/^\d+\.\s+/.test(l.trim()));
      out.push(`<p>${inline(paragraphLines.join('<br/>'))}</p>`);
    }

    return out.join('');
  };

  useEffect(() => {
    const stored = safeParseDoc(localStorage.getItem(docKey(docId)));
    setTitle(stored.title);
    if (stored.contentHtml && stored.contentHtml.trim().length > 0) {
      setContentHtml(stored.contentHtml);
    } else if (stored.content && stored.content.trim().length > 0) {
      setContentHtml(markdownToHtml(stored.content));
    } else {
      setContentHtml('');
    }
  }, [docId]);

  const persist = useMemo(() => {
    return (nextTitle: string, nextContentHtml: string) => {
      const updatedAt = Date.now();
      const payload: StoredDocument = { title: nextTitle, contentHtml: nextContentHtml, updatedAt };
      localStorage.setItem(docKey(docId), JSON.stringify(payload));

      const list = safeParseList(localStorage.getItem(listKey));
      const nextList = [
        { id: docId, title: nextTitle, updatedAt },
        ...list.filter((item) => item.id !== docId),
      ];
      localStorage.setItem(listKey, JSON.stringify(nextList));
    };
  }, [docId]);

  const scheduleSave = (nextTitle: string, nextContent: string) => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      persist(nextTitle, nextContent);
      saveTimer.current = null;
    }, 250);
  };

  useEffect(() => {
    scheduleSave(title, contentHtml);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, contentHtml]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, []);

  const handleBack = () => {
    persist(title, contentHtml);
    router.push('/documents');
  };

  const handleShare = async () => {
    try {
      const tmp = document.createElement('div');
      tmp.innerHTML = contentHtml;
      const text = (tmp.textContent ?? '').trim();
      await navigator.clipboard.writeText(text.length ? text : (title.trim().length ? title.trim() : 'Untitled Document'));
      alert('Copied to clipboard');
    } catch {
      alert('Unable to copy');
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <button className={styles.secondaryButton} onClick={handleBack}>
            Back
          </button>
          <input
            className={styles.titleInput}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Document title"
          />
        </div>

        <nav className={styles.modeTabs} aria-label="Workspace mode">
          <Link href="/documents" className={`${styles.modeTab} ${styles.modeTabActive}`}>
            Document
          </Link>
          <Link href="/both" className={styles.modeTab}>
            Both
          </Link>
          <Link href="/canvas" className={styles.modeTab}>
            Canvas
          </Link>
        </nav>

        <div className={styles.headerRight}>
          <button className={styles.headerActionButton} type="button" title="Command palette">
            Ctrl K
          </button>
          <button className={styles.headerPrimaryButton} type="button" onClick={handleShare} title="Copy to clipboard">
            Share
          </button>
          <UserMenu />
        </div>
      </header>

      <div className={styles.docCanvas}>
        <div className={styles.docPaper}>
          <div className={styles.docTitle}>{title.trim().length ? title : 'Untitled Document'}</div>
          <div className={styles.docHint}>Type your notes here — use the toolbar for formatting.</div>

          <div className={styles.docEditorWrap}>
            <RichTextEditor
              valueHtml={contentHtml}
              onChangeHtml={setContentHtml}
              placeholder="Start writing…"
              className={styles.docEditor}
              onReady={(api) => {
                editorApi.current = api;
              }}
            />
          </div>
        </div>
      </div>

      <div className={styles.bottomBar} role="toolbar" aria-label="Document tools">
        <button className={styles.bottomButton} onClick={() => editorApi.current?.run({ type: 'bold' })} title="Bold (Ctrl+B)">
          <Bold size={16} />
        </button>
        <button className={styles.bottomButton} onClick={() => editorApi.current?.run({ type: 'italic' })} title="Italic (Ctrl+I)">
          <Italic size={16} />
        </button>
        <div className={styles.bottomDivider} />
        <button className={styles.bottomButton} onClick={() => editorApi.current?.run({ type: 'h1' })} title="Heading 1">
          <Heading1 size={16} />
        </button>
        <button className={styles.bottomButton} onClick={() => editorApi.current?.run({ type: 'h2' })} title="Heading 2">
          <Heading2 size={16} />
        </button>
        <div className={styles.bottomDivider} />
        <button className={styles.bottomButton} onClick={() => editorApi.current?.run({ type: 'ul' })} title="Bulleted list">
          <List size={16} />
        </button>
        <button className={styles.bottomButton} onClick={() => editorApi.current?.run({ type: 'ol' })} title="Numbered list">
          <ListOrdered size={16} />
        </button>
        <button className={styles.bottomButton} onClick={() => editorApi.current?.run({ type: 'divider' })} title="Divider">
          <SeparatorHorizontal size={16} />
        </button>
        <div className={styles.bottomDivider} />
        <button
          className={styles.bottomButton}
          onClick={() => {
            const href = window.prompt('Link URL');
            if (!href) return;
            editorApi.current?.run({ type: 'link', href });
          }}
          title="Insert link"
        >
          <Link2 size={16} />
        </button>
        <button className={styles.bottomButton} onClick={() => editorApi.current?.run({ type: 'unlink' })} title="Remove link">
          <Unlink size={16} />
        </button>
        <div className={styles.bottomSpacer} />
        <button className={styles.bottomButton} onClick={() => editorApi.current?.run({ type: 'clear' })} title="Clear formatting">
          <Eraser size={16} />
        </button>
      </div>
    </div>
  );
}
