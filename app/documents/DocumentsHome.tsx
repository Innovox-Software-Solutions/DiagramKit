"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useEffect, useMemo, useState } from 'react';
import { UserMenu } from '@/components/UserMenu';
import styles from './documents.module.css';

type DocumentRecord = {
  id: string;
  title: string;
  updatedAt: number;
};

const STORAGE_KEY = 'diagramkit.documents.v1';

const safeParse = (value: string | null): DocumentRecord[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        const record = item as Partial<DocumentRecord>;
        if (!record.id) return null;
        return {
          id: String(record.id),
          title: String(record.title ?? 'Untitled Document'),
          updatedAt: Number(record.updatedAt ?? Date.now()),
        } satisfies DocumentRecord;
      })
      .filter(Boolean) as DocumentRecord[];
  } catch {
    return [];
  }
};

const createId = () => {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return randomUuid;
  return `doc_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

export default function DocumentsHome() {
  const router = useRouter();
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDocuments(safeParse(localStorage.getItem(STORAGE_KEY)));
    setHasLoaded(true);
  }, []);

  useEffect(() => {
    if (!hasLoaded) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(documents));
  }, [documents, hasLoaded]);

  const sortedDocuments = useMemo(() => {
    return [...documents].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [documents]);

  const handleCreate = () => {
    const id = createId();
    const now = Date.now();
    const record: DocumentRecord = { id, title: 'Untitled Document', updatedAt: now };
    setDocuments((prev) => [record, ...prev]);
    const starterHtml = `<h2>Highlights</h2><ul><li>Write bullet points</li><li>Use <strong>bold</strong> for important words</li><li>Add headings with H1 / H2</li></ul>`;
    localStorage.setItem(
      `diagramkit.document.${id}.v1`,
      JSON.stringify({ title: record.title, contentHtml: starterHtml, updatedAt: now }),
    );
    router.push(`/documents/${id}`);
  };

  const handleDelete = (docId: string) => {
    setDocuments((prev) => prev.filter((doc) => doc.id !== docId));
    localStorage.removeItem(`diagramkit.document.${docId}.v1`);
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div>
            <div className={styles.heading}>Documents</div>
            <div className={styles.subheading}>Anyone can create and edit documents on this device.</div>
          </div>
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
          <button className={styles.primaryButton} onClick={handleCreate}>
            New Document
          </button>
          <UserMenu />
        </div>
      </header>

      <div className={styles.list}>
        {sortedDocuments.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>No documents yet</div>
            <div className={styles.emptyDesc}>Create your first document to get started.</div>
            <button className={styles.primaryButton} onClick={handleCreate}>
              Create Document
            </button>
          </div>
        ) : (
          sortedDocuments.map((doc) => (
            <div key={doc.id} className={styles.item}>
              <Link className={styles.itemLink} href={`/documents/${doc.id}`}>
                <div className={styles.itemTitle}>{doc.title}</div>
                <div className={styles.itemMeta}>Updated {new Date(doc.updatedAt).toLocaleString()}</div>
              </Link>
              <button className={styles.dangerButton} onClick={() => handleDelete(doc.id)} aria-label={`Delete ${doc.title}`}>
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
