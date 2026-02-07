import type { DraftRecord } from '@/lib/pipeline';

export const runtime = 'edge';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

type DraftRequest = {
  title?: string;
  source?: string;
  link?: string;
  publishedAt?: string;
};

type DraftResponse = {
  headlineEs: string;
  bodyEs: string;
};

function fallbackDraft(payload: Required<Omit<DraftRequest, 'publishedAt'>> & { publishedAt: string }): DraftResponse {
  const dateLabel = payload.publishedAt ? new Date(payload.publishedAt).toISOString() : new Date().toISOString();
  return {
    headlineEs: payload.title,
    bodyEs: [
      `${payload.source} reportó una noticia de última hora.`,
      '',
      `Titular original: ${payload.title}`,
      `Fuente: ${payload.source}`,
      `Publicado: ${dateLabel}`,
      `Enlace: ${payload.link}`,
      '',
      'Borrador inicial en español. Verificar hechos y contexto antes de publicar.'
    ].join('\n')
  };
}

function sanitize(text: string): string {
  return text.replace(/\r/g, '').trim();
}

export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null) as DraftRequest | null;
  const title = sanitize(body?.title || '');
  const source = sanitize(body?.source || '');
  const link = sanitize(body?.link || '');
  const publishedAt = sanitize(body?.publishedAt || '');

  if (!title || !source || !link) {
    return Response.json({ error: 'title, source, link are required' }, { status: 400 });
  }

  const fallback = fallbackDraft({ title, source, link, publishedAt });
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    return Response.json({ ...fallback, source: 'fallback' });
  }

  const system = [
    'Eres redactor de una agencia de noticias latinoamericana.',
    'Escribe en español neutro, estilo informativo, sin especulación.',
    'Devuelve JSON estricto con keys: headlineEs, bodyEs.',
    'El body debe ser un borrador breve de 2-4 párrafos.'
  ].join(' ');

  const userPrompt = [
    `Title: ${title}`,
    `Source: ${source}`,
    `PublishedAt: ${publishedAt || 'unknown'}`,
    `Link: ${link}`,
    'Crea un borrador periodístico en español usando solo los datos disponibles.',
    'Si faltan datos, dilo explícitamente y no inventes.'
  ].join('\n');

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userPrompt }
        ]
      })
    });
    if (!response.ok) {
      return Response.json({ ...fallback, source: 'fallback' });
    }
    const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const raw = json.choices?.[0]?.message?.content || '';
    const parsed = JSON.parse(raw) as Partial<DraftResponse>;
    const headlineEs = sanitize(parsed.headlineEs || fallback.headlineEs);
    const bodyEs = sanitize(parsed.bodyEs || fallback.bodyEs);
    return Response.json({ headlineEs, bodyEs, source: 'llm' });
  } catch {
    return Response.json({ ...fallback, source: 'fallback' });
  }
}
