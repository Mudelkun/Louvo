import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { hairTypesFor } from '@/api/client';
import type { Gender, HairLengthId, HairTypeId, Hairstyle, TryOnOptions } from '@/api/types';
import { Button } from '@/components/Button';
import { ControlCard } from '@/components/ControlCard';
import { FavouriteHeart } from '@/components/FavouriteHeart';
import { EmptyState } from '@/components/Feedback';
import { HairTypeChoice } from '@/components/HairTypeChoice';
import { LengthChoice } from '@/components/LengthChoice';
import { Mannequin } from '@/components/Mannequin';
import { PhotoFrame } from '@/components/PhotoFrame';
import { Header, Screen } from '@/components/Screen';
import { StyleScreenSkeleton } from '@/components/StyleScreenSkeleton';
import { VariantCrossfade } from '@/components/VariantCrossfade';
import { useHairColor } from '@/hooks/useHairColor';
import { usePhotoPicker } from '@/hooks/usePhotoPicker';
import { useVariantCycle } from '@/hooks/useVariantCycle';
import { DEMO_BASE_SHAPE, DEMO_PHOTO, TRY_ON_STEPS } from '@/lib/constants';
import { HERO_ANGLE, VIEW_ANGLES, type ViewAngle } from '@/lib/hairShape';
import {
  defaultLength,
  hairLengthsFor,
  lengthsFor,
  parseLengthParam,
} from '@/lib/hairLengths';
import {
  HAIR_TYPE_IDS,
  parseHairType,
  textureFor,
  typesForVariant,
  variantCandidates,
  variantsOf,
} from '@/lib/hairTypes';
import { preloadVariants } from '@/lib/mannequinPreload';
import { renderedVariants, renderLength, renderVariant } from '@/lib/mannequinRender';
import { HERO_ART, HERO_PAGE, THUMB_HEIGHT, THUMB_WIDTH } from '@/lib/styleLayout';
import { useCatalog } from '@/state/CatalogContext';
import { useGeneration } from '@/state/GenerationContext';
import { useLibrary } from '@/state/LibraryContext';
import { useSession } from '@/state/SessionContext';
import { makeStyles, onPlateAccent, onPlateMuted, plate, radii, spacing, useColors, type } from '@/theme/theme';


/** Caption on the tile, and the longer label a screen reader announces. */
const ANGLE_LABELS: Record<ViewAngle, { short: string; long: string }> = {
  front: { short: 'Front', long: 'Front view' },
  half: { short: 'Half', long: 'Half-side view' },
  side: { short: 'Side', long: '90 degree side view' },
  back: { short: 'Back', long: 'Back view' },
};

/** A gender that arrived as a route param, or undefined for anything else. */
function parseGender(value: string | string[] | undefined): Gender | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === 'male' || raw === 'female' ? raw : null;
}

/**
 * Which hair type to open the preview control on when the user arrived without
 * declaring one — an unfiltered grid, a deep link, a saved look.
 *
 * The control used to carry an "All types" entry for this case. As a *display*
 * choice it said nothing the types themselves do not: it only meant "whichever
 * render of this cut exists", which is a fact about what has been generated
 * rather than an answer about hair. So the opening tile is a real type, picked
 * as the one standing behind the image the grid card just showed — resolve the
 * card's own render and name the first type it stands in for, so the detail
 * screen never disagrees with the card that opened it. A style with no render
 * yet opens on the first type it is offered for.
 */
function openingType(hairstyle: Hairstyle, gender: Gender | null): HairTypeId | null {
  const shown = renderVariant(
    hairstyle.id,
    gender,
    HERO_ANGLE,
    variantCandidates(hairstyle, null),
  );
  const fromRender = shown ? typesForVariant(hairstyle, shown)[0] : undefined;
  return fromRender ?? HAIR_TYPE_IDS.find((entry) => hairstyle.variants[entry]) ?? null;
}

/**
 * Step 5 — the last stop before generation: the style from four angles, the
 * photo it goes on, and the generate button. Nothing about the cut is
 * adjustable; the cut is the product.
 */
