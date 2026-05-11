# Supabase Auth Alignment Notes

Date: 2026-05-11

## Summary

- Restored the custom server-side signup path so the app can keep a 4-character password minimum while still requiring Supabase email verification.
- Removed the browser client's placeholder Supabase credentials so missing config fails clearly instead of producing misleading auth errors.
- Added runtime validation that checks whether the Supabase URL and keys belong to the same project ref before creating clients.
- Matched the app password minimum and local Supabase config to 4 characters.
- Expanded local auth redirect URLs in `supabase/config.toml` to cover both `localhost` and `127.0.0.1`.

## Why

- The browser client used placeholder URL and API key fallbacks, which could surface as `Invalid API key` instead of clearly reporting missing environment configuration.
- The production Vercel deployment was inspected and found to be built with a placeholder public anon key, which explains the repeated `Invalid API key` message on the live login page.
- Added a build-time Supabase environment check so Vercel fails fast when auth keys are missing, placeholders, malformed, or from a different Supabase project.

## Dashboard Settings To Confirm

- `Authentication -> Providers -> Email` is enabled.
- Email confirmations are enabled.
- The redirect allow list includes:
  - `http://localhost:3000/auth/callback`
  - `http://127.0.0.1:3000/auth/callback`
  - any deployed domain callback URL used in Vercel, such as `https://<your-domain>/auth/callback`
- If verification emails still do not arrive, verify the project's SMTP/email sender configuration and any provider-level sending limits in Supabase.

## Verification

- `pnpm lint` completed with pre-existing warnings only and no errors.
- `pnpm build` completed successfully.
- Local auth route check reached hosted Supabase and returned a provider-side validation error for a throwaway test email, confirming the app is talking to the configured project.

## Next Steps

- If the deployed app still shows `Invalid API key`, confirm the Vercel environment values exactly match the current Supabase project's public URL and anon key, then redeploy so the client bundle is rebuilt with the live public vars.
- If the message says the URL and key belong to different projects, copy all three values from the same Supabase project: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
