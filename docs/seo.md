# Being found

The web build exists for three reasons — a release is a deploy rather than a submission,
Stripe takes ~3% where the stores take 15-30%, and **fifty-odd named haircuts on indexable
pages are fifty-odd entry points a binary does not have**. `docs/web.md` makes that argument.
This document is what makes the third one true, and it records the decisions rather than the
tag list, which is in the code.

The short version: the site had good metadata and an empty body. Every page that mattered was a
client component reading a context, so the html served to a first-pass crawler was a skeleton —
no heading, no prose, no link to any hairstyle. The fix is not more tags. It is putting the
words and the links in the document, giving the catalogue's own narrowings real urls, and
declaring one canonical per page so a dozen query strings stop competing with each other.

## The defect, measured

Before this work, what a crawler received on its first pass:

| Page | In the html | After hydration |
| --- | --- | --- |
| `/` | nothing but a skeleton | the whole try-on |
| `/styles` | a rail placeholder and eight grey cards | 56 cuts, 56 links |
| `/styles/<id>` | a plate placeholder | the cut's name, its picture, four angles |
| anywhere | no link to any hairstyle | every link |

Google does render JavaScript. It does it on a **second pass**, from a queue it prioritises by
how much it already trusts the domain — which is exactly the wrong deal for a domain with no
history, and it is not the deal at all for Bing, for the social scrapers, or for the answer
engines that are now a real share of this kind of query. A page whose content only exists after
hydration is a page competing with one hand tied.

Nothing was moved out of the browser to fix it. `<StyleDetail>` still owns the plate, the deck,
the two controls and the button that spends a credit; `<CatalogBrowser>` still filters against
memory with no round trip. What changed is that the route beside them fetches the same catalogue
on the server and renders the *words* — which is what `lib/catalogServer.ts` is for.

## The four decisions

### 1. Facets get pages; query strings get canonicals

`/styles` is one url with four controls on it. Move them and the grid narrows instantly, which
is the right interaction and is worth nothing to search: the filters are React state, so there
is no url to rank — and where the answers *do* reach the url (`?gender=`, `?hairType=`,
`?length=`, `?buy=`) they produce a dozen near-identical documents competing for one query.
That is how a catalogue site quietly poisons its own index.

Both halves are addressed:

- **A fixed, small set of narrowings gets real urls** under `/hairstyles/<slug>` — a gender, a
  texture, a category, or a gender with one of those. Each has its own heading, its own copy
  composed from the catalogue's own `tagline` and `description`, its own canonical and its own
  `ItemList`. `lib/collections.ts` is the grammar, and every part of it is catalog data: a
  published category creates its pages. 34 of them exist today.
- **Every other combination canonicalises to the bare path.** `alternates.canonical` on every
  indexable route. The parameters keep working exactly as they did.

`Disallow` was considered for the parameters and rejected. It stops a *crawl* rather than a
duplicate: a blocked url that something links to can still be indexed, now with no content and
no way for us to say what it is a copy of, and the link equity pointing at it is thrown away.
Canonicals consolidate; robots rules discard.

**Thin pages are worse than no pages.** `MIN_STYLES` is the floor — a combination that cannot
fill a page is not enumerated, is not in the sitemap and 404s. A site with thirty auto-generated
pages that each hold three items looks exactly like what it is.

### 2. The words go below the product, never in front of it

The front page's shape is settled and this did not reopen it: the upload box is still the first
thing on `/`, there is still no landing page in front of the try-on, and `/how-it-works` and
`/pricing` are still deleted and redirected. `<HomeSeo>` is *under* the flow, the hero and the
catalogue strip — after everything a visitor came for.

It has to exist because the alternative was a front door containing no sentence a crawler could
read. "Virtual hairstyle try-on", "does it work on curly hair", "do you keep my photo" are the
queries, and a site that answers them nowhere has no claim on them.

The same argument settled the style page. `<StyleDetail>` deliberately has no prose in it, and
that decision stands — a paragraph between the picture and the two controls that change it put
the length slider off the bottom of a phone. The argument was about **position**, not existence.
`<StyleAbout>` restores the description, the "Suits" line and the specification *below the
suggestion shelf*, at the point somebody is either reading or gone. Nothing above the fold moved.

Both blocks are written to be read. The failure mode is a keyword mattress nobody scrolls to,
and the check is whether a person who reached it would learn something true.

### 3. Every factual sentence describes this repository

The same rule `src/lib/legal.ts` is written under, and it is not decoration. The FAQ answers
what happens to a photograph, what the free allowance is and how textures are handled — those
are privacy and pricing claims, and the structured data quotes them verbatim, so a drift is a
drift between what we tell a person and what we tell a crawler. Where each one is enforced:

| The claim | What backs it |
| --- | --- |
| the photograph is deleted when the job settles | the scrub asserted in `server/scripts/check-previews.mjs` |
| two free previews, no account | `install_anchors`, `docs/credits.md` |
| a cut not offered for your texture is removed | the variant matrix, `src/lib/hairTypes.ts` |
| the preview edits your photograph rather than redrawing it | `src/lib/tryOnPrompt.ts` |

**A change that makes one of these false has to edit the FAQ in the same commit.**

