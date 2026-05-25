// ElectroBeats — Reusable 16-step grid (Phase 2)
// Used for both the drum machine and the melodic synth (Phase 3).
//
// Options:
//   trackName  — label shown on the left (e.g. "Kick")
//   steps      — the backing array (boolean[] for drums, string|null[] for synth)
//   onToggle   — callback(stepIndex, newValue) when a cell is clicked
//   rowLabel   — optional string shown instead of trackName (for synth rows)

export function createGrid({ trackName, steps, onToggle }) {
  const row = document.createElement('div');
  row.className = 'grid-row';
  row.dataset.track = trackName;

  // Track label
  const label = document.createElement('span');
  label.className = 'grid-label';
  label.textContent = trackName;
  row.appendChild(label);

  // 16 cells
  const cells = [];
  for (let i = 0; i < 16; i++) {
    const cell = document.createElement('button');
    cell.className = 'grid-cell';
    cell.dataset.step = i;
    if (steps[i]) cell.classList.add('on');
    // Visual group separator every 4 steps
    if (i % 4 === 0) cell.classList.add('beat-start');

    cell.addEventListener('click', () => {
      const newVal = !steps[i];
      steps[i] = newVal;
      cell.classList.toggle('on', newVal);
      onToggle?.(i, newVal);
    });

    row.appendChild(cell);
    cells.push(cell);
  }

  // API: move playhead highlight
  function setStep(step) {
    cells.forEach((c, i) => c.classList.toggle('playing', i === step));
  }

  // API: refresh cell visuals from state (used by Randomize in Phase 5)
  function refresh() {
    cells.forEach((c, i) => c.classList.toggle('on', Boolean(steps[i])));
  }

  return { el: row, setStep, refresh };
}
