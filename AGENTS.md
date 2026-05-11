# Codex Project Rules

These instructions apply to the entire repository. Follow them when adding or changing code, infrastructure, deployment configuration, database objects, serverless functions, and documentation.

## Core Engineering Standards

- Prefer small, focused changes that match the existing Next.js, React, TypeScript, and Tailwind patterns in this repository.
- Use `pnpm` for JavaScript package workflows. Do not introduce npm, yarn, or alternate lockfiles.
- Keep TypeScript strict and explicit at module boundaries. Avoid `any` unless it is isolated, justified, and safer than a misleading type.
- Favor deterministic, typed data shapes. Validate external input with `zod` or an existing validation layer before trusting it.
- Keep client and server concerns separate. Do not expose secrets, service-role keys, private API tokens, or privileged database operations to browser code.
- Prefer composable functions and plain data transformations over large stateful modules.
- Keep UI accessible: semantic elements, keyboard support, visible focus states, readable contrast, and labels for controls.
- Do not add broad refactors, dependency swaps, formatting churn, or framework migrations unless they are directly required.
- When adding a new dependency, choose a well-maintained package, keep the scope narrow, and document why the platform or standard library is not enough.
- Every change that touches runtime behavior should be checked with the narrowest useful command, typically `pnpm lint`, `pnpm build`, or a focused test command if one exists.

## Repository Conventions

- Application code lives under `app/`, `components/`, `hooks/`, `lib/`, `styles/`, and `public/`.
- Shared business logic and typed data helpers belong in `lib/`.
- Reusable UI belongs in `components/`; app route composition belongs in `app/`.
- Keep generated or fetched static data under `public/data/` only when it is safe to publish.
- Python scripts in `scripts/` should be deterministic, idempotent where possible, and safe to run locally or in CI.
- Maintain a top-level `docx/` folder for complex document work and compact working notes. When making or reading something complex, check this folder first for relevant source material and create a Markdown companion file that summarizes the document, decisions, assumptions, extracted data, status, and next steps.
- Do not commit local machine files such as `.DS_Store`, build output, logs, temporary exports, or secrets.

## Environment Variables And Secrets

- Store secrets only in platform-managed environment variables.
- Never hard-code credentials, tokens, private URLs, database passwords, Supabase service-role keys, Cloudflare API tokens, Vercel tokens, or webhook secrets.
- Public browser variables must use the appropriate public prefix, such as `NEXT_PUBLIC_`, and must not grant privileged access.
- Document required environment variables in README or an example env file using placeholder values only.
- Treat environment-specific values as configuration, not source code.

## Supabase Standards

### Client Usage

- Use the Supabase anon key only for browser-safe operations protected by Row Level Security.
- Use the Supabase service-role key only in trusted server-side contexts such as server actions, route handlers, cron jobs, or secure backend workers.
- Create shared Supabase clients in a small dedicated module instead of constructing clients throughout the codebase.
- Make authentication state explicit. Do not infer user identity from client-provided IDs when Supabase auth context is available.
- Always handle Supabase errors and empty states. Do not assume `.data` is present without checking `.error`.

### Database Design

- Use migrations for schema changes. Do not rely on manual dashboard edits as the source of truth.
- Prefer UUID primary keys for user-owned entities unless a natural key is clearly better.
- Use `created_at` and `updated_at` timestamps on mutable application tables.
- Use foreign keys, unique constraints, check constraints, and indexes to encode data integrity in the database.
- Name tables, columns, policies, functions, and indexes consistently and descriptively.
- Avoid storing derived values unless they improve performance meaningfully and have a clear refresh strategy.

### Naming Conventions

