
-- Schedule zoho-sync to run every 15 minutes to keep PO/invoice/payment statuses fresh
DO $$
DECLARE
  job_id int;
BEGIN
  SELECT jobid INTO job_id FROM cron.job WHERE jobname = 'zoho-sync-every-15-min';
  IF job_id IS NOT NULL THEN
    PERFORM cron.unschedule(job_id);
  END IF;
END $$;

SELECT cron.schedule(
  'zoho-sync-every-15-min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://agrhkarauqxkgyvfthvc.supabase.co/functions/v1/zoho-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFncmhrYXJhdXF4a2d5dmZ0aHZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4NDA0NjgsImV4cCI6MjA4MjQxNjQ2OH0.pF-FPAuOTq4cSKGZ9PTDXSxAORr7CvTfxJMr4s-hKEc'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
