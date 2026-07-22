# Tampermonkey: hide player cursor

The watch page cannot hide the OS cursor **inside** cross-origin player iframes (Alloha, Kodik, Kinobox, …). A userscript can, because Tampermonkey injects into those frames.

## Install (Firefox)

1. Install [Tampermonkey](https://addons.mozilla.org/firefox/addon/tampermonkey/) if needed.
2. Open the script: [`hide-player-cursor.user.js`](./hide-player-cursor.user.js).
3. Tampermonkey → **Dashboard** → **+** → paste the file → **Save** (`Ctrl`/`Cmd`+`S`).
4. Optional: open the raw file URL on GitHub and tap **Raw** — Tampermonkey often offers one-click install.

## Behaviour

- Runs only on known embed hosts (`@match` list in the script).
- After ~1.2s without pointer/keyboard activity, sets `cursor: none` on that frame.
- Moving the mouse (or clicking / scrolling) shows the cursor again so player controls stay usable.

## If a player still shows the arrow

Embed hosts rotate. Add another `@match` for that hostname (Tampermonkey → edit script → save) and reload the watch page.
