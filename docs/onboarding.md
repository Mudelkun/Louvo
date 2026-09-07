# Onboarding, and why it is not a separate flow

The brief was: ask the user the basic questions — what is your hair type, upload your photo —
then let them browse a catalog filtered to that answer, pick a cut, generate, and offer a
notification for when it is ready. Make it smooth. **Do not put a paywall in it.**

The user-visible flow is six screens:

```
Welcome → Gender → Hair type → Photo → Catalog → The cut → "want a ping?" → the wait → their face
```

Five of those already existed. Most of this document is about what was *not* built.

---

## The rule the whole design sits on

**Onboarding is the app's own flow, walked in a different order. It is not a copy of it.**

The obvious way to build a guided first run is an `app/onboarding/` group: a hair type screen, a
photo screen, a grid of hairstyles, each written to be pretty and to be first. It is the obvious
way because every screen in it can be designed without regard for the rest of the app — and that
is also exactly what is wrong with it.

`CLAUDE.md` opens with the constraint that decides this: **the catalog is data, not code**, and
nothing in `app/` may know the specific set of hairstyles that exists. A second catalog screen is a
second place a hairstyle is rendered, a second resolution of the hair-type variant matrix, a second
answer to what happens when a render is missing and the procedural drawing has to stand in. There
is no version of that which does not drift — and the drift is invisible, because the onboarding
copy is only ever seen by people using the app for the first time, which is the one population that
cannot tell you it looks wrong.

So the guided run reuses the screens. `src/state/OnboardingContext.tsx` holds one boolean, and
exactly three consequences follow from it.

---

## The three things that differ while the run is active

### 1. Every screen says where it is

`<Header>` has taken a `step` prop since phase 1 and drawn a progress bar from it. Before this,
one screen passed one — the style page, hardcoded to `{ current: 5, total: TRY_ON_STEPS }` — so the
app's only progress indicator appeared once, at the end, to a user who had seen no steps 1 through
4 and might well have arrived from the Styles tab.

`step(name)` returns a position during the guided run and `undefined` outside it. That is the
honest state: somebody browsing the catalog on a Tuesday is not on step 4 of anything.
`TRY_ON_STEPS` is deleted, because the step count is now a property of the run and belongs in the
one place the run is described.

### 2. The photo is asked third

The home tab asks for the photograph first and the two questions afterwards. The guided run asks
gender, then hair type, then the photograph.

Both orders are right for their user, which is why both exist:

- **A returning user** knows what the app does. The photograph is the only thing between them and
  a preview, and two questions in front of it are two screens of friction.
- **A first-time user** does not. Gender and hair type decide *which catalog exists* — an afro is
  not a type 1 haircut, and the hair type also picks which render of every surviving style is
  shown — so asking them first is what makes the grid that follows honest. Asking for a face first
  is asking somebody to do the work before being told why.

The photograph is asked for by `<PhotoChooser>` in both places: one drop zone, one camera button,
one sample-photo escape hatch, one sentence about what happens to the file. Two screens asking for
the same thing in two wordings is how a promise about somebody's photograph ends up with two
versions, one of which is out of date.

The order is the *only* difference. `app/try/photo.tsx` adds a line naming the hair type the user
has just declared — "every cut you see next is generated on your coily hair, on your face" — which
is the answer to *why do you want my photograph*, and it can only be stated as a fact here because
two questions have already been answered. The name comes from the catalog, like every other hair
type name in the app.

### 3. Generation ends on the notification, explained

`app/try/notify.tsx` is the one screen that exists only for the guided run.

**It sits after submit, not before.** Pressing *Generate my preview* starts the job; the preview is
already being made while this screen is on. Nothing here delays anything, and it is what makes the
copy true — "your preview is on its way" is a statement about a job with an id, not a promise about
a button.

**Why a screen at all**, when `GenerationContext` already asks at submit and has a good comment
explaining that submit is the honest moment to ask. Because what it asks *with* is the bare system
dialog: one line of the operating system's wording, two buttons, and no room to say anything. This
app sends exactly one kind of notification — the finished preview the user has just spent four
screens asking for — and no re-engagement, no marketing, nothing about anything they did not
personally start. That is worth a sentence, and a sentence needs a screen.

Two mechanisms keep it from being worse than what it replaces:

