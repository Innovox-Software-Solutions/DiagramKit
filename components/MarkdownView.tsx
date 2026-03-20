import React from 'react';
import styles from './MarkdownView.module.css';

type Block =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'p'; text: string };

const parseBlocks = (source: string): Block[] => {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let index = 0;

  const takeWhile = (predicate: (line: string) => boolean): string[] => {
    const result: string[] = [];
    while (index < lines.length && predicate(lines[index])) {
      result.push(lines[index]);
      index += 1;
    }
    return result;
  };

  while (index < lines.length) {
    const line = lines[index] ?? '';
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    const h3 = trimmed.startsWith('### ') ? trimmed.slice(4) : null;
    const h2 = trimmed.startsWith('## ') ? trimmed.slice(3) : null;
    const h1 = trimmed.startsWith('# ') ? trimmed.slice(2) : null;

    if (h1 !== null) {
      blocks.push({ type: 'heading', level: 1, text: h1 });
      index += 1;
      continue;
    }
    if (h2 !== null) {
      blocks.push({ type: 'heading', level: 2, text: h2 });
      index += 1;
      continue;
    }
    if (h3 !== null) {
      blocks.push({ type: 'heading', level: 3, text: h3 });
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items = takeWhile((l) => /^[-*]\s+/.test(l.trim())).map((l) => l.trim().replace(/^[-*]\s+/, ''));
      blocks.push({ type: 'ul', items });
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items = takeWhile((l) => /^\d+\.\s+/.test(l.trim())).map((l) => l.trim().replace(/^\d+\.\s+/, ''));
      blocks.push({ type: 'ol', items });
      continue;
    }

    const paragraphLines = takeWhile((l) => l.trim() !== '' && !/^#{1,3}\s+/.test(l.trim()) && !/^[-*]\s+/.test(l.trim()) && !/^\d+\.\s+/.test(l.trim()));
    blocks.push({ type: 'p', text: paragraphLines.join('\n') });
  }

  return blocks;
};

const renderInline = (text: string): React.ReactNode[] => {
  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const rest = text.slice(cursor);

    if (rest.startsWith('`')) {
      const end = rest.indexOf('`', 1);
      if (end > 1) {
        nodes.push(<code key={`code_${cursor}`} className={styles.inlineCode}>{rest.slice(1, end)}</code>);
        cursor += end + 1;
        continue;
      }
    }

    if (rest.startsWith('**')) {
      const end = rest.indexOf('**', 2);
      if (end > 2) {
        nodes.push(<strong key={`b_${cursor}`} className={styles.strong}>{rest.slice(2, end)}</strong>);
        cursor += end + 2;
        continue;
      }
    }

    if (rest.startsWith('*')) {
      const end = rest.indexOf('*', 1);
      if (end > 1) {
        nodes.push(<em key={`i_${cursor}`} className={styles.em}>{rest.slice(1, end)}</em>);
        cursor += end + 1;
        continue;
      }
    }

    nodes.push(rest[0]);
    cursor += 1;
  }

  return nodes;
};

export default function MarkdownView({ value }: { value: string }) {
  const blocks = parseBlocks(value);
  if (blocks.length === 0) {
    return <div className={styles.empty}>Nothing to preview yet.</div>;
  }

  return (
    <div className={styles.root}>
      {blocks.map((block, idx) => {
        if (block.type === 'heading') {
          const Tag = block.level === 1 ? 'h1' : block.level === 2 ? 'h2' : 'h3';
          return <Tag key={idx} className={styles[`h${block.level}`]}>{renderInline(block.text)}</Tag>;
        }
        if (block.type === 'ul') {
          return (
            <ul key={idx} className={styles.ul}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} className={styles.li}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }
        if (block.type === 'ol') {
          return (
            <ol key={idx} className={styles.ol}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} className={styles.li}>{renderInline(item)}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={idx} className={styles.p}>
            {block.text.split('\n').map((line, lineIndex) => (
              <React.Fragment key={lineIndex}>
                {renderInline(line)}
                {lineIndex < block.text.split('\n').length - 1 ? <br /> : null}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
