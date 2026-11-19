// Shared site behaviours: a small circle cursor and gently smoothed wheel scrolling.
// Both only switch on for mouse/trackpad users who haven't asked for reduced motion.
(() => {
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!finePointer) return;

  // ---------- small circle cursor ----------
  const style = document.createElement("style");
  style.textContent = `
    .has-dot, .has-dot * { cursor: none !important; }
    /* one big solid dot, no ring; each page can set its colour with --cursor-dot */
    .cursor-dot {
      position: fixed;
      top: 0; left: 0;
      z-index: 100;
      width: 20px; height: 20px;
      margin: -10px 0 0 -10px;
      border-radius: 50%;
      background: var(--cursor-dot, #2a300f);
      pointer-events: none;
      opacity: 0;
      transition: width .2s cubic-bezier(.2,.8,.2,1), height .2s cubic-bezier(.2,.8,.2,1),
        margin .2s cubic-bezier(.2,.8,.2,1), opacity .2s ease;
      will-change: transform;
    }
    .cursor-dot.is-visible { opacity: 1; }
    /* over something clickable it swells; a page can also set --cursor-blend
       (the dark home page uses difference, so the dot inverts what's under it) */
    .cursor-dot.is-link {
      width: 44px; height: 44px;
      margin: -22px 0 0 -22px;
      mix-blend-mode: var(--cursor-blend, normal);
    }
    .cursor-dot.is-down { width: 14px; height: 14px; margin: -7px 0 0 -7px; }
    .cursor-dot.is-link.is-down { width: 36px; height: 36px; margin: -18px 0 0 -18px; }
  `;
  document.head.appendChild(style);

  const dot = document.createElement("div");
  dot.className = "cursor-dot";
  dot.setAttribute("aria-hidden", "true");
  document.documentElement.classList.add("has-dot");

  const pos = { x: -100, y: -100 }, shown = { x: -100, y: -100 };
  const clickable = "a[href], button:not(:disabled), [role='button'], summary, label, input, select, textarea";
  addEventListener("pointermove", e => {
    if (e.pointerType !== "mouse") return;
    pos.x = e.clientX; pos.y = e.clientY;
    if (!dot.classList.contains("is-visible")) { shown.x = pos.x; shown.y = pos.y; dot.classList.add("is-visible"); }
    dot.classList.toggle("is-link", !!e.target.closest?.(clickable));
  }, { passive: true });
  addEventListener("pointerdown", () => dot.classList.add("is-down"));
  addEventListener("pointerup", () => dot.classList.remove("is-down"));
  document.addEventListener("mouseleave", () => dot.classList.remove("is-visible"));
  document.addEventListener("mouseenter", () => dot.classList.add("is-visible"));

  function moveDot() {
    // a hair of easing so it glides, without feeling detached from the hand
    const k = reduceMotion ? 1 : 0.45;
    shown.x += (pos.x - shown.x) * k;
    shown.y += (pos.y - shown.y) * k;
    dot.style.transform = `translate3d(${shown.x.toFixed(1)}px, ${shown.y.toFixed(1)}px, 0)`;
    // an open modal <dialog> sits in the top layer, above anything in <body>, so the dot rides inside it
    const host = document.querySelector("dialog[open]") || document.body;
    if (dot.parentNode !== host) host.appendChild(dot);
    requestAnimationFrame(moveDot);
  }
  const start = () => { document.body.appendChild(dot); requestAnimationFrame(moveDot); };
  if (document.body) start(); else addEventListener("DOMContentLoaded", start);

  // ---------- smooth wheel scrolling ----------
  // The page keeps its real scroll height and native scrolling; we only take over the wheel.
  // Each frame the rendered position eases toward where the wheel asked to go, so the
  // content trails the input slightly. Sticky elements, anchors and the scrollbar keep working.
  if (reduceMotion) return;
  const LERP = 0.11;
  let target = scrollY, current = scrollY, ours = scrollY, running = false;
  const maxScroll = () => document.documentElement.scrollHeight - innerHeight;

  addEventListener("wheel", e => {
    // leave pinch-zoom, sideways scrolling and anything inside its own scroller alone
    if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    for (let el = e.target; el && el !== document.body; el = el.parentElement) {
      if (el.scrollHeight > el.clientHeight && /auto|scroll/.test(getComputedStyle(el).overflowY)) return;
    }
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? innerHeight : 1;
    if (!running) { target = current = scrollY; }
    target = Math.max(0, Math.min(maxScroll(), target + e.deltaY * unit));
    if (!running) { running = true; requestAnimationFrame(step); }
  }, { passive: false });

  function step() {
    current += (target - current) * LERP;
    if (Math.abs(target - current) < 0.5) current = target;
    ours = Math.round(current);
    scrollTo({ top: ours, behavior: "instant" });
    if (current !== target) requestAnimationFrame(step);
    else running = false;
  }

  // keyboard, scrollbar, links or find-in-page moved the page: follow it instead of fighting it
  addEventListener("scroll", () => {
    if (Math.abs(scrollY - ours) > 2) { target = current = ours = scrollY; running = false; }
  }, { passive: true });
  addEventListener("resize", () => { target = Math.min(target, maxScroll()); });
})();
