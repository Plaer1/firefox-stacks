# 08 — Implementation log (phase 1, 2026-07-11)

All changes in this tree (firefox-stacks). Lint status: eslint/prettier, fluent-lint,
stylelint all pass; `node --check` passes on every touched JS file.

## Files changed

- `browser/app/profile/firefox.js`
  - `dragDrop.createGroup.delayMS` 240 → 450 (Vivaldi dnd_delay)
  - NEW `browser.tabs.stacking.*`: `mode` (0 off/1 dotted/2 substrip/3 accordion, default 2),
    `autoExpand`, `autoDissolve`, `openInCurrent`, `vivaldiStepMoves`, `substripLocked`
- `browser/components/tabbrowser/content/tabs.js`
  - PERF: `allGroups` getter now cached (`#allGroups`), invalidated in
    `_invalidateCachedTabs()` (create/remove hooks already call it via
    on_TabGroupCreate/on_TabGroupRemoved)
- `browser/components/tabbrowser/content/tabbrowser.js`
  - `addTab` index logic: `tabGroup = previousTab.group` now gated on
    `browser.tabs.stacking.openInCurrent`
  - `moveTabForward/moveTabBackward`: Vivaldi semantics behind `vivaldiStepMoves` —
    grouped tab cannot step out of its group; ungrouped tab jumps over the WHOLE group
    even when expanded; no silent ungroup at strip edges
- `browser/components/tabbrowser/content/drag-and-drop.js`
  - `shouldCreateGroupOnDrop` additionally requires `stacking.mode != 0`
