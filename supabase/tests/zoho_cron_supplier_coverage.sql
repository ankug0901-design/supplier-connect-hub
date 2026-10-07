DO $$
DECLARE
  job record;
BEGIN
  IF has_table_privilege('anon', 'public.sync_cursor', 'SELECT') OR has_table_privilege('authenticated', 'public.sync_cursor', 'UPDATE') THEN
    RAISE EXCEPTION 'Cursor must be service-role-only';
  END IF;
  IF (SELECT count(*) FROM cron.job WHERE jobname IN ('zoho-sync-hourly','zoho-sync-every-2-min')) <> 2 THEN
    RAISE EXCEPTION 'Both existing schedules must be present';
  END IF;
  FOR job IN SELECT * FROM cron.job WHERE jobname IN ('zoho-sync-hourly','zoho-sync-every-2-min') LOOP
    IF job.command LIKE '%generate_series%' OR job.command LIKE '%full_pass%' OR job.command NOT LIKE '%zoho_sync_service_role_key%' THEN
      RAISE EXCEPTION 'Job % must send a single batch with dedicated authorization', job.jobname;
    END IF;
    IF job.jobname = 'zoho-sync-every-2-min' AND job.command NOT LIKE '%"use_cursor":true%' THEN
      RAISE EXCEPTION 'Two-minute sync must advance the persistent cursor';
    END IF;
    IF job.jobname = 'zoho-sync-hourly' AND job.command NOT LIKE '%"offset":0%' THEN
      RAISE EXCEPTION 'Hourly safety net must retain offset zero';
    END IF;
    IF job.schedule <> (CASE WHEN job.jobname = 'zoho-sync-hourly' THEN '0 * * * *' ELSE '*/2 * * * *' END) THEN
      RAISE EXCEPTION 'Keep the existing schedule for %', job.jobname;
    END IF;
  END LOOP;
END;
$$;