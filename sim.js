import { Field } from "./fields.js";

const TAU = Math.PI * 2;

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function norm(x, y) {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
}

function createAgent(colony, world) {
  const t = Math.random() * TAU;
  const r = rand(0, colony.nestRadius * 0.8);
  return {
    x: colony.nestX + Math.cos(t) * r,
    y: colony.nestY + Math.sin(t) * r,
    vx: rand(-1, 1),
    vy: rand(-1, 1),
    state: "SCOUT",
    energy: rand(0.7, 1.4),
    carrying: 0,
    heading: rand(0, TAU),
    targetPatch: -1,
    world,
  };
}

export function createSimulation(canvas, hud) {
  const world = {
    width: 2200,
    height: 2200,
    time: 0,
    cycleSec: 240,
    foodPatches: [],
    motes: [],
    swarmBoost: 0,
    resetFade: 0,
    nextSwarmAt: rand(130, 220),
    nextResetAt: 1200,
    camera: { x: 1100, y: 1100, zoom: 0.38, driftA: 0 },
    debug: false,
  };

  const fields = {
    beeTrail: new Field(256, 256),
    antTrail: new Field(256, 256),
    beeDanger: new Field(256, 256),
    antDanger: new Field(256, 256),
  };

  const bees = {
    name: "Bees",
    team: "bee",
    color: [255, 196, 88],
    glow: [255, 160, 72],
    nestX: 520,
    nestY: 1100,
    nestRadius: 62,
    foodStock: 120,
    aggression: 0.34,
    agents: [],
    raidCooldown: 0,
  };

  const ants = {
    name: "Ants",
    team: "ant",
    color: [176, 56, 84],
    glow: [130, 22, 44],
    nestX: 1680,
    nestY: 1120,
    nestRadius: 62,
    foodStock: 120,
    aggression: 0.34,
    agents: [],
    raidCooldown: 0,
  };

  const colonies = [bees, ants];
  bees.enemy = ants;
  ants.enemy = bees;

  function reseedFood() {
    world.foodPatches.length = 0;
    for (let i = 0; i < 40; i++) {
      const edgeBias = i % 6 === 0 ? 0.5 : 1;
      world.foodPatches.push({
        x: rand(120, world.width - 120),
        y: rand(120, world.height - 120),
        r: rand(26, 52) * edgeBias,
        stock: rand(40, 120),
        regen: rand(3.5, 8.5),
      });
    }
  }

  function spawnInitialAgents() {
    bees.agents = Array.from({ length: 260 }, () => createAgent(bees, world));
    ants.agents = Array.from({ length: 260 }, () => createAgent(ants, world));
  }

  function initMotes() {
    world.motes = Array.from({ length: 240 }, () => ({
      x: rand(0, world.width),
      y: rand(0, world.height),
      vx: rand(-0.08, 0.08),
      vy: rand(-0.08, 0.08),
      hue: Math.random() < 0.5 ? 42 : 350,
      life: rand(3, 14),
    }));
  }

  function sampleForward(field, agent, offsetA, dist) {
    const a = agent.heading + offsetA;
    const x = agent.x + Math.cos(a) * dist;
    const y = agent.y + Math.sin(a) * dist;
    return field.sampleWorld(x, y, world.width, world.height);
  }

  function chooseState(agent, colony, dayN) {
    const homeDx = colony.nestX - agent.x;
    const homeDy = colony.nestY - agent.y;
    const homeD = Math.hypot(homeDx, homeDy);

    if (agent.carrying > 0.75 || agent.energy < 0.18) {
      agent.state = "RETURN";
      return;
    }

    const raidPressure = colony.foodStock > 210 ? 0.24 : 0;
    const raidChance = colony.aggression * (0.004 + raidPressure) * (0.6 + dayN * 0.8);

    if (colony.raidCooldown <= 0 && Math.random() < raidChance) {
      agent.state = "RAID";
      colony.raidCooldown = rand(14, 26);
      return;
    }

    if (homeD < colony.nestRadius * 2.2 && Math.random() < 0.38) {
      agent.state = "SCOUT";
      return;
    }

    if (Math.random() < 0.56) agent.state = "HARVEST";
    else agent.state = "SCOUT";
  }

  function handleFood(agent, colony) {
    let nearest = null;
    let nearestD = Infinity;

    for (let i = 0; i < world.foodPatches.length; i++) {
      const p = world.foodPatches[i];
      if (p.stock <= 2) continue;
      const dx = p.x - agent.x;
      const dy = p.y - agent.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < nearestD) {
        nearestD = d2;
        nearest = p;
        agent.targetPatch = i;
      }
    }

    if (!nearest) return;

    const dx = nearest.x - agent.x;
    const dy = nearest.y - agent.y;
    const d = Math.hypot(dx, dy);

    if (d < nearest.r + 8) {
      const take = Math.min(nearest.stock, rand(0.36, 0.82));
      nearest.stock -= take;
      agent.carrying += take * 0.022;
      agent.state = "RETURN";
    } else {
      const [nx, ny] = norm(dx, dy);
      agent.vx += nx * 0.1;
      agent.vy += ny * 0.1;
    }
  }

  function updateAgent(agent, colony, dt, dayN) {
    const enemy = colony.enemy;
    const trail = colony.team === "bee" ? fields.beeTrail : fields.antTrail;
    const ownDanger = colony.team === "bee" ? fields.beeDanger : fields.antDanger;
    const enemyTrail = colony.team === "bee" ? fields.antTrail : fields.beeTrail;
    const enemyDanger = colony.team === "bee" ? fields.antDanger : fields.beeDanger;

    if (Math.random() < 0.028) chooseState(agent, colony, dayN);

    const sniffDist = 30;
    const l = sampleForward(trail, agent, -0.42, sniffDist);
    const c = sampleForward(trail, agent, 0, sniffDist);
    const r = sampleForward(trail, agent, 0.42, sniffDist);

    // Base sniff steering toward own trails while avoiding enemy danger.
    agent.heading += (r - l) * 0.42;

    const ownD = ownDanger.sampleWorld(agent.x, agent.y, world.width, world.height);
    const enemyD = enemyDanger.sampleWorld(agent.x, agent.y, world.width, world.height);
    if (enemyD > ownD) agent.heading += (Math.random() - 0.5) * 0.5;

    if (agent.state === "HARVEST") {
      handleFood(agent, colony);
    } else if (agent.state === "RETURN") {
      const dx = colony.nestX - agent.x;
      const dy = colony.nestY - agent.y;
      const [nx, ny] = norm(dx, dy);
      agent.vx += nx * 0.13;
      agent.vy += ny * 0.13;

      if (Math.hypot(dx, dy) < colony.nestRadius + 10) {
        colony.foodStock += agent.carrying * 8;
        colony.aggression += agent.carrying * 0.0015;
        agent.carrying = 0;
        agent.energy = Math.min(1.4, agent.energy + 0.2);
        agent.state = "SCOUT";
      }
    } else if (agent.state === "RAID") {
      const dx = enemy.nestX - agent.x;
      const dy = enemy.nestY - agent.y;
      const [nx, ny] = norm(dx, dy);
      agent.vx += nx * 0.15;
      agent.vy += ny * 0.15;

      ownDanger.addWorld(agent.x, agent.y, 0.1, world.width, world.height, 1);
      if (Math.hypot(dx, dy) < enemy.nestRadius + 44) {
        if (Math.random() < 0.008 + enemy.aggression * 0.01) {
          agent.energy -= 0.16; // raid casualties are probabilistic, no pairwise O(N²)
        }
        if (Math.random() < 0.028) {
          colony.foodStock += 0.75;
          enemy.foodStock = Math.max(0, enemy.foodStock - 0.9);
        }
        if (Math.random() < 0.09) agent.state = "DEFEND";
      }
    } else if (agent.state === "DEFEND") {
      const dx = colony.nestX - agent.x;
      const dy = colony.nestY - agent.y;
      const [nx, ny] = norm(dx, dy);
      agent.vx += nx * 0.08;
      agent.vy += ny * 0.08;
      ownDanger.addWorld(agent.x, agent.y, 0.07, world.width, world.height, 1);
      if (Math.random() < 0.018) agent.state = "SCOUT";
    } else {
      // SCOUT
      const enemySignal = sampleForward(enemyTrail, agent, 0, 34);
      agent.heading += (Math.random() - 0.5) * 0.28 + enemySignal * 0.08;
      if (c > 0.03 && Math.random() < 0.1) agent.state = "HARVEST";
    }

    // General boids-lite smoothness without direct pair checks.
    agent.vx += Math.cos(agent.heading) * 0.03;
    agent.vy += Math.sin(agent.heading) * 0.03;
    const speed = agent.state === "RAID" ? 2.7 : 2.3;
    const vLen = Math.hypot(agent.vx, agent.vy) || 1;
    agent.vx = (agent.vx / vLen) * speed;
    agent.vy = (agent.vy / vLen) * speed;

    agent.x += agent.vx;
    agent.y += agent.vy;

    // World wrapping keeps motion fluid and painterly.
    if (agent.x < 0) agent.x += world.width;
    if (agent.x > world.width) agent.x -= world.width;
    if (agent.y < 0) agent.y += world.height;
    if (agent.y > world.height) agent.y -= world.height;

    trail.addWorld(agent.x, agent.y, agent.carrying > 0 ? 0.11 : 0.05, world.width, world.height, 1);
    if (agent.state === "RAID" || agent.state === "DEFEND") {
      ownDanger.addWorld(agent.x, agent.y, 0.05, world.width, world.height, 1);
    }

    agent.energy -= dt * (agent.state === "RAID" ? 0.065 : 0.035);
  }

  function updateColony(colony, dt, dayN) {
    colony.raidCooldown -= dt;
    colony.foodStock = Math.max(0, colony.foodStock - colony.agents.length * dt * 0.026);

    // day/night mood affects aggression and metabolism.
    colony.aggression = clamp(
      colony.aggression + (dayN - 0.45) * dt * 0.012 + (colony.foodStock > 170 ? 0.006 : -0.004) * dt,
      0.08,
      0.95,
    );

    const survivors = [];
    for (let i = 0; i < colony.agents.length; i++) {
      const a = colony.agents[i];
      updateAgent(a, colony, dt, dayN);
      if (a.energy > 0) survivors.push(a);
      else if (Math.random() < 0.24) {
        // dead agents enrich local area subtly.
        const p = world.foodPatches[(Math.random() * world.foodPatches.length) | 0];
        if (p) p.stock += 1.8;
      }
    }
    colony.agents = survivors;

    const growthRate = colony.foodStock > 120 ? 0.22 : colony.foodStock > 70 ? 0.12 : 0.05;
    if (colony.agents.length < 820 && Math.random() < growthRate * dt) {
      colony.foodStock -= 2.4;
      colony.agents.push(createAgent(colony, world));
    }
  }

  function updateFood(dt, dayN) {
    const regenScale = 0.55 + dayN * 0.9;
    for (let i = 0; i < world.foodPatches.length; i++) {
      const p = world.foodPatches[i];
      p.stock = clamp(p.stock + p.regen * regenScale * dt * 0.085, 0, 180);
      p.r = clamp(22 + p.stock * 0.24, 16, 68);
    }
  }

  function updateDirector(dt) {
    // Rare swarm event: temporary surge + brighter traces.
    if (world.time > world.nextSwarmAt) {
      world.nextSwarmAt = world.time + rand(150, 260);
      world.swarmBoost = 1;
      for (const colony of colonies) {
        const n = 35 + ((Math.random() * 25) | 0);
        for (let i = 0; i < n; i++) colony.agents.push(createAgent(colony, world));
        colony.aggression = clamp(colony.aggression + 0.18, 0.1, 0.95);
      }
    }
    world.swarmBoost = Math.max(0, world.swarmBoost - dt * 0.05);

    // Poetic reset (~20 min): fade out, reseed, fade in.
    if (world.time > world.nextResetAt && world.resetFade === 0) {
      world.resetFade = 1;
      world.nextResetAt = world.time + 1200;
    }

    if (world.resetFade > 0) {
      world.resetFade += dt * 0.28;
      if (world.resetFade > 1.6) {
        reseedFood();
        for (const c of colonies) {
          c.foodStock = 120;
          c.aggression = 0.34;
          c.agents = c.agents.slice(0, 260);
        }
        world.resetFade = -0.6;
      }
    } else if (world.resetFade < 0) {
      world.resetFade += dt * 0.22;
      if (world.resetFade >= 0) world.resetFade = 0;
    }
  }

  function updateCamera(dt) {
    world.camera.driftA += dt * 0.06;
    const midX = (bees.nestX + ants.nestX) * 0.5;
    const midY = (bees.nestY + ants.nestY) * 0.5;
    world.camera.x = midX + Math.cos(world.camera.driftA * 0.9) * 200;
    world.camera.y = midY + Math.sin(world.camera.driftA * 0.7) * 160;
    world.camera.zoom = 0.34 + Math.sin(world.camera.driftA * 0.23) * 0.035;
  }

  function updateMotes(dt) {
    for (let i = 0; i < world.motes.length; i++) {
      const m = world.motes[i];
      m.life -= dt;
      m.x += m.vx;
      m.y += m.vy;
      if (m.life <= 0) {
        m.x = rand(0, world.width);
        m.y = rand(0, world.height);
        m.life = rand(4, 12);
      }
    }
  }

  function render(ctx, width, height, dt) {
    const dayN = (Math.sin((world.time / world.cycleSec) * TAU - Math.PI / 2) + 1) * 0.5;

    // Motion trail persistence.
    const darkFade = 0.09 + (1 - dayN) * 0.06;
    ctx.fillStyle = `rgba(6,8,16,${darkFade})`;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(width * 0.5, height * 0.5);
    ctx.scale(world.camera.zoom, world.camera.zoom);
    ctx.translate(-world.camera.x, -world.camera.y);

    drawBackgroundMood(ctx, dayN);
    drawFood(ctx);
    drawMotes(ctx);

    const raidIntensity = clamp(world.swarmBoost + (bees.aggression + ants.aggression) * 0.35, 0, 1.8);
    ctx.globalCompositeOperation = raidIntensity > 0.55 ? "lighter" : "source-over";

    drawColony(ctx, bees, raidIntensity);
    drawColony(ctx, ants, raidIntensity);

    if (world.debug) drawFieldsDebug(ctx);

    ctx.restore();

    if (world.resetFade !== 0) {
      const a = Math.min(1, Math.abs(world.resetFade));
      ctx.fillStyle = `rgba(8,10,18,${a * 0.72})`;
      ctx.fillRect(0, 0, width, height);
    }

    updateHud(dayN);
  }

  function drawBackgroundMood(ctx, dayN) {
    const night = 1 - dayN;
    const g = ctx.createLinearGradient(0, 0, 0, world.height);
    g.addColorStop(0, `rgb(${12 + night * 24},${16 + night * 15},${28 + night * 26})`);
    g.addColorStop(1, `rgb(${24 + dayN * 16},${28 + dayN * 14},${40 + dayN * 12})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, world.width, world.height);
  }

  function drawFood(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const p of world.foodPatches) {
      const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 1.6);
      glow.addColorStop(0, `hsla(${58 + p.stock * 0.18}, 85%, 62%, 0.28)`);
      glow.addColorStop(1, "hsla(64, 90%, 60%, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 1.6, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawMotes(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const m of world.motes) {
      ctx.fillStyle = `hsla(${m.hue}, 88%, 68%, 0.08)`;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 1.2, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawColony(ctx, colony, raidIntensity) {
    const [r, g, b] = colony.color;

    // Nest aura.
    const nestGlow = ctx.createRadialGradient(
      colony.nestX,
      colony.nestY,
      0,
      colony.nestX,
      colony.nestY,
      colony.nestRadius * 2.6,
    );
    nestGlow.addColorStop(0, `rgba(${r},${g},${b},0.36)`);
    nestGlow.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = nestGlow;
    ctx.beginPath();
    ctx.arc(colony.nestX, colony.nestY, colony.nestRadius * 2.6, 0, TAU);
    ctx.fill();

    // Agents as layered particles.
    ctx.fillStyle = `rgba(${r},${g},${b},${0.15 + raidIntensity * 0.06})`;
    for (let i = 0; i < colony.agents.length; i++) {
      const a = colony.agents[i];
      ctx.beginPath();
      ctx.arc(a.x, a.y, 1.1 + a.carrying * 1.4, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = `rgba(${r},${g},${b},0.56)`;
    for (let i = 0; i < colony.agents.length; i += 2) {
      const a = colony.agents[i];
      ctx.beginPath();
      ctx.arc(a.x, a.y, 0.8, 0, TAU);
      ctx.fill();
    }
  }

  function drawFieldsDebug(ctx) {
    const channels = [fields.beeTrail, fields.antTrail, fields.beeDanger, fields.antDanger];
    const cellW = world.width / channels[0].cols;
    const cellH = world.height / channels[0].rows;

    for (let k = 0; k < channels.length; k++) {
      const f = channels[k];
      for (let y = 0; y < f.rows; y++) {
        for (let x = 0; x < f.cols; x++) {
          const v = f.data[y * f.cols + x];
          if (v < 0.1) continue;
          const hue = k === 0 ? 48 : k === 1 ? 348 : k === 2 ? 34 : 320;
          ctx.fillStyle = `hsla(${hue},90%,60%,${v * 0.12})`;
          ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
        }
      }
    }
  }

  function updateHud(dayN) {
    hud.innerHTML = `
      <div><strong>Living Painting</strong> <span class="muted">· day ${(dayN * 100).toFixed(0)}%</span></div>
      <div class="muted">Bees food ${bees.foodStock.toFixed(0)} · agg ${bees.aggression.toFixed(2)} · agents ${bees.agents.length}</div>
      <div class="muted">Ants food ${ants.foodStock.toFixed(0)} · agg ${ants.aggression.toFixed(2)} · agents ${ants.agents.length}</div>
      <div class="muted">swarm ${world.swarmBoost > 0 ? "active" : "idle"} · reset ${(world.nextResetAt - world.time).toFixed(0)}s</div>
    `;
  }

  reseedFood();
  spawnInitialAgents();
  initMotes();

  function step(dt) {
    world.time += dt;
    const dayN = (Math.sin((world.time / world.cycleSec) * TAU - Math.PI / 2) + 1) * 0.5;

    updateFood(dt, dayN);
    updateDirector(dt);

    fields.beeTrail.step(4.4, 0.18, dt);
    fields.antTrail.step(4.4, 0.18, dt);
    fields.beeDanger.step(5.4, 0.26, dt);
    fields.antDanger.step(5.4, 0.26, dt);

    updateColony(bees, dt, dayN);
    updateColony(ants, dt, dayN);
    updateMotes(dt);
    updateCamera(dt);
  }

  return {
    world,
    step,
    render,
    toggleDebug() {
      world.debug = !world.debug;
    },
    resize(w, h) {
      // camera is screen-space independent; just used for clamping if needed later.
      canvas.width = w;
      canvas.height = h;
    },
  };
}
