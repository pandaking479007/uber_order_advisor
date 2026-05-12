# Tesla Backend Setup

This app now includes Netlify Functions for the first step of Tesla integration.

## What Works Now

- The frontend checks whether Netlify Functions are reachable.
- The backend can start Tesla OAuth when credentials are configured.
- The callback can exchange an OAuth code for Tesla tokens.
- Token storage is scaffolded for Supabase.

## What Is Still Needed

- Tesla Developer application approval
- Netlify environment variables
- Supabase database
- Token refresh implementation
- Daily scheduled sync implementation

## Netlify Environment Variables

Set these in Netlify:

```text
TESLA_CLIENT_ID=...
TESLA_CLIENT_SECRET=...
TESLA_STATE_SECRET=a-long-random-string
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Netlify usually provides:

```text
URL=https://your-site.netlify.app
```

## Tesla Redirect URI

Use this in the Tesla Developer Portal:

```text
https://your-site.netlify.app/.netlify/functions/tesla-auth-callback
```

The app's Daily page will show the exact redirect URI after deployment.

## Supabase Setup

Run [supabase-schema.sql](./supabase-schema.sql) in Supabase SQL editor.

## Current Function Endpoints

```text
/.netlify/functions/tesla-config
/.netlify/functions/tesla-auth-start
/.netlify/functions/tesla-auth-callback
/.netlify/functions/tesla-daily-sync
```

## Important Security Notes

- Never put `TESLA_CLIENT_SECRET` in frontend JavaScript.
- Never store Tesla refresh tokens in browser localStorage.
- Supabase service role key must only be used inside Netlify Functions.
- The current callback stores raw tokens in Supabase for scaffolding. Before production use, encrypt refresh tokens at rest.
