-- Remove rows with NULL so_number (legacy invoice-level rows are unusable under SO contract)
DELETE FROM public.three_way_matches WHERE so_number IS NULL;

-- Dedupe by so_number, keeping latest
DELETE FROM public.three_way_matches a
USING public.three_way_matches b
WHERE a.so_number = b.so_number
  AND a.updated_at < b.updated_at;

-- Drop the partial unique index that ON CONFLICT cannot infer
DROP INDEX IF EXISTS public.three_way_matches_so_number_key;

-- Add a proper UNIQUE constraint on so_number
ALTER TABLE public.three_way_matches
  ALTER COLUMN so_number SET NOT NULL,
  ADD CONSTRAINT three_way_matches_so_number_key UNIQUE (so_number);