export interface ParsedFeedItem {
  title: string;
  link: string;
  publishedAt: string;
}

function clean(text: string): string {
  return text.replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1').trim();
}

function parseTag(body: string, tag: string): string {
  const match = body.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? clean(match[1] || '') : '';
}

export function parseRssOrAtom(xml: string, limit = 10): ParsedFeedItem[] {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => match[1]);
  if (items.length > 0) {
    return items.slice(0, limit).map((body) => ({
      title: parseTag(body, 'title'),
      link: parseTag(body, 'link'),
      publishedAt: parseTag(body, 'pubDate') || new Date().toISOString()
    })).filter((item) => item.title && item.link);
  }

  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)].map((match) => match[1]);
  return entries.slice(0, limit).map((body) => {
    const linkHref = body.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] || '';
    return {
      title: parseTag(body, 'title'),
      link: linkHref,
      publishedAt: parseTag(body, 'published') || parseTag(body, 'updated') || new Date().toISOString()
    };
  }).filter((item) => item.title && item.link);
}

export function parseSitemap(xml: string, limit = 12): ParsedFeedItem[] {
  const urls = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)].map((match) => match[1]);
  return urls.slice(0, limit).map((body) => {
    const link = parseTag(body, 'loc');
    const title = link.split('/').pop()?.replace(/[-_]/g, ' ') || link;
    const publishedAt = parseTag(body, 'lastmod') || new Date().toISOString();
    return { title, link, publishedAt };
  }).filter((item) => item.link);
}
