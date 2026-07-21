/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html, nothing } from "chrome://global/content/vendor/lit.all.mjs";
import { MozLitElement } from "chrome://global/content/lit-utils.mjs";

const { MouseGestureDetector } = ChromeUtils.importESModule(
  "resource:///modules/MouseGestureDetector.sys.mjs"
);

const PREF_BRANCH = "browser.gesture.mousegesture.";
const ENABLED_PREF = PREF_BRANCH + "enabled";
const TOLERANCE_PREF = PREF_BRANCH + "strokeTolerance";
const PATTERN_RE = /^[0246]+$/;

// Curated commands with localized labels. The picker additionally lists every
// command element found in the browser window, mirroring Vivaldi's full
// action catalog.
export const GESTURE_COMMANDS = [
  { id: "Browser:BackOrBackDuplicate", l10nId: "mouse-gesture-cmd-back" },
  {
    id: "Browser:ForwardOrForwardDuplicate",
    l10nId: "mouse-gesture-cmd-forward",
  },
  { id: "cmd_scrollTop", l10nId: "mouse-gesture-cmd-scroll-top" },
  { id: "cmd_scrollBottom", l10nId: "mouse-gesture-cmd-scroll-bottom" },
  { id: "cmd_newNavigatorTabNoEvent", l10nId: "mouse-gesture-cmd-new-tab" },
  { id: "cmd_close", l10nId: "mouse-gesture-cmd-close-tab" },
  { id: "Browser:NextTab", l10nId: "mouse-gesture-cmd-next-tab" },
  { id: "Browser:PrevTab", l10nId: "mouse-gesture-cmd-prev-tab" },
  { id: "History:UndoCloseTab", l10nId: "mouse-gesture-cmd-undo-close-tab" },
  { id: "Browser:DuplicateTab", l10nId: "mouse-gesture-cmd-duplicate-tab" },
  { id: "Browser:Stop", l10nId: "mouse-gesture-cmd-stop" },
  { id: "Browser:Reload", l10nId: "mouse-gesture-cmd-reload" },
  {
    id: "Browser:ReloadSkipCache",
    l10nId: "mouse-gesture-cmd-reload-skip-cache",
  },
  { id: "cmd_fullZoomEnlarge", l10nId: "mouse-gesture-cmd-zoom-in" },
  { id: "cmd_fullZoomReduce", l10nId: "mouse-gesture-cmd-zoom-out" },
  { id: "cmd_fullZoomReset", l10nId: "mouse-gesture-cmd-zoom-reset" },
  {
    id: "Browser:RestoreLastSession",
    l10nId: "mouse-gesture-cmd-restore-session",
  },
  { id: "Browser:SearchBookmarks", l10nId: "mouse-gesture-cmd-bookmarks" },
  { id: "History:SearchHistory", l10nId: "mouse-gesture-cmd-history" },
  { id: "Tools:Downloads", l10nId: "mouse-gesture-cmd-downloads" },
  { id: "Tools:Addons", l10nId: "mouse-gesture-cmd-addons" },
  { id: "Browser:Screenshot", l10nId: "mouse-gesture-cmd-screenshot" },
  { id: "View:FullScreen", l10nId: "mouse-gesture-cmd-fullscreen" },
  { id: "View:ReaderView", l10nId: "mouse-gesture-cmd-reader-view" },
  { id: "View:PageSource", l10nId: "mouse-gesture-cmd-page-source" },
  { id: "cmd_print", l10nId: "mouse-gesture-cmd-print" },
  { id: "Tools:Search", l10nId: "mouse-gesture-cmd-search" },
  { id: "Browser:AddBookmarkAs", l10nId: "mouse-gesture-cmd-bookmark" },
  { id: "Browser:SendLink", l10nId: "mouse-gesture-cmd-email-link" },
];

const VALID_COMMAND_ID = /^[A-Za-z][\w:-]*$/;

const DIRECTION_VECTORS = {
  0: [1, 0],
  2: [0, 1],
  4: [-1, 0],
  6: [0, -1],
};

const DIRECTION_ARROWS = {
  0: "→",
  2: "↓",
  4: "←",
  6: "↑",
};

const DIAGRAM_SIZE = 48;
const DIAGRAM_PAD = 8;

export function patternToArrows(directions) {
  return Array.from(directions, d => DIRECTION_ARROWS[d]).join(" ");
}

/**
 * Turn a direction string into normalized polyline points inside the
 * DIAGRAM_SIZE viewBox.
 *
 * @param {string} directions
 * @returns {number[][]}
 */
