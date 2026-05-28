/**
 * Parse [[wiki links]] from content (HTML or plain text).
 * Returns deduplicated array of link titles.
 */
export function parseWikiLinks(content: string): string[] {
  const regex = /\[\[([^\[\]]+)\]\]/g;
  const links = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const title = match[1].trim();
    if (title) links.add(title);
  }

  return Array.from(links);
}

/**
 * Convert [[wiki links]] in HTML to clickable links.
 * This is for rendering — replaces [[title]] with <a> tags.
 */
export function renderWikiLinks(html: string): string {
  return html.replace(
    /\[\[([^\[\]]+)\]\]/g,
    (_match, title: string) => {
      // We encode the title as a data attribute for later resolution
      return `<a href="#" class="wiki-link text-primary-600 underline cursor-pointer hover:text-primary-700" data-wiki-title="${title.trim()}">${title.trim()}</a>`;
    }
  );
}
