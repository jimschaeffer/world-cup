/* ============================================================================
   DEHB CHAMPION CELEBRATION
   Full-screen "DEHB WINS!" takeover with canvas fireworks, shown on page load.
   Dismiss with the button, Escape, or a click on the backdrop.
   ========================================================================== */
(function () {
  const overlay = document.getElementById("dehb-overlay");
  const canvas = document.getElementById("dehb-fireworks");
  const closeBtn = document.getElementById("dehb-close");
  if (!overlay || !canvas || !closeBtn) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const COLORS = ["#ff2d78", "#ff5fa2", "#8b3dff", "#2f7bff", "#14d6c4", "#ffc23d"];
  const GRAVITY = 0.045;
  const DRAG = 0.988;

  const ctx = canvas.getContext("2d");
  let particles = [];
  let raf = null;
  let launcher = null;
  let dpr = 1;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // One burst = a ring of particles with jittered speed, so it reads as a shell.
  function burst(x, y) {
    const color = COLORS[(Math.random() * COLORS.length) | 0];
    const count = 46 + ((Math.random() * 26) | 0);
    const power = 2.6 + Math.random() * 2.4;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.12;
      const speed = power * (0.55 + Math.random() * 0.65);
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: 0.008 + Math.random() * 0.012,
        color,
        size: 1.4 + Math.random() * 1.8,
      });
    }
  }

  function frame() {
    // Trail effect: fade the previous frame instead of clearing it outright.
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(0, 0, 0, 0.14)";
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    ctx.globalCompositeOperation = "lighter";

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vx *= DRAG;
      p.vy = p.vy * DRAG + GRAVITY;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;

      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }

      ctx.globalAlpha = Math.max(p.life, 0);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    raf = requestAnimationFrame(frame);
  }

  function randomBurst() {
    burst(
      window.innerWidth * (0.12 + Math.random() * 0.76),
      window.innerHeight * (0.12 + Math.random() * 0.42)
    );
  }

  function start() {
    resize();
    window.addEventListener("resize", resize);

    // Opening volley, then a steady trickle.
    randomBurst();
    setTimeout(randomBurst, 260);
    setTimeout(randomBurst, 520);
    launcher = setInterval(randomBurst, 700);
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    if (launcher) clearInterval(launcher);
    raf = launcher = null;
    particles = [];
    window.removeEventListener("resize", resize);
  }

  function close() {
    if (overlay.hidden) return;
    stop();
    overlay.classList.add("is-closing");
    const done = () => {
      overlay.hidden = true;
      overlay.classList.remove("is-closing");
      overlay.removeEventListener("animationend", done);
    };
    overlay.addEventListener("animationend", done);
    document.body.style.overflow = "";
  }

  function open() {
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
    closeBtn.focus();
    if (!reduceMotion) start();
  }

  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target === canvas) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  open();
})();
