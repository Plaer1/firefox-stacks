/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";
import { MouseGestureDetector } from "resource:///modules/MouseGestureDetector.sys.mjs";

const lazy = {};
XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "enabled",
  "browser.gesture.mousegesture.enabled",
  true
);
XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "strokeTolerance",
  "browser.gesture.mousegesture.strokeTolerance",
  20
);

/**
 * Detects right-button drag gestures inside web content. Pointer moves over
 * remote content never reach the parent process DOM, so detection has to
 * live here; only the finished direction string is sent up. Movement
 * listeners are attached while the right button is held, so idle cost is
 * one handleEvent call per mousedown.
 */
export class MouseGestureChild extends JSWindowActorChild {
  #detector = null;
  #suppressContextMenu = false;

  handleEvent(event) {
    switch (event.type) {
      case "mousedown":
        this.#onMouseDown(event);
        break;
      case "pointermove":
        this.#onPointerMove(event);
        break;
      case "mouseup":
        this.#onMouseUp(event);
        break;
      case "contextmenu":
        this.#onContextMenu(event);
        break;
      case "pagehide":
        this.#stopTracking();
        break;
    }
  }

  didDestroy() {
    this.#detector = null;
  }

  #onMouseDown(event) {
    this.#suppressContextMenu = false;
    if (
      event.button !== 2 ||
      this.#detector ||
      !lazy.enabled ||
      this.document.nodePrincipal.isSystemPrincipal
    ) {
      return;
    }
    this.#detector = new MouseGestureDetector(
      event.screenX,
      event.screenY,
      lazy.strokeTolerance
    );
    let win = this.contentWindow;
    win.addEventListener("pointermove", this, true);
    win.addEventListener("mouseup", this, true);
    win.addEventListener("pagehide", this, true);
  }

  // Dispatched pointermoves are coalesced to roughly one per frame; fast
  // strokes need the full-rate samples or direction changes never repeat
  // and nothing records. Feed every coalesced sample to the detector.
  #onPointerMove(event) {
    if (!this.#detector || event.pointerType != "mouse") {
      return;
    }
    let samples = event.getCoalescedEvents();
    if (!samples.length) {
      samples = [event];
    }
    let consume = false;
    for (let sample of samples) {
      if (this.#detector.sample(sample.screenX, sample.screenY)) {
        consume = true;
      }
    }
    if (consume) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  #onMouseUp(event) {
    if (event.button !== 2) {
      return;
    }
    let directions = this.#detector?.directions;
    this.#stopTracking();
    if (directions) {
      this.#suppressContextMenu = true;
      event.preventDefault();
      event.stopPropagation();
      this.contentWindow.addEventListener("contextmenu", this, {
        capture: true,
        once: true,
      });
      this.sendAsyncMessage("MouseGesture:Command", { directions });
    }
  }

  #stopTracking() {
    if (!this.#detector) {
      return;
    }
    this.#detector = null;
    let win = this.contentWindow;
    win.removeEventListener("pointermove", this, true);
    win.removeEventListener("mouseup", this, true);
    win.removeEventListener("pagehide", this, true);
  }

  #onContextMenu(event) {
    if (this.#suppressContextMenu) {
      this.#suppressContextMenu = false;
      event.preventDefault();
      event.stopPropagation();
    }
  }
}
