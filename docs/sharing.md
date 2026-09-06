# Sharing, and the referral loop under it

The brief for this feature was not "let the user share their result". It was: **make every
shared result a small advertisement for Luvo, without making the share feel like an ad.**
Those two goals pull in opposite directions, and almost every decision recorded here is where
the line was drawn between them.

The user-visible flow is three taps:

```
Result → Share → Instagram / WhatsApp / Facebook / More → the OS share sheet
```

What travels is a **composed image** and a **caption with a referral link**. What comes back,
when it works, is somebody following that link into the app.

---

## The rule the whole design sits on

**The picture never comes back to us.**

`docs/preview-generation.md` spends a page arranging for the finished preview to live on the
phone that generated it and nowhere else: it is downloaded, the server's copy is deleted, and
the row cannot even name the object any more. A share feature is the single most obvious
reason to undo that — brand the image server-side with `sharp`, which is already a dependency,
and it would take an afternoon.

It is not done, and nothing here uploads an image. The consequences run through every
decision below:

- The branded image is composed **on the device**, by photographing a view.
- A share link names a **hairstyle**, not a picture. The landing page shows the catalog's own
  mannequin render of that cut — a public, CDN-hosted, immutable object that is identical for
  everybody who shared it.
- Nothing that unfurls in somebody else's group chat is a photograph of a Luvo user.

`server/scripts/check-shares.mjs` asserts the last one directly: no local file uri may appear
in a rendered landing page.

---

## The shared image

`src/components/ShareCard.tsx`.

The raw preview is a photograph of somebody with a different haircut. It is a nice picture and
it advertises nothing — shared as-is, the loop does not close. So the card is the same picture
with the smallest amount of Luvo on it that still reads: a wordmark and the cut's name,
bottom-left, over the gradient that was already there to make the bottom edge of a photograph
legible.

The size of that branding is the whole design, and the constraint is one sentence: **the moment
it is big enough to be embarrassing, nobody posts it and the reach is zero.** An ad nobody
sends is worth less than no ad. So: one line, no frame, no border, no watermark tiling, no logo
in the middle, and nothing in the top two thirds where a face is.

**The card takes the photograph's own shape**, clamped between 4:5.5 and square. A fixed 4:5
frame would `cover`-crop a tall selfie, and what a tall selfie loses to a crop is the top of the
head — which is the haircut, which is the subject. Same reasoning as `TRY_ON_IMAGE_SIZE` in
`src/lib/imageSize.ts`, one step further down the pipeline.

### Why a view capture

`src/lib/shareImage.ts` photographs a mounted view with `react-native-view-shot`. Two
alternatives were rejected:

- **Server-side compositing** would mean uploading a finished preview of somebody's face back
  to us, which is the thing above.
- **`expo-image-manipulator`** crops, scales, rotates and flips. It cannot draw a word on an
  image, and there is no other compositor on the device.

The card is laid out at **360 points** and captured at **1080 pixels** — 3x, which is what
Instagram, WhatsApp and Facebook all resample to. Larger is bytes their encoder discards;
smaller is visibly soft. JPEG at 0.92, because every one of those apps re-encodes to JPEG on
arrival and the only thing lossless would buy is a slower upload.

Two mechanical details that each cost a second attempt:

- The capture original is mounted **off the bottom of the window**, not hidden. `display: none`,
  zero opacity and `collapsable` each produce a blank or missing capture on one platform or
  another, because a view that is not being drawn has nothing to photograph.
- The capture waits **one animation frame** after the card mounts. `captureRef` on a view whose
  image has not painted returns the placeholder.

**Web has no capture** — `react-native-view-shot` is native-only — so the web build shares the
preview unbranded. The web build is a development surface (see the note in
`src/lib/deviceId.ts`) and a second compositor for it would not pay for itself.

---

## The buttons, and the honest version of "share to Instagram"

`src/lib/shareTargets.ts`. This is the part where the obvious implementation is a lie.

**What an operating system actually permits.** On both platforms the supported way to send an
image to Instagram, WhatsApp or Facebook is the system share sheet —
`UIActivityViewController` on iOS, the `ACTION_SEND` chooser on Android. Neither can be pointed
at a *specific* app from managed Expo code: iOS has no targeting API at all, and Android's needs
an intent with `setPackage` plus a `FileProvider` grant, which is native code this project does
not have. The URL schemes that look like a way round it are not one — `whatsapp://send?text=`
carries text and no image, and Instagram's story endpoint needs custom pasteboard types.

So the three named buttons are **shortcuts into the sheet**, and the screen says so in a line of
copy. The sheet is where those three apps live, it lists exactly the ones this phone has, and it
is the flow every user already knows. A row of buttons that each opened the same sheet while
*pretending* to be a direct hand-off would be the fake social-sharing buttons the brief rules
out; a row that says "your share sheet opens with the picture and caption ready" is the
platform's real behaviour with a shorter path to it.

