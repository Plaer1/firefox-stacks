/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export class MouseGestureParent extends JSWindowActorParent {
  receiveMessage(message) {
    if (message.name == "MouseGesture:Command") {
      let win = this.browsingContext.topChromeWindow;
      win?.gMouseGestureSupport?.executeGesture(message.data.directions);
    }
  }
}
