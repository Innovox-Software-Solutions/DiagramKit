"use client";

import React, { useEffect, useMemo, useRef } from 'react';
import styles from './RichTextEditor.module.css';

export type RichTextCommand =
  | { type: 'bold' }
  | { type: 'italic' }
  | { type: 'underline' }
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
  | { type: 'fontFamily'; value: string }
  | { type: 'table'; rows?: number; cols?: number; header?: boolean }
  | { type: 'insertHtml'; html: string };

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
    case 'underline':
      document.execCommand('underline');
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
    case 'table':
      {
        const rows = Math.max(1, Math.min(20, Number(command.rows ?? 3)));
        const cols = Math.max(1, Math.min(10, Number(command.cols ?? 3)));
        const withHeader = command.header !== false;
        const headerHtml = withHeader
          ? `<thead><tr>${Array.from({ length: cols })
              .map((_, i) => `<th>Header ${i + 1}</th>`)
              .join('')}</tr></thead>`
          : '';
        const bodyRows = Array.from({ length: rows })
          .map(
            (_, r) =>
              `<tr>${Array.from({ length: cols })
                .map((c, i) => `<td>${r === 0 ? `Cell ${i + 1}` : ''}</td>`)
                .join('')}</tr>`,
          )
          .join('');

        document.execCommand(
          'insertHTML',
          false,
          `<table>${headerHtml}<tbody>${bodyRows}</tbody></table><div><br></div>`,
        );
      }
      break;
    case 'insertHtml':
      document.execCommand('insertHTML', false, command.html);
      break;
  }
};

const parseDelimitedText = (input: string, delimiter: ',' | '\t') => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const next = input[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === delimiter) {
      row.push(cell);
      cell = '';
      continue;
    }

    if (!inQuotes && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += ch;
  }

  row.push(cell);
  rows.push(row);
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
};

