(() => {
  const canvas = document.getElementById("ecosystem");
  const ctx = canvas.getContext("2d", { alpha: false });

  const CONFIG = {
    initialCount: 340,
    maxCount: 820,
    cellSize: 34,
    pheromoneCell: 8,
    foodCap: 52,
    dayLength: 120,
    bloomAlpha: 0.8,
  };

  const roles = ["scout", "worker", "soldier"];
  const roleWeights = [0.28, 0.52, 0.2];

  const world = {
    w: 1,
    h: 1,
    t: 0,
    season: 0,
    food: [],
    hazards: [],
    particles: [],
    shockwaves: [],
  };

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function pickRole() {
    const r = Math.random();
    if (r < roleWeights[0]) return roles[0];
    if (r < roleWeights[0] + roleWeights[1]) return roles[1];
    return roles[2];
  }

  const vec = {
    len(x, y) {
      return Math.hypot(x, y);
    },
    norm(x, y) {
      const l = Math.hypot(x, y) || 1;
      return [x / l, y / l];
    },
    clamp(x, y, max) {
      const l = Math.hypot(x, y);
      if (l <= max || l === 0) return [x, y];
      const s = max / l;
      return [x * s, y * s];
    },
  };

  class SpatialHash {
    constructor(cellSize) {
      this.cell = cellSize;
      this.map = new Map();
    }

    clear() {
      this.map.clear();
    }

    key(x, y) {
      return `${x},${y}`;
    }

    rebuild(agents) {
      this.clear();
      for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        const cx = (a.x / this.cell) | 0;
        const cy = (a.y / this.cell) | 0;
        const k = this.key(cx, cy);
        let b = this.map.get(k);
        if (!b) {
          b = [];
          this.map.set(k, b);
        }
        b.push(a);
      }
    }

    query(x, y, r, out) {
      out.length = 0;
      const minX = ((x - r) / this.cell) | 0;
      const maxX = ((x + r) / this.cell) | 0;
      const minY = ((y - r) / this.cell) | 0;
      const maxY = ((y + r) / this.cell) | 0;
      const r2 = r * r;
      for (let cy = minY; cy <= maxY; cy++) {
        for (let cx = minX; cx <= maxX; cx++) {
          const bucket = this.map.get(this.key(cx, cy));
          if (!bucket) continue;
          for (let i = 0; i < bucket.length; i++) {
            const a = bucket[i];
            const dx = a.x - x;
            const dy = a.y - y;
            if (dx * dx + dy * dy <= r2) out.push(a);
          }
        }
      }
      return out;
    }
  }

  class PheromoneField {
    constructor(size) {
      this.size = size;
      this.cols = 1;
      this.rows = 1;
      this.beeFood = new Float32Array(1);
      this.beeAlarm = new Float32Array(1);
      this.antFood = new Float32Array(1);
      this.antWar = new Float32Array(1);
      this.tmp = new Float32Array(1);
    }

    resize() {
      this.cols = Math.ceil(world.w / this.size);
      this.rows = Math.ceil(world.h / this.size);
      const len = this.cols * this.rows;
      this.beeFood = new Float32Array(len);
      this.beeAlarm = new Float32Array(len);
      this.antFood = new Float32Array(len);
      this.antWar = new Float32Array(len);
      this.tmp = new Float32Array(len);
    }

    idx(x, y) {
      const cx = Math.max(0, Math.min(this.cols - 1, (x / this.size) | 0));
      const cy = Math.max(0, Math.min(this.rows - 1, (y / this.size) | 0));
      return cy * this.cols + cx;
    }

    deposit(channel, x, y, v) {
      const arr = this[channel];
      const i = this.idx(x, y);
      arr[i] = Math.min(1, arr[i] + v);
    }

    gradient(channel, x, y) {
      const arr = this[channel];
      const cx = Math.max(1, Math.min(this.cols - 2, (x / this.size) | 0));
      const cy = Math.max(1, Math.min(this.rows - 2, (y / this.size) | 0));
      const i = cy * this.cols + cx;
      return [arr[i + 1] - arr[i - 1], arr[i + this.cols] - arr[i - this.cols]];
    }

    decayAndDiffuse(channel, dt, decay, diffusion) {
      const arr = this[channel];
      const cols = this.cols;
      const rows = this.rows;
      const t = this.tmp;
      t.set(arr);

      for (let y = 1; y < rows - 1; y++) {
        for (let x = 1; x < cols - 1; x++) {
          const i = y * cols + x;
          const lap =
            t[i - 1] +
            t[i + 1] +
            t[i - cols] +
            t[i + cols] -
            t[i] * 4;
          let v = t[i] + lap * diffusion * dt;
          v *= 1 - decay * dt;
          arr[i] = v > 0.001 ? v : 0;
        }
      }
    }

    step(dt) {
      this.decayAndDiffuse("beeFood", dt, 0.12, 3.6);
      this.decayAndDiffuse("beeAlarm", dt, 0.16, 5.2);
      this.decayAndDiffuse("antFood", dt, 0.12, 3.6);
      this.decayAndDiffuse("antWar", dt, 0.16, 5.2);
    }

    render() {
      const s = this.size;
      const cols = this.cols;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let y = 0; y < this.rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          const bf = this.beeFood[i];
          const ba = this.beeAlarm[i];
          const af = this.antFood[i];
          const aw = this.antWar[i];
          if (bf > 0.02) {
            ctx.fillStyle = `rgba(255,195,82,${bf * 0.08})`;
            ctx.fillRect(x * s, y * s, s, s);
          }
          if (ba > 0.02) {
            ctx.fillStyle = `rgba(255,126,88,${ba * 0.1})`;
            ctx.fillRect(x * s, y * s, s, s);
          }
          if (af > 0.02) {
            ctx.fillStyle = `rgba(172,49,74,${af * 0.08})`;
            ctx.fillRect(x * s, y * s, s, s);
          }
          if (aw > 0.02) {
            ctx.fillStyle = `rgba(132,24,48,${aw * 0.1})`;
            ctx.fillRect(x * s, y * s, s, s);
          }
        }
      }
      ctx.restore();
    }
  }

  class Agent {
    constructor(colony) {
      this.colony = colony;
      this.role = pickRole();
      const a = Math.random() * Math.PI * 2;
      const r = rand(0, 26);
      this.x = colony.nest.x + Math.cos(a) * r;
      this.y = colony.nest.y + Math.sin(a) * r;
      this.vx = rand(-1, 1);
      this.vy = rand(-1, 1);
      this.energy = rand(0.8, 1.6);
      this.carry = 0;
      this.mood = 0;
      this.tmpN = [];
      this.tmpE = [];
    }

    update(dt) {
      const c = this.colony;
      const enemy = c.enemy;
      const neighbors = c.hash.query(this.x, this.y, 54, this.tmpN);
      const enemies = enemy.hash.query(this.x, this.y, 44, this.tmpE);

      let ax = 0;
      let ay = 0;

      // boids core
      let sx = 0;
      let sy = 0;
      let avx = 0;
      let avy = 0;
      let count = 0;
      for (let i = 0; i < neighbors.length; i++) {
        const n = neighbors[i];
        if (n === this) continue;
        const dx = this.x - n.x;
        const dy = this.y - n.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0) {
          if (d2 < 290) {
            sx += dx / d2;
            sy += dy / d2;
          }
          avx += n.vx;
          avy += n.vy;
          count++;
        }
      }
      if (count > 0) {
        avx /= count;
        avy /= count;
        const [alx, aly] = vec.norm(avx - this.vx, avy - this.vy);
        ax += alx * 0.5;
        ay += aly * 0.5;
      }
      ax += sx * 1.2;
      ay += sy * 1.2;

      // cohesion to local center for defensive clustering
      if (neighbors.length > 1 && (c.strategy === "defend" || this.role === "soldier")) {
        let cx = 0;
        let cy = 0;
        for (let i = 0; i < neighbors.length; i++) {
          cx += neighbors[i].x;
          cy += neighbors[i].y;
        }
        cx /= neighbors.length;
        cy /= neighbors.length;
        const [nx, ny] = vec.norm(cx - this.x, cy - this.y);
        ax += nx * 0.6;
        ay += ny * 0.6;
      }

      // role-based steering
      const toNestX = c.nest.x - this.x;
      const toNestY = c.nest.y - this.y;
      const distNest = vec.len(toNestX, toNestY);
      const targetFood = c.closestFood(this.x, this.y, 75 + (this.role === "scout" ? 80 : 0));

      if (this.carry > 0.72 || c.strategy === "retreat") {
        const [nx, ny] = vec.norm(toNestX, toNestY);
        ax += nx * 1.45;
        ay += ny * 1.45;
      } else if (targetFood) {
        const dx = targetFood.x - this.x;
        const dy = targetFood.y - this.y;
        const d = vec.len(dx, dy);
        if (d < targetFood.r + 4) {
          this.carry += targetFood.take(this.role === "worker" ? 0.5 : 0.32);
          c.field.deposit(c.foodTrail, this.x, this.y, 0.22);
        } else {
          const [nx, ny] = vec.norm(dx, dy);
          ax += nx * (this.role === "worker" ? 1.2 : 0.9);
          ay += ny * (this.role === "worker" ? 1.2 : 0.9);
        }
      } else {
        // follow pheromone when no direct target
        const [g1x, g1y] = c.field.gradient(c.foodTrail, this.x, this.y);
        ax += g1x * 7;
        ay += g1y * 7;
        ax += rand(-0.3, 0.3);
        ay += rand(-0.3, 0.3);
      }

      if (distNest < c.nest.r + 7 && this.carry > 0) {
        c.stock += this.carry;
        this.carry = 0;
        this.energy = Math.min(1.8, this.energy + 0.2);
      }

      // war behaviors
      if (c.strategy === "war" || c.strategy === "raid") {
        const wave = c.wave;
        const dx = wave.x - this.x;
        const dy = wave.y - this.y;
        const [nx, ny] = vec.norm(dx, dy);
        const push = this.role === "soldier" ? 1.55 : 0.72;
        ax += nx * push;
        ay += ny * push;
        c.field.deposit(c.warTrail, this.x, this.y, this.role === "soldier" ? 0.18 : 0.08);
      }

      // enemy contact zone
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        const dx = e.x - this.x;
        const dy = e.y - this.y;
        const d = vec.len(dx, dy);
        if (d < 8) {
          const stress = 0.015 + c.pressure * 0.02;
          this.energy -= stress * (0.7 + Math.random());
          e.energy -= stress * (0.6 + Math.random());
          c.field.deposit(c.alarmTrail, this.x, this.y, 0.16);
          c.spawnSpark(this.x, this.y);
          if (Math.random() < 0.006) addShockwave(this.x, this.y, c.colorShock);
        } else if (d < 46 && this.role === "soldier") {
          const [nx, ny] = vec.norm(dx, dy);
          ax += nx * 0.45;
          ay += ny * 0.45;
        }
      }

      // hazards from director
      for (let i = 0; i < world.hazards.length; i++) {
        const hz = world.hazards[i];
        const dx = this.x - hz.x;
        const dy = this.y - hz.y;
        const d = vec.len(dx, dy);
        if (d < hz.r) {
          const [nx, ny] = vec.norm(dx, dy);
          const f = (hz.r - d) / hz.r;
          ax += nx * hz.force * f;
          ay += ny * hz.force * f;
          this.energy -= 0.008 * f;
        }
      }

      this.vx += ax * dt * 60;
      this.vy += ay * dt * 60;

      const base = this.role === "soldier" ? 2.9 : this.role === "scout" ? 2.65 : 2.4;
      const speed = c.strategy === "war" ? base + 0.45 : base;
      [this.vx, this.vy] = vec.clamp(this.vx, this.vy, speed);

      this.x += this.vx;
      this.y += this.vy;

      if (this.x < 0) {
        this.x = 0;
        this.vx *= -0.5;
      } else if (this.x > world.w) {
        this.x = world.w;
        this.vx *= -0.5;
      }
      if (this.y < 0) {
        this.y = 0;
        this.vy *= -0.5;
      } else if (this.y > world.h) {
        this.y = world.h;
        this.vy *= -0.5;
      }

      this.energy -= dt * (this.role === "soldier" ? 0.012 : 0.008);
      return this.energy > 0;
    }
  }

  class Food {
    constructor(x, y, amount, type) {
      this.x = x;
      this.y = y;
      this.amount = amount;
      this.type = type;
      this.r = Math.sqrt(amount) * 0.9;
    }

    take(v) {
      const g = Math.min(this.amount, v);
      this.amount -= g;
      this.r = Math.max(0, Math.sqrt(this.amount) * 0.9);
      return g;
    }

    get dead() {
      return this.amount <= 0.04;
    }
  }

  class Colony {
    constructor(type, color, shock, x) {
      this.type = type;
      this.color = color;
      this.colorShock = shock;
      this.nest = { x, y: world.h * rand(0.38, 0.62), r: 44 };
      this.agents = [];
      this.hash = new SpatialHash(CONFIG.cellSize);
      this.stock = 95;
      this.pressure = 0;
      this.strategy = "forage";
      this.wave = { x: world.w * 0.5, y: world.h * 0.5 };
      this.waveCooldown = 0;
      this.enemy = null;
      this.field = null;
      this.foodTrail = "beeFood";
      this.alarmTrail = "beeAlarm";
      this.warTrail = "beeAlarm";
      this.spark = 0;
    }

    setChannels(field, foodTrail, alarmTrail, warTrail) {
      this.field = field;
      this.foodTrail = foodTrail;
      this.alarmTrail = alarmTrail;
      this.warTrail = warTrail;
    }

    bootstrap(n) {
      for (let i = 0; i < n; i++) this.agents.push(new Agent(this));
    }

    closestFood(x, y, radius) {
      let best = null;
      let bestD = Infinity;
      const r2 = radius * radius;
      for (let i = 0; i < world.food.length; i++) {
        const f = world.food[i];
        const dx = f.x - x;
        const dy = f.y - y;
        const d = dx * dx + dy * dy;
        if (d < r2 && d < bestD) {
          best = f;
          bestD = d;
        }
      }
      return best;
    }

    evaluateStrategy(dt) {
      this.waveCooldown -= dt;
      const enemyStrength = this.enemy.agents.length / Math.max(1, this.agents.length);
      const stockPerHead = this.stock / Math.max(1, this.agents.length * 0.55);
      this.pressure = Math.max(0, 1 - stockPerHead) * 0.6 + Math.max(0, enemyStrength - 1) * 0.4;

      if (stockPerHead < 0.45) {
        this.strategy = "retreat";
      } else if (this.pressure > 0.72 && this.agents.length > 120) {
        this.strategy = "war";
      } else if (stockPerHead > 1.6 && this.agents.length > 90) {
        this.strategy = "raid";
      } else if (this.pressure > 0.45) {
        this.strategy = "defend";
      } else if (stockPerHead > 1.05) {
        this.strategy = "forage";
      } else {
        this.strategy = "scout";
      }

      if ((this.strategy === "war" || this.strategy === "raid") && this.waveCooldown <= 0) {
        this.wave = {
          x: this.enemy.nest.x + rand(-80, 80),
          y: this.enemy.nest.y + rand(-90, 90),
        };
        this.waveCooldown = rand(7, 15);
        addShockwave(this.nest.x, this.nest.y, this.colorShock);
      }
    }

    spawnAndUpkeep(dt) {
      this.stock = Math.max(0, this.stock - this.agents.length * dt * 0.0063);
      const dominanceBoost = this.agents.length < this.enemy.agents.length * 0.7 ? 1.35 : 1;
      const growRate = this.strategy === "forage" ? 0.08 : this.strategy === "retreat" ? 0.03 : 0.055;
      if (this.stock > 14 && this.agents.length < CONFIG.maxCount && Math.random() < growRate * dominanceBoost) {
        this.stock -= 10;
        this.agents.push(new Agent(this));
      }
    }

    spawnSpark(x, y) {
      this.spark += 1;
      if (this.spark % 3 !== 0) return;
      world.particles.push({
        x,
        y,
        vx: rand(-1, 1),
        vy: rand(-1, 1),
        life: rand(0.24, 0.64),
        hue: this.type === "bee" ? 42 : 352,
      });
    }

    update(dt) {
      this.evaluateStrategy(dt);
      const survivors = [];
      for (let i = 0; i < this.agents.length; i++) {
        const a = this.agents[i];
        if (a.update(dt)) survivors.push(a);
      }
      this.agents = survivors;
      this.spawnAndUpkeep(dt);
    }

    drawAgents() {
      const [r, g, b] = this.color;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = `rgba(${r},${g},${b},0.1)`;
      for (let i = 0; i < this.agents.length; i++) {
        const a = this.agents[i];
        ctx.beginPath();
        ctx.arc(a.x, a.y, 1.2 + a.carry * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = `rgba(${r},${g},${b},0.55)`;
      for (let i = 0; i < this.agents.length; i += 2) {
        const a = this.agents[i];
        ctx.beginPath();
        ctx.arc(a.x, a.y, 0.95, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      const gl = ctx.createRadialGradient(this.nest.x, this.nest.y, 2, this.nest.x, this.nest.y, this.nest.r * 2.2);
      gl.addColorStop(0, `rgba(${r},${g},${b},0.45)`);
      gl.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = gl;
      ctx.beginPath();
      ctx.arc(this.nest.x, this.nest.y, this.nest.r * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  class Director {
    constructor() {
      this.calmTimer = 0;
      this.balanceTimer = 0;
    }

    update(dt, bees, ants) {
      this.calmTimer += dt;
      this.balanceTimer += dt;

      const contestedX = (bees.nest.x + ants.nest.x) * 0.5;
      const contestedY = (bees.nest.y + ants.nest.y) * 0.5;
      const activeConflict = world.particles.length > 140;

      if (!activeConflict && this.calmTimer > 12) {
        spawnFood(contestedX + rand(-120, 120), contestedY + rand(-120, 120), rand(18, 40), "contested");
        if (Math.random() < 0.6) {
          world.hazards.push({ x: contestedX + rand(-160, 160), y: contestedY + rand(-120, 120), r: rand(60, 120), life: rand(7, 14), force: rand(0.4, 0.8) });
        }
        this.calmTimer = 0;
      }

      if (this.balanceTimer > 9) {
        const stronger = bees.agents.length > ants.agents.length ? bees : ants;
        const weaker = stronger === bees ? ants : bees;
        const ratio = stronger.agents.length / Math.max(1, weaker.agents.length);
        if (ratio > 1.35) {
          spawnFood(weaker.nest.x + rand(-130, 130), weaker.nest.y + rand(-110, 110), rand(26, 52), "relief");
          spawnFood(stronger.nest.x + rand(-100, 100), stronger.nest.y + rand(-100, 100), rand(9, 18), "scarce");
        }
        this.balanceTimer = 0;
      }
    }
  }

  const pheromones = new PheromoneField(CONFIG.pheromoneCell);
  const bees = new Colony("bee", [255, 195, 83], [255, 148, 80], 0);
  const ants = new Colony("ant", [170, 44, 70], [194, 62, 94], 0);
  bees.enemy = ants;
  ants.enemy = bees;
  bees.setChannels(pheromones, "beeFood", "beeAlarm", "beeAlarm");
  ants.setChannels(pheromones, "antFood", "antWar", "antWar");
  const director = new Director();

  function addShockwave(x, y, color) {
    world.shockwaves.push({ x, y, r: 8, life: 1, color });
  }

  function spawnFood(x = rand(world.w * 0.1, world.w * 0.9), y = rand(40, world.h - 40), amount = rand(14, 35), type = "wild") {
    if (world.food.length >= CONFIG.foodCap) return;
    world.food.push(new Food(x, y, amount, type));
  }

  function updateEnvironment(dt) {
    world.t += dt;
    world.season = (Math.sin((world.t / CONFIG.dayLength) * Math.PI * 2) + 1) * 0.5;

    if (Math.random() < 0.14) {
      world.particles.push({
        x: rand(0, world.w),
        y: rand(0, world.h),
        vx: rand(-0.15, 0.15),
        vy: rand(-0.15, 0.15),
        life: rand(2, 5),
        hue: Math.random() < 0.5 ? 44 : 350,
      });
    }

    if (Math.random() < 0.03) spawnFood();

    for (let i = world.food.length - 1; i >= 0; i--) {
      if (world.food[i].dead) world.food.splice(i, 1);
    }

    for (let i = world.hazards.length - 1; i >= 0; i--) {
      const h = world.hazards[i];
      h.life -= dt;
      if (h.life <= 0) world.hazards.splice(i, 1);
    }

    for (let i = world.particles.length - 1; i >= 0; i--) {
      const p = world.particles[i];
      p.life -= dt;
      p.x += p.vx;
      p.y += p.vy;
      if (p.life <= 0) world.particles.splice(i, 1);
    }

    for (let i = world.shockwaves.length - 1; i >= 0; i--) {
      const s = world.shockwaves[i];
      s.life -= dt * 0.65;
      s.r += dt * 120;
      if (s.life <= 0) world.shockwaves.splice(i, 1);
    }
  }

  class Renderer {
    static resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(innerWidth * dpr);
      canvas.height = Math.floor(innerHeight * dpr);
      canvas.style.width = `${innerWidth}px`;
      canvas.style.height = `${innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      world.w = innerWidth;
      world.h = innerHeight;
      pheromones.resize();
      bees.nest.x = world.w * 0.22;
      ants.nest.x = world.w * 0.78;
      bees.nest.y = world.h * rand(0.42, 0.58);
      ants.nest.y = world.h * rand(0.42, 0.58);
    }

    static background() {
      const night = 1 - world.season;
      const top = `rgb(${10 + night * 12}, ${12 + night * 15}, ${22 + night * 22})`;
      const bottom = `rgb(${20 + world.season * 18}, ${24 + world.season * 14}, ${38 + world.season * 18})`;
      const g = ctx.createLinearGradient(0, 0, 0, world.h);
      g.addColorStop(0, top);
      g.addColorStop(1, bottom);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, world.w, world.h);

      // cheap persistence for trails
      ctx.fillStyle = `rgba(8, 9, 14, ${0.16 - world.season * 0.05})`;
      ctx.fillRect(0, 0, world.w, world.h);

      const vg = ctx.createRadialGradient(world.w * 0.5, world.h * 0.45, world.h * 0.2, world.w * 0.5, world.h * 0.5, world.h * 0.75);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(0,0,0,0.35)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, world.w, world.h);
    }

    static food() {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      for (let i = 0; i < world.food.length; i++) {
        const f = world.food[i];
        const hue = f.type === "contested" ? 45 : f.type === "relief" ? 82 : 62;
        const gl = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 2.3);
        gl.addColorStop(0, `hsla(${hue},88%,62%,0.45)`);
        gl.addColorStop(1, `hsla(${hue},88%,62%,0)`);
        ctx.fillStyle = gl;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * 2.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    static particles() {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < world.particles.length; i++) {
        const p = world.particles[i];
        ctx.fillStyle = `hsla(${p.hue},85%,64%,${Math.min(0.7, p.life * 0.7)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }

      for (let i = 0; i < world.shockwaves.length; i++) {
        const s = world.shockwaves[i];
        ctx.strokeStyle = `rgba(${s.color[0]},${s.color[1]},${s.color[2]},${s.life * 0.25})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < world.hazards.length; i++) {
        const h = world.hazards[i];
        const gl = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, h.r);
        gl.addColorStop(0, `rgba(120,150,255,${Math.min(0.18, h.life * 0.02)})`);
        gl.addColorStop(1, "rgba(120,150,255,0)");
        ctx.fillStyle = gl;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function initWorld() {
    Renderer.resize();
    bees.bootstrap(CONFIG.initialCount);
    ants.bootstrap(CONFIG.initialCount);
    for (let i = 0; i < 20; i++) spawnFood();
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;

    updateEnvironment(dt);
    pheromones.step(dt);

    bees.hash.rebuild(bees.agents);
    ants.hash.rebuild(ants.agents);
    bees.update(dt);
    ants.update(dt);

    director.update(dt, bees, ants);

    Renderer.background();
    pheromones.render();
    Renderer.food();
    bees.drawAgents();
    ants.drawAgents();
    Renderer.particles();

    requestAnimationFrame(loop);
  }

  canvas.addEventListener("click", (e) => {
    spawnFood(e.clientX, e.clientY, rand(20, 42), "manual");
  });

  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    world.hazards.push({ x: e.clientX, y: e.clientY, r: rand(80, 130), life: 10, force: 1.2 });
  });

  window.addEventListener("resize", () => {
    Renderer.resize();
  });

  initWorld();
  requestAnimationFrame(loop);
})();
