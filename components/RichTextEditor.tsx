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
  | { type: 'clear' };

const runCommand = (command: RichTextCommand) => {
  if (typeof document === 'undefined') return;

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
  }
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

  const api = useMemo(() => {
    return {
      run: (command: RichTextCommand) => runCommand(command),
      focus: () => ref.current?.focus(),
    };
  }, []);

  useEffect(() => {
    onReady?.(api);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onReady]);

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
    onChangeHtml(el.innerHTML);
  };

  const handlePaste: React.ClipboardEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    const text = event.clipboardData.getData('text/plain');
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
      spellCheck
      role="textbox"
      aria-multiline="true"
    />
  );
}

