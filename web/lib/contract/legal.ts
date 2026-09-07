/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Copied from `src/lib/legal.ts` by `web/scripts/sync-contract.mjs`, with only
 * its import header re-pointed. Edit the source and re-run `npm run sync`.
 */

/**
 * The Privacy Policy and the Terms of Use, authored once.
 *
 * ## Why this is a data structure and not two screens and two web pages
 *
 * Both documents have to exist in three places at once: inside the app, where a
 * user can read them with no network; on a public URL, because App Store Connect
 * and the Play Console both require one a reviewer can open without installing
 * anything; and in whatever the operator later hands a regulator. Three
 * hand-maintained copies of a legal document is three documents, and the one
 * that is wrong is always the one nobody was looking at.
 *
 * So this file is the document, as data, and it is the only place either text is
 * written. `app/legal/[doc].tsx` renders it natively; `server/src/legal.ts`
 * renders the same structure as HTML at `/privacy` and `/terms`. The server's
 * copy is cut mechanically by `server/scripts/sync-shared.mjs`, exactly as
 * `tryOnPrompt.ts` is and for the same stated reason: this is authored English
 * prose, and two copies that have drifted apart are two different promises with
 * no test able to say which was meant. **Edit this file. Never edit
 * `server/src/generated/legal.ts`.**
 *
 * That is also why there are no imports here — the sync refuses a value import,
 * and a legal document that needs the theme in order to be read is a legal
 * document that cannot be served as a web page.
 *
 * ## The rule the prose is written against
 *
 * Every factual sentence in the privacy policy describes something this
 * repository actually does and can be checked against the code that does it:
 * `docs/preview-generation.md` for the photograph, `docs/credits.md` for the
 * install anchor, `docs/sharing.md` for the funnel, `server/migrations/` for
 * every column that exists. Where the app has three behaviours — a build with a
 * server, a build calling the model directly, a build simulating — the policy
 * describes the shipped one and points at the Settings screen, which reports
 * which one is actually running. Nothing here is aspirational, and a change to
 * the software that makes a sentence here false is a change that has to edit
 * this file in the same commit.
 *
 * Markup is deliberately absent. There is no bold, no inline link and no
 * markdown: a block is a paragraph, a list or a set of term/detail rows, which
 * is the largest vocabulary that renders identically in React Native and in HTML
 * without a parser on either side.
 */

/** One piece of a section. */
export type LegalBlock =
  | { kind: 'p'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'rows'; rows: { term: string; detail: string }[] };

export interface LegalSection {
  heading: string;
  blocks: LegalBlock[];
}

export type LegalSlug = 'privacy' | 'terms';

export interface LegalDocument {
  /** URL segment and route parameter: `/privacy`, `/legal/privacy`. */
  slug: LegalSlug;
  /** What the document is called, in a header and in a browser tab. */
  title: string;
  /** One sentence under the title, and the page's meta description. */
  summary: string;
  /** ISO date, shown as written — no locale formatting, so both renderers agree. */
  effective: string;
  sections: LegalSection[];
}

/**
 * The operator's own details, and the only facts in this file that are not about
 * the software.
 *
 * They are constants rather than prose because they are the things nobody can
 * read out of the code, and because a document naming the wrong company — or an
 * inbox that bounces — is worse than one naming none. So each of them degrades
 * to a sentence that is true and visibly incomplete rather than to a plausible
 * placeholder: no address and no inbox both become a statement that one will be
 * published, and no jurisdiction becomes a clause that does not pretend to name
 * a court.
 *
 * **All three are unset, and all three have to be set before either store
 * submission.** A published privacy policy with no postal address does not
 * satisfy a GDPR identity-of-the-controller request; a policy with no contact
 * route does not let anybody exercise a right, which both GDPR and the CCPA
 * require and both stores check; and terms with no governing law are a contract
 * whose disputes go to whoever reaches a court first. `docs/legal.md` is the
 * checklist.
 */
