import { useMemo } from 'react';
import { escapeHtml } from '@/lib/utils';

/**
 * Renders a safe subset of markdown. We escape first, then re-introduce only the
 * tags we generate ourselves, so message content can never inject HTML.
 */
export function renderMarkdown(source: string, mentionNames: string[] = []): string {
  let text = escapeHtml(source || '');

  // fenced code blocks
  const codeBlocks: string[] = [];
  text = text.replace(/```([a-z]*)\n?([\s\S]*?)```/gi, (_m, _lang, code) => {
    codeBlocks.push(`<pre><code>${code.replace(/\n$/, '')}</code></pre>`);
    return `\u0000CODE${codeBlocks.length - 1}\u0000`;
  });

  // inline code
  const inline: string[] = [];
  text = text.replace(/`([^`\n]+)`/g, (_m, code) => {
    inline.push(`<code>${code}</code>`);
    return `\u0000INL${inline.length - 1}\u0000`;
  });

  // links (http/https only)
  text = text.replace(/(https?:\/\/[^\s<]+)/g, (url) => {
    const clean = url.replace(/[.,)]+$/, '');
    const tail = url.slice(clean.length);
    return `<a href="${clean}" target="_blank" rel="noopener noreferrer nofollow">${clean}</a>${tail}`;
  });

  // bold / italic / strike
  text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  text = text.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');

  // headings
  text = text.replace(/^###\s+(.*)$/gm, '<h3>$1</h3>');
  text = text.replace(/^##\s+(.*)$/gm, '<h2>$1</h2>');
  text = text.replace(/^#\s+(.*)$/gm, '<h1>$1</h1>');

  // blockquote
  text = text.replace(/^&gt;\s?(.*)$/gm, '<blockquote>$1</blockquote>');

  // lists
  text = text.replace(/(?:^|\n)((?:[-*]\s+.*(?:\n|$))+)/g, (block) => {
    const items = block.trim().split('\n').map((l) => `<li>${l.replace(/^[-*]\s+/, '')}</li>`).join('');
    return `<ul>${items}</ul>`;
  });
  text = text.replace(/(?:^|\n)((?:\d+\.\s+.*(?:\n|$))+)/g, (block) => {
    const items = block.trim().split('\n').map((l) => `<li>${l.replace(/^\d+\.\s+/, '')}</li>`).join('');
    return `<ol>${items}</ol>`;
  });

  // @mentions — longest name first so "Rohit Verma" wins over "Rohit"
  const names = [...mentionNames].sort((a, b) => b.length - a.length);
  for (const name of names) {
    if (!name) continue;
    const safe = escapeHtml(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(`@${safe}`, 'g'), `<span class="mention">@${escapeHtml(name)}</span>`);
  }

  text = text.replace(/\n/g, '<br/>');
  text = text.replace(/<\/(ul|ol|pre|h1|h2|h3|blockquote)><br\/>/g, '</$1>');
  text = text.replace(/<br\/><(ul|ol|pre|h1|h2|h3|blockquote)/g, '<$1');

  inline.forEach((html, i) => {
    text = text.replace(`\u0000INL${i}\u0000`, html);
  });
  codeBlocks.forEach((html, i) => {
    text = text.replace(`\u0000CODE${i}\u0000`, html);
  });

  return text;
}

export function RichText({ body, mentionNames }: { body: string; mentionNames: string[] }) {
  const html = useMemo(() => renderMarkdown(body, mentionNames), [body, mentionNames]);
  return <div className="prose-msg" dangerouslySetInnerHTML={{ __html: html }} />;
}
