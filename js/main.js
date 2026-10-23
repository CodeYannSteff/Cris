"use strict";
/* AsciiDream — boot, timeline, input, render loop */
(function () {
  const AD = window.AD;
  const Intro = AD.Intro;
  const World = AD.World;
  const { clamp, lerp, smoothstep, ease } = AD;

  const canvas = document.getElementById("screen");
  const ctx = canvas.getContext("2d", { alpha: false });

  let W = 0,
    H = 0,
    DPR = 1;
  let T = 0; /* cinematic time */
  let last = 0;
  let started = false;

  const keys = Object.create(null);
  const pointer = { down: false, x: 0, y: 0, ox: 0, oy: 0, type: "mouse", id: null };

  function joyRadius() {
    return Math.min(W, H) * 0.13;
  }

  function measure() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.ceil(W * DPR);
    canvas.height = Math.ceil(H * DPR);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function boot() {
    measure();
    Intro.init(W, H, DPR);
    World.init(W, H, DPR);
    started = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }

  /* ---- input ---- */
  function skipAhead() {
    const t = Intro.TIMES;
    if (T < t.zoomStart) T = t.zoomStart;
    else if (T < t.diveStart) T = t.diveStart;
    else if (T < t.control) T = t.control;
  }

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    const c = e.code;
    keys[c] = true;
    if (
      c === "ArrowUp" || c === "ArrowDown" || c === "ArrowLeft" ||
      c === "ArrowRight" || c === "Space"
    )
      e.preventDefault();
    if (T < Intro.TIMES.control) skipAhead();
  });
  window.addEventListener("keyup", (e) => {
    keys[e.code] = false;
  });

  canvas.addEventListener("pointerdown", (e) => {
    if (pointer.down) return; /* track a single pointer — first finger wins */
    pointer.down = true;
    pointer.x = pointer.ox = e.clientX;
    pointer.y = pointer.oy = e.clientY;
    pointer.type = e.pointerType || "mouse";
    pointer.id = e.pointerId;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (_) {
      /* synthetic touch events have no capturable pointer — fine */
    }
    if (T < Intro.TIMES.control) skipAhead();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (pointer.down && e.pointerId !== pointer.id) return;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
  });
  const release = (e) => {
    if (e && e.pointerId !== pointer.id && pointer.down) return;
    pointer.down = false;
    pointer.id = null;
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  window.addEventListener("blur", () => {
    for (const k in keys) keys[k] = false;
    pointer.down = false;
  });
  /* long-press / pinch gestures must never hijack the canvas */
  window.addEventListener("contextmenu", (e) => {
    if (e.target === canvas) e.preventDefault();
  });
  for (const ev of ["gesturestart", "gesturechange", "gestureend"]) {
    window.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  }

  function gatherInput() {
    let x = 0,
      y = 0;
    if (keys.ArrowLeft || keys.KeyA) x -= 1;
    if (keys.ArrowRight || keys.KeyD) x += 1;
    if (keys.ArrowUp || keys.KeyW) y -= 1;
    if (keys.ArrowDown || keys.KeyS) y += 1;
    if (pointer.down && pointer.type !== "mouse") {
      /* touch/pen: virtual joystick anchored at the touch point */
      const dx = pointer.x - pointer.ox,
        dy = pointer.y - pointer.oy;
      const m = Math.hypot(dx, dy);
      if (m > 10) {
        const mag = Math.min(1, m / joyRadius());
        x += (dx / m) * mag;
        y += (dy / m) * mag;
      }
    } else if (pointer.down) {
      /* mouse: steer toward pointer relative to screen center */
      x += clamp((pointer.x - W / 2) / (W * 0.22), -1, 1);
      y += clamp((pointer.y - H / 2) / (H * 0.22), -1, 1);
    }
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    World.setInput(x, y, x !== 0 || y !== 0);
  }

  /* subtle ASCII joystick — appears only while a finger is down */
  function drawJoystick(ctx) {
    if (!pointer.down || pointer.type === "mouse") return;
    if (T < Intro.TIMES.control) return;
    const R = joyRadius();
    const dx = pointer.x - pointer.ox,
      dy = pointer.y - pointer.oy;
    const m = Math.hypot(dx, dy);
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "15px " + AD.MONO;
    ctx.fillStyle = "rgba(230,238,255,0.55)";
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      ctx.fillText(i % 4 === 0 ? "+" : "·", pointer.ox + Math.cos(ang) * R, pointer.oy + Math.sin(ang) * R);
    }
    const kx = m > R ? (dx / m) * R : dx;
    const ky = m > R ? (dy / m) * R : dy;
    ctx.fillStyle = "rgba(244,248,255,0.9)";
    ctx.fillText(m > 10 ? "@" : "+", pointer.ox + kx, pointer.oy + ky);
    ctx.restore();
  }

  /* ---- resize ---- */
  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      measure();
      Intro.init(W, H, DPR);
      World.resize(W, H, DPR);
    }, 120);
  });

  /* ---- frame ---- */
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = clamp((now - last) / 1000, 0.001, 0.05);
    last = now;

    const t = Intro.TIMES;
    T += dt;
    if (T > t.revealEnd) T = t.revealEnd + 1; /* keep timeline "past end" but params frozen */

    Intro.update(dt, T);

    /* prewarm tiles quietly — by the time the paintings appear, all is ready */
    const budget = T < t.revealStart ? 4 : 2;
    World.prewarm(budget);

    const inWorld = T >= t.revealStart;
    if (inWorld) {
      gatherInput();
      const tR = Math.max(0, Math.min(T - t.revealStart, t.revealEnd - t.revealStart));
      World.update(dt, tR);
    }

    /* ---- paint ---- */
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    const diveP = clamp((T - t.diveStart) / 2.4, 0, 1);
    const cosmosAlpha = smoothstep(6.6, 8.9, T);

    if (T < t.revealStart) {
      Intro.renderCosmos(ctx, T, cosmosAlpha, diveP, dt);
      const eyeFade = smoothstep(0, 1.4, T) * (1 - smoothstep(8.4, 9.0, T));
      Intro.renderEye(ctx, T, eyeFade, dt);
    } else {
      /* world reveal — paintings rise out of the moonlight */
      const ra = smoothstep(t.revealStart, t.revealStart + 2.0, T);
      const rs = 1 + 0.17 * (1 - ease.outCubic(clamp((T - t.revealStart) / 2.8, 0, 1)));
      const chA = smoothstep(t.control - 0.2, t.control + 1.2, T);
      World.render(ctx, { alpha: ra, scale: rs, charAlpha: chA });
      /* keep a breath of cosmos dissolving over the first moments */
      const cfade = 1 - smoothstep(t.revealStart, t.revealStart + 1.6, T);
      if (cfade > 0.01) Intro.renderCosmos(ctx, T, cosmosAlpha * cfade, 1, dt);
    }

    /* bloom flash of the dive */
    let bloom = 0;
    if (T > 15.9 && T < t.revealEnd) {
      bloom =
        0.94 *
        smoothstep(15.9, 17.25, T) *
        (1 - smoothstep(t.revealStart + 0.6, t.revealStart + 2.6, T));
      /* second micro-flare as the eye of the world takes over */
      if (T > t.control && T < t.control + 1.4)
        bloom += 0.1 * Math.sin((T - t.control) / 1.4 * Math.PI);
    }
    if (bloom > 0.003) {
      ctx.fillStyle = `rgba(255,252,246,${Math.min(1, bloom).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }

    /* exposure breath — almost invisible, keeps it alive */
    const ex = 0.02 * Math.sin(now * 0.00045);
    if (Math.abs(ex) > 0.001) {
      ctx.globalCompositeOperation = ex > 0 ? "screen" : "multiply";
      ctx.globalAlpha = Math.abs(ex);
      ctx.fillStyle = ex > 0 ? "#ffffff" : "#000000";
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }

    drawJoystick(ctx);
  }

  /* start after fonts settle (short timeout so we never hang on font fetch) */
  let booted = false;
  function tryBoot() {
    if (booted) return;
    booted = true;
    boot();
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      if (started) {
        Intro.init(W, H, DPR);
        World.resize(W, H, DPR);
      }
    });
    Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 900))]).then(tryBoot);
  } else {
    tryBoot();
  }
})();