- Use `snake_case` for all Supabase database objects: schemas, tables, columns, views, functions, triggers, policies, indexes, constraints, enum types, storage buckets, and migration filenames.
- Use plural nouns for tables, such as `portfolios`, `market_snapshots`, and `valuation_assumptions`.
- Use singular, descriptive names for enum types with an `_type` or `_status` suffix, such as `asset_type` or `filing_status`.
- Name primary keys `id` unless the table uses a clear natural key.
- Name foreign keys with the referenced table in singular form plus `_id`, such as `user_id`, `portfolio_id`, or `company_id`.
- Use timestamp columns named `created_at`, `updated_at`, `deleted_at`, `published_at`, or another clear `{verb}_at` form.
- Use boolean columns with affirmative names such as `is_active`, `is_archived`, `has_alerts`, or `can_trade`.
- Use monetary and unit-specific columns that include the unit or currency when ambiguity is possible, such as `market_cap_usd`, `price_usd`, `shares_count`, or `return_bps`.
- Name indexes with the format `{table}_{column_or_purpose}_idx`, such as `market_snapshots_ticker_date_idx`.
- Name unique constraints with the format `{table}_{column_or_purpose}_key`, such as `portfolios_user_id_name_key`.
- Name foreign key constraints with the format `{table}_{column}_fkey`, such as `positions_portfolio_id_fkey`.
- Name check constraints with the format `{table}_{rule}_check`, such as `positions_quantity_positive_check`.
- Name Row Level Security policies with action and audience, such as `portfolios_select_own`, `positions_insert_own`, or `market_snapshots_select_public`.
- Name SQL functions with a verb phrase, such as `calculate_portfolio_value`, `refresh_market_snapshot`, or `set_updated_at`.
- Name triggers with the format `{table}_{event}_{purpose}_trigger`, such as `portfolios_before_update_set_updated_at_trigger`.
- Name migration files with a timestamp and concise snake_case purpose, such as `20260510143000_create_portfolios.sql`.

### Row Level Security

- Enable Row Level Security on every table exposed to the client.
- Add explicit policies for `select`, `insert`, `update`, and `delete`; do not depend on broad catch-all policies.
- Policies must be least-privilege and tied to `auth.uid()` or a trusted authorization relationship.
- Test both allowed and denied access paths when changing RLS.
- Never bypass RLS from browser code. Privileged bypasses must stay server-side and be narrowly scoped.

### SQL And RPC

- Prefer parameterized queries and Supabase query builders over interpolated SQL.
- Keep SQL functions stable, documented, and permission-aware.
- Mark functions `security definer` only when necessary, then lock down `search_path` and permissions.
- Return typed, predictable shapes from RPC functions.
- Add indexes that match high-traffic filters, joins, and ordering patterns.

### Storage And Realtime

- Use bucket policies with the same least-privilege discipline as table RLS.
- Validate file type, size, and ownership before accepting uploads.
- Do not expose private storage paths directly unless signed URLs or policies are appropriate.
- Use realtime subscriptions sparingly and clean them up on unmount or scope changes.

## Vercel Standards

### Next.js Runtime

- Choose the runtime deliberately:
  - Use static rendering/export for pages that can be prebuilt.
  - Use serverless functions for Node APIs, secure data fetching, and moderate backend work.
  - Use edge runtime only when latency or geographic placement matters and the code is compatible with edge limitations.
- Keep route handlers small and typed. Validate inputs and return consistent response shapes.
- Do not put privileged logic in client components.
- Use caching intentionally. Specify `revalidate`, `cache`, or dynamic behavior when data freshness matters.
- Keep build-time data fetching reliable and fail with useful errors when required data is unavailable.

### Deployment And Configuration

- Manage Vercel environment variables per environment: development, preview, and production.
- Preview deployments should be safe against production data mutation unless explicitly intended.
- Do not commit `.vercel/` project metadata unless the repository intentionally tracks it.
- Configure redirects, headers, and rewrites in `next.config.mjs` or `vercel.json` only when needed and keep them minimal.
- Keep production builds clean. Do not rely on `ignoreBuildErrors` or ignored lint failures for new code.

### Performance

- Keep serverless cold starts low by avoiding large top-level imports in route handlers.
- Prefer streaming, pagination, and bounded result sets for large responses.
- Use Vercel logs and analytics to investigate production issues before speculative rewrites.
- Avoid loading large client bundles for data or logic that can remain server-side.

## Cloudflare Standards

### Workers And Pages

- Keep Worker code platform-compatible: avoid Node-only APIs unless compatibility flags and bundling support are confirmed.
- Use `wrangler` configuration as the source of truth for Worker bindings, routes, compatibility dates, KV, R2, D1, Queues, Durable Objects, and secrets references.
- Pin or intentionally update the `compatibility_date`; do not let platform behavior drift accidentally.
- Keep Worker handlers small, composable, and easy to test.
- Validate every request boundary: method, path params, query params, headers, body shape, auth, and content type.

