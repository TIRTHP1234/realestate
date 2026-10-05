// Preloader — shown for a minimum of 3 seconds so it reads as a deliberate
// loading sequence rather than a flash, but the percentage/fill is still
// tied to real image-loading progress (never claims 100% before the
// images actually exist) — on a fast connection the counter simply paces
// itself out over the full 3s instead of jumping to 100% instantly. A
// longer safety cap prevents one slow/broken image from blocking forever.
// Ticks on a plain interval rather than requestAnimationFrame, since rAF
// can fully pause in a backgrounded/occluded tab and stall the countdown.
(function () {
  const pre = document.getElementById('preloader');
  if (!pre) return;

  const pctEl = document.getElementById('preloaderPct');
  const fillEl = document.getElementById('preloaderArchFill');
  const FILL_TOP = 10;    // svg y of the arch's inner top
  const FILL_BOTTOM = 162; // svg y of the arch's base
  const FILL_HEIGHT = FILL_BOTTOM - FILL_TOP;

  const MIN_DURATION = 3000; // ms — the preloader always shows for at least this long
  const SAFETY_TIMEOUT = 10000; // ms — never block longer than this regardless of loading

  const imgs = Array.from(document.images);
  const total = imgs.length || 1;
  let loaded = 0;
  let allLoaded = false;
  let done = false;
  const start = performance.now();

  function setProgress(pct) {
    if (pctEl) pctEl.textContent = `${Math.round(pct)}%`;
    if (fillEl) {
      const h = (pct / 100) * FILL_HEIGHT;
      fillEl.setAttribute('y', String(FILL_BOTTOM - h));
      fillEl.setAttribute('height', String(h));
    }
  }

  function finish() {
    if (done) return;
    done = true;
    clearInterval(timer);
    setProgress(100);
    document.body.classList.remove('is-preloading');
    pre.classList.add('is-hidden');
    setTimeout(() => pre.remove(), 800);
  }

  function tick() {
    if (done) return;
    const elapsed = performance.now() - start;
    const timeFraction = Math.min(elapsed / MIN_DURATION, 1);
    const loadFraction = loaded / total;
    setProgress(Math.min(timeFraction, loadFraction) * 100);

    if (elapsed >= MIN_DURATION && (allLoaded || elapsed >= SAFETY_TIMEOUT)) {
      finish();
    }
  }

  function bump() {
    loaded++;
    if (loaded >= total) allLoaded = true;
  }

  imgs.forEach((img) => {
    if (img.complete) {
      bump();
    } else {
      img.addEventListener('load', bump, { once: true });
      img.addEventListener('error', bump, { once: true });
    }
  });

  const timer = setInterval(tick, 80);
  tick();
})();

// Inertial smooth scrolling — wheel input moves a target position and the
// real scroll position eases toward it every frame, so every scroll-linked
// animation below (which all read the live scroll position) glides instead of
// stepping with each wheel notch. Touch keeps native momentum; reduced-motion
// users keep native scrolling. Exposes window.smoothScrollTo for nav buttons.
(function () {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const maxScroll = () => document.documentElement.scrollHeight - window.innerHeight;
  const clamp = (v) => Math.min(Math.max(v, 0), maxScroll());

  if (reduce || coarse) {
    window.smoothScrollTo = (y) => window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
    return;
  }

  const EASE = 0.075;
  let target = window.scrollY;
  let current = target;
  let lastSet = target;
  let raf = 0;

  function tick() {
    const diff = target - current;
    current = Math.abs(diff) < 0.2 ? target : current + diff * EASE;
    lastSet = current;
    window.scrollTo(0, current);
    raf = current === target ? 0 : requestAnimationFrame(tick);
  }

  function kick() {
    if (!raf) raf = requestAnimationFrame(tick);
  }

  window.addEventListener('wheel', (e) => {
    if (e.ctrlKey) return;
    e.preventDefault();
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 32;
    else if (e.deltaMode === 2) dy *= window.innerHeight;
    target = clamp(target + dy);
    kick();
  }, { passive: false });

  // Scrollbar drag, keyboard and anchor jumps move the page natively —
  // resync so the eased position never fights them.
  window.addEventListener('scroll', () => {
    if (Math.abs(window.scrollY - lastSet) > 1.5) {
      target = current = lastSet = window.scrollY;
    }
  }, { passive: true });

  window.addEventListener('resize', () => { target = clamp(target); });

  window.smoothScrollTo = (y) => { target = clamp(y); kick(); };

  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link || link.getAttribute('href') === '#') return;
    const dest = document.querySelector(link.getAttribute('href'));
    if (!dest) return;
    e.preventDefault();
    window.smoothScrollTo(dest.getBoundingClientRect().top + window.scrollY);
  });
})();

