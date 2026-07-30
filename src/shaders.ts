import type { ShaderCategory, ShaderPreset } from './constants';

const SHADER_UTILS = `
  float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n = mix(
      mix(mix(hash13(i + vec3(0.0, 0.0, 0.0)), hash13(i + vec3(1.0, 0.0, 0.0)), f.x),
          mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
      mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), f.x),
          mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
      f.z
    );
    return n;
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 5; i++) {
      value += noise3(p) * amp;
      p = p * 2.03 + vec3(7.13, 2.71, 5.19);
      amp *= 0.52;
    }
    return value;
  }

  vec3 spectral(float x) {
    return 0.52 + 0.48 * cos(6.28318 * (x + vec3(0.0, 0.33, 0.67)));
  }

  vec3 envColor(vec3 r, float t) {
    vec3 horizon = mix(vec3(0.02, 0.05, 0.11), vec3(0.88, 0.34, 0.14), smoothstep(-0.45, 0.8, r.y));
    vec3 sweep = spectral(dot(r, normalize(vec3(0.8, 0.4, 0.2))) * 0.35 + t * 0.04);
    return mix(horizon, sweep, 0.35 + 0.35 * fbm(r * 2.0 + t * 0.12));
  }
`;

export const DEFAULT_VERTEX_SHADER = `
  varying vec2 vUv;
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  void main() {
    vUv = uv;
    vPosition = position;
    vNormal = normalize(normalMatrix * normal);

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;

    gl_Position = projectionMatrix * mvPosition;
  }
`;

type OrganicShaderStyleKey = 'rootSmoke' | 'amberLabyrinth' | 'liminalBlue' | 'coralIvory';

function glslNumber(value: number) {
  return value.toFixed(3);
}

function buildOrganicFlowShader(style: OrganicShaderStyleKey, variant: number, seed: number) {
  const scale = glslNumber(0.085 + (seed % 9) * 0.006);
  const rootCount = 5 + (seed % 4);
  const rings = glslNumber(15.0 + (seed % 11) * 1.4);
  const ridges = glslNumber(10.0 + (seed % 13) * 0.9);
  const warp = glslNumber(0.1 + (seed % 8) * 0.018);
  const drift = glslNumber(0.24 + (seed % 10) * 0.035);
  const pulse = glslNumber(0.08 + (seed % 6) * 0.016);
  const hue = glslNumber((variant % 17) * 0.037);

  if (style === 'rootSmoke') {
    return `
      uniform float time;
      varying vec2 vUv;
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      ${SHADER_UTILS}
      void main() {
        vec3 n = normalize(vNormal);
        vec3 v = normalize(vViewPosition);
        vec2 p = vPosition.xy * ${scale};
        float r = length(p) + 0.0001;
        float a = atan(p.y, p.x);

        float rootField = 0.0;
        for (int i = 0; i < ${rootCount}; i++) {
          float fi = float(i);
          float angle = fi * ${glslNumber(6.28318 / rootCount)} + time * ${drift} + ${warp} * sin(time * 0.6 + fi * 1.73);
          vec2 center = vec2(cos(angle), sin(angle)) * (${glslNumber(0.36 + (seed % 5) * 0.025)} + ${pulse} * sin(fi * 1.9 + time));
          float d = length(p - center);
          rootField += exp(-d * ${glslNumber(7.2 + (seed % 7) * 0.65)}) * (0.62 + 0.38 * sin(fi + a * ${glslNumber(3.5 + (seed % 8) * 0.45)} - time));
        }

        float rootRadius = ${glslNumber(0.44 + (seed % 5) * 0.018)} + ${pulse} * sin(a * ${glslNumber(4.0 + (seed % 7))} + time + fbm(vec3(p * 4.0, time * 0.1)) * 2.0);
        float ring = exp(-pow(abs(r - rootRadius), 2.0) * ${glslNumber(54.0 + (seed % 9) * 6.0)});
        float curl = fbm(vec3(p * ${glslNumber(5.8 + (seed % 8) * 0.35)} + vec2(sin(a * 3.0 + time), cos(a * 4.0 - time)) * ${warp}, time * 0.16));
        float edgeFade = 1.0 - smoothstep(1.02, 1.48, r);
        float veil = clamp((rootField * 0.34 + ring * 0.84 + curl * 0.34) * edgeFade, 0.0, 1.0);

        float fresnel = pow(1.0 - max(dot(n, v), 0.0), 2.3);
        vec3 deep = vec3(0.012, 0.017, 0.068);
        vec3 smoke = spectral(a * 0.08 + r * 0.32 + curl * 0.2 + time * 0.035 + ${hue});
        vec3 color = mix(deep, smoke, veil);
        color += vec3(0.76, 1.0, 0.2) * pow(ring, 2.4) * ${glslNumber(0.68 + (seed % 5) * 0.05)};
        color += vec3(0.18, 0.52, 1.0) * fresnel * (0.24 + veil * 0.36);
        gl_FragColor = vec4(color, clamp(0.26 + veil * 0.5 + fresnel * 0.16, 0.26, 0.9));
      }
    `;
  }

  if (style === 'amberLabyrinth') {
    return `
      uniform float time;
      varying vec2 vUv;
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      ${SHADER_UTILS}
      void main() {
        vec3 n = normalize(vNormal);
        vec3 v = normalize(vViewPosition);
        vec2 p = vPosition.xy * ${scale};
        float r = length(p) + 0.0001;
        float a = atan(p.y, p.x);

        vec2 q = p;
        for (int i = 0; i < 4; i++) {
          float fi = float(i);
          q += ${warp} * vec2(
            sin(q.y * (3.0 + fi + ${pulse}) + time * (0.28 + fi * 0.08)),
            cos(q.x * (2.7 + fi + ${pulse}) - time * (0.25 + fi * 0.07))
          );
        }

        float field =
          sin(q.x * ${rings} + time * ${drift}) +
          sin(q.y * ${glslNumber(Number(rings) * 0.86)} - time * ${glslNumber(Number(drift) * 0.9)}) +
          sin((q.x + q.y) * ${ridges} + fbm(vec3(q * 3.0, time * 0.12)) * ${glslNumber(4.2 + (seed % 6) * 0.35)});
        float ridge = 1.0 - smoothstep(0.045, 0.22, abs(field));
        float annulus = smoothstep(0.2, 0.42, r) * (1.0 - smoothstep(${glslNumber(1.0 + (seed % 6) * 0.018)}, 1.34, r));
        float bead = smoothstep(0.965, 0.998, sin(a * ${glslNumber(32.0 + (seed % 13) * 2.0)} + time * 0.45) * 0.5 + 0.5);
        bead *= smoothstep(0.78, 0.95, r) * (1.0 - smoothstep(1.08, 1.22, r));
        float groove = smoothstep(0.11, 0.42, abs(field));
        float fresnel = pow(1.0 - max(dot(n, v), 0.0), 3.0);

        vec3 resin = vec3(0.43, 0.2, 0.062) * (0.52 + 0.24 * fbm(vec3(p * 3.0, time * 0.05)));
        vec3 shadow = vec3(0.014, 0.01, 0.005);
        vec3 gold = vec3(1.0, ${glslNumber(0.5 + (seed % 7) * 0.018)}, 0.14);
        vec3 hot = vec3(1.0, 0.88, 0.42);
        vec3 color = mix(resin, shadow, groove * annulus * 0.84);
        color = mix(color, gold, ridge * annulus * 0.78);
        color += hot * (pow(ridge, 5.0) * annulus + bead * 0.74);
        color += vec3(1.0, 0.52, 0.16) * fresnel * 0.28;
        gl_FragColor = vec4(color, clamp(0.72 + ridge * 0.2 + fresnel * 0.08, 0.58, 1.0));
      }
    `;
  }

  if (style === 'liminalBlue') {
    return `
      uniform float time;
      varying vec2 vUv;
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      ${SHADER_UTILS}
      void main() {
        vec3 n = normalize(vNormal);
        vec3 v = normalize(vViewPosition);
        vec2 p = vPosition.xy * ${scale};
        vec2 m = abs(p);
        float r = length(p) + 0.0001;

        vec2 q = m;
        q += ${warp} * vec2(
          sin(q.y * ${glslNumber(6.5 + (seed % 7) * 0.35)} + time * ${drift} + fbm(vec3(p * 2.0, time * 0.1)) * 3.0),
          cos(q.x * ${glslNumber(5.6 + (seed % 6) * 0.4)} - time * ${glslNumber(Number(drift) * 0.82)})
        );

        float stair = 1.0 - smoothstep(0.08, 0.24, abs(fract(q.y * ${glslNumber(7.0 + (seed % 8) * 0.45)} + q.x * 2.1 - time * 0.08) - 0.5));
        float sideWall = 1.0 - smoothstep(0.04, 0.17, abs(q.x - ${glslNumber(0.34 + (seed % 6) * 0.025)} - ${pulse} * sin(q.y * 4.0 + time)));
        float chevron = 1.0 - smoothstep(0.05, 0.2, abs(q.x + q.y * 0.55 - ${glslNumber(0.68 + (seed % 5) * 0.03)} - ${warp} * sin(time + q.y * 5.0)));
        float corridor = max(sideWall, max(stair * 0.8, chevron * 0.72));
        float voidMask = smoothstep(0.18, 0.58, r);
        float flow = fbm(vec3(q * ${glslNumber(4.8 + (seed % 7) * 0.42)}, time * 0.16));
        float fresnel = pow(1.0 - max(dot(n, v), 0.0), 2.2);

        vec3 midnight = vec3(0.004, 0.011, 0.052);
        vec3 blue = vec3(0.025, ${glslNumber(0.19 + (seed % 6) * 0.015)}, 0.58);
        vec3 cyan = vec3(0.2, 0.76, 1.0);
        vec3 rose = vec3(1.0, 0.22, 0.54);
        vec3 color = mix(midnight, blue, 0.46 + flow * 0.32);
        color = mix(color, cyan, corridor * voidMask * (0.45 + 0.3 * flow));
        color += rose * pow(corridor, 4.0) * 0.28;
        color += spectral(flow + r * 0.3 + time * 0.03 + ${hue}) * fresnel * 0.34;
        gl_FragColor = vec4(color, clamp(0.54 + corridor * 0.3 + fresnel * 0.18, 0.42, 0.96));
      }
    `;
  }

  return `
    uniform float time;
    varying vec2 vUv;
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    ${SHADER_UTILS}
    void main() {
      vec3 n = normalize(vNormal);
      vec3 v = normalize(vViewPosition);
      vec2 p = vPosition.xy * ${scale};
      float r = length(p) + 0.0001;
      float a = atan(p.y, p.x);

      vec2 q = p;
      q += ${warp} * vec2(
        sin(a * ${glslNumber(4.5 + (seed % 5) * 0.35)} + r * ${glslNumber(8.0 + (seed % 6) * 0.4)} + time * ${drift}),
        cos(a * ${glslNumber(4.2 + (seed % 5) * 0.32)} - r * ${glslNumber(7.0 + (seed % 8) * 0.36)} - time * ${glslNumber(Number(drift) * 0.84)})
      );
      float organicWarp = fbm(vec3(q * 5.0, time * 0.14));
      float ring = r * ${glslNumber(17.0 + (seed % 10) * 1.2)} + organicWarp * ${glslNumber(4.2 + (seed % 6) * 0.38)} + sin(a * ${glslNumber(12.0 + (seed % 8) * 1.25)} + time * 0.3) * 1.2;
      float line = 1.0 - smoothstep(0.05, 0.2, abs(sin(ring)));
      float cellular = 1.0 - smoothstep(0.18, 0.42, abs(sin(q.x * ${rings}) + cos(q.y * ${glslNumber(Number(rings) * 0.93)})));
      float coral = max(line, cellular * 0.85);
      coral *= smoothstep(0.12, 0.38, r) * (1.0 - smoothstep(1.1, 1.42, r));
      float core = 1.0 - smoothstep(0.0, ${glslNumber(0.28 + (seed % 5) * 0.018)}, r);
      float fresnel = pow(1.0 - max(dot(n, v), 0.0), 2.6);

      vec3 navy = vec3(0.005, 0.014, 0.052);
      vec3 ivory = vec3(0.94, ${glslNumber(0.8 + (seed % 5) * 0.025)}, 0.68);
      vec3 pearl = vec3(1.0, 0.96, 0.84);
      vec3 color = mix(navy, ivory, coral * 0.82);
      color = mix(color, pearl, pow(coral, 4.0) * 0.62);
      color = mix(color, vec3(0.48, 0.38, 0.25), core * 0.66);
      color += vec3(0.76, 0.86, 1.0) * fresnel * (0.2 + coral * 0.35);
      gl_FragColor = vec4(color, clamp(0.68 + coral * 0.24 + fresnel * 0.08, 0.58, 1.0));
    }
  `;
}

function createOrganicShaderVariations(startId: number, count: number): ShaderPreset[] {
  const styles: Array<{ key: OrganicShaderStyleKey; name: string }> = [
    { key: 'rootSmoke', name: 'Polynomial Root Smoke' },
    { key: 'amberLabyrinth', name: 'Amber Reaction Labyrinth' },
    { key: 'liminalBlue', name: 'Liminal Blue Corridor' },
    { key: 'coralIvory', name: 'Turing Coral Ivory' }
  ];

  return Array.from({ length: count }, (_, index) => {
    const style = styles[index % styles.length];
    const variant = index + 1;
    return {
      id: `s${startId + index}`,
      name: `Organic PDE: ${style.name} ${variant.toString().padStart(2, '0')}`,
      category: 'Organic PDE shaders',
      fragmentShader: buildOrganicFlowShader(style.key, variant, index),
      description: `${style.name} palette, seed variant ${variant.toString().padStart(2, '0')} of the organic flow field.`
    };
  });
}