const focusCell = (cell: HTMLTableCellElement) => {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(cell);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
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
    const handleSelectionChange = () => {
      const root = ref.current;
      if (!root) return;
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      const anchorNode = selection.anchorNode;
      if (anchorNode && root.contains(anchorNode)) {
        selectionRangeRef.current = selection.getRangeAt(0).cloneRange();
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, []);

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
    const root = ref.current;
    if (!root) return;

    const selection = window.getSelection();
    const anchorEl =
      selection?.anchorNode?.nodeType === Node.ELEMENT_NODE
        ? (selection.anchorNode as HTMLElement)
        : (selection?.anchorNode?.parentElement ?? null);
    const activeCell = anchorEl?.closest('td,th') as HTMLTableCellElement | null;

    const text = event.clipboardData.getData('text/plain');
    const hasGridData = text.includes('\t') || text.includes(',') || text.includes('\n');
    if (activeCell && hasGridData) {
      event.preventDefault();
      const delimiter: '\t' | ',' = text.includes('\t') ? '\t' : ',';
      const rows = parseDelimitedText(text, delimiter);
      const table = activeCell.closest('table');
      const rowEl = activeCell.parentElement as HTMLTableRowElement | null;
      if (!table || !rowEl || rows.length === 0) return;

      const startRowIndex = rowEl.rowIndex;
      const startCellIndex = activeCell.cellIndex;

      for (let r = 0; r < rows.length; r += 1) {
        const targetRowIndex = startRowIndex + r;
        while (targetRowIndex >= table.rows.length) {
          const tbody = table.tBodies[0] ?? table.createTBody();
          const newRow = tbody.insertRow(-1);
          const cols = Math.max(table.rows[0]?.cells.length ?? 1, startCellIndex + rows[r].length);
          for (let c = 0; c < cols; c += 1) newRow.insertCell(-1).innerHTML = '&nbsp;';
        }

        const targetRow = table.rows[targetRowIndex];
        const rowValues = rows[r];
        for (let c = 0; c < rowValues.length; c += 1) {
          const targetColIndex = startCellIndex + c;
          while (targetColIndex >= targetRow.cells.length) {
            if (targetRow.parentElement?.tagName === 'THEAD') {
              targetRow.insertCell(-1).outerHTML = '<th></th>';
            } else {
              targetRow.insertCell(-1).innerHTML = '&nbsp;';
            }
          }
          targetRow.cells[targetColIndex].textContent = rowValues[c] ?? '';
        }
      }

      onChangeHtml(normalizeHtml(root.innerHTML));
      return;
    }

    event.preventDefault();
    if (text.includes('\n')) {
      const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const html = escape(text).replace(/\n/g, '<br/>');
      document.execCommand('insertHTML', false, html);
      return;
    }
    document.execCommand('insertText', false, text);
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (event) => {
    const root = ref.current;
    if (!root) return;
    const selection = window.getSelection();
    const anchorEl =
      selection?.anchorNode?.nodeType === Node.ELEMENT_NODE
        ? (selection.anchorNode as HTMLElement)
        : (selection?.anchorNode?.parentElement ?? null);
    const activeCell = anchorEl?.closest('td,th') as HTMLTableCellElement | null;
    if (!activeCell) return;

    if (event.key === 'Tab') {
      event.preventDefault();
      const row = activeCell.parentElement as HTMLTableRowElement | null;
      const table = activeCell.closest('table');
      if (!row || !table) return;

      const currentRowIndex = row.rowIndex;
      const currentCellIndex = activeCell.cellIndex;
      const goingBackward = event.shiftKey;

      const targetCell = (() => {
        if (goingBackward) {
          if (currentCellIndex > 0) return row.cells[currentCellIndex - 1] as HTMLTableCellElement;
          if (currentRowIndex > 0) {
            const prevRow = table.rows[currentRowIndex - 1];
            return prevRow.cells[Math.max(0, prevRow.cells.length - 1)] as HTMLTableCellElement;
          }
          return activeCell;
        }

        if (currentCellIndex + 1 < row.cells.length) return row.cells[currentCellIndex + 1] as HTMLTableCellElement;
        if (currentRowIndex + 1 < table.rows.length) return table.rows[currentRowIndex + 1].cells[0] as HTMLTableCellElement;

        const tbody = table.tBodies[0] ?? table.createTBody();
        const cols = Math.max(1, row.cells.length);
        const newRow = tbody.insertRow(-1);
        for (let c = 0; c < cols; c += 1) newRow.insertCell(-1).innerHTML = '&nbsp;';
        onChangeHtml(normalizeHtml(root.innerHTML));
        return newRow.cells[0] as HTMLTableCellElement;
      })();

      focusCell(targetCell);
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      const row = activeCell.parentElement as HTMLTableRowElement | null;
      const table = activeCell.closest('table');
      if (!row || !table) return;
      const col = activeCell.cellIndex;
      const nextRowIndex = row.rowIndex + 1;
      if (nextRowIndex < table.rows.length) {
        const nextRow = table.rows[nextRowIndex];
        focusCell((nextRow.cells[Math.min(col, nextRow.cells.length - 1)] ?? nextRow.cells[0]) as HTMLTableCellElement);
        return;
      }
      const tbody = table.tBodies[0] ?? table.createTBody();
      const cols = Math.max(1, row.cells.length);
      const newRow = tbody.insertRow(-1);
      for (let c = 0; c < cols; c += 1) newRow.insertCell(-1).innerHTML = '&nbsp;';
      onChangeHtml(normalizeHtml(root.innerHTML));
      focusCell((newRow.cells[Math.min(col, newRow.cells.length - 1)] ?? newRow.cells[0]) as HTMLTableCellElement);
    }
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
      onKeyDown={handleKeyDown}
      onKeyUp={saveSelection}
      onMouseUp={saveSelection}
      onBlur={saveSelection}
      spellCheck={false}
      role="textbox"
      aria-multiline="true"
    />
  );
}