// Staggered hero load-in — fires shortly after paint so the video has a frame up.
(function () {
  requestAnimationFrame(() => {
    setTimeout(() => document.body.classList.add('is-loaded'), 150);
  });
})();

// Hero pin/scrub — the video never free-plays. It stays paused and only
// advances or reverses as the user scrolls through the tall hero wrapper,
// so scroll position drives playback position directly: fast scroll = fast
// playback, slow scroll = slow playback, no scroll = frozen, scrolling back
// up plays it backward. Progress is clamped to [0,1] against the hero's own
// scroll range, so scrolling further down past the end (into the next
// chapter) or further up past the top just holds on the end/start frame —
// it never jumps or resets. rAF-throttled.
(function () {
  const wrap = document.getElementById('hero');
  const video = document.getElementById('heroVideo');
  const content = document.getElementById('heroContent');
  const overlay = document.querySelector('.hero-overlay');
  if (!wrap || !video || !content) return;

  video.pause();

  let duration = 0;
  video.addEventListener('loadedmetadata', () => {
    duration = video.duration || 0;
    video.currentTime = 0;
  });

  let ticking = false;

  function update() {
    ticking = false;
    const rect = wrap.getBoundingClientRect();
    const scrollRange = wrap.offsetHeight - window.innerHeight;
    const progress = Math.min(Math.max(-rect.top / scrollRange, 0), 1);

    if (duration && video.seeking === false) {
      video.currentTime = progress * duration;
    }

    content.style.opacity = String(1 - progress * 1.3);
    content.style.transform = `translateY(${progress * -60}px)`;
    if (overlay) overlay.style.opacity = String(0.9 + progress * 0.4);
  }

  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  update();
})();

// Arch gallery reveal — the row pins for a fixed scroll range, divided into
// a short lead-in, one equal segment per image, and a short trailing
// buffer. Each arch's opacity/transform is a CONTINUOUS function of how far
// scroll has progressed through its own segment (not a snap-and-pause
// toggle), so the fade-in itself plays out gradually as you scroll — slow
// scroll = slow reveal, fast scroll = fast reveal, no scroll = frozen
// mid-fade exactly where you stopped. Once a segment is fully passed the
// arch simply stays fully visible (images accumulate left to right); once
// its own segment is passed in reverse it fades back out — bidirectional,
// same as the hero. No CSS transition involved: values are written every
// frame directly, so nothing keeps moving after the scroll event stops.
(function () {
  const wrap = document.getElementById('archPinWrap');
  if (!wrap) return;

  const items = Array.from(wrap.querySelectorAll('.arch-item'));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lead = 0.06;
  const trail = 0.06;
  const segment = (1 - lead - trail) / items.length;
  const starts = items.map((_, i) => lead + i * segment);

  let ticking = false;

  function update() {
    ticking = false;
    const rect = wrap.getBoundingClientRect();
    const scrollRange = wrap.offsetHeight - window.innerHeight;
    const progress = Math.min(Math.max(-rect.top / scrollRange, 0), 1);

    items.forEach((item, i) => {
      const local = Math.min(Math.max((progress - starts[i]) / segment, 0), 1);
      if (reduceMotion) {
        item.style.opacity = local >= 0.5 ? '1' : '0';
        item.style.transform = 'none';
      } else {
        item.style.opacity = String(local);
        item.style.transform = `translateY(${(1 - local) * 40}px) scale(${0.97 + local * 0.03})`;
      }
    });
  }

  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  update();
})();

