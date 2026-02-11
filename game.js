(() => {
  const canvas = document.getElementById("ecosystem");
  const ctx = canvas.getContext("2d", { alpha: false });
  const statusEl = document.getElementById("status");

  const CONFIG = {
    beeColor: [255, 189, 74],
    antColor: [169, 42, 60],
    initialBees: 220,
    initialAnts: 220,
    maxAgents: 520,
    nestRadius: 42,
    foodGrowthInterval: 2.4,
    maxFoodSources: 26,
    trailGrid: 10,
    dayLengthSeconds: 95,
    dangerRadius: 170,
    agentSense: 56,
  };

  const world = {
    width: 1,
    height: 1,
    time: 0,
    dayPhase: 0,
    foodTimer: 0,
    dangerSpots: [],
  };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    world.width = window.innerWidth;
    world.height = window.innerHeight;
    trails.reset();
  }

  const vec = {
    len(vx, vy) {
      return Math.hypot(vx, vy);
    },
    norm(vx, vy) {
      const l = Math.hypot(vx, vy) || 1;
      return [vx / l, vy / l];
    },
    clamp(vx, vy, max) {
      const l = Math.hypot(vx, vy);
      if (l <= max || l === 0) return [vx, vy];
      const s = max / l;
      return [vx * s, vy * s];
    },
  };

  class TrailField {
    constructor(cellSize) {
      this.cellSize = cellSize;
      this.cols = 0;
      this.rows = 0;
      this.bee = new Float32Array(1);
      this.ant = new Float32Array(1);
    }

    reset() {
      this.cols = Math.ceil(world.width / this.cellSize);
      this.rows = Math.ceil(world.height / this.cellSize);
      this.bee = new Float32Array(this.cols * this.rows);
      this.ant = new Float32Array(this.cols * this.rows);
    }

    indexAt(x, y) {
      const cx = Math.max(0, Math.min(this.cols - 1, (x / this.cellSize) | 0));
      const cy = Math.max(0, Math.min(this.rows - 1, (y / this.cellSize) | 0));
      return cy * this.cols + cx;
    }

    deposit(x, y, type, amount) {
      const idx = this.indexAt(x, y);
      if (type === "bee") this.bee[idx] = Math.min(1, this.bee[idx] + amount);
      else this.ant[idx] = Math.min(1, this.ant[idx] + amount);
    }

    sampleGradient(x, y, type) {
      const cx = Math.max(1, Math.min(this.cols - 2, (x / this.cellSize) | 0));
      const cy = Math.max(1, Math.min(this.rows - 2, (y / this.cellSize) | 0));
      const arr = type === "bee" ? this.bee : this.ant;
      const i = cy * this.cols + cx;
      const dx = arr[i + 1] - arr[i - 1];
      const dy = arr[i + this.cols] - arr[i - this.cols];
      return [dx, dy];
    }

    tick() {
      const len = this.bee.length;
      for (let i = 0; i < len; i++) {
        this.bee[i] *= 0.978;
        this.ant[i] *= 0.978;
      }
    }

    render() {
      const s = this.cellSize;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let y = 0; y < this.rows; y++) {
        for (let x = 0; x < this.cols; x++) {
          const i = y * this.cols + x;
          const b = this.bee[i];
          const a = this.ant[i];
          if (b > 0.02) {
            ctx.fillStyle = `rgba(255, 194, 78, ${b * 0.09})`;
            ctx.fillRect(x * s, y * s, s, s);
          }
          if (a > 0.02) {
            ctx.fillStyle = `rgba(168, 43, 65, ${a * 0.09})`;
            ctx.fillRect(x * s, y * s, s, s);
          }
        }
      }
      ctx.restore();
    }
  }

  class Food {
    constructor(x, y, amount) {
      this.x = x;
      this.y = y;
      this.amount = amount;
      this.radius = Math.max(4, Math.sqrt(amount) * 0.62);
    }

    take(q) {
      const got = Math.min(this.amount, q);
      this.amount -= got;
      this.radius = Math.max(0, Math.sqrt(this.amount) * 0.62);
      return got;
    }

    get empty() {
      return this.amount <= 0.1;
    }
  }

  class Agent {
    constructor(colony) {
      this.colony = colony;
      const theta = Math.random() * Math.PI * 2;
      const r = Math.random() * 26;
      this.x = colony.nest.x + Math.cos(theta) * r;
      this.y = colony.nest.y + Math.sin(theta) * r;
      this.vx = (Math.random() - 0.5) * 1.6;
      this.vy = (Math.random() - 0.5) * 1.6;
      this.energy = 0.7 + Math.random() * 0.6;
      this.carry = 0;
      this.age = 0;
      this.mode = "scout";
    }

    update(dt, neighbors, enemies) {
      this.age += dt;
      this.energy -= dt * 0.004;
      if (this.energy <= 0) return false;

      const colony = this.colony;
      const strategy = colony.strategy;
      const toNestX = colony.nest.x - this.x;
      const toNestY = colony.nest.y - this.y;
      const distToNest = vec.len(toNestX, toNestY);

      let ax = 0;
      let ay = 0;

      const separation = this.separation(neighbors);
      ax += separation[0] * 1.35;
      ay += separation[1] * 1.35;

      const cohesion = this.cohesion(neighbors);
      ax += cohesion[0] * 0.32;
      ay += cohesion[1] * 0.32;

      const alignment = this.alignment(neighbors);
      ax += alignment[0] * 0.55;
      ay += alignment[1] * 0.55;

      const [trailX, trailY] = trails.sampleGradient(this.x, this.y, colony.type);
      ax += trailX * 6.5;
      ay += trailY * 6.5;

      const threat = this.avoidDanger();
      ax += threat[0] * 1.6;
      ay += threat[1] * 1.6;

      const localFood = colony.findFoodNear(this.x, this.y, 58);
      if (this.carry < 1 && localFood) {
        const dx = localFood.x - this.x;
        const dy = localFood.y - this.y;
        const d = vec.len(dx, dy);
        if (d < localFood.radius + 3) {
          this.carry += localFood.take(0.45 + Math.random() * 0.2);
          this.mode = "return";
        } else {
          const [nx, ny] = vec.norm(dx, dy);
          ax += nx * 1.75;
          ay += ny * 1.75;
          this.mode = "forage";
        }
      }

      if (this.carry > 0.6 || strategy === "defensive") {
        const [nx, ny] = vec.norm(toNestX, toNestY);
        ax += nx * 1.35;
        ay += ny * 1.35;
        this.mode = "return";
      }

      if (distToNest < colony.nest.radius + 7 && this.carry > 0) {
        colony.stock += this.carry;
        this.carry = 0;
        this.energy = Math.min(1.65, this.energy + 0.25);
      }

      if (strategy === "aggressive" || strategy === "war") {
        const t = colony.enemy.nest;
        const dx = t.x - this.x;
        const dy = t.y - this.y;
        const [nx, ny] = vec.norm(dx, dy);
        const aggression = strategy === "war" ? 1.55 : 0.9;
        ax += nx * aggression;
        ay += ny * aggression;
        this.mode = strategy;
      }

      if (strategy === "scouting") {
        ax += (Math.random() - 0.5) * 0.7;
        ay += (Math.random() - 0.5) * 0.7;
      }

      if (strategy === "defensive" && distToNest > 120) {
        const [nx, ny] = vec.norm(toNestX, toNestY);
        ax += nx * 1.95;
        ay += ny * 1.95;
      }

      const combatForce = this.combat(enemies);
      ax += combatForce[0];
      ay += combatForce[1];

      this.vx += ax * dt * 56;
      this.vy += ay * dt * 56;

      const maxSpeed = strategy === "war" ? 3.2 : 2.4;
      [this.vx, this.vy] = vec.clamp(this.vx, this.vy, maxSpeed);

      this.x += this.vx;
      this.y += this.vy;

      if (this.x < 0) {
        this.x = 0;
        this.vx *= -0.5;
      } else if (this.x > world.width) {
        this.x = world.width;
        this.vx *= -0.5;
      }
      if (this.y < 0) {
        this.y = 0;
        this.vy *= -0.5;
      } else if (this.y > world.height) {
        this.y = world.height;
        this.vy *= -0.5;
      }

      trails.deposit(this.x, this.y, colony.type, 0.034 + this.carry * 0.018);
      return true;
    }

    separation(neighbors) {
      let sx = 0;
      let sy = 0;
      for (const other of neighbors) {
        if (other === this) continue;
        const dx = this.x - other.x;
        const dy = this.y - other.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0 && d2 < 420) {
          sx += dx / d2;
          sy += dy / d2;
        }
      }
      return [sx, sy];
    }

    cohesion(neighbors) {
      if (neighbors.length < 2) return [0, 0];
      let cx = 0;
      let cy = 0;
      for (const n of neighbors) {
        cx += n.x;
        cy += n.y;
      }
      cx /= neighbors.length;
      cy /= neighbors.length;
      const dx = cx - this.x;
      const dy = cy - this.y;
      return vec.norm(dx, dy);
    }

    alignment(neighbors) {
      if (neighbors.length < 2) return [0, 0];
      let avx = 0;
      let avy = 0;
      for (const n of neighbors) {
        avx += n.vx;
        avy += n.vy;
      }
      avx /= neighbors.length;
      avy /= neighbors.length;
      return vec.norm(avx - this.vx, avy - this.vy);
    }

    avoidDanger() {
      let ax = 0;
      let ay = 0;
      for (const d of world.dangerSpots) {
        const dx = this.x - d.x;
        const dy = this.y - d.y;
        const dist = vec.len(dx, dy);
        if (dist < d.radius) {
          const [nx, ny] = vec.norm(dx, dy);
          const scale = (d.radius - dist) / d.radius;
          ax += nx * scale * 2.2;
          ay += ny * scale * 2.2;
          this.energy -= scale * 0.009;
        }
      }
      return [ax, ay];
    }

    combat(enemies) {
      let fx = 0;
      let fy = 0;
      for (const e of enemies) {
        const dx = e.x - this.x;
        const dy = e.y - this.y;
        const d = vec.len(dx, dy);
        if (d < 7.5) {
          const scarcity = Math.max(0, 1 - (this.colony.stock + this.colony.enemy.stock) / 260);
          const intensity = 0.004 + scarcity * 0.03;
          this.energy -= intensity * (0.4 + Math.random());
          e.energy -= intensity * (0.4 + Math.random());
          fx -= dx * 0.032;
          fy -= dy * 0.032;
        } else if (this.colony.strategy === "war" && d < 40) {
          const [nx, ny] = vec.norm(dx, dy);
          fx += nx * 0.4;
          fy += ny * 0.4;
        }
      }
      return [fx, fy];
    }
  }

  class Colony {
    constructor(type, color, nest, initialCount) {
      this.type = type;
      this.color = color;
      this.nest = nest;
      this.stock = 65;
      this.strategy = "scouting";
      this.enemy = null;
      this.waveTimer = 0;
      this.agents = Array.from({ length: initialCount }, () => new Agent(this));
    }

    setEnemy(enemy) {
      this.enemy = enemy;
    }

    update(dt) {
      this.waveTimer -= dt;
      this.decideStrategy();

      const survivors = [];
      for (const agent of this.agents) {
        const neighbors = this.queryLocal(this.agents, agent.x, agent.y, CONFIG.agentSense);
        const enemies = this.queryLocal(this.enemy.agents, agent.x, agent.y, 46);
        if (agent.update(dt, neighbors, enemies)) survivors.push(agent);
      }
      this.agents = survivors;

      const upkeep = this.agents.length * 0.0036;
      this.stock = Math.max(0, this.stock - upkeep);

      this.spawnIfPossible();
    }

    decideStrategy() {
      const resourcePressure = this.stock / Math.max(1, this.agents.length * 0.5);
      const enemyPressure = this.enemy.agents.length / Math.max(1, this.agents.length);
      const globalFood = foods.reduce((sum, f) => sum + f.amount, 0) / 180;

      if ((resourcePressure < 0.75 || globalFood < 0.7) && enemyPressure > 0.75) {
        this.strategy = "war";
      } else if (resourcePressure > 1.8 && this.agents.length < this.enemy.agents.length * 1.2) {
        this.strategy = "aggressive";
      } else if (resourcePressure < 1.1) {
        this.strategy = "defensive";
      } else {
        this.strategy = "scouting";
      }

      if (this.strategy === "war" && this.waveTimer <= 0 && this.agents.length > 80) {
        this.launchWave();
        this.waveTimer = 8 + Math.random() * 10;
      }
    }

    launchWave() {
      const targetX = this.enemy.nest.x;
      const targetY = this.enemy.nest.y;
      for (let i = 0; i < this.agents.length; i += 4) {
        const a = this.agents[i];
        const [nx, ny] = vec.norm(targetX - a.x, targetY - a.y);
        a.vx += nx * 1.8;
        a.vy += ny * 1.8;
        a.energy = Math.min(1.8, a.energy + 0.1);
      }
    }

    spawnIfPossible() {
      if (this.stock < 8 || this.agents.length >= CONFIG.maxAgents) return;
      const spawnRate = this.strategy === "aggressive" ? 1.8 : 1;
      if (Math.random() < 0.065 * spawnRate) {
        this.stock -= 7.5;
        this.agents.push(new Agent(this));
      }
    }

    findFoodNear(x, y, radius) {
      let best = null;
      let bestD = Infinity;
      for (const f of foods) {
        const dx = f.x - x;
        const dy = f.y - y;
        const d = dx * dx + dy * dy;
        if (d < radius * radius && d < bestD) {
          best = f;
          bestD = d;
        }
      }
      return best;
    }

    queryLocal(group, x, y, radius) {
      const out = [];
      const r2 = radius * radius;
      for (const a of group) {
        const dx = a.x - x;
        const dy = a.y - y;
        if (dx * dx + dy * dy < r2) out.push(a);
      }
      return out;
    }

    draw() {
      const [r, g, b] = this.color;

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.09)`;
      for (const a of this.agents) {
        const radius = 1.2 + a.carry * 0.8;
        ctx.beginPath();
        ctx.arc(a.x, a.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.55)`;
      for (let i = 0; i < this.agents.length; i += 2) {
        const a = this.agents[i];
        ctx.beginPath();
        ctx.arc(a.x, a.y, 0.95, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      const glow = ctx.createRadialGradient(
        this.nest.x,
        this.nest.y,
        this.nest.radius * 0.4,
        this.nest.x,
        this.nest.y,
        this.nest.radius * 1.8,
      );
      glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.32)`);
      glow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(this.nest.x, this.nest.y, this.nest.radius * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const trails = new TrailField(CONFIG.trailGrid);
  const foods = [];

  const bees = new Colony(
    "bee",
    CONFIG.beeColor,
    { x: world.width * 0.24, y: world.height * 0.52, radius: CONFIG.nestRadius },
    CONFIG.initialBees,
  );
  const ants = new Colony(
    "ant",
    CONFIG.antColor,
    { x: world.width * 0.76, y: world.height * 0.48, radius: CONFIG.nestRadius },
    CONFIG.initialAnts,
  );
  bees.setEnemy(ants);
  ants.setEnemy(bees);

  function respawnNests() {
    bees.nest.x = world.width * 0.24;
    bees.nest.y = world.height * (0.4 + Math.random() * 0.24);
    ants.nest.x = world.width * 0.76;
    ants.nest.y = world.height * (0.4 + Math.random() * 0.24);
  }

  function spawnFood(x = Math.random() * world.width, y = Math.random() * world.height, amount = 16 + Math.random() * 42) {
    const leftBuffer = world.width * 0.1;
    const rightBuffer = world.width * 0.9;
    const sx = Math.max(leftBuffer, Math.min(rightBuffer, x));
    const sy = Math.max(30, Math.min(world.height - 30, y));
    foods.push(new Food(sx, sy, amount));
  }

  function maintainFood(dt) {
    world.foodTimer += dt;
    if (world.foodTimer >= CONFIG.foodGrowthInterval) {
      world.foodTimer = 0;
      if (foods.length < CONFIG.maxFoodSources) spawnFood();
    }
    for (let i = foods.length - 1; i >= 0; i--) {
      if (foods[i].empty) foods.splice(i, 1);
    }
  }

  function updateDanger(dt) {
    for (let i = world.dangerSpots.length - 1; i >= 0; i--) {
      world.dangerSpots[i].life -= dt;
      if (world.dangerSpots[i].life <= 0) world.dangerSpots.splice(i, 1);
    }
  }

  function background() {
    world.dayPhase = (Math.sin((world.time / CONFIG.dayLengthSeconds) * Math.PI * 2) + 1) * 0.5;
    const night = 1 - world.dayPhase;

    const top = `rgb(${Math.floor(14 + night * 20)}, ${Math.floor(17 + night * 15)}, ${Math.floor(32 + night * 26)})`;
    const bottom = `rgb(${Math.floor(24 + world.dayPhase * 18)}, ${Math.floor(30 + world.dayPhase * 16)}, ${Math.floor(52 + world.dayPhase * 22)})`;

    const g = ctx.createLinearGradient(0, 0, 0, world.height);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, world.width, world.height);

    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = `rgba(0, 0, 0, ${0.08 + night * 0.12})`;
    ctx.fillRect(0, 0, world.width, world.height);
  }

  function drawFoods() {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const f of foods) {
      const hue = 70 + f.amount * 0.45;
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.radius * 2.4);
      g.addColorStop(0, `hsla(${hue}, 84%, 63%, 0.48)`);
      g.addColorStop(1, `hsla(${hue}, 84%, 63%, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.radius * 2.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `hsla(${hue}, 88%, 68%, 0.6)`;
      ctx.beginPath();
      ctx.arc(f.x, f.y, Math.max(1.2, f.radius * 0.4), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawDanger() {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const d of world.dangerSpots) {
      const alpha = Math.max(0, d.life / d.maxLife) * 0.2;
      const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.radius);
      g.addColorStop(0, `rgba(255, 70, 70, ${alpha})`);
      g.addColorStop(1, "rgba(255, 70, 70, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function renderStatus() {
    statusEl.textContent = `Bees ${bees.agents.length} (${bees.strategy}) • Ants ${ants.agents.length} (${ants.strategy}) • Food nodes ${foods.length}`;
  }

  let previous = performance.now();
  function frame(now) {
    const dt = Math.min(0.034, (now - previous) / 1000);
    previous = now;
    world.time += dt;

    maintainFood(dt);
    updateDanger(dt);
    trails.tick();

    bees.update(dt);
    ants.update(dt);

    background();
    trails.render();
    drawFoods();
    bees.draw();
    ants.draw();
    drawDanger();
    renderStatus();

    requestAnimationFrame(frame);
  }

  canvas.addEventListener("click", (event) => {
    spawnFood(event.clientX, event.clientY, 24 + Math.random() * 40);
  });

  canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    world.dangerSpots.push({
      x: event.clientX,
      y: event.clientY,
      radius: CONFIG.dangerRadius,
      life: 8,
      maxLife: 8,
    });
  });

  window.addEventListener("resize", () => {
    resize();
    respawnNests();
  });

  resize();
  respawnNests();
  for (let i = 0; i < 14; i++) spawnFood();
  requestAnimationFrame(frame);
})();
