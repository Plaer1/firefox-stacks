/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Preferences } from "chrome://global/content/preferences/Preferences.mjs";
import { SettingGroupManager } from "chrome://browser/content/preferences/config/SettingGroupManager.mjs";

Preferences.addAll([
  { id: "browser.gesture.mousegesture.enabled", type: "bool" },
]);

Preferences.addSetting({
  id: "mouseGesturesEnabled",
  pref: "browser.gesture.mousegesture.enabled",
});
Preferences.addSetting({ id: "mouseGestureMapping" });

SettingGroupManager.registerGroups({
  mouseGestures: {
    l10nId: "mouse-gestures-heading",
    headingLevel: 2,
    iconSrc: "chrome://global/skin/icons/cursor-arrow.svg",
    items: [
      {
        id: "mouseGesturesEnabled",
        control: "moz-checkbox",
        l10nId: "mouse-gestures-enabled",
      },
      {
        id: "mouseGestureMapping",
        control: "gesture-mapping",
      },
    ],
  },
});
