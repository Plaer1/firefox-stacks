# 05 — Prefs controlling tab stacks

Source: `vivapp/src/prefs_definitions.json` (generates C++ prefs via
`prefs/vivaldi_gen_prefs`), synced ids in `syncable.vivaldi.*`.

## vivaldi.tabs.stacking.*

| pref | type | default | meaning |
|---|---|---|---|
| `mode` | enum | `substrip` | **off=0, dotted=1, substrip=2, accordion=3** — the 3 stack UIs |
| `allow_dnd` | bool | true | allow stacking via drag & drop |
| `dnd_delay` | int | 450 | ms hover delay before drop-on-tab stacks |
| `prefer_dotted` | bool | false | dotted visualization |
| `substrip_locked` | bool | false | keep second tab bar open when empty |
| `open_in_current` | bool | true | open links within current tab stack |
| `open_accordions` | list | [] | expanded accordion ids (UI-local state) |
| `auto_expand` | bool | true | expand accordion when member tab activated |
| `auto_editor` | bool | ~ | expand stack editor on stack creation |
| `name_map` | dict | {} | local record of stack renames |
| `allow_rename` | bool | false | DEPRECATED 2021 |

Related: `vivaldi.tabs.close_pinned_in_stack`, `vivaldi.tabs.new_placement` enum includes
`openintabstackwithrelated=3` (new-tab placement = into stack with related tab),
`vivaldi.panels.window.drag_to_stack`.

Most stacking prefs are syncable (ids 267–274).

## Who consumes them

- UI (JS, closed) consumes mode etc. and translates to `strip-*` tweaks on tabsPrivate.move.
- C++ side: `browser/tab_positioning_prefs.{h,cc}` + `browser/tab_positioning.cc` read prefs
  into a `TabBarState` (incl. `TabstackMode`), used for NEW TAB placement:

## New-tab stacking (browser/tab_positioning.cc)

- On tab creation, `DetermineInsertionIndexFromState()` computes index + a per-tab
  `StackingMode` stored transiently on TabExtData (not in the JSON blob):
  - `kForced` — stack with tab to the left; create group if none (used e.g. "open link in
    stack with related");
  - `kSticky` — join left neighbor's group if it has one;
  - `kAvoid` — never join (but may still be swallowed if inserted in the middle of a stack).
- `HandleStacking()` observes TabStripModelChange::kInserted and applies the mode:
  `ext->JoinGroup(prev_ext, create_new_group)`.
- If `tab_stack_mode == kOff` → mode forced to kAvoid.
- Also sets `parent_ext_id` (related-tab tree) and workspaceId at insertion.
