import { json, type ActionFunctionArgs } from "@remix-run/node";

// Extract a meta tag value from HTML string
function getMeta(html: string, patterns: RegExp[]): string {
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return "";
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  let url: string;
  try {
    const body = await request.json();
    url = body.url?.trim();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!url) return json({ error: "url is required" }, { status: 400 });

  // Normalize URL
  try {
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    new URL(url); // validate
  } catch {
    return json({ error: "Invalid URL" }, { status: 400 });
  }

  let html = "";
  let finalUrl = url;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; LifeDashboard/1.0; +https://github.com)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    finalUrl = res.url || url;
    // Only read first 100KB — og tags are always in <head>
    const reader = res.body?.getReader();
    if (reader) {
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (total < 100_000) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        chunks.push(value);
        total += value.length;
      }
      reader.cancel();
      html = new TextDecoder().decode(
        chunks.reduce((a, b) => {
          const merged = new Uint8Array(a.length + b.length);
          merged.set(a);
          merged.set(b, a.length);
          return merged;
        }, new Uint8Array(0))
      );
    }
  } catch (err: any) {
    return json({ error: `Fetch failed: ${err.message}` }, { status: 502 });
  }

  const parsedUrl = new URL(finalUrl);
  const origin = parsedUrl.origin;
  const hostname = parsedUrl.hostname.replace(/^www\./, "");

  // ── Title ──
  const title = decodeHtmlEntities(
    getMeta(html, [
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
      /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:title["']/i,
      /<title[^>]*>([^<]+)<\/title>/i,
    ])
  );

  // ── Description ──
  const description = decodeHtmlEntities(
    getMeta(html, [
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i,
      /<meta[^>]+name=["']twitter:description["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:description["']/i,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i,
    ])
  );

  // ── Image ──
  let image = getMeta(html, [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
  ]);
  // Resolve relative image URLs
  if (image && !image.startsWith("http")) {
    try {
      image = new URL(image, origin).href;
    } catch {
      image = "";
    }
  }

  // ── Site name ──
  const siteName = decodeHtmlEntities(
    getMeta(html, [
      /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i,
    ])
  ) || hostname;

  // ── Favicon ──
  let favicon = getMeta(html, [
    /<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*icon[^"']*["']/i,
  ]);
  if (!favicon) {
    favicon = `${origin}/favicon.ico`;
  } else if (!favicon.startsWith("http")) {
    try {
      favicon = new URL(favicon, origin).href;
    } catch {
      favicon = `${origin}/favicon.ico`;
    }
  }

  // ── Keywords / tag suggestions ──
  // Pull from og:keywords, meta keywords, then extract from title+description
  const rawKeywords = getMeta(html, [
    /<meta[^>]+name=["']keywords["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']keywords["']/i,
    /<meta[^>]+property=["']article:tag["'][^>]+content=["']([^"']+)["']/i,
  ]);

  const keywordSet = new Set<string>();

  // From meta keywords (comma-separated)
  if (rawKeywords) {
    rawKeywords.split(/[,，、]/).map((k) => k.trim().toLowerCase()).filter((k) => k.length >= 2 && k.length <= 20).slice(0, 8).forEach((k) => keywordSet.add(k));
  }

  // Extract meaningful words from title + description (Chinese words & English words ≥4 chars)
  const text = `${title} ${description}`;
  // English words ≥ 4 chars, not stopwords
  const stopwords = new Set(["this", "that", "with", "from", "have", "will", "your", "more", "about", "what", "when", "where", "which", "their", "there", "been", "were", "they", "than", "then", "into", "some", "also", "just", "like", "over", "such", "only", "both", "each", "most", "other", "these", "those"]);
  const enWords = text.match(/\b[a-zA-Z]{4,20}\b/g) || [];
  const enFreq: Record<string, number> = {};
  for (const w of enWords) {
    const lw = w.toLowerCase();
    if (!stopwords.has(lw)) enFreq[lw] = (enFreq[lw] || 0) + 1;
  }
  Object.entries(enFreq).sort((a, b) => b[1] - a[1]).slice(0, 5).forEach(([w]) => keywordSet.add(w));

  // Chinese 2-4 char segments from title (simple heuristic)
  const zhWords = title.match(/[一-龥]{2,6}/g) || [];
  zhWords.slice(0, 5).forEach((w) => keywordSet.add(w));

  const suggestedTags = [...keywordSet].slice(0, 10);

  return json({
    url: finalUrl,
    title: title || hostname,
    description: description.slice(0, 300),
    image,
    favicon,
    siteName,
    hostname,
    suggestedTags,
  });
}
