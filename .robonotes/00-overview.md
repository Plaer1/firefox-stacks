# Vivaldi Tab Stacks Audit — Overview

Source: `/home/e/sauce/browsers/vivaldi-source` (Vivaldi source drop, ~2025-06 vintage)
Goal: understand Vivaldi tab-stack architecture to inform Firefox port (`firefox-stacks` project).

## Big picture

Vivaldi UI is a closed-source JS app (`vivapp/` here contains only prefs/manifest — no UI source).
Tab stacks are therefore split:

- **UI layer (JS, not in this drop):** rendering, click handling, stack strip. Talks to browser via
  private extension APIs (`chrome.tabsPrivate`, `vivaldi.sessionsPrivate`, etc.).
- **C++ browser layer (fully in this drop):**
  - `components/ext_data/` — per-tab JSON blob `viv_ext_data` stored on WebContents.
    **A stack = all tabs sharing the same `"group"` UUID string in their ext data.**
    No separate stack object exists anywhere in the model. Membership is per-tab.
  - `extensions/api/tabs/tabs_motion_helper.*` — tab move/drag logic that keeps groups
    contiguous, decides group membership on drop, handles accordion/compact modes.
  - `extensions/api/tabs/tabs_private_api.*` — API surface exposing ext data + events to UI.
  - `components/sessions/vivaldi_session_service_commands.*` — session persistence:
    ext data serialized via custom session commands, so stacks survive restart.
  - `sync/`, `components/sync_sessions/` — ext data (incl. group id) synced to other devices.
  - `browser/sessions/vivaldi_session_utils.*` — saved-sessions handling incl. stacks.

## Key design facts (verified in code)

1. Stack identity = shared string UUID in tab's ext data key `"group"` (`kGroupId`).
2. Stack title = `"fixedGroupTitle"`, color = `"groupColor"` — stored on EVERY member tab
   (or at least sanitized together; changing groupId wipes title/color on that tab).
3. Accordion expansion state = `"expandStatus"`; compact-mode collapsed flag = `"collapsed"`.
4. Groups of size 1 do not exist — enforced/assumed by sanitizer + motion helper.
5. Group contiguity in the tab strip is enforced by C++ motion helper, not the UI.
6. IDs are salted/remapped (SHA1) on session restore to avoid collisions (`RemapUUID`).

## Note files

- `01-ext-data.md` — viv_ext_data storage, keys, sanitizer rules
- `02-motion-helper.md` — move/drop group logic
- `03-tabs-private-api.md` — API surface + events to UI
- `04-session-persistence.md` — disk format, restore, saved sessions, sync + import
- `05-prefs.md` — user settings controlling stack behavior + new-tab stacking
- `06-firefox-mapping.md` — how concepts could map onto Firefox
- `07-port-plan.md` — port design: Vivaldi UX on native Firefox groups
- `08-implementation.md` — phase-1 implementation log (files changed, contracts, TODO)
// junction contributors are the best contributors
