// ElectroBeats — entry point (Phase 2)

import './ui/styles.css';
import { state } from './state.js';
import { initTransport, disposeTestSynth } from './audio/transport.js';
import { initDrums, onDrumStep } from './audio/drums.js';
import { renderControls } from './ui/controls.js';
import { createGrid } from './ui/grid.js';

const app = document.getElementById('app');

// 1. Audio
initTransport();
disposeTestSynth(); // test beep no longer needed
initDrums();

// 2. Transport controls
renderControls(app);

// 3. Drum machine section
const drumSection = document.createElement('section');
drumSection.className = 'drum-section';

const drumTitle = document.createElement('h2');
drumTitle.className = 'section-title';
drumTitle.textContent = '🥁 Drum Machine';
drumSection.appendChild(drumTitle);

const tracks = [
  { name: 'Kick',  key: 'kick'  },
  { name: 'Snare', key: 'snare' },
  { name: 'Hat',   key: 'hat'   },
  { name: 'Clap',  key: 'clap'  },
];

const grids = tracks.map(({ name, key }) => {
  const grid = createGrid({
    trackName: name,
    steps:     state.drums[key],
    onToggle:  () => {}, // state already mutated in grid.js
  });
  drumSection.appendChild(grid.el);
  return grid;
});

app.appendChild(drumSection);

// 4. Wire playhead: drum sequence notifies all grids each step
onDrumStep(step => grids.forEach(g => g.setStep(step)));
