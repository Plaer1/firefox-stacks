/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

function addBlankTabs(count) {
  let tabs = [];
  for (let i = 0; i < count; i++) {
    tabs.push(BrowserTestUtils.addTab(gBrowser, "about:blank"));
  }
  return tabs;
}

add_task(async function test_close_selects_within_group() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.tabs.selectWithinGroupOnClose", true]],
  });

  let [tabB, tabC, tabD, tabE] = addBlankTabs(4);
  let group = gBrowser.addTabGroup([tabB, tabC, tabD], { insertBefore: tabB });

  gBrowser.selectedTab = tabC;
  BrowserTestUtils.removeTab(tabC);
  is(gBrowser.selectedTab, tabD, "Closing selects the next group tab");

  BrowserTestUtils.removeTab(tabD);
  is(
    gBrowser.selectedTab,
    tabB,
    "With no group tab to the right, closing selects the one to the left"
  );

  BrowserTestUtils.removeTab(tabB);
  is(
    gBrowser.selectedTab,
    tabE,
    "Closing the last tab of a group falls back to the adjacent tab"
  );
  await TestUtils.waitForCondition(
    () => !group.parentNode,
    "The group is gone after its last tab closed"
  );

  BrowserTestUtils.removeTab(tabE);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_close_ignores_group_when_pref_off() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.tabs.selectWithinGroupOnClose", false]],
  });

  let [tabB, tabC, tabE] = addBlankTabs(3);
  gBrowser.addTabGroup([tabB, tabC], { insertBefore: tabB });

  gBrowser.selectedTab = tabC;
  BrowserTestUtils.removeTab(tabC);
  is(
    gBrowser.selectedTab,
    tabE,
    "With the pref off, closing selects the adjacent tab outside the group"
  );

  BrowserTestUtils.removeTab(tabB);
  BrowserTestUtils.removeTab(tabE);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_close_within_collapsed_group() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.tabs.selectWithinGroupOnClose", true]],
  });

  let [tabB, tabC, tabE] = addBlankTabs(3);
  let group = gBrowser.addTabGroup([tabB, tabC], { insertBefore: tabB });
  gBrowser.selectedTab = tabB;
  group.collapsed = true;

  BrowserTestUtils.removeTab(tabB);
  is(
    gBrowser.selectedTab,
    tabC,
    "Closing the active tab of a collapsed group selects a group member"
  );

  BrowserTestUtils.removeTab(tabC);
  BrowserTestUtils.removeTab(tabE);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_group_wins_over_successor() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.tabs.selectWithinGroupOnClose", true]],
  });

  let [tabB, tabC, tabE] = addBlankTabs(3);
  gBrowser.addTabGroup([tabB, tabC], { insertBefore: tabB });
  gBrowser.selectedTab = tabB;
  gBrowser.setSuccessor(tabB, tabE);

  BrowserTestUtils.removeTab(tabB);
  is(
    gBrowser.selectedTab,
    tabC,
    "A group tab is selected even when a successor outside the group is set"
  );

  BrowserTestUtils.removeTab(tabC);
  BrowserTestUtils.removeTab(tabE);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_last_tab_opens_new_tab_default() {
  is(
    Services.prefs
      .getDefaultBranch("")
      .getBoolPref("browser.tabs.closeWindowWithLastTab"),
    false,
    "Closing the last tab opens a new tab instead of closing the window"
  );
});