- **`claimPushPrompt()`** in `src/lib/push.ts`. Without it both fire, and the system dialog appears
  *over* the screen written to introduce it — the one arrangement worse than either alone. The
  claim is held for the whole run and released by `complete()`, and while it is held
  `registerForPreviewPush(true)` quietly downgrades to a silent refresh. `askForPreviewPush()` is
  the one caller that is not downgraded, because it is the screen that has just explained itself.
- **`previewPushAvailability()`**, read at the moment Generate is pressed. It is `unavailable` on
  the web, in Expo Go, in a checkout with no EAS project id and in a build with no API to send
  from, and `granted` for anyone who has already said yes. The step appears for `ask` and nothing
  else — promising a ping in a build that cannot send one would be the exact failure the waiting
  screen is written to avoid, one step earlier.

**Both buttons lead to the same place and neither touches the job.** Declining is a real answer, so
it is a button rather than a smaller, greyer link: somebody who intends to stand and watch their
preview being made does not need a ping, and dressing that up as the wrong choice is how apps train
people to say no to everything.

---

## No paywall

The brief said not to put one in, and nothing had to be added to keep it out — but it is worth
writing down *why* the existing design already satisfies it, because the temptation here is real
and recurring.

`docs/credits.md`: every device gets **two free generations**, held against an install anchor. The
credit gate is one check on the style screen (`canGenerate`) and it sends somebody with an empty
balance to `/credits`. On a first run that check passes, so the guided flow goes from photograph to
finished preview with no price named anywhere in it.

The argument for leaving it that way: somebody who has not yet seen the product cannot value it. A
pack of ten generations shown before the first preview is a number attached to nothing. The second
free generation is the one that sells the first pack, and it can only do that if the first one
happened.

The thing to watch: if the free allowance ever drops to one, or to zero, this flow starts hitting
the paywall *inside* onboarding, at the least persuasive possible moment. That is a product
decision that would need this screen order revisited, not a config change.

---

## The smoothness, and what it is allowed to be

`src/components/Reveal.tsx` is the whole of it: each screen's title, its explanation and its
answers arrive one beat apart — 12 points, 300ms, `Easing.out(cubic)` — instead of all at once.
Arriving together reads as a page that was already there and the eye has to hunt for the
beginning; one beat apart puts the reading order on screen without saying anything.

It is deliberately small. This runs once per screen on five screens, so a longer or larger version
is the same idea turned into something to sit through, five times, by somebody who is trying to get
to a haircut. Under reduce-motion it is the finished frame and nothing else — the same rule the
variant cycle and the skeleton pulse follow, and for the same reason: nobody started this
animation, so the setting is entitled to have it not happen at all.

`Reveal` takes every `<View>` prop so it can *replace* the view it animates rather than wrap one.
That is not tidiness — a wrapper would have moved the `radiogroup` role off the container holding
the radios on the hair type screen, which is an accessibility regression bought with an animation.

The other piece of smoothness is one line of copy. The catalog is the only step of the run whose
next move is not a button, so while the run is active it carries "Tap the cut you want to see on
yourself" and outside it carries nothing.

---

## What the run does not do

- **It does not persist.** `active` is memory-only. Kill the app halfway through and the next
  launch shows the welcome screen again, because the device has genuinely not been onboarded. The
  session's answers go with it, which is `SessionContext`'s existing behaviour and not something
  this feature changed.
- **It does not gate anything.** Skip on the welcome screen marks the device seen and lands on the
  home tab, where the same questions get asked in the home tab's order. Every screen in the run
  keeps its normal back button, and the notification step is the only one that does not — the job
  is already running and both of its buttons lead onwards.
- **It does not ask for anything it does not need.** No email, no account, no name, and no
  notification permission until there is a notification to send. The account exists so purchased
  credits survive a phone (`docs/credits.md`), and there is nothing to survive yet.

---

## One thing that was fixed on the way past

The welcome screen's closing line was "Your photo stays on your device. Nothing is uploaded in this
preview build." That was true of the checkout it was written for and became false the day previews
moved to a server — the worst class of copy there is, a promise that goes stale silently, on the
screen where the user decides whether to hand over their face.

It is read from `generationSource()` now, like the notices in Settings: the server build says the
photograph is sent to make the preview and deleted the moment it is done, and the other two say
nothing is uploaded, because nothing is. `docs/preview-generation.md` is what the server line
summarises.
