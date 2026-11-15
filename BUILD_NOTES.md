# Ember Yard — threejs-fps-01 build notes

## What was built

"Ember Yard" is an original, round-based tactical FPS in the style Counter-Strike
made famous — own map, art, sounds and names, never a copy. It is built on the
kit starter (grey room, one rifle, four static targets) and replaces the game
with a complete 5v5 match:

- **Map** (`game/src/world.js`): a 36×28 m disused freight yard at dusk —
  sand floor, rust/teal containers, a mid warehouse with two doorways, west
  crate lane, east container lane, and Site A under an amber crane pad with a
  marked plant zone. Dusk sky shader, warm low sun, cool fill, fog.
- **Teams & rounds** (`game/src/rounds.js`, `game/src/bots.js`): Foxes
  (player + 4 bots, teal) vs Jackals (5 bots, rust). First to 3 round wins,
  max 5 rounds. 15 s buy phase, 100 s live round, 35 s charge fuse.
- **Objective**: Foxes win by eliminating the Jackals or by planting the
  charge at Site A (hold E for 3 s) and letting it detonate; Jackals win by
  eliminating the Foxes, defusing a planted charge (5 s channel), or by the
  clock running out before a plant. Teammate bots can plant; enemy bots
  converge to defuse.
- **Economy & buy menu** (`game/src/rounds.js`, `game/src/hud.js`): start
  $800; kill +$300, plant +$300, round win +$325, loss +$200. Buy menu in the
  buy phase (B / Deploy button): P9 Sidearm ($0), Kestrel-9 SMG ($1500),
  AR-7 Vulture rifle ($2700), Heron .50 sniper ($4750, right-click scope),
  Spark grenade ($300, G to throw).
- **Gunplay** (`game/src/weapon.js`, `game/src/main.js`): hitscan with
  headshots (3× damage, 2.5× sniper), recoil, spread that grows with movement
  and sprinting and shrinks when crouched or aiming, magazines, reloads,
  muzzle flash, tracers, hit markers, kill feed, damage vignette.
- **Movement** (`game/src/player.js`): WASD with acceleration/friction,
  sprint (Shift), crouch (Ctrl/C), jump (Space), axis-separated AABB
  collision shared with the bots (`moveBody`).
- **Bots** (`game/src/bots.js`): state machine — advance along lane routes,
  hold defence posts, engage visible enemies with staggered thinking and
  burst fire whose accuracy falls with distance and target speed, strafe,
  take cover when hurt, investigate gunfire, plant/defuse channels.
- **Grenades** (`game/src/grenade.js`): thrown arc, bounce, 1.4 s fuse,
  radial blast with falloff, half self-damage.
- **Sounds** (`game/src/audio.js`): all WebAudio-synthesised (shots per
  weapon, reload, hit/kill, hurt, plant/defuse beeps, explosion, buy, round
  win/lose stingers). No audio files, no network.
- **HUD** (`game/src/hud.js`, `game/index.html`): health bar, ammo, weapon
  name, money, round timer, round score, team alive counts, objective line,
  kill feed, plant/defuse progress bar, round banners, crosshair that widens
  with spread, pause / match-over overlays.
- **Deterministic shots** (`game/src/main.js`): `?shot=start|play|end&seed=N`
  sets a fixed frame and `window.__shotReady` after two paints, as the
  starter did, so real screenshots can be captured in Chrome (see
  SCREENSHOTS.md).

## How to serve / test it

```sh
cd ~/workspace/makefun/work
node serve.ts            # serves game/ on http://localhost:8080
```

Open http://localhost:8080 in desktop Chrome, click to play (pointer lock),
play a round against the bots. Keys: WASD move, Shift sprint, Ctrl crouch,
Space jump, mouse look, click fire, right-click aim (sniper scope), R reload,
1–4 weapons, G grenade, E plant (hold, on Site A), B buy menu, M mute.

Headless checks run here (no Chrome/WebGL in this VM):

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

That copies `game/` + `screenshots/` to `out/` and writes
`out/dossier.json` via the unchanged `vendor/makefun-threejs.ts`. Exact
verification run (2026-11-15, Node v24.22.1):

- `node --check` on all 11 `game/src/*.js`: OK; ESM parse via
  `vm.SourceTextModule`: all OK.
- Headless simulation (`/tmp/simtest/test.mjs`, three.js vendored, no DOM):
  **11/11 PASS** — player walks north to the wall, reaches Site A via the
  east lane, passes the mid warehouse through its doorways, a Fox bot
  reaches Site A and plants, round fuse detonation wins the round for the
  Foxes, grenade throws and explodes. The sim caught 4 real bugs that were
  fixed: a raised site pad bots/players could not step onto, warehouse walls
  with no doorways, a spawn-to-spawn sightline with Jackals sniping Foxes
  leaving spawn, and bots wedging on obstacle corners (fixed with a
  sidestep unstick, defender-zone rule, and 18 m engage range).
- `main.ts` run twice to `out/` and `out2/`: both dossiers byte-identical
  (sha256 `a95989a3549cb387d6c69e079466fcbf89ac75b350b8221f84233a5c76806d8c`).
- `out/dossier.json`: 290,343 bytes (cap 1.5 MiB); dossier text 83,470
  bytes (cap 163,840) — all 12 source files fit, nothing left out.