const BASE_PRESET_SHADERS: ShaderPreset[] = [
  {
    id: "s1",
    name: "Mercury Glass",
    fragmentShader: `
      uniform float time;
      varying vec2 vUv;
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      ${SHADER_UTILS}
      void main() {
        vec3 n = normalize(vNormal + 0.18 * vec3(
          fbm(vPosition * 0.45 + time * 0.18),
          fbm(vPosition.yzx * 0.42 - time * 0.16),
          fbm(vPosition.zxy * 0.38 + time * 0.11)
        ));
        vec3 v = normalize(vViewPosition);
        vec3 r = reflect(-v, n);
        float fresnel = pow(1.0 - max(dot(n, v), 0.0), 3.0);
        float ripple = fbm(vPosition * 0.9 + vec3(0.0, time * 0.35, 0.0));
        vec3 chrome = envColor(r, time) * (0.65 + ripple * 0.75);
        vec3 edge = spectral(fresnel + ripple * 0.25 + time * 0.05);
        vec3 filament = spectral(vUv.x + time * 0.08) * (0.45 + 0.55 * sin(time * 2.0 + vPosition.x * 0.7));
        vec3 color = mix(chrome, edge, fresnel * 0.85);
        color += filament * (0.35 + ripple * 0.3);
        color += vec3(1.0) * pow(max(dot(r, normalize(vec3(-0.3, 0.6, 0.9))), 0.0), 90.0);
        gl_FragColor = vec4(color, 0.68 + fresnel * 0.28);
      }
    `,
    description: "Reflective liquid metal with translucent chromatic glass edges."
  },
  {
    id: "s2",
    name: "Fractal Opal",
    fragmentShader: `
      uniform float time;
      varying vec2 vUv;
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      ${SHADER_UTILS}
      void main() {
        vec3 n = normalize(vNormal);
        vec3 v = normalize(vViewPosition);
        vec3 p = vPosition * 0.24;
        float orbit = 0.0;
        vec3 z = p;
        for (int i = 0; i < 6; i++) {
          z = abs(z) / max(dot(z, z), 0.18) - vec3(0.72, 0.58, 0.44);
          z.xy = mat2(cos(time * 0.16), -sin(time * 0.16), sin(time * 0.16), cos(time * 0.16)) * z.xy;
          orbit += exp(-abs(length(z) - 1.2));
        }
        float fresnel = pow(1.0 - max(dot(n, v), 0.0), 2.4);
        vec3 opal = spectral(orbit * 0.06 + dot(n, v) * 0.25 + time * 0.035);
        vec3 milk = vec3(0.62, 0.76, 0.82) * (0.45 + 0.25 * fbm(p * 5.0 + time));
        gl_FragColor = vec4(mix(milk, opal, 0.62 + fresnel * 0.35) + fresnel * 0.45, 0.82);
      }
    `,
    description: "Moving fractal interference inside milky opalescent glass."
  },
  {
    id: "s3",
    name: "Brushed Titanium",
    fragmentShader: `
      uniform float time;
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      ${SHADER_UTILS}
      void main() {
        vec3 n = normalize(vNormal);
        vec3 v = normalize(vViewPosition);
        vec3 r = reflect(-v, n);
        float grain = fbm(vec3(vPosition.x * 2.8, vPosition.y * 0.08, time * 0.18));
        float brush = smoothstep(0.32, 1.0, sin(vPosition.x * 18.0 + grain * 3.0) * 0.5 + 0.5);
        float fresnel = pow(1.0 - max(dot(n, v), 0.0), 4.0);
        vec3 base = mix(vec3(0.42, 0.45, 0.48), vec3(0.9, 0.93, 0.95), brush * 0.28);
        vec3 reflected = envColor(r, time) * (0.35 + fresnel * 0.9);
        float glint = pow(max(dot(r, normalize(vec3(0.7, 0.25, 0.55))), 0.0), 130.0);
        gl_FragColor = vec4(base + reflected + vec3(1.0, 0.94, 0.82) * glint, 1.0);
      }
    `,
    description: "Anisotropic metal grain with crisp moving glints."
  },
  {
    id: "s4",
    name: "Holographic Lacquer",
    fragmentShader: `
      uniform float time;
      varying vec2 vUv;
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      ${SHADER_UTILS}
      void main() {
        vec3 n = normalize(vNormal);
        vec3 v = normalize(vViewPosition);
        float fresnel = pow(1.0 - max(dot(n, v), 0.0), 2.0);
        float bands = sin((vPosition.x + vPosition.y * 0.7 + vPosition.z * 0.45) * 3.5 + time * 1.4);
        float cells = fbm(vPosition * 1.15 + vec3(time * 0.12, 0.0, time * 0.05));
        vec3 undercoat = mix(vec3(0.02, 0.02, 0.045), vec3(0.06, 0.35, 0.55), cells);
        vec3 holo = spectral(bands * 0.12 + cells * 0.35 + time * 0.04);
        vec3 clearcoat = vec3(1.0) * pow(max(dot(reflect(-v, n), normalize(vec3(0.1, 0.7, 0.8))), 0.0), 110.0);
        gl_FragColor = vec4(mix(undercoat, holo, 0.48 + fresnel * 0.45) + clearcoat, 0.9);
      }
    `,
    description: "Animated clearcoat with shifting spectral bands and cellular texture."
  },
  {
    id: "s5",
    name: "Molten Gold",
    fragmentShader: `
      uniform float time;
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      ${SHADER_UTILS}
      void main() {
        vec3 n = normalize(vNormal);
        vec3 v = normalize(vViewPosition);
        float flow = fbm(vPosition * 0.75 + vec3(time * 0.35, -time * 0.16, time * 0.08));
        float vein = smoothstep(0.52, 0.92, flow + 0.18 * sin(vPosition.y * 8.0 - time * 1.8));
        vec3 darkGold = vec3(0.55, 0.26, 0.035);
        vec3 hotGold = vec3(1.0, 0.72, 0.16);
        vec3 whiteHot = vec3(1.0, 0.92, 0.58);
        vec3 color = mix(darkGold, hotGold, vein);
        color = mix(color, whiteHot, pow(vein, 5.0) * 0.8);
        float fresnel = pow(1.0 - max(dot(n, v), 0.0), 2.6);
        color += envColor(reflect(-v, n), time) * (0.16 + fresnel * 0.32);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    description: "Fluid metallic gold with animated heat veins."
  },
  {
    id: "s6",
    name: "Aurora Glass",
    fragmentShader: `
      uniform float time;
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      ${SHADER_UTILS}
      void main() {
        vec3 n = normalize(vNormal);
        vec3 v = normalize(vViewPosition);
        float fresnel = pow(1.0 - max(dot(n, v), 0.0), 3.2);
        float curtain = sin(vPosition.y * 2.4 + sin(vPosition.x * 0.55 + time) * 2.0 + time * 0.7) * 0.5 + 0.5;
        float shimmer = fbm(vPosition * 0.9 + vec3(0.0, time * 0.6, 0.0));
        vec3 green = vec3(0.05, 0.92, 0.64);
        vec3 violet = vec3(0.72, 0.28, 1.0);
        vec3 blue = vec3(0.08, 0.45, 1.0);
        vec3 color = mix(mix(green, blue, curtain), violet, shimmer * 0.55);
        vec3 rim = spectral(fresnel + time * 0.05) * fresnel;
        gl_FragColor = vec4(color * (0.55 + shimmer * 0.45) + rim, 0.36 + fresnel * 0.55);
      }
    `,
    description: "Transparent aurora curtains with readable glass edges."
  },
  {
    id: "s7",
    name: "Carbon Weave",
    fragmentShader: `
      uniform float time;
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      ${SHADER_UTILS}
      void main() {
        vec3 n = normalize(vNormal);
        vec3 v = normalize(vViewPosition);
        float weaveA = sin(vPosition.x * 16.0 + 0.6 * sin(vPosition.y * 3.0 + time)) * 0.5 + 0.5;
        float weaveB = sin(vPosition.y * 16.0 - 0.6 * cos(vPosition.x * 3.0 - time)) * 0.5 + 0.5;
        float weave = mix(weaveA, weaveB, step(0.5, fract((vPosition.x + vPosition.y) * 0.22)));
        float fiber = smoothstep(0.28, 0.82, weave);
        float fresnel = pow(1.0 - max(dot(n, v), 0.0), 2.4);
        vec3 base = mix(vec3(0.005, 0.006, 0.008), vec3(0.12, 0.14, 0.16), fiber);
        vec3 tint = vec3(0.05, 0.32, 0.42) * fbm(vPosition * 0.8 + time * 0.05);
        gl_FragColor = vec4(base + tint + fresnel * vec3(0.45, 0.58, 0.62), 1.0);
      }
    `,
    description: "Procedural woven texture with subtle blue-black reflective fiber."
  },
  {
    id: "s8",
    name: "Mirror Nebula",
    fragmentShader: `
      uniform float time;
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      ${SHADER_UTILS}
      void main() {
        vec3 n = normalize(vNormal);
        vec3 v = normalize(vViewPosition);
        vec3 r = reflect(-v, n);
        float gas = fbm(r * 4.0 + vec3(time * 0.08, -time * 0.04, time * 0.11));
        float gas2 = fbm(vPosition * 0.36 - vec3(time * 0.12, 0.0, time * 0.08));
        vec3 nebula = mix(vec3(0.01, 0.03, 0.10), vec3(0.72, 0.1, 0.54), gas);
        nebula = mix(nebula, vec3(0.03, 0.75, 0.88), gas2 * 0.45);
        float star = pow(hash13(floor(r * 58.0)), 34.0) * (0.6 + 0.4 * sin(time * 5.0 + r.x * 30.0));
        float fresnel = pow(1.0 - max(dot(n, v), 0.0), 2.8);
        gl_FragColor = vec4(nebula + vec3(star) + fresnel * spectral(time * 0.04 + gas), 0.92);
      }
    `,
    description: "Reflective space glass with animated nebula clouds and star flecks."
  },
  {
    id: "s9",
    name: "Toxic Waste",
    fragmentShader: `
      uniform float time;
      varying vec3 vPosition;
      void main() {
        vec3 green = vec3(0.2, 0.9, 0.1);
        float bubble = sin(vPosition.x * 5.0 + time) * cos(vPosition.y * 3.0 - time);
        gl_FragColor = vec4(green * (bubble * 0.5 + 0.7), 1.0);
      }
    `,
    description: "Bubbling radioactive green."
  },
  {
    id: "s10",
    name: "Fire Core",
    fragmentShader: `
      uniform float time;
      varying vec3 vPosition;
      void main() {
        float heat = exp(-abs(vPosition.y * 2.0)) * (sin(vPosition.x * 5.0 + time * 2.0) * 0.5 + 0.5);
        gl_FragColor = vec4(vec3(1.0, 0.4, 0.0) * heat * 2.0, 1.0);
      }
    `,
    description: "Intense burning center."
  },
  {
    id: "s11",
    name: "Glitch Blue",
    fragmentShader: `
      uniform float time;
      varying vec3 vPosition;
      void main() {
        float noise = fract(sin(dot(vPosition.xy, vec2(12.9898, 78.233))) * 43758.5453);
        float shift = step(0.95, fract(time * 0.5));
        vec3 color = vec3(0.1, 0.5, 1.0) * (noise * shift + (1.0 - shift));
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    description: "Random digital interference."
  },
  {
    id: "s12",
    name: "Matrix Code",
    fragmentShader: `
      uniform float time;
      varying vec3 vPosition;
      void main() {
        float rows = fract(vPosition.y * 20.0 - time * 5.0);
        float code = step(0.1, fract(sin(vPosition.x * 100.0) * 10.0));
        gl_FragColor = vec4(0.0, rows * code, 0.0, 1.0);
      }
    `,
    description: "Falling digital cascades."
  },
  {
    id: "s13",
    name: "Solar Flare",
    fragmentShader: `
      uniform float time;
      varying vec3 vPosition;
      void main() {
        float d = length(vPosition.xy);
        float flare = sin(d * 10.0 - time * 5.0) * 0.5 + 0.5;
        gl_FragColor = vec4(vec3(1.0, 0.6, 0.2) * flare, 1.0);
      }
    `,
    description: "Outward radiating heat waves."
  },
  {
    id: "s14",
    name: "Crystalline",
    fragmentShader: `
      uniform float time;
      varying vec3 vPosition;
      void main() {
        float facet = abs(sin(vPosition.x * 15.0) * cos(vPosition.y * 15.0));
        gl_FragColor = vec4(vec3(0.8, 0.9, 1.0) * facet, 1.0);
      }
    `,
    description: "Sharp geometric reflections."
  },
  {
    id: "s15",
    name: "Ghostly Aura",
    fragmentShader: `
      uniform float time;
      varying vec3 vPosition;
      void main() {
        float aura = exp(-length(vPosition.xy) * 0.5) * (0.5 + 0.5 * sin(time));
        gl_FragColor = vec4(0.7, 0.7, 1.0, aura);
      }
    `,
    description: "Ethereal translucent glow."
  },
  {
    id: "s16",
    name: "Zebra Stripe",
    fragmentShader: `
      uniform float time;
      varying vec3 vPosition;
      void main() {
        float stripe = step(0.5, sin(vPosition.x * 10.0 + vPosition.y * 10.0 + time));
        gl_FragColor = vec4(vec3(stripe), 1.0);
      }
    `,
    description: "High contrast monochrome pattern."
  },
  {
    id: "s17",
    name: "Bioluminescence",
    fragmentShader: `
      uniform float time;
      varying vec3 vPosition;
      void main() {
        float organisms = pow(sin(vPosition.x * 10.0) * cos(vPosition.y * 10.0), 4.0);
        vec3 color = vec3(0.0, 1.0, 0.5) * organisms * (sin(time) * 0.5 + 0.5);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    description: "Pulsing organic light points."
  },
  {
    id: "s18",
    name: "Retro Grid",
    fragmentShader: `
      uniform float time;
      varying vec3 vPosition;
      void main() {
        vec2 grid = abs(fract(vPosition.xy * 4.0 - 0.5) - 0.5) / fwidth(vPosition.xy * 4.0);
        float line = min(grid.x, grid.y);
        gl_FragColor = vec4(vec3(1.0 - smoothstep(0.0, 0.1, line)), 1.0);
      }
    `,
    description: "Wireframe landscape style."
  },
  {
    id: "s19",
    name: "Sunset Gradient",
    fragmentShader: `
      uniform float time;
      varying vec3 vPosition;
      void main() {
        vec3 top = vec3(1.0, 0.4, 0.2);
        vec3 bot = vec3(0.2, 0.1, 0.4);
        gl_FragColor = vec4(mix(bot, top, vPosition.y * 0.5 + 0.5), 1.0);
      }
    `,
    description: "Vertical atmospheric transition."
  },
  {
    id: "s20",
    name: "Hyperdrive",
    fragmentShader: `
      uniform float time;
      varying vec3 vPosition;
      void main() {
        float streaks = step(0.9, fract(atan(vPosition.y, vPosition.x) * 5.0 + time * 10.0));
        gl_FragColor = vec4(vec3(streaks), 1.0);
      }
    `,
    description: "Radial motion blur effect."
  }
,
  {
    id: "s21",
    name: "Abyssal Biolume",
    fragmentShader: `
      uniform float time;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec3 vViewPosition;

      // Pseudo-noise for organic fluid waves
      float waveNoise(vec2 p) {
        return sin(p.x * 3.0 + time * 1.2) * cos(p.y * 3.0 - time * 0.8) * 0.5 + 0.5;
      }

      void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);
        
        // Dynamic aquatic ripples
        vec2 uv = vPosition.xy * 0.15;
        float r1 = waveNoise(uv + vec2(time * 0.04, time * 0.02));
        float r2 = waveNoise(uv * 2.0 - vec2(time * 0.05, -time * 0.06));
        float ripples = r1 * 0.6 + r2 * 0.4;
        
        // Deep purple to electric cyan water gradient
        vec3 deepColor = vec3(0.05, 0.02, 0.15);
        vec3 neonCyan = vec3(0.0, 0.9, 0.85);
        vec3 waterColor = mix(deepColor, neonCyan, ripples * 0.8);
        
        // Fresnel bioluminescent glow
        float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);
        vec3 bioGlow = vec3(0.2, 0.5, 1.0) * fresnel * (sin(time * 2.0) * 0.2 + 0.8);
        
        // High specular highlights
        vec3 lightDir = normalize(vec3(3.0, 5.0, 2.0));
        vec3 halfDir = normalize(lightDir + viewDir);
        float spec = pow(max(dot(normal, halfDir), 0.0), 128.0) * ripples;
        
        vec3 finalColor = waterColor + bioGlow + vec3(1.0) * spec * 0.9;
        gl_FragColor = vec4(finalColor, 0.8 + fresnel * 0.2);
      }
    `,
    description: "Deep bioluminescent violet & cyan water ripples."
  },
  {
    id: "s22",
    name: "Prismatic Aurora",
    fragmentShader: `
      uniform float time;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec3 vViewPosition;

      void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);
        
        // Fresnel transmission effect
        float cosTheta = max(dot(normal, viewDir), 0.0);
        float fresnel = pow(1.0 - cosTheta, 3.0);
        
        // Chromatic aberration spectrum based on spatial position & time
        vec3 redShift = 0.5 + 0.5 * cos(time * 0.8 + vPosition.xyx * 0.15 + vec3(0.0, 2.0, 4.0));
        vec3 greenShift = 0.5 + 0.5 * cos(time * 0.8 + vPosition.xyx * 0.15 + vec3(2.0, 4.0, 6.0));
        vec3 blueShift = 0.5 + 0.5 * cos(time * 0.8 + vPosition.xyx * 0.15 + vec3(4.0, 6.0, 8.0));
        
        vec3 iridescent = vec3(redShift.r, greenShift.g, blueShift.b);
        
        // Highly transmissive center and glowing iridescent edges
        vec3 glassColor = mix(vec3(0.9, 0.95, 1.0) * 0.25, iridescent, fresnel);
        
        // Super sharp reflection highlight
        vec3 reflectDir = reflect(-normalize(vec3(1.0, 2.0, 1.0)), normal);
        float spec = pow(max(dot(viewDir, reflectDir), 0.0), 128.0);
        
        vec3 finalColor = glassColor + vec3(1.0) * spec * 0.5;
        gl_FragColor = vec4(finalColor, 0.3 + fresnel * 0.7);
      }
    `,
    description: "Iridescent glass showing chromatic spectrum shifts."
  },
  {
    id: "s23",
    name: "Cyberpunk Chrome",
    fragmentShader: `
      uniform float time;
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec3 vViewPosition;

      void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);
        
        // Dynamic fluid-like metallic surface waves
        float wave = sin(vPosition.x * 2.5 + time * 1.8) * cos(vPosition.y * 2.5 - time * 1.2);
        vec3 distortedNormal = normalize(normal + vec3(wave * 0.08, wave * 0.08, 0.0));
        
        // Mirror-reflection vector
        vec3 reflectDir = reflect(-viewDir, distortedNormal);
        
        // Neon pink & electric cyan ambient lights
        vec3 pinkLight = vec3(1.0, 0.0, 0.6);
        vec3 cyanLight = vec3(0.0, 0.9, 1.0);
        
        float factor1 = max(dot(reflectDir, normalize(vec3(1.0, 1.0, 0.8))), 0.0);
        float factor2 = max(dot(reflectDir, normalize(vec3(-1.0, -1.0, -0.8))), 0.0);
        
        vec3 reflection = pinkLight * pow(factor1, 8.0) + cyanLight * pow(factor2, 8.0);
        
        // Super glossy metallic base
        vec3 baseMetal = vec3(0.96, 0.97, 0.99) * 0.15;
        vec3 specular = vec3(1.0) * pow(max(distortedNormal.y, 0.0), 128.0) * 0.8;
        
        gl_FragColor = vec4(baseMetal + reflection + specular, 1.0);
      }
    `,
    description: "Highly reflective chrome mirroring pink and cyan neon lights."
  },
  {
    id: "s24",
    name: "Volcanic Magma",
    fragmentShader: `
      uniform float time;
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec3 vViewPosition;

      void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);
        
        // Highly polished obsidian stone base
        vec3 obsidian = vec3(0.04, 0.03, 0.05);
        
        // Dynamic cracking magma pattern
        float cracks = sin(vPosition.x * 6.0 + time * 0.6) * cos(vPosition.y * 6.0 - time * 0.4);
        cracks += sin(vPosition.x * 15.0) * cos(vPosition.y * 15.0) * 0.35;
        
        // Hot glowing lava veins
        float lavaIntensity = smoothstep(0.05, 0.85, max(0.0, cracks));
        vec3 lavaColor = mix(vec3(0.6, 0.0, 0.0), vec3(1.0, 0.4, 0.0), lavaIntensity);
        lavaColor += vec3(1.0, 0.9, 0.5) * pow(lavaIntensity, 3.5); // Add white-hot core
        
        // Mirror-like reflections on obsidian areas
        vec3 lightDir = normalize(vec3(2.0, 3.0, 1.5));
        vec3 reflectDir = reflect(-lightDir, normal);
        float spec = pow(max(dot(viewDir, reflectDir), 0.0), 128.0) * (1.0 - lavaIntensity);
        
        vec3 finalColor = mix(obsidian, lavaColor, lavaIntensity) + vec3(1.0) * spec * 0.65;
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
    description: "Cooling obsidian rock with glowing liquid magma veins."
  },
  {
    id: "s25",
    name: "Cosmic Nebula",
    fragmentShader: `
      uniform float time;
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec3 vViewPosition;

      void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);
        
        // Outer glass containment sphere
        float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);
        
        // Gaseous deep space swirls
        float gas1 = sin(vPosition.x * 1.8 + time * 0.4) * cos(vPosition.z * 1.8 + time * 0.2);
        float gas2 = cos(vPosition.y * 2.2 - time * 0.3) * sin(vPosition.x * 2.2 + time * 0.1);
        float noise = gas1 * 0.5 + gas2 * 0.5;
        
        vec3 nebula = mix(vec3(0.0, 0.08, 0.35), vec3(0.7, 0.0, 0.7), noise * 0.5 + 0.5);
        nebula = mix(nebula, vec3(0.0, 0.8, 0.8), gas1 * 0.5 + 0.5);
        
        // Twinkling stars
        float starNoise = fract(sin(dot(vPosition.xy, vec2(12.9898, 78.233))) * 43758.5453);
        float starPinch = pow(starNoise, 25.0);
        float twinkle = starPinch * (sin(time * 6.0 + vPosition.x * 12.0) * 0.5 + 0.5);
        
        vec3 finalColor = mix(nebula * 0.85, vec3(1.0), twinkle) + vec3(1.0) * fresnel * 0.45;
        gl_FragColor = vec4(finalColor, 0.25 + fresnel * 0.75);
      }
    `,
    description: "Swirling cyan/magenta gaseous nebulae with twinkling stars."
  },
  {
    id: "s26",
    name: "Carbon Fiber",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vPosition;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float f = pow(1.0 - max(dot(n, v), 0.0), 2.0);
            vec3 c = vec3(0.1, 0.2, 0.3) + f * 0.5;
            gl_FragColor = vec4(c, 1.0);
          }
        `,
    description: "Auto-generated carbon fiber material."
  },
  {
    id: "s27",
    name: "Lava Flow",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vPosition;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float f = pow(1.0 - max(dot(n, v), 0.0), 3.0);
            vec3 c = vec3(0.2, 0.4, 0.6) + f * 0.5;
            gl_FragColor = vec4(c, 1.0);
          }
        `,
    description: "Auto-generated lava flow material."
  },
  {
    id: "s28",
    name: "Ice Crystal",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vPosition;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float f = pow(1.0 - max(dot(n, v), 0.0), 4.0);
            vec3 c = vec3(0.30000000000000004, 0.6000000000000001, 0.8999999999999999) + f * 0.5;
            gl_FragColor = vec4(c, 1.0);
          }
        `,
    description: "Auto-generated ice crystal material."
  },
  {
    id: "s29",
    name: "Emerald",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vPosition;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float f = pow(1.0 - max(dot(n, v), 0.0), 5.0);
            vec3 c = vec3(0.4, 0.8, 0.19999999999999996) + f * 0.5;
            gl_FragColor = vec4(c, 1.0);
          }
        `,
    description: "Auto-generated emerald material."
  },
  {
    id: "s30",
    name: "Ruby Core",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vPosition;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float f = pow(1.0 - max(dot(n, v), 0.0), 1.0);
            vec3 c = vec3(0.5, 0.0, 0.5) + f * 0.5;
            gl_FragColor = vec4(c, 1.0);
          }
        `,
    description: "Auto-generated ruby core material."
  },
  {
    id: "s31",
    name: "Amethyst",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vPosition;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float f = pow(1.0 - max(dot(n, v), 0.0), 2.0);
            vec3 c = vec3(0.6000000000000001, 0.20000000000000018, 0.7999999999999998) + f * 0.5;
            gl_FragColor = vec4(c, 1.0);
          }
        `,
    description: "Auto-generated amethyst material."
  },
  {
    id: "s32",
    name: "Copper",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vPosition;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float f = pow(1.0 - max(dot(n, v), 0.0), 3.0);
            vec3 c = vec3(0.7000000000000001, 0.40000000000000013, 0.10000000000000009) + f * 0.5;
            gl_FragColor = vec4(c, 1.0);
          }
        `,
    description: "Auto-generated copper material."
  },
  {
    id: "s33",
    name: "Brushed Steel",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vPosition;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float f = pow(1.0 - max(dot(n, v), 0.0), 4.0);
            vec3 c = vec3(0.8, 0.6000000000000001, 0.3999999999999999) + f * 0.5;
            gl_FragColor = vec4(c, 1.0);
          }
        `,
    description: "Auto-generated brushed steel material."
  },
  {
    id: "s34",
    name: "Anodized Titanium",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vPosition;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float f = pow(1.0 - max(dot(n, v), 0.0), 5.0);
            vec3 c = vec3(0.9, 0.8, 0.6999999999999997) + f * 0.5;
            gl_FragColor = vec4(c, 1.0);
          }
        `,
    description: "Auto-generated anodized titanium material."
  },
  {
    id: "s35",
    name: "Iridescent Soap",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vPosition;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float f = pow(1.0 - max(dot(n, v), 0.0), 1.0);
            vec3 c = vec3(0.0, 0.0, 0.0) + f * 0.5;
            gl_FragColor = vec4(c, 1.0);
          }
        `,
    description: "Auto-generated iridescent soap material."
  },
  {
    id: "s36",
    name: "Quantum Foam",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vPosition;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float f = pow(1.0 - max(dot(n, v), 0.0), 2.0);
            vec3 c = vec3(0.10000000000000009, 0.20000000000000018, 0.2999999999999998) + f * 0.5;
            gl_FragColor = vec4(c, 1.0);
          }
        `,
    description: "Auto-generated quantum foam material."
  },
  {
    id: "s37",
    name: "Ectoplasm",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vPosition;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float f = pow(1.0 - max(dot(n, v), 0.0), 3.0);
            vec3 c = vec3(0.20000000000000018, 0.40000000000000036, 0.5999999999999996) + f * 0.5;
            gl_FragColor = vec4(c, 1.0);
          }
        `,
    description: "Auto-generated ectoplasm material."
  },
  {
    id: "s38",
    name: "Stardust",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vPosition;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float f = pow(1.0 - max(dot(n, v), 0.0), 4.0);
            vec3 c = vec3(0.30000000000000004, 0.6000000000000001, 0.8999999999999999) + f * 0.5;
            gl_FragColor = vec4(c, 1.0);
          }
        `,
    description: "Auto-generated stardust material."
  },
  {
    id: "s39",
    name: "Aura Field",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vPosition;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float f = pow(1.0 - max(dot(n, v), 0.0), 5.0);
            vec3 c = vec3(0.40000000000000013, 0.8000000000000003, 0.20000000000000018) + f * 0.5;
            gl_FragColor = vec4(c, 1.0);
          }
        `,
    description: "Auto-generated aura field material."
  },
  {
    id: "s40",
    name: "Prismatic",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vPosition;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float f = pow(1.0 - max(dot(n, v), 0.0), 1.0);
            vec3 c = vec3(0.5, 0.0, 0.5) + f * 0.5;
            gl_FragColor = vec4(c, 1.0);
          }
        `,
    description: "Auto-generated prismatic material."
  },
  {
    id: "s41",
    name: "Dark Energy",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vPosition;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float f = pow(1.0 - max(dot(n, v), 0.0), 2.0);
            vec3 c = vec3(0.6000000000000001, 0.20000000000000018, 0.7999999999999998) + f * 0.5;
            gl_FragColor = vec4(c, 1.0);
          }
        `,
    description: "Auto-generated dark energy material."
  },
  {
    id: "s42",
    name: "Antimatter",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vPosition;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float f = pow(1.0 - max(dot(n, v), 0.0), 3.0);
            vec3 c = vec3(0.7000000000000002, 0.40000000000000036, 0.09999999999999964) + f * 0.5;
            gl_FragColor = vec4(c, 1.0);
          }
        `,
    description: "Auto-generated antimatter material."
  },
  {
    id: "s43",
    name: "Chrome Shift",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vPosition;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float f = pow(1.0 - max(dot(n, v), 0.0), 4.0);
            vec3 c = vec3(0.8, 0.6000000000000001, 0.39999999999999947) + f * 0.5;
            gl_FragColor = vec4(c, 1.0);
          }
        `,
    description: "Auto-generated chrome shift material."
  },
  {
    id: "s44",
    name: "Neon Wire",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vPosition;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float f = pow(1.0 - max(dot(n, v), 0.0), 5.0);
            vec3 c = vec3(0.9000000000000001, 0.8000000000000003, 0.7000000000000002) + f * 0.5;
            gl_FragColor = vec4(c, 1.0);
          }
        `,
    description: "Auto-generated neon wire material."
  },
  {
    id: "s45",
    name: "Ghost Shell",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vPosition;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float f = pow(1.0 - max(dot(n, v), 0.0), 1.0);
            vec3 c = vec3(0.0, 0.0, 0.0) + f * 0.5;
            gl_FragColor = vec4(c, 1.0);
          }
        `,
    description: "Auto-generated ghost shell material."
  },
  {
    id: "s46",
    name: "Dragon Scale",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vPosition;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float f = pow(1.0 - max(dot(n, v), 0.0), 2.0);
            vec3 c = vec3(0.10000000000000009, 0.20000000000000018, 0.2999999999999998) + f * 0.5;
            gl_FragColor = vec4(c, 1.0);
          }
        `,
    description: "Auto-generated dragon scale material."
  },
  {
    id: "s47",
    name: "Alien Skin",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vPosition;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float f = pow(1.0 - max(dot(n, v), 0.0), 3.0);
            vec3 c = vec3(0.20000000000000018, 0.40000000000000036, 0.5999999999999996) + f * 0.5;
            gl_FragColor = vec4(c, 1.0);
          }
        `,
    description: "Auto-generated alien skin material."
  },
  {
    id: "s48",
    name: "Abyssal Glow",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vPosition;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float f = pow(1.0 - max(dot(n, v), 0.0), 4.0);
            vec3 c = vec3(0.30000000000000027, 0.6000000000000005, 0.8999999999999995) + f * 0.5;
            gl_FragColor = vec4(c, 1.0);
          }
        `,
    description: "Auto-generated abyssal glow material."
  },
  {
    id: "s49",
    name: "Bismuth Crystal",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vPosition;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float f = pow(1.0 - max(dot(n, v), 0.0), 5.0);
            vec3 c = vec3(0.40000000000000036, 0.8000000000000007, 0.1999999999999993) + f * 0.5;
            gl_FragColor = vec4(c, 1.0);
          }
        `,
    description: "Auto-generated bismuth crystal material."
  },
  {
    id: "s50",
    name: "Void Matter",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vPosition;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float f = pow(1.0 - max(dot(n, v), 0.0), 1.0);
            vec3 c = vec3(0.5, 0.0, 0.5) + f * 0.5;
            gl_FragColor = vec4(c, 1.0);
          }
        `,
    description: "Auto-generated void matter material."
  }
,
  {
    id: "s51",
    name: "Titanium Alloy",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float diff = max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0);
            vec3 reflectDir = reflect(-normalize(vec3(1.0, 1.0, 1.0)), n);
            float spec = pow(max(dot(v, reflectDir), 0.0), 32.0);
            float iridescence = dot(n, v);
            vec3 color = vec3(
              sin(iridescence * 1.0 + 0.50),
              cos(iridescence * 1.0 + 0.20),
              sin(iridescence * 1.0 + 0.52)
            ) * 0.5 + 0.5;
            gl_FragColor = vec4(color * diff + vec3(spec), 1.0);
          }
        `,
    description: "Procedural titanium alloy material simulation."
  },
  {
    id: "s52",
    name: "Brushed Aluminum",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float diff = max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0);
            vec3 reflectDir = reflect(-normalize(vec3(1.0, 1.0, 1.0)), n);
            float spec = pow(max(dot(v, reflectDir), 0.0), 40.0);
            float iridescence = dot(n, v);
            vec3 color = vec3(
              sin(iridescence * 2.0 + 0.95),
              cos(iridescence * 2.0 + 0.98),
              sin(iridescence * 2.0 + 0.99)
            ) * 0.5 + 0.5;
            gl_FragColor = vec4(color * diff + vec3(spec), 1.0);
          }
        `,
    description: "Procedural brushed aluminum material simulation."
  },
  {
    id: "s53",
    name: "Polished Brass",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float diff = max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0);
            vec3 reflectDir = reflect(-normalize(vec3(1.0, 1.0, 1.0)), n);
            float spec = pow(max(dot(v, reflectDir), 0.0), 48.0);
            float iridescence = dot(n, v);
            vec3 color = vec3(
              sin(iridescence * 3.0 + 0.51),
              cos(iridescence * 3.0 + 0.81),
              sin(iridescence * 3.0 + 0.93)
            ) * 0.5 + 0.5;
            gl_FragColor = vec4(color * diff + vec3(spec), 1.0);
          }
        `,
    description: "Procedural polished brass material simulation."
  },
  {
    id: "s54",
    name: "Oxidized Copper",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float diff = max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0);
            vec3 reflectDir = reflect(-normalize(vec3(1.0, 1.0, 1.0)), n);
            float spec = pow(max(dot(v, reflectDir), 0.0), 56.0);
            float iridescence = dot(n, v);
            vec3 color = vec3(
              sin(iridescence * 4.0 + 0.26),
              cos(iridescence * 4.0 + 0.85),
              sin(iridescence * 1.0 + 0.42)
            ) * 0.5 + 0.5;
            gl_FragColor = vec4(color * diff + vec3(spec), 1.0);
          }
        `,
    description: "Procedural oxidized copper material simulation."
  },
  {
    id: "s55",
    name: "Rusty Iron",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float diff = max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0);
            vec3 reflectDir = reflect(-normalize(vec3(1.0, 1.0, 1.0)), n);
            float spec = pow(max(dot(v, reflectDir), 0.0), 64.0);
            float iridescence = dot(n, v);
            vec3 color = vec3(
              sin(iridescence * 5.0 + 0.56),
              cos(iridescence * 1.0 + 0.63),
              sin(iridescence * 2.0 + 0.77)
            ) * 0.5 + 0.5;
            gl_FragColor = vec4(color * diff + vec3(spec), 1.0);
          }
        `,
    description: "Procedural rusty iron material simulation."
  },
  {
    id: "s56",
    name: "Galvanized Steel",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float diff = max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0);
            vec3 reflectDir = reflect(-normalize(vec3(1.0, 1.0, 1.0)), n);
            float spec = pow(max(dot(v, reflectDir), 0.0), 72.0);
            float iridescence = dot(n, v);
            vec3 color = vec3(
              sin(iridescence * 1.0 + 0.83),
              cos(iridescence * 2.0 + 0.61),
              sin(iridescence * 3.0 + 0.29)
            ) * 0.5 + 0.5;
            gl_FragColor = vec4(color * diff + vec3(spec), 1.0);
          }
        `,
    description: "Procedural galvanized steel material simulation."
  },
  {
    id: "s57",
    name: "Mercury",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float diff = max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0);
            vec3 reflectDir = reflect(-normalize(vec3(1.0, 1.0, 1.0)), n);
            float spec = pow(max(dot(v, reflectDir), 0.0), 80.0);
            float iridescence = dot(n, v);
            vec3 color = vec3(
              sin(iridescence * 2.0 + 0.74),
              cos(iridescence * 3.0 + 1.00),
              sin(iridescence * 1.0 + 0.81)
            ) * 0.5 + 0.5;
            gl_FragColor = vec4(color * diff + vec3(spec), 1.0);
          }
        `,
    description: "Procedural mercury material simulation."
  },
  {
    id: "s58",
    name: "Gold Foil",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float diff = max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0);
            vec3 reflectDir = reflect(-normalize(vec3(1.0, 1.0, 1.0)), n);
            float spec = pow(max(dot(v, reflectDir), 0.0), 88.0);
            float iridescence = dot(n, v);
            vec3 color = vec3(
              sin(iridescence * 3.0 + 0.08),
              cos(iridescence * 4.0 + 0.03),
              sin(iridescence * 2.0 + 0.06)
            ) * 0.5 + 0.5;
            gl_FragColor = vec4(color * diff + vec3(spec), 1.0);
          }
        `,
    description: "Procedural gold foil material simulation."
  },
  {
    id: "s59",
    name: "Silver Mirror",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float diff = max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0);
            vec3 reflectDir = reflect(-normalize(vec3(1.0, 1.0, 1.0)), n);
            float spec = pow(max(dot(v, reflectDir), 0.0), 96.0);
            float iridescence = dot(n, v);
            vec3 color = vec3(
              sin(iridescence * 4.0 + 0.30),
              cos(iridescence * 1.0 + 0.97),
              sin(iridescence * 3.0 + 0.63)
            ) * 0.5 + 0.5;
            gl_FragColor = vec4(color * diff + vec3(spec), 1.0);
          }
        `,
    description: "Procedural silver mirror material simulation."
  },
  {
    id: "s60",
    name: "Platinum",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float diff = max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0);
            vec3 reflectDir = reflect(-normalize(vec3(1.0, 1.0, 1.0)), n);
            float spec = pow(max(dot(v, reflectDir), 0.0), 104.0);
            float iridescence = dot(n, v);
            vec3 color = vec3(
              sin(iridescence * 5.0 + 0.71),
              cos(iridescence * 2.0 + 0.57),
              sin(iridescence * 1.0 + 0.19)
            ) * 0.5 + 0.5;
            gl_FragColor = vec4(color * diff + vec3(spec), 1.0);
          }
        `,
    description: "Procedural platinum material simulation."
  },
  {
    id: "s61",
    name: "Tungsten",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float diff = max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0);
            vec3 reflectDir = reflect(-normalize(vec3(1.0, 1.0, 1.0)), n);
            float spec = pow(max(dot(v, reflectDir), 0.0), 112.0);
            float iridescence = dot(n, v);
            vec3 color = vec3(
              sin(iridescence * 1.0 + 0.10),
              cos(iridescence * 3.0 + 0.86),
              sin(iridescence * 2.0 + 0.39)
            ) * 0.5 + 0.5;
            gl_FragColor = vec4(color * diff + vec3(spec), 1.0);
          }
        `,
    description: "Procedural tungsten material simulation."
  },
  {
    id: "s62",
    name: "Cobalt Blue",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float diff = max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0);
            vec3 reflectDir = reflect(-normalize(vec3(1.0, 1.0, 1.0)), n);
            float spec = pow(max(dot(v, reflectDir), 0.0), 120.0);
            float iridescence = dot(n, v);
            vec3 color = vec3(
              sin(iridescence * 2.0 + 0.79),
              cos(iridescence * 4.0 + 0.26),
              sin(iridescence * 3.0 + 0.33)
            ) * 0.5 + 0.5;
            gl_FragColor = vec4(color * diff + vec3(spec), 1.0);
          }
        `,
    description: "Procedural cobalt blue material simulation."
  },
  {
    id: "s63",
    name: "Ruby Red",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float diff = max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0);
            vec3 reflectDir = reflect(-normalize(vec3(1.0, 1.0, 1.0)), n);
            float spec = pow(max(dot(v, reflectDir), 0.0), 128.0);
            float iridescence = dot(n, v);
            vec3 color = vec3(
              sin(iridescence * 3.0 + 0.88),
              cos(iridescence * 1.0 + 0.90),
              sin(iridescence * 1.0 + 0.87)
            ) * 0.5 + 0.5;
            gl_FragColor = vec4(color * diff + vec3(spec), 1.0);
          }
        `,
    description: "Procedural ruby red material simulation."
  },
  {
    id: "s64",
    name: "Emerald Green",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float diff = max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0);
            vec3 reflectDir = reflect(-normalize(vec3(1.0, 1.0, 1.0)), n);
            float spec = pow(max(dot(v, reflectDir), 0.0), 136.0);
            float iridescence = dot(n, v);
            vec3 color = vec3(
              sin(iridescence * 4.0 + 0.69),
              cos(iridescence * 2.0 + 0.39),
              sin(iridescence * 2.0 + 0.56)
            ) * 0.5 + 0.5;
            gl_FragColor = vec4(color * diff + vec3(spec), 1.0);
          }
        `,
    description: "Procedural emerald green material simulation."
  },
  {
    id: "s65",
    name: "Sapphire",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float diff = max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0);
            vec3 reflectDir = reflect(-normalize(vec3(1.0, 1.0, 1.0)), n);
            float spec = pow(max(dot(v, reflectDir), 0.0), 144.0);
            float iridescence = dot(n, v);
            vec3 color = vec3(
              sin(iridescence * 5.0 + 0.72),
              cos(iridescence * 3.0 + 0.36),
              sin(iridescence * 3.0 + 0.21)
            ) * 0.5 + 0.5;
            gl_FragColor = vec4(color * diff + vec3(spec), 1.0);
          }
        `,
    description: "Procedural sapphire material simulation."
  },
  {
    id: "s66",
    name: "Topaz",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float diff = max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0);
            vec3 reflectDir = reflect(-normalize(vec3(1.0, 1.0, 1.0)), n);
            float spec = pow(max(dot(v, reflectDir), 0.0), 152.0);
            float iridescence = dot(n, v);
            vec3 color = vec3(
              sin(iridescence * 1.0 + 0.46),
              cos(iridescence * 4.0 + 0.84),
              sin(iridescence * 1.0 + 0.70)
            ) * 0.5 + 0.5;
            gl_FragColor = vec4(color * diff + vec3(spec), 1.0);
          }
        `,
    description: "Procedural topaz material simulation."
  },
  {
    id: "s67",
    name: "Opal",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float diff = max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0);
            vec3 reflectDir = reflect(-normalize(vec3(1.0, 1.0, 1.0)), n);
            float spec = pow(max(dot(v, reflectDir), 0.0), 32.0);
            float iridescence = dot(n, v);
            vec3 color = vec3(
              sin(iridescence * 2.0 + 0.18),
              cos(iridescence * 1.0 + 0.91),
              sin(iridescence * 2.0 + 1.00)
            ) * 0.5 + 0.5;
            gl_FragColor = vec4(color * diff + vec3(spec), 1.0);
          }
        `,
    description: "Procedural opal material simulation."
  },
  {
    id: "s68",
    name: "Pearlescent White",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float diff = max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0);
            vec3 reflectDir = reflect(-normalize(vec3(1.0, 1.0, 1.0)), n);
            float spec = pow(max(dot(v, reflectDir), 0.0), 40.0);
            float iridescence = dot(n, v);
            vec3 color = vec3(
              sin(iridescence * 3.0 + 0.57),
              cos(iridescence * 2.0 + 0.63),
              sin(iridescence * 3.0 + 0.92)
            ) * 0.5 + 0.5;
            gl_FragColor = vec4(color * diff + vec3(spec), 1.0);
          }
        `,
    description: "Procedural pearlescent white material simulation."
  },
  {
    id: "s69",
    name: "Iridescent Black",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float diff = max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0);
            vec3 reflectDir = reflect(-normalize(vec3(1.0, 1.0, 1.0)), n);
            float spec = pow(max(dot(v, reflectDir), 0.0), 48.0);
            float iridescence = dot(n, v);
            vec3 color = vec3(
              sin(iridescence * 4.0 + 0.67),
              cos(iridescence * 3.0 + 0.98),
              sin(iridescence * 1.0 + 0.53)
            ) * 0.5 + 0.5;
            gl_FragColor = vec4(color * diff + vec3(spec), 1.0);
          }
        `,
    description: "Procedural iridescent black material simulation."
  },
  {
    id: "s70",
    name: "Rainbow Soap",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float diff = max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0);
            vec3 reflectDir = reflect(-normalize(vec3(1.0, 1.0, 1.0)), n);
            float spec = pow(max(dot(v, reflectDir), 0.0), 56.0);
            float iridescence = dot(n, v);
            vec3 color = vec3(
              sin(iridescence * 5.0 + 1.00),
              cos(iridescence * 4.0 + 0.52),
              sin(iridescence * 2.0 + 0.11)
            ) * 0.5 + 0.5;
            gl_FragColor = vec4(color * diff + vec3(spec), 1.0);
          }
        `,
    description: "Procedural rainbow soap material simulation."
  },
  {
    id: "s71",
    name: "Oil Spill",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float diff = max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0);
            vec3 reflectDir = reflect(-normalize(vec3(1.0, 1.0, 1.0)), n);
            float spec = pow(max(dot(v, reflectDir), 0.0), 64.0);
            float iridescence = dot(n, v);
            vec3 color = vec3(
              sin(iridescence * 1.0 + 0.80),
              cos(iridescence * 1.0 + 0.07),
              sin(iridescence * 3.0 + 0.66)
            ) * 0.5 + 0.5;
            gl_FragColor = vec4(color * diff + vec3(spec), 1.0);
          }
        `,
    description: "Procedural oil spill material simulation."
  },
  {
    id: "s72",
    name: "Bismuth",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float diff = max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0);
            vec3 reflectDir = reflect(-normalize(vec3(1.0, 1.0, 1.0)), n);
            float spec = pow(max(dot(v, reflectDir), 0.0), 72.0);
            float iridescence = dot(n, v);
            vec3 color = vec3(
              sin(iridescence * 2.0 + 0.00),
              cos(iridescence * 2.0 + 0.68),
              sin(iridescence * 1.0 + 0.28)
            ) * 0.5 + 0.5;
            gl_FragColor = vec4(color * diff + vec3(spec), 1.0);
          }
        `,
    description: "Procedural bismuth material simulation."
  },
  {
    id: "s73",
    name: "Holographic Foil",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float diff = max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0);
            vec3 reflectDir = reflect(-normalize(vec3(1.0, 1.0, 1.0)), n);
            float spec = pow(max(dot(v, reflectDir), 0.0), 80.0);
            float iridescence = dot(n, v);
            vec3 color = vec3(
              sin(iridescence * 3.0 + 0.01),
              cos(iridescence * 3.0 + 0.32),
              sin(iridescence * 2.0 + 0.26)
            ) * 0.5 + 0.5;
            gl_FragColor = vec4(color * diff + vec3(spec), 1.0);
          }
        `,
    description: "Procedural holographic foil material simulation."
  },
  {
    id: "s74",
    name: "Neon Cyan",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vPosition;
          void main() {
            vec3 n = normalize(vNormal);
            float pulse = sin(time * 3.0 + vPosition.x * 5.0) * 0.5 + 0.5;
            vec3 glowColor = vec3(0.14, 0.92, 0.40);
            gl_FragColor = vec4(glowColor * (1.0 + pulse), 1.0);
          }
        `,
    description: "Procedural neon cyan material simulation."
  },
  {
    id: "s75",
    name: "Neon Magenta",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vPosition;
          void main() {
            vec3 n = normalize(vNormal);
            float pulse = sin(time * 3.0 + vPosition.x * 5.0) * 0.5 + 0.5;
            vec3 glowColor = vec3(0.05, 0.51, 0.56);
            gl_FragColor = vec4(glowColor * (1.0 + pulse), 1.0);
          }
        `,
    description: "Procedural neon magenta material simulation."
  },
  {
    id: "s76",
    name: "Neon Yellow",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vPosition;
          void main() {
            vec3 n = normalize(vNormal);
            float pulse = sin(time * 3.0 + vPosition.x * 5.0) * 0.5 + 0.5;
            vec3 glowColor = vec3(0.29, 0.84, 0.06);
            gl_FragColor = vec4(glowColor * (1.0 + pulse), 1.0);
          }
        `,
    description: "Procedural neon yellow material simulation."
  },
  {
    id: "s77",
    name: "Radioactive Green",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vPosition;
          void main() {
            vec3 n = normalize(vNormal);
            float pulse = sin(time * 3.0 + vPosition.x * 5.0) * 0.5 + 0.5;
            vec3 glowColor = vec3(0.78, 0.23, 0.19);
            gl_FragColor = vec4(glowColor * (1.0 + pulse), 1.0);
          }
        `,
    description: "Procedural radioactive green material simulation."
  },
  {
    id: "s78",
    name: "Lava Hot",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float diff = max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0);
            vec3 reflectDir = reflect(-normalize(vec3(1.0, 1.0, 1.0)), n);
            float spec = pow(max(dot(v, reflectDir), 0.0), 120.0);
            float iridescence = dot(n, v);
            vec3 color = vec3(
              sin(iridescence * 3.0 + 0.48),
              cos(iridescence * 4.0 + 0.27),
              sin(iridescence * 1.0 + 0.66)
            ) * 0.5 + 0.5;
            gl_FragColor = vec4(color * diff + vec3(spec), 1.0);
          }
        `,
    description: "Procedural lava hot material simulation."
  },
  {
    id: "s79",
    name: "Magma",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float diff = max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0);
            vec3 reflectDir = reflect(-normalize(vec3(1.0, 1.0, 1.0)), n);
            float spec = pow(max(dot(v, reflectDir), 0.0), 128.0);
            float iridescence = dot(n, v);
            vec3 color = vec3(
              sin(iridescence * 4.0 + 0.07),
              cos(iridescence * 1.0 + 0.92),
              sin(iridescence * 2.0 + 0.78)
            ) * 0.5 + 0.5;
            gl_FragColor = vec4(color * diff + vec3(spec), 1.0);
          }
        `,
    description: "Procedural magma material simulation."
  },
  {
    id: "s80",
    name: "Plasma Hot",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vPosition;
          void main() {
            vec3 n = normalize(vNormal);
            float pulse = sin(time * 3.0 + vPosition.x * 5.0) * 0.5 + 0.5;
            vec3 glowColor = vec3(0.17, 0.35, 0.96);
            gl_FragColor = vec4(glowColor * (1.0 + pulse), 1.0);
          }
        `,
    description: "Procedural plasma hot material simulation."
  },
  {
    id: "s81",
    name: "Ice Cold",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float fresnel = pow(1.0 - max(dot(n, v), 0.0), 2.0 + 0.0);
            vec3 baseColor = vec3(0.53, 0.74, 0.11);
            gl_FragColor = vec4(mix(baseColor, vec3(1.0), fresnel), 0.3 + fresnel * 0.7);
          }
        `,
    description: "Procedural ice cold material simulation."
  },
  {
    id: "s82",
    name: "Glacier Blue",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float diff = max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0);
            vec3 reflectDir = reflect(-normalize(vec3(1.0, 1.0, 1.0)), n);
            float spec = pow(max(dot(v, reflectDir), 0.0), 152.0);
            float iridescence = dot(n, v);
            vec3 color = vec3(
              sin(iridescence * 2.0 + 0.13),
              cos(iridescence * 4.0 + 0.14),
              sin(iridescence * 2.0 + 0.55)
            ) * 0.5 + 0.5;
            gl_FragColor = vec4(color * diff + vec3(spec), 1.0);
          }
        `,
    description: "Procedural glacier blue material simulation."
  },
  {
    id: "s83",
    name: "Frostbite",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float diff = max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0);
            vec3 reflectDir = reflect(-normalize(vec3(1.0, 1.0, 1.0)), n);
            float spec = pow(max(dot(v, reflectDir), 0.0), 32.0);
            float iridescence = dot(n, v);
            vec3 color = vec3(
              sin(iridescence * 3.0 + 0.03),
              cos(iridescence * 1.0 + 0.51),
              sin(iridescence * 3.0 + 0.38)
            ) * 0.5 + 0.5;
            gl_FragColor = vec4(color * diff + vec3(spec), 1.0);
          }
        `,
    description: "Procedural frostbite material simulation."
  },
  {
    id: "s84",
    name: "Crystal Clear",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float fresnel = pow(1.0 - max(dot(n, v), 0.0), 2.0 + 0.0);
            vec3 baseColor = vec3(0.35, 0.78, 0.23);
            gl_FragColor = vec4(mix(baseColor, vec3(1.0), fresnel), 0.3 + fresnel * 0.7);
          }
        `,
    description: "Procedural crystal clear material simulation."
  },
  {
    id: "s85",
    name: "Stained Glass",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float fresnel = pow(1.0 - max(dot(n, v), 0.0), 2.0 + 1.0);
            vec3 baseColor = vec3(0.61, 0.97, 0.16);
            gl_FragColor = vec4(mix(baseColor, vec3(1.0), fresnel), 0.3 + fresnel * 0.7);
          }
        `,
    description: "Procedural stained glass material simulation."
  },
  {
    id: "s86",
    name: "Tinted Window",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float diff = max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0);
            vec3 reflectDir = reflect(-normalize(vec3(1.0, 1.0, 1.0)), n);
            float spec = pow(max(dot(v, reflectDir), 0.0), 56.0);
            float iridescence = dot(n, v);
            vec3 color = vec3(
              sin(iridescence * 1.0 + 0.77),
              cos(iridescence * 4.0 + 0.89),
              sin(iridescence * 3.0 + 0.81)
            ) * 0.5 + 0.5;
            gl_FragColor = vec4(color * diff + vec3(spec), 1.0);
          }
        `,
    description: "Procedural tinted window material simulation."
  },
  {
    id: "s87",
    name: "Milky Glass",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float fresnel = pow(1.0 - max(dot(n, v), 0.0), 2.0 + 0.0);
            vec3 baseColor = vec3(0.44, 0.31, 0.74);
            gl_FragColor = vec4(mix(baseColor, vec3(1.0), fresnel), 0.3 + fresnel * 0.7);
          }
        `,
    description: "Procedural milky glass material simulation."
  },
  {
    id: "s88",
    name: "Sea Glass",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float fresnel = pow(1.0 - max(dot(n, v), 0.0), 2.0 + 1.0);
            vec3 baseColor = vec3(0.15, 0.64, 0.52);
            gl_FragColor = vec4(mix(baseColor, vec3(1.0), fresnel), 0.3 + fresnel * 0.7);
          }
        `,
    description: "Procedural sea glass material simulation."
  },
  {
    id: "s89",
    name: "Amber",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float diff = max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0);
            vec3 reflectDir = reflect(-normalize(vec3(1.0, 1.0, 1.0)), n);
            float spec = pow(max(dot(v, reflectDir), 0.0), 80.0);
            float iridescence = dot(n, v);
            vec3 color = vec3(
              sin(iridescence * 4.0 + 0.93),
              cos(iridescence * 3.0 + 0.23),
              sin(iridescence * 3.0 + 0.92)
            ) * 0.5 + 0.5;
            gl_FragColor = vec4(color * diff + vec3(spec), 1.0);
          }
        `,
    description: "Procedural amber material simulation."
  },
  {
    id: "s90",
    name: "Jade",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float diff = max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0);
            vec3 reflectDir = reflect(-normalize(vec3(1.0, 1.0, 1.0)), n);
            float spec = pow(max(dot(v, reflectDir), 0.0), 88.0);
            float iridescence = dot(n, v);
            vec3 color = vec3(
              sin(iridescence * 5.0 + 0.79),
              cos(iridescence * 4.0 + 0.78),
              sin(iridescence * 1.0 + 0.99)
            ) * 0.5 + 0.5;
            gl_FragColor = vec4(color * diff + vec3(spec), 1.0);
          }
        `,
    description: "Procedural jade material simulation."
  },
  {
    id: "s91",
    name: "Turquoise",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float diff = max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0);
            vec3 reflectDir = reflect(-normalize(vec3(1.0, 1.0, 1.0)), n);
            float spec = pow(max(dot(v, reflectDir), 0.0), 96.0);
            float iridescence = dot(n, v);
            vec3 color = vec3(
              sin(iridescence * 1.0 + 0.57),
              cos(iridescence * 1.0 + 0.73),
              sin(iridescence * 2.0 + 0.60)
            ) * 0.5 + 0.5;
            gl_FragColor = vec4(color * diff + vec3(spec), 1.0);
          }
        `,
    description: "Procedural turquoise material simulation."
  },
  {
    id: "s92",
    name: "Lapis Lazuli",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float diff = max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0);
            vec3 reflectDir = reflect(-normalize(vec3(1.0, 1.0, 1.0)), n);
            float spec = pow(max(dot(v, reflectDir), 0.0), 104.0);
            float iridescence = dot(n, v);
            vec3 color = vec3(
              sin(iridescence * 2.0 + 0.89),
              cos(iridescence * 2.0 + 0.88),
              sin(iridescence * 3.0 + 0.16)
            ) * 0.5 + 0.5;
            gl_FragColor = vec4(color * diff + vec3(spec), 1.0);
          }
        `,
    description: "Procedural lapis lazuli material simulation."
  },
  {
    id: "s93",
    name: "Malachite",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float diff = max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0);
            vec3 reflectDir = reflect(-normalize(vec3(1.0, 1.0, 1.0)), n);
            float spec = pow(max(dot(v, reflectDir), 0.0), 112.0);
            float iridescence = dot(n, v);
            vec3 color = vec3(
              sin(iridescence * 3.0 + 0.89),
              cos(iridescence * 3.0 + 0.17),
              sin(iridescence * 1.0 + 0.44)
            ) * 0.5 + 0.5;
            gl_FragColor = vec4(color * diff + vec3(spec), 1.0);
          }
        `,
    description: "Procedural malachite material simulation."
  },
  {
    id: "s94",
    name: "Quartz",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float diff = max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0);
            vec3 reflectDir = reflect(-normalize(vec3(1.0, 1.0, 1.0)), n);
            float spec = pow(max(dot(v, reflectDir), 0.0), 120.0);
            float iridescence = dot(n, v);
            vec3 color = vec3(
              sin(iridescence * 4.0 + 0.25),
              cos(iridescence * 4.0 + 0.59),
              sin(iridescence * 2.0 + 0.58)
            ) * 0.5 + 0.5;
            gl_FragColor = vec4(color * diff + vec3(spec), 1.0);
          }
        `,
    description: "Procedural quartz material simulation."
  },
  {
    id: "s95",
    name: "Amethyst Deep",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float diff = max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0);
            vec3 reflectDir = reflect(-normalize(vec3(1.0, 1.0, 1.0)), n);
            float spec = pow(max(dot(v, reflectDir), 0.0), 128.0);
            float iridescence = dot(n, v);
            vec3 color = vec3(
              sin(iridescence * 5.0 + 0.02),
              cos(iridescence * 1.0 + 0.95),
              sin(iridescence * 3.0 + 0.13)
            ) * 0.5 + 0.5;
            gl_FragColor = vec4(color * diff + vec3(spec), 1.0);
          }
        `,
    description: "Procedural amethyst deep material simulation."
  },
  {
    id: "s96",
    name: "Rose Quartz",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float diff = max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0);
            vec3 reflectDir = reflect(-normalize(vec3(1.0, 1.0, 1.0)), n);
            float spec = pow(max(dot(v, reflectDir), 0.0), 136.0);
            float iridescence = dot(n, v);
            vec3 color = vec3(
              sin(iridescence * 1.0 + 0.01),
              cos(iridescence * 2.0 + 0.29),
              sin(iridescence * 1.0 + 0.56)
            ) * 0.5 + 0.5;
            gl_FragColor = vec4(color * diff + vec3(spec), 1.0);
          }
        `,
    description: "Procedural rose quartz material simulation."
  },
  {
    id: "s97",
    name: "Obsidian Black",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float diff = max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0);
            vec3 reflectDir = reflect(-normalize(vec3(1.0, 1.0, 1.0)), n);
            float spec = pow(max(dot(v, reflectDir), 0.0), 144.0);
            float iridescence = dot(n, v);
            vec3 color = vec3(
              sin(iridescence * 2.0 + 0.29),
              cos(iridescence * 3.0 + 0.49),
              sin(iridescence * 2.0 + 0.80)
            ) * 0.5 + 0.5;
            gl_FragColor = vec4(color * diff + vec3(spec), 1.0);
          }
        `,
    description: "Procedural obsidian black material simulation."
  },
  {
    id: "s98",
    name: "Diamond Brilliant",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float fresnel = pow(1.0 - max(dot(n, v), 0.0), 2.0 + 2.0);
            vec3 baseColor = vec3(0.04, 0.16, 0.68);
            gl_FragColor = vec4(mix(baseColor, vec3(1.0), fresnel), 0.3 + fresnel * 0.7);
          }
        `,
    description: "Procedural diamond brilliant material simulation."
  },
  {
    id: "s99",
    name: "Moonstone",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float diff = max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0);
            vec3 reflectDir = reflect(-normalize(vec3(1.0, 1.0, 1.0)), n);
            float spec = pow(max(dot(v, reflectDir), 0.0), 32.0);
            float iridescence = dot(n, v);
            vec3 color = vec3(
              sin(iridescence * 4.0 + 0.85),
              cos(iridescence * 1.0 + 0.66),
              sin(iridescence * 1.0 + 0.81)
            ) * 0.5 + 0.5;
            gl_FragColor = vec4(color * diff + vec3(spec), 1.0);
          }
        `,
    description: "Procedural moonstone material simulation."
  },
  {
    id: "s100",
    name: "Sunstone",
    fragmentShader: `
          uniform float time;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 n = normalize(vNormal);
            vec3 v = normalize(vViewPosition);
            float diff = max(dot(n, normalize(vec3(1.0, 1.0, 1.0))), 0.0);
            vec3 reflectDir = reflect(-normalize(vec3(1.0, 1.0, 1.0)), n);
            float spec = pow(max(dot(v, reflectDir), 0.0), 40.0);
            float iridescence = dot(n, v);
            vec3 color = vec3(
              sin(iridescence * 5.0 + 0.97),
              cos(iridescence * 2.0 + 0.38),
              sin(iridescence * 2.0 + 0.27)
            ) * 0.5 + 0.5;
            gl_FragColor = vec4(color * diff + vec3(spec), 1.0);
          }
        `,
    description: "Procedural sunstone material simulation."
  },
  ...createOrganicShaderVariations(101, 100)
];

