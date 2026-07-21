/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

async function openTabMenuFor(tab) {
  let menu = document.getElementById("tabContextMenu");
  let evt = new Event("");
  tab.dispatchEvent(evt);
  let shown = BrowserTestUtils.waitForPopupEvent(menu, "shown");
  menu.openPopup(tab, "end_after", 0, 0, true, false, evt);
  await shown;
  return menu;
}

add_task(async function test_unload_background_tabs_menu_item() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.tabs.unloadTabInContextMenu", true]],
  });

  let tabA = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "http://mochi.test:8888/#a"
  );
  let tabB = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "http://mochi.test:8888/#b"
  );
  await BrowserTestUtils.switchTab(gBrowser, tabA);

  let submenu = document.getElementById("context_unloadTabOptions");
  let unloadTabItem = document.getElementById("context_unloadTab");
  let backgroundItem = document.getElementById("context_unloadBackgroundTabs");

  let menu = await openTabMenuFor(tabA);
  ok(!submenu.hidden, "The unload submenu is visible");
  ok(!unloadTabItem.disabled, "Unload Tab is enabled for a loaded tab");
  ok(!backgroundItem.disabled, "Unload Background Tabs is enabled");

  let menuHidden = BrowserTestUtils.waitForPopupEvent(menu, "hidden");
  await activateSubmenuItem(backgroundItem);
  await menuHidden;

  await TestUtils.waitForCondition(
    () => !tabB.linkedPanel,
    "The background tab was unloaded"
  );
  ok(tabA.linkedPanel, "The foreground tab stays loaded");

  BrowserTestUtils.removeTab(tabB);
  BrowserTestUtils.removeTab(tabA);
  await SpecialPowers.popPrefEnv();
});
