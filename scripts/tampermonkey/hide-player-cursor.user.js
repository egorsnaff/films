// ==UserScript==
// @name         Films — hide player cursor
// @namespace    https://github.com/egorsnaff/films
// @version      1.0.0
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
 * 3. Open a film watch page and play — after ~1.2s without mouse move
 *    the arrow over the player should disappear; move mouse to bring it back.
 *
 * Why a userscript: the site cannot style cross-origin iframe documents.
 * Tampermonkey runs inside those frames when @match hits the embed host.
 */

(function hidePlayerCursor() {
  "use strict";

  const IDLE_MS = 1200;
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

  function setHidden(next) {
    ensureStyle();
    const root = document.documentElement;
    if (!root || hidden === next) {
      return;
    }
    hidden = next;
    root.classList.toggle(HIDDEN_CLASS, next);
  }

  function bump() {
    setHidden(false);
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => setHidden(true), IDLE_MS);
  }

  function start() {
    ensureStyle();
    bump();

    const opts = { passive: true, capture: true };
    window.addEventListener("mousemove", bump, opts);
    window.addEventListener("mousedown", bump, opts);
    window.addEventListener("wheel", bump, opts);
    window.addEventListener("keydown", bump, opts);
    window.addEventListener("touchstart", bump, opts);
  }

  if (document.documentElement) {
    start();
  } else {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  }
})();
