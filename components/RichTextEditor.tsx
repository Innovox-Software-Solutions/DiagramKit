"use client";

import React, { useEffect, useMemo, useRef } from 'react';
import styles from './RichTextEditor.module.css';

export type RichTextCommand =
  | { type: 'bold' }
  | { type: 'italic' }
  | { type: 'ul' }
  | { type: 'ol' }
  | { type: 'h1' }
  | { type: 'h2' }
  | { type: 'divider' }
  | { type: 'link'; href: string }
  | { type: 'unlink' }
  | { type: 'clear' }
  | { type: 'textColor'; value: string }
  | { type: 'highlightColor'; value: string }
  | { type: 'fontFamily'; value: string };

const runCommand = (command: RichTextCommand) => {
  if (typeof document === 'undefined') return;
  try {
    document.execCommand('styleWithCSS', false, 'true');
  } catch {
    // ignore
  }

  const applyInlineStyle = (property: string, value: string) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);

    if (range.collapsed) return;

    const selected = range.extractContents();
    const span = document.createElement('span');
    span.style.setProperty(property, value);
    span.appendChild(selected);
    range.insertNode(span);

    const nextRange = document.createRange();
    nextRange.selectNodeContents(span);
    selection.removeAllRanges();
    selection.addRange(nextRange);
  };

  switch (command.type) {
    case 'bold':
      document.execCommand('bold');
      break;
    case 'italic':
      document.execCommand('italic');
      break;
    case 'ul':
      document.execCommand('insertUnorderedList');
      break;
    case 'ol':
      document.execCommand('insertOrderedList');
      break;
    case 'h1':
      document.execCommand('formatBlock', false, 'h1');
      break;
    case 'h2':
      document.execCommand('formatBlock', false, 'h2');
      break;
    case 'divider':
      document.execCommand('insertHorizontalRule');
      break;
    case 'link':
      document.execCommand('createLink', false, command.href);
      break;
    case 'unlink':
      document.execCommand('unlink');
      break;
    case 'clear':
      document.execCommand('removeFormat');
      break;
    case 'textColor':
      applyInlineStyle('color', command.value);
      break;
    case 'highlightColor':
      applyInlineStyle('background-color', command.value);
      break;
    case 'fontFamily':
      applyInlineStyle('font-family', command.value);
      break;
  }
};

const normalizeHtml = (html: string): string => {
  let next = html;

  // Normalize <br/> to <br> for easier processing.
  next = next.replace(/<br\s*\/>/gi, '<br>');

  // Collapse excessive blank lines created as <div><br></div>.
  next = next.replace(/(?:<div>\s*<br>\s*<\/div>\s*){3,}/gi, '<div><br></div><div><br></div>');

  // If content is only blank lines, treat it as empty.
  if (/^(?:\s*<div>\s*<br>\s*<\/div>\s*)+$/i.test(next)) {
    next = '';
  }

  return next;
};

export default function RichTextEditor({
  valueHtml,
  onChangeHtml,
  placeholder,
  className,
  onReady,
}: {
  valueHtml: string;
  onChangeHtml: (nextHtml: string) => void;
  placeholder?: string;
  className?: string;
  onReady?: (api: { run: (command: RichTextCommand) => void; focus: () => void }) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const selectionRangeRef = useRef<Range | null>(null);

  const saveSelection = () => {
    const root = ref.current;
    if (!root) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    const anchorNode = selection.anchorNode;
    if (anchorNode && root.contains(anchorNode)) {
      selectionRangeRef.current = range.cloneRange();
    }
  };

  const restoreSelection = () => {
    const root = ref.current;
    const range = selectionRangeRef.current;
    if (!root || !range) return;
    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const api = useMemo(() => {
    return {
      run: (command: RichTextCommand) => {
        const root = ref.current;
        if (!root) return;
        root.focus();
        restoreSelection();
        runCommand(command);
        saveSelection();
      },
      focus: () => {
        ref.current?.focus();
        restoreSelection();
      },
    };
  }, []);

  useEffect(() => {
    onReady?.(api);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onReady]);

  useEffect(() => {
    try {
      document.execCommand('defaultParagraphSeparator', false, 'div');
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.innerHTML !== valueHtml) {
      el.innerHTML = valueHtml;
    }
  }, [valueHtml]);

  const handleInput = () => {
    const el = ref.current;
    if (!el) return;
    const raw = el.innerHTML;
    const normalized = normalizeHtml(raw);
    if (normalized !== raw) {
      el.innerHTML = normalized;
    }
    onChangeHtml(normalized);
    saveSelection();
  };

  const handlePaste: React.ClipboardEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    const text = event.clipboardData.getData('text/plain');
    if (text.includes('\n')) {
      const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const html = escape(text).replace(/\n/g, '<br/>');
      document.execCommand('insertHTML', false, html);
      return;
    }
    document.execCommand('insertText', false, text);
  };

  return (
    <div
      ref={ref}
      className={`${styles.editor} ${className ?? ''}`}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder ?? ''}
      onInput={handleInput}
      onPaste={handlePaste}
      onKeyUp={saveSelection}
      onMouseUp={saveSelection}
      onBlur={saveSelection}
      spellCheck={false}
      role="textbox"
      aria-multiline="true"
    />
  );
}
