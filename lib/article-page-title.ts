import { decodeHtmlEntities, normalizeHtmlText } from '@/lib/html-entities';

function readMetaContent(html: string, key: string, attribute: 'property' | 'name'): string {
  const pattern = new RegExp(
    `<meta[^>]+${attribute}=["']${key}["'][^>]+content=["']([^"']+)["']`,
    'i'
  );
  return pattern.exec(html)?.[1] || '';
}

export function extractArticlePageTitle(html: string): string {
  const ogTitle = readMetaContent(html, 'og:title', 'property');
  if (ogTitle) return normalizeHtmlText(decodeHtmlEntities(ogTitle));

  const metaTitle = readMetaContent(html, 'title', 'name');
  if (metaTitle) return normalizeHtmlText(decodeHtmlEntities(metaTitle));

  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';
  return title ? normalizeHtmlText(decodeHtmlEntities(title)) : '';
}
