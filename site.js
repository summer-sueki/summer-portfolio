// Shared site behaviours: the /work address, a small circle cursor and gently smoothed wheel scrolling.

// ---------- /work: the home page's work grid at its own address ----------
// On the site (Vercel, see vercel.json) and the local server (.claude/serve.py), /work serves the home
// page; here it scrolls to the work grid. On the home page, clicking Work scrolls there and puts /work
// in the address bar without reloading. Opened straight from a file there's no server to map /work,
// so the links fall back to index.html#work.
(() => {
  const workLinks = () => document.querySelectorAll('a[href="work"]');
  if (location.protocol === "file:") {
    workLinks().forEach(a => a.setAttribute("href", "index.html#work"));
    return;
  }
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // our own eased glide (like the case studies' contents list): a browser's native smooth scroll
  // can be ignored, and any wheel, touch or key hands control straight back to the reader
  let raf = 0;
  const toWork = smooth => {
    const work = document.getElementById("work");
    if (!work) return;
    const margin = parseFloat(getComputedStyle(work).scrollMarginTop) || 0;
    const y = Math.max(0, Math.round(work.getBoundingClientRect().top + scrollY - margin));
    cancelAnimationFrame(raf);
    const from = scrollY, dist = y - from;
    if (!smooth || Math.abs(dist) < 2) { scrollTo({ top: y, behavior: "instant" }); return; }
    const ms = Math.min(1100, Math.max(450, Math.abs(dist) * .35)), t0 = performance.now();
    const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const stop = () => cancelAnimationFrame(raf);
    addEventListener("wheel", stop, { passive: true, once: true });
    addEventListener("touchstart", stop, { passive: true, once: true });
    addEventListener("keydown", stop, { once: true });
    const step = now => {
      const t = Math.min(1, (now - t0) / ms);
      scrollTo({ top: from + dist * ease(t), behavior: "instant" });
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };
  if (/\/work\/?$/.test(location.pathname)) {
    history.scrollRestoration = "manual";
    toWork(false);
    // once images have loaded and settled the layout, line it up again (unless the reader has moved on)
    addEventListener("load", () => { if (Math.abs(document.getElementById("work").getBoundingClientRect().top) < 400) toWork(false); }, { once: true });
  }
  document.addEventListener("click", e => {
    const a = e.target.closest?.('a[href="work"]');
    if (!a || !document.getElementById("work") || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault();
    if (!/\/work\/?$/.test(location.pathname)) history.pushState(null, "", "work");
    toWork(!reduce);
  });
  // Back/Forward between / and /work on the home page: glide to the matching spot
  addEventListener("popstate", () => {
    if (!document.getElementById("work")) return;
    if (/\/work\/?$/.test(location.pathname)) toWork(!reduce);
    else scrollTo({ top: 0, behavior: reduce ? "instant" : "smooth" });
  });
})();

// ---------- fade-in, on every page ----------
// The page's <head> has already hidden the entrance pieces (.fade-on on <html>; the list is in base.css).
// What's on screen now fades in, in reading order (so on About: the left column, then the resume);
// everything else fades in as it scrolls into view. A scroll check backs up the observer, so nothing
// skipped past by a fast scroll or a jump stays hidden.
(() => {
  const root = document.documentElement;
  if (!root.classList.contains("fade-on")) return;
  const FADE = [
    ".work .project",   // (the home intro fades on CSS alone: base.css)
    ".bio > *", ".letters", ".resume", ".photo-grid .shot",
    ".play-grid .toc", ".work .tile",
    ".case-hero .kicker", ".case-hero h1", ".case-hero .lede", ".case-hero .update", ".case-hero .cta-row",
    ".hero-media", ".facts > div", ".story .chapter > :not(:has(.chapter))", ".split > figure", ".next a",
  ].join(",");
  const els = [...document.querySelectorAll(FADE)];
  const show = (el, delay) => { el.style.setProperty("--fd", `${delay}ms`); el.classList.add("in"); };
  const onScreen = el => el.getBoundingClientRect().top < innerHeight;

  // on screen at load: in reading order, a beat apart. Two frames in, so the hidden state is painted
  // first (this deferred script can run before the first paint) and the fade actually runs
  const first = els.filter(onScreen), rest = els.filter(el => !first.includes(el));
  requestAnimationFrame(() => requestAnimationFrame(() => first.forEach((el, i) => show(el, Math.min(i, 7) * 100))));

  // the rest: as they come into view; things arriving together step in slightly
  const io = new IntersectionObserver(entries => {
    let k = 0;
    entries.forEach(e => {
      if (e.target.classList.contains("in") || (!e.isIntersecting && e.boundingClientRect.top > 0)) return;
      show(e.target, Math.min(k++, 3) * 80);
      io.unobserve(e.target);
    });
  }, { threshold: .1 });
  rest.forEach(el => io.observe(el));

  let queued = false;
  const sweep = () => {
    queued = false;
    els.forEach(el => { if (!el.classList.contains("in") && onScreen(el)) show(el, 0); });
  };
  addEventListener("scroll", () => { if (!queued) { queued = true; requestAnimationFrame(sweep); } }, { passive: true });
  addEventListener("resize", sweep);
  addEventListener("hashchange", sweep);
  window.__fadeReady = true;   // set up without a hitch: the head's 3-second safety switch can stand down
})();

// The cursor and smooth scrolling only switch on for mouse/trackpad users who haven't asked for reduced motion.
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
