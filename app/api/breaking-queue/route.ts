import { Pool } from 'pg';

export const runtime = 'nodejs';

type BreakingQueueRow = {
  id: number;
  source_kind: string;
  source_ref: string;
  title: string;
  link: string;
  summary: string | null;
  language: string | null;
  country: string | null;
  status: string;
  priority: number;
  created_at: string;
  updated_at: string;
};

let pool: Pool | null = null;
let poolFailed = false;

function getPool(): Pool | null {
  if (pool) return pool;
  if (poolFailed) return null;
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  try {
    pool = new Pool({ connectionString: url });
    return pool;
  } catch {
    poolFailed = true;
    return null;
  }
}

export async function GET(req: Request): Promise<Response> {
  const db = getPool();
  if (!db) {
    return Response.json({ ok: false, storage: 'disabled', items: [] });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get('status') || 'new';
  const limitRaw = Number(url.searchParams.get('limit') || '40');
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 40;

  try {
    const result = await db.query<BreakingQueueRow>(
      `select id, source_kind, source_ref, title, link, summary, language, country, status, priority, created_at, updated_at
       from breaking_queue
       where ($1::text = 'all' or status = $1::text)
       order by priority desc, created_at desc
       limit $2`,
      [status, limit]
    );
    return Response.json({ ok: true, storage: 'postgres', items: result.rows });
  } catch (error) {
    return Response.json(
      { ok: false, storage: 'postgres', error: error instanceof Error ? error.message : String(error), items: [] },
      { status: 500 }
    );
  }
}

export async function POST(req: Request): Promise<Response> {
  const db = getPool();
  if (!db) {
    return Response.json({ ok: false, storage: 'disabled', updated: 0 });
  }

  const body = await req.json().catch(() => null) as { ids?: number[]; status?: string } | null;
  const ids = Array.isArray(body?.ids)
    ? body.ids.filter((value) => Number.isFinite(value) && value > 0)
    : [];
  const status = (body?.status || '').trim();

  if (!ids.length || !status) {
    return Response.json({ ok: false, error: 'ids and status are required', updated: 0 }, { status: 400 });
  }

  try {
    const result = await db.query(
      `update breaking_queue
       set status = $2::text, updated_at = now()
       where id = any($1::bigint[])`,
      [ids, status]
    );
    return Response.json({ ok: true, storage: 'postgres', updated: result.rowCount || 0 });
  } catch (error) {
    return Response.json(
      { ok: false, storage: 'postgres', error: error instanceof Error ? error.message : String(error), updated: 0 },
      { status: 500 }
    );
  }
}

