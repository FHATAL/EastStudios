/* East Studios - interactions and procedural topographic maps */
(() => {
  "use strict";

  document.documentElement.classList.add("js");

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  /* ---------------------------------------------------------------
   * 3D simplex noise (after Stefan Gustavson), seeded
   * ------------------------------------------------------------- */
  function createNoise(seed = 1) {
    const grad = [
      [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
      [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
      [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
    ];
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    let s = seed * 9301 + 49297;
    const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    const perm = new Uint8Array(512);
    const permMod12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      perm[i] = p[i & 255];
      permMod12[i] = perm[i] % 12;
    }
    const F3 = 1 / 3, G3 = 1 / 6;

    return function noise3(x, y, z) {
      const t = (x + y + z) * F3;
      const i = Math.floor(x + t), j = Math.floor(y + t), k = Math.floor(z + t);
      const t0 = (i + j + k) * G3;
      const x0 = x - (i - t0), y0 = y - (j - t0), z0 = z - (k - t0);
      let i1, j1, k1, i2, j2, k2;
      if (x0 >= y0) {
        if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
        else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
        else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
      } else {
        if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
        else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
        else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      }
      const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
      const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
      const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
      const ii = i & 255, jj = j & 255, kk = k & 255;

      let n = 0, tt, g;
      tt = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
      if (tt > 0) { g = grad[permMod12[ii + perm[jj + perm[kk]]]]; tt *= tt; n += tt * tt * (g[0] * x0 + g[1] * y0 + g[2] * z0); }
      tt = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
      if (tt > 0) { g = grad[permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]]]; tt *= tt; n += tt * tt * (g[0] * x1 + g[1] * y1 + g[2] * z1); }
      tt = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
      if (tt > 0) { g = grad[permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]]]; tt *= tt; n += tt * tt * (g[0] * x2 + g[1] * y2 + g[2] * z2); }
      tt = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
      if (tt > 0) { g = grad[permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]]]; tt *= tt; n += tt * tt * (g[0] * x3 + g[1] * y3 + g[2] * z3); }
      return 32 * n; // roughly -1..1
    };
  }

  /* ---------------------------------------------------------------
   * Marching squares: trace iso-lines for a grid of samples
   * Edges: 0 top, 1 right, 2 bottom, 3 left
   * ------------------------------------------------------------- */
  const CASES = [
    [], [[3, 2]], [[2, 1]], [[3, 1]], [[0, 1]], [[0, 1], [3, 2]], [[0, 2]], [[3, 0]],
    [[3, 0]], [[0, 2]], [[0, 3], [2, 1]], [[0, 1]], [[3, 1]], [[2, 1]], [[3, 2]], [],
  ];

  function traceContours(field, cols, rows, cell, base, step, onSegment) {
    for (let j = 0; j < rows - 1; j++) {
      const r0 = j * cols, r1 = r0 + cols;
      const y0 = j * cell;
      for (let i = 0; i < cols - 1; i++) {
        const a = field[r0 + i], b = field[r0 + i + 1];
        const c = field[r1 + i + 1], d = field[r1 + i];
        const min = Math.min(a, b, c, d), max = Math.max(a, b, c, d);
        let lo = Math.ceil((min - base) / step);
        const hi = Math.floor((max - base) / step);
        if (lo > hi) continue;
        const x0 = i * cell;
        for (; lo <= hi; lo++) {
          const L = base + lo * step;
          const idx = (a > L ? 8 : 0) | (b > L ? 4 : 0) | (c > L ? 2 : 0) | (d > L ? 1 : 0);
          const segs = CASES[idx];
          for (let s = 0; s < segs.length; s++) {
            const e0 = edgePoint(segs[s][0], a, b, c, d, L, x0, y0, cell);
            const e1 = edgePoint(segs[s][1], a, b, c, d, L, x0, y0, cell);
            onSegment(lo, e0[0], e0[1], e1[0], e1[1]);
          }
        }
      }
    }
  }

  const pt = [0, 0];
  const pt2 = [0, 0];
  let flip = false;
  function edgePoint(edge, a, b, c, d, L, x0, y0, s) {
    const out = (flip = !flip) ? pt : pt2;
    switch (edge) {
      case 0: out[0] = x0 + ((L - a) / (b - a)) * s; out[1] = y0; break;
      case 1: out[0] = x0 + s; out[1] = y0 + ((L - b) / (c - b)) * s; break;
      case 2: out[0] = x0 + ((L - d) / (c - d)) * s; out[1] = y0 + s; break;
      default: out[0] = x0; out[1] = y0 + ((L - a) / (d - a)) * s;
    }
    return out;
  }

  function sizeCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(w * DPR);
    canvas.height = Math.round(h * DPR);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    return { ctx, w, h };
  }

  /* ---------------------------------------------------------------
   * Animated contour background (hero + contact)
   * ------------------------------------------------------------- */
  function ContourField(canvas, opts) {
    const o = Object.assign({ seed: 3, scale: 0.0021, speed: 0.022, cell: 9, step: 0.075, alpha: 1, interactive: false }, opts);
    const noise = createNoise(o.seed);
    let ctx, w, h, cols, rows, field;
    let t = Math.random() * 10;
    let visible = false, raf = 0, last = 0;

    const pointer = { x: -9999, y: -9999, tx: -9999, ty: -9999, amp: 0, tAmp: 0 };
    const readout = o.readout;

    function resize() {
      ({ ctx, w, h } = sizeCanvas(canvas));
      cols = Math.ceil(w / o.cell) + 2;
      rows = Math.ceil(h / o.cell) + 2;
      field = new Float32Array(cols * rows);
      draw();
    }

    function sample(x, y) {
      const nx = x * o.scale, ny = y * o.scale;
      let v = noise(nx, ny, t) * 0.75 + noise(nx * 2.3 + 11, ny * 2.3 - 7, t * 1.4) * 0.25;
      if (pointer.amp > 0.001) {
        const dx = x - pointer.x, dy = y - pointer.y;
        v += pointer.amp * Math.exp(-(dx * dx + dy * dy) / 26000);
      }
      return v;
    }

    function draw() {
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) field[j * cols + i] = sample(i * o.cell, j * o.cell);
      }
      ctx.clearRect(0, 0, w, h);

      const minor = new Path2D();
      const major = new Path2D();
      traceContours(field, cols, rows, o.cell, 0, o.step, (lvl, x1, y1, x2, y2) => {
        const p = lvl % 5 === 0 ? major : minor;
        p.moveTo(x1, y1);
        p.lineTo(x2, y2);
      });

      ctx.lineCap = "round";
      ctx.strokeStyle = `rgba(10, 10, 10, ${0.11 * o.alpha})`;
      ctx.lineWidth = 1;
      ctx.stroke(minor);
      ctx.strokeStyle = `rgba(10, 10, 10, ${0.34 * o.alpha})`;
      ctx.lineWidth = 1.5;
      ctx.stroke(major);
    }

    function frame(now) {
      raf = 0;
      if (!visible) return;
      const dt = Math.min(64, now - (last || now));
      last = now;
      t += (dt / 1000) * o.speed;

      pointer.x += (pointer.tx - pointer.x) * 0.08;
      pointer.y += (pointer.ty - pointer.y) * 0.08;
      pointer.amp += (pointer.tAmp - pointer.amp) * 0.05;

      draw();
      raf = requestAnimationFrame(frame);
    }

    function start() {
      if (reduceMotion || raf) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    }

    if (o.interactive && finePointer) {
      const host = canvas.parentElement;
      host.addEventListener("pointermove", (e) => {
        const r = canvas.getBoundingClientRect();
        const x = e.clientX - r.left, y = e.clientY - r.top;
        if (pointer.amp < 0.01) { pointer.x = x; pointer.y = y; }
        pointer.tx = x; pointer.ty = y; pointer.tAmp = 0.34;
        if (readout) readout(x / r.width, y / r.height, sample(x, y));
      });
      host.addEventListener("pointerleave", () => { pointer.tAmp = 0; });
    }

    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !document.hidden) start();
    }).observe(canvas);

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && visible) start();
    });

    new ResizeObserver(resize).observe(canvas);
  }

  /* ---------------------------------------------------------------
   * Static tinted topo map (inside device mockups)
   * ------------------------------------------------------------- */
  function StaticMap(canvas) {
    const seed = Number(canvas.dataset.seed) || 1;
    const waterLevel = -(Number(canvas.dataset.water) || 0.22);
    const noise = createNoise(seed);
    const forest = createNoise(seed + 101);
    const scale = 0.0062;
    const cell = 5;

    const height = (x, y) => {
      const nx = x * scale, ny = y * scale;
      return noise(nx, ny, 0.3) * 0.7 + noise(nx * 2.1, ny * 2.1, 4.1) * 0.22 + noise(nx * 4.7, ny * 4.7, 9.2) * 0.08;
    };

    function render() {
      const { ctx, w, h } = sizeCanvas(canvas);
      if (w < 4 || h < 4) return;

      // Hypsometric tint on a low-res buffer, smoothed when scaled up
      const tw = Math.ceil(w / 3), th = Math.ceil(h / 3);
      const tint = document.createElement("canvas");
      tint.width = tw; tint.height = th;
      const tctx = tint.getContext("2d");
      const img = tctx.createImageData(tw, th);
      const d = img.data;
      for (let y = 0; y < th; y++) {
        for (let x = 0; x < tw; x++) {
          const v = height(x * 3, y * 3);
          const k = (y * tw + x) * 4;
          let r, g, b;
          if (v < waterLevel) {
            const depth = Math.min(1, (waterLevel - v) * 3);
            r = g = b = 226 - depth * 18;
          } else {
            const e = Math.min(1, (v - waterLevel) / 0.9);
            r = g = b = 255 - e * 14;
            if (forest(x * 3 * 0.009, y * 3 * 0.009, 2) > 0.12 && e < 0.7) {
              r = g = b = r - 9;
            }
          }
          d[k] = r; d[k + 1] = g; d[k + 2] = b; d[k + 3] = 255;
        }
      }
      tctx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(tint, 0, 0, w, h);

      // Contours
      const cols = Math.ceil(w / cell) + 2, rows = Math.ceil(h / cell) + 2;
      const field = new Float32Array(cols * rows);
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) field[j * cols + i] = height(i * cell, j * cell);

      const minor = new Path2D(), major = new Path2D();
      const step = 0.05;
      traceContours(field, cols, rows, cell, waterLevel, step, (lvl, x1, y1, x2, y2) => {
        if (lvl < 1) return;
        const p = lvl % 5 === 0 ? major : minor;
        p.moveTo(x1, y1); p.lineTo(x2, y2);
      });
      const shore = new Path2D();
      traceContours(field, cols, rows, cell, waterLevel, 100, (lvl, x1, y1, x2, y2) => {
        if (lvl !== 0) return;
        shore.moveTo(x1, y1); shore.lineTo(x2, y2);
      });

      ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(10, 10, 10, 0.26)";
      ctx.lineWidth = 0.8;
      ctx.stroke(minor);
      ctx.strokeStyle = "rgba(10, 10, 10, 0.55)";
      ctx.lineWidth = 1.3;
      ctx.stroke(major);
      ctx.strokeStyle = "rgba(10, 10, 10, 0.75)";
      ctx.lineWidth = 1.1;
      ctx.stroke(shore);

      // A thin grid, like a map's coordinate lines
      ctx.strokeStyle = "rgba(10, 10, 10, 0.05)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 80; x < w; x += 80) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); }
      for (let y = 80; y < h; y += 80) { ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); }
      ctx.stroke();
    }

    let pending = 0;
    new ResizeObserver(() => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(render);
    }).observe(canvas);
  }

  /* ---------------------------------------------------------------
   * Hero readout: cursor position as coordinates around Helsinki
   * ------------------------------------------------------------- */
  const latEl = document.querySelector("[data-lat]");
  const lonEl = document.querySelector("[data-lon]");
  const eleEl = document.querySelector("[data-ele]");
  function heroReadout(fx, fy, v) {
    if (!latEl) return;
    const lat = 60.1699 + (0.5 - fy) * 0.045;
    const lon = 24.9384 + (fx - 0.5) * 0.09;
    latEl.textContent = `${lat.toFixed(5)}° N`;
    lonEl.textContent = `${lon.toFixed(5)}° E`;
    eleEl.textContent = `${Math.max(0, Math.round((v + 0.6) * 48))} m`;
  }

  document.querySelectorAll("[data-contours]").forEach((canvas) => {
    const calm = canvas.hasAttribute("data-calm");
    ContourField(canvas, calm
      ? { seed: 11, scale: 0.0017, speed: 0.012, alpha: 0.75, cell: 11 }
      : { seed: 3, interactive: true, readout: heroReadout });
  });

  document.querySelectorAll("[data-static-map]").forEach(StaticMap);

  /* ---------------------------------------------------------------
   * Scroll reveals
   * ------------------------------------------------------------- */
  const revealTargets = document.querySelectorAll(".reveal, .hero__title, [data-devices], .bird__visual");
  if (reduceMotion || !("IntersectionObserver" in window)) {
    revealTargets.forEach((el) => el.classList.add("is-in"));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.12 });
    revealTargets.forEach((el) => io.observe(el));
  }

  /* ---------------------------------------------------------------
   * Number counters
   * ------------------------------------------------------------- */
  const counters = document.querySelectorAll("[data-count]");
  const countIO = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      countIO.unobserve(entry.target);
      const el = entry.target;
      const end = Number(el.dataset.count);
      if (reduceMotion) return;
      const from = el.hasAttribute("data-plain") ? end - 12 : 0;
      const dur = 1400;
      const t0 = performance.now();
      const tick = (now) => {
        const p = Math.min(1, (now - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 4);
        el.textContent = Math.round(from + (end - from) * eased);
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, { threshold: 0.6 });
  counters.forEach((el) => countIO.observe(el));

  /* ---------------------------------------------------------------
   * Nav: solid after scrolling, hides on scroll down
   * ------------------------------------------------------------- */
  const nav = document.querySelector("[data-nav]");
  let lastY = window.scrollY;
  let ticking = false;
  function onScroll() {
    const y = window.scrollY;
    nav.classList.toggle("is-scrolled", y > 24);
    nav.classList.toggle("is-hidden", y > 400 && y > lastY + 4);
    if (y < lastY - 4 || y <= 400) nav.classList.remove("is-hidden");
    lastY = y;
    ticking = false;
  }
  window.addEventListener("scroll", () => {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  onScroll();

  /* ---------------------------------------------------------------
   * Copy email
   * ------------------------------------------------------------- */
  document.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        btn.textContent = "Copied";
        btn.classList.add("is-done");
      } catch {
        window.location.href = `mailto:${btn.dataset.copy}`;
        return;
      }
      setTimeout(() => {
        btn.textContent = "Copy";
        btn.classList.remove("is-done");
      }, 1800);
    });
  });

  const year = document.querySelector("[data-year]");
  if (year) year.textContent = new Date().getFullYear();
})();
