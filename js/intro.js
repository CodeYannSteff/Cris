"use strict";
/* AsciiDream — intro: an ASCII eye opens, we dive through the pupil into a
   sea of planets and stars, the moon in focus, then fall into the paintings. */
(function (global) {
  const AD = global.AD;
  const { clamp, lerp, smoothstep, ease, rng, makeCanvas, makeGlow, asciiSphere, makeStars } = AD;

  const ROWS = 46; /* shared grid resolution for eye + cosmos */
  const PI = Math.PI;

  /* palette — cool steel/moonlight monochrome */
  const C_SCLERA = [206, 219, 240];
  const C_IRIS = [128, 168, 208];
  const C_SKIN = [172, 186, 210];
  const C_MOON = [226, 230, 238];

  const Intro = {
    TIMES: {
      fade: 1.6,
      openStart: 2.4,
      openEnd: 4.9,
      zoomStart: 5.8,
      zoomEnd: 9.0,
      cosmosStart: 9.0,
      diveStart: 15.0,
      revealStart: 16.6,
      control: 17.6,
      revealEnd: 19.4,
    },
  };

  let W = 0,
    H = 0,
    DPR = 1;
  let cellH = 10,
    cellW = 6;

  /* ---------- eye ---------- */
  let eyeBuf = null;
  let eyeKey = "";
  let gaze = { x: 0, y: 0, tx: 0, ty: 0, nextAt: 3.4 };
  const ernd = rng(42);

  function openAmount(T) {
    const t = Intro.TIMES;
    if (T <= t.openStart) return 0;
    if (T >= t.openEnd) return 1;
    return ease.inOutSine((T - t.openStart) / (t.openEnd - t.openStart));
  }

  /* physical size of the eye on any screen: a wide almond that fits both dims */
  function eyePhys() {
    const aspect = 2.05; /* width / height */
    const maxW = W * (W < H ? 0.9 : 0.66);
    const maxH = H * 0.62;
    const physW = Math.min(maxW, maxH * aspect);
    return { physW: physW, physH: physW / aspect };
  }

  function buildEye(p, gx, gy) {
    const { canvas: c, g } = eyeBuf;
    const cols = Math.ceil(W / cellW) + 1;
    const rows = Math.ceil(H / cellH) + 1;
    g.clearRect(0, 0, W, H);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `${(cellH * 0.94).toFixed(2)}px ${AD.MONO}`;

    const cx = (cols - 1) / 2,
      cy = (rows - 1) / 2;
    const ep = eyePhys();
    const halfW = ep.physW / 2 / cellW,
      halfH = ep.physH / 2 / cellH;
    const outW = halfW * 1.05,
      outH = halfH * 1.5;
    const icx = cx + gx,
      icy = cy + gy;
    const irisR = halfH * 0.96;
    const pupR = irisR * 0.4;
    const N = AD.RAMP_S_N;
    const hr = AD.hash1,
      vn = AD.vnoise;

    const shape = (u) => {
      const k = 1 - u * u;
      return k <= 0 ? 0 : Math.pow(k, 0.62);
    };

    for (let y = 0; y < rows; y++) {
      const py = y + 0.5;
      for (let x = 0; x < cols; x++) {
        const px = x + 0.5;
        const uo = (px - cx) / outW;
        if (uo < -1 || uo > 1) continue;
        const fo = shape(uo);
        const sTop = cy - outH * fo,
          sBot = cy + outH * fo;
        if (py < sTop || py >= sBot) continue;

        const u = (px - cx) / halfW;
        const f = Math.abs(u) < 1 ? shape(u) : 0;
        /* lids: closed ⇒ meet at center line */
        const yU = lerp(cy, cy - halfH * f, p);
        const yL = lerp(cy, cy + halfH * 0.84 * f, p);
        const gap = yL - yU;

        let lum = 0,
          col = C_SKIN;

        if (gap > 0.4 && py >= yU && py < yL) {
          /* ---- eye contents: smooth fields only ---- */
          const di = Math.hypot(px - icx, py - icy);
          const r = di / irisR;
          if (r < pupR / irisR) {
            /* pupil: the void we fall into */
            lum = 0.02;
            col = [34, 40, 54];
          } else if (r < 1) {
            /* iris: bright collarette near pupil, darker to limbus */
            const ang = Math.atan2(py - icy, px - icx);
            lum = 0.5 - 0.18 * r;
            lum += 0.24 * Math.exp(-Math.pow((r - 0.5) / 0.12, 2));
            lum += 0.05 * Math.sin(ang * 16) * (1 - r) * (1 - r);
            lum += 0.04 * (vn(Math.cos(ang) * 3 + 5, Math.sin(ang) * 3 + 5) - 0.5);
            if (r > 0.84) lum *= 1 - 0.9 * smoothstep(0.84, 1, r);
            col = C_IRIS;
          } else {
            /* sclera */
            lum = 0.72;
            lum -= 0.4 * smoothstep(0.38, 1.0, Math.abs(u));
            col = C_SCLERA;
          }
          /* upper-lid shadow across iris + sclera */
          const sh = yU + irisR * 0.6 - py;
          if (sh > 0) lum -= 0.5 * smoothstep(0, irisR * 0.6, sh);
          /* specular */
          const hs = Math.hypot(px - (icx - irisR * 0.33), py - (icy - irisR * 0.4));
          if (hs < irisR * 0.16) {
            lum = 0.97;
            col = [240, 246, 255];
          } else if (hs < irisR * 0.26) lum = Math.max(lum, 0.62);
          const hs2 = Math.hypot(px - (icx + irisR * 0.3), py - (icy + irisR * 0.46));
          if (hs2 < irisR * 0.09) lum = Math.max(lum, 0.72);
        } else {
          /* ---- lids: smooth skin, bright wet margin, sparse lashes ---- */
          const d = py < yU ? yU - py : py - yL;
          lum = 0.05 + 0.38 * Math.exp(-d / 2.6);
          lum += 0.018 * Math.sin(d * 2.3 + uo * 8.0);
          if (py > cy) lum *= 0.72; /* light falls from above */
          /* wet lid margin */
          lum = Math.max(lum, 0.9 * Math.exp(-Math.pow(d - 0.35, 2) / 0.75));
          /* lashes: sparse, only above the upper lid when open */
          if (py < yU && p > 0.4) {
            const dir = u >= 0 ? 1 : -1;
            const lx = x - dir * (yU - py) * 0.5;
            const h = hr(Math.floor(lx) * 7.31);
            if (h > 0.76) {
              const len = 1.4 + 2.6 * hr(Math.floor(lx) * 3.17);
              const tip = (yU - py) / len;
              if (tip < 1) lum = Math.max(lum, 0.6 * (1 - tip * tip));
            }
          }
          col = C_SKIN;
        }

        lum = clamp(lum, 0, 1);
        /* half-ramp-step dither for ordered stipple gradients */
        lum += (hr(x * 3.1 + y * 7.7) - 0.5) * 0.9 / N;
        lum = clamp(lum, 0, 1);
        if (lum < 0.03) continue;
        const ch = AD.glyphS(lum);
        if (ch === " ") continue;
        const shade = 0.4 + 0.6 * lum;
        g.fillStyle = `rgb(${(col[0] * shade) | 0},${(col[1] * shade) | 0},${(col[2] * shade) | 0})`;
        g.fillText(ch, px * cellW, py * cellH);
      }
    }
  }

  function ensureEye(p, gx, gy) {
    const key = `${(p * 24) | 0}_${(gx * 2) | 0}_${(gy * 2) | 0}`;
    if (key === eyeKey) return;
    eyeKey = key;
    buildEye(p, gx, gy);
  }

  function updateGaze(dt, T) {
    const t = Intro.TIMES;
    if (T < 3.2 || T > t.zoomStart + 1.2) {
      gaze.tx *= 0.9;
      gaze.ty *= 0.9;
    } else if (T > gaze.nextAt) {
      gaze.tx = (ernd() - 0.5) * 7;
      gaze.ty = (ernd() - 0.5) * 3;
      gaze.nextAt = T + 1.6 + ernd() * 2.8;
    }
    const k = 1 - Math.exp(-26 * dt);
    gaze.x += (gaze.tx - gaze.x) * k;
    gaze.y += (gaze.ty - gaze.y) * k;
  }

  /* ---------- cosmos ---------- */
  let starsFar = null,
    starsNear = null,
    nebula = [],
    planets = [],
    moon = null,
    moonGlow = null,
    moonKey = "",
    moonLight = [0.6, -0.4, 0.7];

  function buildCosmos() {
    const pad = Math.max(240, W * 0.22);
    const cw = { w: cellW, h: cellH };
    /* normalize density so small (phone) and large screens show a
       comparable number of stars, not a per-cell fraction of each */
    const starCells = ((W + pad * 2) / cellW) * ((H + pad * 2) / cellH);
    starsFar = makeStars(W + pad * 2, H + pad * 2, cw, DPR, 199 / starCells, 11, {
      chars: ["·", ".", "o", "·"],
      minA: 0.28,
      maxA: 0.75,
      twMinA: 0.6,
      twMax: 90,
    });
    starsNear = makeStars(W + pad * 2, H + pad * 2, cw, DPR, 65 / starCells, 23, {
      chars: ["*", "+", "×", ":"],
      minA: 0.5,
      maxA: 1,
      twMinA: 0.75,
      twMax: 70,
    });
    nebula = [];
    const nn = rng(99);
    const cols = [
      "rgba(70,96,190,",
      "rgba(140,80,180,",
      "rgba(50,150,170,",
    ];
    for (let i = 0; i < 3; i++) {
      nebula.push({
        x: 0.15 + nn() * 0.7,
        y: 0.15 + nn() * 0.7,
        r: 0.34 + nn() * 0.4,
        col: cols[i],
        a: 0.1 + nn() * 0.07,
        ph: nn() * 9,
      });
    }
    /* planets: small ascii spheres adrift */
    const prnd = rng(505);
    const defs = [
      { R: 6, rgb: [148, 178, 196], craters: 7, bands: 0, x: 0.16, y: 0.3, z: 0.5, s: 1 },
      { R: 9, rgb: [214, 176, 138], craters: 0, bands: 3.2, x: 0.84, y: 0.26, z: 0.8, s: 1 },
      { R: 5, rgb: [178, 156, 210], craters: 4, bands: 0, x: 0.72, y: 0.74, z: 0.35, s: 1 },
      { R: 7, rgb: [132, 158, 205], craters: 0, bands: 0, x: 0.28, y: 0.78, z: 0.55, s: 1, ring: [[198, 206, 228], 1.1] },
    ];
    planets = defs.map((d, i) => {
      const A = -0.5 + i;
      const L = normalize([Math.cos(A) * 0.7, -0.42, 0.72]);
      return {
        sprite: asciiSphere(d.R, {
          cell: cw,
          dpr: DPR,
          rgb: d.rgb,
          light: L,
          craters: d.craters,
          bands: d.bands,
          ring: d.ring,
          amb: 0.07,
          gamma: 0.8,
          seed: 30 + i,
        }),
        x: d.x,
        y: d.y,
        z: d.z,
        ph: prnd() * 9,
        drift: 0.012 + prnd() * 0.02,
      };
    });
    moonGlow = makeGlow(180, [
      [0, "rgba(228,234,255,0.5)"],
      [0.35, "rgba(190,205,255,0.16)"],
      [1, "rgba(150,170,255,0)"],
    ]);
    moon = null;
    moonKey = "";
  }

  function normalize(v) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }

  function ensureMoon(T) {
    const A = -0.55 + T * 0.22;
    const L = normalize([Math.cos(A) * 0.78, -0.4, 0.58 + 0.3 * Math.sin(A * 0.7)]);
    const key = (A / 0.14).toFixed(1);
    if (key === moonKey && moon) return;
    moonKey = key;
    moonLight = L;
    moon = asciiSphere(15, {
      cell: { w: cellW, h: cellH },
      dpr: DPR,
      rgb: C_MOON,
      light: L,
      craters: 26,
      amb: 0.05,
      gamma: 0.78,
      seed: 8,
    });
  }

  /* ---------- render ---------- */

  Intro.init = function (w, h, dpr) {
    W = w;
    H = h;
    DPR = dpr;
    cellH = H / ROWS;
    /* portrait phones need a finer grid so the eye keeps its detail */
    cellH = Math.min(cellH, eyePhys().physH / 24);
    cellW = cellH * 0.6;
    eyeBuf = makeCanvas(W, H, DPR);
    eyeKey = "";
    gaze = { x: 0, y: 0, tx: 0, ty: 0, nextAt: 3.4 };
    buildCosmos();
  };

  Intro.update = function (dt, T) {
    updateGaze(dt, T);
  };

  /* eye: alpha, drawn with zoom transform about the pupil */
  Intro.renderEye = function (ctx, T, alpha, dt) {
    if (alpha <= 0.001) return;
    const t = Intro.TIMES;
    let p = openAmount(T);
    if (p > 0.02 && T > t.openEnd && T < t.zoomStart) {
      p = clamp(p + 0.012 * Math.sin(T * 0.9), 0, 1);
    }
    ensureEye(p, gaze.x, gaze.y);

    let s = 1;
    if (T > t.zoomStart) {
      const z = clamp((T - t.zoomStart) / (t.zoomEnd - t.zoomStart), 0, 1);
      s = 1 + ease.inOutCubic(z) * 46;
    }
    const breath = Math.sin(T * 0.85) * cellH * 0.35;
    const ax = W / 2 + (gaze.x + 0.5) * cellW - cellW / 2;
    const ay = H / 2 + (gaze.y + 0.5) * cellH - cellH / 2;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(ax, ay + breath);
    ctx.scale(s, s);
    ctx.translate(-ax, -ay);
    ctx.imageSmoothingEnabled = s < 3;
    ctx.drawImage(eyeBuf.canvas, 0, 0, W, H);
    ctx.restore();
  };

  Intro.renderCosmos = function (ctx, T, alpha, diveP, dt) {
    if (alpha <= 0.001) return;
    const t = Intro.TIMES;
    ctx.save();
    ctx.globalAlpha = alpha;

    /* nebula haze */
    ctx.globalCompositeOperation = "screen";
    for (const n of nebula) {
      const x = (n.x + 0.03 * Math.sin(T * 0.06 + n.ph)) * W;
      const y = (n.y + 0.03 * Math.cos(T * 0.05 + n.ph)) * H;
      const r = n.r * Math.min(W, H) * (1 + diveP * 0.6);
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, n.col + (n.a * (0.75 + 0.25 * Math.sin(T * 0.4 + n.ph))).toFixed(3) + ")");
      grad.addColorStop(1, n.col + "0)");
      ctx.fillStyle = grad;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = "source-over";

    /* star layers with dive-zoom */
    const pad = Math.max(240, W * 0.22);
    const drawLayer = (layer, scale, dx, dy) => {
      const w = layer.w,
        h = layer.h;
      ctx.save();
      ctx.translate(W / 2 + dx, H / 2 + dy);
      ctx.scale(scale, scale);
      ctx.translate(-w / 2, -h / 2);
      ctx.drawImage(layer.canvas, 0, 0, w, h);
      /* twinkle */
      const CH = ["·", ":", "*", "+", "×"];
      ctx.font = `${(cellH * 0.94).toFixed(2)}px ${AD.MONO}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#dfe8ff";
      for (const s of layer.twinkle) {
        const f = 0.5 + 0.5 * Math.sin(T * (1.6 + (s.seed % 3)) + s.seed);
        const ch = CH[(Math.floor(T * 2.5 + s.seed) % CH.length + CH.length) % CH.length];
        ctx.globalAlpha = alpha * (0.35 + 0.65 * f);
        ctx.fillText(ch, s.x, s.y);
      }
      ctx.restore();
    };

    const ef = ease.outCubic(diveP);
    const farS = 1 + ef * 1.5,
      nearS = 1 + ease.outCubic(diveP) * 3.1;
    const swayX = Math.sin(T * 0.07) * 22,
      swayY = Math.cos(T * 0.055) * 14;
    ctx.globalAlpha = alpha;
    drawLayer(starsFar, farS, swayX, swayY);
    if (diveP > 0.05) {
      ctx.globalAlpha = alpha * 0.5;
      drawLayer(starsNear, nearS * 1.04, swayX * 1.5, swayY * 1.5);
      ctx.globalAlpha = alpha;
    }
    drawLayer(starsNear, nearS, swayX * 1.4, swayY * 1.4);

    /* planets — the sea we drift through */
    const push = ease.outCubic(diveP);
    for (const pl of planets) {
      const wob = Math.sin(T * 0.18 + pl.ph);
      let x = (pl.x + pl.drift * Math.sin(T * 0.1 + pl.ph)) * W;
      let y = (pl.y + pl.drift * Math.cos(T * 0.13 + pl.ph)) * H;
      /* camera push toward moon center: planets slide outward by z */
      x += (x - W / 2) * push * pl.z * 1.4;
      y += (y - H / 2) * push * pl.z * 1.4;
      const sc = (1 + push * pl.z * 2.2) * (1 + wob * 0.02);
      const sp = pl.sprite;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(sc, sc);
      ctx.drawImage(sp.canvas, -sp.w / 2, -sp.h / 2, sp.w, sp.h);
      ctx.restore();
    }

    /* the moon — focus of the whole cosmos */
    ensureMoon(T);
    const app = smoothstep(t.cosmosStart, t.diveStart, T);
    let mScale = lerp(0.5, 1.34, ease.outCubic(app));
    let mx = lerp(W * 0.64, W * 0.5, ease.inOutSine(app));
    let my = lerp(H * 0.6, H * 0.5, ease.inOutSine(app));
    if (diveP > 0) {
      const ds = ease.inCubic(diveP);
      mScale *= lerp(1, 8.5, ds);
      mx = lerp(mx, W / 2, ds);
      my = lerp(my, H / 2, ds);
    }
    mx += Math.sin(T * 0.5) * cellW * 0.3;
    my += Math.cos(T * 0.42) * cellH * 0.3;

    const gs = mScale * moonGlow.width * 0.62;
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = alpha * (0.55 + 0.2 * Math.sin(T * 0.7));
    ctx.drawImage(moonGlow, mx - gs / 2, my - gs / 2, gs, gs);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = alpha;
    const sp = moon;
    ctx.save();
    ctx.translate(mx, my);
    ctx.scale(mScale, mScale);
    ctx.drawImage(sp.canvas, -sp.w / 2, -sp.h / 2, sp.w, sp.h);
    ctx.restore();

    ctx.restore();
  };

  global.AD.Intro = Intro;
})(window);
