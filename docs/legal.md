# The Privacy Policy and the Terms of Use

Two documents, written once, rendered twice, and linked from the four places somebody actually
looks for them. This is the design and the operational detail; the text itself is
[`src/lib/legal.ts`](../src/lib/legal.ts) and is the only copy of it that exists.

## The problem this is arranged around

Both documents have to be in three places at the same time:

- **Inside the app.** The moment anybody reads a privacy policy is the moment they are deciding
  whether to hand over a photograph of their own face. That moment must not depend on a network,
  and a browser hand-off from the paywall is a purchase abandoned.
- **On a public URL.** App Store Connect asks for a privacy policy url on the listing, and the
  Play Console refuses a submission without one. A reviewer has to be able to open it without
  installing anything.
- **Wherever the operator later has to produce them** — a GDPR request, a store appeal.

Three hand-maintained copies of a legal document is three documents, and the one that is wrong is
always the one nobody was looking at. So there is one authored source and two renderers.

## How it is put together

| Piece | What it is |
| --- | --- |
| `src/lib/legal.ts` | **The documents**, as data. The only place either text is written. |
| `app/legal/[doc].tsx` | The app's renderer. `/legal/privacy`, `/legal/terms`. |
| `src/components/LegalLinks.tsx` | The one sentence that links to both, wherever it is needed. |
| `server/src/generated/legal.ts` | The mechanical copy, cut by `sync-shared.mjs`. Never edited. |
| `server/src/legal.ts` | The web renderer: `/privacy`, `/terms`, and `/legal/*` aliases. |

**The source is copied, not mirrored**, and that is the same call `tryOnPrompt.ts` made one step
earlier. Everything else crossing the app/server boundary in this repo is a hand-written mirror
kept honest by a round-trip check, which works for predicates — two implementations of "is this
cut offered for type 4" can be compared by running them. It fails completely for prose: two copies
of a privacy policy that have drifted apart are two different promises about somebody's
photograph, and no test can say which was meant. `npm --prefix server run check` fails if the copy
is stale.

Consequences worth knowing:

- **`src/lib/legal.ts` must stay import-free.** The sync refuses a value import, and a legal
  document that needs the theme in order to be read is a document that cannot be served as a page.
- **There is no markup.** A block is a paragraph, a list, or a set of term/detail rows — the
  largest vocabulary that renders identically in React Native and in HTML with no parser on either
  side. No bold, no inline links, no markdown.
- **Editing the text is editing one file.** Both renderers know three block kinds and nothing
  about any clause, so a new section is prose and nothing else changes.

## Where they are linked

| Place | What it says |
| --- | --- |
| Welcome | "By continuing you agree to…", under the sentence about the photograph |
| Sign-in | "By creating an account…" — reached by people who never saw the welcome screen |
| Credits (the paywall) | "By buying generations…" — required by App Store guideline 3.1.2 |
| Settings → Legal | Both documents as rows, where somebody who goes looking expects them |
| The share landing page | Footer links, because it is a public page of ours |

The links are text inside a sentence rather than a row of buttons: a button under a call to action
competes with it, and small print that looks like small print is read as what it is.

## What the prose is held to

**Every factual sentence in the privacy policy describes something this repository actually
does**, and can be checked against the code that does it — `docs/preview-generation.md` for the
photograph, `docs/credits.md` for the install anchor, `docs/sharing.md` for the funnel,
`server/migrations/` for every column that exists. Nothing in it is aspirational.

That cuts both ways: **a change to the software that makes a sentence here false is a change that
has to edit `src/lib/legal.ts` in the same commit.** The things most likely to do it:

- Adding a column that holds anything about a person, or a new third-party service.
- Changing when the photograph is deleted, or adding a status that does not scrub it — the
  assertion in `check-previews.mjs` is what keeps the policy's central claim true.
- Adding analytics, an advertising SDK, or anything that would make "no tracking" false.
- Changing what a shared link carries.

## Before either store submission

`OPERATOR` (top of `src/lib/legal.ts`) holds the only facts in the file that are not about the
software, and **all of them are unset**:

- **`contactEmail` / `privacyEmail`** — the inbox. Null rather than an address that bounces: a
  document naming an inbox nobody reads is worse than one naming none, because it turns "not set
  up yet" into "ignored you". Every sentence that would have named it says instead that an address
  will be published before release. This is the one that blocks a submission outright — both
  stores require a working support contact, and GDPR and the CCPA both require a route for
  exercising rights that is not "delete the app".
- **`address`** — a registered postal address. Without one, the documents simply do not offer it;
  the "we will give it on request" line appears only once there is an inbox to make the request
  through. A published policy with no postal address does not satisfy a GDPR
  identity-of-the-controller request.
- **`jurisdiction`** — governing law. Without it the clause falls back to a sentence that does not
  pretend to name a court, which is honest and weak. A contract with no governing law is one whose
  disputes are decided by whoever reaches a court first.

Everything degrades to a sentence that is true and visibly incomplete rather than to a plausible
placeholder — deliberately, so nobody ships a document with `[COMPANY NAME]` in it and nobody
mistakes an unfinished document for a finished one. Shipping in that state is a decision, not a
default.

Then, in the store consoles:

- **App Store Connect** → App Privacy → Privacy Policy URL: `https://<host>/privacy`. The
  questionnaire answers are in `docs/store-listing.md` and match this policy.
- **Play Console** → Store listing → Privacy Policy: the same url. Data safety answers, likewise.
- **Terms of Use (EULA)**: `https://<host>/terms`. Apple's standard EULA is the default if none is
  supplied, and it does not describe consumable credits, so the custom one is the right choice
  here. The "If you downloaded Luvo from the App Store" section carries the minimum terms Apple
  requires of a custom EULA — Apple as third-party beneficiary, the warranty refund, the
  export-control confirmation.

`<host>` is whatever serves the API. Once `luvo.app` points at it, both urls are on the domain
already named in `app.json`'s associated domains.
