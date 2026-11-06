/**
 * Purpose: Zero-dependency lightweight Markdown and @mention pill renderer for chat messages.
 * Context: Avoids React 19 peer-dependency conflicts while providing code copying and token highlighting.
 * Usage: <MarkdownContent content={msg.content} />
 * Prerequisites: React 19, Lucide icons, Tailwind CSS.
 */

import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { triggerHaptic } from '@/utils/haptics';

interface MarkdownContentProps {
  content: string;
}

export const MarkdownContent: React.FC<MarkdownContentProps> = ({ content }) => {
  if (!content) return null;

  // Split into code block and non-code block segments
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="text-xs sm:text-sm text-text-primary leading-relaxed space-y-2 select-text break-words">
      {parts.map((part, index) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          return <CodeBlock key={index} codeBlock={part} />;
        }
        return <TextBlock key={index} text={part} />;
      })}
    </div>
  );
};

function CodeBlock({ codeBlock }: { codeBlock: string }) {
  const [copied, setCopied] = useState(false);

  // Extract language and code body
  const lines = codeBlock.slice(3, -3).split('\n');
  const firstLine = lines[0].trim();
  const language = /^[a-zA-Z0-9_\-]+$/.test(firstLine) ? firstLine : '';
  const code = language ? lines.slice(1).join('\n') : lines.join('\n');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code.trim());
      triggerHaptic('light');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="relative my-2 rounded-xl border border-border-subtle bg-surface-elevated overflow-hidden font-mono text-[11px] sm:text-xs">
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface-chip/50 border-b border-border-subtle text-text-tertiary">
        <span className="font-semibold uppercase tracking-wider">{language || 'CODE'}</span>
        <button
          onClick={handleCopy}
          type="button"
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-surface-hover text-text-secondary active:scale-95 transition-all cursor-pointer"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-accent-green" /> : <Copy className="w-3.5 h-3.5" />}
          <span className="text-[11px]">{copied ? '已复制' : '复制'}</span>
        </button>
      </div>
      <div className="p-3 overflow-x-auto max-h-80 overflow-y-auto touch-pan-x scrollbar-thin">
        <pre className="text-text-primary whitespace-pre font-mono leading-relaxed">{code.trim()}</pre>
      </div>
    </div>
  );
}

function TextBlock({ text }: { text: string }) {
  const lines = text.split('\n');

  return (
    <div className="space-y-1">
      {lines.map((line, lIdx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={lIdx} className="h-1.5" />;
        }

        // Blockquote
        if (trimmed.startsWith('>')) {
          return (
            <div key={lIdx} className="pl-3 border-l-2 border-border-default text-text-secondary italic my-1">
              {renderFormattedInline(trimmed.replace(/^>\s*/, ''))}
            </div>
          );
        }

        // Bullet list
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <div key={lIdx} className="flex items-start gap-2 pl-2">
              <span className="text-text-tertiary select-none">•</span>
              <div className="flex-1">{renderFormattedInline(trimmed.slice(2))}</div>
            </div>
          );
        }

        // Numbered list
        const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
        if (numMatch) {
          return (
            <div key={lIdx} className="flex items-start gap-2 pl-2">
              <span className="text-text-tertiary font-mono select-none text-[11px]">{numMatch[1]}.</span>
              <div className="flex-1">{renderFormattedInline(numMatch[2])}</div>
            </div>
          );
        }

        return <div key={lIdx}>{renderFormattedInline(line)}</div>;
      })}
    </div>
  );
}

function renderFormattedInline(raw: string): React.ReactNode[] {
  // Regex splitting on @mention, `inline_code`, **bold**, *italic*
  // 1: @mention: @[\u4e00-\u9fa5a-zA-Z0-9_\-·]+
  // 2: inline code: `[^`]+`
  // 3: bold: \*\*([^*]+)\*\*
  // 4: italic: \*([^*]+)\*
  const pattern = /(@(?:[\u4e00-\u9fa5a-zA-Z0-9_\-·]+(?: [a-zA-Z0-9\u4e00-\u9fa5]+)?)|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  const segments = raw.split(pattern);

  return segments.map((seg, idx) => {
    if (!seg) return null;

    // Mention pill
    if (seg.startsWith('@')) {
      return (
        <span
          key={idx}
          className="inline-flex items-center px-1.5 py-0.2 rounded-md bg-accent-blue/10 text-accent-blue font-semibold text-[11px] sm:text-xs border border-accent-blue/20 mx-0.5 select-none"
        >
          {seg}
        </span>
      );
    }

    // Inline code
    if (seg.startsWith('`') && seg.endsWith('`')) {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 rounded-md bg-surface-chip text-accent-amber font-mono text-[11px] border border-border-subtle"
        >
          {seg.slice(1, -1)}
        </code>
      );
    }

    // Bold
    if (seg.startsWith('**') && seg.endsWith('**')) {
      return (
        <strong key={idx} className="font-bold text-text-primary">
          {seg.slice(2, -2)}
        </strong>
      );
    }

    // Italic
    if (seg.startsWith('*') && seg.endsWith('*')) {
      return (
        <em key={idx} className="italic text-text-secondary">
          {seg.slice(1, -1)}
        </em>
      );
    }

    return <span key={idx}>{seg}</span>;
  });
}
