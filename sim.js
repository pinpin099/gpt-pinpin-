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

function pickRole(colony) {
  const cfg = colony.config;
  const soldierBase = cfg.roleWeights.soldier;
  const soldierBoost = colony.raid.active ? cfg.raid.soldierBoost : 0;
  const soldierW = clamp(soldierBase + soldierBoost, 0.05, 0.82);
  const scoutW = cfg.roleWeights.scout;
  const workerW = clamp(1 - scoutW - soldierW, 0.08, 0.86);
  const r = Math.random();
  if (r < scoutW) return "SCOUTER";
  if (r < scoutW + workerW) return "WORKER";
  return "SOLDIER";
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
    role: pickRole(colony),
    energy: rand(0.7, 1.4),
    carrying: 0,
    heading: rand(0, TAU),
    targetPatch: -1,
    world,
  };
}

export function createSimulation(canvas, hud) {
  const CONFIG = {
    world: {
      width: 2200,
      height: 2200,
      dayNightSeconds: 240,
      initialFoodPatches: 40,
      foodPatchCap: 56,
      initialAgentsPerColony: 260,
    },
    roleWeights: {
      scout: 0.24,
      soldier: 0.2,
    },
    raid: {
      durationMin: 8,
      durationMax: 14,
      cooldownMin: 18,
      cooldownMax: 35,
      soldierBoost: 0.27,
      speedBoost: 0.2,
      brightnessBoost: 0.34,
      particleBoost: 1.7,
      randomTriggerChance: 0.0009,
    },
    visuals: {
      trailPersistence: 0.11,
      trailPersistenceNightBoost: 0.06,
      glowStrength: 0.2,
      warVeilAlpha: 0.2,
      warVeilRadius: 340,
      cameraDrift: 0.06,
      cameraZoomBase: 0.34,
      cameraZoomAmp: 0.04,
    },
    hotspot: {
      sampleStride: 4,
      minWeightToShow: 12,
      shockwaveInterval: 1.2,
    },
    events: {
      swarmEventMin: 130,
      swarmEventMax: 220,
      resetInterval: 1200,
    },
  };

  const world = {
    width: CONFIG.world.width,
    height: CONFIG.world.height,
    time: 0,
    cycleSec: CONFIG.world.dayNightSeconds,
    foodPatches: [],
    motes: [],
    shockwaves: [],
    swarmBoost: 0,
    resetFade: 0,
    nextSwarmAt: rand(CONFIG.events.swarmEventMin, CONFIG.events.swarmEventMax),
    nextResetAt: CONFIG.events.resetInterval,
    camera: { x: 1100, y: 1100, zoom: 0.38, driftA: 0 },
    conflict: { x: 1100, y: 1100, weight: 0, timer: 0 },
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
    color: [255, 198, 96],
    glow: [255, 170, 84],
    veil: [255, 176, 108],
    nestX: 520,
    nestY: 1100,
    nestRadius: 62,
    foodStock: 120,
    aggression: 0.34,
    agents: [],
    enemy: null,
    config: CONFIG,
    raid: {
      active: false,
      timer: 0,
      cooldown: rand(CONFIG.raid.cooldownMin, CONFIG.raid.cooldownMax),
      duration: 0,
      targetX: 0,
      targetY: 0,
      brightness: 0,
    },
  };

  const ants = {
    name: "Ants",
    team: "ant",
    color: [112, 130, 232],
    glow: [98, 108, 215],
    veil: [88, 112, 245],
    nestX: 1680,
    nestY: 1120,
    nestRadius: 62,
    foodStock: 120,
    aggression: 0.34,
    agents: [],
    enemy: null,
    config: CONFIG,
    raid: {
      active: false,
      timer: 0,
      cooldown: rand(CONFIG.raid.cooldownMin, CONFIG.raid.cooldownMax),
      duration: 0,
      targetX: 0,
      targetY: 0,
      brightness: 0,
    },
  };

  const colonies = [bees, ants];
  bees.enemy = ants;
  ants.enemy = bees;

  function pushShockwave(x, y, tone = "neutral") {
    world.shockwaves.push({
      x,
      y,
      r: 12,
      life: 1,
      tone,
    });
  }

  function reseedFood() {
    world.foodPatches.length = 0;
    for (let i = 0; i < CONFIG.world.initialFoodPatches; i++) {
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
    bees.agents = Array.from({ length: CONFIG.world.initialAgentsPerColony }, () => createAgent(bees, world));
    ants.agents = Array.from({ length: CONFIG.world.initialAgentsPerColony }, () => createAgent(ants, world));
  }

  function initMotes() {
    world.motes = Array.from({ length: 240 }, () => ({
      x: rand(0, world.width),
      y: rand(0, world.height),
      vx: rand(-0.08, 0.08),
      vy: rand(-0.08, 0.08),
      hue: Math.random() < 0.5 ? 42 : 232,
      life: rand(3, 14),
    }));
  }

  function sampleForward(field, agent, offsetA, dist) {
    const a = agent.heading + offsetA;
    const x = agent.x + Math.cos(a) * dist;
    const y = agent.y + Math.sin(a) * dist;
    return field.sampleWorld(x, y, world.width, world.height);
  }

  function updateRaidState(colony, dayN) {
    const raid = colony.raid;
    raid.cooldown -= 1 / 60;

    if (raid.active) {
      raid.timer -= 1 / 60;
      raid.brightness = clamp(raid.brightness + 0.05, 0, 1);
      if (raid.timer <= 0) {
        raid.active = false;
        raid.brightness = 0;
        raid.cooldown = rand(CONFIG.raid.cooldownMin, CONFIG.raid.cooldownMax);
      }
      return;
    }

    const pressure = colony.enemy.agents.length / Math.max(1, colony.agents.length);
    const highResource = colony.foodStock > 190;
    const stressed = pressure > 1.05 || colony.aggression > 0.58;
    const rare = Math.random() < CONFIG.raid.randomTriggerChance;

    if (raid.cooldown <= 0 && (highResource || stressed || rare)) {
      raid.active = true;
      raid.duration = rand(CONFIG.raid.durationMin, CONFIG.raid.durationMax);
      raid.timer = raid.duration;
      raid.targetX = colony.enemy.nestX + rand(-80, 80);
      raid.targetY = colony.enemy.nestY + rand(-80, 80);
      raid.brightness = 0.55;
      pushShockwave(colony.nestX, colony.nestY, colony.team);
    }
  }

  function chooseState(agent, colony, dayN) {
    const homeDx = colony.nestX - agent.x;
    const homeDy = colony.nestY - agent.y;
    const homeD = Math.hypot(homeDx, homeDy);

    if (agent.carrying > 0.75 || agent.energy < 0.18) {
      agent.state = "RETURN";
      return;
    }

    if (colony.raid.active && (agent.role === "SOLDIER" || Math.random() < 0.32)) {
      agent.state = "RAID";
      return;
    }

    const raidPressure = colony.foodStock > 210 ? 0.24 : 0;
    const raidChance = colony.aggression * (0.004 + raidPressure) * (0.6 + dayN * 0.8);
    if (!colony.raid.active && colony.raid.cooldown <= 0 && Math.random() < raidChance) {
      agent.state = "RAID";
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

    if (Math.random() < 0.03) chooseState(agent, colony, dayN);

    const sniffDist = 30;
    const l = sampleForward(trail, agent, -0.42, sniffDist);
    const c = sampleForward(trail, agent, 0, sniffDist);
    const r = sampleForward(trail, agent, 0.42, sniffDist);

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
        colony.aggression += agent.carrying * 0.0014;
        agent.carrying = 0;
        agent.energy = Math.min(1.4, agent.energy + 0.2);
        agent.state = "SCOUT";
      }
    } else if (agent.state === "RAID") {
      const tx = colony.raid.active ? colony.raid.targetX : enemy.nestX;
      const ty = colony.raid.active ? colony.raid.targetY : enemy.nestY;
      const dx = tx - agent.x;
      const dy = ty - agent.y;
      const [nx, ny] = norm(dx, dy);
      agent.vx += nx * 0.16;
      agent.vy += ny * 0.16;

      ownDanger.addWorld(agent.x, agent.y, 0.1, world.width, world.height, 1);
      if (Math.hypot(dx, dy) < enemy.nestRadius + 44) {
        if (Math.random() < 0.008 + enemy.aggression * 0.01) {
          agent.energy -= 0.16;
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
      if (Math.random() < 0.018) agent.state = colony.raid.active ? "RAID" : "SCOUT";
    } else {
      const enemySignal = sampleForward(enemyTrail, agent, 0, 34);
      agent.heading += (Math.random() - 0.5) * 0.28 + enemySignal * 0.08;
      if (c > 0.03 && Math.random() < 0.1) agent.state = "HARVEST";
    }

    agent.vx += Math.cos(agent.heading) * 0.03;
    agent.vy += Math.sin(agent.heading) * 0.03;

    const roleSpeed = agent.role === "SOLDIER" ? 0.2 : agent.role === "SCOUTER" ? 0.1 : 0;
    const raidSpeed = colony.raid.active ? CONFIG.raid.speedBoost : 0;
    const speed = (agent.state === "RAID" ? 2.65 : 2.3) + roleSpeed + raidSpeed;

    const vLen = Math.hypot(agent.vx, agent.vy) || 1;
    agent.vx = (agent.vx / vLen) * speed;
    agent.vy = (agent.vy / vLen) * speed;

    agent.x += agent.vx;
    agent.y += agent.vy;

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
    updateRaidState(colony, dayN);

    colony.foodStock = Math.max(0, colony.foodStock - colony.agents.length * dt * 0.026);

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

    if (world.foodPatches.length < CONFIG.world.foodPatchCap && Math.random() < 0.03 * dt * 60) {
      world.foodPatches.push({
        x: rand(120, world.width - 120),
        y: rand(120, world.height - 120),
        r: rand(24, 42),
        stock: rand(30, 90),
        regen: rand(3.2, 7.6),
      });
    }
  }

  function updateConflictHotspot(dt) {
    let sx = 0;
    let sy = 0;
    let sw = 0;

    for (const colony of colonies) {
      const sampleStride = CONFIG.hotspot.sampleStride;
      for (let i = 0; i < colony.agents.length; i += sampleStride) {
        const a = colony.agents[i];
        if (a.state !== "RAID" && a.state !== "DEFEND") continue;
        const w = a.state === "RAID" ? 1.3 : 0.7;
        sx += a.x * w;
        sy += a.y * w;
        sw += w;
      }
    }

    if (sw > 0) {
      const tx = sx / sw;
      const ty = sy / sw;
      world.conflict.x += (tx - world.conflict.x) * 0.12;
      world.conflict.y += (ty - world.conflict.y) * 0.12;
      world.conflict.weight = sw;
      world.conflict.timer += dt;

      if (sw > CONFIG.hotspot.minWeightToShow && world.conflict.timer > CONFIG.hotspot.shockwaveInterval) {
        pushShockwave(world.conflict.x, world.conflict.y, "hotspot");
        world.conflict.timer = 0;
      }
    } else {
      world.conflict.weight *= 0.95;
      world.conflict.timer = 0;
    }
  }

  function updateDirector(dt) {
    if (world.time > world.nextSwarmAt) {
      world.nextSwarmAt = world.time + rand(CONFIG.events.swarmEventMin, CONFIG.events.swarmEventMax);
      world.swarmBoost = 1;
      for (const colony of colonies) {
        const n = 35 + ((Math.random() * 25) | 0);
        for (let i = 0; i < n; i++) colony.agents.push(createAgent(colony, world));
        colony.aggression = clamp(colony.aggression + 0.18, 0.1, 0.95);
      }
    }
    world.swarmBoost = Math.max(0, world.swarmBoost - dt * 0.05);

    if (world.time > world.nextResetAt && world.resetFade === 0) {
      world.resetFade = 1;
      world.nextResetAt = world.time + CONFIG.events.resetInterval;
    }

    if (world.resetFade > 0) {
      world.resetFade += dt * 0.28;
      if (world.resetFade > 1.6) {
        reseedFood();
        for (const c of colonies) {
          c.foodStock = 120;
          c.aggression = 0.34;
          c.raid.active = false;
          c.raid.timer = 0;
          c.raid.cooldown = rand(CONFIG.raid.cooldownMin, CONFIG.raid.cooldownMax);
          c.agents = c.agents.slice(0, CONFIG.world.initialAgentsPerColony);
        }
        world.resetFade = -0.6;
      }
    } else if (world.resetFade < 0) {
      world.resetFade += dt * 0.22;
      if (world.resetFade >= 0) world.resetFade = 0;
    }
  }

  function updateCamera(dt) {
    world.camera.driftA += dt * CONFIG.visuals.cameraDrift;
    const focusW = clamp(world.conflict.weight / 42, 0, 1);
    const midX = (bees.nestX + ants.nestX) * 0.5;
    const midY = (bees.nestY + ants.nestY) * 0.5;
    const targetX = midX * (1 - focusW) + world.conflict.x * focusW;
    const targetY = midY * (1 - focusW) + world.conflict.y * focusW;

    world.camera.x =
      targetX +
      Math.cos(world.camera.driftA * 0.9) * 160 * (1 - focusW * 0.5);
    world.camera.y =
      targetY +
      Math.sin(world.camera.driftA * 0.7) * 130 * (1 - focusW * 0.5);

    world.camera.zoom =
      CONFIG.visuals.cameraZoomBase +
      Math.sin(world.camera.driftA * 0.23) * CONFIG.visuals.cameraZoomAmp +
      focusW * 0.022;
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

    for (let i = world.shockwaves.length - 1; i >= 0; i--) {
      const s = world.shockwaves[i];
      s.life -= dt * 0.62;
      s.r += dt * 130;
      if (s.life <= 0) world.shockwaves.splice(i, 1);
    }
  }

  function render(ctx, width, height) {
    const dayN = (Math.sin((world.time / world.cycleSec) * TAU - Math.PI / 2) + 1) * 0.5;

    const darkFade =
      CONFIG.visuals.trailPersistence +
      (1 - dayN) * CONFIG.visuals.trailPersistenceNightBoost;
    ctx.fillStyle = `rgba(6,8,16,${darkFade})`;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(width * 0.5, height * 0.5);
    ctx.scale(world.camera.zoom, world.camera.zoom);
    ctx.translate(-world.camera.x, -world.camera.y);

    drawBackgroundMood(ctx, dayN);
    drawWarVeil(ctx);
    drawFood(ctx);
    drawMotes(ctx);

    const raidIntensity = clamp(
      world.swarmBoost + (bees.raid.brightness + ants.raid.brightness) * CONFIG.raid.brightnessBoost,
      0,
      1.9,
    );

    ctx.globalCompositeOperation = raidIntensity > 0.35 ? "lighter" : "source-over";
    drawColony(ctx, bees, raidIntensity);
    drawColony(ctx, ants, raidIntensity);

    drawShockwaves(ctx);

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

  function drawWarVeil(ctx) {
    if (world.conflict.weight < CONFIG.hotspot.minWeightToShow) return;
    const intensity = clamp(world.conflict.weight / 46, 0, 1);

    const amber = ctx.createRadialGradient(
      world.conflict.x,
      world.conflict.y,
      0,
      world.conflict.x,
      world.conflict.y,
      CONFIG.visuals.warVeilRadius,
    );
    amber.addColorStop(0, `rgba(255,180,104,${CONFIG.visuals.warVeilAlpha * intensity})`);
    amber.addColorStop(1, "rgba(255,180,104,0)");

    const indigo = ctx.createRadialGradient(
      world.conflict.x + 70,
      world.conflict.y - 40,
      0,
      world.conflict.x + 70,
      world.conflict.y - 40,
      CONFIG.visuals.warVeilRadius * 1.15,
    );
    indigo.addColorStop(0, `rgba(94,122,250,${CONFIG.visuals.warVeilAlpha * intensity})`);
    indigo.addColorStop(1, "rgba(94,122,250,0)");

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = amber;
    ctx.beginPath();
    ctx.arc(world.conflict.x, world.conflict.y, CONFIG.visuals.warVeilRadius, 0, TAU);
    ctx.fill();

    ctx.fillStyle = indigo;
    ctx.beginPath();
    ctx.arc(world.conflict.x + 70, world.conflict.y - 40, CONFIG.visuals.warVeilRadius * 1.15, 0, TAU);
    ctx.fill();
    ctx.restore();
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
    const hotspotActive = world.conflict.weight > CONFIG.hotspot.minWeightToShow;
    const boost = hotspotActive ? CONFIG.raid.particleBoost : 1;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < world.motes.length; i++) {
      const m = world.motes[i];
      ctx.fillStyle = `hsla(${m.hue}, 88%, 68%, ${0.06 * boost})`;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 1.2, 0, TAU);
      ctx.fill();
    }

    if (hotspotActive) {
      for (let i = 0; i < 24; i++) {
        const a = Math.random() * TAU;
        const rr = rand(8, 80);
        const x = world.conflict.x + Math.cos(a) * rr;
        const y = world.conflict.y + Math.sin(a) * rr;
        ctx.fillStyle = i % 2 ? "rgba(255,190,120,0.22)" : "rgba(110,140,255,0.22)";
        ctx.beginPath();
        ctx.arc(x, y, rand(0.6, 1.8), 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawColony(ctx, colony, raidIntensity) {
    const [r, g, b] = colony.color;
    const glowGain = CONFIG.visuals.glowStrength + colony.raid.brightness * 0.12;

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

    // PASS 1: glow (large faint additive)
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = `rgba(${r},${g},${b},${0.1 + glowGain + raidIntensity * 0.04})`;
    for (let i = 0; i < colony.agents.length; i++) {
      const a = colony.agents[i];
      const rr = 1.9 + a.carrying * 1.3 + (a.state === "RAID" ? 0.8 : 0);
      ctx.beginPath();
      ctx.arc(a.x, a.y, rr, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // PASS 2: crisp cores
    ctx.fillStyle = `rgba(${r},${g},${b},0.74)`;
    for (let i = 0; i < colony.agents.length; i += 2) {
      const a = colony.agents[i];
      const rr = a.state === "RAID" ? 1.1 : 0.85;
      ctx.beginPath();
      ctx.arc(a.x, a.y, rr, 0, TAU);
      ctx.fill();
    }
  }

  function drawShockwaves(ctx) {
    if (!world.shockwaves.length) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineWidth = 1.4;
    for (let i = 0; i < world.shockwaves.length; i++) {
      const s = world.shockwaves[i];
      let color = "rgba(220,220,255,";
      if (s.tone === "bee") color = "rgba(255,190,120,";
      else if (s.tone === "ant") color = "rgba(120,140,255,";
      else if (s.tone === "hotspot") color = "rgba(200,180,255,";
      ctx.strokeStyle = `${color}${s.life * 0.25})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
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
          const hue = k === 0 ? 45 : k === 1 ? 230 : k === 2 ? 34 : 260;
          ctx.fillStyle = `hsla(${hue},90%,60%,${v * 0.12})`;
          ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
        }
      }
    }
  }

  function updateHud(dayN) {
    hud.innerHTML = `
      <div><strong>Living Painting</strong> <span class="muted">· day ${(dayN * 100).toFixed(0)}%</span></div>
      <div class="muted">Bees food ${bees.foodStock.toFixed(0)} · agg ${bees.aggression.toFixed(2)} · agents ${bees.agents.length} · raid ${bees.raid.active ? "on" : "off"}</div>
      <div class="muted">Ants food ${ants.foodStock.toFixed(0)} · agg ${ants.aggression.toFixed(2)} · agents ${ants.agents.length} · raid ${ants.raid.active ? "on" : "off"}</div>
      <div class="muted">hotspot ${world.conflict.weight.toFixed(1)} · swarm ${world.swarmBoost > 0 ? "active" : "idle"}</div>
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
    updateConflictHotspot(dt);
    updateMotes(dt);
    updateCamera(dt);
  }

  return {
    world,
    config: CONFIG,
    step,
    render,
    toggleDebug() {
      world.debug = !world.debug;
    },
    resize(w, h) {
      canvas.width = w;
      canvas.height = h;
    },
  };
}