export const OPERATOR = {
  /** Trading name. Replace with the registered entity once one exists. */
  entity: 'Roda Production',
  /** Registered postal address, or null while there is not one to print. */
  address: null as string | null,
  /** e.g. 'England and Wales', 'the State of Delaware, USA'. */
  jurisdiction: null as string | null,
  /**
   * The inbox everything reaches us at, or null while there is not one.
   *
   * Null rather than an address that bounces: a document naming an inbox nobody
   * reads is worse than one naming none, because it converts "we have not set
   * this up yet" into "we ignored you". Every sentence that would have named it
   * says instead that an address will be published before release, which is
   * true and is visible — see `contactAt()`.
   *
   * This one is not optional at launch. Both stores require a working support
   * contact, and GDPR and CCPA both require a route for exercising rights that
   * is not "delete the app".
   */
  contactEmail: null as string | null,
  /** Where privacy requests go. The same inbox is fine; a real one is not optional. */
  privacyEmail: null as string | null,
  website: 'https://luvo.app',
};

/** The app's own name, wherever the prose needs it. */
const APP = 'Luvo';

/**
 * The date both documents take effect.
 *
 * One constant rather than two, because they were written together and a user
 * comparing them should not have to wonder what changed between two dates. Bump
 * it when either document changes materially, and say what changed in the
 * "Changes" section rather than silently re-dating.
 */
const EFFECTIVE = '2026-09-06';

const p = (text: string): LegalBlock => ({ kind: 'p', text });
const list = (...items: string[]): LegalBlock => ({ kind: 'list', items });
const rows = (...entries: { term: string; detail: string }[]): LegalBlock => ({
  kind: 'rows',
  rows: entries,
});

/**
 * How to reach us, or an honest statement that there is not yet a way.
 *
 * The fallback is deliberately a sentence a reader can act on — it tells them
 * the address does not exist rather than implying they failed to find it — and
 * it is deliberately conspicuous, because this is a gap that has to close before
 * release rather than one to be papered over.
 */
const contactAt = (address: string | null): string =>
  address
    ? `Email ${address}.`
    : 'We will publish a contact address here before Luvo is released publicly.';

/**
 * "Luvo, <address>. Email <inbox>." — with as much of each as exists.
 *
 * The "on request" offer is made only when there is somewhere to make the
 * request: an invitation to write to us for our address, with no address to
 * write to, is the kind of sentence that makes a whole document read as
 * boilerplate nobody checked.
 */
const contactLine = (): string => {
  const who = OPERATOR.address ? `${OPERATOR.entity}, ${OPERATOR.address}.` : `${OPERATOR.entity}.`;
  const post =
    !OPERATOR.address && OPERATOR.contactEmail
      ? ' We will give you our registered postal address on request.'
      : '';
  return `${who} ${contactAt(OPERATOR.contactEmail)}${post}`;
};

