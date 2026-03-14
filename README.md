# Shtudio Client Portal

White-label client reporting portal for [Shtudio](https://shtudio.com.au), a Sydney digital agency.

## Tech Stack

- **Next.js 14** (App Router, TypeScript, CSS Modules)
- **Supabase** (Auth, Database, Storage)
- **Anthropic Claude API** (AI-powered report enhancement)
- **Resend** (Transactional email - Phase 2)
- **Vercel** (Deployment)

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

```bash
cp .env.local.example .env.local
```

Fill in your Supabase and Anthropic API keys.

### 3. Set up Supabase

Run the schema in your Supabase SQL editor:

```
supabase/schema.sql
```

Create a private storage bucket called `report-pdfs` in the Supabase dashboard.

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Architecture

### Roles

- **Admin** (`/admin/*`) - Manages clients, uploads PDFs, controls report publishing
- **Client** (`/dashboard/*`) - Views published HTML reports only

### Report Flow

1. Admin uploads a PDF for a client
2. PDF is stored privately in Supabase Storage
3. API extracts text with `pdf-parse` and sends to Claude API
4. Claude generates clean, structured HTML
5. Admin reviews and toggles publish
6. Client sees only the HTML report (never the PDF)

### Key Directories

```
src/
  app/
    admin/          # Admin dashboard, clients, reports
    dashboard/      # Client-facing portal
    api/            # API routes (report enhancement)
    login/          # Auth
    auth/           # Auth callback
  components/       # Shared UI components
  lib/
    supabase/       # Supabase client helpers
    types.ts        # TypeScript types
  styles/           # Global CSS and variables
supabase/
  schema.sql        # Database schema with RLS
```

## Brand

- Primary: `#F26522` (Orange)
- Dark: `#2D2D2D` (Charcoal)
- Headings: Anton
- Body: Space Grotesk
