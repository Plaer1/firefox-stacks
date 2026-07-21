![Firefox Browser](./docs/readme/readme-banner.svg)

[Firefox](https://firefox.com/) is a fast, reliable and private web browser from the non-profit [Mozilla organization](https://mozilla.org/).

## Tab Stacks

Vivaldi-style tab stacks layered on top of native tab groups. Groups are represented by a shared UUID in each tab's extended data — no separate stack object exists. Stack title, color, and membership are stored per-tab.

### Display Modes

| Mode | Description |
|------|-------------|
| **Off** | Stacks exist in the model but no visual chrome is rendered. |
| **Dotted** | A colored dot with a count badge appears on the active tab in a stack. |
| **Substrip** | A second-level tab bar appears below the main strip showing the active group's tabs. |
| **Accordion** | Stacked tabs expand inline to show child tabs when the group is active. |

Configure via `browser.tabStacks.mode` in `about:config`.

### Key Files

- `browser/components/tabbrowser/content/tab-stacks.js` — UX layer (substrip rendering, dot badges, dissolve logic)
- `browser/themes/shared/tabbrowser/tabs.css` — stack-related CSS (search for `tab-stacks`)
- `browser/components/tabbrowser/content/tabgroup.js` — native tab group label/color handling

## Mouse Gestures

Right-click-and-drag mouse gesture support for executing browser commands. Direction encoding follows a 4-sector compass: right=`0`, down=`2`, left=`4`, up=`6`.

### Configuration

Gestures are mapped via preferences in `about:config` under `browser.gesture.mousegesture.*`. The settings UI is at General > Mouse Gestures in preferences, with support for 11 preset direction patterns (single and two-stroke).

### Key Files

- `browser/base/content/browser-mouseGesture.js` — gesture detection engine (tracks mouse movement, encodes direction sequences, dispatches commands)
- `browser/base/content/browser-gestureSupport.js` — lower-level gesture plumbing (pinch, twist, wheel gestures)
- `browser/components/preferences/config/mouse-gestures.mjs` — preferences UI config (available commands, direction labels)
- `browser/app/profile/firefox.js` — default gesture-to-command mappings

### Contributing

To learn how to contribute to Firefox read the [Firefox Contributors' Quick Reference document](https://firefox-source-docs.mozilla.org/contributing/contribution_quickref.html).

We use [bugzilla.mozilla.org](https://bugzilla.mozilla.org/) as our issue tracker, please file bugs there.

### Resources

* [Firefox Source Docs](https://firefox-source-docs.mozilla.org/) is our primary documentation repository
* Nightly development builds can be downloaded from [Firefox Nightly page](https://www.mozilla.org/firefox/channel/desktop/#nightly)

If you have a question about developing Firefox, and can't find the solution
on [Firefox Source Docs](https://firefox-source-docs.mozilla.org/), you can try asking your question on Matrix at
chat.mozilla.org in the [Introduction channel](https://chat.mozilla.org/#/room/#introduction:mozilla.org).
