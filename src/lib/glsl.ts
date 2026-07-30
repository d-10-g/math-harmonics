// Standalone GLSL fragment-shader validation for the editor. Compiles the
// source in a throwaway WebGL context so syntax errors and undeclared
// identifiers surface inline instead of dying silently in the console.

let sharedGL: WebGLRenderingContext | null | undefined;

function getValidationGL(): WebGLRenderingContext | null {
  if (sharedGL === undefined) {
    try {
      sharedGL = document.createElement('canvas').getContext('webgl');
    } catch {
      sharedGL = null;
    }
  }
  return sharedGL;
}

// three.js injects a precision line when it wraps ShaderMaterial sources;
// replicate that so bare preset sources compile the same way here.
const PROLOGUE = 'precision highp float;\n';

export function glslFragmentError(source: string): string | null {
  const gl = getValidationGL();
  if (!gl) return null;

  const shader = gl.createShader(gl.FRAGMENT_SHADER);
  if (!shader) return null;

  gl.shaderSource(shader, PROLOGUE + source);
  gl.compileShader(shader);
  let log: string | null = null;

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    log = gl.getShaderInfoLog(shader) || 'Fragment shader failed to compile';
    // Re-map line numbers to the user's source (offset by the prologue line)
    // and drop the null terminator some drivers append.
    log = log
      .replace(/ERROR: 0:(\d+)/g, (_match, line: string) => `Line ${Math.max(1, parseInt(line, 10) - 1)}`)
      .replace(/\u0000/g, '')
      .trim();
  }

  gl.deleteShader(shader);
  return log;
}