`shareTo()` takes the channel, so the day a native intent module is added, Android gets genuine
per-app targeting and nothing above that function changes.

**The caption is what actually differs per platform**, and it is why this is not a one-liner:

| | route | caption |
| --- | --- | --- |
| **iOS** | `Share.share({ message, url })` | travels with the image in one activity; the sheet even reports which app took it |
| **Android** | `Sharing.shareAsync(file)` | `expo-sharing` sends the file alone, so the caption goes to the **clipboard** and the screen says so |
| **Web** | `navigator.share`, else `wa.me` / Facebook sharer | genuinely per-platform, because on the web those intents exist |

The Android clipboard step is the pattern every social app on Android already uses, and
Instagram strips a caption out of a share intent regardless. What it costs is the one asymmetry
in the funnel: on iOS `share_completed` means "an app took it", on Android it means "the sheet
closed". That is a platform limit, and it is written down rather than papered over.

---

## The link

`src/api/share.ts`, `server/src/shares.ts`, `server/src/shareLinks.ts`.

The image gets attention; the caption tells a stranger what to do about it. The caption is:

```
Trying the Textured Crop with Luvo ✂️
Want to see how a haircut looks on you? Try Luvo: https://luvo.app/s/aB3dEf9hJk
```

Two sentences. The first is the sharer talking about their own haircut, which is what their
friends want to look at; the second is the invitation. Longer and it reads as a forward rather
than a post, and a post is the only version of this anybody sends twice.

**The caption is returned by the API and also written in the app.** The one deliberate
duplication in the feature, and it earns itself twice: the server's copy is authoritative when
there is a server, so the wording of the advertisement can be tuned without an app release —
this is the text that decides whether a stranger taps — and the app's copy is what a checkout
with no backend says, because a share with no words is just a photograph.

**A code is ten base62 characters.** Short enough to read out, and 62¹⁰ ≈ 8×10¹⁷ of space, so a
link is not a directory of what other people have generated. Not base64url: a code ends up in a
Play Store `referrer` parameter and in other people's chat clients, and `-` and `_` are the two
characters those mangle.

**One press is one link.** `clientRef` is the look's own id and the insert is
`on conflict (device_id, client_ref) do update`, so pressing Share twice on one result is one
link and one row in the funnel.

**Neither slow thing blocks the user.** The capture and the mint both start when the screen
opens and are `Promise`s the buttons `await` — so a user who looks at their picture for two
seconds waits for nothing, and an impatient one waits for the shorter of the two rather than
both. Neither failure stops a share: a card that could not be composed sends the raw preview, a
link that could not be minted sends the caption without one, and both are recorded as
`share_failed`.

---

## The landing page

`server/src/landing.ts`, served at `GET /s/:code`. One HTML document, no build step, no
framework, no assets of its own — the one image on it is a catalog render already on the CDN and
the one font is the system's. The brief asked not to add infrastructure unless it was genuinely
necessary, and the honest answer is that none is: `POST /v1/shares` is an insert and
`GET /s/:code` is a select plus a counter.

It has two audiences that want different things:

**A scraper.** WhatsApp, Facebook, iMessage and Slack all fetch the url and render a card from
its Open Graph tags before any human sees it, with **no JavaScript**. So the title, the
description and `og:image` are in the markup — and `og:image` is the cut's mannequin render, for
the reason at the top of this document.

**A person.** Who either has the app, in which case the page's job is to get out of the way, or
does not, in which case it is to be a small clear advertisement with one button.

The redirect is done carefully because the failure modes are platform-specific. The deep link is
fired once, immediately, and a timer sends the browser to the store shortly after **unless the
page was backgrounded** — `document.hidden` is the one observable signal that the app opened.
iOS shows an error dialogue if the scheme navigation is mishandled; Android's Chrome ignores an
unknown scheme silently.

Universal links are the better mechanism and are configured separately: `app.json` carries the
`associatedDomains` and Android intent filter, and the server serves both association files —
but **only when the ids are set**. An `apple-app-site-association` naming a team id that is not
ours is worse than none, because iOS caches it.

A code that does not resolve still gets a page with the same download button. Somebody arriving
from a friend's message is the most qualified visitor this server ever receives, and a 404
spends that on nothing.

---

## The funnel

Nine events, `share_events` and three counters on `share_links`. There is no analytics vendor
and no plan for one: the questions this feature has to answer are four group-bys.

