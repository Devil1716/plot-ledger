# Plot Ledger

A mobile-friendly ledger for a shared plot. Six people — five contributors and one homeowner — record what they paid toward a **₹1.20 crore** target (`₹1,20,00,000`). The land is **54 ft × 105 ft** (5,670 sq ft).

Ownership is not split evenly. A contributor's share is:

**their payments ÷ all contributors' payments**

The homeowner's payments are stored, shown in the history, and counted in the total collected. They are excluded from the denominator, and the homeowner's share stays at **0%**. Amounts are stored as integer paise. Percentages and square feet use largest-remainder rounding so they add up to 100% and 5,670 sq ft when anyone in the contributor pool has paid.

Signed-in members can see every share and the full history. An admin (the first account, then anyone they add) can add, edit, and delete payments, edit the roster, and link logins to people. Every change writes an audit entry.

## Local setup

Requirements: Node 22 (see `.nvmrc`), pnpm 10, and Java 21+ for the Firebase emulators.

```bash
pnpm install
cp .env.example .env.local
pnpm emulators
```

In a second terminal:

```bash
pnpm seed:demo
pnpm dev
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123).

Emulator demo accounts (not production credentials):

| Role | Email | Password |
| --- | --- | --- |
| Admin, linked to Ananya Iyer | admin@plotshare.local | plot-admin-2026 |
| Member, linked to Rohan Mehta | member@plotshare.local | plot-member-2026 |

`pnpm seed` resets the emulators without sample payments. `pnpm seed:demo` loads a full ₹1.20 crore example where Kavita Shah owns 25%. The seed script refuses any project id that does not start with `demo-`.

Auth emulator: [http://127.0.0.1:9199](http://127.0.0.1:9199). Firestore emulator: `127.0.0.1:8180`. Emulator UI: [http://127.0.0.1:4040](http://127.0.0.1:4040).

Email/password and Google sign-in both use Firebase Auth. On the emulators, Google opens the emulator account picker instead of a real Google account. Sessions use browser local persistence.

## Tests

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm test          # share math, formatting, rounding
pnpm test:rules    # Firestore rules against the emulator
pnpm test:e2e      # Playwright: login, admin payment, member sees shares
```

Rules and end-to-end tests start the emulators themselves. Java must be on `PATH`.

## Security rules

These are prototype rules. Members (a `users/{uid}` profile) can read the ledger. Only uids in `settings/access.adminUids` can write. The first account can create that admin list if it does not exist yet; later admins can add others but cannot remove themselves in the same write. User emails are readable by that user and by admins, not by every member. Nothing is world-readable. Review `firestore.rules` before you point this at a real project.

## Plug in a real Firebase project

This repository does not create or deploy a Firebase project.

1. Create a project in the [Firebase console](https://console.firebase.google.com/) and upgrade it to the Blaze plan if you want App Hosting.
2. Enable Authentication → Email/Password and Google. Add your domain under Authorized domains (`localhost` has no port).
3. Create a Firestore database and register a web app.
4. Put the web config in `.env.local` and set `NEXT_PUBLIC_USE_EMULATORS=false`.
5. Replace `demo-plot-ledger` in `.firebaserc` with the real project id.
6. Deploy rules only when you are ready:

```bash
npx -y firebase-tools@latest deploy --only firestore:rules,firestore:indexes,auth --project YOUR_PROJECT_ID
```

7. Seed the six people with a one-off Admin SDK script against that project (the included `pnpm seed` command will refuse a non-demo project). The first account to sign in becomes admin if `settings/access` does not exist yet, so sign in before you share the URL. Later admins are added on the People page.
8. For Firebase App Hosting, set the secrets named in `apphosting.yaml` (`FIREBASE_WEB_API_KEY`, `FIREBASE_WEB_APP_ID`), replace `YOUR_PROJECT_ID`, then:

```bash
npx -y firebase-tools@latest apphosting:backends:create --project YOUR_PROJECT_ID
npx -y firebase-tools@latest deploy --only apphosting --project YOUR_PROJECT_ID
```

`NEXT_PUBLIC_*` values are baked in at build time. Set `NEXT_PUBLIC_USE_EMULATORS` to `false` for that build. Do not commit `.env.local`.
