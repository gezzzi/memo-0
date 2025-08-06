# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
npm run dev      # Start development server with Turbopack
npm run build    # Build for production  
npm run start    # Start production server
npm run lint     # Run ESLint
```

## Architecture Overview

This is a Next.js 15 application using the App Router with Supabase for authentication and database.

### Key Technologies
- **Next.js 15.4.5** with App Router (src/app/)
- **React 19.1.0** 
- **TypeScript** with strict mode
- **Tailwind CSS v4**
- **Supabase** (@supabase/ssr for server-side auth)

### Supabase Integration

The app uses three Supabase client configurations:

1. **Browser Client** (`src/lib/supabase/client.ts`) - For client components
2. **Server Client** (`src/lib/supabase/server.ts`) - For server components with cookie handling
3. **Middleware** (`src/middleware.ts` + `src/lib/supabase/middleware.ts`) - Session refresh on all routes

### Authentication Flow

- **Provider**: Google OAuth
- **Callback Route**: `/auth/callback` 
- **Sign Out Route**: `/auth/signout`
- **User Metadata**: Accessed via `user.user_metadata.name` for Google

### Database Schema

Two main tables with Row Level Security:
- **profiles**: Auto-created on user signup via trigger
- **todos**: User-specific todos with RLS policies (users can only access their own todos)

Execute `supabase/schema.sql` in Supabase SQL Editor during setup.

## Environment Setup

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

## Initial Setup Steps

1. Create Supabase project and get credentials
2. Set up `.env.local` with Supabase URL and anon key
3. Run schema.sql in Supabase SQL Editor
4. Configure Google OAuth in Supabase Authentication > Providers
5. Set redirect URI: `https://[YOUR-PROJECT-REF].supabase.co/auth/v1/callback`
6. Run `npm install` and `npm run dev`

# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.