import Link from 'next/link';

import type { Crumb } from '../../lib/seo';

/**
 * The trail, drawn.
 *
 * It exists for two reasons and the second one is the one that pays. On the page
 * it is a way back that does not depend on the browser's own Back — a search
 * result and a shared link both land on a style page with nothing behind them,
 * which is the same argument that put a `/styles` link at the top of
 * `<StyleDetail>`. In the index it is what makes `breadcrumbLd()` honest: Google
 * renders breadcrumbs in place of the url on most results, and the markup
 * describing that trail has to describe something a visitor can actually see and
 * follow, or it is a claim about the page rather than a description of it.
 *
 * The last crumb is the current page and is not a link, which is both the
 * convention and the accessible answer — `aria-current="page"` says where you
 * are, and a link to here is a control that does nothing.
 */
export function Breadcrumbs({ trail, className = '' }: { trail: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted">
        {trail.map((crumb, index) => {
          const last = index === trail.length - 1;
          return (
            <li key={crumb.path} className="flex items-center gap-2">
              {last ? (
                <span aria-current="page" className="text-ink-soft">
                  {crumb.name}
                </span>
              ) : (
                <Link href={crumb.path} className="transition-colors hover:text-ink-soft">
                  {crumb.name}
                </Link>
              )}
              {last ? null : (
                <span aria-hidden className="text-faint">
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
