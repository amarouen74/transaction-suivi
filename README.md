# Transaction Suivi App

A starter real estate deal tracking app for agents, from signed compromis to final acte de vente.

## What it does

- Create a transaction with property, buyer, seller, compromis date, notaire, and price
- Automatically builds key milestones:
  - legal withdrawal deadline
  - loan approval deadline
  - notaire document deadline
  - estimated acte de vente date
- Tracks transaction progress with status fields
- Generates automatic reminders for urgent deadlines and missing items
- Copies a shareable summary report to clipboard

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and set your Supabase URL and anon key.

3. Create the database tables in Supabase using `supabase/schema.sql`. The schema includes row-level security policies to enforce user-only access for deals and contacts.

4. Start the frontend app:

```bash
npm run dev
```

5. Open the URL shown by Vite in your browser.

## Deploy to Vercel

1. Push your repository to GitHub.
2. Create a new project in Vercel and import this repo.
3. Set the following environment variables in Vercel:

```bash
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

4. Use the default build command:

```bash
npm run build
```

5. Vercel will deploy the static site from the `dist` output.

## How to use

- Fill the transaction form
- Adjust loan, document, and notaire status
- Review the timeline and risk status
- Copy a summary report to share with clients or notaire

## Next improvements

- Add persistent storage with local storage or backend API
- Add email or SMS reminders
- Generate PDF exports for reports
- Add multiple transaction management and filtering
- Add contact management for buyer/seller/notaire profiles

## Current app improvements

- Saved deals persist in Supabase with user isolation
- Multi-deal dashboard with a list view
- Status filters for all/active/at risk/closing soon/completed
