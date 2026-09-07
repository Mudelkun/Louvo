'use client';

/**
 * The catalogue's filters, in one place, used by both surfaces that browse it.
 *
 * There were two rails: the browse page's — gender, texture, categories, search,
 * sort — and a shorter one at the end of the try-on flow that offered categories
 * and a search and nothing else, on the argument that gender and texture had
 * been answered two questions earlier and re-offering them would ask the same
 * thing twice.
 *
 * That argument was half right. Asking twice is not the failure; *answering* on
 * somebody's behalf and giving them nowhere to change it is. The narrowed grid
 * is the right grid — it is the two answers applied — but a visitor who wants to
 * see what a women's cut looks like on a men's catalogue, or what the coily
 * shelf holds, had to go back through a dialogue to find out. So the flow gets
 * the same rail the catalogue has, pre-set to the answers already given, and the
 * dialogue's job narrows to what it was always best at: asking the two questions
 * once, up front, of somebody who has not answered them.
 *
 * ## Every dimension states its answer; none of them lists its options
 *
 * This was fourteen chips, a segmented control, a field and a select, all on
 * screen at once. On a laptop that read as one busy line. On a phone it stacked
 * into four bands — including two rows of identically drawn chips asking two
 * different questions — and took about a third of the screen before a single
 * haircut.
 *
 * The mistake was treating "every option is visible" as the goal. What somebody
 * needs to see is **which catalogue they are looking at**, and that is four
 * short words, not fourteen chips. So each dimension is one pill that says its
 * current answer — `Everyone`, `All textures`, `All shapes`, `Most wanted` — and
 * opens its options only when asked. A narrowed dimension is tinted, so a grid
 * that is hiding cuts never does it silently.
 *
 * They are native `<select>`s, which is what makes this cheap rather than
 * clever: the sort control already was one, the platform draws the picker
 * somebody's phone has already taught them — a wheel on iOS, a sheet on Android
 * — and there is no popover, no focus trap and no keyboard handling of ours to
 * get wrong. The caret is drawn rather than left to the browser, and only so the
 * four pills are the same object at every width.
 *
 * What is genuinely lost is one-tap category switching on a laptop, where the
 * chips did fit. That is the trade and it is worth taking: one row that is the
 * same control at every size beats two layouts that drift, and the grid
 * underneath is what everybody came to look at.
 *
 * Nothing here names a hairstyle, a category or a hair type. Categories come
 * from `catalog.categories` and types from `catalog.hairTypes`.
 */

import type { ReactNode } from 'react';

import type { Category, Gender, HairType, HairTypeId } from '../lib/contract/catalog';
import { SORTS, type SortId } from '../lib/hairTypes';

/**
 * The neutral answer leads every list, and it is a real answer rather than the
 * absence of one. Each is worded so it stands alone: a pill reading `Everything`
 * beside three other pills does not say what it is everything *of*.
 */
const GENDERS: { id: string; label: string }[] = [
  { id: 'all', label: 'Everyone' },
  { id: 'male', label: "Men's cuts" },
  { id: 'female', label: "Women's cuts" },
];

export interface CatalogFiltersProps {
  categories: Category[];
  hairTypes: HairType[];

  gender: Gender | null;
  hairType: HairTypeId | null;
  hairTypeDeclared: boolean;
  categoryId: string | null;
  sort: SortId;
  search: string;

  onGender: (gender: Gender | null) => void;
  onHairType: (hairType: HairTypeId | null) => void;
  onCategory: (categoryId: string | null) => void;
  onSort: (sort: SortId) => void;
  onSearch: (search: string) => void;
}

