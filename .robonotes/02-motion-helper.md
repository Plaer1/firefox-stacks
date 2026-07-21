# 02 — TabsMotionHelper: move/drag/drop + group decision engine

Files: `extensions/api/tabs/tabs_motion_helper.{h,cc}` (1163 loc), `browser/tab_probe.h`,
`browser/related_tab_strip_helper.*`. Unit tests: `tabs_motion_helper_unittest.cc` (52k!) —
excellent behavior spec, read when porting.

## Role

ALL tab movement from the UI goes through `vivaldi.tabsPrivate.move()` → `TabsMotionHelper`.
The helper is a pure PLANNER: given params it computes (a) list of `Move{tab_id, insert_index,
contents}`, (b) suggested group for moved tabs, (c) reparent id (tab-tree parent). Execution is
done by the API function afterwards (chrome.tabs.move-like semantics per tab, then
`ConfigureGroup()` per moved tab).

## Input params (schema tabs_private.json `move`)

- `tabIds` (int/int[]) and/or `extIds` (string/string[] — **an extId may denote a whole group**)
- `target`: index OR tabId OR extId of tab/stack OR special strings `left|right|first|last`
- `windowId`, `workspaceId`, `groupHint`, `debug`
- `tweaks[]` (TabMotionTweaks enum):
  - `target-is-tab`, `below`, `above`, `on` (drop ONTO tab/group = join/create stack)
  - `strip-up` — dragging in top-level strip: never joins group unless `on`
  - `strip-down` — dragging INSIDE a stack's substrip: moves within the group only
  - `strip-accordion` — accordion mode: falls into group only if both neighbors share it
  - `strip-no-stacks` — stacking disabled
  - `detached`, `create-group` (create if wouldn't fall into any), `create-new-group` (explicit)
  - `do-not-reparent`, `untile`, `ungroup`, `expand-related`, `collapsed-above`
- So THE UI decides the mode (accordion/compact/off) and passes it as strip-* tweaks;
  C++ then enforces group semantics for that mode.

## Init pipeline (Create(), in order — each step can veto with error string)

1. `TweaksConsistencyCheck` — only one of below/above/on; strip-* requires target-is-tab.
2. `TakeTargetTabsFromParam` — resolve probes; `expand-related` expands tab-tree; forbids
   mixing pinned+unpinned in one move.
3. `RecognizeTarget` — resolve target tab/group/index/special; group targets: `below` a group
   means below its LAST tab; `on` a group sets target_group_; strip-up drop between tabs
   redirects a grouped target to its whole group boundary; pinned boundary respected;
   collapsed-above skips whole collapsed tree.
4. `UpdateGroupsCount` — count per group: total tabs vs moving tabs (across ALL windows).
5. `UpdateCommonGroup` — common group of all moving tabs (whole-stack drag detection).
6. `CreateMoves` — split into same_left/same_right/cross-window; ordered insertions preserving
   relative order; `IsVoidMotion()` suppresses no-op whole-group drags next to itself.
7. `SecureReparentId` — loop prevention for tab-tree parent.
8. `RecognizeTargetGroup` — decides SUGGESTED GROUP (see below), caches sample tab of group.
9. `HandlePinning` — pinned tabs can't join unpinned groups and vice versa.
10. `CheckGroupChange` — final veto: strip-down can't change group; accordion can't join
    groups on linear strip ("can't join accordion groups").

## Group suggestion algorithm (SuggestGroupInternal) — THE core heuristic

```
if avoid_groups                            -> none
if strip-up and not "on"                   -> none   (drop between tabs at top level)
if is_step and strip-up                    -> none
group_above = group of tab at target-1
group_below = group of tab at target
if group_above == group_below (both set)   -> that group  // dropped INSIDE a stack; forced,
                                                          // prevents split-group inconsistency
if linear strip (accordion/no-stacks)      -> none
if all dragged tabs share group AND above!=below -> keep their group (whole-stack drag between stacks)
else                                       -> target_group_ (group of the "on"-target)
```
Plus: `create-group` generates new UUID if suggestion empty; `create-new-group` always
generates fresh UUID (`new_group_=true`).

## Applying group to moved tabs

`ConfigureGroup(probe)` per moved tab:
- no suggested group → `ext_data->Ungroup()` (removes group key; sanitizer wipes title/color)
- group has an existing sample tab → `ext_data->JoinGroup(sample)` — copies groupId +
  fixedGroupTitle + groupColor from the sample member (this is how title/color stay
  denormalized-but-consistent across members)
- else → raw `SetUnsafe(kGroupId_)`.

`JoinGroup(source, create=true)` also handles "stack two loose tabs": generates one UUID and
sets it on both.

## Special moves

- `left/right`: step over; grouped tab can't leave its group by stepping; ungrouped tab JUMPS
  over whole groups (`GetLastInGroup`, avoid_groups_=true).
- `first/last`: within group if grouped, else within workspace.
- Workspace-aware everywhere (GetLastInWorkspace; workspaceId 0 = none).

## Firefox-relevant takeaways

- Keep planner (index computation + group decision) separate from executor. Pure function =
  testable (52k of unit tests prove the value).
- The "both neighbors same group → forced join" rule is the linchpin of contiguity.
- Group contiguity is NEVER stored; it's an invariant maintained at move time.
- Modes (accordion/compact/none) are caller-supplied flags, not global state in the planner.
