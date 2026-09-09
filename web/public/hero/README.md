# The hero's before and after

Drop matched pairs in this directory and the home page's right-hand column
becomes a wipe that plays on its own — one 4.3-second cycle per face, then on to
the next — and hands control to the visitor's cursor whenever it is over the
picture. The row of thumbnails under the frame is an override rather than the way
through, and pressing one pins the set. Until they are here it falls back to three catalogue
plates, which is a weaker hero on purpose — see below.

```
public/hero/before-1.jpg   the original photograph
public/hero/after-1.jpg    the same person, after a Louvo preview
public/hero/before-2.jpg   a second subject
public/hero/after-2.jpg
...
```

Pairs are joined on whatever follows the prefix, so `before-locs.webp` goes with
`after-locs.webp` and a bare `before.jpg` with `after.jpg`. The extension may be
`.jpg`, `.jpeg`, `.png`, `.webp` or `.avif`, and the two halves of a pair do not
have to share one. They are shown in sorted order, so the filename is how the
set is arranged. **A file with no partner is dropped**, rather than wiped against
somebody else's face. Nothing needs importing: `app/page.tsx` reads this
directory during the static render, so adding the files and rebuilding is the
whole job.

Three to five pairs is the useful range, and the reason is the clock rather than
taste. One pair is evidence about one person. But the frame plays on its own at
4.3 seconds a face, so the whole set takes `4.3 x pairs` seconds to come round —
four faces is seventeen seconds, and past five or six the last ones are being
shown to a visitor who left. A dozen is also a gallery, and a visitor stops
reading a gallery as proof.

## What the set has to cover

The wipe is the one thing on the site that answers *will this look like me*, and
the visitor is not the person in the picture — so the set has to make it likely
that one of the faces is near enough theirs to count. Between them the pairs
should cover **both genders** and the **texture range**, type 1 through type 4:
a straight-haired before is evidence about straight hair and nothing else, and
somebody with a tight coil reads it as a promise made to a stranger.

## What each pair has to be

This is also the easiest thing on the site to get subtly wrong.

- **The same face, the same frame.** Both images are drawn `object-cover` inside
  one box, so any difference in crop or aspect reads — under a wipe — as the
  model having moved the head. Generate the *after* from the *before*, then
  export both at the same dimensions. Portrait, close to 4:5, is what the frame
  is shaped for; anything much wider is cropped hard at the sides.
- **The head has to land in the same place, and matching dimensions do not
  guarantee it.** gpt-image re-renders the whole frame rather than editing the
  hair in place, so it returns the background where it found it and the head a
  little to one side of it — `after-3-pixie` came back with the face 5% smaller
  and `after-4-crop` with it 28px to the right, both at exactly the right pixel
  dimensions. Under a wipe that is not read as a haircut, it is read as the face
  moving, which is the one thing this frame exists to prove does not happen. It
  is invisible in a side-by-side and obvious the moment the seam crosses a nose,
  so check it by interleaving the pair in horizontal bands rather than by eye:
  the features run straight through when the pair is aligned and step at every
  band when it is not. A pair that fails is fixed by warping the *after* onto
  the *before* — a smooth displacement field solved from feature matches, which
  is ~zero in the background and carries the head, leaving the transition to
  fall across the hair, the one part of the picture that is meant to differ. A
  single scale-and-shift cannot do it: it fixes the face and breaks the
  background by the same amount. `after-3-pixie` carries that correction;
  `after-4-crop` was measured, left as the model returned it, and is the pair to
  look at first if the hero ever reads as though a face moved.
- **A haircut that is obviously different.** A subtle trim is invisible at hero
  size and makes the product look like it did nothing. A clear change of length
  or shape is the point.
- **A real preview, not a mock-up.** `npm run try-on -- --photo <file> --style
  <id>` from the repo root produces exactly what the product produces. A
  hand-retouched after is a promise the software has to keep afterwards.
- **Permission, in writing.** These are photographs of people on the front page
  of a commercial site. Whoever is in one has to have agreed to that specific
  use, and the file must not be a customer's preview — every generated preview
  belongs to the phone or browser that made it and is deleted from the server
  (`docs/preview-generation.md`). Use photographs the team owns.
- **Small.** These are the first images on the page, and only the first pair is
  in the critical path — the rest are warmed after mount, which is cheap but not
  free. Aim for a 1000px-wide WebP under ~200 KB each; they are served straight
  from `public/` because the catalogue's imagery is deliberately not run through
  `next/image`, so nothing will shrink them for you.

## Why the fallback is worse

`components/home/HeroPlates.tsx` shows three real catalogue renders when these
files are absent. That is honest and it looks fine, but a grid of mannequins
answers *what is in there* — a different question from the one that decides
whether somebody uploads a photograph of their face. Replace it when you can.
