/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const GESTURE_PREF_BRANCH = "browser.gesture.mousegesture.";
const TEST_PATTERN = "204";
const TEST_PREF = GESTURE_PREF_BRANCH + TEST_PATTERN;

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [[GESTURE_PREF_BRANCH + "enabled", true]],
  });
});

function boundGesturePrefCount() {
  return Services.prefs
    .getChildList(GESTURE_PREF_BRANCH)
    .filter(
      pref =>
        /^[0246]+$/.test(pref.slice(GESTURE_PREF_BRANCH.length)) &&
        Services.prefs.getStringPref(pref, "")
    ).length;
}

async function openGestureMappingWidget() {
  let tab = await openPrefsTab("general");
  let doc = tab.linkedBrowser.contentDocument;
  await BrowserTestUtils.waitForMutationCondition(
    doc.getElementById("mainPrefPane"),
    { childList: true, subtree: true },
    () => doc.querySelector("gesture-mapping")
  );
  let widget = doc.querySelector("gesture-mapping");
  await widget.updateComplete;
  return { tab, doc, widget };
}

function mappingRows(widget) {
  return Array.from(widget.shadowRoot.querySelectorAll(".mapping-row"));
}

function toolbarButton(widget, index) {
  return widget.shadowRoot.querySelectorAll(".mapping-toolbar moz-button")[
    index
  ];
}

add_task(async function test_gesture_mapping_list_select_remove() {
  let { tab, widget } = await openGestureMappingWidget();

  let expected = boundGesturePrefCount();
  await TestUtils.waitForCondition(
    () => mappingRows(widget).length == expected,
    "The mapper lists one row per bound gesture"
  );

  Services.prefs.setStringPref(TEST_PREF, "Browser:Reload");
  await TestUtils.waitForCondition(
    () => mappingRows(widget).length == expected + 1,
    "Adding a gesture pref adds a row"
  );

  let findRow = () =>
    mappingRows(widget).find(row => row.dataset.directions == TEST_PATTERN);
  await TestUtils.waitForCondition(
    () => findRow()?.textContent.trim() == "Reload",
    "The row shows the command's label"
  );

  findRow().click();
  await widget.updateComplete;
  is(
    findRow().getAttribute("aria-selected"),
    "true",
    "Clicking a row selects it"
  );
  ok(
    widget.shadowRoot.querySelector(".mapping-preview svg"),
    "The selected gesture is drawn in the preview panel"
  );

  toolbarButton(widget, 1).click();
  await TestUtils.waitForCondition(
    () => mappingRows(widget).length == expected,
    "The remove button deletes the selected gesture"
  );
  is(
    Services.prefs.getStringPref(TEST_PREF, ""),
    "",
    "Removing a gesture clears its pref"
  );
  await widget.updateComplete;
  is(
    mappingRows(widget)[0]?.getAttribute("aria-selected"),
    "true",
    "The topmost remaining gesture is auto-selected after a removal"
  );
  ok(
    widget.shadowRoot.querySelector(".mapping-preview svg"),
    "The preview shows the newly selected gesture"
  );

  await BrowserTestUtils.removeTab(tab);
});

add_task(async function test_gesture_mapping_add_flow_records_gesture() {
  let { tab, doc, widget } = await openGestureMappingWidget();
  let win = doc.defaultView;
  const NEW_PATTERN = "020";
  const NEW_PREF = GESTURE_PREF_BRANCH + NEW_PATTERN;

  toolbarButton(widget, 0).click();
  await widget.updateComplete;
  let area = widget.shadowRoot.querySelector(".capture-area");
  ok(area, "The add button opens the interactive capture editor");

  let pointer = (type, x, y, extra = {}) =>
    area.dispatchEvent(
      new win.PointerEvent(type, {
        bubbles: true,
        composed: true,
        pointerId: 1,
        button: 2,
        buttons: 2,
        screenX: x,
        screenY: y,
        clientX: x,
        clientY: y,
        ...extra,
      })
    );

  pointer("pointerdown", 600, 300);
  for (let [x, y] of [
    [615, 300],
    [630, 300],
    [630, 315],
    [630, 330],
    [645, 330],
    [660, 330],
  ]) {
    pointer("pointermove", x, y, { button: 0 });
  }
  pointer("pointerup", 660, 330);
  await widget.updateComplete;

  is(
    widget.capturedDirections,
    NEW_PATTERN,
    "Drawing right-down-right records the 020 pattern"
  );

  widget.shadowRoot.querySelector(".command-button").click();
  await widget.updateComplete;
  let picker = widget.shadowRoot.querySelector(".command-picker");
  ok(picker, "The command button opens the searchable picker");

  await TestUtils.waitForCondition(
    () => picker.querySelectorAll(".command-option").length > 1,
    "The picker lists the command inventory"
  );
  let filter = picker.querySelector(".command-filter");
  filter.value = "Reload";
  filter.dispatchEvent(new win.Event("input", { bubbles: true }));
  await TestUtils.waitForCondition(() => {
    let options = picker.querySelectorAll(".command-option");
    return (
      options.length &&
      options.length < widget.commands.length &&
      Array.from(options).some(
        option =>
          option.querySelector(".command-option-id")?.textContent ==
          "Browser:Reload"
      )
    );
  }, "The command search filters the dropdown");

  Array.from(picker.querySelectorAll(".command-option"))
    .find(
      option =>
        option.querySelector(".command-option-id")?.textContent ==
        "Browser:Reload"
    )
    .click();
  await widget.updateComplete;

  widget.shadowRoot.querySelector(".capture-buttons moz-button").click();
  await TestUtils.waitForCondition(
    () => Services.prefs.getStringPref(NEW_PREF, "") == "Browser:Reload",
    "Saving writes the recorded gesture's pref"
  );
  await TestUtils.waitForCondition(
    () =>
      mappingRows(widget).some(row => row.dataset.directions == NEW_PATTERN),
    "The new gesture appears in the list"
  );

  Services.prefs.clearUserPref(NEW_PREF);
  await BrowserTestUtils.removeTab(tab);
});

add_task(async function test_gesture_mapping_restore_defaults() {
  let { tab, widget } = await openGestureMappingWidget();
  const CUSTOM_PREF = GESTURE_PREF_BRANCH + "0202";

  Services.prefs.setStringPref(CUSTOM_PREF, "Browser:Reload");
  Services.prefs.setStringPref(GESTURE_PREF_BRANCH + "4", "");
  await TestUtils.waitForCondition(
    () => mappingRows(widget).some(row => row.dataset.directions == "0202"),
    "Custom gesture listed"
  );

  toolbarButton(widget, 3).click();
  await TestUtils.waitForCondition(
    () => !mappingRows(widget).some(row => row.dataset.directions == "0202"),
    "Restoring defaults removes custom gestures"
  );
  ok(
    !Services.prefs.prefHasUserValue(CUSTOM_PREF),
    "The custom gesture pref is gone"
  );
  is(
    Services.prefs.getStringPref(GESTURE_PREF_BRANCH + "4", ""),
    "Browser:BackOrBackDuplicate",
    "A cleared default binding is restored"
  );

  await BrowserTestUtils.removeTab(tab);
});
