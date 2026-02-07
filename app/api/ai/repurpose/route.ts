import type { DistributionPayload } from '@/lib/pipeline';

export const runtime = 'edge';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

type RepurposeRequest = {
  headlineEs?: string;
  bodyEs?: string;
  link?: string;
};

function fallbackRepurpose(headlineEs: string, bodyEs: string, link: string): DistributionPayload {
  const short = bodyEs.slice(0, 320).trim();
  return {
    twitter: `🚨 ${headlineEs}\n\n${short}\n\nFuente: ${link}`,
    instagram: `${headlineEs}\n\n${short}\n\n#Noticias #UltimaHora #PressLab`,
    linkedin: `${headlineEs}\n\nQué pasó:\n${short}\n\nPor qué importa:\nImpacto en audiencias y agenda editorial.\n\nFuente: ${link}`,
    tiktok: `Última hora: ${headlineEs}. ${short}`,
    newsletter: `Asunto: ${headlineEs}\n\nResumen:\n${short}\n\nMás información: ${link}`
  };
}

function sanitize(text: string): string {
  return text.replace(/\r/g, '').trim();
}

export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null) as RepurposeRequest | null;
  const headlineEs = sanitize(body?.headlineEs || '');
  const bodyEs = sanitize(body?.bodyEs || '');
  const link = sanitize(body?.link || '');
  if (!headlineEs || !bodyEs) {
    return Response.json({ error: 'headlineEs and bodyEs are required' }, { status: 400 });
  }

  const fallback = fallbackRepurpose(headlineEs, bodyEs, link);
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    return Response.json({ ...fallback, source: 'fallback' });
  }

  const system = [
    'Eres editor de distribución para un newsroom.',
    'Convierte un borrador en español a 5 formatos.',
    'Devuelve JSON estricto con keys: twitter, instagram, linkedin, tiktok, newsletter.',
    'No inventes datos y conserva neutralidad informativa.'
  ].join(' ');

  const userPrompt = [
    `Headline: ${headlineEs}`,
    `Body: ${bodyEs}`,
    `Link: ${link || 'n/a'}`,
    'Reglas:',
    '- twitter: thread 3-5 líneas, tono urgente, breve.',
    '- instagram: caption con 6-10 hashtags.',
    '- linkedin: profesional, include "Qué pasó" y "Por qué importa".',
    '- tiktok: caption corto y directo.',
    '- newsletter: subject + summary.'
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
        temperature: 0.3,
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
    const parsed = JSON.parse(raw) as Partial<DistributionPayload>;
    const result: DistributionPayload = {
      twitter: sanitize(parsed.twitter || fallback.twitter),
      instagram: sanitize(parsed.instagram || fallback.instagram),
      linkedin: sanitize(parsed.linkedin || fallback.linkedin),
      tiktok: sanitize(parsed.tiktok || fallback.tiktok),
      newsletter: sanitize(parsed.newsletter || fallback.newsletter)
    };
    return Response.json({ ...result, source: 'llm' });
  } catch {
    return Response.json({ ...fallback, source: 'fallback' });
  }
}