export default function StyleDetailScreen() {
  const styles = useStyles();
  const colors = useColors();
  const router = useRouter();
  const { id, hairType, gender: browsedGender, length: askedLength } = useLocalSearchParams<{
    id: string;
    hairType?: string;
    gender?: string;
    length?: string;
  }>();
  const { styleById, hairTypes, hairLengths, loading } = useCatalog();
  const { isFavourite, toggleFavourite } = useLibrary();
  const { gender: sessionGender, hairTypeId, photoUri, setPhoto, setHairstyle } = useSession();
  /**
   * Which gender's version of this cut the screen is about.
   *
   * It arrives on the tap, exactly as the browsed hair type does, and for the
   * same reason: the Styles tab browses a gender locally and never writes it to
   * the session, so following the session here showed the men's render of every
   * cut tapped in the women's grid — the catalog is shot per gender, so that is
   * a different haircut, not a different model. Reached without the param (the
   * try-on flow, a deep link, a favourite) it is the session's, which is what
   * that route means by gender anyway.
   *
   * Unlike the hair type this is *not* display-only: it picks the render the
   * generator is handed as its reference, so a women's cut has to generate from
   * the women's mannequin. See `generate()`.
   */
  const gender = parseGender(browsedGender) ?? sessionGender;
  // The shade every mannequin is drawn in. There is no colour picker at the
  // moment, so this is the shade the catalog was rendered in for everyone —
  // the grade is an identity and the renders are shown untouched. Bringing the
  // choice back is a `<SwatchRow>` bound to `setColor`; nothing below changes.
  const color = useHairColor();
  const { start } = useGeneration();
  // Arriving here from the Styles tab skips the photo step, so the photo is
  // picked on this screen rather than sending the user back through the flow.
  const { pickFromLibrary, takePhoto, busy } = usePhotoPicker(setPhoto);

  const hairstyle = styleById(id);
  const [angle, setAngle] = useState<ViewAngle>(HERO_ANGLE);
  /**
   * Which hair type the mannequin is being shown on, and only a preview:
   * switching it here compares the cut across textures without changing what
   * the rest of the app thinks the user's hair does. The generated look uses
   * the session's type, not this.
   *
   * It opens on whatever the grid was filtered to, which arrives on the tap —
   * the Styles tab browses a hair type locally and never writes it to the
   * session, so following the session here would land on a different texture
   * than the card the user just pressed. Browsed with no type declared it is
   * null and `openingType()` picks the tile; reached without the param at all
   * (a deep link, a saved look) it falls back to the session's type.
   */
  const browsedAs = parseHairType(hairType);
  const [preview, setPreview] = useState<HairTypeId | null>(
    browsedAs === undefined ? hairTypeId : browsedAs,
  );
  /**
   * How long the cut is being shown, and — like `preview` — only on this screen.
   *
   * Null until the user moves the slider — or until one arrives on the route,
   * which is the same choice made on a screen they were already standing on. It
   * is not the same as "medium": null means *untouched*, and the two have to be
   * distinguishable because untouched is what lets the hero keep cycling and
   * what keeps `options` free of a length the user never chose. The slider still
   * shows a position while it is null — `defaultLength()` supplies the anchor —
   * so there is no unset state on screen, only in the data.
   */
  const [length, setLength] = useState<HairLengthId | null>(parseLengthParam(askedLength));
  /**
   * The length above, but only once this cut is actually offered at it.
   *
   * The state starts from a route param now — the result screen's tag carries
   * the length its preview was generated at, so reopening a look lands on the
   * cut as that look wears it rather than back at the anchor — and a param is
   * the one source that can name a stop this cut has no slider position for: a
   * deep link, or a look whose gender differs from the one being browsed, since
   * the length row is per gender. Validating here rather than in the initializer
   * is the same shape `shownAs` uses for `preview` one control up, and for the
   * same reason: the catalog may still be loading on first render, so there is
   * nothing to check the param against yet.
   */
  const chosenLength =
    length && hairstyle && lengthsFor(hairstyle, gender).includes(length) ? length : null;
  /**
   * What the drawing is adjusted by, and nothing until the slider is touched.
   *
   * `effectiveShape()` leaves the anchor alone, so passing the resolved default
   * here would be a no-op that allocated a new object on every render and busted
   * the memo behind eight mannequins. Undefined until there is an actual choice
   * is both cheaper and more honest.
   */
  const lengthOptions = useMemo<TryOnOptions | undefined>(
    () => (chosenLength ? { length: chosenLength } : undefined),
    [chosenLength],
  );
  const pager = useRef<ScrollView>(null);
  /** The pager starts on `HERO_ANGLE`, which is not page 0 — set once, on first layout. */
  const positioned = useRef(false);

  /**
   * With nothing declared, the hero walks this cut's renders exactly as the card
   * that opened it does — the same beat, so a screen reached from a cycling grid
   * carries on rather than freezing on one texture.
   *
   * Untouched is the whole condition, and there are two ways to touch this cut
   * now: `preview` for the hair type, `length` for the slider. Either one being
   * set stops the cycle there and then, because a choice outranks a
   * demonstration — and that holds for the slider even though length is not what
   * the cycle is cycling. A user dragging a length slider is deliberately
   * working on this cut, and a hero that kept swapping texture underneath them
   * would be answering a question they had stopped asking. Neither control is
   * bypassed by any of this: the hair-type row is how the cycle is *read*, since
   * the selected tile follows what the hero has arrived at.
   *
   * The set comes from `HERO_ANGLE`, like the card's, rather than from the page
   * on screen: all four views of a style are shot in one sheet, so a variant that
   * exists at the hero angle exists at the others, and picking the set per page
   * would let a swipe change how many renders the cut appears to have.
   */
  const cycle = useVariantCycle(
    hairstyle && preview == null && chosenLength == null
      ? renderedVariants(hairstyle.id, gender, HERO_ANGLE, variantCandidates(hairstyle, null))
      : [],
  );

  /**
   * Every render this cut has, fetched while the user is still reading the
   * hair-type row.
   *
   * One tap there changes what eight mannequins are drawing at once — four pager
   * pages and four thumbnails, each a render with a mask over it — and none of
   * those images had been asked for before the tap. Nothing here is slow to
   * decide; the files simply were not loaded yet, and the old texture stayed on
   * screen until they were. Warming them on arrival turns the tap into a swap.
   *
   * All variants rather than the neighbouring one: the types are a row and any
   * of them can be next. It is bounded by the matrix — four renders at the very
   * most, usually two — and `preloadVariants` fetches each source once per
   * process, so backing out and opening the style again costs nothing.
   */
  useEffect(() => {
    if (hairstyle) preloadVariants(hairstyle.id, gender, variantsOf(hairstyle));
  }, [hairstyle, gender]);

  if (loading && !hairstyle) {
    return (
      // Unpadded like the screen it stands in for: the hero and the cards carry
      // their own margins, and a second inset would move every one of them.
      <Screen padded={false}>
        <Header step={{ current: 5, total: TRY_ON_STEPS }} />
        {/* The screen that is coming, with its content not yet in it — rather
            than a spinner on an empty page that then reflows into this. */}
        <StyleScreenSkeleton />
      </Screen>
    );
  }

  if (!hairstyle) {
    return (
      <Screen>
        <Header title="Style" />
        <EmptyState
          icon="alert-circle-outline"
          title="That style is not in the catalog"
          body="It may have been removed. Browse the catalog to find something similar."
          actionLabel="Browse styles"
          onAction={() => router.replace('/(tabs)/styles')}
        />
      </Screen>
    );
  }

  const favourite = isFavourite(hairstyle.id);
  // The types this cut is actually offered for, and the renders behind them.
  const offered = HAIR_TYPE_IDS.filter((entry) => hairstyle.variants[entry]);
  /**
   * The render the screen has *arrived* at — the outgoing one for as long as a
   * dissolve is running, since mid-fade neither is yet the image.
   *
   * Everything that is not the hero's top layer reads from this: the selected
   * tile, the thumbnails, the fallback drawing's texture, and the type the
   * generation is told about. So one thing moves and the rest of the screen
   * changes over when it has finished moving, rather than a tile lighting up
   * under "Coily" while the picture above it is still mostly curly.
   */
  const arrivedAt = cycle.previous ?? cycle.current;
  // Always a type: one tile is selected even when the user declared nothing on
  // the way in — the cut's own first type at rest, and whichever the cycle is on
  // while it runs.
  const shownAs =
    (preview && hairstyle.variants[preview] ? preview : null) ??
    (arrivedAt ? typesForVariant(hairstyle, arrivedAt).at(0) : null) ??
    openingType(hairstyle, gender);
  const variants = variantCandidates(hairstyle, shownAs);
  const shape = { ...hairstyle.shape, texture: textureFor(hairstyle, shownAs) };
  /**
   * The length positions this cut is offered at for this gender, and the one the
   * slider is sitting on.
   *
   * Empty for most of the catalog — length is a per-style judgement and most cuts
   * have no useful range (see `HairLengthOffer`) — so the control is absent far
   * more often than it is present, exactly like the hair-type row above it on a
   * single-render cut. Gendered, because the row is: the men's and women's
   * readings of one cut do not travel the same distance.
   */
  const lengthEntries = hairLengthsFor(hairLengths, lengthsFor(hairstyle, gender));
  const shownLength = chosenLength ?? defaultLength(hairstyle, gender);
  /**
   * The one thing that is true of this cut's length row and cannot be seen in
   * it — the same job `typeNote` does for the row above, and raised for the same
   * reason.
   *
   * Length moves the procedural drawing, because `effectiveShape()` has always
   * known how to shorten and lengthen a silhouette. It cannot move a *render*
   * that has not been shot: a stop with no render of its own falls back to the
   * anchor (`lengthOrder()` in mannequinRender.ts), so the picture stays put
   * while the control says it moved. A control that appears not to respond is
   * the failure this app has already decided is worth a line of copy.
   *
   * The test is the resolved length against the asked-for one rather than
   * anything about which lengths happen to be generated today, so the line
   * appears per stop — a cut shot short but not long says nothing on Short and
   * says this on Long — and disappears on its own as the renders land, with
   * nothing here to remove.
   *
   * Scoped to the hero rather than to the page on screen for the same reason the
   * cycle's set is: every angle of one length comes out of a single sheet, so a
   * length that exists at the hero angle exists at the others.
   */
  const resolvedLength = shownLength
    ? renderLength(hairstyle.id, gender, HERO_ANGLE, variants, shownLength)
    : null;
  const lengthNote =
    resolvedLength && resolvedLength !== shownLength
      ? 'This cut has not been rendered at that length yet.'
      : null;
  /**
   * Every hair type the catalog has, in its own order — not just this cut's.
   * The control shows the full set and dims what this cut is not offered for,
   * so the row is the same four answers on every style. See `<HairTypeChoice>`.
   */
  const hairTypeEntries = hairTypesFor(hairTypes);
  /**
   * The one thing that is true of *this* cut's row and cannot be seen in it.
   *
   * A cut with a single render across several types does not change when the
   * selection moves, which looks broken unless it is said; and a dimmed tile
   * needs a reason. Both at once reads as an apology, so the more surprising
   * one wins — a control that appears not to respond outranks an option that is
   * visibly unavailable.
   */
  const typeNote =
    variantsOf(hairstyle).length === 1
      ? 'This cut looks the same on every hair type.'
      : offered.length < hairTypeEntries.length
        ? 'Dimmed types are not offered for this cut.'
        : null;

  const scrollToAngle = (next: ViewAngle, animated: boolean) =>
    pager.current?.scrollTo({ x: VIEW_ANGLES.indexOf(next) * HERO_PAGE, y: 0, animated });

  /** Tapping a thumbnail drives the same pager a swipe does, so the two never disagree. */
  const goToAngle = (next: ViewAngle) => {
    setAngle(next);
    scrollToAngle(next, true);
  };

  const onPagerSettle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / HERO_PAGE);
    const next = VIEW_ANGLES[Math.min(Math.max(index, 0), VIEW_ANGLES.length - 1)];
    if (next !== angle) setAngle(next);
  };

  const positionPager = () => {
    if (positioned.current) return;
    positioned.current = true;
    scrollToAngle(angle, false);
  };

  /**
   * Generation still runs in the background — nothing about the job changes —
   * but the user is taken to the wait rather than past it. `start()` returns the
   * job id and `/try/generating` adopts it, so the screen is a view onto a job
   * that would run identically if the user walked away. See that screen for why
   * the old straight-to-Profile jump was the wrong ending to this flow.
   *
   * Pushed rather than replaced: cancelling or backing out lands here again, on
   * the style the user picked, and the result screen replaces the wait so Back
   * from the result skips it.
   */
  const generate = () => {
    // The colour still goes onto the look rather than being left implicit: a
    // saved look has to keep the shade its *mannequin* is drawn in, whether the
    // user chose it or it is the catalog default.
    //
    // It is deliberately not passed to the generator. `GenerateRequest.hairColor`
    // is the field for that and it stays unset while there is no colour picker,
    // so the preview keeps the subject's own hair colour instead of putting
    // everyone in the catalog's display default. See the note on that field.
    //
    // The length goes on for a different reason than the colour: it is a choice
    // about the *cut*, so a saved look has to keep the length it was made at or
    // "Long Layers" in the library stops meaning anything in particular. It is
    // recorded whenever the cut offers a range, chosen or defaulted, since the
    // anchor is as much a position as the other two.
    //
    // It is not passed to the generator either, and for a sharper reason than
    // the colour is not: there are no length renders yet. The reference the
    // model is handed is the cut at its anchor length, and telling it "long" in
    // words while showing it a medium reference is the disagreement the prompt
    // exists to avoid. Wiring that up is a change to `tryOnPrompt.ts` and waits
    // on the imagery.
    const options = {
      ...(color ? { color: color.id } : null),
      ...(shownLength ? { length: shownLength } : null),
    };
    setHairstyle(hairstyle.id, options);
    const jobId = start({
      hairstyle,
      gender: gender ?? hairstyle.genders[0],
      // The session's declaration, and `shownAs` only when there is none. Under
      // "All Types" nothing was declared, so the type the screen is currently
      // showing is the closest thing to a choice — and, more to the point, it is
      // the texture the reference images the generator is about to be handed
      // actually depict. Falling through to null there would let the model be
      // shown a curly reference and told nothing about texture at all.
      //
      // While the hero is cycling that means the render the screen has arrived
      // at, so pressing Generate takes the cut as it is on screen at that
      // moment. It does make an undeclared type depend on *when* the button is
      // pressed — but the alternative is generating from a texture the user was
      // not looking at, and the row is right there to settle it deliberately.
      hairType: hairTypeId ?? shownAs,
      photoUri,
      options,
    });
    router.push(`/try/generating?job=${jobId}`);
  };

  return (
    <Screen
      padded={false}
      footer={
        photoUri ? (
          <Button label="Generate my preview" icon="sparkles" onPress={generate} />
        ) : (
          <Button
            label="Add a photo to generate"
            icon="camera-outline"
            variant="dark"
            loading={busy}
            onPress={pickFromLibrary}
          />
        )
      }
    >
      {/* The cut's name is the header's title rather than a 24pt heading under
          the hero, and the favourite toggle rides in the slot beside it. As a
          row of its own that pair cost 56 points to say something the header
          had an empty centre for — and this screen's problem was never that it
          wanted a headline, it was that its controls were off the bottom of the
          screen. Naming a screen after its subject is what a header is for; it
          was carrying only the step counter. */}
      <Header
        title={hairstyle.name}
        step={{ current: 5, total: TRY_ON_STEPS }}
        right={
          <FavouriteHeart
            accessibilityLabel={favourite ? 'Remove from favourites' : 'Add to favourites'}
            favourite={favourite}
            onToggle={() => toggleFavourite(hairstyle.id)}
          />
        }
      />

      {/* The four angles are pages, swiped like a carousel. The thumbnails
          below are the same pager by another name — tapping one and swiping to
          it land in the same place. */}
      <View style={styles.hero}>
        <ScrollView
          ref={pager}
          horizontal
          pagingEnabled
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          onLayout={positionPager}
          onMomentumScrollEnd={onPagerSettle}
        >
          {VIEW_ANGLES.map((entry) => (
            <View
              key={entry}
              style={styles.heroPage}
              accessibilityLabel={ANGLE_LABELS[entry].long}
            >
              <VariantCrossfade cycle={cycle} fallback={variants}>
                {(shown) => (
                  <Mannequin
                    styleId={hairstyle.id}
                    shape={shape}
                    options={lengthOptions}
                    color={color}
                    gender={gender}
                    variants={shown}
                    angle={entry}
                    size={HERO_ART}
                    backdrop={null}
                  />
                )}
              </VariantCrossfade>
            </View>
          ))}
        </ScrollView>

        <View style={styles.dots}>
          {VIEW_ANGLES.map((entry) => (
            <View key={entry} style={[styles.dot, entry === angle && styles.dotActive]} />
          ))}
        </View>
      </View>

      <View style={styles.body}>
        {/* Both adjustments in one card, so both are on screen at once. They ask
            the same question — how should this cut be shown — and as two stacked
            cards the second one was always below the fold. `<ControlCard>` rules
            a hairline between whatever it is actually handed, so a cut with no
            length row is one section and no seam. */}
        <ControlCard>
          {/* Which texture the cut is shown on — a choice, presented as one. All
              four types are on screen whether or not this cut is offered for
              them (see `<HairTypeChoice>`), and two types that share a render
              show the same image on purpose: that is the matrix saying they look
              alike, which is what `typeNote` says out loud. */}
          {offered.length > 1 ? (
            <HairTypeChoice
              types={hairTypeEntries}
              available={offered}
              value={shownAs}
              onChange={setPreview}
              note={typeNote}
            />
          ) : null}

          {/* How long the cut is worn — present only on the cuts that have a
              useful range, which is a minority of the catalog and deliberately
              so. Two stops and three are both normal: a Pixie Cut grown out is a
              bob, so it goes short and stops. Until the length renders exist
              this moves the procedural drawing rather than the render —
              `effectiveShape()` has always known how to shorten and lengthen a
              silhouette — so the control is real on the fallback and inert on a
              generated cut. */}
          {lengthEntries.length > 1 && shownLength ? (
            <LengthChoice
              lengths={lengthEntries}
              value={shownLength}
              onChange={setLength}
              note={lengthNote}
            />
          ) : null}
        </ControlCard>

        {/* The same style from four angles — the fringe reads dead-on, the taper
            and the ear from the half turn, the fade in profile, the nape from
            behind. */}
        <View style={styles.angleRow}>
          {VIEW_ANGLES.map((entry) => (
            <Pressable
              key={entry}
              accessibilityRole="radio"
              accessibilityLabel={ANGLE_LABELS[entry].long}
              accessibilityState={{ selected: entry === angle }}
              onPress={() => goToAngle(entry)}
              style={({ pressed }) => [
                styles.thumb,
                entry === angle && styles.thumbSelected,
                pressed && { opacity: 0.8 },
              ]}
            >
              <Mannequin
                styleId={hairstyle.id}
                shape={shape}
                options={lengthOptions}
                color={color}
                gender={gender}
                variants={variants}
                angle={entry}
                size={THUMB_WIDTH * 0.82}
                backdrop={null}
                style={{ marginTop: THUMB_HEIGHT * 0.04 }}
              />
              <Text style={[styles.thumbLabel, entry === angle && { color: onPlateAccent }]}>
                {ANGLE_LABELS[entry].short}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* The photo, in place — the cut and the face it goes on are the only
            two things this screen asks for. */}
        <View style={styles.photoCard}>
          {photoUri ? (
            <View style={styles.photoRow}>
              <PhotoFrame
                uri={photoUri}
                rounded={radii.md}
                style={styles.photoThumb}
                demo={{ shape: DEMO_BASE_SHAPE, color, gender }}
                demoWidth={104}
              />
              <View style={styles.photoCopy}>
                <Text style={[type.label, { color: colors.ink }]}>Your photo</Text>
                <Text style={[type.caption, { color: colors.muted }]}>
                  This cut gets rendered onto this photo.
                </Text>
                <Pressable accessibilityRole="button" hitSlop={8} disabled={busy} onPress={pickFromLibrary}>
                  <Text style={styles.link}>Change photo</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={{ gap: spacing.md }}>
              <View style={styles.photoRow}>
                <View style={styles.photoBadge}>
                  <Ionicons name="person-outline" size={24} color={colors.accent} />
                </View>
                <View style={styles.photoCopy}>
                  <Text style={[type.label, { color: colors.ink }]}>Add your photo</Text>
                  <Text style={[type.caption, { color: colors.muted }]}>
                    A clear front-facing shot gives the best result. We don’t store your photos.
                  </Text>
                </View>
              </View>

              <View style={styles.photoActions}>
                <Button
                  label="Upload"
                  icon="cloud-upload-outline"
                  variant="soft"
                  size="md"
                  full={false}
                  loading={busy}
                  onPress={pickFromLibrary}
                  style={{ flex: 1 }}
                />
                <Button
                  label="Camera"
                  icon="camera-outline"
                  variant="soft"
                  size="md"
                  full={false}
                  loading={busy}
                  onPress={takePhoto}
                  style={{ flex: 1 }}
                />
              </View>

              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setPhoto(DEMO_PHOTO)}>
                <Text style={[styles.link, { textAlign: 'center' }]}>Use a sample photo</Text>
              </Pressable>
            </View>
          )}
        </View>

        <Text style={[type.caption, styles.note]}>
          Generating takes a few seconds. You can watch it happen on your photo, or leave the
          screen — it keeps running and lands in My looks either way.
        </Text>
      </View>
    </Screen>
  );
}

