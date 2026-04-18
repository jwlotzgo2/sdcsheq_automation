This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Security Model

- Authentication is handled by Supabase Auth (session cookies, verified by `middleware.ts`).
- Authorization is role-based via `user_profiles.role`. App-layer hierarchy: `AP_CLERK < APPROVER < FINANCE_MANAGER < AP_ADMIN`. The Postgres `user_role` enum and the `public.is_role()` helper still carry the legacy `REVIEWER` value; it is not used at the app layer and its former privileges have been collapsed into `AP_CLERK`.
- API routes that mutate data must call `requireRole()` from `lib/auth/require-role.ts` — see `app/api/admin/invite/route.ts` for the canonical example.
- Server-to-server calls between internal routes use `INTERNAL_API_KEY` (distinct from `SUPABASE_SERVICE_ROLE_KEY`) with a constant-time compare in `lib/auth/internal-api-key.ts`.
- Postgres RLS enforces role-gated SELECTs on all public tables as a defense-in-depth layer (see `supabase/migrations/006_tighten_rls.sql`). Routes using `SUPABASE_SERVICE_ROLE_KEY` bypass RLS and **must** gate role in code.
- `user_profiles.role` and `is_active` are NOT updatable via the `authenticated` role — only via SERVICE_ROLE_KEY paths (admin routes). Users can only self-update `full_name`. This prevents self-promotion via the browser client.

To provision a new env, copy `.env.example` to `.env.local` and fill in values. Generate `INTERNAL_API_KEY` and `CRON_SECRET` with `openssl rand -hex 32`.
