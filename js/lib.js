"use strict";
/* AsciiDream — shared primitives: math, easing, sprite factories, ASCII spheres */
(function (global) {
  const AD = (global.AD = global.AD || {});

  AD.MONO =
    '"DejaVu Sans Mono","Liberation Mono","JetBrains Mono","Fira Code",Menlo,Consolas,"Courier New",monospace';

  /* Density ramp: space (void/night) → full ink (highlight) */
  AD.RAMP = (
    " .'`^\",:;Il!i><~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$"
  ).split("");
  AD.RAMP_N = AD.RAMP.length;
  AD.glyph = function (l) {
    let i = (l * AD.RAMP_N) | 0;
    if (i < 0) i = 0;
    else if (i >= AD.RAMP_N) i = AD.RAMP_N - 1;
    return AD.RAMP[i];
  };

  /* Smooth-art ramp: symbols only — used for spheres/eye so gradients
     read as light, never as words. */
  AD.RAMP_S = " .,:;~=+*xXW#%@&".split("");
  AD.RAMP_S_N = AD.RAMP_S.length;
  AD.glyphS = function (l) {
    let i = (l * AD.RAMP_S_N) | 0;
    if (i < 0) i = 0;
    else if (i >= AD.RAMP_S_N) i = AD.RAMP_S_N - 1;
    return AD.RAMP_S[i];
  };

  AD.b64decode = function (s) {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };

  AD.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  AD.lerp = (a, b, t) => a + (b - a) * t;

  AD.smoothstep = function (a, b, x) {
    const t = AD.clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };

  AD.ease = {
    linear: (t) => t,
    inCubic: (t) => t * t * t,
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inOutCubic: (t) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    inQuint: (t) => t * t * t * t * t,
    outQuint: (t) => 1 - Math.pow(1 - t, 5),
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    outBack: (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2),
  };

  /* deterministic rng */
  AD.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  AD.hash1 = function (n) {
    const s = Math.sin(n * 127.1) * 43758.5453;
    return s - Math.floor(s);
  };

  /* smooth value noise in [0,1] */
  AD.vnoise = function (x, y) {
    const xi = Math.floor(x),
      yi = Math.floor(y);
    const xf = x - xi,
      yf = y - yi;
    const h = (i, j) => AD.hash1(i * 127.1 + j * 311.7);
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = h(xi, yi),
      b = h(xi + 1, yi),
      c = h(xi, yi + 1),
      d = h(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };

  AD.makeCanvas = function (w, h, dpr) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.ceil(w * dpr));
    c.height = Math.max(1, Math.ceil(h * dpr));
    const g = c.getContext("2d");
    g.scale(dpr, dpr);
    return { canvas: c, g: g, w: w, h: h };
  };

  /* soft radial glow sprite */
  AD.makeGlow = function (r, stops) {
    const c = document.createElement("canvas");
    const s = Math.ceil(r * 2);
    c.width = c.height = s;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    for (const [t, col] of stops) grad.addColorStop(t, col);
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    return c;
  };

  /* screen-space god rays: soft slanted beams fading down */
  AD.makeRays = function (w, h, seed) {
    const { canvas: c, g } = AD.makeCanvas(w, h, 1);
    const rnd = AD.rng(seed);
    g.globalCompositeOperation = "lighter";
    const n = 9;
    for (let i = 0; i < n; i++) {
      const x = (i + rnd() * 0.7) * (w / n);
      const wdt = w * (0.028 + rnd() * 0.06);
      g.save();
      g.translate(x, -h * 0.12);
      g.rotate(0.22 + rnd() * 0.1);
      const grad = g.createLinearGradient(0, 0, 0, h * 1.35);
      const a = 0.5 + rnd() * 0.5;
      grad.addColorStop(0, `rgba(255,246,224,${0.5 * a})`);
      grad.addColorStop(0.45, `rgba(255,240,210,${0.16 * a})`);
      grad.addColorStop(1, "rgba(255,238,200,0)");
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(-wdt / 2, 0);
      g.lineTo(wdt / 2, 0);
      g.lineTo(wdt * 1.7, h * 1.45);
      g.lineTo(-wdt * 1.7, h * 1.45);
      g.closePath();
      g.fill();
      g.restore();
    }
    return c;
  };

  AD.makeVignette = function (w, h) {
    const { canvas: c, g } = AD.makeCanvas(w, h, 1);
    const cx = w / 2,
      cy = h / 2;
    const rad = Math.hypot(cx, cy);
    const grad = g.createRadialGradient(cx, cy, rad * 0.52, cx, cy, rad);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.7, "rgba(248,248,252,1)");
    grad.addColorStop(1, "rgba(168,172,188,1)");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    return c;
  };

  /*
   * ASCII sphere sprite.
   * opts: { cell, rgb, light (fn →[x,y,z] unit), bands, craters, ring,
   *         amb, gamma, tone(fn → rgb multiplier per cell) }
   */
  AD.asciiSphere = function (R, opts) {
    const cell = opts.cell; // {w,h}
    /* cells are ~0.6 aspect: use more columns than rows so the sprite
       occupies a physical square and spheres render round */
    const rows = R * 2 + 1;
    const cols = Math.max(rows, Math.round(rows * (cell.h / cell.w)));
    const w = cols * cell.w,
      h = rows * cell.h;
    const { canvas: c, g } = AD.makeCanvas(w, h, opts.dpr);
    const [lx, ly, lz] = opts.light;
    const rnd = AD.rng(opts.seed || 7);
    const craters = [];
    if (opts.craters) {
      const n = opts.craters | 0;
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2;
        const rr = Math.sqrt(rnd()) * 0.86;
        craters.push({
          x: Math.cos(a) * rr,
          y: Math.sin(a) * rr,
          r: 0.07 + rnd() * 0.16,
        });
      }
    }
    const ramp = AD.RAMP_S;
    const N = ramp.length;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `${(cell.h * 0.94).toFixed(2)}px ${AD.MONO}`;
    const base = opts.rgb;
    const amb = opts.amb != null ? opts.amb : 0.05;
    const gamma = opts.gamma || 0.85;
    const bands = opts.bands || 0;
    const hx = cols / 2,
      hy = rows / 2;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const nx = (x + 0.5 - hx) / hx;
        const ny = (y + 0.5 - hy) / hy;
        const d2 = nx * nx + ny * ny;
        if (d2 > 1.0) continue;
        const nz = Math.sqrt(Math.max(0, 1 - d2));
        let l = Math.max(0, nx * lx + -ny * ly + nz * lz);
        l = Math.pow(l, gamma);
        l = amb + l * (1 - amb);
        /* limb darkening */
        l *= 0.55 + 0.45 * Math.pow(nz, 0.45);
        /* texture: smooth mottle only — never per-cell white noise */
        if (bands) {
          const b = 0.5 + 0.5 * Math.sin(ny * bands * 6.0 + nx * 2.0 + (AD.vnoise(nx * 4 + 9, ny * 4) - 0.5) * 1.4);
          l *= 0.88 + 0.2 * b;
        } else {
          l *= 0.9 + 0.2 * AD.vnoise(nx * 5 + 3, ny * 5 + 7);
        }
        if (opts.craters) {
          for (const cr of craters) {
            const dx = nx - cr.x,
              dy = ny - cr.y;
            const dd = Math.hypot(dx, dy);
            if (dd < cr.r) {
              l *= 1 - 0.62 * Math.pow(1 - dd / cr.r, 1.4);
            } else if (dd < cr.r * 1.25) {
              const lit = Math.max(0, (dx * lx + -dy * ly) / (dd || 1e-6));
              l += 0.1 * lit * (1 - (dd - cr.r) / (cr.r * 0.25));
            }
          }
        }
        l = AD.clamp(l, 0, 1);
        /* half-ramp-step dither: gradients become stipple, not bands */
        l += (AD.hash1(x * 3.1 + y * 7.7) - 0.5) * 0.9 / N;
        l = AD.clamp(l, 0, 1);
        const gi = Math.min(N - 1, (l * N) | 0);
        const ch = ramp[gi];
        if (ch === " ") continue;
        const shade = 0.42 + 0.58 * l;
        g.fillStyle = `rgb(${(base[0] * shade) | 0},${(base[1] * shade) | 0},${(
          base[2] * shade
        ) | 0})`;
        g.fillText(
          ch,
          (x + 0.5) * cell.w,
          (y + 0.5) * cell.h
        );
      }
    }

    /* ring (drawn around, may overlap limb) — normalized-space ellipse */
    if (opts.ring) {
      const [rc, rw] = opts.ring; // rgb, width in ring-radius units
      const tilt = 0.34;
      const rxN = 1.62;
      const ryN = rxN * tilt;
      g.save();
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const nx = (x + 0.5 - hx) / hx;
          const ny = (y + 0.5 - hy) / hy;
          const rr = (nx / rxN) * (nx / rxN) + (ny / ryN) * (ny / ryN);
          if (rr > 1.0 || rr < 0.62) continue;
          const edge = Math.min(rr - 0.62, 1.0 - rr) / 0.38;
          /* occlude behind upper half of sphere, show over lower */
          const inSphere = nx * nx + ny * ny < 1;
          if (inSphere && ny < 0) continue;
          const a = 0.25 + 0.65 * Math.pow(Math.max(0, edge), 0.7);
          g.fillStyle = `rgba(${rc[0]},${rc[1]},${rc[2]},${a.toFixed(2)})`;
          const ch = a > 0.6 ? "=" : "-";
          g.fillText(ch, (x + 0.5) * cell.w, (y + 0.5) * cell.h);
        }
      }
      g.restore();
    }
    return { canvas: c, w: w, h: h, R: R };
  };

  /* sparse ASCII starfield layer */
  AD.makeStars = function (w, h, cell, dpr, density, seed, opts) {
    const { canvas: c, g } = AD.makeCanvas(w, h, dpr);
    const rnd = AD.rng(seed);
    const chars = opts.chars;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `${(cell.h * 0.94).toFixed(2)}px ${AD.MONO}`;
    const cols = Math.ceil(w / cell.w);
    const rows = Math.ceil(h / cell.h);
    const tw = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (rnd() > density) continue;
        const ch = chars[(rnd() * chars.length) | 0];
        const a = opts.minA + rnd() * (opts.maxA - opts.minA);
        const warm = rnd();
        const col =
          warm > 0.8
            ? `rgba(255,224,190,${a.toFixed(2)})`
            : warm > 0.5
            ? `rgba(220,232,255,${a.toFixed(2)})`
            : `rgba(196,214,255,${a.toFixed(2)})`;
        g.fillStyle = col;
        const px = (x + 0.5) * cell.w,
          py = (y + 0.5) * cell.h;
        g.fillText(ch, px, py);
        if (a > opts.twMinA && tw.length < opts.twMax)
          tw.push({ x: px, y: py, a: a, seed: rnd() * 100, ch: ch });
      }
    }
    return { canvas: c, w: w, h: h, twinkle: tw };
  };
})(window);
