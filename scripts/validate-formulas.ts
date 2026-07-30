// Validates that every preset formula compiles under mathjs and evaluates to
// finite numbers across the sampled (p, t) domain. Run: npm run validate
import { compile } from 'mathjs';
import { PRESET_FORMULAS } from '../src/constants';

const T_SAMPLES = [0, 0.7, 6.0, 12.5];
let failures = 0;

// Sample a range inclusively at its edges (with a small inset so open-interval
// singularities right at the boundary don't false-positive) plus interior points.
function sampleRange([min, max]: [number, number], count: number): number[] {
  const inset = (max - min) * 0.002;
  return Array.from({ length: count }, (_, i) => min + inset + ((max - min - 2 * inset) * i) / (count - 1));
}

for (const formula of PRESET_FORMULAS) {
  const pSamples = sampleRange(formula.pRange ?? [0.001, Math.PI * 8], 5);
  const qSamples = formula.parametric ? sampleRange(formula.qRange ?? [0, Math.PI * 2], 4) : [0];
  const axes = [
    ['x', formula.x],
    ['y', formula.y],
    ['z', formula.z ?? 'sin(2 * p + t) * 4']
  ] as const;

  for (const [axis, expression] of axes) {
    try {
      const compiled = compile(expression);
      for (const p of pSamples) {
        for (const q of qSamples) {
          for (const t of T_SAMPLES) {
            const value = compiled.evaluate({ p, t, s: 1, q });
            const numeric = typeof value === 'number' ? value : value?.re;
            if (typeof numeric !== 'number' || !Number.isFinite(numeric)) {
              console.log(`NON-FINITE ${formula.id} (${formula.name}) ${axis} at p=${p.toFixed(2)} q=${q.toFixed(2)} t=${t}: ${numeric}`);
              failures++;
            }
          }
        }
      }
    } catch (error: any) {
      console.log(`COMPILE FAIL ${formula.id} (${formula.name}) ${axis}: ${error.message}`);
      failures++;
    }
  }
}

console.log(failures === 0 ? `ALL ${PRESET_FORMULAS.length} FORMULAS VALID` : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
