/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Quantizes pointer movement into mouse-gesture direction strings using a
 * 4-sector compass: right='0', down='2', left='4', up='6'. Shared by the
 * in-browser gesture handler and the preferences capture UI so recorded
 * patterns always match recognized ones.
 *
 * Recording starts once the pointer travels START_THRESHOLD_PX on either
 * axis. After that, samples closer than strokeTolerance/2 to the last
 * accepted point are ignored, and a direction is appended once two
 * consecutive accepted samples agree on a sector that differs from the
 * previously appended one.
 */

const START_THRESHOLD_PX = 5;

export class MouseGestureDetector {
  #lastX;
  #lastY;
  #minMoveSquared;
  #recording = false;
  #lastDirection = "";
  #directions = "";

  /**
   * @param {number} startX Screen coordinate in CSS pixels.
   * @param {number} startY Screen coordinate in CSS pixels.
   * @param {number} strokeTolerance
   *   Pixels the pointer must travel before a gesture move is detected.
   */
  constructor(startX, startY, strokeTolerance = 20) {
    this.#lastX = startX;
    this.#lastY = startY;
    let minMove = strokeTolerance / 2;
    this.#minMoveSquared = minMove * minMove;
  }

  get recording() {
    return this.#recording;
  }

  get directions() {
    return this.#directions;
  }

  /**
   * Feed a pointer sample in screen coordinates (CSS pixels).
   *
   * @returns {boolean}
   *   True while the gesture is recording; callers should consume the
   *   underlying event.
   */
  sample(x, y) {
    let dx = x - this.#lastX;
    let dy = y - this.#lastY;
    if (!this.#recording) {
      if (
        Math.abs(dx) < START_THRESHOLD_PX &&
        Math.abs(dy) < START_THRESHOLD_PX
      ) {
        return false;
      }
      this.#recording = true;
    }
    if (dx * dx + dy * dy <= this.#minMoveSquared) {
      return true;
    }
    this.#lastX = x;
    this.#lastY = y;
    let direction = MouseGestureDetector.directionFromDelta(dx, dy);
    if (this.#lastDirection != direction) {
      this.#lastDirection = direction;
    } else if (!this.#directions.endsWith(direction)) {
      this.#directions += direction;
    }
    return true;
  }

  static directionFromDelta(dx, dy) {
    if (Math.abs(dx) >= Math.abs(dy)) {
      return dx >= 0 ? "0" : "4";
    }
    return dy >= 0 ? "2" : "6";
  }
}
