# Bee / Ant Living Ecosystem Simulation

A fullscreen ambient **generative art simulation**: two colonies (bees and ants) self-organize, compete for resources, form war fronts, recover, and repeat in emergent cycles.

## Run (GitHub Pages)

This repo is static and uses `index.html` as entrypoint, so it works on GitHub Pages from `main` / root.

After enabling Pages, open:

`https://<your-username>.github.io/gpt-pinpin-/`

## Run locally

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

Then open:

`http://127.0.0.1:8000`

## Optional gentle influence

- Left click: drop food.
- Right click: add temporary disturbance.

The simulation is fully autoplay and should remain interesting with no input.

## What to watch

- Pheromone painting: food/alarm/war trails appear, diffuse, and decay.
- Strategy shifts in each colony: scout → forage → defend → war wave → retreat/rebuild.
- Emergent battle fronts in contested zones.
- Calm vs tension rhythm guided by the invisible ambient director (anti-stall and soft rebalancing).
