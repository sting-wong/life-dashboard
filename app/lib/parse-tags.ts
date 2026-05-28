/**
 * Parse #inline-tags from content (HTML or plain text).
 * Matches # followed by Chinese characters, letters, numbers, dashes, underscores.
 * Returns deduplicated array of tag names (without # prefix).
 */
export function parseInlineTags(content: string): string[] {
  // Match #tag patterns - supports Chinese, English, numbers, dashes, underscores
  const regex = /#([一-鿿\w가-힯\-]+)/g;
  const tags = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const tagName = match[1].trim().toLowerCase();
    // Filter out too-short or too-long tags, and purely numeric ones
    if (tagName.length >= 2 && tagName.length <= 50 && !/^\d+$/.test(tagName)) {
      tags.add(tagName);
    }
  }

  return Array.from(tags);
}
