import { Pool } from 'pg';
import { resolveDatabaseUrl } from '@/lib/database-url';
import {
  buildSocialProfileUrl,
  normalizeSocialHandle,
  type SocialAccountType,
  type SocialPlatform,
  type SocialSnapshotSourceMethod,
  type SocialTrackingStatus,
  type SocialVerificationStatus,
} from '@/lib/sports-social';

type JsonRecord = Record<string, unknown>;

export type PersonSocialAccountUpsert = {
  personId: number;
  platform: SocialPlatform;
  handle: string;
  profileUrl?: string | null;
  platformUserId?: string | null;
  accountType?: SocialAccountType;
  verificationStatus?: SocialVerificationStatus;
  trackingStatus?: SocialTrackingStatus;
  isPrimary?: boolean;
  discoveredVia?: string | null;
  evidenceSourceUrl?: string | null;
  notes?: string | null;
  metadata?: JsonRecord | null;
};

export type PersonSocialAccountSnapshotInsert = {
  socialAccountId: number;
  snapshotAt?: string | Date | null;
  sourceMethod: SocialSnapshotSourceMethod;
  followersCount?: number | null;
  followingCount?: number | null;
  mediaCount?: number | null;
  profilePictureUrl?: string | null;
  rawPayload?: JsonRecord | null;
};

export type PersonSocialMediaPostUpsert = {
  socialAccountId: number;
  platformPostId: string;
  caption?: string | null;
  mediaType?: string | null;
  mediaProductType?: string | null;
  mediaUrl?: string | null;
  permalink?: string | null;
  thumbnailUrl?: string | null;
  likeCount?: number | null;
  commentsCount?: number | null;
  viewCount?: number | null;
  postedAt?: string | Date | null;
  observedAt?: string | Date | null;
  rawPayload?: JsonRecord | null;
  metadata?: JsonRecord | null;
};

export type SocialSyncTargetRow = {
  socialAccountId: number;
  personId: number;
  canonicalName: string;
  teamCanonicalName: string | null;
  handle: string;
  profileUrl: string | null;
  platformUserId: string | null;
  accountType: SocialAccountType;
  verificationStatus: SocialVerificationStatus;
  trackingStatus: SocialTrackingStatus;
};

export type LatestInstagramProfileRow = {
  personId: number;
  socialAccountId: number;
  handle: string;
  profileUrl: string | null;
  platformUserId: string | null;
  accountType: SocialAccountType;
  verificationStatus: SocialVerificationStatus;
  trackingStatus: SocialTrackingStatus;
  snapshotAt: string | null;
  followersCount: number | null;
  followingCount: number | null;
  mediaCount: number | null;
  profilePictureUrl: string | null;
};

let pool: Pool | null = null;

async function ensureNewsDatabaseSchemaCompat(): Promise<void> {
  try {
    const module = await import('@/lib/ingestion-store');
    const ensure = (module as { ensureNewsDatabaseSchema?: () => Promise<void> }).ensureNewsDatabaseSchema;
    if (typeof ensure === 'function') {
      await ensure();
    }
  } catch {
    // Older branches do not export this helper.
  }
}

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: resolveDatabaseUrl(),
      max: 4,
    });
  }
  return pool;
}

export async function closeSportsSocialStorePool(): Promise<void> {
  const current = pool;
  pool = null;
  if (current) await current.end();
}

function toJson(value: JsonRecord | null | undefined): string {
  return JSON.stringify(value || {});
}

export async function upsertPersonSocialAccounts(
  rows: PersonSocialAccountUpsert[]
): Promise<Array<{ id: number; normalizedHandle: string }>> {
  if (rows.length === 0) return [];
  await ensureNewsDatabaseSchemaCompat();
  const db = getPool();
  const results: Array<{ id: number; normalizedHandle: string }> = [];

  for (const row of rows) {
    const normalizedHandle = normalizeSocialHandle(row.platform, row.handle);
    if (!normalizedHandle) continue;
    const profileUrl = row.profileUrl || buildSocialProfileUrl(row.platform, normalizedHandle);
    const result = await db.query<{ id: string }>(
      `
        insert into sports.person_social_accounts (
          person_id,
          platform,
          handle,
          normalized_handle,
          profile_url,
          platform_user_id,
          account_type,
          verification_status,
          tracking_status,
          is_primary,
          discovered_via,
          evidence_source_url,
          notes,
          metadata
        )
        values (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb
        )
        on conflict (platform, normalized_handle)
        do update set
          person_id = excluded.person_id,
          handle = excluded.handle,
          profile_url = coalesce(excluded.profile_url, sports.person_social_accounts.profile_url),
          platform_user_id = coalesce(excluded.platform_user_id, sports.person_social_accounts.platform_user_id),
          account_type = excluded.account_type,
          verification_status = excluded.verification_status,
          tracking_status = excluded.tracking_status,
          is_primary = excluded.is_primary,
          discovered_via = coalesce(excluded.discovered_via, sports.person_social_accounts.discovered_via),
          evidence_source_url = coalesce(excluded.evidence_source_url, sports.person_social_accounts.evidence_source_url),
          notes = coalesce(excluded.notes, sports.person_social_accounts.notes),
          metadata = sports.person_social_accounts.metadata || excluded.metadata,
          updated_at = now()
        returning id
      `,
      [
        row.personId,
        row.platform,
        row.handle.trim(),
        normalizedHandle,
        profileUrl,
        row.platformUserId || null,
        row.accountType || 'unknown',
        row.verificationStatus || 'unverified',
        row.trackingStatus || 'manual_only',
        row.isPrimary ?? true,
        row.discoveredVia || null,
        row.evidenceSourceUrl || null,
        row.notes || null,
        toJson(row.metadata),
      ]
    );
    if (!result.rows[0]?.id) continue;
    results.push({ id: Number(result.rows[0].id), normalizedHandle });
  }

  return results;
}