// Twelve Ways — pinned side-menu amenities gallery. The pin covers 12 equal
// scroll segments; scroll position maps to a discrete index (not a
// continuous scrub — this one wants exactly one active item, no partial
// blend), and the DOM only updates when that index actually changes, so
// there's never more than one fully-opaque image/menu item and nothing
// moves once scrolling stops. Reversible: scrolling back up steps
// backward through the same segments. Menu items are also clickable and
// jump straight to the matching scroll position.
(function () {
  const wrap = document.getElementById('waysPinWrap');
  if (!wrap) return;

  const rows = Array.from(wrap.querySelectorAll('.ways-row'));
  const images = Array.from(wrap.querySelectorAll('.ways-img'));
  const indexLabelEl = document.getElementById('waysIndexLabel');
  const progCurrentEl = document.getElementById('waysProgCurrent');
  const listEl = document.getElementById('waysList');
  const listWrap = listEl ? listEl.parentElement : null; // the actual clipped/overflow:hidden viewport
  const count = rows.length;

  let currentIndex = -1;
  let ticking = false;

  function setActive(i) {
    if (i === currentIndex) return;
    currentIndex = i;

    rows.forEach((row, idx) => row.classList.toggle('is-active', idx === i));
    images.forEach((img, idx) => img.classList.toggle('is-active', idx === i));

    if (indexLabelEl) indexLabelEl.textContent = String(i + 1).padStart(2, '0');
    if (progCurrentEl) progCurrentEl.textContent = String(i + 1).padStart(2, '0');

    // Keep the active row visible within the list without native smooth-
    // scroll easing (that would be extra motion after the triggering
    // scroll event) — a direct transform tied to the same index change.
    const activeRow = rows[i];
    if (listEl && listWrap && activeRow) {
      // listWrap is the overflow:hidden viewport (fixed height from the pin);
      // listEl is the full-height content block that actually moves.
      const rowHeight = activeRow.offsetHeight;
      const rawOffset = activeRow.offsetTop - (listWrap.clientHeight - rowHeight) / 2;
      const maxOffset = Math.max(0, listEl.scrollHeight - listWrap.clientHeight);
      const clamped = Math.min(Math.max(rawOffset, 0), maxOffset);
      // Snap to whole-row increments so a neighboring row is never sliced
      // to a partial sliver (e.g. its description visible but its
      // title/number scrolled just out of view) — on short viewports the
      // raw centering offset could land mid-row.
      const snapped = rowHeight > 0 ? Math.round(clamped / rowHeight) * rowHeight : clamped;
      listEl.style.transform = `translateY(${-Math.min(snapped, maxOffset)}px)`;
    }
  }

  function update() {
    ticking = false;
    const rect = wrap.getBoundingClientRect();
    const scrollRange = wrap.offsetHeight - window.innerHeight;
    const progress = Math.min(Math.max(-rect.top / scrollRange, 0), 1);

    let idx = Math.floor(progress * count);
    idx = Math.min(count - 1, Math.max(0, idx));
    setActive(idx);
  }

  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }

  rows.forEach((row) => {
    row.addEventListener('click', () => {
      const i = Number(row.dataset.way);
      const scrollRange = wrap.offsetHeight - window.innerHeight;
      const targetProgress = (i + 0.5) / count;
      window.smoothScrollTo(wrap.getBoundingClientRect().top + window.scrollY + targetProgress * scrollRange);
    });
  });

  window.addEventListener('scroll', onScroll, { passive: true });
  setActive(0);
  update();
})();

