# Radon Crew Desk

Scheduling, job tracking, client messaging, quotes and invoices, and a crew phone app for a radon mitigation company.

- **Frontend:** Vite + plain JavaScript (`src/main.js`), deployed on Vercel from `main`.
- **Backend:** Supabase (Postgres, Auth, Storage, Realtime). Row-level security decides who sees what.

## Who sees what

| Role | Access |
|---|---|
| Owner | Everything, plus approves new people and sets roles under Settings → Team. The first account created becomes the owner. |
| Office | Everything except changing roles. |
| Crew | Only the Crew app: their own crew's stops, client address and phone, "On my way", "Arrived", "Finish", and photos. No billing or messages. |
| Not approved | Nothing until the owner approves them. |

Crews can't write to tables directly. Their actions go through two database functions (`set_visit_status`, `complete_visit`) that check the visit belongs to their crew.

## Database

Migrations live in `supabase/migrations/` and are already applied to the `radon` project.

- `clients`, `jobs`, `appointments`, `crews`, `billing_docs`, `messages`, `photos`, `profiles`, `settings`
- Photos are stored in the private `job-photos` bucket under `<job id>/<file>`.
- Sample rows have `is_sample = true` and can be removed from Settings → Sample data.

## Local development

```bash
npm install
npm run dev
```

The Supabase URL and publishable key default to the production project (`src/config.js`). They're safe to ship to the browser; override them with a `.env.local` (see `.env.example`).

## Not done yet

- **Real texting/email.** Messages are recorded with status `recorded`. Next step: a Supabase Edge Function that sends rows through Twilio (SMS) and an email provider, and a webhook that stores client replies as incoming messages.
- **PDF quotes and invoices** for emailing to clients.
- **Online payments** (Stripe) on invoices.
