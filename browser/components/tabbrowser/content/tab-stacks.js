/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Vivaldi-style tab stack UX layered on top of native tab groups.
// This is loaded into chrome windows with the subscript loader. Wrap in
// a block to prevent accidentally leaking globals onto `window`.
{
  const MODE_OFF = 0;
  const MODE_DOTTED = 1;
  const MODE_SUBSTRIP = 2;
  const MODE_ACCORDION = 3;

  const MODE_NAMES = {
    [MODE_OFF]: "off",
    [MODE_DOTTED]: "dotted",
    [MODE_SUBSTRIP]: "substrip",
    [MODE_ACCORDION]: "accordion",
  };

  // Groups are checked for auto-dissolve on a short delay so that transient
  // single-member states (e.g. while several tabs move one by one) resolve
  // themselves first.
  const DISSOLVE_DELAY_MS = 400;
  const MAX_DOTS = 8;

  var gTabStacks = {
    _initialized: false,

    /** @type {MozXULElement} */
    _substrip: null,

    /** @type {Map<MozTabbrowserTab, MozXULElement>} */
    _buttonsByTab: new Map(),

    /** @type {MozTabbrowserTabGroup|null} */
    _renderedGroup: null,

    _updateScheduled: false,

    /** @type {Set<MozTabbrowserTabGroup>} */
    _dissolveQueue: new Set(),
    _dissolveTimer: null,

    init() {
      if (this._initialized) {
        return;
      }
      this._initialized = true;

      XPCOMUtils.defineLazyPreferenceGetter(
        this,
        "mode",
        "browser.tabs.stacking.mode",
        MODE_SUBSTRIP,
        () => this._onModeChange()
      );
      XPCOMUtils.defineLazyPreferenceGetter(
        this,
        "autoExpand",
        "browser.tabs.stacking.autoExpand",
        true
      );
      XPCOMUtils.defineLazyPreferenceGetter(
        this,
        "autoDissolve",
        "browser.tabs.stacking.autoDissolve",
        true
      );
      XPCOMUtils.defineLazyPreferenceGetter(
        this,
        "substripLocked",
        "browser.tabs.stacking.substripLocked",
        false,
        () => this._scheduleUpdate()
      );
      XPCOMUtils.defineLazyPreferenceGetter(
        this,
        "_verticalTabs",
        "sidebar.verticalTabs",
        false,
        () => this._scheduleUpdate()
      );

      this._substrip = document.getElementById("tab-substrip");
      this._substrip?.addEventListener("click", this);
      this._substrip?.addEventListener("auxclick", this);

      for (let eventName of [
        "TabSelect",
        "TabClose",
        "TabMove",
        "TabGrouped",
        "TabUngrouped",
        "TabGroupUpdate",
        "TabGroupCreate",
        "TabGroupRemoved",
        "TabGroupExpand",
        "TabAttrModified",
        "TabPinned",
        "TabUnpinned",
      ]) {
        window.addEventListener(eventName, this);
      }

      // In single-entry modes a click on a group label activates the group's
      // most recent tab instead of toggling collapse. Capture so we run
      // before the group's own click handler.
      gBrowser.tabContainer.addEventListener(
        "click",
        this._onContainerClickCapture,
        true
      );

      this._onModeChange();
    },

    /**
     * In dotted and substrip modes a stack occupies a single entry in the
     * tab strip (the collapsed group label plus the active tab).
     */
    get isSingleEntryMode() {
      return this.mode == MODE_DOTTED || this.mode == MODE_SUBSTRIP;
    },

    handleEvent(event) {
      switch (event.type) {
        case "TabSelect": {
          let group = gBrowser.selectedTab.group;
          if (
            this.mode == MODE_ACCORDION &&
            this.autoExpand &&
            group?.collapsed
          ) {
            group.collapsed = false;
          }
          this._updateFallbackLabel(group);
          this._scheduleUpdate();
          break;
        }
        case "TabGroupExpand":
        case "TabGroupCreate": {
          let group = event.target;
          if (this.isSingleEntryMode) {
            // Re-collapse before paint; single-entry modes never show
            // expanded groups in the tab strip.
            queueMicrotask(() => {
              if (group.isConnected) {
                group.collapsed = true;
              }
            });
          }
          if (event.type == "TabGroupCreate") {
            this._updateDots(group);
            this._updateFallbackLabel(group);
          }
          this._scheduleUpdate();
          break;
        }
        case "TabGrouped":
          this._updateDots(event.target);
          this._updateFallbackLabel(event.target);
          this._scheduleUpdate();
          break;
        case "TabUngrouped":
          this._queueDissolveCheck(event.target);
          this._updateDots(event.target);
          this._updateFallbackLabel(event.target);
          this._scheduleUpdate();
          break;
        case "TabClose": {
          let tab = event.target;
          if (tab.group) {
            this._queueDissolveCheck(tab.group);
            this._updateDots(tab.group);
            this._updateFallbackLabel(tab.group);
          }
          this._scheduleUpdate();
          break;
        }
        case "TabAttrModified":
          if (event.detail.changed.includes("label")) {
            this._updateFallbackLabel(event.target.group);
          }
          this._updateButtonFor(event.target, event.detail.changed);
          break;
        case "TabGroupUpdate":
          this._updateFallbackLabel(event.target);
          this._scheduleUpdate();
          break;
        case "TabMove":
        case "TabGroupRemoved":
        case "TabPinned":
        case "TabUnpinned":
          this._scheduleUpdate();
          break;
        case "click":
        case "auxclick":
          this._onSubstripClick(event);
          break;
      }
    },

    _onContainerClickCapture: event => {
      if (!gTabStacks.isSingleEntryMode || event.button != 0) {
        return;
      }
      let labelContainer = event.target.closest?.(".tab-group-label-container");
      let group = labelContainer?.closest("tab-group");
      if (!group) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      gTabStacks.activateGroup(group);
    },

    /**
     * Select the most recently active tab of a group (Vivaldi stack click).
     *
     * @param {MozTabbrowserTabGroup} group
     */
    activateGroup(group) {
      let tab = this._lastActiveTab(group);
      if (tab) {
        gBrowser.selectedTab = tab;
      }
    },

    /**
     * @param {MozTabbrowserTabGroup} group
     * @returns {MozTabbrowserTab|null}
     */
    _lastActiveTab(group) {
      let tabs = group.tabs.filter(tab => !tab.closing);
      if (!tabs.length) {
        return null;
      }
      return tabs.reduce((a, b) =>
        b.lastSeenActive > a.lastSeenActive ? b : a
      );
    },

    /**
     * Unnamed groups render a zero-width space as their strip label. In
     * stacking modes, show the last-active member's title instead (Vivaldi
     * behavior). Only the label attribute is poked; the persisted group
     * name stays empty.
     *
     * @param {MozTabbrowserTabGroup|null} group
     */
    _updateFallbackLabel(group) {
      if (group?.tagName != "tab-group" || !group.isConnected) {
        return;
      }
      if (this.mode == MODE_OFF || group.name) {
        group.removeAttribute("data-unnamed");
        return;
      }
      group.toggleAttribute("data-unnamed", true);
      let tab = this._lastActiveTab(group);
      if (tab?.label && group.getAttribute("label") != tab.label) {
        group.setAttribute("label", tab.label);
      }
    },

    _onModeChange() {
      document.documentElement.setAttribute(
        "tabstacks-mode",
        MODE_NAMES[this.mode] ?? MODE_NAMES[MODE_SUBSTRIP]
      );
      for (let group of gBrowser.tabGroups) {
        if (this.isSingleEntryMode) {
          group.collapsed = true;
          this._updateDots(group);
        }
        if (this.mode == MODE_OFF && !group.name) {
          group.setAttribute("label", "\u200b");
        }
        this._updateFallbackLabel(group);
      }
      this._scheduleUpdate();
    },

    /**
     * @param {MozTabbrowserTabGroup} group
     */
    _updateDots(group) {
      if (group?.tagName != "tab-group" || !group.isConnected) {
        return;
      }
      let count = group.tabs.length;
      group.setAttribute("data-tab-count", count);
      group.labelElement?.setAttribute(
        "data-dots",
        "●".repeat(Math.min(count, MAX_DOTS))
      );
    },

    _queueDissolveCheck(group) {
      if (!this.autoDissolve || group?.tagName != "tab-group") {
        return;
      }
      this._dissolveQueue.add(group);
      if (this._dissolveTimer) {
        return;
      }
      this._dissolveTimer = setTimeout(() => {
        this._dissolveTimer = null;
        let groups = [...this._dissolveQueue];
        this._dissolveQueue.clear();
        for (let dissolveCandidate of groups) {
          if (!dissolveCandidate.isConnected) {
            continue;
          }
          let tabs = dissolveCandidate.tabs;
          if (tabs.length == 1 && !tabs[0].closing) {
            gBrowser.ungroupTab(tabs[0]);
          }
        }
      }, DISSOLVE_DELAY_MS);
    },

    _scheduleUpdate() {
      if (this._updateScheduled) {
        return;
      }
      this._updateScheduled = true;
      window.requestAnimationFrame(() => {
        this._updateScheduled = false;
        this._update();
      });
    },

    _update() {
      let bar = this._substrip;
      if (!bar) {
        return;
      }
      let substripAvailable =
        this.mode == MODE_SUBSTRIP && !gBrowser.tabContainer.verticalMode;
      let group = substripAvailable ? gBrowser.selectedTab.group : null;
      if (!group && !(substripAvailable && this.substripLocked)) {
        if (!bar.hidden) {
          bar.hidden = true;
          bar.replaceChildren();
          this._buttonsByTab.clear();
          this._renderedGroup = null;
        }
        return;
      }
      bar.hidden = false;
      this._render(group);
    },

    /**
     * @param {MozTabbrowserTabGroup|null} group
     */
    _render(group) {
      let bar = this._substrip;
      this._buttonsByTab.clear();
      let fragment = document.createDocumentFragment();
      if (group) {
        bar.style.setProperty(
          "--tab-substrip-color",
          group.color ? `var(--tab-group-${group.color})` : "transparent"
        );
        for (let tab of group.tabs) {
          let item = document.createXULElement("hbox");
          item.className = "tab-substrip-tab";
          item.toggleAttribute("selected", tab.selected);

          let icon = document.createXULElement("image");
          icon.className = "tab-substrip-icon";
          let src = tab.getAttribute("image");
          if (src) {
            icon.setAttribute("src", src);
          }

          let label = document.createXULElement("label");
          label.className = "tab-substrip-label";
          label.setAttribute("value", tab.label);
          label.setAttribute("crop", "end");

          let close = document.createXULElement("toolbarbutton");
          close.className = "tab-substrip-close";
          document.l10n.setAttributes(close, "tabbrowser-substrip-close-tab");

          item.append(icon, label, close);
          item._tabStacksTab = tab;
          this._buttonsByTab.set(tab, item);
          fragment.append(item);
        }
      } else {
        bar.style.removeProperty("--tab-substrip-color");
      }
      bar.replaceChildren(fragment);
      this._renderedGroup = group;
    },

    /**
     * Fast path: patch a single substrip button on tab attribute changes
     * instead of rebuilding the whole bar.
     *
     * @param {MozTabbrowserTab} tab
     * @param {string[]} changed
     */
    _updateButtonFor(tab, changed) {
      let item = this._buttonsByTab.get(tab);
      if (!item) {
        return;
      }
      if (changed.includes("label")) {
        item
          .querySelector(".tab-substrip-label")
          .setAttribute("value", tab.label);
      }
      if (changed.includes("image")) {
        let icon = item.querySelector(".tab-substrip-icon");
        let src = tab.getAttribute("image");
        if (src) {
          icon.setAttribute("src", src);
        } else {
          icon.removeAttribute("src");
        }
      }
    },

    _onSubstripClick(event) {
      if (event.type == "auxclick" && event.button != 1) {
        return;
      }
      let item = event.target.closest(".tab-substrip-tab");
      let tab = item?._tabStacksTab;
      if (!tab || !tab.isConnected) {
        return;
      }
      if (event.button == 1 || event.target.closest(".tab-substrip-close")) {
        gBrowser.removeTab(tab, { animate: true });
      } else if (event.button == 0) {
        gBrowser.selectedTab = tab;
      }
    },
  };
}