// Wellness & Wellbeing — horizontal scroll-scrubbed filmstrip. Vertical
// scroll through the tall pin wrapper drives a CONTINUOUS translateX of
// the panel track (same direct scroll-binding technique as the hero
// video, just moving sideways instead of scrubbing playback), so
// consecutive panels are genuinely visible sliding past each other
// mid-scroll — real continuity between slides, not a simulated one. No
// snapping, no timers: the track only ever moves in direct response to a
// scroll event, and freezes exactly where the user stops scrolling;
// scrolling back up reverses the slide cleanly. The bottom tab row is a
// separate discrete "nearest panel" indicator layered on top, purely for
// orientation and click-to-jump — it doesn't affect the smooth slide.
(function () {
  const wrap = document.getElementById('wellnessPinWrap');
  const track = document.getElementById('wellnessTrack');
  if (!wrap || !track) return;

  const panelEls = Array.from(track.querySelectorAll('.wellness-panel')); // intro + 5 moments
  const panelCount = panelEls.length;
  const tabs = Array.from(wrap.querySelectorAll('.wellness-tabs button'));
  const progCurrentEl = document.getElementById('wellnessProgCurrent');

  let ticking = false;
  let currentTab = -1;

  function update() {
    ticking = false;
    const rect = wrap.getBoundingClientRect();
    const scrollRange = wrap.offsetHeight - window.innerHeight;
    const progress = Math.min(Math.max(-rect.top / scrollRange, 0), 1);

    const shiftPercent = progress * ((panelCount - 1) / panelCount) * 100;
    track.style.transform = `translateX(-${shiftPercent}%)`;

    const nearestPanel = Math.round(progress * (panelCount - 1));
    const tabIndex = nearestPanel - 1; // panel 0 is the intro slide, no tab
    if (tabIndex !== currentTab) {
      currentTab = tabIndex;
      tabs.forEach((tab, idx) => tab.classList.toggle('is-active', idx === tabIndex));
      if (progCurrentEl) {
        const displayNum = Math.max(1, Math.min(tabs.length, tabIndex + 1));
        progCurrentEl.textContent = String(displayNum).padStart(2, '0');
      }
    }
  }

  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const panelIndex = Number(tab.dataset.moment) + 1;
      const scrollRange = wrap.offsetHeight - window.innerHeight;
      const targetProgress = panelIndex / (panelCount - 1);
      window.smoothScrollTo(wrap.getBoundingClientRect().top + window.scrollY + targetProgress * scrollRange);
    });
  });

  window.addEventListener('scroll', onScroll, { passive: true });
  update();
})();

// By the Water — two scroll-bound stages sharing one pin. Stage A (first
// half of the range): the video's inset margin and corner radius shrink
// to zero while it scales up slightly, ending edge-to-edge; a line of
// text fades in once that settle is mostly complete. Stage B (second
// half): a solid-color panel for the next chapter rises from the bottom
// edge, fully covering the video by the end. Both are plain functions of
// scroll position — no timers, reversible, holds wherever scrolling stops.
(function () {
  const wrap = document.getElementById('stillnessWrap');
  const topbar = document.getElementById('stillnessTopbar');
  const frame = document.getElementById('stillnessVideoFrame');
  const video = frame ? frame.querySelector('video') : null;
  const text = document.getElementById('stillnessVideoText');
  const next = document.getElementById('stillnessNext');
  if (!wrap || !frame || !next) return;

  const MAX_INSET = 64; // px, at the very start of stage A

  let ticking = false;

  function update() {
    ticking = false;
    const rect = wrap.getBoundingClientRect();
    const scrollRange = wrap.offsetHeight - window.innerHeight;
    const progress = Math.min(Math.max(-rect.top / scrollRange, 0), 1);

    const stageA = Math.min(Math.max(progress / 0.5, 0), 1);
    const stageB = Math.min(Math.max((progress - 0.5) / 0.5, 0), 1);

    const inset = (1 - stageA) * MAX_INSET;
    frame.style.top = `${inset}px`;
    frame.style.left = `${inset}px`;
    frame.style.right = `${inset}px`;
    frame.style.bottom = `${inset}px`;
    frame.style.borderRadius = `${(1 - stageA) * 28}px`;
    if (video) video.style.transform = `scale(${1 + stageA * 0.12})`;

    if (topbar) topbar.style.opacity = String(1 - stageA);
    if (text) {
      const textReveal = Math.min(Math.max((stageA - 0.6) / 0.4, 0), 1);
      text.style.opacity = String(textReveal);
    }

    next.style.clipPath = `circle(${stageB * 150}% at 50% 100%)`;
  }

  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  update();
})();

// The Rooftop — a normal (non-pinned) section with a gentle scroll-tied
// zoom on the photo and a small parallax drift on the text. progress runs
// 0 (section just entering the bottom of the viewport) to 1 (section
// fully exited past the top), giving smooth motion as the user scrolls
// through it normally — no pin, no scroll-jacking, just a subtle lift.
(function () {
  const section = document.getElementById('rooftop');
  const media = document.getElementById('rooftopMedia');
  const content = document.getElementById('rooftopContent');
  if (!section || !media || !content) return;

  const img = media.querySelector('img');
  let ticking = false;

  function update() {
    ticking = false;
    const rect = section.getBoundingClientRect();
    const total = rect.height + window.innerHeight;
    const scrolled = window.innerHeight - rect.top;
    const progress = Math.min(Math.max(scrolled / total, 0), 1);

    if (img) img.style.transform = `scale(${1.28 - progress * 0.28})`;

    // ~3.5% of the section's own height, centered on the midpoint so the
    // text drifts gently upward as the section scrolls through, rather
    // than starting or ending at an offset.
    const driftRange = rect.height * 0.035;
    content.style.transform = `translateY(${(progress - 0.5) * driftRange}px)`;
  }

  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  update();
})();

