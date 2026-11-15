// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. The simulation (player, bots, grenades, rounds, plant) is
// kept apart from rendering; the HUD is pushed numbers, never polled.
// ?shot=start|play|end with &seed=N sets up a deterministic frame for a capture,
// renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, FOX_SPAWNS } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon, WEAPON_ORDER } from './weapon.js';
import { createBots } from './bots.js';
import { createGrenades } from './grenade.js';
import { createRounds } from './rounds.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.dusk);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 200);
scene.add(camera);

const world = createWorld(scene);
const audio = createAudio();
const hud = createHud();
const weapon = createWeapon(camera);
const player = createPlayer(world.colliders, FOX_SPAWNS[4]);
const input = createInput(renderer.domElement, onLockChange);

const body = player.state;
let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let plantProgress = 0;
let plantBeepAt = 0;
let defuseProgress = 0;
let prevFiring = false;
let matchScoreText = '';

const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const direction = new THREE.Vector3();
const tracerFrom = new THREE.Vector3();
const tracerTo = new THREE.Vector3();
const markerHoldMs = shot ? 4000 : 90;

// Tracer pool: 10 pre-made lines, reused, never created per shot.
const tracers = [];
for (let i = 0; i < 10; i += 1) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.amber), transparent: true, opacity: 0 });
  const line = new THREE.Line(geo, mat);
  line.visible = false;
  line.frustumCulled = false;
  scene.add(line);
  tracers.push({ line, life: 0 });
}
let tracerIndex = 0;
function spawnTracer(from, to) {
  const t = tracers[tracerIndex];
  tracerIndex = (tracerIndex + 1) % tracers.length;
  const attr = t.line.geometry.getAttribute('position');
  attr.setXYZ(0, from.x, from.y, from.z);
  attr.setXYZ(1, to.x, to.y, to.z);
  attr.needsUpdate = true;
  t.line.visible = true;
  t.line.material.opacity = 0.85;
  t.life = 0.09;
}

const grenades = createGrenades(scene, world.colliders, (pos, radius, maxDmg, minDmg, owner) => {
  audio.explosion();
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const d = Math.hypot(bot.position.x - pos.x, bot.position.z - pos.z);
    if (d > radius) continue;
    const dmg = Math.round(minDmg + (maxDmg - minDmg) * (1 - d / radius));
    bots.damage(bot, dmg, owner === 'player' ? 'You' : owner);
  }
  const pd = Math.hypot(body.position.x - pos.x, body.position.z - pos.z);
  if (pd <= radius && body.alive) {
    const dmg = Math.round((minDmg + (maxDmg - minDmg) * (1 - pd / radius)) * (owner === 'player' ? 0.5 : 1));
    hurtPlayer(dmg, owner === 'player' ? 'You' : owner);
  }
});

const rounds = createRounds({
  onRoundStart(round) {
    player.respawn(FOX_SPAWNS[4]);
    bots.reset();
    weapon.refill();
    grenades.reset();
    plantProgress = 0;
    defuseProgress = 0;
    hud.hidePlant();
    hud.hideBanner();
    hud.setHealth(100);
    hud.setScore(rounds.state.foxWins, rounds.state.jackalWins);
    hud.setMoney(rounds.state.money);
    hud.setObjective('Buy phase — spend your money, then deploy. Objective: plant the charge at Site A.');
    hud.showBuy(rounds.state.money, weapon.owned,
      (id) => {
        const res = weapon.buy(id, rounds.state.money);
        if (res.ok) { rounds.state.money = res.money; audio.buy(); hud.setMoney(res.money); hud.refreshBuy(res.money, weapon.owned); hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.currentName()); }
      },
      () => {
        const res = weapon.buyGrenade(rounds.state.money);
        if (res.ok) { rounds.state.money = res.money; audio.buy(); hud.setMoney(res.money); hud.setGrenades(weapon.state.grenades); }
      },
      () => {
        hud.hideBuy();
        audio.unlock();
        input.requestLock();
      });
    input.exitLock();
  },
  onLive() {
    hud.hideBuy();
    hud.setObjective('Objective: plant the charge at Site A — hold E on the amber pad, or clear the Jackals.');
    if (!input.state.locked && !shot) hud.showOverlay('paused', 0);
  },
  onRoundEnd(foxWon, reason, st) {
    hud.showBanner(st.banner, reason);
    hud.hidePlant();
    if (foxWon) audio.roundWin();
    else audio.roundLose();
    hud.setScore(st.foxWins, st.jackalWins);
    hud.setMoney(st.money);
    matchScoreText = `Foxes ${st.foxWins} — Jackals ${st.jackalWins}. ${st.matchOver ? (st.matchWinner === 'fox' ? 'Foxes win the match!' : 'Jackals win the match.') : ''}`;
    if (st.matchOver) {
      hud.showOverlay('end', matchScoreText);
      input.exitLock();
    }
  },
  onPlanted(byPlayer) {
    hud.showBanner('Charge planted', byPlayer ? 'You planted the charge — hold Site A for 35 seconds.' : 'A teammate planted the charge — hold Site A.');
    hud.setObjective('Charge planted at Site A — defend it until it detonates. Jackals will try to defuse.');
    audio.plantBeep();
  },
});

