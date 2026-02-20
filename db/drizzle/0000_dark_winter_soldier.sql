-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE "rss_health_status" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	"runner" text DEFAULT 'api_news' NOT NULL,
	"outlet_id" text NOT NULL,
	"source" text NOT NULL,
	"method" text NOT NULL,
	"attempted" boolean DEFAULT false NOT NULL,
	"circuit_open" boolean DEFAULT false NOT NULL,
	"ok" boolean DEFAULT false NOT NULL,
	"status_code" integer,
	"parsed_count" integer DEFAULT 0 NOT NULL,
	"parsed_limit" integer,
	"sample_capped" boolean DEFAULT false NOT NULL,
	"recent24h" integer DEFAULT 0 NOT NULL,
	"error" text,
	"country" text DEFAULT 'Global' NOT NULL,
	"fetched_count" integer DEFAULT 0 NOT NULL,
	"missing_title_count" integer DEFAULT 0 NOT NULL,
	"missing_summary_count" integer DEFAULT 0 NOT NULL,
	"missing_published_at_count" integer DEFAULT 0 NOT NULL,
	"missing_link_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_articles" (
	"external_id" text PRIMARY KEY NOT NULL,
	"publication_datetime" timestamp with time zone NOT NULL,
	"title_original" text NOT NULL,
	"summary_original" text,
	"country" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"url" text NOT NULL,
	"source" text NOT NULL,
	"language" text,
	"section" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingest_feed_watermarks" (
	"outlet_id" text NOT NULL,
	"source" text NOT NULL,
	"country" text DEFAULT 'Global' NOT NULL,
	"method" text NOT NULL,
	"last_publication_at" timestamp with time zone,
	"last_fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingest_feed_watermarks_pkey" PRIMARY KEY("outlet_id","method")
);
--> statement-breakpoint
CREATE TABLE "ingest_ops_hourly" (
	"hour_bucket" timestamp with time zone NOT NULL,
	"runner" text DEFAULT 'worker' NOT NULL,
	"outlet_id" text NOT NULL,
	"source" text NOT NULL,
	"country" text DEFAULT 'Global' NOT NULL,
	"method" text NOT NULL,
	"attempted_runs" integer DEFAULT 0 NOT NULL,
	"successful_runs" integer DEFAULT 0 NOT NULL,
	"failed_runs" integer DEFAULT 0 NOT NULL,
	"fetched_count" integer DEFAULT 0 NOT NULL,
	"valid_count" integer DEFAULT 0 NOT NULL,
	"missing_title_count" integer DEFAULT 0 NOT NULL,
	"missing_summary_count" integer DEFAULT 0 NOT NULL,
	"missing_published_at_count" integer DEFAULT 0 NOT NULL,
	"missing_link_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingest_ops_hourly_pkey" PRIMARY KEY("hour_bucket","runner","outlet_id","method")
);
--> statement-breakpoint
CREATE TABLE "ingest_ops_daily" (
	"day_bucket" date NOT NULL,
	"runner" text DEFAULT 'worker' NOT NULL,
	"outlet_id" text NOT NULL,
	"source" text NOT NULL,
	"country" text DEFAULT 'Global' NOT NULL,
	"method" text NOT NULL,
	"attempted_runs" integer DEFAULT 0 NOT NULL,
	"successful_runs" integer DEFAULT 0 NOT NULL,
	"failed_runs" integer DEFAULT 0 NOT NULL,
	"fetched_count" integer DEFAULT 0 NOT NULL,
	"valid_count" integer DEFAULT 0 NOT NULL,
	"missing_title_count" integer DEFAULT 0 NOT NULL,
	"missing_summary_count" integer DEFAULT 0 NOT NULL,
	"missing_published_at_count" integer DEFAULT 0 NOT NULL,
	"missing_link_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingest_ops_daily_pkey" PRIMARY KEY("day_bucket","runner","outlet_id","method")
);
--> statement-breakpoint
CREATE INDEX "idx_rss_health_status_country" ON "rss_health_status" USING btree ("country" text_ops);--> statement-breakpoint
CREATE INDEX "idx_rss_health_status_outlet_id" ON "rss_health_status" USING btree ("outlet_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_rss_health_status_ran_at" ON "rss_health_status" USING btree ("ran_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_rss_health_status_runner_ran_at" ON "rss_health_status" USING btree ("runner" text_ops,"ran_at" text_ops);--> statement-breakpoint
CREATE INDEX "idx_rss_health_status_source" ON "rss_health_status" USING btree ("source" text_ops);--> statement-breakpoint
CREATE INDEX "idx_news_articles_country" ON "news_articles" USING btree ("country" text_ops);--> statement-breakpoint
CREATE INDEX "idx_news_articles_created_at" ON "news_articles" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_news_articles_section" ON "news_articles" USING btree ("section" text_ops);--> statement-breakpoint
CREATE INDEX "idx_news_articles_source" ON "news_articles" USING btree ("source" text_ops);--> statement-breakpoint
CREATE INDEX "idx_news_articles_updated_at" ON "news_articles" USING btree ("updated_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_news_articles_url" ON "news_articles" USING btree ("url" text_ops);--> statement-breakpoint
CREATE INDEX "idx_ingest_feed_watermarks_country" ON "ingest_feed_watermarks" USING btree ("country" text_ops);--> statement-breakpoint
CREATE INDEX "idx_ingest_feed_watermarks_source" ON "ingest_feed_watermarks" USING btree ("source" text_ops);--> statement-breakpoint
CREATE INDEX "idx_ingest_ops_hourly_country" ON "ingest_ops_hourly" USING btree ("country" text_ops);--> statement-breakpoint
CREATE INDEX "idx_ingest_ops_hourly_hour" ON "ingest_ops_hourly" USING btree ("hour_bucket" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_ingest_ops_hourly_source" ON "ingest_ops_hourly" USING btree ("source" text_ops);--> statement-breakpoint
CREATE INDEX "idx_ingest_ops_daily_country" ON "ingest_ops_daily" USING btree ("country" text_ops);--> statement-breakpoint
CREATE INDEX "idx_ingest_ops_daily_day" ON "ingest_ops_daily" USING btree ("day_bucket" date_ops);--> statement-breakpoint
CREATE INDEX "idx_ingest_ops_daily_source" ON "ingest_ops_daily" USING btree ("source" text_ops);
*/