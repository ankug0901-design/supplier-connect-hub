DO $$
DECLARE
  offsets integer[];
  covered integer;
  job record;
BEGIN
  SELECT array_agg(supplier_offset) INTO offsets
  FROM generate_series(0, 25 - 1, 4) AS pages(supplier_offset);
  IF offsets IS DISTINCT FROM ARRAY[0,4,8,12,16,20,24] THEN
    RAISE EXCEPTION 'All 25 suppliers require seven distinct pages';
  END IF;
  SELECT count(DISTINCT supplier_index) INTO covered
  FROM unnest(offsets) AS pages(supplier_offset)
  CROSS JOIN LATERAL generate_series(supplier_offset, least(supplier_offset + 3,24)) AS members(supplier_index);
  IF covered <> 25 THEN
    RAISE EXCEPTION 'Pages must cover every supplier exactly once';
  END IF;
  IF EXISTS (SELECT 1 FROM generate_series(0, -1, 4)) THEN
    RAISE EXCEPTION 'Empty supplier lists must enqueue no pages';
  END IF;
  IF (SELECT count(*) FROM cron.job WHERE jobname IN ('zoho-sync-hourly','zoho-sync-every-2-min')) <> 2 THEN
    RAISE EXCEPTION 'Both existing schedules must be present';
  END IF;
  FOR job IN SELECT * FROM cron.job WHERE jobname IN ('zoho-sync-hourly','zoho-sync-every-2-min') LOOP
    IF job.command NOT LIKE '%generate_series%' OR job.command NOT LIKE '%zoho_vendor_id IS NOT NULL AND zoho_vendor_id <> ''''%' OR job.command NOT LIKE '%''offset'', supplier_offset, ''batch_size'', 4%' THEN
      RAISE EXCEPTION 'Job % must page every eligible supplier', job.jobname;
    END IF;
    IF job.schedule <> CASE WHEN job.jobname = 'zoho-sync-hourly' THEN '0 * * * *' ELSE '*/2 * * * *' END THEN
      RAISE EXCEPTION 'Keep the existing schedule for %', job.jobname;
    END IF;
  END LOOP;
END;
$$;