# UNICENTER 2.0 Control Center

Dynamic multi-user Next.js dashboard for the 60-day stabilization program.

## Setup

1. Run `supabase/migrations/001_schema.sql` and `supabase/migrations/002_seed.sql` in the Supabase SQL Editor.
2. Add the variables from `.env.example` to Vercel for Production, Preview, and Development.
3. Enable Email authentication in Supabase. Add your Vercel production and preview callback URLs under Authentication → URL Configuration.
4. Deploy through the connected Vercel Git integration.

The first registered account becomes Admin. Later accounts begin as Viewer and can be promoted to Editor or Admin.

## Deployment

Production deployments are automatically triggered from the `main` branch through Vercel.
