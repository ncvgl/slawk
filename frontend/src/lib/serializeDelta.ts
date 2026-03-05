import type Quill from 'quill';

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
      if (attrs['link']) formatted = '[' + formatted + '](' + attrs['link'] + ')';
    }
    return formatted;
  }

  for (const op of delta.ops) {
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
