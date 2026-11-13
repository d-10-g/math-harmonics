import * as THREE from 'three';

export type CatPoseSample = {
  time: number;
  phase: number;
  weight: number;
  seed: number;
  movement?: string;
  strength?: number;
};
export type CatPoseLayer = {
  /** Remove our previous layer before sampling a clip; true restores bind pose for a new mixer. */
  reset: (toRest?: boolean) => void;
  /** Layer a relaxed stance and coordinated feline gestures over that clip. */
  apply: (sample: CatPoseSample) => void;
};
const NAMES = ['root', 'spine', 'head', 'jaw', 'front_L', 'front_R', 'paw_front_L', 'paw_front_R',
  'back_L', 'back_R', 'paw_back_L', 'paw_back_R', 'ear_L', 'ear_R', 'eye_L', 'eye_R',
  'tail_0', 'tail_1', 'tail_2', 'tail_3'] as const;
type CatBoneName = typeof NAMES[number];
type RestBone = { bone: THREE.Bone; q: THREE.Quaternion; p: THREE.Vector3; s: THREE.Vector3;
  sampledQ: THREE.Quaternion; sampledP: THREE.Vector3; sampledS: THREE.Vector3 };

// These offsets are in the exported FK bones' LOCAL axes. In particular a
// positive tail X lifts the tail, then curls its end forward over the back.
// Recognize both the owning rig and the complete skeleton: unrelated imported
// GLBs, even ones with a bone called "head", keep their own authored behavior.
export function createCatPoseLayer(model: THREE.Object3D): CatPoseLayer | null {
  let recognized = false;
  const found = new Map<string, THREE.Bone>();
  model.traverse(object => {
    if (/^(Ernie|Kira)_Rig$/.test(object.name)) recognized = true;
    if ((object as THREE.Bone).isBone) found.set(object.name, object as THREE.Bone);
  });
  if (!recognized || NAMES.some(name => !found.has(name))) return null;
  const rest = new Map<CatBoneName, RestBone>(NAMES.map(name => {
    const bone = found.get(name)!;
    return [name, { bone, q: bone.quaternion.clone(), p: bone.position.clone(), s: bone.scale.clone(),
      sampledQ: bone.quaternion.clone(), sampledP: bone.position.clone(), sampledS: bone.scale.clone() }];
  }));
  const delta = new THREE.Quaternion(), turn = new THREE.Quaternion(), euler = new THREE.Euler();
  const rotate = (name: CatBoneName, x: number, y = 0, z = 0) => {
    euler.set(x, y, z); turn.setFromEuler(euler); rest.get(name)!.bone.quaternion.multiply(turn);
  };
  return {
    reset(toRest = false) {
      for (const { bone, q, p, s, sampledQ, sampledP, sampledS } of rest.values()) {
        bone.quaternion.copy(toRest ? q : sampledQ);
        bone.position.copy(toRest ? p : sampledP); bone.scale.copy(toRest ? s : sampledS);
        if (toRest) { sampledQ.copy(q); sampledP.copy(p); sampledS.copy(s); }
      }
    },
    apply({ time, phase, weight, seed, movement = '', strength = 2 }) {
      // PropertyMixer skips writes for unchanged values. Restore the last
      // AUTHORED sample next frame, rather than resetting to bind pose and
      // accidentally erasing channels the mixer has decided are unchanged.
      for (const { bone, sampledQ, sampledP, sampledS } of rest.values()) {
        sampledQ.copy(bone.quaternion); sampledP.copy(bone.position); sampledS.copy(bone.scale);
      }
      const t = Number.isFinite(time) ? Math.max(0, time) : 0;
      const w = THREE.MathUtils.clamp(Number.isFinite(weight) ? weight : 0, 0, 1);
      const gain = THREE.MathUtils.clamp(Number.isFinite(strength) ? strength : 2, .5, 3);
      const identity = Number.isFinite(seed) ? seed : 0;
      const side = Math.sin(identity * 1.618 + .4) >= 0 ? 1 : -1;
      const offset = identity * .73;
      const breathe = Math.sin(t * 2.1 + offset);
      const swish = Math.sin(t * 1.6 + offset);
      const pulse = Math.sin(Math.PI * THREE.MathUtils.clamp(phase, 0, 1)) ** 2 * w;
      const accent = pulse * (.55 + gain * .225);
      const name = movement.toLowerCase().replaceAll('_', ' ');
      const paw = /paw|knead|bat|reach|tap|lift/.test(name);
      const groom = /groom/.test(name);
      const tail = /tail/.test(name);
      const sleepy = /blink|wink|drowsy|goodnight/.test(name);
      const ears = /ear|listen/.test(name);
      const left = /left/.test(name) ? 1 : /right/.test(name) ? -1 : side;
      // Amplify angular clip motion, with anatomical bounds per control. The
      // clip's eye compression remains intact; scales and positions aren't
      // extrapolated into negative eyes or stretched limbs.
      for (const [boneName, { bone, q }] of rest) {
        delta.copy(q).invert().multiply(bone.quaternion).normalize();
        if (delta.w < 0) delta.set(-delta.x, -delta.y, -delta.z, -delta.w);
        const angle = 2 * Math.acos(THREE.MathUtils.clamp(delta.w, -1, 1));
        const limit = boneName === 'spine' ? .19 : boneName === 'head' ? .65
          : boneName.startsWith('ear') ? .65 : boneName === 'jaw' ? .38
            : boneName.startsWith('tail') ? .75 : .9;
        const amplification = angle > 1e-8 ? Math.min(gain, limit / angle) : 1;
        turn.identity().slerp(delta, amplification);
        bone.quaternion.copy(q).multiply(turn);
      }
      // A soft, asymmetric weight shift replaces the perfectly square export
      // stance. Front toes fold gently and the head listens at a slight tilt.
      rotate('spine', .025 + .009 * breathe, .012 * side, .018 * side);
      rotate('head', -.055 + .018 * breathe + (sleepy ? .10 : -.09) * accent,
        .075 * side + .08 * swish * w, .045 * side + .055 * accent * left);
      rotate('front_L', -.12 - .045 * side, 0, -.025);
      rotate('front_R', -.12 + .045 * side, 0, .025);
      rotate('paw_front_L', .17 + .035 * side);
      rotate('paw_front_R', .17 - .035 * side);
      rotate('back_L', .09 + .025 * side);
      rotate('back_R', .09 - .025 * side);
      rotate('paw_back_L', -.075); rotate('paw_back_R', -.075);
      // Four distinct bends give a raised question-mark silhouette at rest,
      // rather than a rigid horizontal pole. Motion propagates to the tip.
      for (let i = 0; i < 4; i++) {
        const wave = Math.sin(t * 2.2 + offset - i * .65);
        const curl = [.65, .28, .42, .48][i];
        rotate(`tail_${i}` as CatBoneName, curl + .04 * breathe + (tail ? .08 : .025) * accent,
          .015 * side, (.045 + .045 * w) * wave + .025 * side + (tail ? .10 : .035) * accent * left);
      }
      rotate('ear_L', .025 + .055 * accent, 0, -.055 - (ears ? .10 : .035) * accent * left);
      rotate('ear_R', .025 + .045 * accent, 0, .055 - (ears ? .10 : .035) * accent * left);
      // A lifted paw carries its toes; the opposite paw takes the weight.
      // Quiet gestures keep a small kneading accompaniment, so even isolated
      // ear/eye clips read as a coordinated animal rather than a single knob.
      const lead = left > 0 ? 'L' : 'R', support = left > 0 ? 'R' : 'L';
      const lift = (groom ? .24 : paw ? .17 : .055) * accent;
      rotate(`front_${lead}` as CatBoneName, -lift, 0, (groom ? .04 : .02) * left * accent);
      rotate(`paw_front_${lead}` as CatBoneName, lift * .8);
      rotate(`front_${support}` as CatBoneName, -.025 * accent);
      rotate('spine', 0, 0, -.02 * left * accent);
      if (groom) rotate('head', .12 * accent, .08 * left * accent);
      // Slow blinks occasionally soften the stare. Absolute score time means
      // paused playback is still, and seeking reproduces exactly the same cat.
      const blinkPhase = ((t + identity * .37) % 5.7 + 5.7) % 5.7;
      const blink = blinkPhase < .24 ? Math.sin(Math.PI * blinkPhase / .24) ** 2 : 0;
      for (const eye of ['eye_L', 'eye_R'] as const) {
        const state = rest.get(eye)!;
        state.bone.scale.z *= 1 - .87 * blink;
      }
    },
  };
}
