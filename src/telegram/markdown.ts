import { Marked, type RendererObject, type Tokens } from "marked";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

const renderer: RendererObject = {
  heading({ tokens }: Tokens.Heading): string {
    return `\n<b>${this.parser.parseInline(tokens)}</b>\n\n`;
  },

  paragraph({ tokens }: Tokens.Paragraph): string {
    return `${this.parser.parseInline(tokens)}\n\n`;
  },

  blockquote({ tokens }: Tokens.Blockquote): string {
    return `<blockquote>${this.parser.parse(tokens).trimEnd()}</blockquote>\n\n`;
  },

  code({ text, lang }: Tokens.Code): string {
    const escaped = escapeHtml(text);
    if (lang) {
      return `<pre><code class="language-${escapeHtml(lang)}">${escaped}</code></pre>\n\n`;
    }
    return `<pre>${escaped}</pre>\n\n`;
  },

  list(token: Tokens.List): string {
    let result = "";
    for (let i = 0; i < token.items.length; i++) {
      const item = token.items[i];
      const prefix = token.ordered ? `${Number(token.start) + i}. ` : "• ";
      result += `${prefix}${this.parser.parseInline(item.tokens).trimEnd()}\n`;
    }
    return result + "\n";
  },

  listitem(item: Tokens.ListItem): string {
    return `• ${this.parser.parseInline(item.tokens).trimEnd()}\n`;
  },

  checkbox({ checked }: Tokens.Checkbox): string {
    return checked ? "☑ " : "☐ ";
  },

  table(token: Tokens.Table): string {
    const headers = token.header.map((h) => this.parser.parseInline(h.tokens));
    const rows = token.rows.map((row) =>
      row.map((cell) => this.parser.parseInline(cell.tokens)),
    );
    const allRows = [headers, ...rows];
    const colWidths = headers.map((_, colIdx) =>
      Math.max(...allRows.map((row) => stripHtmlTags(row[colIdx] ?? "").length)),
    );

    const formatRow = (row: string[]) =>
      row.map((cell, i) => stripHtmlTags(cell).padEnd(colWidths[i])).join(" | ");

    const headerLine = formatRow(headers);
    const separator = colWidths.map((w) => "-".repeat(w)).join("-+-");
    const bodyLines = rows.map(formatRow);
    const tableText = [headerLine, separator, ...bodyLines].join("\n");
    return `<pre>${escapeHtml(tableText)}</pre>\n\n`;
  },

  tablerow(): string {
    return "";
  },
  tablecell(): string {
    return "";
  },

  hr(): string {
    return "———\n\n";
  },

  html({ text }: Tokens.HTML | Tokens.Tag): string {
    return text;
  },

  def(): string {
    return "";
  },

  space(): string {
    return "";
  },

  strong({ tokens }: Tokens.Strong): string {
    return `<b>${this.parser.parseInline(tokens)}</b>`;
  },

  em({ tokens }: Tokens.Em): string {
    return `<i>${this.parser.parseInline(tokens)}</i>`;
  },

  codespan({ text }: Tokens.Codespan): string {
    return `<code>${escapeHtml(text)}</code>`;
  },

  del({ tokens }: Tokens.Del): string {
    return `<s>${this.parser.parseInline(tokens)}</s>`;
  },

  link({ href, tokens }: Tokens.Link): string {
    return `<a href="${escapeHtml(href)}">${this.parser.parseInline(tokens)}</a>`;
  },

  image({ href, text }: Tokens.Image): string {
    const label = text || "image";
    return `<a href="${escapeHtml(href)}">[${escapeHtml(label)}]</a>`;
  },

  br(): string {
    return "\n";
  },

  text(token: Tokens.Text | Tokens.Escape): string {
    if ("tokens" in token && token.tokens) {
      return this.parser.parseInline(token.tokens);
    }
    return escapeHtml(token.text);
  },
};

const telegramMarked = new Marked({
  renderer,
  gfm: true,
  breaks: false,
});

/**
 * Markdown을 Telegram HTML parse_mode용으로 변환한다.
 * Telegram이 지원하는 태그: b, i, u, s, a, code, pre, blockquote
 */
export function markdownToTelegramHtml(markdown: string): string {
  const html = telegramMarked.parse(markdown) as string;
  return html.replace(/\n{3,}/g, "\n\n").trimEnd();
}
