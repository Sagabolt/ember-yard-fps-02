// Grenades: a thrown spark grenade with an arc, a bounce, a 1.4 s fuse and a
// radial blast. Damage falls off with distance; the thrower takes half damage
// from their own blast. One pool of three grenade meshes, reused, never created
// per throw. The blast is reported through onBlast so main.js can apply it.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const FUSE = 1.4;
const BLAST_RADIUS = 6;
const MAX_DAMAGE = 100;
const MIN_DAMAGE = 20;
const GRAVITY = 14;

export function createGrenades(scene, colliders, onBlast) {
  const geo = new THREE.SphereGeometry(0.11, 12, 8);
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.4, metalness: 0.5 });
  const lightMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) });
  const pool = [];
  for (let i = 0; i < 3; i += 1) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    const light = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 6);
    mesh.add(light);
    scene.add(mesh);
    pool.push({ mesh, light, active: false, vel: new THREE.Vector3(), fuse: 0, owner: null });
  }
  const flashGeo = new THREE.SphereGeometry(1, 16, 12);
  const flashMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.amber), transparent: true, opacity: 0 });
  const flash = new THREE.Mesh(flashGeo, flashMat);
  flash.visible = false;
  scene.add(flash);
  let flashLeft = 0;
  const pos = new THREE.Vector3();
  const prev = new THREE.Vector3();

  function explode(g) {
    g.active = false;
    g.mesh.visible = false;
    g.light.intensity = 0;
    flash.position.copy(g.mesh.position);
    flash.visible = true;
    flashLeft = 0.25;
    onBlast(g.mesh.position, BLAST_RADIUS, MAX_DAMAGE, MIN_DAMAGE, g.owner);
  }

  return {
    throwFrom(from, direction, owner) {
      const g = pool.find((p) => !p.active);
      if (!g) return false;
      g.active = true;
      g.owner = owner;
      g.fuse = FUSE;
      g.mesh.position.copy(from);
      g.mesh.visible = true;
      g.vel.copy(direction).multiplyScalar(16);
      g.vel.y += 4.5;
      g.light.intensity = 6;
      return true;
    },
    step(dt) {
      if (flashLeft > 0) {
        flashLeft -= dt;
        const s = 1 + (0.25 - flashLeft) * 22;
        flash.scale.set(s, s, s);
        flashMat.opacity = Math.max(0, flashLeft / 0.25) * 0.7;
        if (flashLeft <= 0) flash.visible = false;
      }
      for (const g of pool) {
        if (!g.active) continue;
        g.fuse -= dt;
        g.vel.y -= GRAVITY * dt;
        pos.copy(g.mesh.position).addScaledVector(g.vel, dt);
        // Simple bounce: if the next step is inside a collider, damp that axis.
        prev.copy(g.mesh.position);
        g.mesh.position.copy(pos);
        for (const c of colliders) {
          if (c.containsPoint(g.mesh.position)) {
            g.mesh.position.copy(prev);
            if (Math.abs(g.vel.x) > Math.abs(g.vel.z)) g.vel.x *= -0.45;
            else g.vel.z *= -0.45;
            g.vel.y = Math.abs(g.vel.y) * 0.4;
            break;
          }
        }
        if (g.mesh.position.y < 0.11) {
          g.mesh.position.y = 0.11;
          g.vel.y = Math.abs(g.vel.y) * 0.45;
          g.vel.x *= 0.8;
          g.vel.z *= 0.8;
        }
        if (g.fuse <= 0) explode(g);
      }
    },
    reset() {
      for (const g of pool) {
        g.active = false;
        g.mesh.visible = false;
        g.light.intensity = 0;
      }
      flash.visible = false;
      flashLeft = 0;
    },
    activeCount() {
      return pool.filter((g) => g.active).length;
    },
  };
}
