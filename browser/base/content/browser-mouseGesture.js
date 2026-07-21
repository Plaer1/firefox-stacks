/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Mouse gesture support: right-click-and-drag to execute browser commands.
// Direction detection lives in MouseGestureDetector.sys.mjs, shared with the
// preferences capture UI. Movement listeners are only attached while the
// right button is held so idle mousemove cost is zero.

var gMouseGestureSupport = {
  _initialized: false,
  _detector: null,
  _suppressContextMenu: false,
  _suppressMenuUntil: 0,

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;

    ChromeUtils.defineESModuleGetters(this, {
      MouseGestureDetector: "resource:///modules/MouseGestureDetector.sys.mjs",
    });
    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "_enabled",
      "browser.gesture.mousegesture.enabled",
      false,
      () => this._applyContextMenuOverride()
    );
    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "_strokeTolerance",
      "browser.gesture.mousegesture.strokeTolerance",
      20
    );

    this._tabbox = gBrowser.tabbox;
    this._tabbox.addEventListener("mousedown", this, true);
    this._tabbox.addEventListener("contextmenu", this, true);
    // The content context menu ignores preventDefault when
    // dom.event.contextmenu.enabled is false, so gate the popup itself.
    this._contentMenu = document.getElementById("contentAreaContextMenu");
    this._contentMenu?.addEventListener("popupshowing", this);
    this._applyContextMenuOverride();
  },

  // While gestures are enabled, sites must not be able to override the
  // right-click menu. Only the default branch is touched: an explicit user
  // value for dom.event.contextmenu.enabled always wins, and nothing is
  // persisted to the profile.
  _applyContextMenuOverride() {
    Services.prefs
      .getDefaultBranch("")
      .setBoolPref("dom.event.contextmenu.enabled", !this._enabled);
  },

  uninit() {
    if (!this._initialized) {
      return;
    }
    this._initialized = false;
    this._stopTracking();
    this._suppressContextMenu = false;
    this._suppressMenuUntil = 0;

    this._tabbox.removeEventListener("mousedown", this, true);
    this._tabbox.removeEventListener("contextmenu", this, true);
    this._contentMenu?.removeEventListener("popupshowing", this);
  },

  handleEvent(event) {
    switch (event.type) {
      case "mousedown":
        this._onMouseDown(event);
        break;
      case "pointermove":
        this._onPointerMove(event);
        break;
      case "mouseup":
        this._onMouseUp(event);
        break;
      case "contextmenu":
        this._onContextMenu(event);
        break;
      case "popupshowing":
        if (
          event.target == this._contentMenu &&
          Date.now() < this._suppressMenuUntil
        ) {
          this._suppressMenuUntil = 0;
          event.preventDefault();
        }
        break;
      case "blur":
        this._stopTracking();
        break;
    }
  },

  _onMouseDown(event) {
    this._suppressContextMenu = false;
    if (event.button !== 2 || this._detector || !this._enabled) {
      return;
    }
    this._detector = new this.MouseGestureDetector(
      event.screenX,
      event.screenY,
      this._strokeTolerance
    );
    window.addEventListener("pointermove", this, true);
    window.addEventListener("mouseup", this, true);
    // Non-capturing: only fires when the window itself loses focus.
    window.addEventListener("blur", this);
  },

  // Dispatched pointermoves are coalesced to roughly one per frame; fast
  // strokes need the full-rate samples or direction changes never repeat
  // and nothing records. Feed every coalesced sample to the detector.
  _onPointerMove(event) {
    if (!this._detector || event.pointerType != "mouse") {
      return;
    }
    let samples = event.getCoalescedEvents();
    if (!samples.length) {
      samples = [event];
    }
    let consume = false;
    for (let sample of samples) {
      if (this._detector.sample(sample.screenX, sample.screenY)) {
        consume = true;
      }
    }
    if (consume) {
      event.preventDefault();
      event.stopPropagation();
    }
  },

  _onMouseUp(event) {
    if (event.button !== 2) {
      return;
    }
    let directions = this._detector.directions;
    this._stopTracking();
    if (directions) {
      this._suppressContextMenu = true;
      event.preventDefault();
      event.stopPropagation();
      this.executeGesture(directions);
    }
  },

  _stopTracking() {
    if (!this._detector) {
      return;
    }
    this._detector = null;
    window.removeEventListener("pointermove", this, true);
    window.removeEventListener("mouseup", this, true);
    window.removeEventListener("blur", this);
  },

  _onContextMenu(event) {
    if (this._suppressContextMenu) {
      this._suppressContextMenu = false;
      event.preventDefault();
      event.stopPropagation();
    }
  },

  // Also called by MouseGestureParent for gestures detected in web content.
  executeGesture(directions) {
    this._suppressMenuUntil = Date.now() + 500;
    let commandId = Services.prefs.getStringPref(
      "browser.gesture.mousegesture." + directions,
      ""
    );
    if (!commandId) {
      return;
    }

    let node = document.getElementById(commandId);
    if (node && node.getAttribute("disabled") !== "true") {
      node.doCommand();
    } else {
      goDoCommand(commandId);
    }
  },
};
