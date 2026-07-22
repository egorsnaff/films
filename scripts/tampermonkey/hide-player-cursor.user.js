// ==UserScript==
// @name         Films — hide player cursor
// @namespace    https://github.com/egorsnaff/films
// @version      1.0.1
// @description  Прячет системный курсор внутри embed-плееров (Alloha/Kodik/Kinobox и т.п.) после короткого idle. Ставится в Tampermonkey.
// @author       films
// @match        *://*.newplayjj.com/*
// @match        *://newplayjj.com/*
// @match        *://*.kodik.cc/*
// @match        *://kodik.cc/*
// @match        *://*.kodik.info/*
// @match        *://kodik.info/*
// @match        *://*.kodik.biz/*
// @match        *://kodik.biz/*
// @match        *://kinohost.web.app/*
// @match        *://*.kinohost.web.app/*
// @match        *://api.atomics.ws/*
// @match        *://*.atomics.ws/*
// @match        *://*.lumex.space/*
// @match        *://lumex.space/*
// @match        *://*.bhcesh.me/*
// @match        *://bhcesh.me/*
// @match        *://*.collaps.kg/*
// @match        *://collaps.kg/*
// @match        *://*.apivb.com/*
// @match        *://apivb.com/*
// @match        *://*.stravers.live/*
// @match        *://stravers.live/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

/**
 * Install (Firefox + Tampermonkey):
 * 1. Open Tampermonkey → Dashboard → "+" (Create a new script)
 * 2. Paste this whole file, save (Ctrl/Cmd+S)
 * 3. Open a film watch page and play — after ~1.2s without real mouse move
 *    the arrow over the player should disappear; move mouse to bring it back.
 *
 * Why a userscript: the site cannot style cross-origin iframe documents.
 * Tampermonkey runs inside those frames when @match hits the embed host.
 *
 * v1.0.1: ignore duplicate/edge-jitter mousemove (cursor half off the screen
 * often keeps firing move events at the same pixel and never reached idle).
 */

(function hidePlayerCursor() {
  "use strict";

  const IDLE_MS = 1200;
  const MOVE_EPS = 2;
  const STYLE_ID = "films-hide-player-cursor-style";
  const HIDDEN_CLASS = "films-cursor-idle-hidden";

  const styleText = `
    html.${HIDDEN_CLASS},
    html.${HIDDEN_CLASS} * {
      cursor: none !important;
    }
  `;

  function ensureStyle() {
    const root = document.documentElement;
    if (!root) {
      return;
    }

    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = styleText;
      (document.head || root).appendChild(style);
    }
  }

  let hideTimer = 0;
  let hidden = false;
  let lastX = Number.NaN;
  let lastY = Number.NaN;

  function setHidden(next) {
    ensureStyle();
    const root = document.documentElement;
    if (!root || hidden === next) {
      return;
    }
    hidden = next;
    root.classList.toggle(HIDDEN_CLASS, next);
  }

  function armHide() {
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => setHidden(true), IDLE_MS);
  }

  function bumpActivity() {
    setHidden(false);
    armHide();
  }

  function onMouseMove(event) {
    const x = event.clientX;
    const y = event.clientY;

    // OS/Firefox often spam mousemove at the screen edge with the same (or
    // nearly same) coordinates while the cursor is half-clipped off-screen.
    // Those must not reset the idle timer.
    if (
      Number.isFinite(lastX) &&
      Math.abs(x - lastX) < MOVE_EPS &&
      Math.abs(y - lastY) < MOVE_EPS
    ) {
      return;
    }

    lastX = x;
    lastY = y;
    bumpActivity();
  }

  function onLeaveWindow(event) {
    // Pointer left the document (e.g. past the right screen edge). Force hide
    // — CSS cursor no longer applies outside the page, but once they re-enter
    // we start clean; also stops edge-jitter from keeping the arrow forever.
    if (event.relatedTarget != null) {
      return;
    }
    window.clearTimeout(hideTimer);
    setHidden(true);
  }

  function start() {
    ensureStyle();
    bumpActivity();

    const opts = { passive: true, capture: true };
    window.addEventListener("mousemove", onMouseMove, opts);
    window.addEventListener("mousedown", bumpActivity, opts);
    window.addEventListener("wheel", bumpActivity, opts);
    window.addEventListener("keydown", bumpActivity, opts);
    window.addEventListener("touchstart", bumpActivity, opts);
    document.documentElement.addEventListener("mouseleave", onLeaveWindow, opts);
  }

  if (document.documentElement) {
    start();
  } else {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  }
})();