export async function insertPersonSocialAccountSnapshot(
  row: PersonSocialAccountSnapshotInsert
): Promise<number | null> {
  await ensureNewsDatabaseSchemaCompat();
  const db = getPool();
  const result = await db.query<{ id: string }>(
    `
      insert into sports.person_social_account_snapshots (
        social_account_id,
        snapshot_at,
        source_method,
        followers_count,
        following_count,
        media_count,
        profile_picture_url,
        raw_payload
      )
      values ($1, coalesce($2::timestamptz, now()), $3, $4, $5, $6, $7, $8::jsonb)
      returning id
    `,
    [
      row.socialAccountId,
      row.snapshotAt ? new Date(row.snapshotAt).toISOString() : null,
      row.sourceMethod,
      row.followersCount ?? null,
      row.followingCount ?? null,
      row.mediaCount ?? null,
      row.profilePictureUrl || null,
      toJson(row.rawPayload),
    ]
  );
  return result.rows[0]?.id ? Number(result.rows[0].id) : null;
}

export async function upsertPersonSocialMediaPosts(
  rows: PersonSocialMediaPostUpsert[]
): Promise<number> {
  if (rows.length === 0) return 0;
  await ensureNewsDatabaseSchemaCompat();
  const db = getPool();
  let written = 0;

  for (const row of rows) {
    if (!row.platformPostId.trim()) continue;
    await db.query(
      `
        insert into sports.person_social_media_posts (
          social_account_id,
          platform_post_id,
          caption,
          media_type,
          media_product_type,
          media_url,
          permalink,
          thumbnail_url,
          like_count,
          comments_count,
          view_count,
          posted_at,
          observed_at,
          raw_payload,
          metadata
        )
        values (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
          $12::timestamptz,
          coalesce($13::timestamptz, now()),
          $14::jsonb,
          $15::jsonb
        )
        on conflict (social_account_id, platform_post_id)
        do update set
          caption = excluded.caption,
          media_type = excluded.media_type,
          media_product_type = excluded.media_product_type,
          media_url = coalesce(excluded.media_url, sports.person_social_media_posts.media_url),
          permalink = coalesce(excluded.permalink, sports.person_social_media_posts.permalink),
          thumbnail_url = coalesce(excluded.thumbnail_url, sports.person_social_media_posts.thumbnail_url),
          like_count = excluded.like_count,
          comments_count = excluded.comments_count,
          view_count = excluded.view_count,
          posted_at = coalesce(excluded.posted_at, sports.person_social_media_posts.posted_at),
          observed_at = excluded.observed_at,
          raw_payload = excluded.raw_payload,
          metadata = sports.person_social_media_posts.metadata || excluded.metadata,
          updated_at = now()
      `,
      [
        row.socialAccountId,
        row.platformPostId.trim(),
        row.caption || null,
        row.mediaType || null,
        row.mediaProductType || null,
        row.mediaUrl || null,
        row.permalink || null,
        row.thumbnailUrl || null,
        row.likeCount ?? null,
        row.commentsCount ?? null,
        row.viewCount ?? null,
        row.postedAt ? new Date(row.postedAt).toISOString() : null,
        row.observedAt ? new Date(row.observedAt).toISOString() : null,
        toJson(row.rawPayload),
        toJson(row.metadata),
      ]
    );
    written += 1;
  }

  return written;
}

export async function updatePersonSocialAccountObservedIdentity(
  socialAccountId: number,
  fields: {
    platformUserId?: string | null;
    profileUrl?: string | null;
    metadata?: JsonRecord | null;
  }
): Promise<void> {
  await ensureNewsDatabaseSchemaCompat();
  const db = getPool();
  await db.query(
    `
      update sports.person_social_accounts
      set
        platform_user_id = coalesce($2, platform_user_id),
        profile_url = coalesce($3, profile_url),
        metadata = metadata || $4::jsonb,
        updated_at = now()
      where id = $1
    `,
    [
      socialAccountId,
      fields.platformUserId || null,
      fields.profileUrl || null,
      toJson(fields.metadata),
    ]
  );
}

