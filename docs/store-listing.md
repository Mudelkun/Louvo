# App Store listing

Copy for App Store Connect, with Apple's character limits noted. Every claim here is checked
against what the app actually does — see the *Claims* section at the bottom for the two that need
watching.

---

## Name — 30 characters

```
Luvo
```

Four characters, and almost certainly contested. If it is taken, the fallback keeps the brand
first because that is the half that survives truncation in search results:

```
Luvo: Hairstyle Try-On
```

The home-screen name stays `Luvo` either way — that comes from `app.json`, not from this field.

## Subtitle — 30 characters

```
Try any haircut on your photo
```

29 characters. It is the line under the name in search, so it says what the app *does* rather
than how good it is.

## Promotional text — 170 characters

Editable without shipping a new version, so this is the field to change for a campaign.

```
Two free previews to start. See any haircut on your own face before you sit in the chair — then show your barber the picture instead of describing it.
```

## Description — 4000 characters

```
See how a haircut looks on you before you sit in the chair.

Luvo puts any hairstyle from its catalog onto your own photo, so you can decide with a picture instead of a description — and show your barber exactly what you mean.

HOW IT WORKS
• Take a selfie, or pick a photo you already have
• Tell Luvo what your hair does — straight, wavy, curly or coily
• Browse the catalog: short cuts, fades, medium and long, braids and updos, locs and twists
• Generate a preview of yourself with that cut
• Wipe between before and after, save it, share it

BROWSE THE CUT, NOT THE MODEL
Every hairstyle is shown on a neutral, faceless mannequin — no face, no ethnicity, nobody to compare yourself against. The only thing on screen is the haircut, lit and shot the same way every time, so two styles side by side differ by the cut and nothing else.

BUILT AROUND YOUR HAIR TYPE
A cut does not fall the same way on straight hair as on coily hair, and some cuts are not offered for some types at all. Tell Luvo your hair type and the catalog shows you the version that applies to you — not a stock photo of somebody whose hair does something different.

YOUR PHOTO STAYS YOURS
Your photo is sent once, used to make your preview, and deleted the moment it is made. The finished preview is downloaded to your phone and removed from our servers — it lives on your device until you delete it. Nothing is posted anywhere, and your photo is never shared, sold, or used to train anything.

PAY FOR WHAT YOU USE
Your first two previews are free. After that, generations come in packs of 5, 10 or 20. No subscription, nothing recurring, and generations never expire. If a generation fails, the credit goes straight back to you.
```

## Keywords — 100 characters, comma-separated

```
haircut,hair,barber,salon,tryon,makeover,fade,braids,curly,coily,mens,womens,virtual,style,preview
```

Apple already indexes the name and subtitle, so "hairstyle" and "photo" are deliberately absent —
repeating them here would spend characters on words that are already searchable.

---

## In-app purchases

Each product needs a display name (30) and a description (45). These are shown on the App Store
listing and in the purchase sheet.

| Product ID | Display name | Description |
| --- | --- | --- |
| `com.luvoai.luvo.credits.5` | `5 Generations` | `Five hairstyle previews on your photo` |
| `com.luvoai.luvo.credits.10` | `10 Generations` | `Ten hairstyle previews on your photo` |
| `com.luvoai.luvo.credits.20` | `20 Generations` | `Twenty previews, at the best rate` |

Nothing here says "$0.75 each" or names a saving. Prices are Apple's to display and they change by
storefront; a saving written into a description is a claim that is wrong in half the world's
currencies. The per-generation figure is computed from the store's own price on the paywall
instead, which is why it is always right.

## Review notes

Reviewers reject AI photo apps they do not understand, so say it plainly in the notes field:

```
Luvo generates a preview of the user's own photo with a different hairstyle, using a
third-party image model (fal.ai).

- The user's photo is uploaded to a private bucket, passed to the model once, and deleted as
  soon as the preview is produced. It is never stored, never public, and never used for
  training.
- The finished preview is downloaded to the device and deleted from our servers.
- No account is required to use the app. Two previews are free per device.
- An account (Sign in with Apple, or email) is required only to purchase additional
  generations, so that purchased credits survive a change of phone.
- Account deletion is in Settings > Account > Delete my account, and is a real deletion.

To test purchases, generate twice to exhaust the free allowance, then tap through to the
paywall. Sandbox purchases grant credits normally.
```

## Privacy Policy and Terms of Use

Both are served by the API and both are required before either submission:

- Privacy Policy URL: `https://<host>/privacy`
- Terms of Use (custom EULA): `https://<host>/terms`

The text is authored once in `src/lib/legal.ts`, rendered as screens in the app under Settings >
Legal, and rendered as those two pages by the server. `docs/legal.md` has the design and the
`OPERATOR` fields that must be filled in before submitting — a support inbox, a registered address
and a governing law are all unset, and the documents currently say so rather than inventing them.
The inbox is the blocking one: both stores require a contact that works.

## App Privacy questionnaire

The precise, true answers are in `docs/preview-generation.md`, and the user-facing statement of
the same facts is the Privacy Policy above. In summary:

- **Photos** — collected, **not** linked to identity, **not** used for tracking. Purpose: App
  Functionality. Say it is collected: it does leave the device, briefly, and claiming otherwise
  would be false.
- **Email address** — collected, linked to identity, App Functionality. Only for accounts.
- **Purchase history** — collected, linked to identity, App Functionality.
- **Identifiers** — a device identifier is collected, linked to the account once one exists, and
  **not** used for tracking. This is the install anchor; see `docs/credits.md`.
- **Tracking** — none. There is no advertising SDK and no data leaves for any third party's
  purposes.

---

## Claims that need watching

Two things in the description are true of the *app* and depend on the *catalog* being finished.

**"Browse the catalog"** deliberately does not name a number. There are 56 authored hairstyles,
but renders exist only for part of the matrix — the rest fall back to the procedural silhouette,
which is a line drawing. A description promising "56 styles" against a grid where many are
drawings is the kind of gap a reviewer notices and a user resents. **Check how much of the grid is
rendered before submitting**, and if it is thin, that is a reason to delay the listing rather than
to soften the copy.

**"Never used to train anything"** is true of our pipeline and is a claim about a third party's
behaviour too. Confirm it against fal.ai's current data-use terms before submitting; if their
terms do not support it, the sentence has to go.