export const PRIVACY_POLICY: LegalDocument = {
  slug: 'privacy',
  title: 'Privacy Policy',
  summary:
    'What Luvo does with your photo, what we keep, and what we do not. Written to describe the app as it is actually built.',
  effective: EFFECTIVE,
  sections: [
    {
      heading: 'The short version',
      blocks: [
        p(
          `${APP} takes a photograph of you and shows you what a haircut would look like on you. To do that, your photo is sent to us and passed once to the image model that generates the preview. It is deleted as soon as the preview is made — not at the end of the day, and not when a cleanup job next runs.`,
        ),
        p(
          'The finished preview is downloaded onto your phone and deleted from our servers. After that, the only copy in existence is the one on your device, and it stays there until you delete it.',
        ),
        p(
          'Your photos and your previews are never public, never shown to anyone else, never used to advertise to you, and never used to train an image model. When you share a look, what your friends see is our own mannequin render of that haircut — never your face.',
        ),
        p(
          'You do not need an account to use the app. You need one only to buy generations, so that generations you have paid for survive a change of phone.',
        ),
      ],
    },
    {
      heading: 'Who we are',
      blocks: [
        p(`${contactLine()} We are the controller of the personal data described in this policy.`),
        p(
          'This policy covers the Luvo mobile app, the Luvo API behind it, and the web page a shared Luvo link opens.',
        ),
      ],
    },
    {
      heading: 'What we collect, and why',
      blocks: [
        rows(
          {
            term: 'Your photograph',
            detail:
              'The image you choose or take, in order to generate a preview. It is uploaded directly to private storage, read once by the generator, and deleted the moment the job finishes — whether it succeeded, failed or was cancelled. We also record its pixel dimensions, because the preview is generated in the same shape as your photo. It is never stored in our database, never made public, and never kept after the job settles.',
          },
          {
            term: 'Your preview',
            detail:
              'The generated image. It is held in private storage only until your phone has collected it, then deleted. If your phone never collects it — because it was switched off, or the app was removed — it is deleted unread after seven days.',
          },
          {
            term: 'A device identifier',
            detail:
              'When you first open the app, your phone generates a random secret and keeps it in the platform keystore. We store only a one-way hash of it. It identifies a phone, not a person, and it is what lets us match a finished preview to the device that asked for it.',
          },
          {
            term: 'An install anchor, on Android',
            detail:
              'On Android we additionally read the system-provided ANDROID_ID and store a salted hash of it. Its only purpose is to make the two free generations belong to a device rather than to an installation, so that removing and reinstalling the app does not hand out two more. It is not combined with anything else and is not used to recognise you anywhere but here.',
          },
          {
            term: 'Account details',
            detail:
              'Only if you sign in: your email address, the stable identifier your sign-in provider gives us, and a display name where the provider supplies one. If you use Sign in with Apple and choose to hide your address, we receive and store the relay address Apple gives us and nothing else.',
          },
          {
            term: 'Purchases',
            detail:
              'Which pack you bought, the store transaction identifier, and the resulting movements of your generation balance. We never see or receive your card details — payment happens entirely inside the App Store or Google Play.',
          },
          {
            term: 'A notification token',
            detail:
              'Only if you allow notifications: the push token issued by Apple or Google, so we can tell you when a preview you are waiting for is ready. It is removed when the platform tells us it has stopped working.',
          },
          {
            term: 'Share events',
            detail:
              'When you share a look, and when somebody opens a shared link, we record the share code, the channel, the platform, and the device hash where there is one. A shared link names a haircut, so none of this includes your photo or your preview. For someone opening a link in a browser we also record a truncated browser user-agent string.',
          },
          {
            term: 'Technical logs',
            detail:
              'Ordinary server logs: request paths, status codes, timings and errors, kept briefly to keep the service running and to investigate faults.',
          },
        ),
      ],
    },
    {
      heading: 'What we do not collect',
      blocks: [
        list(
          'No advertising identifiers, no advertising SDKs, and no tracking of you across other companies’ apps or websites.',
          'No location, no contacts, no calendar, no microphone, no health data.',
          'No face recognition and no biometric template. Your photo is used to generate a picture; it is not measured, matched, indexed or used to identify you.',
          'No device fingerprinting. We deliberately do not compose an identifier out of your IP address, screen metrics or configuration.',
          'No scanning of your photo library. The app only ever receives the single image you pick or take.',
          'Your saved looks and favourites are stored on your device and are never uploaded.',
        ),
      ],
    },
    {
      heading: 'Your photo, in detail',
      blocks: [
        p('This is the part of the app worth being precise about, so here is exactly what happens when you generate a preview.'),
        list(
          'Your phone uploads the photo directly to private storage using a short-lived, single-purpose upload link. It does not pass through our API, and it is stored under a random key with no public address and no CDN in front of it.',
          'A worker reads it once, through a link that expires in minutes, and sends it together with the haircut you chose to our image generation provider.',
          'The moment the job reaches a final state — done, failed or cancelled — the stored photo is deleted and our record of where it was is erased in the same operation. There is no state in which a finished job still points at your photograph.',
          'The preview is downloaded by your phone, and then deleted from our storage.',
        ),
        p(
          'We do not use your photo or your preview to train, fine-tune or evaluate any model, and we do not permit our generation provider to do so either.',
        ),
        p(
          'If you are using a build of the app configured without our server, your photo goes from your phone straight to the image provider and never reaches us at all. The Settings screen always states which of these the app you are running actually does.',
        ),
      ],
    },
    {
      heading: 'Who we share data with',
      blocks: [
        p(
          'We do not sell your personal data, we do not share it for advertising, and we do not disclose it to anyone except the service providers we need in order to run the app. Each of them acts on our instructions and receives only what its job requires.',
        ),
        rows(
          {
            term: 'Image generation',
            detail:
              'Our generation provider receives your photo and the haircut reference for the length of one generation, in order to produce your preview.',
          },
          {
            term: 'Storage and delivery',
            detail:
              'Cloudflare holds your photo and your preview in a private bucket for the minutes described above, and serves our public catalog imagery.',
          },
          {
            term: 'Hosting and database',
            detail: 'Railway runs our API and the database holding accounts, balances and job records.',
          },
          {
            term: 'Purchases',
            detail:
              'RevenueCat validates your purchase with the store and tells us to add generations to your balance. Apple and Google handle the payment itself.',
          },
          {
            term: 'Notifications',
            detail:
              'Expo, Apple and Google deliver the push notification that says your preview is ready. The notification does not contain your image.',
          },
          {
            term: 'Sign-in',
            detail:
              'Apple and Google verify who you are when you choose to sign in with them. We receive an identifier and an email address, and nothing more.',
          },
          {
            term: 'Email',
            detail: 'Resend sends the six-digit code when you sign in with an email address.',
          },
        ),
        p(
          'We may also disclose information where the law requires it, or to establish or defend legal claims. If we are ever party to a merger or acquisition, personal data may transfer as part of it, and this policy continues to apply until you are told otherwise.',
        ),
      ],
    },
    {
      heading: 'Where your data is processed',
      blocks: [
        p(
          'Our providers operate in the United States and the European Union, so your data may be processed outside the country you live in. Where data leaves the UK or the European Economic Area, transfers are made under the European Commission’s Standard Contractual Clauses or another lawful transfer mechanism.',
        ),
      ],
    },
    {
      heading: 'How long we keep things',
      blocks: [
        rows(
          { term: 'Your photograph', detail: 'Minutes. Deleted as soon as the generation settles.' },
          { term: 'Your preview', detail: 'Until your phone collects it, and at most seven days.' },
          {
            term: 'Device record and push token',
            detail: 'While you use the app; removed when you delete your account or the app’s data.',
          },
          {
            term: 'Account and email address',
            detail: 'Until you delete your account, which you can do yourself in Settings.',
          },
          {
            term: 'Purchase and balance records',
            detail:
              'Kept after account deletion with your identity removed, because tax law and store refunds require a record of the transaction.',
          },
          {
            term: 'Share and referral events',
            detail: 'Kept in aggregate to measure how the app grows. They do not identify you.',
          },
          { term: 'Server logs', detail: 'A short rolling window, then discarded.' },
        ),
      ],
    },
    {
      heading: 'Your rights',
      blocks: [
        p(
          'You can ask us for a copy of the personal data we hold about you, ask us to correct it, ask us to delete it, ask us to restrict or object to how we use it, and ask for it in a portable form. You can withdraw consent — for notifications, or for a generation you have not yet started — at any time, without affecting what was done before.',
        ),
        p(
          'The fastest route for most of it is the app itself. Settings has account deletion, which permanently deletes your account and everything attached to it, and clearing saved looks and favourites removes what is held on your device. For anything else, contact us and we will answer within one month.',
        ),
        p(
          `${contactAt(OPERATOR.privacyEmail)} If you are in the UK or the EEA and you think we have got this wrong, you also have the right to complain to your national data protection authority.`,
        ),
      ],
    },
    {
      heading: 'Legal bases for using your data',
      blocks: [
        p('If you are in the UK or the European Economic Area, we rely on the following bases.'),
        rows(
          {
            term: 'Performance of a contract',
            detail:
              'Generating the preview you asked for, keeping the generations you bought, and running your account.',
          },
          {
            term: 'Legitimate interests',
            detail:
              'Keeping the service secure and working, preventing abuse of the free allowance, and understanding how many people share the app and how many arrive from a shared link.',
          },
          { term: 'Consent', detail: 'Push notifications, and access to your camera or photo library.' },
          { term: 'Legal obligation', detail: 'Keeping records of purchases, and answering lawful requests.' },
        ),
      ],
    },
    {
      heading: 'If you are in California',
      blocks: [
        p(
          'We do not sell personal information and we do not share it for cross-context behavioural advertising. We collect the categories described above — identifiers, commercial information, photographs, and internet activity relating to this app — for the purposes stated and for no other purpose.',
        ),
        p(
          OPERATOR.privacyEmail
            ? 'You have the right to know what we collect, to delete it, to correct it, and not to be treated differently for exercising those rights. Use the contact address above; we will not ask you for more information than we need in order to find your record.'
            : 'You have the right to know what we collect, to delete it, to correct it, and not to be treated differently for exercising those rights. Account deletion is in the app, under Settings, and a contact address for the rest will be published here before Luvo is released publicly.',
        ),
      ],
    },
    {
      heading: 'Children',
      blocks: [
        p(
          `${APP} is not intended for children under 13, or under 16 in countries where that is the age of digital consent. We do not knowingly collect personal data from children. If you believe a child has used the app, contact us and we will delete the account and everything on it.`,
        ),
      ],
    },
    {
      heading: 'How we protect what we hold',
      blocks: [
        list(
          'Everything travels over encrypted connections.',
          'Your photo and your preview live in a private bucket with no public address, reachable only through links we mint that expire in minutes.',
          'Your device secret and your email sign-in code are stored only as one-way hashes, so a stolen database row cannot be replayed as you.',
          'No image is ever stored in our database — not your photograph, and not your preview.',
          'The app asks the operating system to block screenshots and screen recordings of its own screens.',
        ),
        p(
          'No system is perfect and we do not claim otherwise. If a breach ever affects your data, we will tell you and the relevant regulator as the law requires.',
        ),
      ],
    },
    {
      heading: 'Changes to this policy',
      blocks: [
        p(
          'If we change what we do with your data, we will change this document and move the date at the top of it. For anything material we will tell you in the app before the change takes effect, rather than relying on you to re-read it.',
        ),
        p(`Effective ${EFFECTIVE}.`),
      ],
    },
  ],
};

