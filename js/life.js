"use strict";
/* AsciiDream — life: bonfires, fireflies, drifting leaves, passing birds, mist.
   World-space entities rendered in screen space by the world each frame. */
(function (global) {
  const AD = global.AD;
  const { clamp, rng, makeGlow } = AD;

  const Life = {};

  let worldW = 0,
    worldH = 0;
  let scenes = [];
  let cellAt = null;
  let fires = [],
    flies = [],
    leaves = [],
    birds = [],
    fogs = [];
  let fireGlow = null,
    fogGlow = null;
  let nextFlockAt = 7;

  const FLAME_CH = ["^", "*", "x", "+", "~", "·"];
  const SMOKE_CH = [",", ";", "~", "·", "`"];
  const LEAF_CH = ["~", "`", ",", "."];
  const LEAF_COL = [
    [188, 150, 88],
    [142, 146, 84],
    [166, 104, 64],
    [206, 176, 110],
  ];

  function findGround(x, y0) {
    /* nearest cell with ink around the wanted y — fires sit on painted ground */
    if (!cellAt) return y0;
    const c = { r: 0, g: 0, b: 0, a: 0, l: 0 };
    const xi = Math.round(x);
    for (let d = 0; d <= 14; d++) {
      for (const yy of d === 0 ? [y0] : [y0 - d, y0 + d]) {
        if (yy < 2 || yy > worldH - 2) continue;
        if (cellAt(xi, Math.round(yy), c)) return yy;
      }
    }
    return y0;
  }

  function makeFire(x, y, seed) {
    const r = rng(seed);
    const flames = [];
    for (let i = 0; i < 22; i++)
      flames.push({ o: r(), sp: 0.55 + r() * 0.5, j: r() * 9, j2: r() * 7 });
    const embers = [];
    for (let i = 0; i < 7; i++)
      embers.push({ o: r(), sp: 0.28 + r() * 0.25, j: r() * 9 });
    const smoke = [];
    for (let i = 0; i < 9; i++)
      smoke.push({ o: r(), sp: 0.16 + r() * 0.12, j: r() * 9, ch: (r() * SMOKE_CH.length) | 0 });
    return {
      x: x,
      y: y,
      seed: seed,
      flames: flames,
      embers: embers,
      smoke: smoke,
      logs: [
        { dx: -0.9, dy: 0.42, ch: "\\" },
        { dx: 0, dy: 0.5, ch: "_" },
        { dx: 0.9, dy: 0.42, ch: "/" },
        { dx: -0.45, dy: 0.3, ch: "=" },
        { dx: 0.45, dy: 0.3, ch: "=" },
      ],
    };
  }

  Life.init = function (opts) {
    worldW = opts.worldW;
    worldH = opts.worldH;
    scenes = opts.scenes;
    cellAt = opts.cellAt;
    const r = rng(8181);

    /* bonfires along the paths of both paintings */
    fires = [];
    const spots = [
      [0, 0.3, 0.8],
      [0, 0.67, 0.77],
      [1, 0.34, 0.82],
      [1, 0.7, 0.78],
    ];
    spots.forEach((s, i) => {
      const sc = scenes[s[0]];
      if (!sc) return;
      const x = sc.x + sc.cols * s[1];
      const y = findGround(x, worldH * s[2]);
      fires.push(makeFire(x, y, 70 + i * 13));
    });

    /* fireflies — confined to the painted scenes, never the void */
    flies = [];
    for (let i = 0; i < 46; i++) {
      const sc = scenes[(r() * scenes.length) | 0];
      if (!sc) continue;
      flies.push({
        x: sc.x + 6 + r() * (sc.cols - 12),
        y: worldH * (0.2 + r() * 0.7),
        ph: r() * 9,
        rate: 1.2 + r() * 1.4,
        ch: r() > 0.5 ? "o" : "·",
      });
    }

    /* falling leaves */
    leaves = [];
    for (let i = 0; i < 40; i++) {
      const sc = scenes[(r() * scenes.length) | 0];
      if (!sc) continue;
      leaves.push({
        x: sc.x + 4 + r() * (sc.cols - 8),
        y: r() * worldH,
        vy: 1.4 + r() * 2.2,
        ph: r() * 9,
        ch: LEAF_CH[(r() * LEAF_CH.length) | 0],
        col: LEAF_COL[(r() * LEAF_COL.length) | 0],
        a: 0.35 + r() * 0.3,
      });
    }

    /* low mist pools */
    fogs = [];
    for (let i = 0; i < 4; i++) {
      fogs.push({
        x: r() * worldW,
        y: worldH * (0.45 + r() * 0.38),
        s: 30 + r() * 46,
        vx: 0.2 + r() * 0.45,
        ph: r() * 9,
        a: 0.03 + r() * 0.035,
      });
    }

    birds = [];
    nextFlockAt = 6;

    fireGlow = makeGlow(256, [
      [0, "rgba(255,200,120,0.9)"],
      [0.35, "rgba(255,160,80,0.32)"],
      [1, "rgba(255,120,50,0)"],
    ]);
    fogGlow = makeGlow(256, [
      [0, "rgba(226,238,255,0.7)"],
      [0.55, "rgba(210,226,250,0.22)"],
      [1, "rgba(200,218,250,0)"],
    ]);
  };

  function spawnFlock() {
    const r = rng((Math.random() * 1e9) | 0);
    const fromLeft = r() > 0.5;
    const y = worldH * (0.1 + r() * 0.32);
    const vx = (fromLeft ? 1 : -1) * (13 + r() * 7);
    const n = 3 + ((r() * 3) | 0);
    for (let i = 0; i < n; i++) {
      birds.push({
        x: (fromLeft ? -6 : worldW + 6) - (fromLeft ? 1 : -1) * i * 2.4,
        y: y + i * (i % 2 ? 1.6 : -1.4),
        vx: vx + r() * 1.4 - 0.7,
        ph: r() * 9,
        a: 0.55 + r() * 0.35,
      });
    }
  }

  Life.update = function (dt, t) {
    for (const f of fogs) {
      f.x += f.vx * dt;
      if (f.x - f.s > worldW) f.x = -f.s;
    }
    for (const lf of leaves) {
      lf.x += (Math.sin(t * 0.9 + lf.ph) * 0.9 + 0.25) * dt;
      lf.y += lf.vy * dt;
      if (lf.y > worldH * 0.94) {
        lf.y = worldH * (0.05 + Math.random() * 0.2);
        const sc = scenes[(Math.random() * scenes.length) | 0];
        if (sc) lf.x = sc.x + 4 + Math.random() * (sc.cols - 8);
      }
    }
    nextFlockAt -= dt;
    if (nextFlockAt < 0) {
      spawnFlock();
      nextFlockAt = 12 + Math.random() * 14;
    }
    for (let i = birds.length - 1; i >= 0; i--) {
      const b = birds[i];
      b.x += b.vx * dt;
      b.y += Math.sin(t * 2.1 + b.ph) * dt * 1.6;
      if (b.x < -14 || b.x > worldW + 14) birds.splice(i, 1);
    }
  };

  /* ---------------- glow pass (screen) ---------------- */
  Life.renderAtmos = function (ctx, st) {
    const { alpha, cam, cellW, cellH, W, H, wt } = st;

    /* mist */
    ctx.globalCompositeOperation = "screen";
    for (const f of fogs) {
      const sx = (f.x - cam.x) * cellW,
        sy = (f.y - cam.y) * cellH;
      const rx = f.s * cellW,
        ry = f.s * cellH * 0.5;
      if (sx < -rx || sx > W + rx || sy < -ry || sy > H + ry) continue;
      ctx.globalAlpha = alpha * f.a * (0.75 + 0.25 * Math.sin(wt * 0.3 + f.ph));
      ctx.drawImage(fogGlow, sx - rx, sy - ry, rx * 2, ry * 2);
    }

    /* bonfire light */
    for (const f of fires) {
      const sx = (f.x - cam.x) * cellW,
        sy = (f.y - cam.y) * cellH;
      const r0 = cellH * 15;
      if (sx < -r0 || sx > W + r0 || sy < -r0 || sy > H + r0) continue;
      const fl = 0.78 + 0.22 * Math.sin(wt * 9.1 + f.seed) + 0.1 * Math.sin(wt * 23 + f.seed * 2);
      const rr = r0 * (0.85 + 0.15 * fl);
      ctx.globalAlpha = alpha * 0.15 * fl;
      ctx.drawImage(fireGlow, sx - rr, sy - rr * 0.9, rr * 2, rr * 1.8);
      const r1 = cellH * 6;
      ctx.globalAlpha = alpha * 0.3 * fl;
      ctx.drawImage(fireGlow, sx - r1, sy - r1 * 1.1, r1 * 2, r1 * 2.2);
    }
  };

  /* ---------------- text entities (source-over) ---------------- */
  Life.renderEntities = function (ctx, st) {
    const { alpha, cam, cellW, cellH, W, H, wt } = st;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const u = cellH;
    const inView = (sx, sy, pad) =>
      sx > -pad && sx < W + pad && sy > -pad && sy < H + pad;

    /* ---- bonfires: logs, flames, embers, smoke ---- */
    for (const f of fires) {
      const sx = (f.x - cam.x) * cellW,
        sy = (f.y - cam.y) * cellH;
      if (!inView(sx, sy, u * 24)) continue;
      const fl = 0.72 + 0.28 * Math.sin(wt * 9.1 + f.seed) + 0.12 * Math.sin(wt * 23 + f.seed * 2);

      /* logs */
      ctx.font = `${(u * 0.9).toFixed(2)}px ${AD.MONO}`;
      for (const lg of f.logs) {
        ctx.globalAlpha = alpha * 0.75;
        ctx.fillStyle = "#9a8266";
        ctx.fillText(lg.ch, sx + lg.dx * u, sy + lg.dy * u);
      }
      /* heart embers in the logs */
      ctx.globalAlpha = alpha * (0.5 + 0.4 * fl);
      ctx.fillStyle = "#ff9a50";
      ctx.fillText("·", sx - u * 0.3, sy + u * 0.36);
      ctx.fillText("·", sx + u * 0.34, sy + u * 0.4);

      /* flames — additive */
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const fh = u * (3.2 + 2.2 * fl);
      for (const p of f.flames) {
        const t = (wt * p.sp * 1.4 + p.o) % 1;
        const rise = t * fh;
        const wob = Math.sin(t * 9 + p.j) * u * 0.55 * (1 - t * 0.4);
        const ch = FLAME_CH[Math.min(FLAME_CH.length - 1, (t * FLAME_CH.length) | 0)];
        let r, g, b;
        if (t < 0.34) { r = 255; g = 240; b = 190; }
        else if (t < 0.68) { r = 255; g = 190; b = 90; }
        else { r = 255; g = 120; b = 58; }
        ctx.globalAlpha = alpha * (1 - t) * 0.85 * fl;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.font = `${(u * 0.85).toFixed(2)}px ${AD.MONO}`;
        ctx.fillText(ch, sx + wob, sy - rise + u * 0.15);
      }
      /* embers rise higher */
      for (const p of f.embers) {
        const t = (wt * p.sp + p.o) % 1;
        const rise = t * u * 11;
        const wob = Math.sin(t * 6 + p.j) * u * 1.3 * t;
        ctx.globalAlpha = alpha * (1 - t) * (1 - t) * 0.9;
        ctx.fillStyle = t < 0.5 ? "#ffd28a" : "#ff8a4a";
        ctx.fillText(t < 0.45 ? "*" : "·", sx + wob, sy - rise);
      }
      ctx.restore();

      /* smoke */
      ctx.font = `${(u * 0.85).toFixed(2)}px ${AD.MONO}`;
      for (const p of f.smoke) {
        const t = (wt * p.sp + p.o) % 1;
        const rise = t * u * 14;
        const wob = Math.sin(t * 3.5 + p.j) * u * 1.8 * t + t * u * 1.2;
        const fade = Math.sin(t * Math.PI);
        ctx.globalAlpha = alpha * fade * 0.12;
        ctx.fillStyle = "#9aa3b5";
        ctx.fillText(SMOKE_CH[p.ch], sx + wob, sy - rise - u * 1.5);
      }
    }

    /* ---- fireflies ---- */
    ctx.font = `${(u * 0.85).toFixed(2)}px ${AD.MONO}`;
    for (const fl of flies) {
      const x = fl.x + Math.sin(wt * 0.4 + fl.ph) * 3;
      const y = fl.y + Math.cos(wt * 0.33 + fl.ph * 1.7) * 2.2;
      const sx = (x - cam.x) * cellW,
        sy = (y - cam.y) * cellH;
      if (!inView(sx, sy, 20)) continue;
      const b = clamp(Math.sin(wt * fl.rate + fl.ph * 3.1) * Math.sin(wt * 0.47 + fl.ph * 2.3) * 2.4, 0, 1);
      if (b < 0.04) continue;
      ctx.globalAlpha = alpha * (0.12 + 0.8 * b);
      ctx.fillStyle = "#ffe9a0";
      ctx.fillText(fl.ch, sx, sy);
    }

    /* ---- falling leaves ---- */
    for (const lf of leaves) {
      const x = lf.x + Math.sin(wt * 1.1 + lf.ph) * 1.4;
      const sx = (x - cam.x) * cellW,
        sy = (lf.y - cam.y) * cellH;
      if (!inView(sx, sy, 20)) continue;
      ctx.globalAlpha = alpha * lf.a * (0.7 + 0.3 * Math.sin(wt * 2 + lf.ph));
      ctx.fillStyle = `rgb(${lf.col[0]},${lf.col[1]},${lf.col[2]})`;
      ctx.fillText(lf.ch, sx, sy);
    }

    /* ---- birds ---- */
    for (const b of birds) {
      const sx = (b.x - cam.x) * cellW,
        sy = (b.y - cam.y) * cellH;
      if (!inView(sx, sy, 30)) continue;
      const flap = Math.sin(wt * 9 + b.ph);
      const ch = flap > 0.25 ? "v" : flap < -0.25 ? "~" : "-";
      ctx.globalAlpha = alpha * b.a * 0.7;
      ctx.fillStyle = "#c8d4ea";
      ctx.fillText(ch, sx, sy);
    }
  };

  global.AD.Life = Life;
})(window);
