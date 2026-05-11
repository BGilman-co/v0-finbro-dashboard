# Supabase Auth Alignment Notes

Date: 2026-05-11

## Summary

- Replaced the custom admin-user signup path with Supabase's native `auth.signUp()` flow.
- Removed the browser client's placeholder Supabase credentials so missing config fails clearly instead of producing misleading auth errors.
- Added runtime validation that checks whether the Supabase URL and keys belong to the same project ref before creating clients.
- Matched the app password minimum to Supabase hosted Auth's default minimum of 6 characters.
- Expanded local auth redirect URLs in `supabase/config.toml` to cover both `localhost` and `127.0.0.1`.

## Why

- The previous signup flow created users through the admin API, then tried to trigger a signup verification email afterward. That path is brittle because it does not match Supabase's normal signup lifecycle.
- The browser client used placeholder URL and API key fallbacks, which could surface as `Invalid API key` instead of clearly reporting missing environment configuration.

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
