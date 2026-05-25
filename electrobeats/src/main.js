// ElectroBeats — entry point (Phase 1)

import './ui/styles.css';
import { initTransport } from './audio/transport.js';
import { renderControls } from './ui/controls.js';

const app = document.getElementById('app');

// 1. Wire up audio (transport configured, test beep ready)
initTransport();

// 2. Render UI
renderControls(app);
