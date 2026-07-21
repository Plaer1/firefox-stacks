# 06 — Mapping Vivaldi tab stacks onto Firefox (this tree)

Firefox source copied into this repo (from github.com/mozilla-firefox/firefox, shallow @
2026-07-11; pristine clone kept at ../firefox). Relevant Firefox code:

- `browser/components/tabbrowser/content/tabgroup.js` — `MozTabbrowserTabGroup` XUL element:
  native tab groups with `id`, `label`, `color`, `collapsed`. Group = DOM element wrapping tab
  elements in the tab strip.
- `browser/components/tabbrowser/content/tabbrowser.js` — `addTabGroup()` (~line 3827),
  `adoptTabGroup()` (~4000), group id generation.
- `browser/components/tabbrowser/content/drag-and-drop.js` — tab strip DnD (104k) — where
  Vivaldi-style drop-on-tab-to-stack would hook.
- `browser/components/tabbrowser/content/tabgroup-menu.js` — group editor UI.
- SessionStore persists groups + per-tab custom values.

## Concept mapping

| Vivaldi | Firefox native | Gap for "stacks" |
|---|---|---|
| `group` UUID in per-tab extData | `<tab-group id>` DOM wrapper; tab membership = DOM parent | Fx group is an object, Vivaldi is per-tab tag. Fx model is stricter (contiguity by construction) |
| `fixedGroupTitle`/`groupColor` on each member | `label`/`color` on group element | Fx cleaner (no denormalization/fanout) |
| substrip / dotted / accordion / compact modes | only collapse/expand (≈ accordion) | **Main feature gap: two-level substrip UI + dotted view** |
| drop-tab-on-tab creates stack (dnd_delay 450ms) | drag INTO existing group only; no drop-on-tab stacking | Need hover-delay drop-on-tab → `addTabGroup([target, dragged])` in drag-and-drop.js |
| `expandStatus`/`collapsed` per tab | `collapsed` on group | — |
| SanitizeGroupSplit / SanitizeGroups | not needed (DOM structure can't split; singleton groups allowed in Fx) | decide: keep Fx semantics or enforce Vivaldi's ≥2 rule |
| StackingMode (new-tab kForced/kSticky/kAvoid) | `insertAfterCurrent`-ish prefs only | port `tab_positioning` heuristics if wanted |
| salted UUID remap on restore | Fx regenerates group ids on restore paths | — |
| tabsPrivate.move planner+tweaks | `gBrowser.moveTabTo*, addTabGroup, adoptTabGroup` | port the neighbor-based group suggestion rules for DnD feel |

## Porting recommendation

Do NOT recreate the extData-tag model — build stacks ON TOP of Firefox native tab groups
(`MozTabbrowserTabGroup`): they already give identity, title, color, collapse, session
persistence, and vertical-tabs support. The Vivaldi-specific value to port is BEHAVIOR:

1. Drop-on-tab stacking with hover delay (Vivaldi `allow_dnd` + `dnd_delay`), incl. the
   "both neighbors same group → forced join" contiguity rule from tabs_motion_helper.
2. Substrip mode: second tab bar showing active group's members (Vivaldi `mode=substrip`) —
   pure front-end over group state.
3. Group-aware keyboard/step moves (left/right jumps over whole groups; grouped tab can't
   step out of its group).
4. New-tab placement into stacks (`open_in_current`, openintabstackwithrelated) via
   StackingMode-like logic at tab-insert time.
5. Optional: no-singleton-group sanitizer, auto-dissolve on 1 member (Vivaldi invariant).

Motion-helper unit tests (`tabs_motion_helper_unittest.cc`, 52k) are the behavior spec for #1/#3.
