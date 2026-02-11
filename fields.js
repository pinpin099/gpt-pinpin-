export class Field {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.data = new Float32Array(cols * rows);
    this.tmp = new Float32Array(cols * rows);
  }

  clear(value = 0) {
    this.data.fill(value);
  }

  index(x, y) {
    const cx = Math.max(0, Math.min(this.cols - 1, x | 0));
    const cy = Math.max(0, Math.min(this.rows - 1, y | 0));
    return cy * this.cols + cx;
  }

  addWorld(wx, wy, amount, worldW, worldH, radius = 0) {
    const fx = (wx / worldW) * this.cols;
    const fy = (wy / worldH) * this.rows;
    const ir = Math.max(0, radius | 0);

    for (let oy = -ir; oy <= ir; oy++) {
      for (let ox = -ir; ox <= ir; ox++) {
        const d = Math.hypot(ox, oy);
        if (d > ir && ir > 0) continue;
        const i = this.index(fx + ox, fy + oy);
        const gain = ir > 0 ? amount * (1 - d / (ir + 0.0001)) : amount;
        this.data[i] = Math.min(1.4, this.data[i] + gain);
      }
    }
  }

  sampleWorld(wx, wy, worldW, worldH) {
    const fx = (wx / worldW) * this.cols;
    const fy = (wy / worldH) * this.rows;
    return this.data[this.index(fx, fy)];
  }

  // Cheap diffusion + evaporation step, suitable for realtime use.
  step(diffusion, decay, dt) {
    this.tmp.set(this.data);
    const c = this.cols;
    const r = this.rows;

    for (let y = 1; y < r - 1; y++) {
      const row = y * c;
      for (let x = 1; x < c - 1; x++) {
        const i = row + x;
        const center = this.tmp[i];
        const lap =
          this.tmp[i - 1] +
          this.tmp[i + 1] +
          this.tmp[i - c] +
          this.tmp[i + c] -
          center * 4;
        let v = center + lap * diffusion * dt;
        v *= 1 - decay * dt;
        this.data[i] = v > 0.0004 ? v : 0;
      }
    }
  }
}
