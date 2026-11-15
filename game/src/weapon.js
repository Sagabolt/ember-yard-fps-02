// Weapons: four buyable guns plus a grenade slot. Each gun owns its numbers —
// damage, head multiplier, fire gap, magazine, reload time, spread, recoil and
// price — and its view model. main.js owns the ray and the damage; this module
// owns the magazine, the cooldown and the model. Spread grows with movement
// speed and sprinting, and shrinks when crouched or aiming, so stopping to aim pays.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: { name: 'P9 Sidearm', price: 0, damage: 26, headMult: 3, gap: 0.16, mag: 12, reserve: 48, reload: 1.3, spreadStill: 0.003, spreadMove: 0.02, recoil: 0.008, auto: false, zoom: 1 },
  smg: { name: 'Kestrel-9 SMG', price: 1500, damage: 22, headMult: 3, gap: 0.075, mag: 28, reserve: 112, reload: 1.7, spreadStill: 0.006, spreadMove: 0.034, recoil: 0.006, auto: true, zoom: 1 },
  rifle: { name: 'AR-7 Vulture', price: 2700, damage: 34, headMult: 3, gap: 0.096, mag: 30, reserve: 90, reload: 1.9, spreadStill: 0.0022, spreadMove: 0.028, recoil: 0.01, auto: true, zoom: 1 },
  sniper: { name: 'Heron .50', price: 4750, damage: 88, headMult: 2.5, gap: 1.15, mag: 5, reserve: 15, reload: 2.8, spreadStill: 0.0006, spreadMove: 0.05, recoil: 0.03, auto: false, zoom: 2.6 },
};
export const WEAPON_ORDER = ['pistol', 'smg', 'rifle', 'sniper'];
export const GRENADE_PRICE = 300;

const MUZZLE_TIME = 0.06;
const MOVE_REFERENCE = 5.2;

export function createWeapon(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rust), roughness: 0.6, metalness: 0.3 });

  // One view model per gun, built once and swapped; only the active one is visible.
  const models = {};
  function buildModel(id) {
    const model = new THREE.Group();
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), body);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
    stock.position.set(0, -0.02, 0.3);
    model.add(receiver, stock);
    if (id === 'pistol') {
      const slide = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.3), dark);
      slide.position.set(0, 0.03, -0.2);
      model.add(slide);
    } else if (id === 'smg') {
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.3), grip);
      barrel.position.set(0, 0.02, -0.32);
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.08), dark);
      mag.position.set(0, -0.14, -0.05);
      model.add(barrel, mag);
    } else if (id === 'rifle') {
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.4), grip);
      barrel.position.set(0, 0.025, -0.38);
      const sight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.1), dark);
      sight.position.set(0, 0.08, -0.05);
      model.add(barrel, sight);
    } else {
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.62), grip);
      barrel.position.set(0, 0.03, -0.5);
      const scope = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.22), dark);
      scope.position.set(0, 0.09, 0.05);
      model.add(barrel, scope);
    }
    model.position.set(0.24, -0.2, -0.42);
    model.visible = false;
    camera.add(model);
    return model;
  }
  for (const id of WEAPON_ORDER) models[id] = buildModel(id);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const owned = { pistol: true, smg: false, rifle: false, sniper: false };
  const state = { id: 'pistol', mag: 12, reserve: 48, cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, grenades: 0 };
  models.pistol.visible = true;

  function def() {
    return WEAPONS[state.id];
  }
  function applyLoadout() {
    const d = def();
    state.mag = d.mag;
    state.reserve = d.reserve;
    state.cooldown = 0;
    state.reloadLeft = 0;
    for (const id of WEAPON_ORDER) models[id].visible = id === state.id;
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.id];
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def().reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def().mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    owned,
    def,
    step,
    currentName() {
      return def().name;
    },
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def().gap;
      state.flash = MUZZLE_TIME;
      state.kick = 0.055;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === def().mag || state.reserve === 0) return;
      state.reloadLeft = def().reload;
    },
    spread(speed, crouching, aiming, sprinting) {
      const d = def();
      let spread = d.spreadStill + Math.min(1, speed / MOVE_REFERENCE) * d.spreadMove;
      if (crouching) spread *= 0.7;
      if (aiming) spread *= 0.45;
      if (sprinting) spread *= 1.8;
      return spread;
    },
    recoilKick() {
      return def().recoil;
    },
    select(id) {
      if (!owned[id] || id === state.id) return false;
      state.id = id;
      applyLoadout();
      return true;
    },
    buy(id, money) {
      if (owned[id]) return { ok: false, money };
      const price = WEAPONS[id].price;
      if (money < price) return { ok: false, money };
      owned[id] = true;
      state.id = id;
      applyLoadout();
      return { ok: true, money: money - price };
    },
    buyGrenade(money) {
      if (money < GRENADE_PRICE || state.grenades >= 2) return { ok: false, money };
      state.grenades += 1;
      return { ok: true, money: money - GRENADE_PRICE };
    },
    refill() {
      applyLoadout();
      state.flash = 0;
      state.kick = 0;
    },
    resetToPistol() {
      for (const id of WEAPON_ORDER) owned[id] = id === 'pistol';
      state.id = 'pistol';
      state.grenades = 0;
      applyLoadout();
    },
  };
}
