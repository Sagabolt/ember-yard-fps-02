// The map: "Ember Yard", an original disused freight yard at dusk, built from
// boxes. Every box is a collider for players and bots and a surface a bullet
// stops on. Plain geometry only, no models and no textures.
// Layout (x east, z south, metres): Foxes spawn south, Jackals north, Site A
// north-east under the crane. Three lanes: west crate lane, mid warehouse with
// two doorways, east container lane. Waypoints below are the routes bots walk.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const SITE_A = { x: 11, z: -9.5, half: 3.2 };
export const FOX_SPAWNS = [
  { x: -6, z: 11.5, yaw: 0 },
  { x: -2, z: 12, yaw: 0 },
  { x: 2, z: 12, yaw: 0 },
  { x: 6, z: 11.5, yaw: 0 },
  { x: 1.0, z: 9.5, yaw: 0 },
];
export const JACKAL_SPAWNS = [
  { x: -8, z: -11.5, yaw: Math.PI },
  { x: -3, z: -12, yaw: Math.PI },
  { x: 3, z: -12, yaw: Math.PI },
  { x: 8, z: -11.5, yaw: Math.PI },
  { x: 0, z: -9.5, yaw: Math.PI },
];
// Routes: west lane, mid warehouse (through its doorways), east lane (to
// Site A), and site defence posts. Every point is in open floor, clear of
// cover, so a bot can always reach the next point on its route.
export const WAYPOINTS = {
  west: [[-14, 10], [-14, 0], [-13, -6], [-8, -9]],
  mid: [[-2, 8], [-5.5, 6.5], [-5.5, 1], [-5.5, -4], [0, -7], [7, -9]],
  east: [[9, 9], [9, 2], [9, -5], [11, -9.5]],
  defend: [[7, -11], [11, -6], [9, -9.5], [14, -11], [5, -7]],
  cover: [[-9, 4], [6, 3], [-6, -4], [10, -2], [-13, -8], [4, 8]],
};

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'amber' || name === 'ink' ? 0.55 : 0.92,
      metalness: name === 'rust' || name === 'teal' ? 0.25 : 0.03,
    });
  }

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Floor and outer walls: 36 x 28 m yard, 5 m walls, open dusk sky above.
  box(36.4, 0.4, 28.4, 0, -0.2, 0, 'sand');
  box(0.4, 5, 28.4, -18.2, 2.5, 0, 'dusk');
  box(0.4, 5, 28.4, 18.2, 2.5, 0, 'dusk');
  box(36.4, 5, 0.4, 0, 2.5, -14.2, 'dusk');
  box(36.4, 5, 0.4, 0, 2.5, 14.2, 'dusk');

  // Mid warehouse: two rooms with a 2 m doorway in each long wall, roof slab at 3.4 m.
  // North wall (z=-3) and south wall (z=5), each split around the doorway at x=-5.5.
  box(4, 3.4, 0.4, -8.5, 1.7, -3, 'surface');
  box(4, 3.4, 0.4, -2.5, 1.7, -3, 'surface');
  box(4, 3.4, 0.4, -8.5, 1.7, 5, 'surface');
  box(4, 3.4, 0.4, -2.5, 1.7, 5, 'surface');
  box(0.4, 3.4, 8.4, -10.5, 1.7, 1, 'surface');
  box(0.4, 3.4, 8.4, -0.5, 1.7, 1, 'surface');
  box(10.4, 0.3, 8.8, -5.5, 3.55, 1, 'hairline');
  // Warehouse interior: a low stack to crouch behind, clear of the doorways.
  box(2.2, 1.0, 1.2, -8.5, 0.5, -1, 'olive');

  // East container lane: stacked rust containers form the long sightline.
  box(6, 2.6, 2.4, 13.5, 1.3, 2, 'rust');
  box(6, 2.6, 2.4, 13.5, 1.3, -4.5, 'teal');
  box(6, 2.6, 2.4, 13.5, 3.9, 2, 'rust');
  box(2.4, 1.2, 2.4, 5.5, 0.6, 8, 'olive');

  // West crate lane: low crates, a tall pillar, and a sandbag wall.
  box(1.4, 1.1, 1.4, -13, 0.55, 4, 'olive');
  box(1.4, 1.1, 1.4, -13, 0.55, -2, 'rust');
  box(1.4, 2.2, 1.4, -13, 1.1, -2, 'olive');
  box(1.2, 3.4, 1.2, -9, 1.7, -5, 'hairline');
  box(4.2, 1.0, 1.0, -6, 0.5, 7.5, 'sand');

  // Site A: crane pad — a flush floor tile (no step up, so anyone can walk
  // onto it to plant), two crane legs and a beam overhead.
  box(7, 0.06, 7, SITE_A.x, -0.03, SITE_A.z, 'surface', false);
  box(0.7, 6.5, 0.7, 7.6, 3.25, -12.4, 'amber');
  box(0.7, 6.5, 0.7, 14.4, 3.25, -12.4, 'amber');
  box(7.5, 0.7, 0.7, 11, 6.4, -12.4, 'amber');
  box(2.0, 1.1, 1.2, 8.2, 1.05, -8.2, 'rust');
  box(1.2, 1.1, 2.0, 14, 1.05, -8.2, 'teal');

  // Mid cover: crates and a low wall so no lane is a bare firing range, plus
  // a tall pillar west of centre that breaks the cross-map sightline.
  box(2.0, 3.4, 1.2, -3.5, 1.7, 0, 'hairline');
  box(2.4, 1.1, 1.2, 3, 0.55, 3.5, 'rust');
  box(1.2, 1.1, 2.4, -1, 0.55, -6.5, 'teal');
  box(3.6, 0.9, 1.0, 6, 0.45, -1.5, 'sand');
  box(1.6, 0.7, 1.6, -16, 0.35, 9.5, 'olive');
  box(1.6, 0.7, 1.6, 14.5, 0.35, 9.5, 'rust');

  // Site marker: a flat amber ring on the pad (no collision, bullets pass over it).
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(SITE_A.half - 0.25, SITE_A.half, 40),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.amber), side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(SITE_A.x, 0.02, SITE_A.z);
  group.add(ring);
  const padLight = new THREE.PointLight(new THREE.Color(PALETTE.amber), 14, 12);
  padLight.position.set(SITE_A.x, 3.2, SITE_A.z);
  scene.add(padLight);

  // Dusk sky: gradient dome, warm low sun from the west, cool fill from the east.
  const skyGeo = new THREE.SphereGeometry(90, 24, 12);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(PALETTE.dusk) },
      mid: { value: new THREE.Color('#7a5a44') },
      bottom: { value: new THREE.Color(PALETTE.sand) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; void main(){ float h = normalize(vP).y; vec3 c = h > 0.15 ? mix(mid, top, smoothstep(0.15, 0.7, h)) : mix(bottom, mid, smoothstep(-0.1, 0.15, h)); gl_FragColor = vec4(c, 1.0); }',
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));
  scene.fog = new THREE.Fog(new THREE.Color('#3a3f4d'), 26, 70);

  const hemi = new THREE.HemisphereLight(new THREE.Color('#8fa3c7'), new THREE.Color(PALETTE.sand), 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(new THREE.Color(PALETTE.amber), 2.4);
  sun.position.set(-22, 12, 14);
  sun.target.position.set(4, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -22;
  sun.shadow.camera.right = 22;
  sun.shadow.camera.top = 22;
  sun.shadow.camera.bottom = -22;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.dusk), 0.5);
  fill.position.set(14, 10, -12);
  scene.add(fill);

  return { colliders, shootables, group, site: SITE_A };
}
