# Running the dashboard through Firebase

The dashboard UI no longer talks to `dashboard-server.js` over HTTP directly. Instead:

- **`firebase-agent.js`** runs on *your* machine (the one with this project, Chrome, and
  your files). It boots the existing local server internally, signs into Firebase, and
  relays commands/results through the Realtime Database.
- **The dashboard UI** is its own project:
  [puppeteerCucumberTesterDashboard](https://github.com/Ephraimmo/puppeteerCucumberTesterDashboard),
  a plain static site hosted on Vercel. Open its URL from any computer; it talks to this
  agent through Firebase. This project no longer serves a page of its own.

Screenshots embedded in reports are **not** synced through Firebase — the dashboard shows
pass/fail, error messages, and durations live, but not screenshots.

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

**On this machine**, run:

```
npm run agent
```

(`npm start` / `start.bat` do the same, and also open the dashboard once you set
`DASHBOARD_URL` in `firebase-agent-config.js` to your Vercel URL.)

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

**Opening the dashboard**: open the Vercel URL of the dashboard project and sign in with
the same account from step 3. "Run", "Edit/Save", step definitions, and recording all go
through Firebase to whichever machine has `npm run agent` running. Deploy steps are in
that project's README.

## What's in the code

- `firebase-agent.js` / `firebase-agent-config.js` — the local bridge process.
- `database.rules.json` — Realtime Database security rules to paste into the console.
- `dashboard-server.js` — the HTTP API that does the real work (file I/O, running
  cucumber, Puppeteer recording). The agent calls it exactly like the browser used to;
  it no longer serves the dashboard page itself.
- `launch-dashboard.js` (`npm start`, `start.bat`) — starts the agent and opens
  `DASHBOARD_URL`.

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
