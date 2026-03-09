export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, '/')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function htmlToText(html: string): string {
  const text = html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|li|tr|h\d)>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<[^>]+>/g, ' ');

  return decodeHtmlEntities(text)
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function textToHtml(text: string): string {
  const escaped = escapeHtml(text.trim());
  if (!escaped) return '';

  return escaped
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br />')}</p>`)
    .join('');
}

export function buildSnippet(input: string, maxLength = 180): string {
  const normalized = input.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trim()}…`;
}

export function extractPlainText(textBody?: string | null, htmlBody?: string | null): string {
  if (textBody && textBody.trim()) return textBody.trim();
  if (htmlBody && htmlBody.trim()) return htmlToText(htmlBody);
  return '';
}

const QUOTED_REPLY_PATTERNS = [
  /^on .+wrote:$/i,
  /^le .+(a ecrit|a \u00e9crit)\s*:?\s*$/i,
  /^-{2,}\s*original message\s*-{2,}$/i,
  /^-{2,}\s*forwarded message\s*-{2,}$/i,
  /^_{5,}\s*$/i,
];

const QUOTED_HEADER_START_PATTERN = /^(from|de)\s*:/i;
const QUOTED_HEADER_DETAIL_PATTERN = /^(from|sent|to|subject|cc|de|envoy(?:e|\u00e9)|a|\u00e0|objet)\s*:/i;

function findQuotedReplyBoundary(lines: string[]): number {
  for (let index = 0; index < lines.length; index++) {
    const trimmed = lines[index].trim();
    if (!trimmed) continue;

    if (QUOTED_REPLY_PATTERNS.some((pattern) => pattern.test(trimmed))) {
      return index;
    }

    if (trimmed.startsWith('>')) {
      return index;
    }

    if (QUOTED_HEADER_START_PATTERN.test(trimmed)) {
      let headerLines = 1;
      for (let lookahead = index + 1; lookahead < Math.min(index + 6, lines.length); lookahead++) {
        const nextLine = lines[lookahead].trim();
        if (!nextLine) continue;
        if (QUOTED_HEADER_DETAIL_PATTERN.test(nextLine)) {
          headerLines++;
        }
      }

      if (headerLines >= 2) {
        return index;
      }
    }
  }

  return -1;
}

export function stripQuotedReplyHistory(input?: string | null): string {
  const normalized = (input || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();

  if (!normalized) return '';

  const lines = normalized.split('\n');
  const boundaryIndex = findQuotedReplyBoundary(lines);
  const visibleLines = boundaryIndex >= 0 ? lines.slice(0, boundaryIndex) : lines;
  const cleaned = visibleLines.join('\n').trim();

  return cleaned || normalized;
}

export function extractReplyText(textBody?: string | null, htmlBody?: string | null): string {
  return stripQuotedReplyHistory(extractPlainText(textBody, htmlBody));
}
