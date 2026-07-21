# 07 — Port plan: Vivaldi stack UX on Firefox native groups

Decision (user): keep Firefox native tab-group system, port ENTIRE Vivaldi UX + performance;
backend (tab list tracking) may be modified.

## What upstream Firefox ALREADY has (verified in this tree)

- Drop-tab-on-tab creates group, with hover delay:
  `browser.tabs.dragDrop.createGroup.enabled` + `.delayMS` (default 240) —
  [drag-and-drop.js:2377-2467](browser/components/tabbrowser/content/drag-and-drop.js#L2377-L2467).
  Drop on grouped tab joins that group (default dropElementGroup logic).
- Related new tab joins opener's group: `addTab` → `tabGroup = previousTab.group`
  ([tabbrowser.js:4900](browser/components/tabbrowser/content/tabbrowser.js#L4900)).
- Group editor (name/color/ungroup/save) — tabgroup-menu.js; collapse/expand = accordion.
- Session persistence of groups; `allTabs`/`visibleTabs` caches in tabs.js.

## Gaps vs Vivaldi UX → work items

1. **Prefs** (`browser/app/profile/firefox.js`):
   - `browser.tabs.stacking.mode` int 0=off 1=dotted 2=substrip 3=accordion (default 2 like Vivaldi)
   - `browser.tabs.stacking.autoExpand` (accordion, default true)
   - `browser.tabs.stacking.autoDissolve` (no singleton stacks, default true)
   - `browser.tabs.stacking.openInCurrent` (default true) — gates existing group-inherit in addTab
   - `browser.tabs.stacking.vivaldiStepMoves` (default true)
   - `browser.tabs.stacking.substripLocked` (default false)
   - bump `dragDrop.createGroup.delayMS` 240 → 450 (Vivaldi dnd_delay)
2. **gTabStacks controller** — new `browser/components/tabbrowser/content/tab-stacks.js`
   (subscript, pattern of tabgroup.js), init from `gBrowserInit._delayedStartup`:
   - mode attribute `tabstacks-mode` on root for CSS
   - substrip: second toolbar under TabsToolbar showing ACTIVE group's tabs
     (favicon+label+close); rAF-coalesced rebuilds; TabAttrModified fast path per button
   - substrip/dotted: groups forced collapsed (re-collapse on TabGroupExpand);
     click on group label = activate group's last-active tab (Vivaldi stack click)
   - dotted: `data-dots` on group label, CSS renders dot per member
   - accordion: auto-expand group on member activation (`autoExpand`)
   - singleton auto-dissolve: on TabClose/TabUngrouped queue group check (deferred 400ms,
     skips mid-restore transients) → ungroup last member (Vivaldi invariant)
3. **tabbrowser.js**: `openInCurrent` pref gate; Vivaldi step-move semantics in
   moveTabForward/Backward (grouped tab can't step out; ungrouped jumps whole group even
   when expanded)
4. **drag-and-drop.js**: stacking mode 0 disables create-group-on-drop
5. **Markup**: substrip toolbar in `navigator-toolbox.inc.xhtml` after #TabsToolbar
6. **CSS**: substrip + dotted styles appended to `browser/themes/shared/tabbrowser/tabs.css`
7. **Fluent**: new strings in `browser/locales/en-US/browser/tabbrowser.ftl`
8. **Backend perf ("tab list tracker")**:
   - cache `allGroups` in tabs.js (currently uncached Array.from+filter per call; invalidation
     hooks already exist: on_TabGroupCreate/on_TabGroupRemoved → _invalidateCachedTabs)
   - substrip is event-driven, no polling; full rebuild only on group switch/membership
     change, attribute-only updates patch single button

## Explicitly not ported (upstream equivalent good enough)

- Stack rename editor → tabgroup-menu.js modal
- Vivaldi two-level substrip drag-reorder inside substrip (phase 2)
- Workspaces, tab tiling, related-tabs tree (out of scope — separate features)
- `name_map`, `open_accordions` prefs → group state already persisted by SessionStore

## Loading wiring

- jar.mn: `content/browser/tabbrowser/tab-stacks.js`
- browser-main.js: loadSubScript after tabgroup.js
- browser-init.js `_delayedStartup`: `gTabStacks.init()`
