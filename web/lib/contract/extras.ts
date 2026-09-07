/**
 * The types the copied modules import, in one place.
 *
 * `scripts/sync-contract.mjs` re-points every type-only import in a copied file
 * at this module, so it has to export everything those files name. Almost all of
 * that is the wire contract itself, which is re-exported rather than restated —
 * `catalog.ts` is generated from `server/src/types.ts` and is the single source
 * of truth for anything that crosses the network.
 *
 * What is left is the short list of types that exist only in the app: things the
 * server has no opinion about because they never travel. They are written out
 * here, by hand, and the bar for adding one is that the server genuinely should
 * not know about it. Anything the API sends or receives belongs in the
 * contract, not here.
 */

export type * from './catalog';

/**
 * The live adjustments a user is holding, as `effectiveShape` reads them.
 *
 * A hand-written mirror of `TryOnOptions` in `src/api/types.ts`, and it is
 * three optional strings for a reason: the app deliberately widened them from
 * the id unions so a screen can pass whatever its control produced without the
 * geometry layer needing to know which controls exist. `hairShape.ts` compares
 * them against literals (`'short'`, `'high'`) and ignores anything else, which
 * is what makes an unrecognised value a no-op rather than a crash.
 *
 * On the web only `length` is ever set — there is no fade control and colour is
 * a grade rather than a shape (see `lib/colorGrade.ts`).
 */
export interface TryOnOptions {
  length?: string;
  fade?: string;
  color?: string;
}
