# Screenshots — status: REAL RENDERS, taken 2026-11-15

The three files in `screenshots/` are now **real in-browser renders of
"Ember Yard"**, captured 2026-11-15 in headless Chrome 131 (Chrome for
Testing) with SwiftShader software WebGL 2.0, served by `node serve.ts`
on http://localhost:8080, using the deterministic frames
`?shot=start|play|end&seed=1` and waiting for `window.__shotReady`:

- `1-start.jpg` (42,518 bytes, sha256 `dc2ab675…`) — start overlay over
  the yard, "Ember Yard / Click to play", buy phase 0:15, $800.
- `2-play.jpg` (52,922 bytes, sha256 `98e2b202…`) — mid-round first-person
  view, P9 Sidearm viewmodel, three Jackal bots visible, Site A crane
  frame and plant ring, ammo 8/48.
- `3-end.jpg` (57,591 bytes, sha256 `ac005cfe…`) — "Foxes take the round",
  kill feed (You ✕ Krol / Mara / Vex), $1700, FOXES 1–0.

All 1280×720, each well under the 256 KiB cap. Dossier rebuilt after
the capture: `out/dossier.json` sha256
`a86f7948ea5653ff6258d96a887d884497d49294072336842ee4cb3577ddb694`
(290,343 bytes); its `images` list carries exactly these three sha256s,
cover is `1-start.jpg`. A `4-site.jpg` candidate (`?shot=play&seed=2`)
was captured and then deleted — it was a near-duplicate of `2-play.jpg`
(same camera, health 84 instead of 100), not a distinct Site A view.

## How to take the real screenshots

1. Serve the game and open it in desktop Chrome:
   ```sh
   cd ~/workspace/makefun/work
   node serve.ts
   ```
   Open http://localhost:8080 in Chrome.
2. Capture 3–4 frames at 1280×720 (long side 1280, short side 720 — within
   the gate's limits: long side at most 1280, short side at least 480, each
   file at most 256 KiB). The game supports deterministic capture frames:
   - `?shot=start&seed=1` — spawn view over the yard, start overlay
   - `?shot=play&seed=1` — mid-round, firing at a Jackal bot, hit marker up
   - `?shot=end&seed=1` — round won, three Jackals down, banner up
   Wait for `window.__shotReady` to become true, then screenshot the
   viewport at 1280×720. Or play a real round and capture live frames
   (menu, buy phase, plant at Site A) — live frames are fine too, as long
   as they are real renders of this game's own code, unedited.
3. Save them as `screenshots/1-start.jpg`, `2-play.jpg`, `3-end.jpg`
   (and optionally `4-site.jpg`), each ≤ 256 KiB, replacing the starter
   files. Keep the first file by name as the cover image.
4. Re-run the dossier build and confirm the new screenshots are the ones
   in `out/dossier.json`:
   ```sh
   rm -rf out && mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
   ```

Note: this VM had no browser, so Chrome 131 was downloaded from
Google's Chrome-for-Testing CDN into
`~/workspace/playwright-browsers/chrome-linux64/` and driven with
`playwright-core` (`~/workspace/shot-tools/capture.mjs`); the
playwright.dev CDN download failed, the Google CDN worked. System libs
were installed with apt (`libnss3`, `libgbm1`, etc.). Re-capture with
the same script if the game changes.

## How to take the real screenshots

1. Serve the game and open it in desktop Chrome:
   ```sh
   cd ~/workspace/makefun/work
   node serve.ts
   ```
   Open http://localhost:8080 in Chrome.
2. Capture 3–4 frames at 1280×720 (long side 1280, short side 720 — within
   the gate's limits: long side at most 1280, short side at least 480, each
   file at most 256 KiB). The game supports deterministic capture frames:
   - `?shot=start&seed=1` — spawn view over the yard, start overlay
   - `?shot=play&seed=1` — mid-round, firing at a Jackal bot, hit marker up
   - `?shot=end&seed=1` — round won, three Jackals down, banner up
   Wait for `window.__shotReady` to become true, then screenshot the
   viewport at 1280×720. Or play a real round and capture live frames
   (menu, buy phase, plant at Site A) — live frames are fine too, as long
   as they are real renders of this game's own code, unedited.
3. Save them as `screenshots/1-start.jpg`, `2-play.jpg`, `3-end.jpg`
   (and optionally `4-site.jpg`), each ≤ 256 KiB, replacing the starter
   files. Keep the first file by name as the cover image.
4. Re-run the dossier build and confirm the new screenshots are the ones
   in `out/dossier.json`:
   ```sh
   rm -rf out && mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
   ```

Do not submit while the starter screenshots are still in place: the judge
reads the screenshots first, and the old grey-room images do not match this
game's code.
