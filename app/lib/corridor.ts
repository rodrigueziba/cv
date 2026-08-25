import * as THREE from 'three';
import { HASH_NOISE_FBM_GLSL } from '@/app/lib/shaders/common';
import { CORRIDOR_CONFIG } from '@/app/lib/sceneConfig';
import { withBasePath } from '@/app/lib/basePath';

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
    /*
     * Direct port of FLOW_FRAG's potential-flow technique (see
     * Section1.tsx) onto this surface's own local plane, instead of the
     * old 1D periodic-band pattern — this is what makes the lines
     * genuinely CURVE around wherever the sphere currently is, instead
     * of reading as flat, repetitive ripples.
     *
     * "secondaryAxis" is whichever of this surface's two in-plane local
     * axes actually varies across the surface's width/height (floor/
     * ceiling: local X; walls: local Y) — exactly one of vSurfaceUV.x/.y
     * is always near-zero for any given surface (the thin "thickness"
     * axis), so summing them cleanly picks out the meaningful one
     * without a per-surface flag.
     */
    float secondaryAxis = vSurfaceUV.x + vSurfaceUV.y;
    vec2  planeXZ        = vec2(secondaryAxis, vLocalZ);   // this surface's flow plane, analogous to FLOW_FRAG's vWorldPos.xz
    vec2  spherePos2D    = vec2(0.0, uSpherePosZ);          // the sphere always sits at secondaryAxis=0 (tunnel centerline) in corridor-local space

    // Reactive only in the tunnel's first uReactivePortion — smoothstepped
    // over a short band so there's no visible seam at the boundary.
    float reactiveZone = 1.0 - smoothstep(uReactivePortion - 0.06, uReactivePortion, vPatternT);

    vec2  delta   = planeXZ - spherePos2D;
    float trueR2  = dot(delta, delta) + 0.0001;
    float r       = sqrt(trueR2);

    /* Flow direction: mostly along the tunnel's length, with a slight
     * cross-component so the curve reads as directional, not perfectly
     * symmetric (mirrors FLOW_FRAG's diagonal U vector). */
    vec2  U      = normalize(vec2(0.22, 1.0));
    float Ucross = U.x * delta.y - U.y * delta.x;

    float R    = uLength * 0.09; // deflection radius, scaled to this tunnel's own size
    // In the calm zone, fade the DEFLECTION STRENGTH toward 0 (not the
    // distance term toward "very far") — this is a genuinely continuous
    // blend (unlike mixing 1e6 against an O(1)-O(100) trueR2, which
    // collapsed into a near-instant step and produced a hard seam at the
    // reactiveZone boundary). At reactiveZone==0 this still reduces
    // exactly to psi = Ucross — straight, undisturbed, sphere-position-
    // independent lines — so the calm zone's curvature still has zero
    // dependence on the sphere's actual proximity, same guarantee as
    // before, just implemented without the seam.
    float deflect  = reactiveZone * (R * R) / trueR2;
    float psi      = Ucross * (1.0 - deflect);

    // Organic fbm warp — fades out with distance from the deflection
    // point AND with reactiveZone, same as FLOW_FRAG's farBlend but also
    // gated so the calm zone never shows warp either.
    float farBlend = mix(1.0, smoothstep(0.0, R * 5.0, r), reactiveZone);
    float warp     = (fbm(planeXZ * 0.09 + vec2(uTime * 0.05, uTime * 0.03)) - 0.5) * 0.85 * farBlend;
    psi += warp;

    // Doppler-compression line-frequency swing — also gated by
    // reactiveZone so the calm zone's line spacing never pulses.
    float compress = uDopplerCompress * reactiveZone;
    float lineFreq = 5.5 + compress * 0.9;
    float lw       = 0.10;
    float lp       = fract(psi * lineFreq + uTime * 0.10);
    float line     = smoothstep(0.0, lw, lp) * smoothstep(2.0 * lw, lw, lp);
    line           = pow(line, 0.55);

    vec3  lineCol = mix(uPatternColorA, uPatternColorB, fract(secondaryAxis * 0.02 + uTime * 0.02));
    // Subtle glow right where the sphere is (gated by the same effective
    // distance, so it only appears in the reactive zone).
    float nearSph = reactiveZone * (1.0 - smoothstep(0.0, R * 1.6, r));
    lineCol       = mix(lineCol, uPatternColorB * 1.4 + vec3(0.15), nearSph * 0.5);

    vec3 bg    = vec3(0.03, 0.02, 0.07);
    vec3 color = mix(bg, lineCol * 1.1, line);

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

/* End wall: flat color, lerping red → blue as the sphere approaches — past
 * ~50% travel, crossfades to a luminance-tinted pared.jpg (still lerping
 * the same red → blue) unless the debug menu disables it or the texture
 * failed to load. */
const END_WALL_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const END_WALL_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3  uColorStart;
  uniform vec3  uColorEnd;
  uniform float uColorT;
  uniform sampler2D uWallTexture;
  uniform float uTextureReady;  // 0 until the texture has actually finished loading — see buildCorridor()'s onLoad callback
  uniform float uUseImage;      // debug-menu toggle, 0 or 1
  uniform float uImageRevealT;  // 0 before ~47% corridor travel, 1 by ~53% — see Section1.tsx
  varying vec2  vUv;
  void main() {
    vec3 lerped = mix(uColorStart, uColorEnd, uColorT);
    // Desaturate the image to pure luminance, then tint entirely by the
    // SAME lerped color the flat wall already uses — this is what makes
    // the image "look like the wall's own color" and keep participating
    // in the red→blue transition, regardless of the source photo's own
    // colors (which this shader deliberately never lets through).
    vec3  texColor  = texture2D(uWallTexture, vUv).rgb;
    float luminance = dot(texColor, vec3(0.299, 0.587, 0.114));
    vec3  tintedImage = luminance * lerped * 1.6; // *1.6: luminance alone reads darker than the flat fill at the same lerped color; brightens the tinted result back to a comparable perceived brightness
    float imageBlend = uUseImage * uTextureReady * uImageRevealT;
    vec3  color = mix(lerped, tintedImage, imageBlend);
    gl_FragColor = vec4(color, 1.0);
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
    uWallTexture: { value: new THREE.Texture() }, // placeholder until the real texture loads below
    uTextureReady: { value: 0 },
    uUseImage: { value: 1 },     // driven live from the debug toggle by Section1.tsx every frame — see there
    uImageRevealT: { value: 0 }, // driven live from corridorTravelT by Section1.tsx every frame
  };
  new THREE.TextureLoader().load(
    withBasePath(CORRIDOR_CONFIG.wallImagePath),
    (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      endWallUniforms.uWallTexture.value = texture;
      endWallUniforms.uTextureReady.value = 1;
    },
    undefined,
    () => {
      // Load failed (e.g. the file doesn't exist yet) — uTextureReady
      // stays 0 forever, so imageBlend is permanently 0 and the wall
      // renders as the original flat-color lerp, exactly as before this
      // task. No further action needed; this is the intended degradation.
      console.warn('[corridor] wall image failed to load — falling back to the flat-color wall');
    }
  );
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
