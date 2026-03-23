import React from 'react';

/**
 * Parses inline markdown in a single line and returns React nodes.
 * Handles: **bold**, *italic*, _italic_, `code`, ~~strikethrough~~, ~strikethrough~, [text](url), plain URLs, @mentions
 * Nested formatting is supported (e.g. **bold _and italic_**).
 */
function renderInline(content: string, keyOffset: number = 0): React.ReactNode[] {
  // Mentions use <@id|name> format (inserted by autocomplete). Bare @word is NOT a mention.
  // Also supports <@here> for broadcast mentions.
  // Order matters: **bold** before *italic*, ~~strike~~ before ~strike~, _italic_ uses word-boundary-like guards
  const TOKEN = /(\*\*(.+?)\*\*)|(<@here>)|(<@(\d+)\|([^>]+)>)|(\*([^*\n]+?)\*)|((?<![a-zA-Z0-9])_([^_\n]+?)_(?![a-zA-Z0-9]))|(`([^`\n]+?)`)|(~~(.+?)~~)|(~([^~\n]+?)~)|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"'\])]+)/g;
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = keyOffset;
  while ((m = TOKEN.exec(content)) !== null) {
    if (m.index > last) nodes.push(content.slice(last, m.index));
    if (m[1]) {
      // **bold** — recurse for nested formatting
      nodes.push(<strong key={key++} className="font-bold">{renderInline(m[2], key * 1000)}</strong>);
    } else if (m[3]) {
      // <@here> — broadcast mention
      nodes.push(<span key={key++} className="mention-highlight rounded bg-amber-200/60 px-[2px] text-amber-900 font-medium cursor-pointer hover:bg-amber-200">@here</span>);
    } else if (m[4]) {
      // <@id|name> — user mention
      nodes.push(<span key={key++} className="mention-highlight rounded bg-slack-mention px-[2px] text-slack-link font-medium cursor-pointer hover:bg-slack-mention-hover" data-mention-id={m[5]} data-mention-name={m[6]}>@{m[6]}</span>);
    } else if (m[7]) {
      // *italic* — recurse for nested formatting
      nodes.push(<em key={key++} className="leading-[22px]">{renderInline(m[8], key * 1000)}</em>);
    } else if (m[9]) {
      // _italic_ — recurse for nested formatting
      nodes.push(<em key={key++} className="leading-[22px]">{renderInline(m[10], key * 1000)}</em>);
    } else if (m[11]) {
      // `code` — no recursion (code is literal)
      nodes.push(<code key={key++} className="rounded-[3px] border border-slack-border bg-slack-code-bg px-1 py-0.5 font-mono text-[0.875em] text-slack-code-inline">{m[12]}</code>);
    } else if (m[13]) {
      // ~~strikethrough~~ — recurse for nested formatting
      nodes.push(<s key={key++}>{renderInline(m[14], key * 1000)}</s>);
    } else if (m[15]) {
      // ~strikethrough~ — recurse for nested formatting
      nodes.push(<s key={key++}>{renderInline(m[16], key * 1000)}</s>);
    } else if (m[17]) {
      // [text](url)
      nodes.push(<a key={key++} href={m[18]} target="_blank" rel="noopener noreferrer" className="text-slack-link underline hover:text-slack-link-hover">{m[17]}</a>);
    } else if (m[19]) {
      // plain URL
      nodes.push(<a key={key++} href={m[19]} target="_blank" rel="noopener noreferrer" className="text-slack-link underline hover:text-slack-link-hover">{m[19]}</a>);
    }
    last = m.index + m[0].length;
  }
  if (last < content.length) nodes.push(content.slice(last));
  return nodes;
}

const BIDI_CHARS = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
const MAX_RENDER_LENGTH = 10000;

/**
 * Parses message content and returns React nodes.
 * Block-level parsing (blockquotes, code blocks) runs first, then inline markdown.
 */
export function renderMessageContent(content: string): React.ReactNode {
  // Strip bidi override characters to prevent visual spoofing
  content = content.replace(BIDI_CHARS, '');
  // Cap length to prevent ReDoS on crafted messages
  if (content.length > MAX_RENDER_LENGTH) {
    content = content.slice(0, MAX_RENDER_LENGTH) + '... (message truncated)';
  }
  const nodes: React.ReactNode[] = [];
  let key = 0;

  // Split into segments: code blocks (```...```) and everything else
  const CODE_BLOCK = /```([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = CODE_BLOCK.exec(content)) !== null) {
    // Process text before the code block
    if (m.index > last) {
      const before = content.slice(last, m.index);
      nodes.push(...renderLines(before, key));
      key += 1000;
    }
    // Render the code block
    const codeContent = m[1].replace(/^\n/, '').replace(/\n$/, '');
    nodes.push(
      <pre key={key++} className="my-1 rounded border border-slack-border bg-slack-code-bg px-3 py-2 font-mono text-[0.875em] overflow-x-auto whitespace-pre-wrap">
        <code>{codeContent}</code>
      </pre>
    );
    last = m.index + m[0].length;
  }

  // Process any remaining text after the last code block
  if (last < content.length) {
    const remaining = content.slice(last);
    nodes.push(...renderLines(remaining, key));
  }

  return nodes.length > 0 ? nodes : content;
}

/**
 * Renders a chunk of text that may contain multiple lines, some of which may be blockquotes.
 */
function renderLines(text: string, keyOffset: number): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const lines = text.split('\n');
  let key = keyOffset;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('> ')) {
      // Collect consecutive blockquote lines
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      const quoteContent = quoteLines.join('\n');
      nodes.push(
        <blockquote key={key++} className="border-l-4 border-slack-border-dark pl-3 my-0.5 text-slack-secondary italic">
          {renderInline(quoteContent, key * 100)}
        </blockquote>
      );
    } else if (/^\d+\.\s/.test(line)) {
      // Collect consecutive ordered list items
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ''));
        i++;
      }
      nodes.push(
        <ol key={key++} className="list-decimal pl-6 my-0.5">
          {items.map((item, idx) => (
            <li key={idx} className="text-[15px] leading-[22px]">{renderInline(item, (key + idx) * 100)}</li>
          ))}
        </ol>
      );
      key += items.length;
    } else if (line.startsWith('- ')) {
      // Collect consecutive bullet list items
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith('- ')) {
        items.push(lines[i].slice(2));
        i++;
      }
      nodes.push(
        <ul key={key++} className="list-disc pl-6 my-0.5">
          {items.map((item, idx) => (
            <li key={idx} className="text-[15px] leading-[22px]">{renderInline(item, (key + idx) * 100)}</li>
          ))}
        </ul>
      );
      key += items.length;
    } else {
      // Normal line — render inline, add newline between lines (but not after the last)
      if (nodes.length > 0 && i > 0) {
        nodes.push('\n');
      }
      const inlineNodes = renderInline(line, key * 100);
      nodes.push(...inlineNodes);
      key++;
      i++;
    }
  }

  return nodes;
}