// The Details — normal (non-pinned) section, just above the footer. The
// photo opens from the left edge out to full width over the first stretch
// of scroll (slow and deliberate), arriving together with the first fact
// on the right. The remaining three facts then fade up from below one at
// a time after that, each keyed to its own slice of the same progress
// value, so they arrive in sequence rather than all at once.
(function () {
  const section = document.getElementById('details');
  const media = document.querySelector('.details-media');
  const items = Array.from(document.querySelectorAll('.details-item'));
  if (!section || !media || !items.length) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

  // Item 0 (and the photo) get a wide, slow span at the very start; the
  // rest share the remaining scroll range in sequence, with a short trail.
  const openSpan = 0.32;
  const trail = 0.1;
  const restSpan = (1 - openSpan - trail) / (items.length - 1);
  const starts = items.map((_, i) => (i === 0 ? 0 : openSpan + (i - 1) * restSpan));
  const spans = items.map((_, i) => (i === 0 ? openSpan : restSpan));

  let ticking = false;

  function update() {
    ticking = false;
    const rect = section.getBoundingClientRect();
    // Unlike the other normal-flow sections, this one sits directly above
    // the footer with little to no scroll room after it — so progress is
    // measured against the section's own height (completing once it has
    // scrolled fully into and through view), not height + a trailing
    // viewport, which a short footer could never provide enough room for.
    const total = rect.height;
    const scrolled = window.innerHeight - rect.top;
    const progress = Math.min(Math.max(scrolled / total, 0), 1);

    const openness = Math.min(Math.max(progress / openSpan, 0), 1);
    media.style.clipPath = `inset(0 ${(1 - openness) * 100}% 0 0)`;

    items.forEach((item, i) => {
      const local = Math.min(Math.max((progress - starts[i]) / spans[i], 0), 1);
      item.style.opacity = String(local);
      item.style.transform = `translateY(${(1 - local) * 34}px)`;
    });
  }

  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  update();
})();

// Elevation — pinned scroll-scrub. The ELARA mark is fully visible at
// rest, before any scrolling; as the arch-shaped frame (rounded top, flat
// bottom — set via shrinking inset + border-radius, the same technique as
// the By the Water section's video frame) grows toward a full-screen
// photo, it fades out of the way over the first part of that growth. Once
// the photo has fully opened, the closing heading rises up from below the
// bottom edge and fades in over it. Plain function of scroll position,
// reversible, holds wherever scrolling stops.
(function () {
  const wrap = document.getElementById('elevationPinWrap');
  const media = document.getElementById('elevationMedia');
  const caption = document.getElementById('elevationCaption');
  const text = document.getElementById('elevationText');
  if (!wrap || !media || !text) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

  const OPEN_END = 0.65;
  const CAPTION_FADE_END = 0.3; // fraction of OPEN_END over which the mark clears out
  const MAX_INSET_V = 22; // %, top/bottom margin at rest (arch closed)
  const MAX_INSET_H = 34; // %, left/right margin at rest
  const MAX_RADIUS = 420; // px, top-corner radius at rest

  let ticking = false;

  function update() {
    ticking = false;
    const rect = wrap.getBoundingClientRect();
    const scrollRange = wrap.offsetHeight - window.innerHeight;
    const progress = Math.min(Math.max(-rect.top / scrollRange, 0), 1);

    const openStage = Math.min(Math.max(progress / OPEN_END, 0), 1);
    const closed = 1 - openStage;
    media.style.top = `${closed * MAX_INSET_V}%`;
    media.style.bottom = `${closed * MAX_INSET_V}%`;
    media.style.left = `${closed * MAX_INSET_H}%`;
    media.style.right = `${closed * MAX_INSET_H}%`;
    media.style.borderRadius = `${closed * MAX_RADIUS}px ${closed * MAX_RADIUS}px 0 0`;

    if (caption) {
      const captionVisible = 1 - Math.min(Math.max(openStage / CAPTION_FADE_END, 0), 1);
      caption.style.opacity = String(captionVisible);
    }

    const textStage = Math.min(Math.max((progress - OPEN_END) / (1 - OPEN_END), 0), 1);
    text.style.opacity = String(textStage);
    text.style.transform = `translate(-50%, ${(1 - textStage) * 40}px)`;
  }

  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  update();
})();

