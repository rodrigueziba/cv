import * as THREE from 'three';
import { HASH_NOISE_FBM_GLSL } from '@/app/lib/shaders/common';
import { CORRIDOR_CONFIG } from '@/app/lib/sceneConfig';

/* Floor / ceiling / side walls: a flow-line pattern (same visual
 * family as the main stage's FLOW_FRAG) for the corridor's full
 * length — reactive to the sphere's movement in the first
 * `uReactivePortion` of the length, then calm/static (reading like
 * the main stage's undisturbed lines at the very start of the page's
 * scroll) for the rest. */
const PATTERN_VERT = /* glsl */ `
  uniform float uMeshOffsetZ;
  uniform float uLength;
  varying float vPatternT;  // 0 at the entrance, 1 at the end wall
  varying vec2  vSurfaceUV;
  varying vec3  vNormal;
  varying float vLocalZ;    // this fragment's local Z, SAME space/units as uSpherePosZ (0 at entrance, negative toward the end wall)
  void main() {
    float groupLocalZ = uMeshOffsetZ + position.z;
    vPatternT   = clamp(-groupLocalZ / uLength, 0.0, 1.0);
    vLocalZ     = groupLocalZ;
    vSurfaceUV  = position.xy;
    vNormal     = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PATTERN_FRAG = /* glsl */ `
  precision highp float;
  ${HASH_NOISE_FBM_GLSL}
  uniform float uTime;
  uniform float uReactivePortion; // fraction (0..1) of the tunnel's length that reacts to the sphere — the rest is calm/static
  uniform float uLength;
  uniform float uSpherePosZ;      // sphere's current local Z inside the corridor group — same space as vLocalZ
  uniform float uDopplerCompress; // same scalar the main stage's flow field (FLOW_FRAG) uses for its doppler-compression effect
  uniform vec3  uPatternColorA;
  uniform vec3  uPatternColorB;
  varying float vPatternT;
  varying vec2  vSurfaceUV;
  varying vec3  vNormal;
  varying float vLocalZ;
  void main() {
    // How close this fragment is along the tunnel's length to the sphere —
    // a 1D analogue of FLOW_FRAG's radial falloff around the sphere.
    float distFromSphere = abs(vLocalZ - uSpherePosZ);
    float falloff = 1.0 - smoothstep(0.0, uLength * 0.30, distFromSphere);
    // Reactive only in the tunnel's first uReactivePortion; the back half
    // always reads like the calm, undisturbed lines at the very start of
    // the page's scroll (sphere far away) — smoothstepped over a short
    // band so there's no visible seam at the 50% boundary.
    float reactiveZone = 1.0 - smoothstep(uReactivePortion - 0.06, uReactivePortion, vPatternT);
    float compress = uDopplerCompress * falloff * reactiveZone;

    // ── Flow-style iso-lines running along the tunnel's length ──────
    // Same spirit as FLOW_FRAG's iso-contour bands: fbm warp + a
    // periodic function whose local frequency rises near the sphere.
    float warp     = fbm(vSurfaceUV * 0.12 + vec2(vLocalZ * 0.02, uTime * 0.05)) - 0.5;
    // NOTE: retuned from the plan's literal compress * 0.12 factor — at
    // that value the frequency swing between "sphere just passed through
    // fast" and "sphere idle" was empirically too subtle to read on
    // screen (verified via Playwright pixel-sampling: near-identical
    // line profiles). 0.45 makes the compression clearly visible without
    // going so far it reads as noise/moire at full uDopplerCompress.
    float lineFreq = 0.55 + compress * 0.45;
    float lp       = fract(vLocalZ * lineFreq + warp * 1.4 + uTime * 0.12);
    float lw       = 0.10;
    float band     = smoothstep(0.0, lw, lp) * smoothstep(2.0 * lw, lw, lp);
    band           = pow(band, 0.6);

    vec3 patCol = mix(uPatternColorA, uPatternColorB, fract(vLocalZ * 0.01 + uTime * 0.015));
    vec3 color  = mix(vec3(0.03, 0.02, 0.07), patCol, band);

    // ── Directional shading (unchanged from the prior corridor-lighting
    // fix — floor/ceiling/walls must keep reading as distinct 3D
    // surfaces, not a flat void; see the round-4 fix this comment block
    // is carried over from) ──────────────────────────────────────────
    vec3  N        = normalize(vNormal);
    vec3  lightDir = normalize(vec3(0.4, 1.0, 0.3));
    float ndotl    = max(dot(N, lightDir), 0.0);
    float shade    = 0.45 + 0.55 * ndotl;
    shade         += 0.05 * N.y - 0.03 * N.x;
    color         *= shade;
    gl_FragColor   = vec4(color, 1.0);
  }
`;

/* End wall: flat color, lerping red → blue as the sphere approaches. */
const END_WALL_VERT = /* glsl */ `
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const END_WALL_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3  uColorStart;
  uniform vec3  uColorEnd;
  uniform float uColorT;
  void main() {
    gl_FragColor = vec4(mix(uColorStart, uColorEnd, uColorT), 1.0);
  }
