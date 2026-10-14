// Durable, module-level stashes for CatBot's conversational heterostructure flow.
//
// Building a heterostructure is a multi-step workflow that spans several tool
// calls: `set_film` marks the current viewer structure as the FILM, then
// `heterostructure_search` finds candidate lattice-matched interfaces, then
// `build_heterostructure` picks one and builds it. The intermediate state
// (the film structure, and the list of candidate matches) must survive between
// those tool calls — but it should NOT be threaded through the LLM (transform
// matrices are large and error-prone for a model to copy).
//
// These stashes mirror `current-structure.svelte.ts`: module-level Svelte 5
// `$state` so the values persist for the whole session, independent of which
// pane is visible.

import type { AnyStructure } from '$lib'
import type {
  HeterostructureMatch,
  LateralMatch,
  LateralSearchParams,
} from '$lib/api/heterostructure'

const _state = $state<{
  film: AnyStructure | null
  matches: HeterostructureMatch[]
  lateral_matches: LateralMatch[]
  lateral_search_params: LateralSearchParams | null
  bulk: AnyStructure | null
}>({
  film: null,
  matches: [],
  lateral_matches: [],
  lateral_search_params: null,
  bulk: null,
})

type HeteroScopeState = Pick<typeof _state,
  `film` | `matches` | `lateral_matches` | `lateral_search_params` | `bulk`>

// A DSH session is owned by one CatBot tab. Keep its multi-step film/search
// state inside that tab so simultaneous chats cannot consume each other's
// candidate matrices. Calls without a scope retain the legacy singleton.
const _scoped = new Map<string, HeteroScopeState>()

function hetero_scope(scope?: string): HeteroScopeState {
  if (!scope) return _state
  let state = _scoped.get(scope)
  if (!state) {
    state = {
      film: null,
      matches: [],
      lateral_matches: [],
      lateral_search_params: null,
      bulk: null,
    }
    _scoped.set(scope, state)
  }
  return state
}

/** Stash the FILM structure for the next heterostructure search/build. */
export function set_film_stash(s: AnyStructure | null, scope?: string): void {
  hetero_scope(scope).film = s
}

/** The stashed FILM structure, or null if `set_film` was never called. */
export function get_film_stash(scope?: string): AnyStructure | null {
  return hetero_scope(scope).film
}

/** Stash the candidate matches from the most recent heterostructure search. */
export function set_hetero_matches(m: HeterostructureMatch[], scope?: string): void {
  hetero_scope(scope).matches = m
}

/** The candidate matches from the most recent search (empty if none yet). */
export function get_hetero_matches(scope?: string): HeterostructureMatch[] {
  return hetero_scope(scope).matches
}

/** Stash the candidate matches from the most recent LATERAL (in-plane) search. */
export function set_lateral_matches(m: LateralMatch[], scope?: string): void {
  hetero_scope(scope).lateral_matches = m
}

/** The candidate LATERAL matches from the most recent search (empty if none yet). */
export function get_lateral_matches(scope?: string): LateralMatch[] {
  return hetero_scope(scope).lateral_matches
}

/** Stash the LATERAL search params alongside the matches. The lateral build
 *  re-runs the edge-match search internally and selects by match_id, so it MUST
 *  re-run with the SAME params the search used — otherwise the rebuilt candidate
 *  list diverges and the chosen index/id maps to the wrong (or no) match. */
export function set_lateral_search_params(p: LateralSearchParams, scope?: string): void {
  hetero_scope(scope).lateral_search_params = p
}

/** The params of the most recent lateral search, or null if none yet. */
export function get_lateral_search_params(scope?: string): LateralSearchParams | null {
  return hetero_scope(scope).lateral_search_params
}

/** Stash the BULK reference crystal for surface passivation (pseudo-hydrogen).
 *  Used to compute reference coordination numbers when capping a slab. */
export function set_bulk_stash(s: AnyStructure | null, scope?: string): void {
  hetero_scope(scope).bulk = s
}

/** The stashed BULK reference, or null if `set_bulk_reference` was never called. */
export function get_bulk_stash(scope?: string): AnyStructure | null {
  return hetero_scope(scope).bulk
}