function patternToPoints(directions) {
  let x = 0;
  let y = 0;
  let points = [[0, 0]];
  for (let dir of directions) {
    let [dx, dy] = DIRECTION_VECTORS[dir];
    x += dx;
    y += dy;
    points.push([x, y]);
  }
  let xs = points.map(p => p[0]);
  let ys = points.map(p => p[1]);
  let minX = Math.min(...xs);
  let maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  let span = Math.max(maxX - minX, maxY - minY, 1);
  let scale = (DIAGRAM_SIZE - 2 * DIAGRAM_PAD) / span;
  let ox =
    DIAGRAM_PAD +
    (DIAGRAM_SIZE - 2 * DIAGRAM_PAD - (maxX - minX) * scale) / 2 -
    minX * scale;
  let oy =
    DIAGRAM_PAD +
    (DIAGRAM_SIZE - 2 * DIAGRAM_PAD - (maxY - minY) * scale) / 2 -
    minY * scale;
  return points.map(([px, py]) => [px * scale + ox, py * scale + oy]);
}

/**
 * Vivaldi-style gesture mapper: a selectable list of bound commands with a
 * side preview of the selected gesture, and add/remove/edit/restore controls.
 * New and edited gestures are recorded interactively in a capture editor
 * using the same detector as the browser.
 */
export class GestureMapping extends MozLitElement {
  static properties = {
    bindings: { type: Array, state: true },
    commands: { type: Array, state: true },
    enabled: { type: Boolean, state: true },
    tolerance: { type: Number, state: true },
    selected: { type: String, state: true },
    editing: { type: String, state: true },
    pickerOpen: { type: Boolean, state: true },
    pickerFilter: { type: String, state: true },
    capturing: { type: Boolean, state: true },
    capturedDirections: { type: String, state: true },
    captureCommand: { type: String, state: true },
    conflictLabel: { type: String, state: true },
    captureFailed: { type: Boolean, state: true },
  };

  #detector = null;
  #canvasCtx = null;
  #editOrigin = null;
  // DOM elements cannot be XPCOM observers; use a plain object wrapper.
  #prefObserver = { observe: () => this.#readPrefs() };

  constructor() {
    super();
    this.bindings = [];
    this.commands = [];
    this.enabled = true;
    this.tolerance = 20;
    this.selected = null;
    this.editing = null;
    this.pickerOpen = false;
    this.pickerFilter = "";
    this.capturing = false;
    this.capturedDirections = "";
    this.captureCommand = "";
    this.conflictLabel = "";
    this.captureFailed = false;
  }

  connectedCallback() {
    super.connectedCallback();
    Services.prefs.addObserver(PREF_BRANCH, this.#prefObserver);
    this.#readPrefs();
    this.#loadCommands();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    Services.prefs.removeObserver(PREF_BRANCH, this.#prefObserver);
  }

  #readPrefs() {
    this.enabled = Services.prefs.getBoolPref(ENABLED_PREF, true);
    this.tolerance = Services.prefs.getIntPref(TOLERANCE_PREF, 20);
    let bindings = [];
    for (let pref of Services.prefs.getChildList(PREF_BRANCH)) {
      let directions = pref.slice(PREF_BRANCH.length);
      if (!PATTERN_RE.test(directions)) {
        continue;
      }
      let command = Services.prefs.getStringPref(pref, "");
      if (command) {
        bindings.push({ directions, command });
      }
    }
    bindings.sort(
      (a, b) =>
        a.directions.length - b.directions.length ||
        a.directions.localeCompare(b.directions)
    );
    this.bindings = bindings;
    if (this.selected && !bindings.some(b => b.directions == this.selected)) {
      // The selected binding vanished (removed or rebound); fall back to the
      // topmost remaining one.
      this.selected = bindings[0]?.directions ?? null;
    }
  }

