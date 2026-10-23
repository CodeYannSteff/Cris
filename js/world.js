"use strict";
/* AsciiDream — the painted world: tiled ASCII of the two Renoirs, a wandering
   figure, god rays, drifting cloud-shadows, pollen, and a lantern glow. */
(function (global) {
  const AD = global.AD;
  const { clamp, lerp, smoothstep, ease, glyph, rng, makeCanvas, makeGlow, makeRays, makeVignette } = AD;

  const TILE = 16;
  const VISIBLE_ROWS = 112;
  const CELL_ASPECT = 0.6;
  const LRU_MAX = 400;

  const World = {};

  let scenes = []; /* [{id,x,y,cols,rows,rgb,lum}] world-space rects */
  let worldW = 0,
    worldH = 0;
  let W = 0,
    H = 0,
    DPR = 1;
  let cellH = 10,
    cellW = 6,
    viewCols = 100,
    viewRows = 100;

  const cam = { x: 0, y: 0, vx: 0, vy: 0 };
  const char = { x: 0, y: 0, vx: 0, vy: 0, face: 1, trail: [], alive: 0, phase: 0 };
  let input = { x: 0, y: 0, active: false };
  let wt = 0; /* world-local time */
  let charAlpha = 0;

  /* tile cache: key "tx,ty" → {canvas, stamp} */
  let tiles = new Map();
  let prewarmList = [];
  let prewarmIdx = 0;

  /* light furniture */
  let vignette = null;
  let rayCanvas = null;
  let poolGlow = null;
  let shadowGlow = null;
  let clouds = [],
    pools = [],
    pollen = [],
    voidStars = [];
  let gustAt = 6;

  function decodeScenes() {
    const data = global.ASCII_DATA;
    scenes = [];
    let x = 0;
    const order = ["alley", "sentier"];
    for (const id of order) {
      const s = data.scenes[id];
      if (!s) continue;
      const rgb = AD.b64decode(s.rgb);
      const lum = AD.b64decode(s.lum);
      scenes.push({ id, x, y: 0, cols: s.cols, rows: s.rows, rgb, lum });
      x += s.cols + (id === "alley" ? data.gap : 0);
    }
    worldW = x;
    worldH = data.rows;
  }

  function cellAt(cx, cy, out) {
    /* returns {r,g,b,a,l} or null */
    for (let i = 0; i < scenes.length; i++) {
      const s = scenes[i];
      if (cx < s.x || cx >= s.x + s.cols || cy < s.y || cy >= s.y + s.rows) continue;
      const lx = cx - s.x,
        ly = cy - s.y;
      const j = (ly * s.cols + lx) * 4;
      const a = s.rgb[j + 3];
      if (a < 8) return null;
      out.r = s.rgb[j];
      out.g = s.rgb[j + 1];
      out.b = s.rgb[j + 2];
      out.a = a / 255;
      out.l = s.lum[ly * s.cols + lx] / 255;
      return out;
    }
    return null;
  }

  function buildTile(tx, ty) {
    const key = tx + "," + ty;
    let t = tiles.get(key);
    if (t) {
      t.stamp = ++buildTile.counter;
      return t;
    }
    const { canvas: c, g } = makeCanvas(TILE * cellW, TILE * cellH, DPR);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `${(cellH * 0.94).toFixed(2)}px ${AD.MONO}`;
    const cell = { r: 0, g: 0, b: 0, a: 0, l: 0 };
    const x0 = tx * TILE,
      y0 = ty * TILE;
    for (let dy = 0; dy < TILE; dy++) {
      const cy = y0 + dy;
      if (cy >= worldH) break;
      for (let dx = 0; dx < TILE; dx++) {
        const cx = x0 + dx;
        if (cx >= worldW) break;
        const d = cellAt(cx, cy, cell);
        if (!d) continue;
        if (d.l < 0.04) continue;
        const ch = glyph(d.l);
        if (ch === " ") continue;
        const shade = 0.55 + 0.62 * d.l;
        g.globalAlpha = d.a;
        g.fillStyle = `rgb(${Math.min(255, (d.r * shade) | 0)},${Math.min(
          255,
          (d.g * shade) | 0
        )},${Math.min(255, (d.b * shade) | 0)})`;
        g.fillText(ch, (dx + 0.5) * cellW, (dy + 0.5) * cellH);
      }
    }
    t = { canvas: c, stamp: ++buildTile.counter };
    tiles.set(key, t);
    evict();
    return t;
  }
  buildTile.counter = 0;

  function evict() {
    if (tiles.size <= LRU_MAX) return;
    /* drop oldest non-critical */
    const arr = [...tiles.entries()].sort((a, b) => a[1].stamp - b[1].stamp);
    let over = tiles.size - LRU_MAX;
    for (const [k] of arr) {
      tiles.delete(k);
      if (--over <= 0) break;
    }
  }

  function buildPrewarm() {
    prewarmList = [];
    const txMax = Math.ceil(worldW / TILE),
      tyMax = Math.ceil(worldH / TILE);
    const sx = char.x / TILE,
      sy = char.y / TILE;
    for (let ty = 0; ty < tyMax; ty++)
      for (let tx = 0; tx < txMax; tx++)
        prewarmList.push({ tx, ty, d: (tx - sx) * (tx - sx) + (ty - sy) * (ty - sy) });
    prewarmList.sort((a, b) => a.d - b.d);
    prewarmIdx = 0;
  }

  /* ---------------- light / atmosphere sprites ---------------- */
  function buildAtmosphere() {
    vignette = makeVignette(W, H);
    rayCanvas = makeRays(W * 1.7, H * 1.5, 77);
    poolGlow = makeGlow(256, [
      [0, "rgba(255,240,200,0.85)"],
      [0.4, "rgba(255,228,170,0.28)"],
      [1, "rgba(255,220,150,0)"],
    ]);
    shadowGlow = makeGlow(256, [
      [0, "rgba(8,10,18,0.9)"],
      [0.5, "rgba(10,12,20,0.4)"],
      [1, "rgba(10,12,20,0)"],
    ]);

    const r = rng(314);
    clouds = [];
    for (let i = 0; i < 6; i++) {
      clouds.push({
        x: r() * worldW,
        y: r() * worldH,
        s: 26 + r() * 42, // radius in cells
        vx: 0.55 + r() * 1.1,
        ph: r() * 9,
        a: 0.06 + r() * 0.07,
      });
    }
    pools = [];
    for (let i = 0; i < 16; i++) {
      pools.push({
        x: r() * worldW,
        y: r() * worldH * 0.85,
        s: 9 + r() * 22,
        vx: 0.35 + r() * 0.8,
        ph: r() * 9,
        a: 0.05 + r() * 0.11,
      });
    }
    pollen = [];
    for (let i = 0; i < 120; i++) {
      pollen.push({
        x: r() * worldW,
        y: r() * worldH,
        z: 0.4 + r() * 0.6, // parallax + size factor
        vx: 0.15 + r() * 0.5,
        vy: -0.08 - r() * 0.28,
        ph: r() * 9,
        ch: ["·", ".", "o", "∙"][(r() * 4) | 0],
        warm: r() > 0.35,
      });
    }
    voidStars = [];
    const data = global.ASCII_DATA;
    const gap = data.gap || 48;
    const alley = scenes[0];
    const gx0 = alley.x + alley.cols;
    for (let i = 0; i < 150; i++) {
      voidStars.push({
        x: gx0 + 2 + r() * (gap - 4),
        y: 2 + r() * (worldH - 4),
        ph: r() * 9,
        ch: r() > 0.85 ? "+" : "·",
        a: 0.25 + r() * 0.55,
      });
    }
  }

  /* ---------------- lifecycle ---------------- */
  World.init = function (w, h, dpr) {
    W = w;
    H = h;
    DPR = dpr;
    decodeScenes();
    resize(w, h, dpr);
    /* start on the path of the covered alley */
    char.x = scenes[0].x + scenes[0].cols * 0.42;
    char.y = worldH * 0.78;
    cam.x = char.x - viewCols / 2;
    cam.y = char.y - viewRows / 2;
    clampCam();
    buildPrewarm();
    buildAtmosphere();
    if (AD.Life) {
      AD.Life.init({
        worldW: worldW,
        worldH: worldH,
        scenes: scenes,
        cellAt: cellAt,
      });
    }
    wt = 0;
    charAlpha = 0;
    char.trail = [];
    char.phase = 0;
  };

  function resize(w, h, dpr) {
    W = w;
    H = h;
    DPR = dpr;
    cellH = clamp(H / VISIBLE_ROWS, 6.5, 14);
    cellW = cellH * CELL_ASPECT;
    viewCols = W / cellW;
    viewRows = H / cellH;
    tiles.clear();
    buildPrewarm();
    buildAtmosphere();
    clampCam();
  }
  World.resize = resize;

  function clampCam() {
    const maxX = worldW - viewCols;
    const maxY = worldH - viewRows;
    if (maxX <= 0) cam.x = -maxX / 2;
    else cam.x = clamp(cam.x, 0, maxX);
    if (maxY <= 0) cam.y = -maxY / 2;
    else cam.y = clamp(cam.y, 0, maxY);
  }

  World.setInput = function (x, y, active) {
    input.x = x;
    input.y = y;
    input.active = active;
  };

  World.characterScreen = function () {
    return {
      x: (char.x - cam.x) * cellW,
      y: (char.y - cam.y) * cellH,
    };
  };

  /* ---------------- update ---------------- */
  World.update = function (dt, tReveal) {
    wt = tReveal;
    /* character drift */
    const sp = 15.5,
      acc = 42;
    const ax = input.active ? input.x : 0;
    const ay = input.active ? input.y : 0;
    char.vx += (ax * sp - char.vx) * (1 - Math.exp(-acc / sp * dt * 6));
    char.vy += (ay * sp * 0.72 - char.vy) * (1 - Math.exp(-acc / sp * dt * 6));
    if (!input.active) {
      char.vx *= Math.exp(-3.2 * dt);
      char.vy *= Math.exp(-3.2 * dt);
    }
    char.x = clamp(char.x + char.vx * dt, 1, worldW - 2);
    char.y = clamp(char.y + char.vy * dt, 1.5, worldH - 2);
    const speed = Math.hypot(char.vx, char.vy);
    if (Math.abs(char.vx) > 0.4) char.face = char.vx > 0 ? 1 : -1;
    /* walk phase: always advances, amplitude scales with speed in the draw */
    char.phase += dt * (2.2 + (speed / 8) * 6.4);

    /* trail */
    if (char.trail.length === 0 || Math.hypot(char.x - char.trail[0].x, char.y - char.trail[0].y) > 0.45) {
      char.trail.unshift({ x: char.x, y: char.y, t: 0 });
      if (char.trail.length > 22) char.trail.pop();
    }
    for (const p of char.trail) p.t += dt;

    /* camera: follow with lookahead + breathing */
    const lookX = char.x + char.vx * 0.55;
    const lookY = char.y + char.vy * 0.55;
    const tx = lookX - viewCols / 2 + Math.sin(wt * 0.5) * 1.6;
    const ty = lookY - viewRows / 2 + Math.cos(wt * 0.37) * 1.2;
    const k = 1 - Math.exp(-4.2 * dt);
    cam.x += (tx - cam.x) * k;
    cam.y += (ty - cam.y) * k;
    clampCam();

    /* clouds drift across the world */
    for (const c of clouds) {
      c.x += c.vx * dt;
      if (c.x - c.s > worldW) c.x = -c.s;
      c.y += Math.sin(wt * 0.2 + c.ph) * dt * 0.4;
    }
    for (const p of pools) {
      p.x += p.vx * dt;
      if (p.x - p.s > worldW) p.x = -p.s;
    }
    for (const m of pollen) {
      m.x += (m.vx + Math.sin(wt * 0.8 + m.ph) * 0.25) * dt;
      m.y += m.vy * dt + Math.cos(wt * 0.6 + m.ph) * 0.12 * dt;
      if (m.x > worldW) m.x -= worldW;
      if (m.x < 0) m.x += worldW;
      if (m.y < 0) m.y += worldH;
      if (m.y > worldH) m.y -= worldH;
    }

    /* gusts of light */
    gustAt -= dt;
    if (gustAt < -3) gustAt = 7 + Math.random() * 8;

    if (AD.Life) AD.Life.update(dt, wt);

    if (charAlpha < 1) charAlpha = Math.min(1, charAlpha + dt * 0.7);
  };

  /* prewarm a few tiles per frame (also during intro, so reveal is instant) */
  World.prewarm = function (budget) {
    let n = 0;
    while (prewarmIdx < prewarmList.length && n < budget) {
      const p = prewarmList[prewarmIdx++];
      buildTile(p.tx, p.ty);
      n++;
    }
    return prewarmIdx >= prewarmList.length;
  };

  /* ---------------- render ---------------- */
  World.render = function (ctx, opts) {
    const alpha = opts.alpha != null ? opts.alpha : 1;
    const scale = opts.scale != null ? opts.scale : 1;
    const showChar = opts.charAlpha != null ? opts.charAlpha : charAlpha;

    ctx.save();
    if (scale !== 1) {
      ctx.translate(W / 2, H / 2);
      ctx.scale(scale, scale);
      ctx.translate(-W / 2, -H / 2);
    }
    ctx.globalAlpha = alpha;

    /* --- tiles --- */
    const tx0 = Math.floor(cam.x / TILE),
      tx1 = Math.floor((cam.x + viewCols) / TILE);
    const ty0 = Math.floor(cam.y / TILE),
      ty1 = Math.floor((cam.y + viewRows) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const key = tx + "," + ty;
        let t = tiles.get(key);
        if (!t) t = buildTile(tx, ty);
        else t.stamp = ++buildTile.counter;
        if (!t || !t.canvas.width) continue;
        const dx = Math.round((tx * TILE - cam.x) * cellW * DPR) / DPR;
        const dy = Math.round((ty * TILE - cam.y) * cellH * DPR) / DPR;
        const dw = Math.round(TILE * cellW * DPR) / DPR;
        const dh = Math.round(TILE * cellH * DPR) / DPR;
        ctx.drawImage(t.canvas, dx, dy, dw, dh);
      }
    }

    /* --- void stars in the passage between paintings --- */
    const tw = ["·", ":", "+", "×"];
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${(cellH * 0.9).toFixed(2)}px ${AD.MONO}`;
    for (const s of voidStars) {
      const sx = (s.x - cam.x) * cellW,
        sy = (s.y - cam.y) * cellH;
      if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;
      const f = 0.55 + 0.45 * Math.sin(wt * 1.4 + s.ph);
      ctx.globalAlpha = alpha * s.a * f;
      ctx.fillStyle = "#cdd8f5";
      ctx.fillText(tw[(Math.floor(wt * 1.8 + s.ph) % 4 + 4) % 4], sx, sy);
    }

    /* --- drifting cloud shadows (multiply) --- */
    ctx.globalCompositeOperation = "multiply";
    for (const c of clouds) {
      const sx = (c.x - cam.x) * cellW,
        sy = (c.y - cam.y) * cellH;
      const r = c.s * cellH * 1.6;
      if (sx < -r || sx > W + r || sy < -r || sy > H + r) continue;
      ctx.globalAlpha = alpha * c.a * (0.8 + 0.2 * Math.sin(wt * 0.5 + c.ph));
      ctx.drawImage(shadowGlow, sx - r, sy - r, r * 2, r * 2);
    }

    /* --- god rays (screen) --- */
    ctx.globalCompositeOperation = "screen";
    const rayDrift = ((wt * 9 - cam.x * cellW * 0.06) % (W * 0.55) + W * 0.55) % (W * 0.55);
    ctx.globalAlpha = alpha * (0.075 + 0.03 * Math.sin(wt * 0.33));
    ctx.drawImage(rayCanvas, -W * 0.35 + rayDrift * 0.4, -H * 0.12 + Math.sin(wt * 0.21) * 14, W * 1.7, H * 1.5);
    ctx.globalAlpha = alpha * (0.055 + 0.025 * Math.cos(wt * 0.27));
    ctx.drawImage(rayCanvas, -W * 0.75 + rayDrift, -H * 0.2 + Math.cos(wt * 0.18) * 18, W * 2.1, H * 1.7);

    /* --- dappled light pools (screen) --- */
    for (const p of pools) {
      const sx = (p.x - cam.x) * cellW,
        sy = (p.y - cam.y) * cellH;
      const r = p.s * cellH * 1.9;
      if (sx < -r || sx > W + r || sy < -r || sy > H + r) continue;
      const flick = 0.7 + 0.3 * Math.sin(wt * 1.1 + p.ph * 2);
      ctx.globalAlpha = alpha * p.a * flick;
      ctx.drawImage(poolGlow, sx - r, sy - r, r * 2, r * 2);
    }

    /* --- mist + bonfire light (screen) --- */
    if (AD.Life) {
      AD.Life.renderAtmos(ctx, { alpha, cam, cellW, cellH, W, H, wt });
    }

    /* --- breeze gust band --- */
    if (gustAt > 0 && gustAt < 2.2) {
      const gp = 1 - gustAt / 2.2;
      const gx = lerp(-W * 0.3, W * 1.1, ease.inOutSine(gp));
      const gw = W * 0.4;
      const grad = ctx.createLinearGradient(gx - gw, 0, gx + gw, 0);
      grad.addColorStop(0, "rgba(255,244,220,0)");
      grad.addColorStop(0.5, `rgba(255,244,220,${(0.055 * Math.sin(gp * PI_)).toFixed(3)})`);
      grad.addColorStop(1, "rgba(255,244,220,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(gx - gw, 0, gw * 2, H);
    }

    ctx.globalCompositeOperation = "source-over";

    /* --- pollen motes --- */
    ctx.font = `${(cellH * 0.9).toFixed(2)}px ${AD.MONO}`;
    for (const m of pollen) {
      const par = m.z;
      const sx = (m.x - cam.x * par) * cellW * (0.6 + par * 0.5);
      const sy = (m.y - cam.y * par) * cellH * (0.6 + par * 0.5);
      /* wrap into view region roughly */
      const wx = ((sx % (W + 80)) + W + 80) % (W + 80) - 40;
      const wy = ((sy % (H + 80)) + H + 80) % (H + 80) - 40;
      const a = (0.25 + 0.55 * (0.5 + 0.5 * Math.sin(wt * 2.2 + m.ph))) * par;
      ctx.globalAlpha = alpha * a;
      ctx.fillStyle = m.warm ? "#ffe9c4" : "#d8e6ff";
      ctx.fillText(m.ch, wx, wy);
    }

    /* --- life: bonfires, fireflies, leaves, birds --- */
    if (AD.Life) {
      AD.Life.renderEntities(ctx, { alpha, cam, cellW, cellH, W, H, wt });
    }

    /* --- the wanderer --- */
    if (showChar > 0.01) drawCharacter(ctx, alpha * showChar);

    /* --- vignette --- */
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = alpha * 0.72;
    ctx.drawImage(vignette, 0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.restore();
  };

  const PI_ = Math.PI;

  function drawCharacter(ctx, a) {
    const sx = (char.x - cam.x) * cellW;
    const sy = (char.y - cam.y) * cellH;
    if (sx < -60 || sx > W + 60 || sy < -60 || sy > H + 60) return;

    const speed = Math.hypot(char.vx, char.vy);
    const walk = clamp(speed / 8, 0, 1);
    const ph = char.phase;
    const bob = -Math.abs(Math.sin(ph)) * cellH * 0.14 * walk + Math.sin(wt * 1.5) * cellH * 0.035;
    const lean = clamp(char.vx * 0.016, -0.09, 0.09);

    /* lantern glow — warm, flickering presence */
    const flick = 0.82 + 0.18 * (0.5 + 0.5 * Math.sin(wt * 9.3 + Math.sin(wt * 4.1) * 2));
    const gr = cellH * (6.8 + walk * 1.4) * flick;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = a * 0.46 * flick;
    ctx.drawImage(poolGlow, sx - gr, sy - gr * 1.05 - bob, gr * 2, gr * 2.1);
    ctx.restore();

    /* trail sparks */
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 1; i < char.trail.length; i++) {
      const p = char.trail[i];
      const life = Math.max(0, 1 - p.t / 1.1);
      if (life <= 0) continue;
      ctx.globalAlpha = a * life * 0.4;
      ctx.fillStyle = "#ffe2b0";
      ctx.font = `${(cellH * 0.75).toFixed(2)}px ${AD.MONO}`;
      const px = (p.x - cam.x) * cellW + Math.sin(p.t * 7 + i) * cellW * 0.3;
      const py = (p.y - cam.y) * cellH - p.t * cellH * 0.8;
      ctx.fillText("·", px, py);
    }
    ctx.restore();

    /* soft shadow puddle */
    ctx.save();
    ctx.globalAlpha = a * 0.3;
    ctx.fillStyle = "rgba(6,8,12,0.8)";
    ctx.beginPath();
    ctx.ellipse(sx, sy + cellH * 0.95, cellW * 1.4, cellH * 0.32, 0, 0, PI_ * 2);
    ctx.fill();
    ctx.restore();

    /* the wanderer: hat, lantern, a walk that reads */
    const u = cellH;
    ctx.save();
    ctx.translate(sx, sy + bob);
    ctx.rotate(lean);
    ctx.scale(char.face, 1);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${(cellH * 0.96).toFixed(2)}px ${AD.MONO}`;

    /* legs — stride amplitude follows speed, converge to rest when idle */
    const legF = Math.sin(ph) * walk;
    const legB = Math.sin(ph + Math.PI) * walk;
    const legChar = (s) => (Math.abs(s) < 0.14 ? "|" : s > 0 ? "/" : "\\");
    ctx.globalAlpha = a * 0.95;
    ctx.fillStyle = "#e8dcc8";
    ctx.fillText(legChar(legF), (0.32 + legF * 0.5) * u, (0.32 - Math.max(0, legF) * 0.14) * u);
    ctx.fillText(legChar(legB), (-0.32 + legB * 0.5) * u, (0.32 - Math.max(0, legB) * 0.14) * u);

    /* coat — torso with flared hem + fluttering tail behind */
    const tail = Math.sin(wt * 7 + ph) * (0.1 + walk * 0.34);
    ctx.fillStyle = "#d8ccba";
    ctx.globalAlpha = a * 0.85;
    ctx.fillText("(", (-0.42 - tail * 0.4) * u, -0.55 * u);
    ctx.fillStyle = "#f2e8d8";
    ctx.globalAlpha = a;
    ctx.fillText("|", 0.04 * u, -1.62 * u);
    ctx.fillText("|", 0.02 * u, -1.0 * u);
    ctx.fillText(")", 0.4 * u, -0.55 * u);

    /* arms — free arm swings opposite the legs */
    const armSw = -legF * 0.32;
    ctx.globalAlpha = a * 0.92;
    ctx.fillStyle = "#f2e8d8";
    ctx.fillText(legF > 0 ? "/" : "\\", (-0.48 + armSw) * u, -1.35 * u);

    /* lantern arm — held forward, lantern pendulums gently */
    ctx.fillText("\\", 0.52 * u, -1.35 * u);
    const swing = Math.sin(ph * 0.5 + 0.9) * 0.14 * (0.3 + walk);
    const lantX = (0.78 + swing) * u;
    const lantY = -0.62 * u;
    ctx.fillStyle = "#ffd9a0";
    ctx.globalAlpha = a * (0.85 + 0.15 * flick);
    ctx.fillText("o", lantX, lantY);
    ctx.fillStyle = "#fff3d0";
    ctx.globalAlpha = a;
    ctx.fillText("·", lantX, lantY);

    /* head + traveler's hat */
    ctx.fillStyle = "#fff6e8";
    ctx.globalAlpha = a;
    ctx.fillText("o", 0.02 * u, -2.3 * u);
    ctx.fillStyle = "#d8ccba";
    ctx.globalAlpha = a * 0.95;
    ctx.fillText("-", -0.72 * u, -2.78 * u);
    ctx.fillText("n", 0.02 * u, -2.95 * u);
    ctx.fillText("-", 0.76 * u, -2.78 * u);

    /* inner ember at the heart */
    ctx.globalAlpha = a * 0.85;
    ctx.fillStyle = "#ffe9bf";
    ctx.fillText("·", 0.02 * u, -1.35 * u);
    ctx.restore();
  }

  World.debug = function () {
    return { tiles: tiles.size, cam: { ...cam }, char: { x: char.x, y: char.y }, worldW, worldH, cellH, cellW };
  };

  global.AD.World = World;
})(window);
