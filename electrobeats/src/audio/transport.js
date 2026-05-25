// ElectroBeats — Transport (Phase 1)
// ONE Tone.Transport is the clock. Never use setInterval.
// AudioContext MUST start inside a user gesture via Tone.start().

import * as Tone from 'tone';
import { state } from '../state.js';

let testSynth = null;
let testSeq   = null;

/** Call once on app boot to configure the transport. */
export function initTransport() {
  Tone.getTransport().bpm.value = state.bpm;
  Tone.getTransport().loop      = true;
  Tone.getTransport().loopEnd   = '1m'; // 1 bar = 16 sixteenth-notes

  // Temporary test synth — proves the clock works. Removed in Phase 2+.
  testSynth = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope:   { attack: 0.01, decay: 0.1, sustain: 0, release: 0.1 },
    volume:     -18,
  }).toDestination();

  testSeq = new Tone.Sequence(
    (time, step) => {
      // Only beep on beat 0 (quarter-note pulse to confirm clock)
      if (step % 4 === 0) {
        testSynth.triggerAttackRelease('C5', '16n', time);
      }
    },
    [...Array(16).keys()], // [0,1,2,...,15]
    '16n',
  );
  testSeq.start(0);
}

/** Remove the test beep once real instruments are wired in Phase 2. */
export function disposeTestSynth() {
  testSeq?.stop().dispose();
  testSynth?.dispose();
  testSeq = testSynth = null;
}

/**
 * Toggle play / stop.
 * MUST be called from inside a user-gesture handler so AudioContext can start.
 * Returns the new playing state (boolean).
 */
export async function toggleTransport() {
  await Tone.start(); // unlock AudioContext — safe to call repeatedly
  const t = Tone.getTransport();
  if (t.state === 'started') {
    t.stop();
    return false;
  } else {
    t.start();
    return true;
  }
}

/** Update BPM from slider. */
export function setBpm(bpm) {
  state.bpm = bpm;
  Tone.getTransport().bpm.value = bpm;
}
