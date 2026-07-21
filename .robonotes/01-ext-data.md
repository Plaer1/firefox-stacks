# 01 — viv_ext_data: the storage layer for stacks

Files: `components/ext_data/tab_ext_data_impl.{h,cc}` (931 loc), `tab_ext_data.h`,
`tab_ext_data_observer.h`, `tab_positioning_params.h`.

## Model

`TabExtDataImpl` is a `content::WebContentsUserData` + `WebContentsObserver` — one instance
per tab, holding a `base::DictValue value_` (arbitrary JSON dict, "extData" from the JS side).

## Keys relevant to stacks (constants in tab_ext_data_impl.cc)

| JSON key | enum | type | flags | meaning |
|---|---|---|---|---|
| `group` | `kGroupId_` | string | NullAllowed, **Unsafe**, **Salted** | stack membership UUID. Same value across tabs = one stack |
| `fixedGroupTitle` | `kFixedGroupTitle` | string | NullAllowed, Unsafe | user-set stack title ("" → treated as none) |
| `groupColor` | `kGroupColor` | string | NullAllowed, Unsafe | stack color |
| `expandStatus` | `kExpandStatus` | bool | NullAllowed | accordion-mode expanded state |
| `collapsed` | `kCollapsedTab` | bool | NullAllowed | compact-stack collapsed flag |
| `ext_id` | `kExtId` | string | SetOnce, Salted | UI-generated stable tab UUID (distinct from tab id) |
| `parent_ext_id` | `kParentExtId` | string | NullAllowed, Salted | parent tab reference (tab-tree-ish, used for "open as stack from link") |
| `workspaceId` | `kWorkspaceId` | double | NullAllowed, Salted | workspaces feature (interacts: panel can't join workspace) |

Other keys (not stack): panelId, thumbnail, urlForThumbnail, vivaldi_tab_muted, tiling,
fixedTitle, followerTabExtId, parentFollowerTabExtId, restrictPinnedTab, vivaldi_tab_zoom,
interval, purpose, restoreStatus. Special control key `migration` (bool) disables write checks
for migration scripts.

## Flag semantics

- `kUnsafe`: settable only via `SetUnsafe()` — i.e. NOT via generic `chrome.tabs.update` extData
  merge. groupId/title/color are Unsafe → UI must go through dedicated motion/group APIs.
  Sanitizer explicitly logs + aborts: "can't update groupId directly" when merge & !restore.
- `kSetOnce`: ext_id, panelId, purpose — write-once.
- `kSalted`: on restore with a salt, string UUIDs are remapped:
  `RemapUUID(uuid, salt)` = SHA1(uuid+salt) formatted as UUIDv4. Guarantees restoring the same
  session twice yields distinct group ids/ext ids, while preserving intra-session grouping.
  workspaceId (double) has its own `RemapWorkspaceId`.

## Sanitizer rules (SanitizeBeforeUpdate / SanitizeAfterChange)

- Setting `group` (groupId) via plain merge (chrome.tabs.update path) → **abort** unless
  restore or migration flag. Same for title/color.
- After groupId changes → `fixedGroupTitle` and `groupColor` are **removed** from that tab
  (`SanitizeAfterChange`): "changing groupId is supposed to set a new group with new color and
  title". Skipped during restore (tabs restored one-by-one would lose restored title/color).
- Groups of size 1 don't exist; during restore the strip is temporarily inconsistent until the
  2nd member arrives (comment in OnKeyChange).
- parent_ext_id can't equal own ext_id (loop prevention).
- workspaceId==0 means "remove from workspace" (kRemove).
- panel tabs can't be in workspaces and vice versa.
- foreign restore (chrome.session.restore) must NOT restore extId/panelId.

## Change notification

- `OnKeysChanged(impl, changed_keys)` to observers; plus global callback list
  `vivaldi::GetExtDataUpdatedCallbackList().Notify(web_contents)`.
- Notifications pausable/reentrancy-guarded (ExtDataNotifyGuard); only fire when
  `in_tab_strip_` is true.
- `changed_keys_` capped by `CHECK(< 200)`.

## Takeaway for firefox-stacks

Simplest faithful model: per-tab metadata bag with a `group` UUID + denormalized title/color,
sanitizer keeps invariants (no singleton groups, title/color reset on regroup, salted remap on
restore). In Firefox terms: could live on tab via Session Store per-tab values
(`SessionStore.setCustomTabValue`-style) — same shape as vivExtData. NB Firefox already has
native tab groups (Fx 137+) — see 07-firefox-mapping.md.