// For the Youngest Guests — multi-layer parallax. Three elements (text
// block, arch image, inset photo) each drift upward by a different
// fraction of the section's own height as it passes through the
// viewport on normal scrolling — no pin. Plain function of scroll
// position, reversible, no timers.
(function () {
  const section = document.getElementById('family');
  const content = document.getElementById('familyContent');
  const arch = document.getElementById('familyArch');
  const archImg = arch ? arch.querySelector('img') : null;
  const inset = document.getElementById('familyInset');
  const title = document.getElementById('familyTitle');
  if (!section || !content) return;

  let ticking = false;

  function update() {
    ticking = false;
    const rect = section.getBoundingClientRect();
    const total = rect.height + window.innerHeight;
    const scrolled = window.innerHeight - rect.top;
    const progress = Math.min(Math.max(scrolled / total, 0), 1);
    const h = rect.height;

    content.style.transform = `translateY(${-progress * h * 0.15}px)`;
    if (arch) arch.style.transform = `translateY(${-progress * h * 0.15}px)`;
    // Inset photo drifts up AND left, closing in toward the text column
    // rather than just floating vertically like the other layers.
    if (inset) {
      inset.style.transform = `translateY(${-progress * h * 0.15}px) translateX(${-progress * 360}px)`;
    }
    // Zoom the photo within the fixed arch frame — separate from the
    // frame's own float above, so the arch shape itself stays a constant
    // size while the image inside it pulls back.
    if (archImg) archImg.style.transform = `scale(${1.25 - progress * 0.25})`;
    // Headline grows slightly as the section scrolls through — separate
    // transform from the content block's own float so the two combine
    // visually without one overriding the other.
    if (title) title.style.transform = `scale(${1 + progress * 0.2})`;
  }

  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  update();
})();

// A Walk Through Elara — pinned scroll collage. Image A starts large and
// centered and grows to cover the full screen width. Image B sits bottom
// left and drifts up toward the caption. Image C sits bottom right, sized
// larger at rest, and drifts up over image A's corner as it grows — so the
// caption shifts further left on scroll to stay clear of that overlap.
// Everything is a direct function of scroll progress — nothing moves once
// scrolling stops, and it reverses cleanly on the way back up.
(function () {
  const wrap = document.getElementById('scenesPinWrap');
  const frameA = document.getElementById('scenesFrameA');
  const frameB = document.getElementById('scenesFrameB');
  const frameC = document.getElementById('scenesFrameC');
  const text = document.getElementById('scenesText');
  if (!wrap || !frameA || !frameB || !frameC || !text) return;

  let ticking = false;

  function update() {
    ticking = false;
    const rect = wrap.getBoundingClientRect();
    const scrollRange = wrap.offsetHeight - window.innerHeight;
    const progress = Math.min(Math.max(-rect.top / scrollRange, 0), 1);
    const ease = progress * progress * (3 - 2 * progress); // smoothstep

    const aScale = 1 + ease * 0.3;
    frameA.style.transform = window.innerWidth > 640
      ? `translateX(-50%) scale(${aScale})`
      : `translateX(-50%) scale(${1 + ease * 0.18})`;

    frameB.style.transform = `translate(${ease * 20}%, ${ease * -34}%)`;
    frameC.style.transform = `translate(${ease * -8}%, ${ease * -108}%) scale(${1 + ease * 0.05})`;

    text.style.transform = window.innerWidth > 640
      ? `translateX(calc(-50% - ${ease * 32}%))`
      : `translateY(${ease * -6}%)`;
  }

  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  update();
})();

