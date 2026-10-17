# Plot Ledger

A mobile-friendly ledger for a shared plot. Six people — five contributors and one homeowner — record what they paid toward a **₹1.20 crore** target (`₹1,20,00,000`).

Ownership is not split evenly. A contributor's share is:

**their payments ÷ all contributors' payments**

The homeowner's payments are stored, shown in the history, and counted in the total collected. They are excluded from the denominator, and the homeowner's share stays at **0%**. Amounts are stored as integer paise. Percentages use largest-remainder rounding so they add up to exactly 100% when anyone in the contributor pool has paid.

Every account linked to a person on the roster can see every share and the full history, and records **only their own** payments (the pay flow is always "you"). Nobody, including the admin, can add money on someone else's behalf. You can fix or delete your own entry for 24 hours; after that it is permanent. An admin (the first account, then anyone they add) edits the roster and links logins to people. New sign-ups see "Ask the admin to link your account" until they are linked. Every change writes an audit entry.

Gestures: swipe left/right anywhere on a page to move between History, Ledger and People (the bottom-bar pill follows your finger), and pull down from the top of the ledger to open the pay flow.

## Download

Android app (APK): **[latest release](https://github.com/Devil1716/plot-ledger/releases/latest)**. Download the `.apk` from the release assets and open it on your phone (allow installs from your browser when Android asks). iOS builds need a Mac with Xcode; see "Native apps" below.

The Android app keeps itself up to date (it reads `update.json` from the latest release on launch and on resume):

- **Web-only releases** (same `nativeBuild`): the new web bundle (`plot-ledger-web.zip`) downloads in the background, its SHA-256 is checked, and it is applied the next time the app starts ([@capgo/capacitor-updater](https://github.com/Cap-go/capacitor-updater), MPL-2.0, self-hosted: no Capgo cloud, no stats). If the new bundle doesn't boot (it never calls `notifyAppReady()` within 10 s), the app rolls back to the previous one.
- **Native releases** (higher `nativeBuild`): the APK downloads inside the app with a progress bar, is checksum-verified, and Android's installer opens. Android always asks you to tap **Install** for apps that don't come from a store; the first time it also asks you to allow "Install unknown apps" for Plot Ledger. You stay signed in.

## Releasing an update (CI/CD)

GitHub Actions does the building (`.github/workflows/`):

- **CI** (`ci.yml`) runs on every push to `main` and on every pull request: lint, typecheck, unit tests, security-rules tests and the Playwright end-to-end test (both against the Firebase emulators).
- **Release** (`release.yml`) builds the production Android APK, signs it with the same key as the current installs, zips the web bundle, and publishes a GitHub release with `plot-ledger.apk`, `plot-ledger-web.zip` and `update.json`. The APK's versionCode is `nativeBuild` from `package.json`: **bump `nativeBuild` whenever anything under `android/` or a native plugin changes**; leave it alone for web-only changes so they ship over the air.

Start a release in either of two ways:

```bash
# 1. push a version tag
git tag v1.1.0 && git push origin v1.1.0
```

2. **Actions → Release → Run workflow**: choose `patch` / `minor` / `major` (bumps the latest `v*` tag) or type an exact version.

The workflow sets `versionName` from the tag and `versionCode` to `100 + run number`, so every build is newer than the last one.

One-time setup, already done for this repo:

| Name | Kind | Value |
| --- | --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID` | Actions **variables** | Public Firebase web config (same as `.env.production.example`) |
| `PL_KEYSTORE_BASE64` | Actions **secret** | `base64 -w0 <keystore>` of the signing key |
| `PL_KEYSTORE_PASSWORD`, `PL_KEY_ALIAS`, `PL_KEY_PASSWORD` | Actions **secrets** | Keystore password, key alias, key password |
| `FIREBASE_SERVICE_ACCOUNT` | Actions secret, optional | Service-account JSON. If set, each release also deploys `firestore.rules` and indexes; if not, that step is skipped |

```bash
gh variable set NEXT_PUBLIC_FIREBASE_PROJECT_ID --body plot-ledger-ss1017   # etc.
base64 -w0 path/to/key.keystore | gh secret set PL_KEYSTORE_BASE64
gh secret set PL_KEYSTORE_PASSWORD   # prompts for the value
```

Never commit the keystore (`*.jks` and `*.keystore` are gitignored). If the signing key ever changes, Android refuses to install the update over the old app: users would have to uninstall first and sign in again.

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

Sign-in is **Google only**. Against the emulators the login page also shows test buttons that sign in as fake Google accounts (the Auth emulator accepts unsigned Google ID tokens): Ananya (admin, linked), Rohan (member, linked) and Neha (new, waiting for approval). They never appear in production builds.

`pnpm seed` resets the emulators without sample payments. `pnpm seed:demo` loads a full ₹1.20 crore example where Kavita Shah owns 25%. The seed script refuses any project id that does not start with `demo-`.

Auth emulator: [http://127.0.0.1:9199](http://127.0.0.1:9199). Firestore emulator: `127.0.0.1:8180`. Emulator UI: [http://127.0.0.1:4040](http://127.0.0.1:4040).

On the web "Continue with Google" uses a popup; in the Android/iOS app it uses the native Google account picker ([@capacitor-firebase/authentication](https://github.com/capawesome-team/capacitor-firebase), `skipNativeAuth`), and the resulting ID token signs in the Firebase JS SDK. The member's Google name and photo are their profile. Sessions persist until sign-out.

### Joining the group

1. A new member signs in with Google and lands on **Waiting for approval**.
2. The admin opens **People → Waiting for approval** and approves them, either as a new roster person (Google name + photo, contributor or homeowner with 0%) or linked to an existing unlinked person.
3. Their screen opens the ledger by itself. They can record only their own payments and see everyone's.

**First admin:** while the project has no admin (`settings/access` missing), the waiting screen offers a one-time **Claim admin** button; the rules allow exactly one verified Google account to create the admin list, and only while none exists. Claim it right after the first deploy. The admin then approves themself like anyone else to record payments.

## Tests

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm test          # share math, formatting, rounding
pnpm test:rules    # Firestore rules against the emulator
pnpm test:e2e      # Playwright: own-only payments, waiting → approval, swipe tabs + pull to pay
```

Rules and end-to-end tests start the emulators themselves. Java must be on `PATH`.

## Security rules

`firestore.rules` is the source of truth for who can do what. Only Google accounts with a verified email are accepted. An account is *linked* when `users/{uid}.personId` names a person whose `linkedUid` is that uid (both directions). Linked accounts and admins can read people, payments and the audit trail; unlinked accounts cannot. A payment can only be created with `personId` equal to your own linked person and `createdBy` equal to you, with a positive whole-paise amount (max ₹10 Cr) and a sane date; edits and deletes are limited to the creator for 24 hours, and every payment write must carry a matching audit entry in the same batch. Admins (`settings/access.adminUids`) manage the roster, links and admin list, but get no extra payment powers. The first verified Google account can create that admin list (naming only itself) if it does not exist yet; later admins can add others but cannot remove themselves in the same write. User emails are readable by that user and by admins, not by every member. Nothing is world-readable. Review `firestore.rules` before you point this at a real project.

## Plug in a real Firebase project

This repository does not create or deploy a Firebase project.

1. Create a project in the [Firebase console](https://console.firebase.google.com/) and upgrade it to the Blaze plan if you want App Hosting.
2. Enable Authentication → Google (the only provider the rules accept). Add your domain under Authorized domains (`localhost` has no port). For the Android app, add the signing key's SHA-1/SHA-256 to the Android app in Project settings and put its `google-services.json` in `android/app/`.
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

## Native apps (iOS + Android)

The same Next.js code ships as native apps through [Capacitor 8](https://capacitorjs.com/docs). `pnpm build:native` builds a static export (`NEXT_OUTPUT=export` → `out/`) and copies it into `android/` and `ios/`. The app is fully client-side (Firebase Auth + Firestore in the browser, no API routes or middleware), so the static bundle is complete. Cache Components / partial prefetching are switched off for that build only, because static export can't use PPR.

- App id `com.devil1716.plotledger`, name **Plot Ledger** (`capacitor.config.ts`).
- Haptics go through `@capacitor/haptics` in the apps (iOS Taptic Engine; Safari has no `navigator.vibrate`) and fall back to `navigator.vibrate` on the web (`src/lib/native.ts`).
- Edge to edge: Capacitor's bundled SystemBars plugin (`insetsHandling: "css"`) plus `viewport-fit=cover`; the UI pads with `--safe-top` / `--safe-bottom` (globals.css). Splash screen via `@capacitor/splash-screen`, hidden once React paints.
- Icons, splash screens, favicon and the in-app logo all come from the master logo `assets/logo-master.png`: `python3 scripts/make-brand-assets.py assets/logo-master.png && pnpm assets:generate`.

### Android (debug APK)

Needs JDK 21 and the Android SDK (platform 36, build-tools 36) with `ANDROID_HOME` set.

```bash
pnpm emulators            # Firebase emulators on the dev machine
pnpm seed:demo
pnpm android:apk          # → android/app/build/outputs/apk/debug/app-debug.apk
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Inside the Android emulator, `127.0.0.1` is the phone itself, so the app rewrites the emulator host to `10.0.2.2` (the host machine). For a physical phone on the same Wi‑Fi set `NEXT_PUBLIC_ANDROID_EMULATOR_HOST=<your LAN IP>` and start the Firebase emulators with `host: "0.0.0.0"`. Debug builds allow cleartext HTTP only to `10.0.2.2`, `127.0.0.1` and `localhost` (`android/app/src/debug/res/xml/network_security_config.xml`).

### iOS

`ios/` is a ready Xcode project (Swift Package Manager). Building, signing and installing require a Mac with Xcode and an Apple Developer account (a free account can sideload to your own phone for 7 days; App Store / TestFlight needs the paid program). On the Mac: `pnpm install && pnpm build:native && npx cap open ios`, pick your team under Signing & Capabilities, and run. The iOS simulator shares the Mac's loopback, so the emulator host stays `127.0.0.1`.

### Production Firebase project

The released APK talks to the real Firebase project **`plot-ledger-ss1017`** (Spark plan, Firestore in `asia-south1`, Google sign-in). Its public web config is in `.env.production.example` and the Android Firebase config in `android/app/google-services.json` (public client config, not a secret); copy the former to `.env.production` and run `pnpm android:apk:prod` to rebuild the APK against it (`CAP_USE_EMULATORS=false`: HTTPS only, no emulator buttons). No passwords or service accounts are stored in this repository.

### Real phones need a real Firebase project

The demo project only exists inside the local emulators. For the apps to work on real phones away from the dev machine, follow "Plug in a real Firebase project" above, put that config in `.env.local` with `NEXT_PUBLIC_USE_EMULATORS=false`, and build with `CAP_USE_EMULATORS=false pnpm build:native` (turns off cleartext / mixed content). `localhost` must stay in Firebase Auth's authorized domains, because the apps are served from `https://localhost` (Android) and `capacitor://localhost` (iOS). Android release signing is handled by the Release workflow (see above); iOS still needs an Apple distribution certificate.