export function CatalogFilters({
  categories,
  hairTypes,
  gender,
  hairType,
  categoryId,
  sort,
  search,
  onGender,
  onHairType,
  onCategory,
  onSort,
  onSearch,
}: CatalogFiltersProps) {
  const visibleCategories = categories
    .filter((category) => (gender ? category.genders.includes(gender) : true))
    .slice()
    .sort((a, b) => a.order - b.order);

  const orderedTypes = hairTypes.slice().sort((a, b) => a.order - b.order);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* The search takes the first row on a phone and sits inline from `sm`.
          First, because it is the shortest route to a cut somebody can already
          name — which is most of what a catalogue this size is asked for. */}
      <label className="relative w-full min-w-0 sm:w-[190px] sm:shrink-0">
        <span className="sr-only">Search the catalogue</span>
        <input
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search cuts"
          className={
            'h-9 w-full rounded-full bg-white/5 pl-9 pr-3.5 text-[13px] text-ink ' +
            'ring-1 ring-inset ring-line outline-none transition-[width,box-shadow] duration-300 ' +
            'placeholder:text-faint focus:ring-violet/50 sm:focus:w-[240px]'
          }
        />
        <span
          aria-hidden
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
        >
          ⌕
        </span>
      </label>

      <Select
        label="Who is this for"
        value={gender ?? 'all'}
        answered={gender !== null}
        onChange={(id) => onGender(id === 'all' ? null : (id as Gender))}
      >
        {GENDERS.map((option) => (
          <Option key={option.id} id={option.id} label={option.label} />
        ))}
      </Select>

      <Select
        label="Hair type"
        value={hairType ?? 'all'}
        answered={hairType !== null}
        onChange={(id) => onHairType(id === 'all' ? null : (id as HairTypeId))}
      >
        <Option id="all" label="All textures" />
        {orderedTypes.map((type) => (
          <Option key={type.id} id={type.id} label={type.name} />
        ))}
      </Select>

      <Select
        label="Length and shape"
        value={categoryId ?? 'all'}
        answered={categoryId !== null}
        onChange={(id) => onCategory(id === 'all' ? null : id)}
      >
        <Option id="all" label="All shapes" />
        {visibleCategories.map((category) => (
          <Option key={category.id} id={category.id} label={category.name} />
        ))}
      </Select>

      {/* Sort is not a filter — it never hides a cut — so it is never tinted,
          and it is pushed to the far end away from the three that narrow. */}
      <Select
        label="Sort by"
        value={sort}
        answered={false}
        onChange={(id) => onSort(id as SortId)}
        className="sm:ml-auto"
      >
        {SORTS.map((option) => (
          <Option key={option.id} id={option.id} label={option.label} />
        ))}
      </Select>
    </div>
  );
}

/**
 * One dimension of the catalogue, as a pill that says its answer.
 *
 * `answered` is what tints it, and it means "the grid below you is narrower than
 * the catalogue" rather than "this control has been touched". That is the one
 * fact a visitor cannot recover by looking at the grid itself — a short shelf
 * and a filtered shelf are the same picture.
 *
 * `appearance-none` drops the platform's own caret so the pills are one object
 * at every width; the caret beside it is ours. Everything else — the picker, the
 * keyboard, the touch target — is the platform's, which is the point of using a
 * `<select>` at all.
 */
function Select({
  label,
  value,
  answered,
  onChange,
  className = '',
  children,
}: {
  label: string;
  value: string;
  answered: boolean;
  onChange: (id: string) => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`relative inline-flex shrink-0 ${className}`}>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={
          'h-9 cursor-pointer appearance-none rounded-full pl-3.5 pr-8 text-[12.5px] ' +
          'font-semibold ring-1 ring-inset outline-none transition-colors duration-200 ' +
          'focus:ring-violet/50 ' +
          (answered
            ? 'bg-violet/16 text-violet-ink ring-violet/45'
            : 'bg-white/5 text-ink-soft ring-line hover:bg-white/8 hover:text-ink')
        }
      >
        {children}
      </select>
      <span
        aria-hidden
        className={
          'pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[8px] ' +
          (answered ? 'text-violet-ink' : 'text-muted')
        }
      >
        ▼
      </span>
    </label>
  );
}

/**
 * The options are painted explicitly because the pill they drop out of is not.
 * A transparent `<select>` leaves its list to inherit whatever the page is, and
 * on the platforms that honour the styling at all, that is near-black on
 * near-black.
 */
function Option({ id, label }: { id: string; label: string }) {
  return (
    <option value={id} className="bg-surface text-ink">
      {label}
    </option>
  );
}
