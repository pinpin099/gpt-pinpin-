import { createSimulation } from "./sim.js";

const canvas = document.getElementById("canvas");
const hud = document.getElementById("hud");
const ctx = canvas.getContext("2d", { alpha: false });

const sim = createSimulation(canvas, hud);

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  sim.resize(window.innerWidth, window.innerHeight);
}

window.addEventListener("resize", resize);
window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "d") sim.toggleDebug();
});

resize();

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  sim.step(dt);
  sim.render(ctx, window.innerWidth, window.innerHeight, dt);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
