-- add_external_sync_schedule_to_decks
--
-- How often a linked deck re-syncs with its external deck: every
-- external_sync_interval_hours (1-24), or on external_sync_cron (a UTC
-- five-field cron expression) when that is set. external_sync_attempted_at
-- records the last sync attempt, successful or not, so a failing deck waits
-- for its next scheduled time instead of retrying every minute.

ALTER TABLE "decks" ADD COLUMN "external_sync_interval_hours" INTEGER DEFAULT 1 NOT NULL;
ALTER TABLE "decks" ADD COLUMN "external_sync_cron" TEXT;
ALTER TABLE "decks" ADD COLUMN "external_sync_attempted_at" TEXT;