type Vec3Tuple = readonly [number, number, number];
type MaterialFamily = 'metal' | 'glass' | 'gem' | 'water' | 'emissive' | 'organic' | 'cosmic';
type ShaderMode = 'static' | 'parameter' | 'coordinate' | 'state' | 'mutation';

interface ProceduralMaterialModel {
  family: MaterialFamily;
  baseColor: Vec3Tuple;
  accentColor: Vec3Tuple;
  metallic: number;
  roughness: number;
  transmission: number;
  emission: number;
  opacity: number;
  iridescence: number;
  clearcoat: number;
  normalStrength: number;
  detailScale: number;
  waveStrength: number;
  facetStrength: number;
  anisotropy: number;
  eta: number;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const fixed = (value: number) => value.toFixed(3);
const vec3 = (value: Vec3Tuple) => `vec3(${value.map(fixed).join(', ')})`;

function seedText(text: string) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) / 4294967295;
}

function vary(seed: number, min: number, max: number) {
  return min + (max - min) * seed;
}

function matchPalette(name: string): { base: Vec3Tuple; accent: Vec3Tuple } {
  const lower = name.toLowerCase();
  const palettes: Array<[string, Vec3Tuple, Vec3Tuple]> = [
    ['gold', [1.0, 0.68, 0.24], [1.0, 0.92, 0.55]],
    ['brass', [0.86, 0.58, 0.24], [1.0, 0.82, 0.42]],
    ['copper', [0.96, 0.42, 0.22], [0.33, 0.78, 0.66]],
    ['rust', [0.58, 0.21, 0.09], [1.0, 0.43, 0.18]],
    ['iron', [0.47, 0.45, 0.43], [0.95, 0.72, 0.44]],
    ['steel', [0.62, 0.67, 0.7], [0.95, 0.98, 1.0]],
    ['titanium', [0.58, 0.6, 0.66], [0.88, 0.78, 1.0]],
    ['aluminum', [0.78, 0.82, 0.84], [1.0, 1.0, 0.92]],
    ['silver', [0.78, 0.82, 0.86], [1.0, 0.96, 0.86]],
    ['platinum', [0.78, 0.78, 0.74], [0.94, 0.98, 1.0]],
    ['tungsten', [0.34, 0.35, 0.38], [0.82, 0.86, 0.92]],
    ['chrome', [0.74, 0.8, 0.88], [0.35, 0.9, 1.0]],
    ['mercury', [0.68, 0.76, 0.82], [0.98, 1.0, 1.0]],
    ['carbon', [0.015, 0.018, 0.022], [0.18, 0.32, 0.38]],
    ['ruby', [0.78, 0.04, 0.13], [1.0, 0.33, 0.55]],
    ['emerald', [0.02, 0.54, 0.28], [0.45, 1.0, 0.68]],
    ['sapphire', [0.03, 0.14, 0.72], [0.38, 0.72, 1.0]],
    ['amethyst', [0.43, 0.2, 0.72], [0.92, 0.62, 1.0]],
    ['topaz', [0.95, 0.48, 0.12], [1.0, 0.88, 0.38]],
    ['opal', [0.72, 0.84, 0.86], [0.98, 0.5, 1.0]],
    ['pearl', [0.82, 0.78, 0.68], [1.0, 0.92, 0.78]],
    ['diamond', [0.72, 0.9, 1.0], [1.0, 1.0, 1.0]],
    ['quartz', [0.82, 0.72, 0.82], [1.0, 0.92, 0.98]],
    ['jade', [0.1, 0.45, 0.3], [0.68, 1.0, 0.72]],
    ['turquoise', [0.02, 0.58, 0.72], [0.55, 1.0, 0.92]],
    ['lapis', [0.02, 0.08, 0.42], [0.92, 0.72, 0.28]],
    ['malachite', [0.03, 0.42, 0.18], [0.3, 0.9, 0.45]],
    ['moonstone', [0.56, 0.68, 0.86], [1.0, 0.82, 0.98]],
    ['sunstone', [0.92, 0.42, 0.18], [1.0, 0.9, 0.45]],
    ['ice', [0.55, 0.84, 1.0], [0.95, 1.0, 1.0]],
    ['frost', [0.62, 0.86, 1.0], [1.0, 1.0, 1.0]],
    ['glacier', [0.28, 0.72, 0.96], [0.86, 1.0, 1.0]],
    ['glass', [0.58, 0.78, 0.9], [1.0, 0.95, 0.86]],
    ['window', [0.36, 0.58, 0.68], [0.9, 1.0, 1.0]],
    ['water', [0.02, 0.28, 0.48], [0.25, 0.86, 1.0]],
    ['sea', [0.04, 0.42, 0.48], [0.5, 1.0, 0.86]],
    ['abyss', [0.01, 0.04, 0.12], [0.0, 0.8, 1.0]],
    ['lava', [0.92, 0.16, 0.02], [1.0, 0.78, 0.16]],
    ['magma', [0.78, 0.08, 0.02], [1.0, 0.55, 0.08]],
    ['fire', [1.0, 0.22, 0.02], [1.0, 0.86, 0.22]],
    ['solar', [1.0, 0.38, 0.04], [1.0, 0.94, 0.38]],
    ['plasma', [0.28, 0.62, 1.0], [1.0, 0.3, 0.88]],
    ['neon', [0.08, 0.92, 1.0], [1.0, 0.16, 0.86]],
    ['toxic', [0.35, 1.0, 0.06], [0.85, 1.0, 0.18]],
    ['radioactive', [0.24, 1.0, 0.05], [0.95, 1.0, 0.1]],
    ['nebula', [0.2, 0.04, 0.42], [0.0, 0.9, 1.0]],
    ['stardust', [0.18, 0.14, 0.3], [1.0, 0.86, 0.44]],
    ['void', [0.01, 0.01, 0.04], [0.5, 0.22, 1.0]],
    ['dark', [0.02, 0.02, 0.06], [0.48, 0.25, 1.0]],
    ['ghost', [0.42, 0.86, 0.74], [0.9, 1.0, 0.95]],
    ['aura', [0.42, 0.3, 0.9], [0.1, 1.0, 0.9]],
    ['biolum', [0.02, 0.78, 0.62], [0.4, 1.0, 0.88]]
  ];

  for (const [key, base, accent] of palettes) {
    if (lower.includes(key)) return { base, accent };
  }

  const seed = seedText(name);
  return {
    base: [
      vary(Math.sin(seed * 12.2) * 0.5 + 0.5, 0.08, 0.82),
      vary(Math.sin(seed * 23.7 + 1.8) * 0.5 + 0.5, 0.1, 0.82),
      vary(Math.sin(seed * 41.3 + 0.7) * 0.5 + 0.5, 0.12, 0.9)
    ],
    accent: [
      vary(Math.sin(seed * 51.1 + 0.3) * 0.5 + 0.5, 0.55, 1.0),
      vary(Math.sin(seed * 67.4 + 1.1) * 0.5 + 0.5, 0.55, 1.0),
      vary(Math.sin(seed * 88.9 + 2.4) * 0.5 + 0.5, 0.55, 1.0)
    ]
  };
}

