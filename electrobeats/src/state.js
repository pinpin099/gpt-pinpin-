// ElectroBeats — shared state
// Phase 6 will add save/load and URL encoding here.

export const state = {
  bpm: 120,
  drums: {
    kick:  Array(16).fill(false),
    snare: Array(16).fill(false),
    hat:   Array(16).fill(false),
    clap:  Array(16).fill(false),
  },
  // each step = note string ("A3") or null
  synth: Array(16).fill(null),
  fx: { filter: 8000, delay: 0.2, reverb: 0.3 },
};