export async function readInstagramSocialSyncTargets(options?: {
  teamNames?: string[];
  limit?: number | null;
}): Promise<SocialSyncTargetRow[]> {
  await ensureNewsDatabaseSchemaCompat();
  const db = getPool();
  const teamNames = (options?.teamNames || []).map((value) => value.trim()).filter(Boolean);
  const result = await db.query<{
    social_account_id: string;
    person_id: string;
    canonical_name: string;
    team_canonical_name: string | null;
    handle: string;
    profile_url: string | null;
    platform_user_id: string | null;
    account_type: SocialAccountType;
    verification_status: SocialVerificationStatus;
    tracking_status: SocialTrackingStatus;
  }>(
    `
      with roster as (
        select
          psa.id as social_account_id,
          sp.id as person_id,
          sp.canonical_name,
          psa.handle,
          psa.profile_url,
          psa.platform_user_id,
          psa.account_type,
          psa.verification_status,
          psa.tracking_status,
          (
            select so.canonical_name
            from sports.person_organization_roles por
            join sports.organizations so
              on so.id = por.organization_id
            where por.person_id = sp.id
              and por.is_current = true
              and por.role_type = 'player'
              and (
                cardinality($1::text[]) = 0
                or so.canonical_name = any($1::text[])
              )
            order by coalesce(por.valid_to, date '9999-12-31') desc, por.id desc
            limit 1
          ) as team_canonical_name
        from sports.person_social_accounts psa
        join sports.persons sp
          on sp.id = psa.person_id
        where psa.platform = 'instagram'
          and psa.tracking_status = 'trackable_via_api'
          and psa.account_type in ('business', 'creator')
      )
      select *
      from roster
      where team_canonical_name is not null or cardinality($1::text[]) = 0
      order by team_canonical_name nulls last, canonical_name
      limit coalesce($2::integer, 1000000)
    `,
    [teamNames, options?.limit ?? null]
  );

  return result.rows.map((row) => ({
    socialAccountId: Number(row.social_account_id),
    personId: Number(row.person_id),
    canonicalName: row.canonical_name,
    teamCanonicalName: row.team_canonical_name,
    handle: row.handle,
    profileUrl: row.profile_url,
    platformUserId: row.platform_user_id,
    accountType: row.account_type,
    verificationStatus: row.verification_status,
    trackingStatus: row.tracking_status,
  }));
}

export async function readLatestInstagramProfilesByPersonIds(
  personIds: number[]
): Promise<LatestInstagramProfileRow[]> {
  const normalizedIds = [...new Set(personIds.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0))];
  if (normalizedIds.length === 0) return [];

  await ensureNewsDatabaseSchemaCompat();
  const db = getPool();
  const result = await db.query<{
    person_id: string;
    social_account_id: string;
    handle: string;
    profile_url: string | null;
    platform_user_id: string | null;
    account_type: SocialAccountType;
    verification_status: SocialVerificationStatus;
    tracking_status: SocialTrackingStatus;
    snapshot_at: string | null;
    followers_count: string | null;
    following_count: string | null;
    media_count: string | null;
    profile_picture_url: string | null;
  }>(
    `
      select distinct on (psa.person_id)
        psa.person_id::text,
        psa.id::text as social_account_id,
        psa.handle,
        psa.profile_url,
        psa.platform_user_id,
        psa.account_type,
        psa.verification_status,
        psa.tracking_status,
        latest.snapshot_at::text,
        latest.followers_count::text,
        latest.following_count::text,
        latest.media_count::text,
        latest.profile_picture_url
      from sports.person_social_accounts psa
      left join lateral (
        select
          snapshot_at,
          followers_count,
          following_count,
          media_count,
          profile_picture_url,
          id
        from sports.person_social_account_snapshots
        where social_account_id = psa.id
        order by snapshot_at desc nulls last, id desc
        limit 1
      ) latest on true
      where psa.platform = 'instagram'
        and psa.person_id = any($1::bigint[])
      order by
        psa.person_id,
        psa.is_primary desc,
        latest.snapshot_at desc nulls last,
        psa.id desc
    `,
    [normalizedIds]
  );

  return result.rows.map((row) => ({
    personId: Number(row.person_id),
    socialAccountId: Number(row.social_account_id),
    handle: row.handle,
    profileUrl: row.profile_url || buildSocialProfileUrl('instagram', row.handle),
    platformUserId: row.platform_user_id,
    accountType: row.account_type,
    verificationStatus: row.verification_status,
    trackingStatus: row.tracking_status,
    snapshotAt: row.snapshot_at,
    followersCount: row.followers_count == null ? null : Number(row.followers_count),
    followingCount: row.following_count == null ? null : Number(row.following_count),
    mediaCount: row.media_count == null ? null : Number(row.media_count),
    profilePictureUrl: row.profile_picture_url,
  }));
}