export const TERMS_OF_USE: LegalDocument = {
  slug: 'terms',
  title: 'Terms of Use',
  summary:
    'The agreement between you and Luvo: what the app does, what your generations are, and what each of us is responsible for.',
  effective: EFFECTIVE,
  sections: [
    {
      heading: 'Agreeing to these terms',
      blocks: [
        p(
          `These terms are an agreement between you and ${contactLine()} They apply when you use the ${APP} app, our website, or a page opened from a shared ${APP} link. By using ${APP} you accept them; if you do not, please do not use the app.`,
        ),
        p('Our Privacy Policy is part of this agreement, and it describes what happens to your photograph.'),
      ],
    },
    {
      heading: 'Who may use Luvo',
      blocks: [
        p(
          'You must be at least 13 years old, and at least 16 in countries where that is the age of digital consent. If you are under 18, you may use the app only with the involvement of a parent or guardian who accepts these terms on your behalf.',
        ),
        p('You must also be able to enter into a binding contract and not be barred from doing so under any applicable law.'),
      ],
    },
    {
      heading: 'What Luvo actually is',
      blocks: [
        p(
          `${APP} generates an illustration of what a haircut might look like on you. It is a visualisation produced by an image model — not a photograph, not a prediction, and not professional advice.`,
        ),
        list(
          'The result is an approximation. Hair behaves differently in reality than in a generated image, and the same cut looks different depending on your hair’s density and growth pattern, your face, and how it is styled on the day.',
          'A preview is not a promise about what a barber or stylist can achieve, how long it will take, or what it will cost.',
          'Talk to your stylist before committing to a cut. A preview is a good way to start that conversation and a poor way to end it.',
        ),
        p(
          'The mannequin images in the catalog are generated, faceless models. They are not photographs of real people and are not intended to depict anyone.',
        ),
      ],
    },
    {
      heading: 'Your photograph',
      blocks: [
        p('You keep every right you have in the photo you upload. We claim no ownership of it and no ongoing licence to it.'),
        p(
          'You give us permission to process that photo for one purpose only: producing the preview you asked for. That permission lasts as long as the generation does, and the photo is deleted as soon as it finishes.',
        ),
        p('By uploading a photo you confirm that:'),
        list(
          'it is a photo of you, or of somebody who has agreed to you using it this way;',
          'it is not a photo of a child, unless you are that child’s parent or guardian;',
          'you have the rights you need in order to upload it, and doing so breaks no law and nobody else’s rights;',
          'it does not contain illegal, abusive, hateful or sexual content.',
        ),
        p(
          'You keep the previews you generate and may use and share them personally. Do not present a generated preview as a real photograph of somebody, and do not use one to impersonate, mislead, harass or embarrass anyone.',
        ),
      ],
    },
    {
      heading: 'Generations and credits',
      blocks: [
        p(
          'One preview costs one generation. Every device gets two free generations to try the app with; after that, generations are bought in packs through the App Store or Google Play.',
        ),
        rows(
          {
            term: 'They are a licence, not money',
            detail:
              'A generation is a limited right to use a feature of this app. It is not currency, has no cash value, cannot be transferred, sold or exchanged, and cannot be redeemed for anything except a preview.',
          },
          {
            term: 'They do not expire',
            detail: 'Purchased generations stay on your account for as long as the account exists and the app is available.',
          },
          {
            term: 'A failure is refunded automatically',
            detail:
              'If a generation fails, or you cancel it before it finishes, the credit returns to your balance. If a preview is generated and made available to you but your device never collects it, the credit stays spent.',
          },
          {
            term: 'They belong to your account',
            detail:
              'Free generations belong to your device. Purchased ones belong to the account you bought them on, which is why an account is required in order to buy them. Deleting your account destroys any generations left on it, and the app tells you how many before you confirm.',
          },
          {
            term: 'The store sets the price',
            detail:
              'Prices are shown by the App Store or Google Play in your own currency and may change. Payment, receipts, refunds and taxes are handled by the store under its own terms, so a refund request goes to Apple or Google rather than to us.',
          },
        ),
        p('Nothing here limits any right you have under consumer law to a refund for something that does not work as described.'),
      ],
    },
    {
      heading: 'Your account',
      blocks: [
        p(
          'You need an account only in order to buy generations. Keep access to the email address or sign-in provider you use, because that is how the account is recovered — we cannot verify ownership any other way.',
        ),
        p(
          'Do not share an account and do not use somebody else’s. Tell us promptly if you think somebody has got into yours. You can delete your account, permanently, in Settings.',
        ),
      ],
    },
    {
      heading: 'Things you agree not to do',
      blocks: [
        list(
          'Upload a photo of somebody who has not agreed to it.',
          'Use Luvo to create images intended to deceive, defame, harass or sexualise anyone.',
          'Copy, scrape, redistribute or resell our catalog imagery, our mannequin renders, or any other part of the app.',
          'Reverse engineer, decompile, or attempt to extract the models, prompts or keys behind the app, except as far as the law says you may.',
          'Access the service by automated means, or use it to build or train a competing model or dataset.',
          'Interfere with the service, work around the free-generation allowance, or attempt to obtain generations you have not been granted.',
          'Use the app in any way that breaks a law that applies to you.',
        ),
        p(
          'We may suspend or end access to the app if these terms are broken, and we will try to tell you why unless the law prevents us.',
        ),
      ],
    },
    {
      heading: 'What belongs to whom',
      blocks: [
        p(
          `The ${APP} app, its name, its design, its catalog and every mannequin render in it belong to us or to our licensors. You get a personal, revocable, non-exclusive, non-transferable licence to use the app as it is intended, and nothing else is granted.`,
        ),
        p(
          'Your photo and the previews generated from it are yours, as described above. Sharing a look from inside the app sends an image composed on your device and a link to the haircut — never your photograph as a public page.',
        ),
      ],
    },
    {
      heading: 'Availability and changes',
      blocks: [
        p(
          `${APP} is offered as it is and as it is available. We may change, add or remove features, update the catalog, or stop offering the app. If we discontinue it, we will give reasonable notice and make a fair arrangement for any generations you have paid for and not used.`,
        ),
        p(
          'Generation depends on services run by other companies. When one of them is unavailable a generation may fail, and when it does, your credit comes back.',
        ),
      ],
    },
    {
      heading: 'No warranties',
      blocks: [
        p(
          'To the extent the law allows, the app is provided without warranties of any kind, express or implied, including fitness for a particular purpose, satisfactory quality and non-infringement. We do not warrant that a preview will resemble how a haircut turns out, that the service will be uninterrupted, or that it will be free of errors.',
        ),
        p(
          'Some places do not allow certain warranties to be excluded. Where that is the case, this section applies to you only as far as the law permits, and your statutory consumer rights are untouched.',
        ),
      ],
    },
    {
      heading: 'Our liability',
      blocks: [
        p(
          'We are not liable for indirect, incidental, special or consequential loss, or for lost profits, data or goodwill. Our total liability to you for any claim relating to the app is limited to the greater of the amount you paid us in the twelve months before the claim and fifty US dollars.',
        ),
        p(
          'Nothing here excludes liability for death or personal injury caused by negligence, for fraud, or for anything else that cannot lawfully be excluded.',
        ),
        p(
          'You agree to cover us against claims arising from a photo you uploaded that you did not have the right to upload, or from your use of the app in breach of these terms.',
        ),
      ],
    },
    {
      heading: 'If you downloaded Luvo from the App Store',
      blocks: [
        p(
          'These terms are between you and us, not Apple, and Apple is not responsible for the app or its contents. The licence granted here is limited to using the app on Apple-branded devices that you own or control, as permitted by the App Store Terms of Service.',
        ),
        list(
          'Apple has no obligation to provide maintenance or support for the app.',
          'If the app fails to conform to any applicable warranty, you may notify Apple and Apple will refund the purchase price; to the maximum extent permitted by law, Apple has no other warranty obligation at all.',
          'We, not Apple, are responsible for any claim that the app or your use of it infringes intellectual property rights, fails to meet a legal requirement, or gives rise to product liability or consumer protection claims.',
          'You confirm that you are not located in a country subject to a US Government embargo or designated as terrorist-supporting, and that you are not on any US Government list of prohibited or restricted parties.',
          'Apple and its subsidiaries are third-party beneficiaries of these terms and may enforce them against you.',
        ),
        p(
          OPERATOR.contactEmail
            ? `Questions, support requests and complaints about the app go to ${OPERATOR.contactEmail}.`
            : 'Questions, support requests and complaints about the app come to us rather than to Apple. We will publish a contact address here before Luvo is released publicly.',
        ),
      ],
    },
    {
      heading: 'Governing law',
      blocks: [
        p(
          OPERATOR.jurisdiction
            ? `These terms are governed by the laws of ${OPERATOR.jurisdiction}, and disputes will be heard by its courts. If you are a consumer you keep the protection of the mandatory laws of the country you live in, and you may also bring proceedings there.`
            : 'These terms are governed by the laws of the country in which we are established. If you are a consumer you keep the protection of the mandatory laws of the country you live in, and nothing here prevents you from bringing proceedings there.',
        ),
        p(
          'If any part of these terms is found unenforceable, the rest continues to apply. Our not enforcing something straight away does not mean we have given it up.',
        ),
      ],
    },
    {
      heading: 'Changes to these terms',
      blocks: [
        p(
          'We may update these terms as the app changes. When we do, we will move the date at the top, and for anything material we will tell you in the app before it takes effect. Continuing to use the app after that means you accept the new version.',
        ),
        p(`Effective ${EFFECTIVE}. ${contactAt(OPERATOR.contactEmail)}`),
      ],
    },
  ],
};

/** Both documents, in the order they are offered wherever they are listed together. */
export const LEGAL_DOCUMENTS: LegalDocument[] = [PRIVACY_POLICY, TERMS_OF_USE];

/** The document behind a slug, or null — so a bad route is a 404 rather than a guess. */
export function legalDocument(slug: string): LegalDocument | null {
  return LEGAL_DOCUMENTS.find((document) => document.slug === slug) ?? null;
}
