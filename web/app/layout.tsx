import type { Metadata, Viewport } from 'next';
import { Instrument_Serif, Inter } from 'next/font/google';

import { CheckoutBanner } from '../components/CheckoutBanner';
import { SiteFooter } from '../components/SiteFooter';
import { SiteHeader } from '../components/SiteHeader';
import { API_URL, SITE_URL } from '../lib/config';
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

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Luvo — see the haircut before the chair',
    template: '%s · Luvo',
  },
  description:
    'Upload one photo and see yourself in any cut in the Luvo catalogue — generated from studio references, not guessed from a name.',
  openGraph: {
    type: 'website',
    siteName: 'Luvo',
    title: 'Luvo — see the haircut before the chair',
    description:
      'Upload one photo and see yourself in any cut in the Luvo catalogue.',
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
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
    <html lang="en" className={`${serif.variable} ${grotesk.variable}`}>
      <head>
        <ApiPreconnect />
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
