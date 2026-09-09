import type { Metadata, Viewport } from 'next';
import { Instrument_Serif, Inter } from 'next/font/google';

import { CheckoutBanner } from '../components/CheckoutBanner';
import { JsonLd } from '../components/seo/JsonLd';
import { SiteFooter } from '../components/SiteFooter';
import { SiteHeader } from '../components/SiteHeader';
import { API_URL, SITE_URL } from '../lib/config';
import {
  applicationLd,
  graph,
  organizationLd,
  SITE_DESCRIPTION,
  SITE_NAME,
  TAGLINE,
  websiteLd,
} from '../lib/seo';
import { Providers } from './providers';
import './globals.css';

/**
 * The type pairing, and it is the loudest thing separating this from the app.
 *
 * The mobile app is a tool: one geometric sans, tight, doing its job. A
 * shopfront for something people buy because of how it will make them look
 * cannot be set in the same voice, so the display face is a high-contrast serif
 * and the interface stays in a grotesque. The serif carries the headline and the
 * hairstyle names — the two places the product is being *presented* — and never
 * a control, a caption or anything under about 18px, where its contrast turns
 * into mush.
 */
const serif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-serif',
});

const grotesk = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-grotesk',
});

/**
 * What every page inherits, and the two things it deliberately does not.
 *
 * **No `alternates.canonical` here.** Metadata is inherited, so a canonical on
 * the layout would quietly claim `/` as the canonical of every page that had not
 * thought to override it — which is the single most destructive thing a site can
 * do to its own index. Each indexable route declares its own; `lib/seo.ts` says
 * why that matters on a catalogue whose links carry answers in the query string.
 *
 * **No `keywords` here either.** Google has ignored the meta keywords tag since
 * 2009. It is set per page where it is doing a different job — on a style page
 * it is the cut's own tags, which cost nothing to emit and are read by the
 * smaller engines and by the answer engines that are now a real share of this
 * traffic.
 *
 * The title is the one change worth explaining. It was "Louvo — see the haircut
 * before the chair", which is the brand line and is good writing, and is a
 * phrase nobody has ever typed into a search box. A title tag has two audiences
 * and the first is a query, so the category noun leads and the line follows it.
 * Nothing was lost: it is still there, doing what it is good at, one clause
 * later.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — virtual hairstyle try-on: see the haircut before the chair`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  category: 'lifestyle',
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'en',
    url: SITE_URL,
    title: `${SITE_NAME} — ${TAGLINE.toLowerCase()}`,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} — ${TAGLINE.toLowerCase()}`,
    description: SITE_DESCRIPTION,
  },
  /**
   * `max-image-preview: large` is the one that matters on this site.
   *
   * The product is a picture of a haircut. Google's default is a thumbnail;
   * `large` is what allows the render to be shown at full width in a result and
   * in Discover, and it is the difference between a listing that demonstrates
   * what Louvo does and one that describes it. The two snippet limits are set to
   * unbounded for the same reason — there is nothing here we would rather have
   * truncated.
   */
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  /**
   * Search Console's verification token, read from the environment rather than
   * committed.
   *
   * A DNS record is the better proof and does not depend on a deploy; this is
   * here because the html-tag method is the one somebody reaches for at 2am when
   * a property will not verify, and having nowhere to put it is how a token ends
   * up pasted into a component. Unset is the ordinary state and emits nothing.
   */
  verification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
    : undefined,
  /**
   * Telephone detection off.
   *
   * Safari turns anything that looks like a number into a `tel:` link, which on
   * a catalogue full of lengths and type numbers ("Type 4", "2 free previews")
   * produces blue underlined text nobody asked for, differing between the server
   * render and the client one.
   */
  formatDetection: { telephone: false, address: false, email: false },
};

/**
 * `themeColor` is the canvas, and it is one value rather than a light/dark pair.
 *
 * The site commits to a single dark look — see the header of `globals.css` — so
 * a light-scheme entry here would tell the browser to paint a chrome the page
 * never matches.
 */
export const viewport: Viewport = {
  themeColor: '#08060e',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

/**
 * The API's origin, opened before anything asks it for anything.
 *
 * The very first thing this site does after hydrating is fetch `/v1/catalog`
 * from another origin — Railway, where the site is on Vercel — and every plate
 * on the page waits on it, because a render url only exists inside that
 * document. A cross-origin fetch starts with a DNS lookup, a TCP handshake and a
 * TLS negotiation, and all three happen *after* React has mounted and the effect
 * in `<CatalogProvider>` has run. On a phone on mobile data that is comfortably
 * a third of a second of nothing, spent before the request is even sent.
 *
 * `preconnect` moves all three into the head, where the browser can do them
 * while it is still parsing and executing. The request itself is unchanged and
 * so is the code that makes it — this only means the connection is already open
 * when it arrives.
 *
 * `dns-prefetch` behind it is for the browsers that ignore `preconnect`; it is
 * inert where `preconnect` is honoured. Both are skipped in a build with no API
 * url, which is the state a fresh checkout starts in.
 */
function ApiPreconnect() {
  if (!API_URL) return null;
  let origin: string;
  try {
    origin = new URL(API_URL).origin;
  } catch {
    // A malformed url is the deployment's problem, not a reason to fail a page.
    return null;
  }
  return (
    <>
      <link rel="preconnect" href={origin} crossOrigin="anonymous" />
      <link rel="dns-prefetch" href={origin} />
    </>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /*
      `data-scroll-behavior` is not decoration, and its absence was a bug.

      `globals.css` sets `scroll-behavior: smooth` on this element, which is
      what makes an in-page anchor glide. The router's scroll-to-top on a
      navigation inherits it — so pressing a hairstyle scrolled the catalogue
      slowly back to the top and *then* swapped in the style page, which reads
      as the site doing something odd before answering the tap. Next disables
      smooth scrolling around its own route-transition scroll, but only for a
      document that declares it here: without this attribute it cannot know the
      rule came from a stylesheet rather than from something it would be wrong
      to override. Anchors keep their glide; route changes are instant.
    */
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${serif.variable} ${grotesk.variable}`}
    >
      <head>
        <ApiPreconnect />
        {/*
          The organisation, the site and the application, once, on every page.

          Sitewide rather than per page because these three nodes are what every
          other document on the site references by `@id` — a `CollectionPage`
          saying `isPartOf: <site>` is describing a structure only if that site
          node is somewhere in the same graph. Emitting them here costs about
          nine hundred bytes and removes the alternative, which is thirty pages
          each carrying an anonymous copy of the same publisher.
        */}
        <JsonLd data={graph(organizationLd(), websiteLd(), applicationLd())} />
      </head>
      <body className="min-h-dvh antialiased">
        <a
          href="#main"
          className={
            'sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full ' +
            'focus:bg-violet focus:px-5 focus:py-2.5 focus:text-[13px] focus:font-semibold focus:text-on-violet'
          }
        >
          Skip to content
        </a>
        <Providers>
          <div className="flex min-h-dvh flex-col">
            <SiteHeader />
            {/* Above the page rather than inside it, because a purchase can be
                started from any page and comes back to that same page — the
                return path is where the visitor was, not `/account`. Renders
                nothing at all except on a load that came back from Stripe. */}
            <CheckoutBanner />
            <main id="main" className="flex-1">
              {children}
            </main>
            <SiteFooter />
          </div>
        </Providers>
      </body>
    </html>
  );
}
