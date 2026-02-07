import type { DraftRecord } from '@/lib/pipeline';
import { listDrafts, syncDrafts } from '@/lib/drafts-store';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  try {
    const result = await listDrafts();
    return Response.json({
      ok: true,
      storage: result.storage,
      drafts: result.drafts
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        drafts: []
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null) as { drafts?: DraftRecord[] } | null;
  const drafts = Array.isArray(body?.drafts) ? body?.drafts : [];

  try {
    const result = await syncDrafts(drafts || []);
    return Response.json({
      ok: true,
      storage: result.storage,
      drafts: result.drafts
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
