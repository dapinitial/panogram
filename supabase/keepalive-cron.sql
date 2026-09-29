-- Operational runbook (NOT an auto-applied migration — pg_cron jobs live in the DB,
-- same convention as shotgundetour). Run in the Supabase SQL editor for the PANOGRAM
-- project (ref moepkkdpsimwpshgvwlt). Idempotent: re-running updates the job in place.
--
-- WHY: Supabase pauses a Free project on "too few user queries" per week; a few
-- requests to the database EACH DAY keeps it alive. An in-DB cron that fetches the
-- app's own /embed page every hour makes the server run a real PostgREST query
-- (getTrip) — genuine API traffic, ~24/day, with NO external service and NO key
-- in this file (the page is public). The GitHub Actions keep-warm stays on as an
-- independent monitor: it emails the owner if the project ever goes unhealthy.
--
-- For a CLIENT instance (docs/HANDOFF.md): change the URL to THEIR deployed origin.

-- 0) Extensions (both available on the Free plan; no-ops if already enabled).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 1) Hourly at :23 (off the :00 stampede). Same name = update, not duplicate.
select cron.schedule(
  'panogram-keepalive',
  '23 * * * *',
  $$
    select net.http_get(
      url     := 'https://panogram-fxfju.ondigitalocean.app/embed/pico-de-orizaba',
      headers := '{"user-agent": "panogram-keepalive (pg_cron)"}'::jsonb
    )
  $$
);

-- 2) VERIFY the job exists (expect one row: panogram-keepalive, 23 * * * *, active=t).
select jobid, jobname, schedule, active from cron.job where jobname = 'panogram-keepalive';

-- 3) After ≥1 hour, VERIFY it actually fires and the app answered 200:
--   select start_time, status, return_message from cron.job_run_details
--     where jobid = (select jobid from cron.job where jobname='panogram-keepalive')
--     order by start_time desc limit 5;
--   select created, status_code from net._http_response order by created desc limit 5;

-- Rollback:
--   select cron.unschedule('panogram-keepalive');
