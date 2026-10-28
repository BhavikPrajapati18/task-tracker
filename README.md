# Workboard — Next.js + Supabase Project Tracker

A minimal, responsive, text-only project tracker. **Data is private by default.** Admins can manage projects and tasks; authorized viewers can see changes live. No voice integration yet (planned for later).

## Features

- Project navigation + a consolidated Master Dashboard
- Active tasks on the left, grouped by high / medium / low priority
- Waiting for Approval and Completed on the right
- Add/edit/delete projects and tasks, quick status changes, deadlines and estimated hours
- Search, overdue and due-today counts, responsive layout
- Supabase Auth and secure Row Level Security (RLS), separate admin/viewer roles
- Supabase Realtime updates across authenticated devices
- Next.js static export: deployable on Cloudflare Pages, or on a compatible host

## 1. Requirements

- Node.js 20.9+ (Node.js 22 recommended)
- Free Supabase account at https://supabase.com/
- GitHub account
- Cloudflare account for recommended free hosting

## 2. Create database

1. Supabase Dashboard > **New project** > choose Free plan; make a strong database password.
2. Open **SQL Editor** and run the entire `supabase/schema.sql` file.
3. Authentication > Providers > Email: keep email/password **enabled**. For private access, **disable new public signups** (usually Authentication > Providers > Email > Allow new users to sign up, UI wording may vary).
4. Authentication > Users > **Add user** > **Create new user**. Enter your email and a strong password, and mark confirmed if the dashboard offers that option. This is your admin login. The app itself never exposes a signup form.
5. Copy `supabase/assign-admin.sql` into SQL Editor, replace `YOUR_EMAIL@example.com` with that exact email, run it. Confirm the result with:

```sql
select u.email, r.role from public.user_roles r
join auth.users u on u.id = r.user_id;
```

**Read-only viewers:** Add another user with Authentication > Users > Add user > Create new user (or Send invitation), then assign `viewer` with `supabase/assign-viewer.sql`. The invited person signs in with their own credentials. Never share your admin password.

**Note on invitation emails:** Supabase's built-in email sending can be restricted and may require SMTP configuration. Directly creating a user with a confirmed email and a temporary password avoids relying on an invitation email during initial setup; the recipient should change that password using the Supabase dashboard or a future password-reset screen.

## 3. Configure environment

Supabase Dashboard > **Connect** (or Project Settings > API): copy Project URL and **publishable key** (`sb_publishable_...`). Some older projects show the legacy `anon` key, which also works. Do **NOT** use the service_role or secret key on the frontend.

Copy `.env.example` to `.env.local` and replace placeholders:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
```

## 4. Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000 and sign in. Add projects through the sidebar, then add tasks. The master dashboard refreshes automatically when the database changes.

Optional build check:

```bash
npm run typecheck
npm run build
```

## 5. Deploy: Cloudflare Pages (recommended for company-related work on a free tier)

This project deliberately uses Next.js **static export**. Data is still live because the browser securely connects to Supabase for reads, writes and realtime changes.

1. Push this project to your GitHub repository (`.env.local` is ignored; never commit it).
2. Go to https://dash.cloudflare.com/ > **Workers & Pages** > **Create application** > **Pages** > connect your GitHub repository.
3. Framework preset: **Next.js (Static HTML Export)**; build command: `npm run build`; output directory: `out`.
4. Under build-time **Environment variables**, add the same two `NEXT_PUBLIC_...` variables. Select a recent Node.js version (22+) if the provider requires you to configure one.
5. Deploy. Cloudflare gives you a `*.pages.dev` URL. Share only with viewers whom you've granted a Supabase role.

### If you prefer Vercel

You can import the same repo into Vercel and add the two environment variables; no additional backend service is needed. **Important:** Vercel's free Hobby plan is restricted to non-commercial personal use. Because this tracks company work, use a plan permitted for commercial activity instead of relying on Hobby. See https://vercel.com/docs/plans/hobby .

## 6. Operating the dashboard

- Left navigation shows Master Dashboard and each project.
- Add Project / New Task are visible to admins.
- Edit tasks using the pencil icon; move a task between statuses using the status selector, or the edit dialog.
- Waiting for Approval and Completed are separate right-hand lists.
- Data is live across logged-in devices using Supabase Realtime + reload-on-focus fallback.
- Deleting a project also deletes all its tasks (with a confirmation prompt).

## 7. Security / free-tier notes

- Only manually allowlisted authenticated users can view tasks. RLS is enforced inside PostgreSQL (not just in the UI).
- The publishable key can live in the client. **Never** expose the Supabase secret/service_role key.
- Keep public self-signups turned off; grant access only through dashboard and `user_roles` SQL.
- Tasks are *not* public simply because someone has a URL.
- Supabase free databases may pause after 7 days of low activity; resume from the dashboard if needed.
- Supabase Free does not include downloadable managed backups. Export your data periodically if important.
- Hosting provider free-tier limits and terms can change; check official pricing before launch.
- Future AI voice commands should run through a secure authenticated endpoint with confirmation for edits; don't expose LLM API keys in this client-only application.

## Future development

Voice capture > speech transcription > structured task action > preview/confirmation > authenticated write to Supabase. This step will introduce secure server-side API endpoints or Edge Functions; it's intentionally excluded from v1.

## File map

```text
app/page.tsx                 Main entry
app/layout.tsx               Metadata
app/globals.css              Complete responsive styling
components/tracker-app.tsx   Auth + dashboard + project/task UI
lib/supabase.ts              Supabase client
lib/types.ts                 Data shapes
lib/helpers.ts               Sorting and date logic
supabase/schema.sql          DB schema, RLS, realtime
supabase/assign-admin.sql    Grant admin access
supabase/assign-viewer.sql   Grant viewer access
.env.example                 Frontend-safe environment variable names
```
