import * as THREE from 'three';
import type { WebGPUMaterialProfile } from '../constants';
import { createPhysicalMaterial } from './materials';
import type { PrismFinish, PrismShape } from './prismTrail';
import type { FlightEffectsSettings } from './flightEffects';
import { FLIGHT_MOTION_GLSL, flightMotionIndex } from './flightMotion';

// The score is baked once into world-space instances. The camera rides the
// guide plane while independent channel planes leave their geometry behind.
// GPU uniforms animate births and held strokes; a geometry-dependent window
// bounds the work even when a large library sculpture is chosen.
const SPECTRUM = /* glsl */ `
vec3 prismSpectrum(float t) {
  t = clamp(t, 0.0, 1.0) * 6.0;
  vec3 c = mix(vec3(1.0, 0.04, 0.08), vec3(1.0, 0.36, 0.015), clamp(t, 0.0, 1.0));
  c = mix(c, vec3(1.0, 0.88, 0.04), clamp(t - 1.0, 0.0, 1.0));
  c = mix(c, vec3(0.03, 0.82, 0.2), clamp(t - 2.0, 0.0, 1.0));
  c = mix(c, vec3(0.01, 0.72, 1.0), clamp(t - 3.0, 0.0, 1.0));
  c = mix(c, vec3(0.1, 0.13, 1.0), clamp(t - 4.0, 0.0, 1.0));
  return mix(c, vec3(0.7, 0.035, 1.0), clamp(t - 5.0, 0.0, 1.0));
}
`;
const VARYINGS = /* glsl */ `
varying vec3 vPrismLocal;
varying float vPrismAge;
varying float vPrismVelocity;
varying float vPrismDuration;
varying float vPrismHue;
varying float vPrismCrowd;
`;
const VERTEX_DECLARATIONS = /* glsl */ `
attribute float aBirth;
attribute float aDuration;
attribute float aVelocity;
attribute float aHue;
attribute float aCrowd;
uniform float uPrismTime;
uniform float uPrismFx;
${VARYINGS}
${FLIGHT_MOTION_GLSL}
`;
const FRAGMENT_DECLARATIONS = /* glsl */ `
uniform float uPrismFx;
uniform float uPrismSlice;
uniform float uPrismSliceWidth;
uniform float uPrismLength;
uniform float uPrismFan;
${VARYINGS}
${SPECTRUM}
`;
const SET_VARYINGS = /* glsl */ `
vPrismAge = uPrismTime - aBirth;
vPrismVelocity = aVelocity;
vPrismDuration = aDuration;
vPrismHue = aHue;
vPrismCrowd = aCrowd;
vPrismLocal = position;
`;
const GROWTH = /* glsl */ `
float prismAge = max(vPrismAge, 0.0);
float prismPop = 1.0 + 0.55 * aVelocity * uPrismFx * exp(-prismAge / 0.13);
transformed.xy *= prismPop;
transformed.z *= mix(0.08, 1.0, clamp(prismAge / max(aDuration, 0.02), 0.0, 1.0));
`;
const LIFETIME = /* glsl */ `
if (vPrismAge < 0.0) discard;
float prismLife = uPrismLength > 0.0 ? 1.0 - smoothstep(max(0.0, uPrismLength - 2.0), uPrismLength, vPrismAge) : 1.0;
if (prismLife < 0.002) discard;
`;
const VERTEX = /* glsl */ `
${VERTEX_DECLARATIONS}
varying vec3 vPrismNormal;
void main() {
  ${SET_VARYINGS}
  vec3 transformed = position;
  ${GROWTH}
  vec3 flightNormal = normal;
  flightDeform(transformed, flightNormal, aBirth, aHue);
  vPrismNormal = normalize(normalMatrix * mat3(instanceMatrix) * flightNormal);
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(transformed, 1.0);
}
`;
const FRAGMENT = /* glsl */ `
${FRAGMENT_DECLARATIONS}
varying vec3 vPrismNormal;
void main() {
  ${LIFETIME}
  float x = vPrismLocal.x + 0.5;
  float y = vPrismLocal.y + 0.5;
  float halfW = 0.5 * (0.3 + 0.7 * smoothstep(0.0, 0.5, x));
  float inside = 1.0 - smoothstep(halfW - 0.06, halfW + 0.03, abs(y - 0.5));
  float endFade = (1.0 - smoothstep(0.84, 1.0, x)) * smoothstep(0.0, 0.05, x);
  float fanHue = clamp((y - 0.5) / max(halfW * 2.0, 0.001) + 0.5, 0.0, 1.0);
  float hue = mix(mix(y, fanHue, uPrismFan), clamp(vPrismHue + (fanHue - 0.5) * uPrismSliceWidth, 0.0, 1.0), uPrismSlice);
  vec3 col = prismSpectrum(pow(hue, 1.2));
  float age = max(vPrismAge, 0.0);
  float sounding = 1.0 - smoothstep(vPrismDuration, vPrismDuration + 0.35, age);
  float crowd = 1.0 / (1.0 + 0.3 * vPrismCrowd);
  float flash = exp(-age / 0.16) * (1.0 + 2.0 * vPrismVelocity) * uPrismFx * crowd;
  float settle = mix(0.42, 1.0, sounding);
  float fade = mix(1.0, 0.55, smoothstep(15.0, 70.0, age));
  float brightness = (0.85 + 0.55 * vPrismVelocity) * settle * fade * crowd;
  float cap = step(0.995, vPrismLocal.z);
  float body = mix(0.3, mix(0.15, 1.0, cap), uPrismFan);
  float rim = pow(1.0 - abs(normalize(vPrismNormal).z), 3.0);
  float beam = exp(-pow((y - 0.5) * 9.0, 2.0)) * (1.0 - smoothstep(0.0, 0.25, x)) * uPrismFan;
  vec3 rgb = min(col * (brightness * body + flash * 0.6 + rim * 0.35) + vec3(1.0) * beam * (0.25 * sounding + 0.4 * flash), vec3(2.5));
  float alpha = mix(0.7, inside * endFade * mix(0.22, 1.0, cap), uPrismFan) * (0.6 + 0.4 * sounding) * mix(0.5, 1.0, crowd) * prismLife;
  gl_FragColor = vec4(rgb, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export type PrismUniforms = ReturnType<typeof makePrismUniforms>;
export function makePrismUniforms() {
  return { uPrismTime: { value: 0 }, uPrismFx: { value: 1 }, uPrismSlice: { value: 0 },
    uPrismSliceWidth: { value: 0.14 }, uPrismLength: { value: 0 }, uPrismFan: { value: 1 },
    uFlightMotion: { value: 0 }, uFlightMotionAmount: { value: 1 }, uFlightMorph: { value: 0 } };
}

export function updatePrismEffectsUniforms(uniforms: PrismUniforms, effects?: FlightEffectsSettings) {
  uniforms.uFlightMotion.value = flightMotionIndex(effects?.motion);
  uniforms.uFlightMotionAmount.value = Number.isFinite(effects?.motionAmount) ? THREE.MathUtils.clamp(effects!.motionAmount, 0, 2) : 1;
  uniforms.uFlightMorph.value = Number.isFinite(effects?.morph) ? THREE.MathUtils.clamp(effects!.morph, 0, 1) : 0;
}

export function createPrismMaterial(finish: PrismFinish, profile: WebGPUMaterialProfile, wireframe: boolean, uniforms: PrismUniforms) {
  if (finish === 'spectrum') return new THREE.ShaderMaterial({ uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide, wireframe });
  const material = createPhysicalMaterial(profile === 'auto' ? (finish === 'glass' ? 'stained-glass' : 'ornament') : profile, wireframe);
  // Auto chooses the chromatic ornament/glass family; explicit Output
  // profiles retain their own tint and optical values (gold, dichroic, etc.).
  if (profile === 'auto') material.color.set(0xffffff);
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${VERTEX_DECLARATIONS}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        float prismNormalAge = max(uPrismTime - aBirth, 0.0);
        objectNormal.xy /= 1.0 + 0.55 * aVelocity * uPrismFx * exp(-prismNormalAge / 0.13);
        objectNormal.z /= mix(0.08, 1.0, clamp(prismNormalAge / max(aDuration, 0.02), 0.0, 1.0));
        vec3 flightNormalPosition = position;
        flightNormalPosition.xy *= 1.0 + 0.55 * aVelocity * uPrismFx * exp(-prismNormalAge / 0.13);
        flightNormalPosition.z *= mix(0.08, 1.0, clamp(prismNormalAge / max(aDuration, 0.02), 0.0, 1.0));
        flightDeform(flightNormalPosition, objectNormal, aBirth, aHue);
      `)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${SET_VARYINGS}\n${GROWTH}\nvec3 flightUnusedNormal = normal;\nflightDeform(transformed, flightUnusedNormal, aBirth, aHue);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${FRAGMENT_DECLARATIONS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${LIFETIME}
        float prismHue = mix(vPrismLocal.y + 0.5, clamp(vPrismHue + vPrismLocal.y * uPrismSliceWidth, 0.0, 1.0), uPrismSlice);
        diffuseColor.rgb *= mix(vec3(0.035), prismSpectrum(prismHue), 0.92);
        // Dither expired solid surfaces so depth and glass stay physically
        // consistent. No alpha blending or orphaned depth silhouettes.
        if (prismLife < fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453)) discard;
      `);
  };
  material.customProgramCacheKey = () => `prism-physical-${finish}-v3`;
  return material;
}

export function createPrismGeometry(shape: PrismShape, source: THREE.BufferGeometry | null) {
  let geometry: THREE.BufferGeometry;
  switch (shape) {
    case 'sphere': geometry = new THREE.SphereGeometry(0.5, 16, 10); break;
    case 'crystal': geometry = new THREE.OctahedronGeometry(0.6, 0); break;
    case 'torus': geometry = new THREE.TorusGeometry(0.38, 0.13, 8, 20); break;
    case 'knot': geometry = new THREE.TorusKnotGeometry(0.34, 0.11, 48, 6, 2, 3); break;
    case 'mesh': geometry = source?.clone() ?? new THREE.OctahedronGeometry(0.6, 0); break;
    default: geometry = new THREE.BoxGeometry(1, 1, 1);
  }
  geometry.computeBoundingBox();
  const size = new THREE.Vector3(), center = new THREE.Vector3();
  geometry.boundingBox?.getSize(size);
  geometry.boundingBox?.getCenter(center);
  geometry.translate(-center.x, -center.y, -center.z);
  const scale = 1 / Math.max(0.001, size.x, size.y, size.z);
  geometry.scale(scale, scale, scale);
  geometry.translate(0, 0, 0.5);
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  return geometry;
}
