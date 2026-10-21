# Incog Plotline — premium interactive story app

A React + Vite app with a Supabase database, email/password authentication, private administrator role, public story reading, three-option polls, aggregate results, image upload, story archive, and next-poll workflow.

## Install in your current project

If you want this complete folder as its own project, extract it and open `incog-plotline` in VS Code. If you want to use your existing folder, copy the contents of this folder into `interactive-story-app`, allowing the `src` and configuration files to merge/replace.

1. Run `npm install` in the project terminal.
2. Create `.env.local` beside `package.json` using `.env.local.example` as the template. The file is excluded by `.gitignore`.
3. Keep `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; never put a Supabase secret or service-role key in browser code.
4. Open Supabase Dashboard → SQL Editor and run the entire `supabase/schema.sql` script.
5. Run `npm run dev` and open the local URL.
6. Use Sign in → Create account to register your owner account. Confirm the email if required by Supabase.
7. In SQL Editor, run the owner-bootstrap query below with your exact signup email. The account must already exist.

```sql
insert into public.admin_users(user_id)
select id from auth.users where lower(email) = lower('YOUR_OWNER_EMAIL@example.com')
on conflict (user_id) do nothing;
```

Replace the example email before running. Then sign out and sign in again. Creator Studio will appear for that account. Do not give anyone else administrator access. This bootstrap step is how your specific authenticated account becomes the owner; no admin password or magic frontend key is used.

## What is implemented

- Premium responsive dark UI, three genres, search, story cards, reader view, and archive view.
- Supabase-backed stories, polls, three options, aggregate poll results, and cover uploads.
- Email/password sign-up and sign-in; only users in `public.admin_users` can see Creator Studio and use admin-only database functions.
- Public readers can read published/archived stories and vote only while a poll is open.
- One vote per authenticated account per poll is enforced with a database unique constraint and a server-side RPC.
- Admin can create a story and its first poll, close/finalize an open poll, and create the next poll for the same story.
- Finalizing a poll appends the prompt and winning continuation to the narrative, saves the winning option, and closes the poll. Only the winning continuation is inserted into the story; all three options remain in the poll record. Ties resolve by option order A, B, C.
- Optional cover image URL or upload to a public-read `story-images` bucket; upload/delete permissions are admin-only.

## Important limitations

- The deadline is checked by the vote RPC. To automatically finalize/archive a poll exactly at its deadline even when nobody is using the site, add a scheduled Supabase Edge Function or cron job; until then the admin uses “Close poll & archive winner”.
- Email/password authentication is implemented. Google sign-in can be added by enabling Google in Supabase Authentication → Providers and configuring the OAuth credentials/redirect URLs.
- Story and poll creation currently uses sequential client requests rather than one transaction; if a later request fails, an incomplete story/poll may need cleanup from the dashboard. Database write policies still enforce admin access.
- The public archive lists stories whose latest poll is closed or that have no open poll. Story titles stay singular; continuations have no separate story titles.
- The publishable key is designed to be public. Security depends on RLS and the server-side RPC functions in `supabase/schema.sql`.