function inferFamily(name: string): MaterialFamily {
  const lower = name.toLowerCase();
  if (/(water|sea|abyss|glacier|wave|aqua)/.test(lower)) return 'water';
  if (/(glass|crystal|ice|frost|window|diamond|quartz)/.test(lower)) return 'glass';
  if (/(ruby|emerald|sapphire|topaz|opal|pearl|jade|turquoise|lapis|malachite|moonstone|sunstone|amethyst|bismuth)/.test(lower)) return 'gem';
  if (/(lava|magma|fire|solar|plasma|neon|toxic|radioactive|emissive|glowing|glow|radiant|biolum|aura)/.test(lower)) return 'emissive';
  if (/(nebula|stardust|void|dark energy|antimatter|hyperdrive|matrix|glitch|cosmic|holographic|prismatic|iridescent)/.test(lower)) return 'cosmic';
  if (/(carbon|dragon|alien|ghost|ectoplasm|skin|shell|zebra|weave)/.test(lower)) return 'organic';
  return 'metal';
}

function inferMaterialModel(preset: ShaderPreset, index: number): ProceduralMaterialModel {
  const name = preset.name.toLowerCase();
  const seed = seedText(`${preset.id}:${preset.name}:${index}`);
  const family = inferFamily(preset.name);
  const palette = matchPalette(preset.name);
  const frosted = /(frost|matte|milky|pearl|brushed|rust|carbon)/.test(name);
  const liquid = /(liquid|mercury|water|sea|lava|magma|oil|soap)/.test(name);
  const clear = /(clear|diamond|glass|window|ice|crystal)/.test(name);
  const dark = /(dark|void|obsidian|abyss|black)/.test(name);

  const model: ProceduralMaterialModel = {
    family,
    baseColor: palette.base,
    accentColor: palette.accent,
    metallic: family === 'metal' ? vary(seed, 0.72, 0.98) : family === 'organic' ? 0.18 : 0.03,
    roughness: family === 'metal' ? vary(seedText(`${preset.name}:rough`), 0.16, 0.42) : 0.28,
    transmission: 0.0,
    emission: 0.0,
    opacity: 1.0,
    iridescence: family === 'cosmic' || name.includes('iridescent') || name.includes('holographic') || name.includes('prismatic') ? 0.75 : 0.18,
    clearcoat: family === 'metal' ? 0.32 : 0.48,
    normalStrength: vary(seedText(`${preset.name}:normal`), 0.12, 0.32),
    detailScale: vary(seedText(`${preset.name}:detail`), 0.55, 1.65),
    waveStrength: liquid ? 0.52 : 0.12,
    facetStrength: 0.18,
    anisotropy: /(brushed|carbon|weave|fiber|zebra|titanium|aluminum|steel)/.test(name) ? 0.82 : 0.22,
    eta: 0.68
  };

  if (family === 'glass') {
    model.metallic = 0.0;
    model.roughness = frosted ? 0.48 : clear ? 0.06 : 0.2;
    model.transmission = clear ? 0.86 : 0.62;
    model.opacity = frosted ? 0.56 : 0.44;
    model.iridescence = name.includes('stained') ? 0.7 : 0.34;
    model.clearcoat = 0.9;
    model.normalStrength = frosted ? 0.34 : 0.18;
    model.facetStrength = clear ? 0.54 : 0.28;
  }

  if (family === 'gem') {
    model.metallic = 0.0;
    model.roughness = frosted ? 0.32 : 0.11;
    model.transmission = name.includes('pearl') || name.includes('opal') ? 0.38 : 0.58;
    model.opacity = name.includes('pearl') ? 0.78 : 0.68;
    model.iridescence = name.includes('opal') || name.includes('moonstone') || name.includes('bismuth') ? 0.92 : 0.48;
    model.clearcoat = 0.86;
    model.normalStrength = 0.24;
    model.facetStrength = 0.76;
  }

  if (family === 'water') {
    model.metallic = 0.0;
    model.roughness = 0.05;
    model.transmission = 0.82;
    model.opacity = 0.42;
    model.iridescence = 0.36;
    model.clearcoat = 0.94;
    model.normalStrength = 0.48;
    model.waveStrength = 0.92;
    model.facetStrength = 0.18;
    model.eta = 0.75;
  }

  if (family === 'emissive') {
    model.metallic = /(gold|copper|iron|metal)/.test(name) ? 0.45 : 0.08;
    model.roughness = 0.22;
    model.emission = vary(seedText(`${preset.name}:emission`), 0.45, 1.35);
    model.opacity = name.includes('neon') || name.includes('aura') ? 0.72 : 1.0;
    model.iridescence = 0.35;
    model.clearcoat = 0.62;
    model.normalStrength = 0.36;
    model.waveStrength = liquid ? 0.75 : 0.24;
  }

  if (family === 'organic') {
    model.metallic = name.includes('carbon') ? 0.28 : 0.04;
    model.roughness = frosted ? 0.58 : 0.42;
    model.transmission = name.includes('ghost') || name.includes('ectoplasm') ? 0.45 : 0.06;
    model.opacity = name.includes('ghost') ? 0.55 : 0.96;
    model.iridescence = name.includes('alien') || name.includes('dragon') ? 0.42 : 0.18;
    model.clearcoat = 0.52;
    model.normalStrength = 0.46;
    model.facetStrength = name.includes('dragon') ? 0.66 : 0.26;
    model.anisotropy = name.includes('carbon') ? 0.95 : model.anisotropy;
  }

  if (family === 'cosmic') {
    model.metallic = 0.18;
    model.roughness = 0.18;
    model.transmission = dark ? 0.18 : 0.36;
    model.opacity = dark ? 0.82 : 0.72;
    model.emission = vary(seedText(`${preset.name}:cosmic`), 0.18, 0.62);
    model.iridescence = 0.9;
    model.clearcoat = 0.76;
    model.normalStrength = 0.3;
    model.waveStrength = 0.38;
  }

  if (liquid && family === 'metal') {
    model.roughness = 0.07;
    model.waveStrength = 0.62;
    model.normalStrength = 0.38;
    model.clearcoat = 0.86;
  }

  if (dark) {
    model.baseColor = [
      Math.max(0.01, model.baseColor[0] * 0.55),
      Math.max(0.01, model.baseColor[1] * 0.55),
      Math.max(0.015, model.baseColor[2] * 0.7)
    ];
    model.clearcoat = Math.min(0.95, model.clearcoat + 0.12);
  }

  return model;
}