const useStyles = makeStyles(({ colors, shadow }) => ({
  hero: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    borderRadius: radii.xl,
    // A plate, not a surface: the render is a square of flat white, so after
    // dark a scheme-coloured card here framed it as a bright rectangle. The
    // border, the dots and everything under the card still follow the scheme.
    backgroundColor: plate,
    borderWidth: 1,
    borderColor: colors.hairline,
    overflow: 'hidden',
    ...shadow.card,
  },
  heroPage: {
    width: HERO_PAGE,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingTop: spacing.sm,
    // Clears the dots underneath. The head is bottom-aligned in the page, so
    // this is the only thing keeping the jaw off them.
    paddingBottom: spacing.xl,
  },
  dots: {
    pointerEvents: 'none',
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.hairline },
  dotActive: { width: 18, backgroundColor: colors.accent },
  body: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  angleRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  thumb: {
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
    borderRadius: radii.md,
    // The same plate as the hero, for the same reason — these are four more
    // renders, at a quarter of the size.
    backgroundColor: plate,
    borderWidth: 2,
    borderColor: colors.hairline,
    alignItems: 'center',
    overflow: 'hidden',
  },
  thumbSelected: { borderColor: colors.accent },
  thumbLabel: {
    ...type.caption,
    // On the plate, so it comes from the light palette in both schemes.
    color: onPlateMuted,
    marginTop: 'auto',
    marginBottom: spacing.xs,
    fontSize: 11,
  },
  photoCard: {
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  photoThumb: { width: 64, height: 82 },
  photoCopy: { flex: 1, gap: spacing.xs },
  photoBadge: {
    width: 52,
    height: 52,
    borderRadius: radii.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoActions: { flexDirection: 'row', gap: spacing.sm },
  link: { ...type.caption, color: colors.accent, fontWeight: '700' as const },
  note: { color: colors.muted, marginTop: spacing.md, marginBottom: spacing.xl },
}));
