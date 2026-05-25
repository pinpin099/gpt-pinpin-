// ElectroBeats — Drum voices + sequence (Phase 2)
// 4 synthesized tracks: kick, snare, hi-hat, clap. No samples.
// ONE Tone.Sequence reads state.drums on every 16th-note step.

import * as Tone from 'tone';
import { state } from '../state.js';

// Will be set in initDrums() after the FX chain exists (Phase 4).
// For now, drums go straight to Destination.
let destination = null;

const voices = {};
let drumSeq   = null;

// ── Drum synth recipes ────────────────────────────────────────────────────────

function makeKick() {
  return new Tone.MembraneSynth({
    pitchDecay:  0.05,
    octaves:     8,
    envelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.1 },
    volume: -6,
  });
}

function makeSnare() {
  return new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.05 },
    volume: -10,
  });
}

function makeHat() {
  return new Tone.MetalSynth({
    frequency:   400,
    envelope:    { attack: 0.001, decay: 0.08, release: 0.01 },
    harmonicity: 5.1,
    modulationIndex: 32,
    resonance:   4000,
    octaves:     1.5,
    volume:      -18,
  });
}

function makeClap() {
  return new Tone.NoiseSynth({
    noise: { type: 'pink' },
    envelope: { attack: 0.005, decay: 0.12, sustain: 0, release: 0.05 },
    volume: -14,
  });
}

// ── Init / dispose ────────────────────────────────────────────────────────────

export function initDrums(dest = Tone.getDestination()) {
  destination = dest;

  // Dispose any existing voices before recreating
  disposeDrums();

  voices.kick  = makeKick().connect(destination);
  voices.snare = makeSnare().connect(destination);
  voices.hat   = makeHat().connect(destination);
  voices.clap  = makeClap().connect(destination);

  // Sequence fires every 16th note; reads current grid state each step
  drumSeq = new Tone.Sequence(
    (time, step) => {
      if (state.drums.kick[step])  voices.kick.triggerAttackRelease('C1', '8n', time);
      if (state.drums.snare[step]) voices.snare.triggerAttackRelease('8n', time);
      if (state.drums.hat[step])   voices.hat.triggerAttackRelease('16n', time);
      if (state.drums.clap[step])  voices.clap.triggerAttackRelease('8n', time);

      // Notify UI to highlight the current step
      notifyStep(step);
    },
    [...Array(16).keys()],
    '16n',
  );
  drumSeq.start(0);
}

export function disposeDrums() {
  drumSeq?.stop().dispose();
  Object.values(voices).forEach(v => v?.dispose());
  for (const k in voices) delete voices[k];
  drumSeq = null;
}

// ── Step-highlight callback ───────────────────────────────────────────────────
// grid.js subscribes to this so it can move the playhead.

const stepListeners = new Set();

export function onDrumStep(fn) { stepListeners.add(fn); }
export function offDrumStep(fn) { stepListeners.delete(fn); }

function notifyStep(step) {
  // Tone.js callbacks run in the audio thread — schedule DOM work on next frame
  Tone.getDraw().schedule(() => {
    stepListeners.forEach(fn => fn(step));
  }, Tone.now());
}
