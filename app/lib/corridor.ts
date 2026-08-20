import * as THREE from 'three';
import { HASH_NOISE_FBM_GLSL } from '@/app/lib/shaders/common';
import { CORRIDOR_CONFIG } from '@/app/lib/sceneConfig';

/* Floor / ceiling / side walls: wave pattern for the first
 * `patternedPortion` of the corridor's length, then a solid color. */
const PATTERN_VERT = /* glsl */ `
  uniform float uMeshOffsetZ;
  uniform float uLength;
  varying float vPatternT; // 0 at the entrance, 1 at the end wall
  varying vec2  vSurfaceUV;
  varying vec3  vNormal;
  void main() {
    float groupLocalZ = uMeshOffsetZ + position.z;
    vPatternT   = clamp(-groupLocalZ / uLength, 0.0, 1.0);
    vSurfaceUV  = position.xy;
    vNormal     = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PATTERN_FRAG = /* glsl */ `
  precision highp float;
  ${HASH_NOISE_FBM_GLSL}
  uniform float uTime;
  uniform float uPatternedPortion;
  uniform vec3  uPatternColorA;
  uniform vec3  uPatternColorB;
  uniform vec3  uSolidColor;
  varying float vPatternT;
  varying vec2  vSurfaceUV;
  varying vec3  vNormal;
  void main() {
    float n       = fbm(vSurfaceUV * 0.15 + vec2(uTime * 0.05, 0.0));
    float lines   = smoothstep(0.45, 0.50, fract(n * 6.0 + uTime * 0.1));
    vec3  patCol  = mix(uPatternColorA, uPatternColorB, n);
    vec3  patterned = mix(vec3(0.02, 0.02, 0.05), patCol, lines);
    float toSolid = smoothstep(uPatternedPortion * 0.85, uPatternedPortion, vPatternT);
    vec3  color   = mix(patterned, uSolidColor, toSolid);
    // Simple fake directional lighting so floor/ceiling/walls read as
    // distinct 3D surfaces instead of one flat, unlit color fill — this
    // is what makes the corridor actually look like a tunnel rather than
    // a colored void for the ~80% of its length past the patterned zone.
    vec3  N       = normalize(vNormal);
    vec3  lightDir = normalize(vec3(0.4, 1.0, 0.3));
    float ndotl   = max(dot(N, lightDir), 0.0);
    float shade   = 0.45 + 0.55 * ndotl; // ambient floor + directional term
    // The key light above clamps to the same 0.45 ambient floor for both
    // the ceiling (N ~ (0,-1,0)) and the right wall (N ~ (-1,0,0)), since
    // both have a negative dot product with lightDir — making them
    // pixel-identical. Fix with a small fixed per-axis tint keyed off the
    // *sign* of each face's dominant normal component: every one of the
    // 4 cardinal faces (+Y/-Y/+X/-X) gets a distinct constant offset, so
    // none of them can tie regardless of what the key light contributes.
    shade += 0.05 * N.y - 0.03 * N.x;
    color        *= shade;
    gl_FragColor  = vec4(color, 1.0);
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
    uPatternedPortion: { value: CORRIDOR_CONFIG.patternedPortion },
    uPatternColorA: { value: new THREE.Color(CORRIDOR_CONFIG.patternColorA) },
    uPatternColorB: { value: new THREE.Color(CORRIDOR_CONFIG.patternColorB) },
    uSolidColor: { value: new THREE.Color(CORRIDOR_CONFIG.solidColor) },
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
