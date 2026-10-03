# Ryōkō 旅行

Ryōkō is a playful, collaborative Japan trip planner for shared itineraries, places, and saved Instagram inspiration.

## Local development

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` when connecting the Supabase project. The public frontend should only receive the Supabase URL and anon key; never commit service-role keys or raw contributor codes.

Instagram URLs resolve through the `instagram-metadata` Supabase Edge Function, which fetches oEmbed and page metadata server-side. Deploy it from the repository root with `supabase functions deploy instagram-metadata` after linking the Supabase project (`supabase link --project-ref <project-ref>`). The browser still has a graceful fallback if Instagram rate-limits the function.

The planner schema also includes structured destinations, activities, and comments so sub-locations, category/time planning, bookings, map pins, and collaboration notes can be added without changing the core trip model.

Apply the planner expansion with [`supabase/migrations/20261003_ryoko_planner_expansion.sql`](supabase/migrations/20261003_ryoko_planner_expansion.sql) after the existing Ryōkō foundation migration.

## Supabase foundation

Run [`supabase/schema.sql`](supabase/schema.sql) in the Kaishi Quest Supabase SQL editor. The tables use the `ryoko_` prefix to stay isolated from Kaishi Quest. The live project also contains security-definer RPCs for trip creation, code joining, day reads, contributor issuing, and revocation. Direct table access is denied by RLS; the frontend uses those RPCs and Supabase Realtime presence channels.

## Deployment

Push to `main` to deploy through GitHub Pages. Add the Supabase values as repository Actions variables named `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The site is configured for `ryoko.kaishi.uk`; point that DNS record to GitHub Pages and enable Pages from the Actions source.
