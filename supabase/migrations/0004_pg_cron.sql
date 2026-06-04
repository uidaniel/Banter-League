-- OPTIONAL — only if you are NOT using Vercel Cron to drive the engine.
-- Schedules the engine tick from inside Postgres using pg_cron + pg_net.
-- Replace the placeholders, then run in the Supabase SQL Editor.

-- 1. Enable the extensions (Supabase ships both).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Every 15 minutes, POST to the cron route with the shared secret.
--    Replace YOUR_APP_URL and YOUR_CRON_SECRET.
select cron.schedule(
  'banter-league-tick',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://YOUR_APP_URL/api/cron/tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_CRON_SECRET'
    )
  );
  $$
);

-- To remove later:  select cron.unschedule('banter-league-tick');
