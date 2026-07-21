# 04 — Session persistence & restore of stacks

Files: `components/sessions/vivaldi_session_service_commands.{h,cc}` + `*.inc` patches,
`browser/sessions/vivaldi_session_utils.{h,cc}`, `components/sessions/vivaldi_live_tab_context.cc`,
`components/sessions/vivaldi_tab_restore_service_client.cc`, `sessions/index_codec.cc`.

## Live session (crash-safe session file)

Vivaldi extends Chromium's command-log session format with custom SessionCommands:
- `kCommandSetExtData` → `CreateSetTabVivExtDataCommand(tab_id, viv_ext_data_json_string)`
  — whole per-tab extData dict pickled as one string (max ~64k enforced).
- `kCommandSetWindowExtData` → same for per-WINDOW extData.
- Chromium's `SessionTab` / `SessionWindow` structs are patched with a `viv_ext_data`
  std::string member (see `vivaldi_session_service_commands*.inc` included into Chromium
  session code; also handles legacy `kCommandSetTabGroup` translation).

So stacks persist automatically: group id/title/color ride inside the tab's extData JSON blob.
Restore path: `TabExtDataImpl::Restore(json, RestoreArgs)` (see 01) with:
- `foreign=false` for startup restore, `foreign=true` for `chrome.session.restore()` calls
  (foreign forbids restoring extId/panelId);
- `ext_id_salt` → `RemapUUID` on salted keys (group, ext_id, parent_ext_id, workspaceId) so a
  session restored twice gets fresh-but-consistent group ids.

## Saved sessions (.bin session files, Sessions panel)

`browser/sessions/vivaldi_session_utils.cc`:
- Tab-level: keys `group` (stack id), `fixedTitle`, `fixedGroupTitle`, `workspaceId`, `flag`
  (quarantine bit) read/written by parsing each tab's `viv_ext_data` JSON.
- Window-level: `groupTitles` dict {groupId: title} — LEGACY location for stack titles;
  per VB-23686 titles moved into per-tab `fixedGroupTitle`; writer now emits empty
  `SetGroupNames({})` for the index node.
- `StackController` (in the same file): when saving/filtering a subset of tabs, tracks tabs per
  groupId; **any group left with < 2 members gets its group id (and window-level title entry)
  stripped** — same "no singleton stacks" invariant enforced at save time.
- `sessions/index_codec.cc`: saved-session index (Index_Model/Index_Node) stores workspaces
  and (legacy) group names per node.

## Tab restore (reopen closed tab)

`components/sessions/vivaldi_persistent_tab_restore_service.inc` +
`vivaldi_tab_restore_service_client.cc` + `vivaldi_live_tab_context.cc` — carry `viv_ext_data`
through the closed-tab entries so reopened tabs rejoin their stack (group id still in blob;
strip sanitizers fix membership if the rest of the stack is gone).

## Sync

`SyncedTabDelegate::GetVivExtData()` default returns `"{}"`;
`browser/ui/viv_tab_contents_synced_tab_delegate.cc` overrides it to return the live tab's
extData; `components/sync_sessions/vivaldi_local_session_observer.cc` feeds it into session
sync specifics. Remote devices thus see stacks in synced sessions. Importer
(`importer/imported_tab_entry.{h,cpp}`, `vivaldi_profile_writer.cc`) also maps ext data incl.
group when importing from another Vivaldi profile.

## Firefox mapping hint

Firefox equivalent = SessionStore. Per-tab custom values (`tab.__SS_extdata`-style /
`SessionStore.setCustomTabValue`) already persist through sessionstore.jsonlz4, closed-tab
data, and session restore — same architecture (opaque per-tab bag riding the session format).
Firefox native tab groups (137+) persist via sessionstore too.
