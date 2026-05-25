// ElectroBeats — Transport controls (Phase 1)
// Play/Stop button + BPM slider.

import { toggleTransport, setBpm } from '../audio/transport.js';
import { state } from '../state.js';

export function renderControls(container) {
  const el = document.createElement('div');
  el.className = 'controls';
  el.innerHTML = `
    <h1 class="logo">⚡ ElectroBeats</h1>
    <div class="transport-row">
      <button id="btn-play" class="btn-play" aria-label="Play">▶ Play</button>
      <label class="bpm-label">
        BPM
        <input id="slider-bpm" type="range" min="60" max="200" step="1" value="${state.bpm}" />
        <span id="bpm-display">${state.bpm}</span>
      </label>
    </div>
    <p class="hint">Press Play — you should hear a beep on every beat (clock test).</p>
  `;
  container.appendChild(el);

  // --- Play / Stop ---
  const btnPlay = el.querySelector('#btn-play');
  btnPlay.addEventListener('click', async () => {
    const playing = await toggleTransport();
    btnPlay.textContent = playing ? '⏹ Stop' : '▶ Play';
    btnPlay.classList.toggle('active', playing);
  });

  // --- BPM slider ---
  const sliderBpm   = el.querySelector('#slider-bpm');
  const bpmDisplay  = el.querySelector('#bpm-display');
  sliderBpm.addEventListener('input', () => {
    const bpm = Number(sliderBpm.value);
    bpmDisplay.textContent = bpm;
    setBpm(bpm);
  });
}
