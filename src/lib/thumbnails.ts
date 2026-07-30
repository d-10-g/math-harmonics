import { compile } from 'mathjs';
import { Formula, ShaderPreset } from '../constants';
import { surfaceRanges } from './parametricSurface';

// Lazy preset thumbnails for the library list. Formula thumbs are 2D canvas
// polylines; shader thumbs render the actual GLSL on a shared WebGL quad.
// Everything is cached per id for the session.

const THUMB_SIZE = 96;
const formulaCache = new Map<string, string>();
const shaderCache = new Map<string, string>();

let scratch2D: CanvasRenderingContext2D | null | undefined;

function get2D(): CanvasRenderingContext2D | null {
  if (scratch2D === undefined) {
    const canvas = document.createElement('canvas');
    canvas.width = THUMB_SIZE;
    canvas.height = THUMB_SIZE;
    scratch2D = canvas.getContext('2d');
  }
  return scratch2D ?? null;
}

export function formulaThumbnail(formula: Formula): string {
  const cached = formulaCache.get(formula.id);
  if (cached !== undefined) return cached;

  let dataUrl = '';
  const ctx = get2D();
  if (ctx) {
    try {
      const fx = compile(formula.x);
      const fy = compile(formula.y);
      const t = 1.2;
      const count = formula.parametric ? 120 : 180;
      // Surfaces preview as several stacked q-slices (wireframe feel);
      // curves as a single stroke.
      const { pRange, qRange } = surfaceRanges(formula);
      const qSlices = formula.parametric
        ? [0.08, 0.3, 0.5, 0.7, 0.92].map((f) => qRange[0] + f * (qRange[1] - qRange[0]))
        : [0];
      const pSpan: [number, number] = formula.parametric ? pRange : [0, Math.PI * 8];
      const slices: Array<{ xs: number[]; ys: number[] }> = [];
      let extent = 0.001;

      for (const q of qSlices) {
        const xs: number[] = [];
        const ys: number[] = [];
        for (let i = 0; i <= count; i++) {
          const p = pSpan[0] + (i / count) * (pSpan[1] - pSpan[0]);
          const scope = { p, t, s: 1, q };
          const rawX = fx.evaluate(scope);
          const rawY = fy.evaluate(scope);
          const x = typeof rawX === 'number' ? rawX : rawX?.re ?? 0;
          const y = typeof rawY === 'number' ? rawY : rawY?.re ?? 0;
          if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('non-finite sample');
          xs.push(x);
          ys.push(y);
          extent = Math.max(extent, Math.abs(x), Math.abs(y));
        }
        slices.push({ xs, ys });
      }

      const scale = (THUMB_SIZE / 2 - 8) / extent;
      ctx.clearRect(0, 0, THUMB_SIZE, THUMB_SIZE);
      ctx.fillStyle = '#0b0e17';
      ctx.fillRect(0, 0, THUMB_SIZE, THUMB_SIZE);

      const gradient = ctx.createLinearGradient(0, 0, THUMB_SIZE, THUMB_SIZE);
      gradient.addColorStop(0, '#818cf8');
      gradient.addColorStop(1, '#22d3ee');
      ctx.strokeStyle = gradient;
      ctx.lineWidth = formula.parametric ? 1.1 : 1.6;
      ctx.lineJoin = 'round';

      slices.forEach((slice, index) => {
        ctx.globalAlpha = formula.parametric ? 0.3 + (index / Math.max(1, slices.length - 1)) * 0.65 : 1;
        ctx.beginPath();
        for (let i = 0; i <= count; i++) {
          const px = THUMB_SIZE / 2 + slice.xs[i] * scale;
          const py = THUMB_SIZE / 2 - slice.ys[i] * scale;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
      dataUrl = ctx.canvas.toDataURL('image/png');
    } catch {
      dataUrl = '';
    }
  }

  formulaCache.set(formula.id, dataUrl);
  return dataUrl;
}

type ShaderGL = {
  gl: WebGLRenderingContext;
  quad: WebGLBuffer;
};

let shaderGL: ShaderGL | null | undefined;

// The quad fakes a sphere patch: normals curve toward the edges so
// fresnel/normal-driven shaders (most of the authored library) render their
// actual character instead of a flat facing-only color.
const THUMB_VERTEX_SHADER = `
attribute vec2 aPos;
varying vec2 vUv;
varying vec3 vPosition;
varying vec3 vNormal;
varying vec3 vViewPosition;
void main() {
  vUv = aPos * 0.5 + 0.5;
  vec2 centered = aPos;
  float r2 = clamp(dot(centered, centered), 0.0, 1.0);
  float nz = sqrt(1.0 - r2 * 0.82);
  vNormal = normalize(vec3(centered * 0.9, nz));
  vPosition = vec3(aPos * 6.0, nz * 2.4);
  vViewPosition = vec3(-aPos * 1.4, 3.2);
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

function getShaderGL(): ShaderGL | null {
  if (shaderGL === undefined) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = THUMB_SIZE;
      canvas.height = THUMB_SIZE;
      // WebGL2 to match the app renderer (ES 1.00 shaders get core fwidth etc).
      const gl = (canvas.getContext('webgl2', { preserveDrawingBuffer: true })
        ?? canvas.getContext('webgl', { preserveDrawingBuffer: true })) as WebGLRenderingContext | null;
      if (!gl) {
        shaderGL = null;
      } else {
        const quad = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        shaderGL = { gl, quad };
      }
    } catch {
      shaderGL = null;
    }
  }
  return shaderGL ?? null;
}

function compileStage(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function shaderThumbnail(preset: ShaderPreset): string {
  const cached = shaderCache.get(preset.id);
  if (cached !== undefined) return cached;

  let dataUrl = '';
  const context = getShaderGL();
  if (context) {
    const { gl, quad } = context;
    const vertex = compileStage(gl, gl.VERTEX_SHADER, THUMB_VERTEX_SHADER);
    const fragment = compileStage(gl, gl.FRAGMENT_SHADER, `precision highp float;\n${preset.fragmentShader}`);

    if (vertex && fragment) {
      const program = gl.createProgram();
      if (program) {
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
          gl.useProgram(program);
          const posLocation = gl.getAttribLocation(program, 'aPos');
          gl.bindBuffer(gl.ARRAY_BUFFER, quad);
          gl.enableVertexAttribArray(posLocation);
          gl.vertexAttribPointer(posLocation, 2, gl.FLOAT, false, 0, 0);
          const timeLocation = gl.getUniformLocation(program, 'time');
          if (timeLocation) gl.uniform1f(timeLocation, 2.0);
          gl.viewport(0, 0, THUMB_SIZE, THUMB_SIZE);
          gl.clearColor(0.03, 0.04, 0.08, 1);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          dataUrl = (gl.canvas as HTMLCanvasElement).toDataURL('image/png');
        }
        gl.deleteProgram(program);
      }
    }
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
  }

  shaderCache.set(preset.id, dataUrl);
  return dataUrl;
}
