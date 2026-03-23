import type Quill from 'quill';

function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url, 'https://placeholder.invalid');
    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

export function serializeDelta(quill: Quill): string {
  const delta = quill.getContents();
  let result = '';
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];
  let pendingText = '';
  let orderedIndex = 0;

  const flushCodeBlock = () => {
    result += '```\n' + codeBlockLines.join('\n') + '\n```';
    codeBlockLines = [];
    inCodeBlock = false;
  };

  function applyInlineFormat(text: string, attrs: Record<string, unknown>): string {
    let formatted = text;
    if (formatted !== '\n' && formatted.trim() !== '') {
      if (attrs['bold']) formatted = '**' + formatted + '**';
      if (attrs['italic']) formatted = '*' + formatted + '*';
      if (attrs['strike']) formatted = '~~' + formatted + '~~';
      if (attrs['link'] && isSafeUrl(String(attrs['link']))) {
        const safeLink = String(attrs['link']).replace(/\)/g, '%29');
        formatted = '[' + formatted + '](' + safeLink + ')';
      }
    }
    return formatted;
  }

  for (const op of delta.ops) {
    // Handle mention embeds: { insert: { mention: { id, name } } }
    if (typeof op.insert === 'object' && op.insert !== null && 'mention' in op.insert) {
      const m = op.insert.mention as { id: number; name: string };
      if (m.id === -1 && m.name === 'here') {
        pendingText += '<@here>';
      } else {
        pendingText += `<@${m.id}|${m.name}>`;
      }
      continue;
    }
    if (typeof op.insert !== 'string') continue;
    const attrs = op.attributes || {};
    const text = op.insert;

    if (attrs['code-block']) {
      // Quill emits code-block on the trailing \n — pendingText holds the line content
      if (!inCodeBlock) inCodeBlock = true;
      codeBlockLines.push(pendingText);
      pendingText = '';
      orderedIndex = 0;
    } else if (attrs['blockquote']) {
      // Quill emits blockquote on the trailing \n
      if (inCodeBlock) flushCodeBlock();
      if (pendingText) {
        result += '> ' + pendingText + '\n';
        pendingText = '';
      } else {
        result += '> \n';
      }
      orderedIndex = 0;
    } else if (attrs['list'] === 'ordered') {
      // Quill emits list attr on the trailing \n
      if (inCodeBlock) flushCodeBlock();
      orderedIndex++;
      result += orderedIndex + '. ' + pendingText + '\n';
      pendingText = '';
    } else if (attrs['list'] === 'bullet') {
      if (inCodeBlock) flushCodeBlock();
      result += '- ' + pendingText + '\n';
      pendingText = '';
      orderedIndex = 0;
    } else {
      if (pendingText) {
        if (inCodeBlock) flushCodeBlock();
        result += pendingText;
        pendingText = '';
      }
      if (inCodeBlock) flushCodeBlock();

      if (attrs['code']) {
        pendingText += '`' + text + '`';
      } else {
        const formatted = applyInlineFormat(text, attrs);
        if (formatted.endsWith('\n') || formatted === '\n') {
          result += formatted;
          orderedIndex = 0;
        } else {
          pendingText += formatted;
        }
      }
    }
  }

  if (pendingText) {
    if (inCodeBlock) flushCodeBlock();
    result += pendingText;
  }
  if (inCodeBlock) flushCodeBlock();

  return result.trim();
}