function shaderModeBlock(mode: ShaderMode, seed: number) {
  const sx = fixed(vary(seedText(`${seed}:sx`), 1.7, 5.2));
  const sy = fixed(vary(seedText(`${seed}:sy`), 2.1, 6.8));
  const sz = fixed(vary(seedText(`${seed}:sz`), 0.4, 1.5));

  if (mode === 'parameter') {
    return `
        float evolve = 0.5 + 0.5 * sin(time * ${sz} + grain * 6.28318 + ${sx});
        roughness = clamp(mix(roughness * 0.52, roughness + 0.38, evolve), 0.025, 0.92);
        metallic = clamp(metallic + 0.18 * sin(time * 0.37 + fine * 4.0 + ${sy}), 0.0, 1.0);
        transmission = clamp(transmission + 0.22 * sin(time * 0.29 + vPosition.y * 0.18), 0.0, 0.95);
        iridescence = clamp(iridescence + 0.35 * evolve, 0.0, 1.0);
        normalStrength *= 0.7 + evolve * 0.95;
      `;
  }

  if (mode === 'coordinate') {
    return `
        float region = step(0.0, sin(vPosition.x * ${sx} + time * 0.45) * cos(vPosition.y * ${sy} - time * 0.32));
        float band = smoothstep(0.38, 0.62, fract(vUv.x * ${sy} + vUv.y * ${sx} + time * 0.05));
        float coordMask = max(region * 0.72, band * 0.48);
        base = mix(base, accent, coordMask);
        metallic = mix(metallic, 1.0 - metallic, coordMask * 0.55);
        roughness = clamp(mix(roughness, 0.08 + 0.46 * fine, coordMask), 0.03, 0.9);
        transmission = clamp(mix(transmission, 0.72, band * 0.45), 0.0, 0.92);
        clearcoat = clamp(clearcoat + coordMask * 0.25, 0.0, 1.0);
      `;
  }

  if (mode === 'state') {
    return `
        float viewState = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewPosition)), 0.0), 3.0);
        float state = grain * 0.72 + fine * 0.48 + viewState * 0.65 + 0.18 * sin(time + vPosition.z * ${sx});
        if (state > 1.12) {
          base = mix(base, accent, 0.82);
          metallic = clamp(metallic + 0.35, 0.0, 1.0);
          roughness = clamp(roughness * 0.45, 0.025, 0.8);
          emission += 0.34 + 0.25 * fine;
          iridescence = clamp(iridescence + 0.42, 0.0, 1.0);
        } else if (state < 0.48) {
          roughness = clamp(roughness + 0.28, 0.05, 0.95);
          transmission = clamp(transmission + 0.24, 0.0, 0.95);
          normalStrength *= 1.45;
        }
      `;
  }

  if (mode === 'mutation') {
    return `
        float opcode = mod(floor(time * ${sz} + floor(vUv.x * ${sx}) + floor(vUv.y * ${sy}) + floor(grain * 4.0)), 4.0);
        if (opcode < 1.0) {
          base = mix(base, accent, 0.65);
          roughness = clamp(roughness * 0.35, 0.025, 0.8);
          metallic = clamp(1.0 - metallic * 0.55, 0.0, 1.0);
        } else if (opcode < 2.0) {
          base = spectral(grain + time * 0.04 + ${sx});
          transmission = clamp(transmission + 0.38, 0.0, 0.95);
          iridescence = 1.0;
        } else if (opcode < 3.0) {
          base *= 0.42 + accent * 0.9;
          emission += smoothstep(0.45, 0.95, fine) * 0.72;
          normalStrength *= 1.65;
        } else {
          base = mix(vec3(0.02, 0.025, 0.035), base, 0.55);
          roughness = clamp(0.72 - roughness * 0.35, 0.05, 0.92);
          clearcoat = 1.0;
        }
      `;
  }

  return '';
}

