# ElectroBeats
Browser music maker: drum machine + scale-locked melodic synth. Tone.js + Vite, vanilla JS.
Project lives in `electrobeats/`. Run dev server from that directory: `npm run dev`.

## Rules
- Audio: ONE Tone.Transport is the clock. Schedule everything with Tone.Sequence. Never use setInterval for timing.
- AudioContext starts only on user gesture: `await Tone.start()` inside the Play handler.
- All song data lives in the single `state` object (src/state.js). UI reads/writes state; audio reads state.
- Drums are synthesized (no samples). Synth notes are always picked from an in-scale array.
- Dispose Tone nodes before recreating them (`.dispose()`).
- Keep it client-side only. No backend, no build-time secrets.

## Key Tone.js gotchas
1. No sound until a click → `await Tone.start()` must run inside a user gesture (the Play button).
2. Timing drift → never `setInterval`; only `Tone.Sequence` / `Tone.Transport.schedule`.
3. Reverb silent → call `await reverb.generate()` before connecting.
4. Mobile → audio needs a tap to unlock; make tap targets large.

## Drum synth recipes
- Kick: `Tone.MembraneSynth`
- Snare: `Tone.NoiseSynth` with short envelope
- Hi-hat: `Tone.MetalSynth` with short decay
- Clap: `Tone.NoiseSynth` with different envelope

## Deploy
GitHub Pages. `base` in `electrobeats/vite.config.js` MUST equal the repo name: `/gpt-pinpin-/`.
Build: `cd electrobeats && npm run build`. Deploy the `dist/` folder.