### Secrets And Bindings

- Store Cloudflare secrets with Wrangler or the Cloudflare dashboard, never in source files.
- Bind KV, R2, D1, Durable Objects, and service bindings through typed environment interfaces.
- Do not treat KV as strongly consistent. Use D1, Durable Objects, or another transactional store when correctness requires it.
- Use R2 for object storage and keep metadata explicit when objects require authorization, cache control, or lifecycle policies.

### Caching And Security

- Set `Cache-Control` deliberately for every Worker response that may be cached.
- Do not cache personalized, authenticated, or sensitive responses unless the cache key and headers make it safe.
- Use Cloudflare WAF, Turnstile, rate limiting, or bot controls when public endpoints are abuse-prone.
- Keep CORS restrictive. Allow only known origins, methods, and headers.
- Sanitize response headers and avoid leaking stack traces or internal error details.

### Observability

- Log enough structured context to debug failures without logging secrets, tokens, cookies, PII, or full financial account data.
- Use request IDs or trace IDs across Cloudflare, Vercel, and Supabase boundaries when possible.
- Prefer explicit error categories over generic `500` responses.

## Cross-Platform Architecture

- Keep platform-specific code behind small adapter modules. Application logic should not be tightly coupled to Supabase, Vercel, or Cloudflare APIs when a simple abstraction is practical.
- Decide where each responsibility lives:
  - Supabase: persistent relational data, auth, row-level authorization, storage when appropriate.
  - Vercel: Next.js app hosting, server rendering, API routes, preview deployments.
  - Cloudflare: edge routing, Workers, cache, WAF, object storage, lightweight edge APIs.
- Avoid duplicating business rules across platforms. Centralize validation and authorization logic where possible.
- Treat the database as the final authority for sensitive authorization decisions.
- Design all external calls with timeouts, retries only when safe, and clear fallback behavior.

## Financial Application Practices

- Treat market data, SEC data, valuation outputs, and portfolio calculations as auditable artifacts.
- Preserve source timestamps, provider names, assumptions, and calculation metadata when generating financial data.
- Do not silently mix live, delayed, estimated, and manually entered financial data.
- Make rounding and currency units explicit in code and UI.
- Avoid presenting generated valuations, projections, or model outputs as financial advice.
- Keep data-fetching scripts reproducible and avoid hidden local-only dependencies.

## Testing And Verification

- Run `pnpm lint` after TypeScript or React changes.
- Run `pnpm build` after changes that affect routing, Next.js configuration, data imports, deployment behavior, or environment assumptions.
- For Supabase schema or RLS changes, include migration files and verify both permitted and denied access paths.
- For Cloudflare Worker changes, run the relevant Wrangler local or deploy dry-run command when available.
- For Vercel behavior changes, verify local Next.js behavior and confirm production build compatibility.
- Document any verification that could not be run and why.

## Pull Request And Change Hygiene

- Keep commits focused and describe the user-visible or operational impact.
- Include migration notes for database, environment, deployment, or platform changes.
- Call out new secrets, required platform configuration, or one-time setup steps.
- Update README or operational docs when changing setup, deployment, data generation, or environment requirements.
- Prefer backward-compatible changes. When breaking changes are necessary, make them explicit.

## GitHub Push Policy

- For every substantial code, infrastructure, deployment, database, or configuration change, create or use a separate branch with the `codex/` prefix, commit the completed work there, and push that branch to GitHub after verification passes.
- Treat a change as substantial when it affects runtime behavior, app UI, data generation, Supabase, Cloudflare, Vercel, CI/CD, dependencies, schemas, environment expectations, or production deployment behavior.
- Do not auto-push documentation-only edits, comment-only edits, tiny typo fixes, local-only experiments, generated scratch files, or incomplete work unless explicitly asked.
- Before pushing, check the current branch and repository state, avoid including unrelated user changes, and run the narrowest useful verification command such as `pnpm lint` or `pnpm build`.
- If verification fails, do not push. Explain the failure and either fix it or ask how to proceed.
- After pushing the `codex/` branch, ask for confirmation before merging, fast-forwarding, or otherwise applying the work to `main`.
- Never push substantial Codex-made changes directly to `main` unless the user explicitly confirms that action after reviewing the completed work.
