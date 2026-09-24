import assert from "node:assert/strict";
import { Window } from "happy-dom";
import {
  readSpatialMenus,
  setMenuValue,
  stepMenuValue,
} from "../src/lib/spatialMenu";

const window = new Window();
for (const name of [
  "HTMLButtonElement",
  "HTMLInputElement",
  "HTMLTextAreaElement",
  "HTMLSelectElement",
  "HTMLMediaElement",
  "HTMLAudioElement",
  "HTMLVideoElement",
  "HTMLOptGroupElement",
  "Event",
]) {
  (globalThis as any)[name] = (window as any)[name];
}
const document = window.document;
document.body.innerHTML = `
  <button>Outside the menus</button>
  <aside data-spatial-menu="Controls" class="hidden">
    <div><h2>Output</h2><label>Speed<input type="range" min="0" max="5" step="0.1" value="0.1"></label>
      <button aria-label="Wireframe" aria-pressed="true"></button><button disabled>Unavailable</button>
      <div class="hidden"><button>Silent-only hidden control</button></div>
      <button data-spatial-skip>Collapse</button>
      <label>Load MIDI<input class="hidden" type="file"></label>
      <div data-spatial-section="Models"><label>Channel<select aria-label="Channel 1 model"><option value="random">Random</option><option value="cat">Cat</option><optgroup disabled><option value="missing">Missing</option></optgroup></select></label></div>
      <label>Formula<textarea>sin(p)</textarea></label><div role="alert">Invalid formula</div>
    </div>
  </aside>`;
const read = () => readSpatialMenus(document as unknown as Document);
const item = (label: string) =>
  read()
    .flatMap((section) => section.items)
    .find((item) => item.label === label)!;
assert.deepEqual(
  read().map((section) => section.label),
  ["Controls · Output", "Controls · Models"],
);
assert.equal(item("Outside the menus"), undefined);
assert.equal(item("Silent-only hidden control"), undefined);
assert.equal(item("Collapse"), undefined);
assert.equal(
  item("Load MIDI").kind,
  "file",
  "Hidden file inputs remain available through their labels",
);
assert.equal(item("Unavailable").disabled, true);
assert.equal(item("Wireframe").active, true);
assert.equal(item("Channel 1 model").options[2].disabled, true);
assert.deepEqual(read()[0].messages, ["Invalid formula"]);
const id = item("Speed").id;
let inputs = 0,
  changes = 0;
item("Speed").element.addEventListener("input", () => inputs++);
item("Speed").element.addEventListener("change", () => changes++);
stepMenuValue(item("Speed"), -1);
assert.equal(
  item("Speed").value,
  "0",
  "XR can reach the desktop minimum, including zero",
);
stepMenuValue(item("Speed"), -1);
assert.equal(item("Speed").value, "0");
setMenuValue(item("Speed"), "100");
assert.equal(item("Speed").value, "5");
setMenuValue(item("Speed"), "NaN");
assert.equal(item("Speed").value, "5");
assert.equal(inputs, 3);
assert.equal(changes, 3);
assert.equal(item("Speed").id, id, "Polling preserves control identity");
setMenuValue(item("Formula"), "cos(p)\n+ sin(t)");
assert.equal(item("Formula").value, "cos(p)\n+ sin(t)");
setMenuValue(item("Channel 1 model"), "cat");
assert.equal(item("Channel 1 model").value, "cat");
const detached = item("Formula");
detached.element.remove();
setMenuValue(detached, "ignored");
assert.equal(
  (detached.element as HTMLTextAreaElement).value,
  "cos(p)\n+ sin(t)",
  "Stale editors cannot update unmounted controls",
);
console.log(
  "PASS: menu scope, hidden controls, file inputs, names, selected/disabled state, model choices, alerts, exact numeric bounds, events, stable identities, editors and detached controls.",
);
await window.happyDOM.close();
