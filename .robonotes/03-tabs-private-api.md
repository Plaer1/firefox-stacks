# 03 — tabsPrivate API: stack surface between UI (JS) and browser (C++)

Files: `extensions/api/tabs/tabs_private_api.{h,cc}` (75k), `extensions/schema/tabs_private.json`,
`extensions/helper/ext_data_helper.cc`, `browser/tab_strip_sanitizer.cc`,
`components/browser/vivaldi_tabs_event_router.cc`.

## Stack-relevant functions (schema names)

- `move(moveProperties)` → TabsMotionHelper plan + execute (see 02). Returns
  `{success, group /* new group id if created */, existingGroup}`.
- `unstack(id)` — id may be a tab extId OR group id; walks ALL windows, `Ungroup()` every tab
  whose extId or groupId matches. Dead simple: dissolving a stack = remove key from members.
- `setGroupProperties({groupExtId, groupColor?, groupTitle?})` — via
  `ext_data_helper::SetGroupTitle/Color`: iterates all windows/tabs with that groupId and
  sets/removes `fixedGroupTitle` / `groupColor` on EACH member (denormalized write-fanout).
- `notifyCollapse(extId, collapsed)` — UI → C++ persistence of collapse state (`collapsed` key).
- `update(tabId, tabInfo)` / `get(tabId)` — generic extData merge/read (groupId blocked here
  by sanitizer, Unsafe flag).
- `clone(ids, windowId, index, pinned)` — duplicate tabs.
- `notifyActiveWorkspace(windowId, workspaceId)`.

## Execution order in move() (important!)

1. Create motion plan (can fail with error string → returned to JS).
2. `VivaldiSanitizerGuard` disables tab-strip sanitizer for affected strips during operation.
3. Set workspaceId on movers.
4. Reparent (`parent_ext_id`) unless `do-not-reparent`.
5. `untile` tweak → remove tiling.
6. GROUP ASSIGNMENT before physical move:
   - `on` + suggestion → ConfigureGroup on all moved tabs AND the target tab
     (this is "drop tab onto tab = create 2-tab stack").
   - else per-tab: `ungroup` tweak → Ungroup; strip-up & !on → Ungroup unless entire group
     moving; suggestion → ConfigureGroup; grouped but partial group move → Ungroup.
7. PHYSICAL moves executed last. Comment: ext-data must be set BEFORE the move so JS event
   order is UPDATE → REMOVE → CREATE (PageStore in UI loses track of detached tabs otherwise).
8. `SanitizeGroupSplit(target_strip)` — post-move invariant repair.

## Invariant repair (browser/tab_strip_sanitizer.cc)

- `SanitizeGroupSplit`: group appearing in 2+ contiguous runs `[g g x g g]` → keep LARGEST
  run, Ungroup the rest.
- `SanitizeGroups`: any group with only 1 member → Ungroup (no singleton stacks).
- `SanitizeAllTabs`: both, across every window. Guarded/disabled during planned operations
  via `related_tabs::VivaldiSanitizerGuard`.

## Events to UI

- `tabsPrivate.onExtDataChanged(tabId, extData)` — emitted via
  `components/browser/vivaldi_tabs_event_router.cc`, which observes TabExtData
  (`OnKeysChanged`/global callback list from 01). UI re-renders stacks purely from per-tab
  extData snapshots. No dedicated "group changed" event — group is just extData.

## Takeaway

API is thin; ALL stack semantics live in motion helper + sanitizers + ext_data flags.
UI-side model = derived view over per-tab extData, rebuilt from onExtDataChanged events.
