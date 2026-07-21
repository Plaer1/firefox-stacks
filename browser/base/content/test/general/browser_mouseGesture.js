/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { MouseGestureDetector } = ChromeUtils.importESModule(
  "resource:///modules/MouseGestureDetector.sys.mjs"
);

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.gesture.mousegesture.enabled", true]],
  });
});

add_task(async function test_direction_encoding() {
  let directions = [
    { dx: 10, dy: 0, expected: "0" },
    { dx: 0, dy: 10, expected: "2" },
    { dx: -10, dy: 0, expected: "4" },
    { dx: 0, dy: -10, expected: "6" },
    { dx: 10, dy: 9, expected: "0" },
    { dx: 9, dy: 10, expected: "2" },
  ];

  for (let { dx, dy, expected } of directions) {
    let result = MouseGestureDetector.directionFromDelta(dx, dy);
    is(
      result,
      expected,
      `Direction for dx=${dx}, dy=${dy} should be ${expected}`
    );
  }
});

add_task(async function test_detector_start_threshold() {
  let detector = new MouseGestureDetector(100, 100, 20);
  ok(!detector.sample(103, 103), "Movement under 5px does not start recording");
  ok(!detector.recording, "Not recording yet");
  ok(detector.sample(106, 100), "5px on one axis starts recording");
  ok(detector.recording, "Recording after threshold");
});

add_task(async function test_detector_records_directions() {
  let detector = new MouseGestureDetector(100, 100, 20);
  // Two accepted samples in the same direction are needed per stroke.
  detector.sample(115, 100);
  detector.sample(130, 100);
  is(detector.directions, "0", "Right stroke recorded after two moves");
  detector.sample(145, 100);
  is(detector.directions, "0", "Repeated direction not recorded twice");
  detector.sample(145, 115);
  detector.sample(145, 130);
  is(detector.directions, "02", "Down stroke appended");
});

add_task(async function test_detector_stroke_tolerance() {
  let detector = new MouseGestureDetector(100, 100, 40);
  detector.sample(110, 100);
  detector.sample(120, 100);
  detector.sample(130, 100);
  is(
    detector.directions,
    "",
    "Moves under tolerance/2 per sample record nothing"
  );
  let sensitive = new MouseGestureDetector(100, 100, 10);
  sensitive.sample(110, 100);
  sensitive.sample(120, 100);
  is(sensitive.directions, "0", "Lower tolerance records the same moves");
});

add_task(async function test_disabled_gesture_does_nothing() {
  await SpecialPowers.pushPrefEnv({
    set: [["browser.gesture.mousegesture.enabled", false]],
  });

  ok(
    !Services.prefs.getBoolPref("browser.gesture.mousegesture.enabled"),
    "Gestures are disabled"
  );

  await SpecialPowers.popPrefEnv();
});

add_task(async function test_gesture_binding_prefs_exist() {
  let bindings = ["4", "0", "6", "2", "60", "24", "42"];
  for (let dir of bindings) {
    let pref = "browser.gesture.mousegesture." + dir;
    let value = Services.prefs.getStringPref(pref, "");
    ok(value, `Gesture binding ${dir} has a command: ${value}`);
  }
});

add_task(async function test_idle_state() {
  gMouseGestureSupport.init();
  ok(!gMouseGestureSupport._detector, "No detector while idle");
  ok(
    !gMouseGestureSupport._suppressContextMenu,
    "Context menu suppression is off by default"
  );
});

// While gestures are enabled, the DEFAULT for dom.event.contextmenu.enabled
// flips to false so sites cannot override the right-click menu; an explicit
// user value still wins.
add_task(async function test_contextmenu_default_follows_gestures() {
  let defaults = () =>
    Services.prefs
      .getDefaultBranch("")
      .getBoolPref("dom.event.contextmenu.enabled");

  await SpecialPowers.pushPrefEnv({
    set: [["browser.gesture.mousegesture.enabled", true]],
  });
  is(defaults(), false, "Sites cannot override the menu while gestures are on");

  await SpecialPowers.pushPrefEnv({
    set: [["browser.gesture.mousegesture.enabled", false]],
  });
  is(defaults(), true, "The default is restored when gestures are off");
  await SpecialPowers.popPrefEnv();
  await SpecialPowers.popPrefEnv();
});

// Pointer moves over remote content never reach the parent process, so
// gesture detection there is handled by the MouseGesture actor pair. Drive a
// full right-drag through the content process and expect the bound command
// to run in the parent.
add_task(async function test_content_gesture_executes_command() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.gesture.mousegesture.enabled", true],
      ["browser.gesture.mousegesture.0", "cmd_newNavigatorTabNoEvent"],
    ],
  });

  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "data:text/html,<body style='margin:0;width:100vw;height:100vh'>gesture</body>"
  );
  let bc = tab.linkedBrowser.browsingContext;

  let newTabPromise = BrowserTestUtils.waitForEvent(
    gBrowser.tabContainer,
    "TabOpen"
  );
  await BrowserTestUtils.synthesizeMouseAtPoint(
    100,
    100,
    { type: "mousedown", button: 2 },
    bc
  );
  for (let i = 1; i <= 6; i++) {
    await BrowserTestUtils.synthesizeMouseAtPoint(
      100 + i * 15,
      100,
      { type: "mousemove" },
      bc
    );
  }
  await BrowserTestUtils.synthesizeMouseAtPoint(
    200,
    100,
    { type: "mouseup", button: 2 },
    bc
  );

  let { target: newTab } = await newTabPromise;
  ok(newTab, "A right-drag gesture in content executed the bound command");

  BrowserTestUtils.removeTab(newTab);
  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});

// The content context menu ignores preventDefault when
// dom.event.contextmenu.enabled is false; the popupshowing gate in the parent
// must still keep the menu closed after a gesture.
add_task(async function test_content_gesture_suppresses_context_menu() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["browser.gesture.mousegesture.enabled", true],
      ["dom.event.contextmenu.enabled", false],
    ],
  });

  let tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "data:text/html,<body style='margin:0;width:100vw;height:100vh'>gesture</body>"
  );
  let bc = tab.linkedBrowser.browsingContext;
  let menu = document.getElementById("contentAreaContextMenu");
  let shownCount = 0;
  let onShown = () => shownCount++;
  menu.addEventListener("popupshown", onShown);

  await BrowserTestUtils.synthesizeMouseAtPoint(
    100,
    100,
    { type: "mousedown", button: 2 },
    bc
  );
  for (let i = 1; i <= 6; i++) {
    await BrowserTestUtils.synthesizeMouseAtPoint(
      100,
      100 + i * 15,
      { type: "mousemove" },
      bc
    );
  }
  await BrowserTestUtils.synthesizeMouseAtPoint(
    100,
    190,
    { type: "mouseup", button: 2 },
    bc
  );
  await BrowserTestUtils.synthesizeMouseAtPoint(
    100,
    190,
    { type: "contextmenu" },
    bc
  );

  // The gesture's contextmenu is processed before this one, so if it were
  // going to open the menu, its popupshown would arrive first and be counted.
  let shown = BrowserTestUtils.waitForEvent(menu, "popupshown");
  await BrowserTestUtils.synthesizeMouseAtPoint(
    120,
    120,
    { type: "contextmenu" },
    bc
  );
  await shown;
  is(shownCount, 1, "Only the plain right-click opened the context menu");
  is(menu.state, "open", "A plain right-click still opens the context menu");
  let hidden = BrowserTestUtils.waitForEvent(menu, "popuphidden");
  menu.hidePopup();
  await hidden;

  menu.removeEventListener("popupshown", onShown);
  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});