| event | fired |
| --- | --- |
| `share_opened` | the share screen opened on a finished look |
| `share_channel_selected` | a platform was picked (and lands on the link's own `channel` column) |
| `share_initiated` | the image and caption were handed to the OS |
| `share_completed` | the OS reported it went somewhere — iOS also says where |
| `share_dismissed` | the sheet was backed out of. A decision, not a failure |
| `share_failed` | compose, mint or hand-off failed |
| `share_link_opened` | the landing page was reached, **or** the app was opened by the link |
| `share_install_attributed` | a device arrived on a link it had never been attributed to |
| `share_signup_attributed` | that device became an account. Nothing writes it yet |

**Counters on the row, detail in the log.** `share_links.opens` is incremented in the same
statement that stamps `last_opened_at`, because the landing page is the hot path and the
headline number should not be a `count(*)` over an append-only log.

**The client never blocks on analytics.** `src/lib/analytics.ts` batches — one share is four
events in about eight seconds, and four round trips up a phone's uplink to record four rows
would cost more than the feature does — and flushes on the timer or when the app backgrounds,
which is exactly what a share *is*. Everything swallows its own errors. A failed analytics call
that could be seen by the user would be worse than no analytics at all.

**Unknown event names are dropped and counted, not rejected.** A client one release ahead of the
server must not fail to share because it learned a new name.

### What is honestly attributable, and what is not

This is where overclaiming is most tempting, so, exactly:

- **App installed, link followed.** Fully attributable. The OS routes the url into the app, the
  code arrives, the device reports it. `source: 'deep_link'` — the only source anything writes
  today.
- **Android, installed from the Play listing.** Attributable in principle: the landing page's
  Play url carries the code in `referrer`, Google preserves it through the install, and the
  Install Referrer API hands it over on first run. **Reading it needs a native module this
  project does not have**, so nothing reports it. The `referrer` source and the query parameter
  exist for the day one is added.
- **iOS, installed from the App Store.** Not attributable without a third-party attribution SDK.
  There is no deferred deep link on iOS that does not involve one, and no amount of code here
  changes that. The funnel counts an iOS install only if the person later opens another share
  link. That gap is known, not a bug.

**First link wins, permanently.** `share_attributions` is one row per device, written with
`insert ... where not exists`, so a user who later opens a friend's link does not move the credit
away from whoever actually brought them in. A sharer opening their own link is refused outright —
counting it would make the funnel a measure of curiosity rather than of reach, and it is the
single easiest number here to inflate by accident while testing.

The device also remembers the first code it saw (`src/lib/referral.ts`), which is not the
mechanism — the server enforces it independently — but keeps a user who opens six links from
making six requests to be told no five times.

**Signup has a seam and no caller.** There are no accounts. `attributeSignup()` and
`reportSignupFromReferral()` are one statement and one function, present because the alternative
is a schema change, a route and a client call all landing on the day accounts do.

---

## What is checked

`server/scripts/check-shares.mjs`, in `npm --prefix server run check`. It runs the real
migrations and the real SQL against `pg-mem` and the real page renderer against its own output —
no database, no credentials, no network. Three classes of failure, none of which throws when it
breaks:

- **A funnel that double-counts** — a retried create minting a second code, a self-share counted
  as an install, a repeat arrival counted twice.
- **A card that does not unfurl** — the OG tags missing from the markup, or the image being
  anything other than the catalog's render.
- **Attribution that drifts** — a second link moving the credit.

Plus the two that are cheap and would be miserable to find in production: a hairstyle name
cannot inject markup into the landing page, and a share code cannot be a path traversal.

---

## Configuration

Everything is optional and everything degrades to something honest. `SHARE_BASE_URL`,
`APP_SCHEME`, `IOS_APP_STORE_URL`, `ANDROID_PLAY_URL`, `IOS_APP_ID`, `IOS_TEAM_ID`,
`ANDROID_SHA256_FINGERPRINTS` — see `server/.env.example`.

On the app side, `EXPO_PUBLIC_API_URL` is what makes links real; `EXPO_PUBLIC_SHARE_URL` is the
static fallback for a build with no backend. Settings reports which of the two happened, in the
same voice it reports the catalog's source and the generator's.

## What is left

- **Direct per-app targeting on Android**, behind a native intent module. `shareTo()` is the
  seam and nothing above it changes.
- **Instagram Stories**, which needs custom pasteboard types on iOS and story-specific intent
  extras on Android. Both are native.
- **The Play install referrer**, which is the one genuinely missing piece of attribution and is
  a native module plus a call to `reportAttribution(code, 'referrer')`.
- **A quota.** `POST /v1/shares` and `POST /v1/events` are device-authenticated and unmetered.
  Neither costs money the way a generation does, but both are writes, and the same per-device
  limit the preview queue still needs applies here.