const bots = createBots(scene, world, random, {
  onKilled(bot, killer) {
    hud.killfeed(killer || 'Foxes', bot.name, false);
    if (killer === 'You') {
      rounds.addKillReward();
      hud.setMoney(rounds.state.money);
    }
  },
  onBotShot(shooter, target, isPlayer, hit, dmg, dist) {
    audio.enemyShot(dist);
    tracerFrom.set(shooter.position.x, shooter.position.y + 1.4, shooter.position.z);
    tracerTo.set(target.position.x, target.position.y + 1.2, target.position.z);
    spawnTracer(tracerFrom, tracerTo);
    if (!hit) return;
    if (isPlayer) hurtPlayer(dmg, shooter.name);
    else bots.damage(target, dmg, shooter.name);
  },
  onChannel(bot, kind, progress) {
    if (kind === 'defuse') {
      defuseProgress = progress;
      hud.showPlant(progress, `${bot.name} is defusing the charge!`);
    } else {
      hud.showPlant(progress, `${bot.name} is planting the charge…`);
    }
  },
  onPlanted(bot) {
    rounds.plantCharge(false);
  },
  onDefused(bot) {
    hud.showBanner('Charge defused', `${bot.name} defused the charge.`);
    rounds.endRound(false, 'The charge was defused.');
  },
});

const shootables = world.shootables.concat(bots.hitMeshes);

function hurtPlayer(dmg, killer) {
  if (!body.alive) return;
  body.health -= dmg;
  hud.setHealth(body.health);
  hud.damageFlash();
  audio.hurt();
  if (body.health <= 0) {
    body.health = 0;
    body.alive = false;
    hud.killfeed(killer, 'You', false);
    hud.showBanner('You are down', 'Your squad fights on — next round you respawn.');
  }
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function shoot(spread) {
  if (!weapon.takeRound()) {
    audio.dryClick();
    return false;
  }
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const hit = raycaster.intersectObjects(shootables, false)[0];
  tracerFrom.copy(camera.position);
  if (hit) {
    tracerTo.copy(hit.point);
    const bot = hit.object.userData.bot;
    if (bot && bot.alive) {
      const head = hit.object.userData.part === 'head';
      const dmg = Math.round(weapon.def().damage * (head ? weapon.def().headMult : 1));
      const killed = bots.damage(bot, dmg, 'You');
      hud.hitMarker(killed, markerHoldMs);
      if (killed) audio.kill();
      else audio.hit();
    }
  } else {
    tracerTo.copy(camera.position).addScaledVector(direction, 60);
  }
  spawnTracer(tracerFrom, tracerTo);
  weapon.pullTrigger();
  audio.shot(weapon.state.id);
  bots.hearShot(body.position, elapsed);
  player.recoil(weapon.recoilKick(), (random() * 2 - 1) * weapon.recoilKick() * 0.4);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.currentName());
  return true;
}

