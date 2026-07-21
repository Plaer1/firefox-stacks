/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_stack_highlight_and_count_preference() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.tabs.groups.enabled", true],
      ["browser.tabs.stacking.autoDissolve", false],
      ["browser.tabs.stacking.mode", 2],
      ["browser.tabs.stacking.showCount", true],
    ],
  });

  let group;
  try {
    let tabs = [
      BrowserTestUtils.addTab(gBrowser, "about:blank"),
      BrowserTestUtils.addTab(gBrowser, "about:blank"),
    ];
    group = gBrowser.addTabGroup(tabs, {
      color: "blue",
      label: "Stack",
    });
    gBrowser.selectedTab = tabs[0];

    await TestUtils.waitForCondition(
      () => group.collapsed,
      "The group is collapsed in two-level mode"
    );

    group.style.setProperty("--tab-group-color", "rgb(200, 0, 0)");
    let labelStyle = getComputedStyle(group.labelElement);
    is(
      labelStyle.backgroundColor,
      "rgb(200, 0, 0)",
      "The group label is filled with the group color"
    );
    is(labelStyle.outlineStyle, "none", "The group label has no color outline");

    let tabBackground = tabs[0].querySelector(".tab-background");
    ok(
      getComputedStyle(tabBackground).backgroundColor.includes("0.784314"),
      "The active stack tab uses the group color as its background tint"
    );

    await TestUtils.waitForCondition(
      () => getComputedStyle(group.overflowContainer).display != "none",
      "The hidden-tab count is shown by default"
    );

    Services.prefs.setBoolPref("browser.tabs.stacking.showCount", false);
    await TestUtils.waitForCondition(
      () => getComputedStyle(group.overflowContainer).display == "none",
      "The hidden-tab count can be hidden"
    );

    Services.prefs.setIntPref("browser.tabs.stacking.mode", 1);
    await TestUtils.waitForCondition(
      () => document.documentElement.getAttribute("tabstacks-mode") == "dotted",
      "The stack switches to compact dots mode"
    );
    is(
      getComputedStyle(group.labelElement).fontSize,
      "0px",
      "Hiding the numeric count does not disable compact dots"
    );
  } finally {
    if (group?.isConnected) {
      await removeTabGroup(group);
    }
    await SpecialPowers.popPrefEnv();
  }
});

add_task(async function test_unnamed_stack_fallback_title() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.tabs.groups.enabled", true],
      ["browser.tabs.stacking.autoDissolve", false],
      ["browser.tabs.stacking.mode", 2],
    ],
  });

  let group;
  try {
    let tabs = [
      BrowserTestUtils.addTab(gBrowser, "about:blank"),
      BrowserTestUtils.addTab(gBrowser, "about:blank"),
    ];
    group = gBrowser.addTabGroup(tabs);

    await TestUtils.waitForCondition(
      () => group.hasAttribute("data-unnamed"),
      "An unnamed group is marked as unnamed"
    );

    gBrowser.selectedTab = tabs[1];
    await TestUtils.waitForCondition(
      () => group.getAttribute("label") == tabs[1].label,
      "The unnamed stack shows the active member's title"
    );
    isnot(group.getAttribute("label"), "\u200b", "The strip label is visible");
    is(group.name, "", "The persisted group name stays empty");

    group.label = "Named";
    await TestUtils.waitForCondition(
      () => !group.hasAttribute("data-unnamed"),
      "A named group is no longer marked as unnamed"
    );
    is(
      group.getAttribute("label"),
      "Named",
      "The strip label shows the group name"
    );
  } finally {
    if (group?.isConnected) {
      await removeTabGroup(group);
    }
    await SpecialPowers.popPrefEnv();
  }
});
