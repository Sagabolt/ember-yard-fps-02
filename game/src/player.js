// Player movement: acceleration, friction, gravity, crouch, sprint and jump,
// resolved as a box against the world's colliders one axis at a time, so a wall
// never swallows the player. moveBody is the same axis-separated resolver the
// bots use, so both teams obey the same collision.
import * as THREE from 'three';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.2;
const SPRINT_SPEED = 7.0;
const CROUCH_SPEED = 2.4;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const GRAVITY = 20;
const JUMP_SPEED = 6.2;

const probe = new THREE.Box3();

// True when a box of the given radius/height at (x, y, z) overlaps a collider.
// lift keeps feet and crown out of horizontal tests, so standing on the floor
// is not read as walking into a wall.
export function overlapsBox(colliders, x, y, z, height, lift, radius = RADIUS) {
  probe.min.set(x - radius, y + lift, z - radius);
  probe.max.set(x + radius, y + height - lift, z + radius);
  for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
  return null;
}

// Move a standing body by velocity*dt, one axis at a time, landing on floors.
// Returns whether the body is on the ground after the move. No allocation.
export function moveBody(colliders, position, velocity, dt, height = STAND_HEIGHT) {
  const nextX = position.x + velocity.x * dt;
  if (!overlapsBox(colliders, nextX, position.y, position.z, height, 0.04)) position.x = nextX;
  else velocity.x = 0;
  const nextZ = position.z + velocity.z * dt;
  if (!overlapsBox(colliders, position.x, position.y, nextZ, height, 0.04)) position.z = nextZ;
  else velocity.z = 0;
  position.y += velocity.y * dt;
  let onGround = false;
  const hit = overlapsBox(colliders, position.x, position.y, position.z, height, 0);
  if (hit && velocity.y <= 0) {
    position.y = hit.max.y;
    velocity.y = 0;
    onGround = true;
  } else if (hit) {
    position.y = hit.min.y - height;
    velocity.y = 0;
  }
  if (position.y < 0) {
    position.y = 0;
    velocity.y = 0;
    onGround = true;
  }
  return onGround;
}

export function createPlayer(colliders, spawn) {
  const player = {
    position: new THREE.Vector3(spawn.x, 0, spawn.z),
    velocity: new THREE.Vector3(),
    yaw: spawn.yaw,
    pitch: 0,
    eye: STAND_EYE,
    onGround: true,
    crouching: false,
    sprinting: false,
    height: STAND_HEIGHT,
    health: 100,
    alive: true,
  };
  const wish = new THREE.Vector3();

  function look(dx, dy, sensitivity = 0.0022) {
    player.yaw -= dx * sensitivity;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    player.pitch = Math.min(1.45, player.pitch + pitchKick);
    player.yaw += yawKick;
  }

  function step(dt, keys) {
    if (!player.alive) return;
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (crouching && !player.crouching) {
      player.crouching = true;
      player.height = CROUCH_HEIGHT;
    } else if (!crouching && player.crouching && !overlapsBox(colliders, player.position.x, player.position.y, player.position.z, STAND_HEIGHT, 0.02)) {
      player.crouching = false;
      player.height = STAND_HEIGHT;
    }
    const eyeTarget = player.crouching ? CROUCH_EYE : STAND_EYE;
    player.eye += (eyeTarget - player.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(player.yaw);
      const cos = Math.cos(player.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }

    player.sprinting = !player.crouching && (keys.has('ShiftLeft') || keys.has('ShiftRight')) && forward > 0;
    const speed = player.crouching ? CROUCH_SPEED : player.sprinting ? SPRINT_SPEED : WALK_SPEED;
    const blend = Math.min(1, (player.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt / speed);
    player.velocity.x += (wish.x * speed - player.velocity.x) * blend;
    player.velocity.z += (wish.z * speed - player.velocity.z) * blend;
    if (player.onGround && !wish.lengthSq()) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      player.velocity.x *= damp;
      player.velocity.z *= damp;
    }

    if (keys.has('Space') && player.onGround) {
      player.velocity.y = JUMP_SPEED;
      player.onGround = false;
    }
    player.velocity.y -= GRAVITY * dt;
    player.onGround = moveBody(colliders, player.position, player.velocity, dt, player.height);
    player.velocity.y = Math.max(-30, player.velocity.y);
  }

  return {
    state: player,
    step,
    look,
    recoil,
    respawn(at) {
      player.position.set(at.x, 0, at.z);
      player.velocity.set(0, 0, 0);
      player.yaw = at.yaw;
      player.pitch = 0;
      player.health = 100;
      player.alive = true;
      player.crouching = false;
      player.height = STAND_HEIGHT;
      player.eye = STAND_EYE;
    },
    groundSpeed() {
      return Math.hypot(player.velocity.x, player.velocity.z);
    },
  };
}