function buildPhotorealFragmentShader(model: ProceduralMaterialModel, mode: ShaderMode = 'static', seed = 0) {
  return `
      uniform float time;
      varying vec2 vUv;
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      ${SHADER_UTILS}
      void main() {
        vec3 base = ${vec3(model.baseColor)};
        vec3 accent = ${vec3(model.accentColor)};
        float metallic = ${fixed(model.metallic)};
        float roughness = ${fixed(model.roughness)};
        float transmission = ${fixed(model.transmission)};
        float emission = ${fixed(model.emission)};
        float opacity = ${fixed(model.opacity)};
        float iridescence = ${fixed(model.iridescence)};
        float clearcoat = ${fixed(model.clearcoat)};
        float normalStrength = ${fixed(model.normalStrength)};
        float waveStrength = ${fixed(model.waveStrength)};
        float facetStrength = ${fixed(model.facetStrength)};
        float anisotropy = ${fixed(model.anisotropy)};
        float eta = ${fixed(model.eta)};

        vec3 p = vPosition * ${fixed(model.detailScale)};
        vec3 flow = vec3(time * 0.12, -time * 0.08, time * 0.05);
        float grain = fbm(p + flow);
        float fine = fbm(p * 3.3 - flow.yzx * 1.8);
        float wave = 0.5 + 0.5 * sin(vPosition.x * 1.7 + time * 1.15 + sin(vPosition.y * 0.8 - time * 0.45));
        float cells = smoothstep(0.34, 0.88, fine + 0.18 * sin((vPosition.x + vPosition.y + vPosition.z) * 2.2));
        float brush = smoothstep(0.22, 0.86, sin((vPosition.x * 26.0 + vPosition.z * 7.0) + grain * 5.0) * 0.5 + 0.5);
        ${shaderModeBlock(mode, seed)}

        vec3 n0 = normalize(vNormal);
        vec3 bump = vec3(
          fbm(p * 1.4 + vec3(time * 0.09, 2.1, 0.0)),
          fbm(p.yzx * 1.5 + vec3(4.2, -time * 0.07, 1.3)),
          fbm(p.zxy * 1.3 + vec3(0.7, 3.4, time * 0.06))
        ) - 0.5;
        bump += waveStrength * vec3(wave - 0.5, fine - 0.5, grain - 0.5);
        vec3 n = normalize(n0 + bump * normalStrength);
        vec3 v = normalize(vViewPosition);
        vec3 lightA = normalize(vec3(-0.45, 0.72, 0.55));
        vec3 lightB = normalize(vec3(0.65, 0.26, -0.5));
        vec3 r = reflect(-v, n);
        float ndv = max(dot(n, v), 0.0);
        float fresnel = pow(1.0 - ndv, 5.0);
        vec3 f0 = mix(vec3(0.04), base, metallic);
        vec3 F = f0 + (1.0 - f0) * fresnel;

        float textureMask = clamp(mix(grain, cells, facetStrength) + waveStrength * (wave - 0.5) * 0.35, 0.0, 1.0);
        vec3 texturedBase = mix(base * (0.72 + 0.34 * grain), accent, textureMask * (0.18 + iridescence * 0.36));
        texturedBase = mix(texturedBase, texturedBase * (0.78 + brush * 0.34), anisotropy);

        float ndlA = max(dot(n, lightA), 0.0);
        float ndlB = max(dot(n, lightB), 0.0);
        float ao = 0.52 + 0.48 * smoothstep(0.06, 0.96, fine);
        vec3 diffuse = texturedBase * (0.16 + ndlA * 0.72 + ndlB * 0.24) * ao * (1.0 - metallic * 0.72);

        float specPower = mix(18.0, 230.0, 1.0 - roughness);
        float specA = pow(max(dot(reflect(-lightA, n), v), 0.0), specPower);
        float specB = pow(max(dot(reflect(-lightB, n), v), 0.0), max(12.0, specPower * 0.45));
        vec3 env = envColor(r, time);
        vec3 metalReflection = env * mix(vec3(1.0), texturedBase, metallic);
        vec3 color = diffuse + metalReflection * (0.18 + metallic * 0.74 + fresnel * 0.56);
        color += F * (specA * (1.1 - roughness * 0.7) + specB * 0.42);
        color += vec3(clearcoat) * pow(max(dot(reflect(-v, n), normalize(vec3(0.12, 0.82, 0.55))), 0.0), 140.0) * (0.16 + 0.84 * (1.0 - roughness));

        vec3 refracted = envColor(refract(-v, n, eta), time + 1.4) * (0.82 + 0.28 * fine);
        color = mix(color, mix(refracted, texturedBase, 0.22), transmission * (0.38 + fresnel * 0.42));
        color = mix(color, spectral(fresnel * 1.7 + grain * 0.45 + time * 0.035), iridescence * (0.2 + fresnel * 0.45));
        color += accent * emission * (0.24 + 0.76 * smoothstep(0.26, 1.0, grain + waveStrength * wave));
        color += spectral(fine + time * 0.025) * emission * 0.2;

        color = color / (color + vec3(1.0));
        color = pow(max(color, vec3(0.0)), vec3(0.4545));
        float alpha = clamp(opacity + transmission * fresnel * 0.22 + emission * 0.08, 0.32, 1.0);
        gl_FragColor = vec4(color, alpha);
      }
    `;
}

function enhanceShaderPreset(preset: ShaderPreset, index: number): ShaderPreset {
  if (preset.category === 'Organic PDE shaders') {
    return preset;
  }

  const model = inferMaterialModel(preset, index);
  return {
    ...preset,
    fragmentShader: buildPhotorealFragmentShader(model, 'static', seedText(preset.id)),
    description: `Enhanced procedural PBR material: ${preset.description}`
  };
}

function createSelfModifyingShader(
  id: string,
  name: string,
  category: ShaderCategory,
  materialName: string,
  mode: ShaderMode,
  description: string
): ShaderPreset {
  const pseudoPreset: ShaderPreset = {
    id,
    name: materialName,
    fragmentShader: '',
    description
  };
  return {
    id,
    name,
    category,
    fragmentShader: buildPhotorealFragmentShader(inferMaterialModel(pseudoPreset, Math.round(seedText(id) * 1000)), mode, seedText(`${id}:${name}`)),
    description
  };
}

type R185LabKind = 'tsl' | 'volume' | 'html' | 'xr';

type R185LabShaderConfig = {
  id: string;
  name: string;
  category: ShaderCategory;
  kind: R185LabKind;
  description: string;
  base: [number, number, number];
  accent: [number, number, number];
  highlight: [number, number, number];
  scale: number;
  speed: number;
  density: number;
};

function glslVec3(value: [number, number, number]) {
  return `vec3(${value.map(glslNumber).join(', ')})`;
}

function buildR185LabFragmentShader(config: R185LabShaderConfig) {
  const base = glslVec3(config.base);
  const accent = glslVec3(config.accent);
  const highlight = glslVec3(config.highlight);
  const scale = glslNumber(config.scale);
  const speed = glslNumber(config.speed);
  const density = glslNumber(config.density);

  const bodyByKind: Record<R185LabKind, string> = {
    tsl: `
        float gathered = 0.0;
        gathered += fbm(p * 1.20 + vec3(0.00, 0.21, 0.37) * ${density} + time * ${speed});
        gathered += fbm(p * 1.54 + vec3(0.34, -0.17, 0.11) * ${density} + time * ${speed});
        gathered += fbm(p * 1.88 + vec3(-0.26, 0.08, -0.29) * ${density} + time * ${speed});
        gathered += fbm(p * 2.22 + vec3(0.13, 0.31, -0.19) * ${density} + time * ${speed});
        gathered *= 0.25;
        float cachedWave = labLine(dot(p, vec3(0.73, 0.41, 0.29)) * (5.2 + ${density}) + gathered * 6.2 + time * ${speed}, 0.18);
        float nodeBloom = smoothstep(0.34, 0.92, gathered + fresnel * 0.45);
        vec3 color = mix(${base}, ${accent}, gathered * 0.78 + cachedWave * 0.18);
        color = mix(color, ${highlight}, nodeBloom * 0.58 + cachedWave * 0.22);
        color += spectral(gathered + fresnel * 0.55 + time * 0.035) * (0.16 + cachedWave * 0.28);
        float alpha = 0.66 + nodeBloom * 0.22 + fresnel * 0.12;
    `,
    volume: `
        float volume = 0.0;
        float shell = 0.0;
        for (int i = 0; i < 7; i++) {
          float layer = float(i) / 6.0;
          vec3 q = p + n * (layer - 0.5) * ${density} + vec3(time * ${speed}, -time * ${speed} * 0.43, layer);
          float field = fbm(q * (1.1 + layer * 1.7));
          volume += smoothstep(0.28, 0.82, field) * (1.0 - abs(layer - 0.5) * 0.72);
          shell += labLine(length(q.xy) * (8.0 + ${density}) - q.z * 2.4 + field * 4.0, 0.16);
        }
        volume /= 7.0;
        shell /= 7.0;
        float core = smoothstep(0.22, 0.95, volume);
        vec3 color = mix(${base}, ${accent}, core);
        color = mix(color, ${highlight}, shell * 0.52 + fresnel * 0.36);
        color += spectral(volume * 0.7 + shell * 0.2 + time * 0.025) * core * 0.26;
        float alpha = 0.48 + core * 0.34 + fresnel * 0.16;
    `,
    html: `
        vec2 panelUv = vUv * vec2(1.42, 1.0);
        vec2 cell = abs(fract(panelUv * vec2(10.0 + ${density}, 5.0 + ${density} * 0.35)) - 0.5);
        float grid = 1.0 - smoothstep(0.015, 0.085, min(cell.x, cell.y));
        float scan = 0.5 + 0.5 * sin((vUv.y * 150.0) + time * 18.0 * ${speed});
        float card = smoothstep(0.08, 0.18, vUv.x) * smoothstep(0.08, 0.18, vUv.y) *
          (1.0 - smoothstep(0.82, 0.94, vUv.x)) * (1.0 - smoothstep(0.82, 0.94, vUv.y));
        float cursor = smoothstep(0.018, 0.0, abs(vUv.x - (0.2 + 0.6 * fract(time * ${speed} * 0.18))));
        float glass = fbm(p * 2.2 + vec3(0.0, time * ${speed}, 0.0));
        vec3 color = mix(vec3(0.005, 0.009, 0.014), ${base}, card * 0.72 + glass * 0.16);
        color += ${accent} * (grid * 0.24 + scan * 0.06);
        color += ${highlight} * (cursor * 0.42 + fresnel * 0.28);
        color += spectral(vUv.x + glass * 0.18 + time * 0.03) * grid * 0.12;
        float alpha = 0.6 + card * 0.24 + fresnel * 0.14;
    `,
    xr: `
        vec3 lightA = normalize(vec3(0.72, 0.42, 0.55));
        vec3 lightB = normalize(vec3(-0.44, 0.82, -0.35));
        vec3 lightC = normalize(vec3(sin(time * ${speed}), 0.54, cos(time * ${speed})));
        float l0 = max(dot(n, lightA), 0.0);
        float l1 = max(dot(n, lightB), 0.0);
        float l2 = max(dot(n, lightC), 0.0);
        float cluster = floor((vPosition.x + 14.0) * 0.32) + floor((vPosition.y + 14.0) * 0.28) + floor((vPosition.z + 14.0) * 0.24);
        float clusterPulse = 0.5 + 0.5 * sin(cluster * ${density} + time * ${speed} * 2.0);
        float ao = 1.0 - smoothstep(0.38, 1.0, fbm(p * 1.7 + n * 0.45));
        float rim = pow(1.0 - max(dot(n, v), 0.0), 2.1);
        vec3 color = ${base} * (0.18 + ao * 0.42);
        color += ${accent} * (l0 * 0.54 + clusterPulse * 0.18);
        color += ${highlight} * (pow(l1, 3.0) * 0.54 + pow(l2, 4.0) * 0.36 + rim * 0.4);
        color += spectral(clusterPulse + rim * 0.3 + time * 0.035) * rim * 0.22;
        float alpha = 0.74 + rim * 0.2 + clusterPulse * 0.06;
    `
  };

  return `
      uniform float time;
      varying vec2 vUv;
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      ${SHADER_UTILS}

      float labLine(float value, float width) {
        return 1.0 - smoothstep(0.0, width, abs(sin(value)));
      }

      void main() {
        vec3 n = normalize(vNormal);
        vec3 v = normalize(vViewPosition);
        vec3 p = vPosition * ${scale};
        float fresnel = pow(1.0 - max(dot(n, v), 0.0), 2.4);
        ${bodyByKind[config.kind]}
        color = color / (color + vec3(1.0));
        color = pow(max(color, vec3(0.0)), vec3(0.4545));
        gl_FragColor = vec4(color, clamp(alpha, 0.35, 1.0));
      }
    `;
}

