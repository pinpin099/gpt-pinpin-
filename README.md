# Bees vs Ants — Living Painting Screensaver

A pure HTML/CSS/JS generative artwork built with Canvas 2D.

Two autonomous colonies (bees and ants) forage, adapt, and raid using pheromone fields and simple state-driven swarm behavior.

## Files

- `index.html`
- `style.css`
- `main.js`
- `sim.js`
- `fields.js`

## Run

### Static host (GitHub Pages / Replit)
Just open `index.html` as the site entrypoint.

### Local

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8000`.

## What to watch

- Continuous day/night mood cycle that changes colony behavior.
- Pheromone painting: diffusion + evaporation trails.
- Emergent raid waves and danger fronts around nests.
- Rare swarm surges and long-interval poetic reset.

## Optional debug

Press `D` to toggle field debug overlay.
