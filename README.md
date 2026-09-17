# UNICENTER 2.0 Control Center

Dynamic multi-user Next.js dashboard for the 60-day stabilization program.

## Setup

1. Run the SQL files in `supabase/migrations` in numeric order. Existing installations should apply only migrations newer than the last installed migration; `014_cockpit_crm.sql` enables Cockpit One CRM metadata and interactions.
2. Add the variables from `.env.example` to Vercel for Production, Preview, and Development.
3. Enable Email authentication in Supabase. Add your Vercel production and preview callback URLs under Authentication → URL Configuration.
4. Deploy through the connected Vercel Git integration.

The first registered account becomes Admin. Later accounts begin as Viewer and can be promoted to Editor or Admin.

## Deployment

Production deployments are automatically triggered from the `main` branch through Vercel.