function step(dt) {
  elapsed += dt;
  const phase = rounds.state.phase;
  if (phase === 'buy') {
    player.step(dt, input.state.keys);
    weapon.step(dt);
  } else if (phase === 'live' || phase === 'planted') {
    player.step(dt, input.state.keys);
    weapon.step(dt);
    bots.step(dt, body, elapsed, rounds.state.planted);
    grenades.step(dt);
    // Player plant: hold E inside Site A while the round is live.
    if (phase === 'live' && body.alive && rounds.playerInSite(body.position) && input.state.keys.has('KeyE')) {
      plantProgress += dt / 3;
      hud.showPlant(plantProgress, 'Planting the charge… hold E');
      if (elapsed - plantBeepAt > 0.5) { plantBeepAt = elapsed; audio.plantBeep(); }
      if (plantProgress >= 1) {
        plantProgress = 0;
        hud.hidePlant();
        rounds.plantCharge(true);
      }
    } else if (plantProgress > 0) {
      plantProgress = 0;
      if (defuseProgress <= 0) hud.hidePlant();
    }
    if (rounds.state.planted && defuseProgress > 0 && bots.bots.every((b) => b.channelKind !== 'defuse')) {
      defuseProgress = 0;
      hud.hidePlant();
    }
  }
  rounds.step(dt, {
    fox: bots.aliveCount('fox') + (body.alive ? 1 : 0),
    jackal: bots.aliveCount('jackal'),
  });
  hud.setTimer(rounds.state.timer, rounds.state.phase);
  hud.setAlive(bots.aliveCount('fox') + (body.alive ? 1 : 0), bots.aliveCount('jackal'));
  hud.setGrenades(weapon.state.grenades);
  hud.setMoney(rounds.state.money);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    const phase = rounds.state.phase;
    const canFire = input.state.locked && body.alive && (phase === 'live' || phase === 'planted');
    const semi = !weapon.def().auto;
    const fireEdge = input.state.firing && !prevFiring;
    if (canFire && weapon.ready() && (!semi || fireEdge)) {
      shoot(shot ? 0 : weapon.spread(player.groundSpeed(), body.crouching, input.state.aiming, body.sprinting));
    }
    prevFiring = input.state.firing;
    const pressed = input.takePressed();
    if (pressed.has('KeyR')) weapon.reload();
    if (pressed.has('KeyG') && body.alive && weapon.state.grenades > 0 && (phase === 'live' || phase === 'planted')) {
      camera.getWorldDirection(direction);
      tracerFrom.copy(camera.position);
      if (grenades.throwFrom(tracerFrom, direction, 'player')) weapon.state.grenades -= 1;
    }
    if (pressed.has('KeyB') && phase === 'buy') {
      hud.hideBuy();
      input.requestLock();
    }
    WEAPON_ORDER.forEach((id, i) => {
      if (pressed.has(`Digit${i + 1}`)) {
        if (weapon.select(id)) hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.currentName());
      }
    });
    if (pressed.has('KeyM')) audio.toggleMute();
    // Sniper scope: right-click narrows the field of view.
    const targetFov = input.state.aiming && weapon.state.id === 'sniper' ? 74 / weapon.def().zoom : 74;
    if (Math.abs(camera.fov - targetFov) > 0.1) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 14);
      camera.updateProjectionMatrix();
    }
    hud.setSpread(4 + weapon.spread(player.groundSpeed(), body.crouching, input.state.aiming, body.sprinting) * 900);
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  for (const t of tracers) {
    if (t.life > 0) {
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.85;
      if (t.life <= 0) t.line.visible = false;
    }
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  body.pitch = 0;
  body.yaw = 0;
  if (name === 'start') {
    body.position.set(1.0, 0, 9.5);
    settle(20);
    aimAt(new THREE.Vector3(11, 1.5, -9.5));
    hud.showOverlay('start', 0);
  } else if (name === 'play') {
    rounds.state.phase = 'live';
    rounds.state.timer = 88;
    body.position.set(0, 0, 4);
    settle(20);
    const point = bots.aimPoint(0);
    for (let round = 0; round < 3; round += 1) {
      aimAt(point);
      shoot(0);
      if (round < 2) settle(8);
    }
    settle(12);
    aimAt(bots.aimPoint(1));
    shoot(0);
    settle(1);
  } else {
    // end: three Jackals down, Foxes ahead, round banner up.
    rounds.state.phase = 'over';
    rounds.state.foxWins = 1;
    const jackals = bots.bots.filter((b) => b.team === 'jackal');
    for (let i = 0; i < 3 && i < jackals.length; i += 1) bots.damage(jackals[i], 500, 'You');
    body.position.set(4, 0, 2);
    settle(20);
    aimAt(new THREE.Vector3(11, 1.5, -9.5));
    hud.showBanner('Foxes take the round', 'Jackal squad eliminated.');
    hud.setScore(1, 0);
    settle(10);
  }
  hud.setScore(rounds.state.foxWins, rounds.state.jackalWins);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.currentName());
  hud.setHealth(body.health);
  hud.setMoney(rounds.state.money);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.currentName());
hud.setScore(0, 0);
hud.setHealth(100);
hud.setMoney(800);
hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (rounds.state.matchOver) {
    rounds.state.round = 1;
    rounds.state.foxWins = 0;
    rounds.state.jackalWins = 0;
    rounds.state.money = 800;
    rounds.state.kills = 0;
    rounds.state.matchOver = false;
    rounds.state.matchWinner = null;
    weapon.resetToPistol();
    rounds.startRound();
    return;
  }
  if (rounds.state.phase === 'buy') {
    hud.hideBuy();
    input.requestLock();
    return;
  }
  input.requestLock();
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    hud.hideBuy();
  } else if (!rounds.state.matchOver) {
    if (rounds.state.phase === 'buy') hud.reopenBuy();
    else hud.showOverlay(started ? 'paused' : 'start', matchScoreText);
  }
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
rounds.startRound();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