  /**
   * Build the full searchable command inventory: curated commands with
   * localized labels, plus every command element registered in the browser
   * window so any browser action can be bound, like Vivaldi's catalog.
   */
  async #loadCommands() {
    let commands = new Map();
    let messages = await document.l10n.formatMessages(
      GESTURE_COMMANDS.map(command => ({ id: command.l10nId }))
    );
    for (let [i, command] of GESTURE_COMMANDS.entries()) {
      let label = messages[i]?.attributes?.find(a => a.name == "label")?.value;
      commands.set(command.id, { id: command.id, label: label || command.id });
    }
    try {
      let { BrowserWindowTracker } = ChromeUtils.importESModule(
        "resource:///modules/BrowserWindowTracker.sys.mjs"
      );
      let win = BrowserWindowTracker.getTopWindow();
      for (let commandEl of win.document.querySelectorAll(
        "commandset command[id]"
      )) {
        let { id } = commandEl;
        if (commands.has(id)) {
          continue;
        }
        let label =
          commandEl.getAttribute("label") ||
          win.document
            .querySelector(`menuitem[command="${CSS.escape(id)}"]`)
            ?.getAttribute("label") ||
          "";
        commands.set(id, { id, label });
      }
    } catch (e) {
      console.warn("gesture-mapping: browser command enumeration failed", e);
    }
    this.commands = [...commands.values()].sort((a, b) =>
      (a.label || a.id).localeCompare(b.label || b.id)
    );
  }

  #commandLabel(commandId) {
    let command = this.commands.find(c => c.id == commandId);
    return command?.label || commandId;
  }

  #filteredCommands() {
    let filter = this.pickerFilter.trim().toLowerCase();
    if (!filter) {
      return this.commands;
    }
    return this.commands.filter(
      command =>
        command.id.toLowerCase().includes(filter) ||
        command.label.toLowerCase().includes(filter)
    );
  }

  #selectedBinding() {
    return this.bindings.find(b => b.directions == this.selected);
  }

  #clearBindingPref(directions) {
    let pref = PREF_BRANCH + directions;
    if (Services.prefs.prefHasDefaultValue(pref)) {
      Services.prefs.setStringPref(pref, "");
    } else {
      Services.prefs.clearUserPref(pref);
    }
  }

  #removeSelected() {
    if (this.selected) {
      this.#clearBindingPref(this.selected);
    }
  }

  #restoreDefaults() {
    for (let pref of Services.prefs.getChildList(PREF_BRANCH)) {
      if (PATTERN_RE.test(pref.slice(PREF_BRANCH.length))) {
        Services.prefs.clearUserPref(pref);
      }
    }
    this.editing = null;
    this.#resetCapture();
  }

  #onToleranceInput(event) {
    Services.prefs.setIntPref(TOLERANCE_PREF, event.target.valueAsNumber);
  }

  #startAdd() {
    this.editing = "add";
    this.#editOrigin = null;
    this.#resetCapture();
  }

  #startEdit() {
    let binding = this.#selectedBinding();
    if (!binding) {
      return;
    }
    this.editing = "edit";
    this.#editOrigin = binding.directions;
    this.#resetCapture();
    this.captureCommand = binding.command;
  }

  #cancelEditing() {
    this.editing = null;
    this.#editOrigin = null;
    this.#resetCapture();
  }

  #resetCapture() {
    this.capturing = false;
    this.capturedDirections = "";
    this.captureCommand = "";
    this.conflictLabel = "";
    this.captureFailed = false;
    this.pickerOpen = false;
    this.pickerFilter = "";
    this.#detector = null;
    this.#canvasCtx = null;
  }

  #saveCapture() {
    if (!this.capturedDirections || !this.captureCommand) {
      return;
    }
    let directions = this.capturedDirections;
    Services.prefs.setStringPref(PREF_BRANCH + directions, this.captureCommand);
    if (this.#editOrigin && this.#editOrigin != directions) {
      this.#clearBindingPref(this.#editOrigin);
    }
    this.editing = null;
    this.#editOrigin = null;
    this.#resetCapture();
    this.selected = directions;
  }

  #pickCommand(commandId) {
    this.captureCommand = commandId;
    this.pickerOpen = false;
    this.pickerFilter = "";
  }

  #onCapturePointerDown(event) {
    if (event.button != 2 || !this.enabled) {
      return;
    }
    event.preventDefault();
    let area = event.currentTarget;
    try {
      area.setPointerCapture(event.pointerId);
    } catch (e) {
      // Synthesized events may carry no active pointer; capture is optional.
    }
    this.capturing = true;
    this.capturedDirections = "";
    this.conflictLabel = "";
    this.captureFailed = false;
    this.#detector = new MouseGestureDetector(
      event.screenX,
      event.screenY,
      this.tolerance
    );

    let canvas = area.querySelector("canvas");
    let rect = area.getBoundingClientRect();
    let scale = window.devicePixelRatio;
    canvas.width = rect.width * scale;
    canvas.height = rect.height * scale;
    let ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = getComputedStyle(this).getPropertyValue("color");
    ctx.beginPath();
    ctx.moveTo(event.clientX - rect.left, event.clientY - rect.top);
    this.#canvasCtx = { ctx, rect };
  }

  #onCapturePointerMove(event) {
    if (!this.capturing || !this.#detector) {
      return;
    }
    // Use the coalesced full-rate samples so fast strokes record the same
    // way here as in the browser.
    let samples = event.getCoalescedEvents();
    if (!samples.length) {
      samples = [event];
    }
    let { ctx, rect } = this.#canvasCtx;
    for (let sample of samples) {
      this.#detector.sample(sample.screenX, sample.screenY);
      ctx.lineTo(sample.clientX - rect.left, sample.clientY - rect.top);
    }
    ctx.stroke();
  }

  #onCapturePointerUp(event) {
    if (!this.capturing || event.button != 2) {
      return;
    }
    this.capturing = false;
    let directions = this.#detector?.directions ?? "";
    this.#detector = null;
    if (!directions) {
      this.captureFailed = true;
      return;
    }
    this.capturedDirections = directions;
    let existing = this.bindings.find(
      b => b.directions == directions && b.directions != this.#editOrigin
    );
    this.conflictLabel = existing ? this.#commandLabel(existing.command) : "";
  }

  #onCaptureContextMenu(event) {
    event.preventDefault();
  }

  #diagramTemplate(directions) {
    let points = patternToPoints(directions);
    let path = points
      .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`)
      .join(" ");
    let [sx, sy] = points[0];
    let [ex, ey] = points.at(-1);
    let lastDir = directions.at(-1);
    let [vx, vy] = DIRECTION_VECTORS[lastDir];
    let tip = 5;
    let arrow =
      `${ex + vx * tip},${ey + vy * tip} ` +
      `${ex - vy * tip * 0.6},${ey - vx * tip * 0.6} ` +
      `${ex + vy * tip * 0.6},${ey + vx * tip * 0.6}`;
    return html`<svg
      class="gesture-diagram"
      viewBox="0 0 ${DIAGRAM_SIZE} ${DIAGRAM_SIZE}"
      aria-hidden="true"
    >
      <path
        d=${path}
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linejoin="round"
        stroke-linecap="round"
        opacity="0.8"
      />
      <circle cx=${sx} cy=${sy} r="2.5" fill="currentColor" />
      <polygon points=${arrow} fill="currentColor" />
    </svg>`;
  }

  /**
   * Searchable command picker: an input box filtering a dropdown list of
   * every available command. Unknown but plausible command ids typed into
   * the box can be used directly.
   */
  #pickerTemplate() {
    let filter = this.pickerFilter.trim();
    let matches = this.#filteredCommands();
    let exact = this.commands.some(c => c.id == filter);
    let customOption =
      filter && !exact && VALID_COMMAND_ID.test(filter)
        ? html`<button
            class="command-option command-option-custom"
            data-l10n-id="mouse-gesture-mapping-custom-command"
            data-l10n-args=${JSON.stringify({ command: filter })}
            @click=${() => this.#pickCommand(filter)}
          ></button>`
        : nothing;
    return html`<div class="command-picker">
      <input
        type="search"
        class="command-filter"
        data-l10n-id="mouse-gesture-mapping-command-filter"
        .value=${this.pickerFilter}
        @input=${e => (this.pickerFilter = e.target.value)}
      />
      <div class="command-list" role="listbox">
        ${matches.map(
          command =>
            html`<button
              class="command-option"
              role="option"
              @click=${() => this.#pickCommand(command.id)}
            >
              <span class="command-option-label"
                >${command.label || command.id}</span
              >
              ${command.label
                ? html`<span class="command-option-id">${command.id}</span>`
                : nothing}
            </button>`
        )}
        ${customOption}
      </div>
    </div>`;
  }

  #commandButtonTemplate() {
    return this.captureCommand
      ? html`<button
          class="command-button"
          data-l10n-id="mouse-gesture-mapping-change-command"
          @click=${() => (this.pickerOpen = !this.pickerOpen)}
        >
          ${this.#commandLabel(this.captureCommand)}
        </button>`
      : html`<button
          class="command-button command-button-empty"
          @click=${() => (this.pickerOpen = !this.pickerOpen)}
        >
          <span data-l10n-id="mouse-gesture-mapping-choose-command"></span>
        </button>`;
  }

  #editorTemplate() {
    return html`<div class="capture-card">
      <div
        class="capture-area"
        @pointerdown=${this.#onCapturePointerDown}
        @pointermove=${this.#onCapturePointerMove}
        @pointerup=${this.#onCapturePointerUp}
        @pointercancel=${this.#onCapturePointerUp}
        @contextmenu=${this.#onCaptureContextMenu}
      >
        <canvas></canvas>
        ${!this.capturing && !this.capturedDirections
          ? html`<span
              class="capture-hint"
              data-l10n-id=${this.captureFailed
                ? "mouse-gesture-mapping-capture-retry"
                : "mouse-gesture-mapping-capture-hint"}
            ></span>`
          : nothing}
      </div>
      <div class="capture-result">
        ${this.capturedDirections
          ? this.#diagramTemplate(this.capturedDirections)
          : nothing}
        ${this.capturedDirections
          ? html`<span
              class="gesture-arrows"
              data-l10n-id="mouse-gesture-mapping-pattern"
              data-l10n-args=${JSON.stringify({
                pattern: patternToArrows(this.capturedDirections),
              })}
            ></span>`
          : nothing}
        ${this.#commandButtonTemplate()}
      </div>
      ${this.pickerOpen ? this.#pickerTemplate() : nothing}
      ${this.conflictLabel
        ? html`<moz-message-bar
            type="warning"
            data-l10n-id="mouse-gesture-mapping-conflict"
            data-l10n-args=${JSON.stringify({ command: this.conflictLabel })}
          ></moz-message-bar>`
        : nothing}
      <div class="capture-buttons">
        <moz-button
          type="primary"
          data-l10n-id="mouse-gesture-mapping-save"
          ?disabled=${!this.capturedDirections || !this.captureCommand}
          @click=${this.#saveCapture}
        ></moz-button>
        <moz-button
          data-l10n-id="mouse-gesture-mapping-cancel"
          @click=${this.#cancelEditing}
        ></moz-button>
      </div>
    </div>`;
  }

  render() {
    let selectedBinding = this.#selectedBinding();
    return html`
      <link
        rel="stylesheet"
        href="chrome://browser/content/preferences/widgets/gesture-mapping.css"
      />
      <div class="tolerance-row">
        <label
          for="gesture-tolerance"
          data-l10n-id="mouse-gesture-mapping-tolerance"
        ></label>
        <input
          id="gesture-tolerance"
          type="range"
          min="5"
          max="50"
          .valueAsNumber=${this.tolerance}
          ?disabled=${!this.enabled}
          @input=${this.#onToleranceInput}
        />
        <span
          class="tolerance-value"
          data-l10n-id="mouse-gesture-mapping-tolerance-value"
          data-l10n-args=${JSON.stringify({ tolerance: this.tolerance })}
        ></span>
      </div>
      <div class="mapping-layout">
        <div
          class="mapping-list"
          role="listbox"
          data-l10n-id="mouse-gesture-mapping-list"
          data-l10n-attrs="aria-label"
        >
          ${this.bindings.map(
            binding =>
              html`<button
                class="mapping-row"
                role="option"
                aria-selected=${binding.directions == this.selected}
                data-directions=${binding.directions}
                title=${patternToArrows(binding.directions)}
                ?disabled=${!this.enabled}
                @click=${() => (this.selected = binding.directions)}
                @dblclick=${() => {
                  this.selected = binding.directions;
                  this.#startEdit();
                }}
              >
                ${this.#commandLabel(binding.command)}
              </button>`
          )}
        </div>
        <div class="mapping-preview">
          ${selectedBinding
            ? this.#diagramTemplate(selectedBinding.directions)
            : nothing}
        </div>
      </div>
      <div class="mapping-toolbar">
        <moz-button
          type="icon"
          iconsrc="chrome://global/skin/icons/plus.svg"
          data-l10n-id="mouse-gesture-mapping-add"
          ?disabled=${!this.enabled}
          @click=${this.#startAdd}
        ></moz-button>
        <moz-button
          type="icon"
          iconsrc="chrome://global/skin/icons/minus.svg"
          data-l10n-id="mouse-gesture-mapping-remove"
          ?disabled=${!this.enabled || !selectedBinding}
          @click=${this.#removeSelected}
        ></moz-button>
        <moz-button
          type="icon"
          iconsrc="chrome://global/skin/icons/edit.svg"
          data-l10n-id="mouse-gesture-mapping-edit"
          ?disabled=${!this.enabled || !selectedBinding}
          @click=${this.#startEdit}
        ></moz-button>
        <moz-button
          data-l10n-id="mouse-gesture-mapping-restore"
          ?disabled=${!this.enabled}
          @click=${this.#restoreDefaults}
        ></moz-button>
      </div>
      ${this.editing ? this.#editorTemplate() : nothing}
    `;
  }
}
customElements.define("gesture-mapping", GestureMapping);
