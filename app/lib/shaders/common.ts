/** Shared GLSL helper functions, injected via template-literal composition. */

export const HASH_NOISE_FBM_GLSL = /* glsl */ `
  float hash21(vec2 p) {
    p  = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 17.19);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i),           hash21(i+vec2(1,0)), f.x),
               mix(hash21(i+vec2(0,1)), hash21(i+vec2(1,1)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.50;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p  = p * 2.1 + vec2(3.11, 1.73);
      a *= 0.50;
    }
    return v;
  }
`;

export const HSV2RGB_GLSL = /* glsl */ `
  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    return c.z * mix(K.xxx, clamp(abs(fract(c.xxx+K.xyz)*6.0-K.www)-K.xxx, 0.0, 1.0), c.y);
  }
`;
