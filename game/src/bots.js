// Bots: 4 Fox teammates and 5 Jackal opponents. Each bot is a small state
// machine — advance along a route, hold a post, engage a visible enemy, take
// cover when hurt, investigate gunfire it hears, and channel the plant or the
// defuse at Site A. Thinking is staggered (one bot thinks every 0.15 s) and
// movement reuses the player's axis-separated collision, so bots obey the map.
// All temporary vectors are module-level: no allocation in the hot loop.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { moveBody } from './player.js';
import { FOX_SPAWNS, JACKAL_SPAWNS, WAYPOINTS } from './world.js';

const FOX_NAMES = ['Rani', 'Bimo', 'Sari', 'Dito'];
const JACKAL_NAMES = ['Vex', 'Mara', 'Krol', 'Juno', 'Pike'];
const BOT_HEALTH = 100;
const WALK_SPEED = 3.4;
const ENGAGE_RANGE = 18;
const AIM_DELAY = 0.7;
const PLANT_TIME = 3;
const DEFUSE_TIME = 5;

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const ray = new THREE.Raycaster();

function teamColour(team) {
  return team === 'fox' ? PALETTE.teal : PALETTE.rust;
}

export function createBots(scene, world, random, events) {
  const colliders = world.colliders;
  const shootables = world.shootables;
  const bots = [];
  const hitMeshes = [];

  function buildBot(team, name, spawn, route) {
    const colour = new THREE.Color(teamColour(team));
    const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.8 });
    const suit = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.65, metalness: 0.05 });
    const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.6 });
    const group = new THREE.Group();
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.18), dark);
    legL.position.set(-0.11, 0.25, 0);
    const legR = legL.clone();
    legR.position.x = 0.11;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), suit);
    torso.position.y = 0.85;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), skin);
    head.position.y = 1.32;
    const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.36), suit);
    helmet.position.y = 1.44;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.55), dark);
    gun.position.set(0.2, 0.95, -0.25);
    group.add(legL, legR, torso, head, helmet, gun);
    group.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
    group.position.set(spawn.x, 0, spawn.z);
    scene.add(group);
    const bot = {
      id: `${team}-${name}`, team, name, group, torso, head,
      position: group.position,
      velocity: new THREE.Vector3(),
      yaw: spawn.yaw, health: BOT_HEALTH, alive: true,
      state: 'advance', route, routeIndex: 0,
      hold: null, target: null, targetIsPlayer: false,
      thinkTimer: random() * 0.15, fireCooldown: 0, burstLeft: 0, burstTimer: 0,
      aimTimer: 0, strafeDir: 1, strafeTimer: 0, channel: 0, channelKind: null,
      heard: null, heardAt: -99, flash: 0, fall: 0,
      stuckFrames: 0, side: 1, sideUntil: -1, prevX: spawn.x, prevZ: spawn.z,
    };
    torso.userData.bot = bot;
    torso.userData.part = 'torso';
    head.userData.bot = bot;
    head.userData.part = 'head';
    hitMeshes.push(torso, head);
    bots.push(bot);
    return bot;
  }

  function spawnAll() {
    for (const bot of bots) {
      bot.group.visible = true;
      bot.group.rotation.set(0, 0, 0);
      bot.group.position.y = 0;
    }
    bots.length = 0;
    hitMeshes.length = 0;
    const foxRoutes = [WAYPOINTS.west, WAYPOINTS.mid, WAYPOINTS.east, WAYPOINTS.east];
    // Fox bots take spawns 0-3; spawn 4 is the player's own.
    FOX_NAMES.forEach((name, i) => buildBot('fox', name, FOX_SPAWNS[i], foxRoutes[i]));
    const jackalPosts = WAYPOINTS.defend;
    JACKAL_NAMES.forEach((name, i) => {
      const bot = buildBot('jackal', name, JACKAL_SPAWNS[i], WAYPOINTS.defend);
      bot.hold = jackalPosts[i % jackalPosts.length];
      bot.state = 'hold';
    });
  }

  function hasLOS(from, to) {
    tmpA.copy(to).sub(from);
    const dist = tmpA.length();
    if (dist < 0.01) return true;
    tmpA.multiplyScalar(1 / dist);
    ray.set(from, tmpA);
    ray.far = dist;
    const hit = ray.intersectObjects(shootables, false)[0];
    return !hit;
  }

  function eyeOf(bot) {
    tmpB.set(bot.position.x, bot.position.y + 1.45, bot.position.z);
    return tmpB;
  }

  function findTarget(bot, player) {
    // Nearest living enemy with line of sight, player first on a tie.
    // Defenders (Jackals) hold their half: they only engage a target that
    // has crossed mid (z < 0) or is within 10 m of them, so they never push
    // down to the Fox spawn and snipe bots leaving it.
    let best = null;
    let bestDist = ENGAGE_RANGE;
    const inZone = (pos, dist) => bot.team === 'fox' || pos.z < 0 || dist < 10;
    if (player.alive) {
      tmpC.set(player.position.x, player.position.y + player.eye * 0.8, player.position.z);
      const d = tmpC.distanceTo(eyeOf(bot));
      if (d < bestDist && inZone(player.position, d) && hasLOS(eyeOf(bot), tmpC)) { best = player; bestDist = d; }
    }
    for (const other of bots) {
      if (other === bot || !other.alive || other.team === bot.team) continue;
      tmpC.set(other.position.x, other.position.y + 1.2, other.position.z);
      const d = tmpC.distanceTo(eyeOf(bot));
      if (d < bestDist && inZone(other.position, d) && hasLOS(eyeOf(bot), tmpC)) { best = other; bestDist = d; }
    }
    if (!best) return null;
    return { target: best, isPlayer: best === player, dist: bestDist };
  }

  function damage(bot, amount, killer) {
    if (!bot.alive) return false;
    bot.health -= amount;
    bot.flash = 0.12;
    if (bot.health > 0) {
      if (bot.health < 40 && bot.state !== 'engage') bot.state = 'cover';
      return false;
    }
    bot.alive = false;
    bot.health = 0;
    bot.channel = 0;
    bot.channelKind = null;
    bot.fall = 0;
    events.onKilled(bot, killer);
    return true;
  }

  function stepBot(bot, dt, player, time, planted) {
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.4);
      bot.group.rotation.x = -bot.fall * 1.45;
      bot.group.position.y = -bot.fall * 0.06;
      return;
    }
    bot.flash = Math.max(0, bot.flash - dt);
    bot.group.rotation.x = 0;
    // Flash the suit white briefly when hit: swap material emissive via scale pulse.
    bot.group.scale.setScalar(bot.flash > 0 ? 1.04 : 1);
    bot.thinkTimer -= dt;
    if (bot.thinkTimer <= 0) {
      bot.thinkTimer = 0.15 + random() * 0.1;
      const found = findTarget(bot, player);
      if (found) {
        if (bot.target !== found.target) bot.aimTimer = AIM_DELAY;
        bot.target = found.target;
        bot.targetIsPlayer = found.isPlayer;
        bot.state = 'engage';
      } else if (bot.state === 'engage') {
        bot.target = null;
        bot.state = bot.heard && time - bot.heardAt < 6 ? 'investigate' : bot.hold ? 'hold' : 'advance';
      }
      // Objective: Foxes push the site, Jackals converge on a planted charge.
      if (planted && bot.team === 'jackal' && bot.state !== 'engage') bot.state = 'defuse';
      if (!planted && bot.team === 'fox' && bot.state !== 'engage' && bot.routeIndex >= bot.route.length) {
        bot.state = 'plant';
      }
      if (bot.state === 'cover') {
        const cover = WAYPOINTS.cover[Math.floor(random() * WAYPOINTS.cover.length)];
        bot.hold = cover;
        if (bot.health > 70) bot.state = 'advance';
      }
    }

    // Choose a move target for this step.
    let dest = null;
    let speed = WALK_SPEED;
    if (bot.state === 'engage' && bot.target) {
      const t = bot.targetIsPlayer ? bot.target.position : bot.target.position;
      tmpA.set(t.x, 0, t.z);
      const d = tmpA.distanceTo(tmpB.set(bot.position.x, 0, bot.position.z));
      bot.strafeTimer -= dt;
      if (bot.strafeTimer <= 0) { bot.strafeDir *= -1; bot.strafeTimer = 0.7 + random() * 0.8; }
      if (d > 16) dest = [t.x, t.z];
      else if (d < 5) dest = [bot.position.x - (t.x - bot.position.x), bot.position.z - (t.z - bot.position.z)];
      else {
        // Strafe sideways around the enemy.
        const dx = t.x - bot.position.x;
        const dz = t.z - bot.position.z;
        const len = Math.hypot(dx, dz) || 1;
        dest = [bot.position.x + (-dz / len) * bot.strafeDir * 3, bot.position.z + (dx / len) * bot.strafeDir * 3];
      }
      speed = WALK_SPEED * 0.8;
    } else if (bot.state === 'plant') {
      dest = [world.site.x, world.site.z];
    } else if (bot.state === 'defuse') {
      dest = [world.site.x, world.site.z];
    } else if (bot.state === 'investigate' && bot.heard) {
      dest = [bot.heard.x, bot.heard.z];
    } else if (bot.state === 'hold' && bot.hold) {
      dest = bot.hold;
    } else if (bot.state === 'cover' && bot.hold) {
      dest = bot.hold;
    } else if (bot.state === 'advance' && bot.route) {
      const wp = bot.route[bot.routeIndex];
      if (wp) dest = wp;
    }

    if (dest) {
      // Unstick: if the bot has been pushing into a wall, sidestep around it.
      if (bot.sideUntil > time) {
        const dx = dest[0] - bot.position.x;
        const dz = dest[1] - bot.position.z;
        const len = Math.hypot(dx, dz) || 1;
        dest = [bot.position.x + dx + (-dz / len) * bot.side * 3, bot.position.z + dz + (dx / len) * bot.side * 3];
      }
      tmpA.set(dest[0] - bot.position.x, 0, dest[1] - bot.position.z);
      const dist = tmpA.length();
      if (dist > 0.4) {
        tmpA.multiplyScalar(1 / dist);
        bot.velocity.x = tmpA.x * speed;
        bot.velocity.z = tmpA.z * speed;
        bot.yaw = Math.atan2(-tmpA.x, -tmpA.z);
        // Channel the plant/defuse only while standing still on the site.
        const onSite = Math.abs(bot.position.x - world.site.x) < world.site.half && Math.abs(bot.position.z - world.site.z) < world.site.half;
        if (bot.state === 'plant' && onSite && dist < 1.2) bot.velocity.set(0, 0, 0);
        if (bot.state === 'defuse' && onSite && dist < 1.2) bot.velocity.set(0, 0, 0);
      } else {
        bot.velocity.set(0, 0, 0);
        if (bot.state === 'advance' && bot.route) bot.routeIndex = Math.min(bot.route.length, bot.routeIndex + 1);
        if (bot.state === 'investigate') { bot.heard = null; bot.state = bot.hold ? 'hold' : 'advance'; }
      }
    } else {
      bot.velocity.set(0, 0, 0);
    }

    // Plant / defuse channels progress only while the bot stands on the site.
    const onSite = Math.abs(bot.position.x - world.site.x) < world.site.half && Math.abs(bot.position.z - world.site.z) < world.site.half;
    if (bot.state === 'plant' && onSite && !planted) {
      bot.channelKind = 'plant';
      bot.channel += dt;
      events.onChannel(bot, 'plant', bot.channel / PLANT_TIME);
      if (bot.channel >= PLANT_TIME) { bot.channel = 0; events.onPlanted(bot); }
    } else if (bot.state === 'defuse' && onSite && planted) {
      bot.channelKind = 'defuse';
      bot.channel += dt;
      events.onChannel(bot, 'defuse', bot.channel / DEFUSE_TIME);
      if (bot.channel >= DEFUSE_TIME) { bot.channel = 0; events.onDefused(bot); }
    } else {
      bot.channel = 0;
      bot.channelKind = null;
    }

    // Firing: bursts with a cooldown, accuracy falling with distance and motion.
    // A newly acquired target costs an aim delay first, so nobody is beamed
    // the instant they round a corner; a holding Jackal aims a touch better.
    bot.fireCooldown -= dt;
    bot.aimTimer = Math.max(0, bot.aimTimer - dt);
    if (bot.state === 'engage' && bot.target && (bot.targetIsPlayer ? bot.target.alive : bot.target.alive) && bot.aimTimer === 0) {
      const t = bot.targetIsPlayer ? bot.target.position : bot.target.position;
      tmpA.set(t.x - bot.position.x, 0, t.z - bot.position.z);
      const dist = tmpA.length() || 1;
      bot.yaw = Math.atan2(-tmpA.x, -tmpA.z);
      if (bot.burstLeft > 0) {
        bot.burstTimer -= dt;
        if (bot.burstTimer <= 0) {
          bot.burstTimer = 0.11;
          bot.burstLeft -= 1;
          const targetSpeed = bot.targetIsPlayer ? Math.hypot(bot.target.velocity.x, bot.target.velocity.z) : 3;
          let chance = 0.5 - dist * 0.02 - targetSpeed * 0.02 + (bot.team === 'jackal' && Math.hypot(bot.velocity.x, bot.velocity.z) < 0.5 ? 0.05 : 0);
          chance = Math.max(0.05, Math.min(0.55, chance));
          const hit = random() < chance;
          const dmg = 9 + random() * 7;
          events.onBotShot(bot, bot.target, bot.targetIsPlayer, hit, dmg, dist);
        }
      } else if (bot.fireCooldown <= 0) {
        bot.burstLeft = 3 + Math.floor(random() * 3);
        bot.burstTimer = 0;
        bot.fireCooldown = 0.9 + random() * 0.7;
      }
    } else {
      bot.burstLeft = 0;
    }

    bot.velocity.y = -0.5;
    const moving = Math.hypot(bot.velocity.x, bot.velocity.z) > 0.5;
    moveBody(colliders, bot.position, bot.velocity, dt, 1.72);
    if (dest && moving) {
      const moved = Math.hypot(bot.position.x - bot.prevX, bot.position.z - bot.prevZ);
      if (moved < 0.005) {
        bot.stuckFrames += 1;
        if (bot.stuckFrames > 25) {
          bot.side = random() < 0.5 ? -1 : 1;
          bot.sideUntil = time + 0.9;
          bot.stuckFrames = 0;
        }
      } else bot.stuckFrames = 0;
    }
    bot.prevX = bot.position.x;
    bot.prevZ = bot.position.z;
    bot.group.rotation.y = bot.yaw;
    // Walk bob.
    bot.group.position.y = moving ? Math.abs(Math.sin(time * 9)) * 0.04 : 0;
  }

  spawnAll();

  return {
    bots,
    hitMeshes,
    spawnAll,
    damage,
    hearShot(pos, time) {
      for (const bot of bots) {
        if (!bot.alive) continue;
        const d = Math.hypot(bot.position.x - pos.x, bot.position.z - pos.z);
        if (d < 26) { bot.heard = { x: pos.x, z: pos.z }; bot.heardAt = time; }
      }
    },
    step(dt, player, time, planted) {
      for (const bot of bots) stepBot(bot, dt, player, time, planted);
    },
    aliveCount(team) {
      return bots.filter((b) => b.team === team && b.alive).length;
    },
    reset() {
      for (const bot of bots) scene.remove(bot.group);
      spawnAll();
    },
    aimPoint(index) {
      const alive = bots.filter((b) => b.team === 'jackal' && b.alive);
      const bot = alive[index % Math.max(1, alive.length)];
      if (!bot) return new THREE.Vector3(0, 1.2, -9);
      return new THREE.Vector3(bot.position.x, bot.position.y + 1.1, bot.position.z);
    },
  };
}