function createR185LabShader(config: R185LabShaderConfig): ShaderPreset {
  return {
    id: config.id,
    name: config.name,
    category: config.category,
    fragmentShader: buildR185LabFragmentShader(config),
    description: config.description
  };
}

const R185_TSL_LAB_SHADER_PRESETS: ShaderPreset[] = [
  createR185LabShader({
    id: 'webgpu-tsl-solar-granulation',
    name: 'WebGPU TSL: Solar Granulation',
    category: 'WebGPU TSL shaders',
    kind: 'tsl',
    description: 'WebGPU node shader with hot cellular granulation and copper/plasma energy bands.',
    base: [0.08, 0.02, 0.0],
    accent: [1.0, 0.45, 0.08],
    highlight: [1.0, 0.95, 0.58],
    scale: 0.18,
    speed: 0.26,
    density: 6.4
  }),
  createR185LabShader({
    id: 'webgpu-tsl-neural-rain',
    name: 'WebGPU TSL: Neural Rain',
    category: 'WebGPU TSL shaders',
    kind: 'tsl',
    description: 'WebGPU node shader with vertical signal trails, green/cyan scan fields, and holographic emission.',
    base: [0.0, 0.045, 0.025],
    accent: [0.12, 0.95, 0.42],
    highlight: [0.38, 0.92, 1.0],
    scale: 0.24,
    speed: 0.38,
    density: 5.7
  }),
  createR185LabShader({
    id: 'webgpu-tsl-opal-depth',
    name: 'WebGPU TSL: Opal Depth',
    category: 'WebGPU TSL shaders',
    kind: 'tsl',
    description: 'WebGPU node shader with pearlescent depth bands and soft pink/blue internal scatter.',
    base: [0.92, 0.95, 1.0],
    accent: [0.62, 0.74, 1.0],
    highlight: [1.0, 0.58, 0.78],
    scale: 0.31,
    speed: 0.12,
    density: 3.3
  }),
  createR185LabShader({
    id: 'webgpu-tsl-lava-suture',
    name: 'WebGPU TSL: Lava Suture',
    category: 'WebGPU TSL shaders',
    kind: 'tsl',
    description: 'WebGPU node shader with dark obsidian skin, hot suture lines, and molten yellow seams.',
    base: [0.015, 0.006, 0.006],
    accent: [0.82, 0.08, 0.06],
    highlight: [1.0, 0.78, 0.12],
    scale: 0.22,
    speed: 0.2,
    density: 7.2
  }),
  createR185LabShader({
    id: 'webgpu-tsl-cryosphere',
    name: 'WebGPU TSL: Cryosphere',
    category: 'WebGPU TSL shaders',
    kind: 'tsl',
    description: 'WebGPU node shader with icy X-ray translucency, frost bands, and bright blue rim response.',
    base: [0.02, 0.06, 0.1],
    accent: [0.18, 0.74, 1.0],
    highlight: [0.92, 0.98, 1.0],
    scale: 0.27,
    speed: 0.1,
    density: 4.8
  }),
  createR185LabShader({
    id: 'webgpu-tsl-biome-weave',
    name: 'WebGPU TSL: Biome Weave',
    category: 'WebGPU TSL shaders',
    kind: 'tsl',
    description: 'WebGPU node shader with braided botanical bands, jade subsurface color, and yellow-green growth pulses.',
    base: [0.01, 0.07, 0.035],
    accent: [0.2, 0.82, 0.44],
    highlight: [0.98, 0.93, 0.42],
    scale: 0.21,
    speed: 0.18,
    density: 6.8
  }),
  createR185LabShader({
    id: 'webgpu-tsl-circuit-bloom',
    name: 'WebGPU TSL: Circuit Bloom',
    category: 'WebGPU TSL shaders',
    kind: 'tsl',
    description: 'WebGPU node shader with bright circuit traces, cyan/purple node blooms, and high-emission scan paths.',
    base: [0.006, 0.012, 0.04],
    accent: [0.08, 0.82, 1.0],
    highlight: [0.72, 0.48, 1.0],
    scale: 0.35,
    speed: 0.32,
    density: 8.6
  }),
  createR185LabShader({
    id: 'webgpu-tsl-nebula-foam',
    name: 'WebGPU TSL: Nebula Foam',
    category: 'WebGPU TSL shaders',
    kind: 'tsl',
    description: 'WebGPU node shader with slow gas-cell foam, magenta nebula clouds, and blue inner scatter.',
    base: [0.055, 0.018, 0.12],
    accent: [0.96, 0.32, 0.72],
    highlight: [0.34, 0.64, 1.0],
    scale: 0.16,
    speed: 0.09,
    density: 2.9
  }),
  createR185LabShader({
    id: 'webgpu-tsl-carbon-spark',
    name: 'WebGPU TSL: Carbon Spark',
    category: 'WebGPU TSL shaders',
    kind: 'tsl',
    description: 'WebGPU node shader with dark anisotropic fiber bands, slate reflections, and orange ignition points.',
    base: [0.008, 0.008, 0.009],
    accent: [0.3, 0.36, 0.44],
    highlight: [1.0, 0.42, 0.08],
    scale: 0.29,
    speed: 0.22,
    density: 9.2
  }),
  createR185LabShader({
    id: 'webgpu-tsl-quartz-resonator',
    name: 'WebGPU TSL: Quartz Resonator',
    category: 'WebGPU TSL shaders',
    kind: 'tsl',
    description: 'WebGPU node shader with translucent quartz bands, icy resonance lines, and bright white refraction.',
    base: [0.03, 0.075, 0.12],
    accent: [0.58, 0.9, 1.0],
    highlight: [1.0, 1.0, 1.0],
    scale: 0.26,
    speed: 0.08,
    density: 5.3
  }),
  createR185LabShader({
    id: 'r185-tsl-gather-cache-prism',
    name: 'TSL Lab: Gather Cache Prism',
    category: 'R185 TSL Lab shaders',
    kind: 'tsl',
    description: 'WebGL-compatible TSL study using gathered samples and cached-looking Fresnel bands.',
    base: [0.02, 0.08, 0.18],
    accent: [0.18, 0.78, 0.98],
    highlight: [1.0, 0.42, 0.86],
    scale: 0.28,
    speed: 0.18,
    density: 2.6
  }),
  createR185LabShader({
    id: 'r185-tsl-function-node-bloom',
    name: 'TSL Lab: Function Node Bloom',
    category: 'R185 TSL Lab shaders',
    kind: 'tsl',
    description: 'Layered function-cache style nodes with soft spectral bloom around the harmonic line.',
    base: [0.04, 0.03, 0.14],
    accent: [0.56, 0.36, 1.0],
    highlight: [0.22, 1.0, 0.76],
    scale: 0.34,
    speed: 0.24,
    density: 3.2
  }),
  createR185LabShader({
    id: 'r185-tsl-gathered-thin-film',
    name: 'TSL Lab: Gathered Thin Film',
    category: 'R185 TSL Lab shaders',
    kind: 'tsl',
    description: 'Texture-gather inspired thin-film interference over a dark procedural substrate.',
    base: [0.015, 0.04, 0.055],
    accent: [0.9, 0.38, 0.18],
    highlight: [0.44, 0.9, 1.0],
    scale: 0.42,
    speed: 0.14,
    density: 4.1
  }),
  createR185LabShader({
    id: 'r185-tsl-cached-fresnel-lattice',
    name: 'TSL Lab: Cached Fresnel Lattice',
    category: 'R185 TSL Lab shaders',
    kind: 'tsl',
    description: 'Node-lattice bands with a cached Fresnel look, tuned for ribbon and crystal geometry.',
    base: [0.06, 0.02, 0.08],
    accent: [0.78, 0.18, 1.0],
    highlight: [1.0, 0.82, 0.28],
    scale: 0.31,
    speed: 0.21,
    density: 5.0
  }),
  createR185LabShader({
    id: 'r185-tsl-node-graph-aurora',
    name: 'TSL Lab: Node Graph Aurora',
    category: 'R185 TSL Lab shaders',
    kind: 'tsl',
    description: 'Aurora-like node graph shader that makes the new lab category easy to spot.',
    base: [0.01, 0.05, 0.08],
    accent: [0.12, 0.9, 0.58],
    highlight: [0.76, 0.42, 1.0],
    scale: 0.24,
    speed: 0.28,
    density: 3.7
  }),
  createR185LabShader({
    id: 'r185-volume-harmonic-smoke-core',
    name: 'Volume Field: Harmonic Smoke Core',
    category: 'Volumetric harmonic fields',
    kind: 'volume',
    description: 'Pseudo-storageTexture3D smoke field built from harmonic volume layers.',
    base: [0.02, 0.03, 0.08],
    accent: [0.42, 0.72, 1.0],
    highlight: [1.0, 0.55, 0.3],
    scale: 0.19,
    speed: 0.16,
    density: 2.8
  }),
  createR185LabShader({
    id: 'r185-volume-storage-coral',
    name: 'Volume Field: StorageTexture Coral',
    category: 'Volumetric harmonic fields',
    kind: 'volume',
    description: 'Coral-like volumetric shells inspired by WebGPU storageTexture3D workflows.',
    base: [0.05, 0.015, 0.04],
    accent: [1.0, 0.32, 0.46],
    highlight: [0.98, 0.82, 0.44],
    scale: 0.23,
    speed: 0.12,
    density: 4.6
  }),
  createR185LabShader({
    id: 'r185-volume-beat-scalar-fog',
    name: 'Volume Field: Beat Scalar Fog',
    category: 'Volumetric harmonic fields',
    kind: 'volume',
    description: 'Fog bank shader meant to pair with beat-sync and evolving scalar parameters.',
    base: [0.015, 0.06, 0.07],
    accent: [0.18, 0.95, 0.82],
    highlight: [0.92, 0.92, 1.0],
    scale: 0.17,
    speed: 0.24,
    density: 3.4
  }),
  createR185LabShader({
    id: 'r185-volume-pde-root-bloom',
    name: 'Volume Field: PDE Root Bloom',
    category: 'Volumetric harmonic fields',
    kind: 'volume',
    description: 'Organic root-field bloom with stacked density slices and spectral edge response.',
    base: [0.035, 0.025, 0.012],
    accent: [0.86, 0.54, 0.22],
    highlight: [0.38, 0.92, 0.72],
    scale: 0.22,
    speed: 0.18,
    density: 5.4
  }),
  createR185LabShader({
    id: 'r185-volume-voxel-iris-shell',
    name: 'Volume Field: Voxel Iris Shell',
    category: 'Volumetric harmonic fields',
    kind: 'volume',
    description: 'Layered iris shell that reads like a volumetric scalar field on curved surfaces.',
    base: [0.02, 0.018, 0.09],
    accent: [0.42, 0.4, 1.0],
    highlight: [0.92, 0.9, 0.56],
    scale: 0.3,
    speed: 0.1,
    density: 6.0
  }),
  createR185LabShader({
    id: 'r185-html-cyan-console-glass',
    name: 'HTMLTexture: Cyan Console Glass',
    category: 'HTMLTexture scene shaders',
    kind: 'html',
    description: 'Glass-console material inspired by mapping live HTMLTexture panels into a scene.',
    base: [0.01, 0.08, 0.1],
    accent: [0.05, 0.84, 1.0],
    highlight: [0.76, 1.0, 0.92],
    scale: 0.3,
    speed: 0.22,
    density: 2.2
  }),
  createR185LabShader({
    id: 'r185-html-formula-glass-card',
    name: 'HTMLTexture: Formula Glass Card',
    category: 'HTMLTexture scene shaders',
    kind: 'html',
    description: 'Translucent card surface with gridlines and cursor shimmer for formula metadata panels.',
    base: [0.03, 0.025, 0.08],
    accent: [0.58, 0.42, 1.0],
    highlight: [1.0, 0.72, 0.34],
    scale: 0.26,
    speed: 0.16,
    density: 3.8
  }),
  createR185LabShader({
    id: 'r185-html-xr-status-overlay',
    name: 'HTMLTexture: XR Status Overlay',
    category: 'HTMLTexture scene shaders',
    kind: 'html',
    description: 'Status-overlay material for readable XR labels without putting a dialog in the scene.',
    base: [0.015, 0.035, 0.06],
    accent: [0.28, 0.6, 1.0],
    highlight: [0.2, 1.0, 0.58],
    scale: 0.2,
    speed: 0.26,
    density: 5.2
  }),
  createR185LabShader({
    id: 'r185-html-shader-label-bloom',
    name: 'HTMLTexture: Shader Label Bloom',
    category: 'HTMLTexture scene shaders',
    kind: 'html',
    description: 'UI-label scanline material with soft bloom for shader metadata surfaces.',
    base: [0.06, 0.025, 0.035],
    accent: [1.0, 0.34, 0.62],
    highlight: [0.98, 0.9, 0.42],
    scale: 0.33,
    speed: 0.19,
    density: 4.4
  }),
  createR185LabShader({
    id: 'r185-html-audio-meter-skin',
    name: 'HTMLTexture: Audio Meter Skin',
    category: 'HTMLTexture scene shaders',
    kind: 'html',
    description: 'Meter-like panel material intended for future audio beat-sync HTMLTexture widgets.',
    base: [0.012, 0.052, 0.032],
    accent: [0.36, 1.0, 0.54],
    highlight: [0.42, 0.74, 1.0],
    scale: 0.28,
    speed: 0.34,
    density: 6.2
  }),
  createR185LabShader({
    id: 'r185-xr-clustered-stage-lights',
    name: 'WebGPU XR: Clustered Stage Lights',
    category: 'WebGPU XR lighting shaders',
    kind: 'xr',
    description: 'Clustered-lighting inspired surface with moving light cells and spatial rim response.',
    base: [0.02, 0.025, 0.04],
    accent: [0.38, 0.64, 1.0],
    highlight: [1.0, 0.64, 0.32],
    scale: 0.27,
    speed: 0.28,
    density: 1.6
  }),
  createR185LabShader({
    id: 'r185-xr-forward-plus-caustics',
    name: 'WebGPU XR: Forward Plus Caustics',
    category: 'WebGPU XR lighting shaders',
    kind: 'xr',
    description: 'Forward+ lighting study with caustic highlights and clustered cell pulses.',
    base: [0.0, 0.04, 0.06],
    accent: [0.08, 0.92, 0.94],
    highlight: [0.98, 0.9, 0.7],
    scale: 0.21,
    speed: 0.22,
    density: 2.4
  }),
  createR185LabShader({
    id: 'r185-xr-passthrough-rim-field',
    name: 'WebGPU XR: Passthrough Rim Field',
    category: 'WebGPU XR lighting shaders',
    kind: 'xr',
    description: 'Opaque-browser-safe passthrough styling with strong rim light and low background dependency.',
    base: [0.018, 0.015, 0.026],
    accent: [0.72, 0.3, 1.0],
    highlight: [0.26, 1.0, 0.9],
    scale: 0.32,
    speed: 0.18,
    density: 3.1
  }),
  createR185LabShader({
    id: 'r185-xr-spatial-light-probe',
    name: 'WebGPU XR: Spatial Light Probe',
    category: 'WebGPU XR lighting shaders',
    kind: 'xr',
    description: 'Spatial-probe look that samples procedural light directions around the form.',
    base: [0.04, 0.03, 0.018],
    accent: [0.95, 0.58, 0.22],
    highlight: [0.46, 0.86, 1.0],
    scale: 0.24,
    speed: 0.14,
    density: 4.2
  }),
  createR185LabShader({
    id: 'r185-xr-foveated-glow-bands',
    name: 'WebGPU XR: Foveated Glow Bands',
    category: 'WebGPU XR lighting shaders',
    kind: 'xr',
    description: 'Foveation-inspired glow bands that keep the center readable and edges energetic.',
    base: [0.025, 0.018, 0.06],
    accent: [0.54, 0.44, 1.0],
    highlight: [1.0, 0.42, 0.74],
    scale: 0.29,
    speed: 0.32,
    density: 5.6
  })
];