The same rule governs the structured data. There is no `offers` node and no `aggregateRating`
anywhere: the price lives in Stripe and this build never sees it, and we have no ratings. Those
are the two most-faked properties in the vocabulary, and both are absent for the same reason the
packs carry no struck-through price. A hairstyle is a `CreativeWork`, not a `Product` — it has
no SKU and no availability, and marking one up to reach for a shopping result would be a lie
about what the page offers.

### 4. No hairstyle name is written down anywhere in it

The constraint the whole codebase runs on, applied to the one place it would have been easiest
to break. `lib/seo.ts`, `lib/collections.ts` and `components/seo/` contain no hairstyle name, no
category name and no hair type name: titles, intros, questions and lists are all composed *from*
catalog rows. Publishing a cut puts it in the sitemap, on a collection page, in an `ItemList` and
in its own FAQ with no release.

The one deliberate exception is the six shelf links in `<HomeSeo>` and the four in the footer.
Those are a **navigation** decision — which doors the front page opens — and every slug in them
is built from a gender or a hair type, both fixed dimensions of the data model rather than rows
somebody can publish.

## The shape of the site

Internal linking was the other half of the defect: before this, nothing linked to a hairstyle
except a client-rendered grid, so the only route to a leaf was the sitemap — which is a hint
about what exists rather than a statement about what matters.

```
/                     → 6 shelves, /hairstyles, /styles
/hairstyles           → 34 collections + every cut by name + FAQ
/hairstyles/<slug>    → its cuts, its sibling collections, the other gender's shelf
/styles               → the interactive grid + every cut as text
/styles/<id>          → its categories, its textures, both genders, 4 suggestions
footer (every page)   → 4 shelves + /hairstyles
```

Every one of those links is in the html.

## What is in the head

- **Canonical** on every indexable route. Never on the layout — metadata is inherited, so a
  canonical there would quietly claim `/` as the canonical of every page that had not overridden
  it, which is the single most destructive thing a site can do to its own index.
- **`max-image-preview: large`**, which is the robots directive that matters most here. The
  product is a picture of a haircut; Google's default is a thumbnail, and `large` is the
  difference between a result that demonstrates what Louvo does and one that describes it.
- **One `@graph` per page.** `Organization`, `WebSite` and `WebApplication` are emitted sitewide
  and referenced by `@id`; each page adds its own `WebPage`/`CollectionPage`, its
  `BreadcrumbList`, and an `ItemList` or a `FAQPage`. Thirty pages each carrying an anonymous
  copy of the same publisher describe thirty unrelated things.
- **`og` and `tw` helpers rather than literal objects.** `openGraph` is **replaced, not merged**:
  a page that declares it to set its own title loses `siteName`, `locale` and the file-based
  image with it, and the failure is silent — the page looks correct and the link posted into a
  chat is a bare grey row. The helpers exist so that cannot happen by omission.
- **`SearchAction` pointing at `/styles?search=`**, which is honest only because
  `<CatalogBrowser>` seeds its box from that parameter. Declaring a search endpoint the site
  ignores is markup describing a page that does not exist.

## The sitemap has the renders in it

103 urls and 64 image entries. The images matter more here than on most sites: "what does a
taper fade look like from the back" is answered by a picture, image search is where that query
lands, and the catalogue is fifty-odd studio shots of exactly that — carried on pages that are
still client-rendered above the fold. An image sitemap is the one thing that puts a render url in
front of a crawler without waiting on a render pass.

One image per entry, the hero render. Listing all four angles would put three urls in front of a
crawler that no page draws above the fold.

## The AI crawlers are allowed

`GPTBot`, `PerplexityBot`, `ClaudeBot` and the rest are not listed in `robots.ts`, so the blanket
rule admits them. Deliberate rather than an omission: a growing share of "which app lets me try a
haircut on my photo" is answered inside an assistant rather than on a results page, and a site
that is not readable there is not in the answer. There is nothing to protect by refusing —
everything they can reach is mannequin renders and authored prose about haircuts. Nothing behind
the try-on is reachable, which is the line that matters: a preview is somebody's face, and
`/studio`, `/looks` and `/s/` are disallowed for every agent.

## What this does not do, and what to do next

- **No content beyond the catalogue.** The pages that will rank for "what haircut suits my face
  shape" are articles, and there are none. That is the next real move and it is writing, not
  configuration.
- **No `hreflang` and one language.** The moment a second locale exists, `alternates.languages`
  and a locale segment are the work, and the collection slugs are English words.
- **`SITE_URL` has to be right in production.** Everything above — canonicals, the sitemap, the
  graph's `@id`s — is built from `NEXT_PUBLIC_SITE_URL`. A deployment that leaves it at the
  Vercel default advertises canonicals on a domain nobody links to. This is the one setting that
  can undo the whole document.
- **The 512px square render as an `og:image`.** It is the right picture and the wrong shape for a
  `summary_large_image` card, which letterboxes it. A composed 1200×630 card per cut — the
  render on the site's own dark ground, with the name set in the display serif — is the
  improvement, and it is `next/og` plus the work already done in `app/opengraph-image.tsx`.
- **Verification is manual.** `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` takes the html-tag token; a
  DNS record is better and does not depend on a deploy. Submitting `/sitemap.xml` in Search
  Console once is still a human step.