`;

export interface CorridorHandle {
  group: THREE.Group;
  /** World-space position of the corridor entrance (where the floor hole opened). */
  entrance: THREE.Vector3;
  /** Normalized travel direction, currently always world -Z. */
  axis: THREE.Vector3;
  length: number;
  crossSection: number;
  /** World-space center of the end wall — used for HTML-link screen projection (a later task). */
  endWallCenter: THREE.Vector3;
  patternUniforms: Record<string, THREE.IUniform>;
  endWallUniforms: Record<string, THREE.IUniform>;
  dispose: () => void;
}

/**
 * Builds a straight tunnel starting at `entrancePosition`, extending
 * along world -Z. Length = 20× sphere diameter, cross-section (walls/
 * ceiling/floor size) = 4× sphere diameter — see CORRIDOR_CONFIG.
 * `wallColorStart`/`wallColorEnd` seed the end wall's red→blue lerp —
 * pass the CURRENT debug-menu colors (a later task's job), not static config.
 */
export function buildCorridor(
  sphereRadius: number,
  entrancePosition: THREE.Vector3,
  wallColorStart: string,
  wallColorEnd: string
): CorridorHandle {
  const diameter = sphereRadius * 2;
  const length = diameter * CORRIDOR_CONFIG.lengthMultiplier;
  const crossSection = diameter * CORRIDOR_CONFIG.crossSectionMultiplier;
  const thickness = sphereRadius * 0.12;

  const patternUniforms: Record<string, THREE.IUniform> = {
    uTime: { value: 0 },
    uLength: { value: length },
    uReactivePortion: { value: CORRIDOR_CONFIG.reactivePortion },
    uSpherePosZ: { value: 0 },
    uDopplerCompress: { value: 0 },
    uPatternColorA: { value: new THREE.Color(CORRIDOR_CONFIG.patternColorA) },
    uPatternColorB: { value: new THREE.Color(CORRIDOR_CONFIG.patternColorB) },
    uMeshOffsetZ: { value: 0 }, // overridden per-surface below
  };

  function surfaceMaterial(meshOffsetZ: number): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      vertexShader: PATTERN_VERT,
      fragmentShader: PATTERN_FRAG,
      uniforms: { ...patternUniforms, uMeshOffsetZ: { value: meshOffsetZ } },
      side: THREE.DoubleSide,
    });
  }

  const group = new THREE.Group();
  const meshes: THREE.Mesh[] = [];
  const materials: THREE.ShaderMaterial[] = [];

  // Floor: top surface at local y=0.
  const floorMat = surfaceMaterial(-length / 2);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(crossSection, thickness, length), floorMat);
  floor.position.set(0, -thickness / 2, -length / 2);

  // Ceiling: bottom surface at local y=crossSection.
  const ceilingMat = surfaceMaterial(-length / 2);
  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(crossSection, thickness, length), ceilingMat);
  ceiling.position.set(0, crossSection + thickness / 2, -length / 2);

  // Side walls.
  const wallLeftMat = surfaceMaterial(-length / 2);
  const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(thickness, crossSection, length), wallLeftMat);
  wallLeft.position.set(-crossSection / 2 - thickness / 2, crossSection / 2, -length / 2);

  const wallRightMat = surfaceMaterial(-length / 2);
  const wallRight = new THREE.Mesh(new THREE.BoxGeometry(thickness, crossSection, length), wallRightMat);
  wallRight.position.set(crossSection / 2 + thickness / 2, crossSection / 2, -length / 2);

  meshes.push(floor, ceiling, wallLeft, wallRight);
  materials.push(floorMat, ceilingMat, wallLeftMat, wallRightMat);

  // End wall — separate flat-color shader (red → blue lerp, a later task).
  // Colors are passed in (sourced from the live debug-menu state) rather
  // than read from CORRIDOR_CONFIG, so the debug menu's "Pasillo — pared
  // inicial/final" pickers — which write to SceneControlsContext, not to
  // sceneConfig's static defaults — actually have an effect once the
  // corridor is built.
  const endWallUniforms: Record<string, THREE.IUniform> = {
    uColorStart: { value: new THREE.Color(wallColorStart) },
    uColorEnd: { value: new THREE.Color(wallColorEnd) },
    uColorT: { value: 0 },
  };
  const endWallMat = new THREE.ShaderMaterial({
    vertexShader: END_WALL_VERT,
    fragmentShader: END_WALL_FRAG,
    uniforms: endWallUniforms,
  });
  const endWall = new THREE.Mesh(new THREE.BoxGeometry(crossSection, crossSection, thickness), endWallMat);
  endWall.position.set(0, crossSection / 2, -length - thickness / 2);
  meshes.push(endWall);
  materials.push(endWallMat);

  meshes.forEach((m) => group.add(m));
  group.position.copy(entrancePosition);

  const axis = new THREE.Vector3(0, 0, -1);
  const endWallCenter = entrancePosition.clone().add(new THREE.Vector3(0, crossSection / 2, -length - thickness / 2));

  return {
    group,
    entrance: entrancePosition.clone(),
    axis,
    length,
    crossSection,
    endWallCenter,
    patternUniforms,
    endWallUniforms,
    dispose: () => {
      meshes.forEach((m) => m.geometry.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
