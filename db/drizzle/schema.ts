import { pgTable, index, bigserial, timestamp, text, boolean, integer, primaryKey, date } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const rssHealthStatus = pgTable("rss_health_status", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	ranAt: timestamp("ran_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	runner: text().default('api_news').notNull(),
	outletId: text("outlet_id").notNull(),
	source: text().notNull(),
	method: text().notNull(),
	attempted: boolean().default(false).notNull(),
	circuitOpen: boolean("circuit_open").default(false).notNull(),
	ok: boolean().default(false).notNull(),
	statusCode: integer("status_code"),
	parsedCount: integer("parsed_count").default(0).notNull(),
	parsedLimit: integer("parsed_limit"),
	sampleCapped: boolean("sample_capped").default(false).notNull(),
	recent24H: integer().default(0).notNull(),
	error: text(),
	country: text().default('Global').notNull(),
	fetchedCount: integer("fetched_count").default(0).notNull(),
	missingTitleCount: integer("missing_title_count").default(0).notNull(),
	missingSummaryCount: integer("missing_summary_count").default(0).notNull(),
	missingPublishedAtCount: integer("missing_published_at_count").default(0).notNull(),
	missingLinkCount: integer("missing_link_count").default(0).notNull(),
}, (table) => [
	index("idx_rss_health_status_country").using("btree", table.country.asc().nullsLast().op("text_ops")),
	index("idx_rss_health_status_outlet_id").using("btree", table.outletId.asc().nullsLast().op("text_ops")),
	index("idx_rss_health_status_ran_at").using("btree", table.ranAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_rss_health_status_runner_ran_at").using("btree", table.runner.asc().nullsLast().op("text_ops"), table.ranAt.desc().nullsFirst().op("text_ops")),
	index("idx_rss_health_status_source").using("btree", table.source.asc().nullsLast().op("text_ops")),
]);

export const newsArticles = pgTable("news_articles", {
	externalId: text("external_id").primaryKey().notNull(),
	publicationDatetime: timestamp("publication_datetime", { withTimezone: true, mode: 'string' }).notNull(),
	titleOriginal: text("title_original").notNull(),
	snippetOriginal: text("snippet_original"),
	country: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	url: text().notNull(),
	source: text().notNull(),
	language: text(),
	section: text(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_news_articles_country").using("btree", table.country.asc().nullsLast().op("text_ops")),
	index("idx_news_articles_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_news_articles_section").using("btree", table.section.asc().nullsLast().op("text_ops")),
	index("idx_news_articles_source").using("btree", table.source.asc().nullsLast().op("text_ops")),
	index("idx_news_articles_updated_at").using("btree", table.updatedAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_news_articles_url").using("btree", table.url.asc().nullsLast().op("text_ops")),
]);

export const ingestFeedWatermarks = pgTable("ingest_feed_watermarks", {
	outletId: text("outlet_id").notNull(),
	source: text().notNull(),
	country: text().default('Global').notNull(),
	method: text().notNull(),
	lastPublicationAt: timestamp("last_publication_at", { withTimezone: true, mode: 'string' }),
	lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_ingest_feed_watermarks_country").using("btree", table.country.asc().nullsLast().op("text_ops")),
	index("idx_ingest_feed_watermarks_source").using("btree", table.source.asc().nullsLast().op("text_ops")),
	primaryKey({ columns: [table.outletId, table.method], name: "ingest_feed_watermarks_pkey"}),
]);

export const ingestOpsHourly = pgTable("ingest_ops_hourly", {
	hourBucket: timestamp("hour_bucket", { withTimezone: true, mode: 'string' }).notNull(),
	runner: text().default('worker').notNull(),
	outletId: text("outlet_id").notNull(),
	source: text().notNull(),
	country: text().default('Global').notNull(),
	method: text().notNull(),
	attemptedRuns: integer("attempted_runs").default(0).notNull(),
	successfulRuns: integer("successful_runs").default(0).notNull(),
	failedRuns: integer("failed_runs").default(0).notNull(),
	fetchedCount: integer("fetched_count").default(0).notNull(),
	validCount: integer("valid_count").default(0).notNull(),
	missingTitleCount: integer("missing_title_count").default(0).notNull(),
	missingSummaryCount: integer("missing_summary_count").default(0).notNull(),
	missingPublishedAtCount: integer("missing_published_at_count").default(0).notNull(),
	missingLinkCount: integer("missing_link_count").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_ingest_ops_hourly_country").using("btree", table.country.asc().nullsLast().op("text_ops")),
	index("idx_ingest_ops_hourly_hour").using("btree", table.hourBucket.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_ingest_ops_hourly_source").using("btree", table.source.asc().nullsLast().op("text_ops")),
	primaryKey({ columns: [table.hourBucket, table.runner, table.outletId, table.method], name: "ingest_ops_hourly_pkey"}),
]);

export const ingestOpsDaily = pgTable("ingest_ops_daily", {
	dayBucket: date("day_bucket").notNull(),
	runner: text().default('worker').notNull(),
	outletId: text("outlet_id").notNull(),
	source: text().notNull(),
	country: text().default('Global').notNull(),
	method: text().notNull(),
	attemptedRuns: integer("attempted_runs").default(0).notNull(),
	successfulRuns: integer("successful_runs").default(0).notNull(),
	failedRuns: integer("failed_runs").default(0).notNull(),
	fetchedCount: integer("fetched_count").default(0).notNull(),
	validCount: integer("valid_count").default(0).notNull(),
	missingTitleCount: integer("missing_title_count").default(0).notNull(),
	missingSummaryCount: integer("missing_summary_count").default(0).notNull(),
	missingPublishedAtCount: integer("missing_published_at_count").default(0).notNull(),
	missingLinkCount: integer("missing_link_count").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_ingest_ops_daily_country").using("btree", table.country.asc().nullsLast().op("text_ops")),
	index("idx_ingest_ops_daily_day").using("btree", table.dayBucket.desc().nullsFirst().op("date_ops")),
	index("idx_ingest_ops_daily_source").using("btree", table.source.asc().nullsLast().op("text_ops")),
	primaryKey({ columns: [table.dayBucket, table.runner, table.outletId, table.method], name: "ingest_ops_daily_pkey"}),
]);
