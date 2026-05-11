# Supabase Dump Notes

Date: 2026-05-11

## Status

- Created a local full Supabase dump at `supabase/dumps/20260511_supabase_full_dump.sql`.
- The dump combines roles, schema, and data into one SQL file.
- `supabase/dumps/` is ignored by Git so database contents are not pushed to GitHub or deployed to Vercel.

## Notes

- The Supabase CLI requires Docker for direct `db dump --file` execution on this machine.
- Docker was not available locally, so the dump was produced from Supabase CLI dry-run scripts using local Postgres dump tools.
- The local Postgres client tools were installed with Homebrew `libpq`.
