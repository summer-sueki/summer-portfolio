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
    .cursor-dot {
      position: fixed;
      top: 0; left: 0;
      z-index: 100;
      width: 12px; height: 12px;
      margin: -6px 0 0 -6px;
      border-radius: 50%;
      background: #2a300f;
      box-shadow: 0 0 0 1.5px rgba(253, 253, 248, 0.8);
      pointer-events: none;
      opacity: 0;
      transition: width .25s cubic-bezier(.2,.8,.2,1), height .25s cubic-bezier(.2,.8,.2,1),
        margin .25s cubic-bezier(.2,.8,.2,1), background-color .25s ease, opacity .2s ease;
      will-change: transform;
    }
    .cursor-dot.is-visible { opacity: 1; }
    /* over something clickable it opens into a soft ring */
    .cursor-dot.is-link {
      width: 40px; height: 40px;
      margin: -20px 0 0 -20px;
      background: rgba(42, 48, 15, 0.12);
      box-shadow: 0 0 0 1px rgba(42, 48, 15, 0.45);
    }
    .cursor-dot.is-down { width: 8px; height: 8px; margin: -4px 0 0 -4px; }
    .cursor-dot.is-link.is-down { width: 32px; height: 32px; margin: -16px 0 0 -16px; }
  `;
  document.head.appendChild(style);

  const dot = document.createElement("div");
  dot.className = "cursor-dot";
  dot.setAttribute("aria-hidden", "true");
  document.documentElement.classList.add("has-dot");

  const pos = { x: -100, y: -100 }, shown = { x: -100, y: -100 };
  const clickable = "a, button, [role='button'], summary, label, input, select, textarea";
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