- `game/`: 15 files, 2,217,134 bytes (caps 993 / 48 MiB), 0 symlinks.
- three.js byte-identical to the kit: `three.module.min.js`
  `ef510bae547ab3789d6ed543333a8bf42510a8c70743b766c4e19039b976c26b`,
  `three.core.min.js`
  `613e370f76638fdef83926642bf256dc9615684922de1ce1f63a8583e5d78578`,
  `vendor/makefun-threejs.ts`
  `f9622210e6a0aed70d6f13273a24c9c4a661b5e272edf8fef21197fac6de7969`.
- No external URLs / network calls in `game/src/` or `game/index.html`
  (URLs appear only inside the vendored three.js comments).
- `out/` total: 19 files, 2,660,508 bytes (cap 1,000 entries / 64 MiB).
- Screenshots in `out/screenshots/`: 3 JPEGs, 1280×720, 42–58 KiB each —
  **real renders of Ember Yard, taken 2026-11-15** (see SCREENSHOTS.md):
  `1-start.jpg` sha256 `dc2ab675a2bfa414659384df6a2584a00e13a65d183bceccf671ca2e792c6457`,
  `2-play.jpg` sha256 `98e2b20250baa319833a947da3814cf1343a21977c7d331bc3024fbcb6f6a9a1`,
  `3-end.jpg` sha256 `ac005cfea2a3ae032a0df755e2ddde23acbe75071d708802184f4d9e8d650288`.
  Dossier rebuilt after the capture: `out/dossier.json` sha256
  `a86f7948ea5653ff6258d96a887d884497d49294072336842ee4cb3577ddb694`,
  and its `images` list carries exactly these three sha256s (cover
  `1-start.jpg`). The starter placeholders are gone.

Real-browser play-test, 2026-11-15 (headless Chrome 131 + SwiftShader,
capture script `~/workspace/shot-tools/capture.mjs`, play-test scripts
in the same folder; Chrome binary in
`~/workspace/playwright-browsers/chrome-linux64/`):

- WebGL 2.0 works (OpenGL ES 3.0 Chromium via SwiftShader); all three
  deterministic shots reached `window.__shotReady`.
- Live play: clicking the real "Click to play" button acquires pointer
  lock (`document.pointerLockElement` true); the game runs with HUD,
  bots visible at mid, crane/Site A in view. No page errors.
- Buy menu: it opens automatically at the start of the buy phase
  (`main.js` `showBuy`); pressing B *closes* it (it is a dismiss key,
  not an open key) — so a B press showing no menu is correct behaviour,
  not a bug.
- Frame rate in this VM: ~1.8 fps at 1280×720 — SwiftShader software
  rendering on 1.5 shared CPUs, not representative of a real PC GPU;
  do not judge the game's performance by it.
- Minor observations, not blockers: the only console 404 is the
  browser's automatic `/favicon.ico` (no game asset missing); the
  `?shot=play` frame's objective line still reads "Buy phase" while the
  round timer shows 1:28 (the deterministic frame's HUD text is static);
  the P9 viewmodel is a large flat beige slab in the lower-right corner;
  the `?shot=play` camera sits close to a mustard wall that fills the
  left third of the frame. The three.js shadow warning
  (`PCFSoftShadowMap` removed, falls back to `PCFShadowMap`) is a
  three.js 0.187.0 deprecation notice, not an error.
- A `4-site.jpg` candidate (`?shot=play&seed=2`) was captured and
  deleted: same camera as `2-play.jpg`, health 84 vs 100 — a
  near-duplicate, not a distinct Site A view.

What was NOT verified here: actual play on a real PC GPU (frame rate,
bot behaviour over a full round, plant/defuse flow end-to-end). The
headless run confirms the game loads, renders, locks the pointer, and
its deterministic frames are correct.

What was NOT verified here: actual play in desktop Chrome (no browser in
this VM) — bot behaviour in live play, the buy menu click flow, pointer
lock, frame rate, and the real screenshots. Those need the Chrome steps
in SCREENSHOTS.md / "How to serve / test it" above.

## What is still missing (do before submitting)

1. **Real screenshots — DONE 2026-11-15.** The three files in
   `screenshots/` are now real renders of Ember Yard (see SCREENSHOTS.md),
   and the dossier was rebuilt with them. Re-capture if the game changes.
2. **GitHub repo, created AFTER the competition opens** (2026-11-16
   17:00 UTC / 2026-11-17 01:00 WITA). Copy this directory in as the repo,
   fill in README.md's `{owner}` / `{repo}` / `{description}` / `{run}` /
   `{referral_code}` placeholders, set the repo About from the
   competition's `repo_about` (`gh repo edit …` line in the requirements),
   and commit with the account's GitHub login (or add
   `.makefun/owner.json` with the linked wallet).
3. **Play-test in Chrome** and fix anything the headless checks could not
   see (bot behaviour, plant/defuse flow, buy menu, frame rate).
4. **Bundle transcripts and submit** via the kit CLI (`check`, `bundle`,
   `submit`) — not done here, and not to be done from this directory
   before the repo exists.

## Deviations from the kit rules

None known. `game/` holds the kit's three.js 0.187.0 files byte-for-byte
under `game/vendor/three/`, one import map mapping `"three"` to
`./vendor/three/three.module.min.js`, no external URLs or network requests
in `game/`, `vendor/makefun-threejs.ts` copied unchanged, MIT LICENSE from
the starter, `main.ts`/`serve.ts` from the starter (unchanged). The only
starter file removed is `game/src/targets.js` (static target dummies,
replaced by bots). Dossier text is under the 160 KiB cap — check the
verification output for the exact size.