const ORGANIC_FLOW_SHADER_PRESETS: ShaderPreset[] = [
  {
    id: "organic-shader-root-smoke",
    name: "Organic PDE: Polynomial Root Smoke",
    category: "Organic PDE shaders",
    fragmentShader: `
      uniform float time;
      varying vec2 vUv;
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      ${SHADER_UTILS}
      void main() {
        vec3 n = normalize(vNormal);
        vec3 v = normalize(vViewPosition);
        vec2 p = vPosition.xy * 0.12;
        float r = length(p) + 0.0001;
        float a = atan(p.y, p.x);

        float rootField = 0.0;
        for (int i = 0; i < 7; i++) {
          float fi = float(i);
          float angle = fi * 0.897598 + time * 0.12 + 0.18 * sin(time * 0.4 + fi);
          vec2 center = vec2(cos(angle), sin(angle)) * (0.44 + 0.12 * sin(fi * 1.7 + time * 0.6));
          float d = length(p - center);
          rootField += exp(-d * 8.8) * (0.62 + 0.38 * sin(fi + a * 5.0 - time));
        }

        float rootRadius = 0.5 + 0.06 * sin(a * 6.0 + time + fbm(vec3(p * 4.0, time * 0.1)) * 2.0);
        float ring = exp(-pow(abs(r - rootRadius), 2.0) * 70.0);
        float curl = fbm(vec3(p * 7.0 + vec2(sin(a * 3.0 + time), cos(a * 4.0 - time)) * 0.25, time * 0.16));
        float edgeFade = 1.0 - smoothstep(1.0, 1.42, r);
        float veil = clamp((rootField * 0.3 + ring * 0.9 + curl * 0.38) * edgeFade, 0.0, 1.0);

        float fresnel = pow(1.0 - max(dot(n, v), 0.0), 2.4);
        vec3 deep = vec3(0.015, 0.02, 0.075);
        vec3 smoke = spectral(a * 0.08 + r * 0.32 + curl * 0.2 + time * 0.035);
        vec3 color = mix(deep, smoke, veil);
        color += vec3(0.76, 1.0, 0.2) * pow(ring, 2.4) * 0.9;
        color += vec3(0.2, 0.55, 1.0) * fresnel * (0.28 + veil * 0.35);
        gl_FragColor = vec4(color, clamp(0.28 + veil * 0.48 + fresnel * 0.18, 0.28, 0.88));
      }
    `,
    description: "Translucent root-locus smoke with curling chromatic filaments and a breathing central void."
  },
  {
    id: "organic-shader-reaction-amber",
    name: "Organic PDE: Amber Reaction Labyrinth",
    category: "Organic PDE shaders",
    fragmentShader: `
      uniform float time;
      varying vec2 vUv;
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      ${SHADER_UTILS}
      void main() {
        vec3 n = normalize(vNormal);
        vec3 v = normalize(vViewPosition);
        vec2 p = vPosition.xy * 0.11;
        float r = length(p) + 0.0001;
        float a = atan(p.y, p.x);

        vec2 q = p;
        for (int i = 0; i < 4; i++) {
          float fi = float(i);
          q += 0.16 * vec2(
            sin(q.y * (3.1 + fi) + time * (0.35 + fi * 0.08)),
            cos(q.x * (2.9 + fi) - time * (0.3 + fi * 0.07))
          );
        }

        float field =
          sin(q.x * 17.0 + time * 0.36) +
          sin(q.y * 15.0 - time * 0.31) +
          sin((q.x + q.y) * 11.5 + fbm(vec3(q * 3.0, time * 0.12)) * 5.0);
        float ridge = 1.0 - smoothstep(0.05, 0.22, abs(field));
        float annulus = smoothstep(0.22, 0.42, r) * (1.0 - smoothstep(1.03, 1.34, r));
        float bead = smoothstep(0.965, 0.998, sin(a * 44.0 + time * 0.45) * 0.5 + 0.5);
        bead *= smoothstep(0.82, 0.95, r) * (1.0 - smoothstep(1.08, 1.22, r));
        float groove = smoothstep(0.11, 0.42, abs(field));
        float fresnel = pow(1.0 - max(dot(n, v), 0.0), 3.0);

        vec3 resin = vec3(0.45, 0.22, 0.07) * (0.52 + 0.24 * fbm(vec3(p * 3.0, time * 0.05)));
        vec3 shadow = vec3(0.015, 0.011, 0.006);
        vec3 gold = vec3(1.0, 0.58, 0.16);
        vec3 hot = vec3(1.0, 0.88, 0.42);
        vec3 color = mix(resin, shadow, groove * annulus * 0.82);
        color = mix(color, gold, ridge * annulus * 0.78);
        color += hot * (pow(ridge, 5.0) * annulus + bead * 0.78);
        color += vec3(1.0, 0.52, 0.16) * fresnel * 0.28;
        gl_FragColor = vec4(color, clamp(0.72 + ridge * 0.2 + fresnel * 0.08, 0.58, 1.0));
      }
    `,
    description: "A Turing-pattern labyrinth with amber resin shadows, glowing ridges, and orbiting beads."
  },
  {
    id: "organic-shader-liminal-blue",
    name: "Organic PDE: Liminal Blue Corridor",
    category: "Organic PDE shaders",
    fragmentShader: `
      uniform float time;
      varying vec2 vUv;
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      ${SHADER_UTILS}
      void main() {
        vec3 n = normalize(vNormal);
        vec3 v = normalize(vViewPosition);
        vec2 p = vPosition.xy * 0.12;
        vec2 m = abs(p);
        float r = length(p) + 0.0001;

        vec2 q = m;
        q += 0.12 * vec2(
          sin(q.y * 8.0 + time * 0.55 + fbm(vec3(p * 2.0, time * 0.1)) * 3.0),
          cos(q.x * 7.0 - time * 0.42)
        );

        float stair = 1.0 - smoothstep(0.08, 0.24, abs(fract(q.y * 9.0 + q.x * 2.1 - time * 0.08) - 0.5));
        float sideWall = 1.0 - smoothstep(0.04, 0.17, abs(q.x - 0.42 - 0.08 * sin(q.y * 4.0 + time)));
        float chevron = 1.0 - smoothstep(0.05, 0.2, abs(q.x + q.y * 0.55 - 0.76 - 0.12 * sin(time + q.y * 5.0)));
        float corridor = max(sideWall, max(stair * 0.8, chevron * 0.72));
        float voidMask = smoothstep(0.18, 0.58, r);
        float pulse = fbm(vec3(q * 6.0, time * 0.16));
        float fresnel = pow(1.0 - max(dot(n, v), 0.0), 2.2);

        vec3 midnight = vec3(0.005, 0.012, 0.055);
        vec3 blue = vec3(0.03, 0.24, 0.58);
        vec3 cyan = vec3(0.22, 0.78, 1.0);
        vec3 rose = vec3(1.0, 0.24, 0.56);
        vec3 color = mix(midnight, blue, 0.46 + pulse * 0.32);
        color = mix(color, cyan, corridor * voidMask * (0.45 + 0.3 * pulse));
        color += rose * pow(corridor, 4.0) * 0.28;
        color += spectral(pulse + r * 0.3 + time * 0.03) * fresnel * 0.35;
        gl_FragColor = vec4(color, clamp(0.54 + corridor * 0.3 + fresnel * 0.18, 0.42, 0.96));
      }
    `,
    description: "Mirrored blue corridor terraces with slow procedural flow and spectral edge shimmer."
  },
  {
    id: "organic-shader-coral-ivory",
    name: "Organic PDE: Turing Coral Ivory",
    category: "Organic PDE shaders",
    fragmentShader: `
      uniform float time;
      varying vec2 vUv;
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      ${SHADER_UTILS}
      void main() {
        vec3 n = normalize(vNormal);
        vec3 v = normalize(vViewPosition);
        vec2 p = vPosition.xy * 0.13;
        float r = length(p) + 0.0001;
        float a = atan(p.y, p.x);

        vec2 q = p;
        q += 0.18 * vec2(
          sin(a * 6.0 + r * 9.0 + time * 0.45),
          cos(a * 5.0 - r * 8.0 - time * 0.37)
        );
        float warp = fbm(vec3(q * 5.0, time * 0.14));
        float ring = r * 21.0 + warp * 5.5 + sin(a * 18.0 + time * 0.3) * 1.2;
        float line = 1.0 - smoothstep(0.05, 0.2, abs(sin(ring)));
        float cellular = 1.0 - smoothstep(0.18, 0.42, abs(sin(q.x * 16.0) + cos(q.y * 15.0)));
        float coral = max(line, cellular * 0.85);
        coral *= smoothstep(0.12, 0.38, r) * (1.0 - smoothstep(1.1, 1.42, r));
        float core = 1.0 - smoothstep(0.0, 0.34, r);
        float fresnel = pow(1.0 - max(dot(n, v), 0.0), 2.6);

        vec3 navy = vec3(0.005, 0.015, 0.055);
        vec3 ivory = vec3(0.94, 0.86, 0.68);
        vec3 pearl = vec3(1.0, 0.96, 0.84);
        vec3 color = mix(navy, ivory, coral * 0.82);
        color = mix(color, pearl, pow(coral, 4.0) * 0.62);
        color = mix(color, vec3(0.48, 0.38, 0.25), core * 0.66);
        color += vec3(0.76, 0.86, 1.0) * fresnel * (0.2 + coral * 0.35);
        gl_FragColor = vec4(color, clamp(0.68 + coral * 0.24 + fresnel * 0.08, 0.58, 1.0));
      }
    `,
    description: "Ivory Turing ridges over a deep field, tuned for medallions and coral-like annular growth."
  }
];

const SELF_MODIFYING_SHADER_PRESETS: ShaderPreset[] = [
  createSelfModifyingShader("self-shader-param-01", "Shader Param: Breathing Glass IOR", "Parameter-evolving shaders", "Crystal Clear Glass", "parameter", "Glass transmission, roughness, and pseudo-IOR evolve continuously."),
  createSelfModifyingShader("self-shader-param-02", "Shader Param: Mercury Roughness Tide", "Parameter-evolving shaders", "Liquid Mercury Metal", "parameter", "Liquid metal shifts from mirror-smooth to brushed micro-roughness."),
  createSelfModifyingShader("self-shader-param-03", "Shader Param: Opal Thin-Film Pulse", "Parameter-evolving shaders", "Fractal Opal Gem", "parameter", "Opal color bands and subsurface glow breathe through animated parameters."),
  createSelfModifyingShader("self-shader-param-04", "Shader Param: Carbon Fiber Tension", "Parameter-evolving shaders", "Carbon Fiber Weave", "parameter", "Fiber anisotropy and normal depth flex like tensioned composite material."),
  createSelfModifyingShader("self-shader-param-05", "Shader Param: Water Surface Wind", "Parameter-evolving shaders", "Sea Water Glass", "parameter", "Water roughness and wave normals evolve as if wind speed changes."),
  createSelfModifyingShader("self-shader-param-06", "Shader Param: Lava Cooling Skin", "Parameter-evolving shaders", "Magma Lava Flow", "parameter", "Molten emissive veins cool into rough mineral crust and reheat."),
  createSelfModifyingShader("self-shader-param-07", "Shader Param: Titanium Oxide Bloom", "Parameter-evolving shaders", "Anodized Titanium Metal", "parameter", "Anodized titanium shifts oxide color, roughness, and clearcoat strength."),
  createSelfModifyingShader("self-shader-param-08", "Shader Param: Frosted Quartz Thaw", "Parameter-evolving shaders", "Frosted Quartz Crystal", "parameter", "Frosted crystal clears and clouds through evolving transmission parameters."),
  createSelfModifyingShader("self-shader-param-09", "Shader Param: Neon Gas Pressure", "Parameter-evolving shaders", "Neon Plasma Glass", "parameter", "Emissive gas pressure modulates glow, ripples, and transparency."),
  createSelfModifyingShader("self-shader-param-10", "Shader Param: Pearl Nacre Drift", "Parameter-evolving shaders", "Pearlescent White Pearl", "parameter", "Pearl nacre layers evolve in sheen, color travel, and micro-bump depth."),
  createSelfModifyingShader("self-shader-coord-01", "Shader Coordinate: Split Chrome Glass", "Coordinate-dependent shaders", "Chrome Glass Hybrid", "coordinate", "Position bands split reflective chrome from transparent glass."),
  createSelfModifyingShader("self-shader-coord-02", "Shader Coordinate: Quadrant Gem Alloy", "Coordinate-dependent shaders", "Ruby Titanium Alloy", "coordinate", "Coordinate quadrants blend gemstone transmission with metallic alloy shading."),
  createSelfModifyingShader("self-shader-coord-03", "Shader Coordinate: Tidal Metal Foam", "Coordinate-dependent shaders", "Sea Mercury Water", "coordinate", "Surface regions alternate between water-film refraction and liquid metal."),
  createSelfModifyingShader("self-shader-coord-04", "Shader Coordinate: Carbon Ceramic Checker", "Coordinate-dependent shaders", "Carbon Ceramic Weave", "coordinate", "UV checker regions switch between satin carbon and glossy ceramic."),
  createSelfModifyingShader("self-shader-coord-05", "Shader Coordinate: Lava Obsidian Faults", "Coordinate-dependent shaders", "Obsidian Lava Magma", "coordinate", "Coordinate fault lines expose emissive lava under black glass."),
  createSelfModifyingShader("self-shader-coord-06", "Shader Coordinate: Stained Window Cells", "Coordinate-dependent shaders", "Stained Glass Window", "coordinate", "Procedural cells create local stained-glass color and roughness zones."),
  createSelfModifyingShader("self-shader-coord-07", "Shader Coordinate: Bismuth Step Planes", "Coordinate-dependent shaders", "Bismuth Crystal", "coordinate", "Stepped coordinates create iridescent metallic crystal terraces."),
  createSelfModifyingShader("self-shader-coord-08", "Shader Coordinate: Arctic Brine Bands", "Coordinate-dependent shaders", "Glacier Sea Ice", "coordinate", "Bands alternate between translucent ice and blue brine water."),
  createSelfModifyingShader("self-shader-coord-09", "Shader Coordinate: Holographic Foil Tiles", "Coordinate-dependent shaders", "Holographic Foil", "coordinate", "Tiled regions flip foil color, clearcoat, and metallic response."),
  createSelfModifyingShader("self-shader-coord-10", "Shader Coordinate: Alien Scale Mosaic", "Coordinate-dependent shaders", "Alien Dragon Scale", "coordinate", "Spatial mosaic regions shift scale color, gloss, and subsurface opacity."),
  createSelfModifyingShader("self-shader-state-01", "Shader State: Fresnel Glass Metal", "State-dependent shader switching", "Glass Titanium Hybrid", "state", "View-angle Fresnel state switches between dielectric glass and metal reflection."),
  createSelfModifyingShader("self-shader-state-02", "Shader State: Noise-Cracked Emerald", "State-dependent shader switching", "Emerald Green Gem", "state", "Internal noise state opens bright mineral cracks inside emerald glass."),
  createSelfModifyingShader("self-shader-state-03", "Shader State: Foam Crest Water", "State-dependent shader switching", "Ocean Water Foam", "state", "Wave-energy state changes clear water into bright crest foam."),
  createSelfModifyingShader("self-shader-state-04", "Shader State: Heated Steel Temper", "State-dependent shader switching", "Brushed Steel Heat", "state", "Thermal state moves steel between cool brushed metal and heated emissive tint."),
  createSelfModifyingShader("self-shader-state-05", "Shader State: Obsidian Glow Trap", "State-dependent shader switching", "Dark Obsidian Lava", "state", "Dark glass state reveals emissive red traps when energy rises."),
  createSelfModifyingShader("self-shader-state-06", "Shader State: Opal Cloud Collapse", "State-dependent shader switching", "Milky Opal Pearl", "state", "Cloud density state toggles opal between milky subsurface and sharp iridescence."),
  createSelfModifyingShader("self-shader-state-07", "Shader State: Carbon Conductive Paths", "State-dependent shader switching", "Carbon Neon Fiber", "state", "Fiber state lights conductive paths across rough black composite."),
  createSelfModifyingShader("self-shader-state-08", "Shader State: Diamond Caustic Gate", "State-dependent shader switching", "Diamond Brilliant Crystal", "state", "Caustic-like state boosts refraction and crisp spectral highlights."),
  createSelfModifyingShader("self-shader-state-09", "Shader State: Rust Under Clearcoat", "State-dependent shader switching", "Rusty Iron Clearcoat", "state", "Roughness state exposes rust through a wet clearcoat."),
  createSelfModifyingShader("self-shader-state-10", "Shader State: Aurora Density Switch", "State-dependent shader switching", "Aurora Glass", "state", "Density state alternates clear glass with glowing aurora curtains."),
  createSelfModifyingShader("self-shader-mutation-01", "Shader Mutation: Opcode Alloy", "Shader formula mutation meta-shaders", "Titanium Copper Gold Alloy", "mutation", "Shader opcodes mutate material response among alloy, glass, glow, and dark coat."),
  createSelfModifyingShader("self-shader-mutation-02", "Shader Mutation: Glass Metal Genome", "Shader formula mutation meta-shaders", "Mercury Glass Chrome", "mutation", "A gene-like opcode swaps between transmission, reflection, and clearcoat equations."),
  createSelfModifyingShader("self-shader-mutation-03", "Shader Mutation: Iridescent Noise DNA", "Shader formula mutation meta-shaders", "Iridescent Opal Holographic", "mutation", "Procedural mutation changes spectral bands, bump depth, and glow."),
  createSelfModifyingShader("self-shader-mutation-04", "Shader Mutation: Water Lava Polarity", "Shader formula mutation meta-shaders", "Sea Lava Plasma", "mutation", "Mutates between cool refractive water and hot emissive magma responses."),
  createSelfModifyingShader("self-shader-mutation-05", "Shader Mutation: Carbon Pearl Skin", "Shader formula mutation meta-shaders", "Carbon Pearl Shell", "mutation", "Material grammar flips from carbon fiber to pearlescent shell."),
  createSelfModifyingShader("self-shader-mutation-06", "Shader Mutation: Gem Facet Roulette", "Shader formula mutation meta-shaders", "Sapphire Ruby Emerald Diamond", "mutation", "Facet, color, roughness, and transmission mutate in deterministic roulette cells."),
  createSelfModifyingShader("self-shader-mutation-07", "Shader Mutation: Void Neon Reactor", "Shader formula mutation meta-shaders", "Void Neon Plasma", "mutation", "Dark matter coating mutates into neon plasma channels and back."),
  createSelfModifyingShader("self-shader-mutation-08", "Shader Mutation: Oxide Thin-Film Swap", "Shader formula mutation meta-shaders", "Anodized Bismuth Titanium", "mutation", "Thin-film oxide colors and metallic response swap by opcode."),
  createSelfModifyingShader("self-shader-mutation-09", "Shader Mutation: Frost Fire Composite", "Shader formula mutation meta-shaders", "Frosted Ice Fire", "mutation", "Icy transmission mutates into hot emissive seams across the surface."),
  createSelfModifyingShader("self-shader-mutation-10", "Shader Mutation: Meta Material Breather", "Shader formula mutation meta-shaders", "Prismatic Glass Metal Water", "mutation", "Meta-material grammar mutates across glass, metal, water, and spectral glow.")
];

export const PRESET_SHADERS: ShaderPreset[] = [
  ...R185_TSL_LAB_SHADER_PRESETS,
  ...BASE_PRESET_SHADERS.map(enhanceShaderPreset),
  ...ORGANIC_FLOW_SHADER_PRESETS,
  ...SELF_MODIFYING_SHADER_PRESETS
];
