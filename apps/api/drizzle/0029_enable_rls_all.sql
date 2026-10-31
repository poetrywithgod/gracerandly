-- Turn on row level security for every table in the public schema.
-- Earlier migrations left 11 tables (requesters, runners, errands, escrow_transactions,
-- runner_payouts, sos_alerts, chat_messages, ...) without it. The API connects as the
-- database owner, so it is unaffected; RLS with no policies only blocks the public
-- Supabase REST/anon route, which is what we want. Safe to run again.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