// Fixed nav — fades in once the hero has scrolled past, gains a solid
// backdrop once we're deeper into the page.
(function () {
  const nav = document.getElementById('siteNav');
  const hero = document.getElementById('hero');
  if (!nav || !hero) return;

  function onScroll() {
    const heroBottom = hero.offsetTop + hero.offsetHeight * 0.35;
    nav.classList.toggle('is-visible', window.scrollY > 120);
    nav.classList.toggle('is-solid', window.scrollY > heroBottom);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();

// Top scroll-progress bar.
(function () {
  const bar = document.getElementById('progressBar');
  if (!bar) return;

  function onScroll() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const progress = max > 0 ? window.scrollY / max : 0;
    bar.style.transform = `scaleX(${progress})`;
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();

// Full-screen chapter menu toggle. The Collection section's own "THE
// CHAPTERS" button (inside the pinned frame) opens the same global overlay
// rather than duplicating a second menu system.
(function () {
  const toggle = document.getElementById('menuToggle');
  const waysToggle = document.getElementById('waysChaptersBtn');
  const close = document.getElementById('menuClose');
  const menu = document.getElementById('chapterMenu');
  if (!menu) return;

  function open() { menu.classList.add('is-open'); }
  function shut() { menu.classList.remove('is-open'); }

  if (toggle) toggle.addEventListener('click', open);
  if (waysToggle) waysToggle.addEventListener('click', open);
  if (close) close.addEventListener('click', shut);
  menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', shut));
})();

// Scroll-triggered reveal for sections below the fold.
(function () {
  const targets = document.querySelectorAll('.reveal');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  targets.forEach((el) => observer.observe(el));
})();

// Residence / floor-type selector.
(function () {
  const tabs = document.getElementById('selectorTabs');
  if (!tabs) return;

  const unitData = {
    '1br': {
      name: 'One Bedroom',
      copy: 'A single considered space, framed by glass on two sides.',
      size: '68–82 sq m',
      ceiling: '3.1 m',
      balcony: 'Private, full-width',
      plan: '<rect x="20" y="20" width="360" height="260" /><line x1="180" y1="20" x2="180" y2="160" /><line x1="180" y1="160" x2="380" y2="160" /><line x1="20" y1="200" x2="180" y2="200" />'
    },
    '2br': {
      name: 'Two Bedroom',
      copy: 'Room to breathe, arranged around the view.',
      size: '104–128 sq m',
      ceiling: '3.1 m',
      balcony: 'Private, wraparound',
      plan: '<rect x="20" y="20" width="360" height="260" /><line x1="150" y1="20" x2="150" y2="180" /><line x1="150" y1="180" x2="380" y2="180" /><line x1="260" y1="20" x2="260" y2="180" /><line x1="20" y1="220" x2="260" y2="220" />'
    },
    '3br': {
      name: 'Three Bedroom',
      copy: 'Family living without the compromise.',
      size: '152–188 sq m',
      ceiling: '3.4 m',
      balcony: 'Private, dual-aspect',
      plan: '<rect x="20" y="20" width="360" height="260" /><line x1="130" y1="20" x2="130" y2="200" /><line x1="240" y1="20" x2="240" y2="200" /><line x1="20" y1="220" x2="380" y2="220" /><line x1="300" y1="20" x2="300" y2="200" />'
    },
    'ph': {
      name: 'Penthouse',
      copy: "The building's final word, above it all.",
      size: '310–420 sq m',
      ceiling: '4.6 m',
      balcony: 'Private terrace, all sides',
      plan: '<rect x="20" y="20" width="360" height="260" /><line x1="120" y1="20" x2="120" y2="240" /><line x1="220" y1="20" x2="220" y2="240" /><line x1="320" y1="20" x2="320" y2="240" /><line x1="20" y1="240" x2="380" y2="240" />'
    }
  };

  const nameEl = document.getElementById('unitName');
  const copyEl = document.getElementById('unitCopy');
  const sizeEl = document.getElementById('unitSize');
  const ceilingEl = document.getElementById('unitCeiling');
  const balconyEl = document.getElementById('unitBalcony');
  const planEl = document.getElementById('planSvg');

  tabs.querySelectorAll('.selector-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const data = unitData[tab.dataset.unit];
      if (!data) return;

      tabs.querySelectorAll('.selector-tab').forEach((t) => t.classList.remove('is-active'));
      tab.classList.add('is-active');

      planEl.style.opacity = '0';
      setTimeout(() => {
        nameEl.textContent = data.name;
        copyEl.textContent = data.copy;
        sizeEl.textContent = data.size;
        ceilingEl.textContent = data.ceiling;
        balconyEl.textContent = data.balcony;
        planEl.innerHTML = data.plan;
        planEl.style.opacity = '1';
      }, 200);
    });
  });
})();
