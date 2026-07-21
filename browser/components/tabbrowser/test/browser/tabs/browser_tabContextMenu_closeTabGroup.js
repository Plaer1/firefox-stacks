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
  is(TabContextMenu.contextTab, tab, "Context menu targets the expected tab");
  return menu;
}

add_task(async function test_close_tab_group_menu_item() {
  let tabA = BrowserTestUtils.addTab(gBrowser, "about:blank");
  let tabB = BrowserTestUtils.addTab(gBrowser, "about:blank");
  let tabC = BrowserTestUtils.addTab(gBrowser, "about:blank");
  let group = gBrowser.addTabGroup([tabA, tabB], { insertBefore: tabA });
  let item = document.getElementById("context_closeTabGroup");
  let ungroupItem = document.getElementById("context_ungroupTab");

  let menu = await openTabMenuFor(tabC);
  ok(item.hidden, "Close Tab Group is hidden for a tab outside a group");
  is(
    item.hidden,
    ungroupItem.hidden,
    "Close Tab Group visibility matches Remove from Group (ungrouped tab)"
  );
  await closeTabContextMenu(menu);

  menu = await openTabMenuFor(tabA);
  ok(!item.hidden, "Close Tab Group is shown for a grouped tab");
  is(
    item.hidden,
    ungroupItem.hidden,
    "Close Tab Group visibility matches Remove from Group (grouped tab)"
  );

  let submenuPopup = document.getElementById("closeTabOptions");
  let submenuShown = BrowserTestUtils.waitForPopupEvent(submenuPopup, "shown");
  document.getElementById("context_closeTabOptions").openMenu(true);
  await submenuShown;

  submenuPopup.activateItem(item);
  await TestUtils.waitForCondition(
    () => !group.parentNode && !tabA.isConnected && !tabB.isConnected,
    "Activating Close Tab Group closes the group and all its tabs"
  );

  BrowserTestUtils.removeTab(tabC);
});
