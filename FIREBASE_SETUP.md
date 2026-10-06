# Running the dashboard through Firebase

The dashboard UI no longer talks to `dashboard-server.js` over HTTP directly. Instead:

- **`firebase-agent.js`** runs on *your* machine (the one with this project, Chrome, and
  your files). It boots the existing local server internally, signs into Firebase, and
  relays commands/results through the Realtime Database.
- **`dashboard.html` / `dashboard.js` / `dashboard.css` / `firebase-client.js`** are a
  plain static site. Open them locally, or deploy them to any static host (Vercel,
  Netlify, GitHub Pages, a plain S3 bucket, etc.) and open that URL from any computer —
  it talks to the same agent through Firebase either way.

Screenshots embedded in reports are **not** synced remotely (per your choice) — the
remote dashboard shows pass/fail, error messages, and durations live, but screenshots are
only visible when you view the dashboard directly on this machine.

## One-time setup (you do this, in the Firebase console)

Project: **rfidproject-e2225** (from the config you gave me).

1. **Realtime Database** — confirm it's already created (your config already has a
   `databaseURL`, so it most likely is). Console → Build → Realtime Database.
2. **Authentication → Sign-in method** → enable **Email/Password**.
3. **Authentication → Users → Add user** — create ONE account (an email + password).
   Both you (in the browser) and the agent (on this machine) sign in with this same
   account for now — there's no separate "viewer" vs "agent" role yet.
4. **Realtime Database → Rules** — paste the contents of [`database.rules.json`](database.rules.json)
   from this repo and click Publish. (Without this, the database rejects every read/write —
   its default rules are usually fully closed.)

## Running it

**On this machine**, instead of `npm run dashboard`, run:

```
npm run agent
```

It needs the sign-in credentials from step 3. Either:

```
set FIREBASE_AGENT_EMAIL=you@example.com
set FIREBASE_AGENT_PASSWORD=yourpassword
npm run agent
```

or create `firebase-agent-credentials.json` next to this file (already in `.gitignore`,
so it's never committed):

```json
{ "email": "you@example.com", "password": "yourpassword" }
```

You should see:

```
Scenario progress dashboard listening on port 4173
Firebase agent: signed in as you@example.com (agent id "main")
Firebase agent: connected — watching commands/main for work from any dashboard.
```

Leave this running — it's what actually executes everything.

**Opening the dashboard**: open `dashboard.html` (locally, or wherever you deploy the
four static files) and sign in with the same account from step 3. "Run", "Edit/Save",
step definitions, and recording all now go through Firebase to whichever machine has
`npm run agent` running — same behavior whether that's this computer or a different one.

## What's new in the code

- `firebase-agent.js` / `firebase-agent-config.js` — the local bridge process (new).
- `firebase-client.js` — browser-side Firebase wiring + sign-in gate (new).
- `database.rules.json` — Realtime Database security rules to paste into the console (new).
- `dashboard.js` — every `fetch('/api/...')` call now goes through `FB.fetch(...)`
  (same call signature, same response shape) instead of hitting `localhost` directly.
- `dashboard.html` / `dashboard.css` — added the sign-in overlay and the Firebase SDK
  script tags.
- `dashboard-server.js` — **unchanged except** one line registering `firebase-client.js`
  as a servable static file for local convenience. All of its actual logic (file I/O,
  running cucumber, Puppeteer recording) is untouched — the agent just calls its HTTP
  API exactly like the browser used to.

## Current limits worth knowing about

- **One agent per Firebase project by default** (`AGENT_ID = "main"`). If you ever want
  two independent machines running their own project, set `FIREBASE_AGENT_ID` to a
  different value on the second machine, and open the dashboard with `?agent=<that id>`
  once (it's remembered after that).
- **Security rules are intentionally simple for v1**: any signed-in user can read and
  write everything. There's no separate "viewer can't trigger runs" role yet — anyone
  who knows the one account's password has full control. Tightening this (e.g. a
  read-only role) is a reasonable next step if you add more users later.
- **Command timeout is 20 seconds** — if the agent isn't running, actions (run, save,
  delete, etc.) will fail with "the agent did not respond" after that, rather than
  hanging forever.
