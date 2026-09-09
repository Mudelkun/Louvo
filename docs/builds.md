# Builds

Louvo is an Expo app and was, until now, an *Expo Go* app: `npm start`, scan a QR code, and
the only native code on the phone was whatever Expo Go already shipped. That is over, and this
document is about what replaces it and why.

## Why there is a dev build now

The credit system needs three native modules Expo Go does not contain and cannot be made to:

- **RevenueCat** (`react-native-purchases`) — StoreKit and Play Billing are native APIs. There
  is no managed shim for taking money.
- **Sign in with Apple** and **Google Sign-In** — both are native identity SDKs.
- **`expo-application`** — for the Android `ANDROID_ID` anchor that makes the free-generation
  allowance survive a reinstall.

None of these can be JavaScript. So the app now needs a **development build**: the same Expo
workflow, the same fast refresh, the same `npm start` — but running against a binary compiled
with *this* project's native dependencies rather than against a generic host app.

Nothing about the managed workflow changes otherwise. There is still no `ios/` or `android/`
directory in the repo (both are gitignored); `expo prebuild` generates them on demand and EAS
generates them on its own builders. That is Continuous Native Generation, and it is what keeps
`app.json` the single source of truth for native configuration.

## The profiles

`eas.json`. All four inherit from `base`, which exists only to hold the environment every build
shares.

| Profile | What it is for |
| --- | --- |
| `development` | The daily driver. A dev client — installs on a device, connects to `npm start`, fast-refreshes. Android ships as an APK so it can be sideloaded rather than routed through Play. |
| `simulator` | The same dev client built for the iOS Simulator, which needs a different signing path and no provisioning profile. Separate because `ios.simulator` cannot be toggled per-invocation. |
| `preview` | A *release* build with internal distribution. What a build actually behaves like with the dev-client machinery gone — the profile bugs about timing, minification and release-only native config show up in. |
| `production` | Store builds. AAB for Play, `autoIncrement` on, and the only profile anything is ever submitted from. |

```bash
npm run build:dev       # development, both platforms
npm run build:sim       # iOS Simulator
npm run build:preview
npm run build:prod
npm run build:list      # the last ten builds and their status
```

## Three decisions worth knowing

**`appVersionSource` is `remote`.** EAS holds the build number and increments it, rather than
`app.json` holding it and a human remembering to bump it. The consequence is that
`ios.buildNumber` and `android.versionCode` do not appear in `app.json` at all and should not be
added — a local value and a remote value that disagree is a build that uploads under a version
somebody already used. `version` (`0.1.0`) stays in `app.json`, because the *marketing* version
is a product decision and not a counter.

**A build never carries a generator key.** `base.env` sets `EXPO_PUBLIC_API_URL` and
`EXPO_PUBLIC_SHARE_URL` and deliberately does not set `EXPO_PUBLIC_FAL_KEY`. `EXPO_PUBLIC_*` is
inlined into the bundle at build time, so a key set here would be readable by anyone who
downloads the app — which is exactly the prototype arrangement `docs/preview-generation.md`
exists to have ended. A build therefore always takes the server path, or falls back to
simulation if the API is unreachable. `generationSource()` reports which, as it always has. The
direct-to-fal path remains available from a laptop through `.env.local`, where it belongs.

**There is no `.easignore`, on purpose.** It looks like the obvious way to keep `server/` out of
the upload, and it is a trap: adding an `.easignore` makes EAS stop reading `.gitignore`
entirely, so every rule in there — `node_modules/`, `/ios`, `/android`, `.env` — would have to be
copied across, and the first one anyone forgets ships a secret or a stale native directory to a
builder. The archive is around 13 MB without it. That is not worth the footgun.

Two things to watch if it ever *does* need one. `assets/mannequins/` is nearly empty in a fresh
checkout but is 400 MB once the renders are generated, and CLAUDE.md already flags dropping the
bundled `require()` map as a deletion waiting to happen — do that first and the question goes
away. `server/` carries its own `node_modules`, which `.gitignore` already excludes at any depth.

## What needs an Expo login

Two things, and neither can be scripted from here.

**Linking the project.** `eas init` creates the project on Expo's servers and writes
`extra.eas.projectId` and `owner` into `app.json`. Run it once, from the account the app should
live under:

```bash
npx eas init --account <account>
```

**Credentials.** iOS signing and the Android keystore are generated and held by EAS on the first
build of each platform (`npx eas credentials` to inspect them). Nothing sensitive lands in this
repo — `.gitignore` already refuses `*.p8`, `*.p12`, `*.jks` and `*.mobileprovision`, which is
the belt to that braces.

## Versions

`eas.json` pins `node` to the version this repo develops on, so a builder and a laptop resolve
the same dependency tree.

`eas-cli` is deliberately **not** a dependency of this project. It was, briefly, on the
reasonable theory that pinning the CLI is worth as much as pinning anything else — and
`expo-doctor` fails the project for it outright ("Check for legacy global CLI installed
locally"). A build-readiness check that is permanently red is a check nobody reads, which costs
more than the pin was worth. The version is enforced instead by `cli.version` in `eas.json`,
which is the mechanism Expo intends for it: the CLI refuses to run against this project if it is
older. The `build:*` scripts go through `npx eas-cli`, so nobody needs a global install
either.
