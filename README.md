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

If GitHub-authenticated journey creation reports `Invalid journey code`, apply [`supabase/migrations/20261004_account_link_repair.sql`](supabase/migrations/20261004_account_link_repair.sql) once in the Supabase SQL editor. It repairs the account-link RPC for projects where the earlier account migration is already installed.

Apply [`supabase/migrations/20261004_create_trip_with_code.sql`](supabase/migrations/20261004_create_trip_with_code.sql) as well to enable server-generated owner codes and automatic account linking for new journeys.

## Deployment

Push to `main` to deploy through GitHub Pages. Add the Supabase values as repository Actions variables named `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The site is configured for `ryoko.kaishi.uk`; point that DNS record to GitHub Pages and enable Pages from the Actions source.

## Enhancement ideas

1. Add offline editing with a local outbox that syncs changes when connectivity returns.
2. Add calendar export and import using `.ics` files for itinerary dates and timed activities.
3. Add destination-aware recommendations for food, attractions, and travel time between days.
4. Add an invite-management view with expiring, revocable links and per-member activity history.
5. Add itinerary sharing as a read-only public page with privacy controls and link expiration.