- NEW `browser/components/tabbrowser/content/tab-stacks.js` — `gTabStacks` controller:
  - sets `tabstacks-mode` attr on `:root` for CSS
  - substrip: renders active group's tabs into `#tab-substrip` (favicon/label/close,
    click=select, middle-click/close-btn=close); rAF-coalesced full rebuilds;
    TabAttrModified fast-path patches a single button (label/image) without rebuild
  - single-entry modes (dotted+substrip): groups forced collapsed (re-collapse on
    TabGroupExpand via microtask), group-label click intercepted (capture) →
    activates group's `lastSeenActive` tab instead of expanding
  - dotted: maintains `data-dots`/`data-tab-count` on groups
  - accordion: auto-expands collapsed group when member tab activated (`autoExpand`)
  - Vivaldi no-singleton invariant: TabClose/TabUngrouped queue a 400ms-deferred check;
    a group left with 1 tab is dissolved (`gBrowser.ungroupTab`) — delay skips
    transient states (multi-tab moves, restores don't fire these events per-tab)
- `browser/base/content/navigator-toolbox.inc.xhtml` — `<hbox id="tab-substrip">`
  between #TabsToolbar and #nav-bar
- `browser/base/content/browser-main.js` — subscript-load tab-stacks.js
- `browser/base/content/browser-init.js` — `gTabStacks.init()` in `_delayedStartup`
- `browser/components/tabbrowser/jar.mn` — tab-stacks.js entry
- `browser/themes/shared/tabbrowser/tabs.css` — appended substrip + dotted styles
  (design-system tokens: --space-*, --border-radius-small, --toolbarbutton-*)
- `browser/locales/en-US/browser/tabbrowser.ftl` — `tabbrowser-substrip-close-tab`

## Verified event contracts (from source, not assumed)

- `TabGrouped`/`TabUngrouped`: target = the GROUP, detail = the tab
  ([tab.js:921-949](browser/components/tabbrowser/content/tab.js#L921-L949))
- `TabAttrModified`: target = tab, `detail.changed` = array of attr names
- on_TabGroupCreate/on_TabGroupRemoved in tabs.js already invalidate tab caches →
  safe to cache allGroups there

## Deliberate mappings (Vivaldi → here)

- dnd_delay 450ms → existing `createGroup.delayMS` (drop-ON-tab already upstream)
- open_in_current → openInCurrent gate on the already-existing group-inherit in addTab
- mode=off → blocks NEW group creation via DnD only (existing groups keep working)
- stack click activates last-active member (Vivaldi behavior), collapse toggle
  unavailable in single-entry modes by design

## TODO / phase 2

- substrip: drag-reorder inside substrip bar; scroll-wheel tab cycling (Vivaldi)
- dotted: per-dot hover/click targets (currently dots are display-only)
- keyboard a11y for substrip items (tabindex/arrow navigation, role=tab per item)
- vertical tabs: substrip disabled by design; consider sidebar-integrated stack view

## Display options and stack highlight (2026-07-20)

- `about:preferences#tabsBrowsing` now exposes the existing Vivaldi-style stack mode
  and behavior prefs.
- `browser.tabs.stacking.showCount` independently controls the collapsed stack count.
- The group color was rendered as a weak color-mix tint (the "2px outline" wording here was
  stale); superseded by the 2026-07-20 session below.
- `./mach build faster` passes.
- `browser_tab_stacks.js` passes 4/4 checks; `browser_tabs_browsing_pane.js` passes
  37/37 checks in headless browser-chrome runs.

## Session 2026-07-20: titles, color, gesture settings + engine parity

Full audit + plan in `.futures/2026-07-20-stack-titles-color-gesture-settings.md`.

- Unnamed-stack titles: tabgroup.js writes ZWSP as the visible label for unnamed groups
  (only aria-label falls back). `gTabStacks._updateFallbackLabel` now stamps the
  last-active member's title into the group's `label` ATTRIBUTE (persisted `name` stays
  empty) and maintains a `data-unnamed` attribute; restored to ZWSP when mode=off.
- Stack color: chip fill/outline removed for all states in stacking modes
  (`tab-group .tab-group-label` override, guarded `@media not (forced-colors)`);
  tabs tinted with true `--tab-group-color` (30% members, 50% visuallyselected,
  transparent mixes keep channel purity for tests); unnamed collapsed group with a
  visible active tab hides its label container entirely (the tinted tab IS the stack).
- Gesture engine: extracted `browser/modules/MouseGestureDetector.sys.mjs` (Vivaldi
  algorithm: 5px start, strokeTolerance/2 per move, axis-compare sectors, repeat-twice
  dedup). browser-mouseGesture.js now attaches mousemove/mouseup/blur only during a
  right-drag (zero idle cost), uses lazy pref getters, eats mousemoves while recording.
  New pref `browser.gesture.mousegesture.strokeTolerance` (20). `ui.context_menus.after_mouseup`
  flipped true so GTK menus open on release (fixes menu+gesture double-fire on Linux).
- Gesture settings: `browser/components/preferences/widgets/gesture-mapping/` — Lit
  widget replacing the static 11-dropdown fieldset. Dynamic pref-branch enumeration,
  SVG stroke diagrams, tolerance slider, Vivaldi-style capture box (right-drag draws
  on canvas via the shared detector), conflict warning.
  Gotcha: DOM elements cannot be XPCOM pref observers (NS_ERROR_XPC_BAD_CONVERT_JS);
  use a plain `{ observe }` wrapper object.
- Rework after review: Vivaldi's real model is `vivaldi.actions` in
  vivapp/src/prefs_definitions.json — a 181-command catalog where each action carries
  optional `shortcuts` and `gestures` (12 default gesture bindings; note `e`-prefixed
  patterns = gesture started over a link, driving the `*_LINK` commands — unported,
  phase 2). Final UI matches Vivaldi's Gesture Mapping master-detail layout:
  selectable listbox of bound command names, side preview panel drawing the selected
  gesture, toolbar with [+] add / [-] remove / [pencil] edit / "Restore default
  gestures". Add/edit opens the interactive capture editor (right-drag recording via
  the shared detector, live canvas trail) with a searchable command picker (input box
  + filtered dropdown). Command inventory = curated l10n list + live enumeration of
  every `commandset command[id]` in the top browser window; free-text command ids
  accepted. Edit re-records the pattern and clears the old binding on save; restore
  clears the user branch (custom gestures vanish, defaults return).
  Test gotcha: synthesized PointerEvents can drive the capture editor end-to-end, but
  `setPointerCapture` throws for fake pointerIds — wrapped in try/catch.
- Tests: browser_mouseGesture.js rewritten around the shared detector;
  browser_tab_stacks.js + new fallback-title task; new browser_gesture_mapping.js
  (srd manifest). Headless: 74/74 across the four files. Lint clean.

## Session 2026-07-20 (later): substrip titles, label color, content gestures

- Substrip missing titles: XUL hbox children are CSS flex items (flex-shrink 1);
  crowded substrip squashed items so labels cropped to zero. Fix: `.tab-substrip-tab`
  gets `flex: 1 1 0; min-width: 6em` — equal widths with a floor, bar scrolls past it.
- Group label now keeps the group color as a filled pill in ALL stack states
  (upstream inverts collapsed labels); text uses upstream's pale/dark pairing.
- In-browser gestures were dead over web pages, root cause chain (all fixed):
  1. Pointer moves over remote content NEVER reach parent-process DOM listeners
     (same reason autoscroll uses actors). New JSWindowActor pair
     browser/actors/MouseGestureChild|Parent.sys.mjs: child runs the shared detector
     locally (listeners attached only while right button held), sends only the final
     direction string; parent calls gMouseGestureSupport.executeGesture().
     GOTCHA: without `safeForUntrustedWebProcess: true` the actor silently never
     matches "web"/"file" remote types (dom.jsipc.check_safeForUntrustedWebProcess).
  2. Command dispatch via createEvent("xulcommandevent")+initCommandEvent no longer
     triggers commandset handlers; replaced with `node.doCommand()`.
  3. Half the command ids in the catalog/defaults were fictional (Browser:OpenTab,
     Browser:CloseTabOrWindow, Browser:Downloads, ...) — goDoCommand fallback
     no-ops silently. All ids now verified against browser-sets.inc.xhtml
     (cmd_newNavigatorTabNoEvent, cmd_close, Tools:Downloads, Tools:Addons,
     View:FullScreen, Browser:AddBookmarkAs, cmd_print, Tools:Search,
     Browser:SearchBookmarks, History:SearchHistory, ...); added NextTab/PrevTab/
     UndoCloseTab/DuplicateTab/Stop/ReaderView; dropped bogus "home".
     NOTE: cmd_newNavigatorTab (with-event form) does NOT open a tab when the
     command event is synthetic; use cmd_newNavigatorTabNoEvent programmatically.
  4. Test gotcha: BrowserTestUtils.waitForNewTab(gBrowser) with no url never
     resolved for the command-opened tab; wait for "TabOpen" on tabContainer.
- DEV GOTCHA (affects manual testing): launching the objdir build against an
  existing profile serves STALE chrome JS from the profile's startupCache
  (`build faster` does not bump buildID). Use `./mach run` (purges caches) or
  delete startupCache in the profile — otherwise "my fix does nothing".
- E2E coverage: test_content_gesture_executes_command drives a right-drag through
  the content process via the actor chain and asserts the bound command runs.
  Headless: 82/82 across the four test files.
- Menu-still-opens follow-up: ContextMenuChild.sys.mjs FORCES defaultPrevented=false
  for non-system documents when `dom.event.contextmenu.enabled` is false (the common
  "sites can't block right-click" user pref) — child-side preventDefault after a
  gesture is then ignored and the menu opens anyway. Fix: parent-side gate —
  executeGesture opens a 500ms one-shot suppression window; a popupshowing listener
  on #contentAreaContextMenu cancels the popup inside it. Covered by
  test_content_gesture_suppresses_context_menu (runs with the pref set to false).
- Forgiveness parity: the detector algorithm is identical to Vivaldi's, but DOM
  mousemove is coalesced to ~1/frame while Vivaldi consumes raw OS-rate motion.
  Fast multi-stroke gestures (circles) then produce one big delta per direction
  and the confirm-twice rule never fires. Fix: all three consumers (chrome
  engine, MouseGestureChild, capture box) listen for pointermove and feed every
  `getCoalescedEvents()` sample to the detector (pointerType "mouse" only in
  the browser paths).
- Gestures are now OPT-IN: `browser.gesture.mousegesture.enabled` defaults false
  (settings checkbox turns them on; the MouseGesture actor auto-(un)registers via
  enablePreference). While enabled, gMouseGestureSupport._applyContextMenuOverride
  flips the DEFAULT branch of dom.event.contextmenu.enabled to false so sites
  cannot override right-click; explicit user values win, nothing persisted.
  Covered by test_contextmenu_default_follows_gestures. 86/86 headless.

## Session: group-aware close selection + last-tab behavior (2026-07-20)

Request: closing a tab in a group should select the next tab to the right
within the group, else left within the group, never a tab outside it; and
closing the last tab should open a new tab instead of closing the window.

Findings:
- Neither behavior exists in native Firefox. `_findTabToBlurTo`
  (tabbrowser.js) goes successor -> owner -> optional MRU -> adjacent
  visible tab with zero group awareness; collapsed-group members are only a
  last-resort fallback.
- `browser.tabs.closeWindowWithLastTab` already exists (default true =
  close window) but has no settings UI.

Changes:
- tabbrowser.js `_findTabToBlurTo`: new step after the successor check,
  gated on new pref `browser.tabs.selectWithinGroupOnClose` (default true):
  filter group members (minus closing/excluded) and pick `findNextTab`
  direction 1 then -1. Runs before the owner check so group wins over
  owner; successor (ctrl-tab MRU machinery) still wins when set.
- firefox.js: `closeWindowWithLastTab` default flipped to false;
  `selectWithinGroupOnClose` added (true).
- tabs-browsing.mjs + preferences.ftl: two checkboxes in the Closing
  fieldset - `closeSelectsWithinGroup` (visible only when tab groups
  enabled) and `lastTabOpensNewTab` (uses `inverted: true` in
  Preferences.addAll so checked = open new tab).
- New test browser_close_select_within_group.js (tabbrowser/tabs suite):
  right-then-left in-group selection, pref-off adjacency, collapsed-group
  member selection, closeWindowWithLastTab default assertion.

Gotchas:
- `gBrowser.addTabGroup(tabs)` APPENDS the group at the end of the strip
  unless `{ insertBefore: firstTab }` is passed; first test run failed on
  tab-order assumptions because of this.
- Empty-group removal is async; assert with TestUtils.waitForCondition.
- Pre-existing browser.toml lint errors (skip-if variable order,
  `a11y_checks && opt` -> `opt && a11y_checks`) fixed in passing.

Results: browser_close_select_within_group 6/6,
browser_selectMRUOnClose 4/4, browser_tabs_browsing_pane 39/39, lint clean,
build faster green. startupCache of the tabstacks profile is stale again
after this rebuild - relaunch with ./mach run or purge.

## Session addendum: Close Tab Group menu item + group-close priority fix

- Added "Close Tab Group" to the Close Multiple Tabs submenu of the tab
  context menu, visible only when the context tab is in a group (substrip
  buttons are synthetic and have no contextmenu path, so this is
  effectively top-level-only). Files: main-popupset.inc.xhtml (menuitem),
  tab-context-menu.js (both structure and altstructure item lists, plus
  hidden state and the submenu-disabled aggregate in updateContextMenu),
  main-popupset.js (command -> gBrowser.removeTabGroup, which handles
  beforeunload itself), tabContextMenu.ftl (tab-context-close-tab-group).
- User reported group-close selection still broken live. Real hole found:
  the successor check (set by ctrl-tab MRU) ran before the group check, so
  with "Ctrl+Tab cycles in recently used order" enabled every close
  followed the MRU successor out of the group. Group preference now runs
  first in _findTabToBlurTo. New test task test_group_wins_over_successor.
- Test gotcha: EventUtils contextmenu synthesis on a NON-selected tab hangs
  headless (popup "shown" never fires); altStructure only ever opens on
  selectedTab. Deterministic pattern instead: dispatch empty Event on the
  tab then menu.openPopup(tab, "end_after", 0, 0, true, false, evt) - same
  as head.js updateTabContextMenu.
- Results: browser_close_select_within_group 7/7,
  browser_tabContextMenu_closeTabGroup 4/4, altStructure 12/12,
  selectMRUOnClose 4/4. Lint clean, build faster green. startupCache stale
  again after rebuild.

## Session addendum 2: Unload Tab submenu (2026-07-21)

"Unload Tab" is now a submenu (context_unloadTabOptions / popup
unloadTabOptions) with two items: context_unloadTab (old count-aware
behavior on the context tabs) and context_unloadBackgroundTabs (unloads
every tab in the window except the selected one; filter !selected,
!hidden, linkedPanel, isRemoteBrowser -> gBrowser.explicitUnloadTabs).
Semantics change: pref browser.tabs.unloadTabInContextMenu now hides the
whole SUBMENU; a non-unloadable context tab DISABLES the Unload Tab item
instead of hiding it (count display clamped to >= 1 when 0).

Gotchas:
- XULPopupElement::ActivateItem throws "Menu item is hidden" for items in
  a closed submenu (no frame). All 20 menu.activateItem(menuItemUnload)
  call sites across the three multiselect unload test files replaced with
  new head.js helper activateSubmenuItem(item) which opens the containing
  submenu first. Plain item.click() (splitview test) still works on
  frameless nested items.
- Two tests asserted the old hidden semantics; updated to submenu-hidden /
  item-disabled.

New test browser_tabContextMenu_unloadBackgroundTabs.js. Results: unload
45/45, telemetry 39/39, beforeunload 11/11, altStructure 12/12, keyboard
pass, closeTabGroup 6/6, splitview_about_opentabs pass. Launcher now has
-purgecaches so restart alone picks all this up.
