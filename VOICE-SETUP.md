# Workboard v1.2 — AI Voice + Text Assistant (PATCH, not full project)

**Based on Workboard v1.1. Keep the existing application, Supabase tables, CSV export and `.env.local`.**

## File changes (exact project-relative paths)

| Action | Path |
|---|---|
| REPLACE | `components/tracker-app.tsx` |
| REPLACE | `app/globals.css` |
| ADD | `components/voice-assistant.tsx` |
| ADD | `supabase/functions/parse-tasks/index.ts` |
| ADD | `supabase/config.toml` (if you already have one, merge the `[functions.parse-tasks]` block instead of overwriting) |
| REPLACE | `tsconfig.json` (excludes the Deno Edge Function from the Next.js typecheck) |

Do not delete anything. **No SQL migration and no new React npm packages needed.** Preserve `lib/export-csv.ts` from v1.1.

## What works

- Admin sees **AI Assistant** beside Add Task / Export CSV.
- Microphone dictation through browser speech recognition, with `en-IN`, `hi-IN`, `en-US` options. Long recordings can stop after pauses: press **Continue recording** to append more transcript.
- Type/paste a long multi-project list instead of using a microphone, and edit transcript before extraction.
- `Extract tasks` calls **Supabase Edge Function** `parse-tasks`, which sends text to **Gemini** using a server-side key.
- AI extracts up to **50 distinct tasks**, matches only existing project IDs, resolves clear dates, handles statuses/explicit priority and fills priority from due-date rules.
- Each proposed task is **editable**. Warnings, unknown projects and ambiguous dates require review; rows with warnings start unchecked.
- Save selected valid, non-duplicate tasks via one Supabase insert. Existing admin RLS restrictions still apply.
- No automatic project creation; the project seed script can come later.

## Step 1 — Get Gemini API key

1. Go to https://aistudio.google.com/apikey and create a key for Gemini Developer API.
2. IMPORTANT PRIVACY: Google's Gemini API **free tier may use submitted content to improve Google products**. Your transcript includes company/client data. Only use the free tier with company approval, use non-sensitive dummy data, or configure a paid/privacy-approved service instead. Browser speech recognition may also process audio using browser-provider servers. Check company policy before recording client-sensitive details.
3. Never put `GEMINI_API_KEY` in `.env.local` as a `NEXT_PUBLIC_` variable. Do not commit it to GitHub or send it in chat.

## Step 2 — Deploy Supabase Edge Function

Use a terminal opened at the **root of your existing Next.js app** (where `package.json` lives), after adding these patch files:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_SUPABASE_PROJECT_REF
npx supabase functions deploy parse-tasks --no-verify-jwt
```

- Your **project ref** is in the Supabase project URL: `https://PROJECT_REF.supabase.co`.
- For the API key, use Supabase Dashboard → **Edge Functions → Secrets** (UI label may vary), create secret `GEMINI_API_KEY` and paste your Gemini key.
- Optionally create `GEMINI_MODEL` with value `gemini-3.1-flash-lite` (the code already uses this default).
- If you prefer CLI secrets, use `npx supabase secrets set GEMINI_API_KEY=YOUR_KEY` but take care not to commit or paste secrets into logs/screenshots.
- If `supabase/config.toml` already exists, add the `[functions.parse-tasks] verify_jwt = false` section instead of replacing its other settings.
- The `--no-verify-jwt` deployment flag is intentional for modern publishable keys; the function **itself verifies the signed-in user's JWT with Supabase Auth** and confirms `user_roles.role='admin'` before any Gemini API call. It never exposes a privileged service-role key.

Troubleshooting: dashboard → Edge Functions → `parse-tasks` → Logs. If it returns 401 or 403, sign in again and verify the admin role. If it says `GEMINI_API_KEY not configured`, set the secret and retry. If it says quota reached, wait/check Gemini free quota. Do not send sensitive data until approved.

## Step 3 — Run locally

```powershell
npm run dev
```

Open http://localhost:3000, sign in as **Admin**, then click **AI Assistant**.

Before importing your real projects, microphone + transcript work, but **Extract tasks is disabled if there are no existing projects**. That's deliberate to prevent misfiling tasks. You can temporarily use dummy projects or wait for the project seed script planned later.

Example transcript with demo projects named Project A and Project B:

> Project A ka homepage banner change karna hai, kal deadline hai, high priority. Same project mein contact form fix karna hai Monday tak. Project B mein navbar fix and footer update karna hai, dono pending, deadline next Friday.

Then: **Stop recording → Extract tasks → Review/modify drafts → Save N tasks.** Check the Master Dashboard or each project tab and export CSV as before.

Try `npm run typecheck` and `npm run build` before pushing to GitHub.

## Step 4 — Hosting

Your original static-export Next.js hosting configuration stays exactly the same. No Next.js server endpoints are required: frontend → Supabase Edge Function → Gemini, then frontend → Supabase tasks with RLS. Re-deploy your frontend after copying the patch. Secrets stay in Supabase; there is **no new client-side environment variable**.

## Priority policy

- Explicit spoken High/Medium/Low wins.
- Otherwise: overdue/today/within 2 days = High, due in 3–7 days = Medium, more than 7 days = Low, no deadline = Medium.
- Priority is calculated **when importing** and stored. It is not automatically re-prioritized daily.
- Status defaults to Pending unless spoken In Progress, Waiting for Approval, or Completed.

## Limits and caveats

- SpeechRecognition API is not available in all browsers and may use an online recognition service (Chrome support is generally better; run on HTTPS or localhost with microphone permission).
- A single recognition session may stop automatically when idle. Resume to append more text.
- AI can mishear, misunderstand or omit tasks. Always compare preview with transcript; ambiguous items begin deselected.
- Gemini free tier has limited usage quotas; no guarantee of unrestricted free API processing.
- For 25 tasks, preview and save one batch. The parser caps batches at 50 tasks and 12,000 transcript characters.
- The current release **creates tasks only**; it does not yet edit existing tasks or answer spoken status queries. Those can be added later safely.
- No audio is saved by Workboard; browser-provided speech recognition may process speech remotely. Only approved task fields go to Supabase.
