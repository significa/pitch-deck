/* ─── SLIDE ENGINE ───────────────────────────────────────────────────────── */

const slides = Array.from(document.querySelectorAll(".slide"));
const counterCurrent = document.querySelector(".deck-nav__counter-current");
const counterTotal = document.querySelector(".deck-nav__counter-total");

const hashIndex = parseInt(location.hash.slice(1), 10) - 1;
const sessionIndex = parseInt(sessionStorage.getItem("slide"), 10);
const startIndex =
  Number.isFinite(hashIndex) && hashIndex >= 0 && hashIndex < slides.length
    ? hashIndex
    : Number.isFinite(sessionIndex) &&
        sessionIndex >= 0 &&
        sessionIndex < slides.length
      ? sessionIndex
      : 0;
let current = startIndex;

if (counterTotal) counterTotal.textContent = slides.length;

function animateStagger(slide) {
  slide.querySelectorAll("[data-stagger]").forEach((container) => {
    Array.from(container.children).forEach((child, i) => {
      child.getAnimations().forEach((a) => a.cancel());
      child.animate(
        [
          { opacity: 0, transform: "translateY(32px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        {
          duration: 1000,
          delay: i * 120,
          easing: "cubic-bezier(0.05, 0.7, 0.1, 1)",
          fill: "forwards",
        },
      );
    });
  });
}

function activateSlide(next) {
  const outgoing = slides[current];
  outgoing.setAttribute("data-leaving", "");
  outgoing.removeAttribute("data-active");
  outgoing.addEventListener(
    "transitionend",
    () => outgoing.removeAttribute("data-leaving"),
    { once: true },
  );
  destroyShowcase();
  deactivateStatementMedia(outgoing);
  current = next;
  slides[current].setAttribute("data-active", "");
  if (counterCurrent) counterCurrent.textContent = current + 1;
  location.hash = current + 1;
  sessionStorage.setItem("slide", current);
  syncThumbnails();
  animateStagger(slides[current]);
  animateTabs(slides[current]);
  if (slides[current].dataset.slideType === "showcase") initShowcase(slides[current]);
  if (slides[current].dataset.slideType === "cover" || slides[current].dataset.slideType === "end") alignCoverSquares(slides[current]);
  activateStatementMedia(slides[current]);
}

function goTo(index) {
  const next = Math.max(0, Math.min(index, slides.length - 1));
  if (next === current) return;

  activateSlide(next);
}

function animateTabs(slide) {
    const group = slide.matches('[data-tabs]') ? slide : slide.querySelector('[data-tabs]')
    if (!group) return
    const activeTrigger = group.querySelector('[data-tab-trigger][data-active]')
    if (!activeTrigger) return
    const bg = activeTrigger.querySelector('.scope__trigger-bg')
    if (!bg) return
    // Snap to 0% immediately
    bg.style.transition = 'none'
    bg.style.width = '0%'
    bg.style.clipPath = 'polygon(0 0, 100% 0, calc(100% - 24px) 100%, 0 100%)'
    // Frame 1: browser paints 0%
    requestAnimationFrame(() => {
        // Frame 2: transition starts from the painted 0%
        requestAnimationFrame(() => {
            bg.style.transition = 'width 700ms cubic-bezier(0.05, 0.7, 0.1, 1), clip-path 0ms'
            bg.style.width = '100%'
            bg.style.clipPath = 'polygon(0 0, 100% 0, 100% 100%, 0 100%)'
            bg.addEventListener('transitionend', () => {
                bg.style.transition = ''
                bg.style.width = ''
                bg.style.clipPath = ''
            }, { once: true })
        })
    })
}

function activateTab(group, index) {
  const triggers = Array.from(group.querySelectorAll("[data-tab-trigger]"));
  const panels = Array.from(group.querySelectorAll("[data-tab-panel]"));
  triggers.forEach((t) => t.removeAttribute("data-active"));
  panels.forEach((p) => p.removeAttribute("data-active"));
  triggers[index]?.setAttribute("data-active", "");
  panels[index]?.setAttribute("data-active", "");
}

// Keyboard
document.addEventListener("keydown", (e) => {
  if (
    e.key === "ArrowRight" ||
    e.key === "ArrowDown" ||
    e.key === "ArrowLeft" ||
    e.key === "ArrowUp"
  ) {
    const forward = e.key === "ArrowRight" || e.key === "ArrowDown";
    const group = slides[current].matches("[data-tabs]")
      ? slides[current]
      : slides[current].querySelector("[data-tabs]");
    if (!group) {
      forward ? goTo(current + 1) : goTo(current - 1);
    } else {
      const triggers = Array.from(group.querySelectorAll("[data-tab-trigger]"));
      const activeIndex = triggers.findIndex((t) =>
        t.hasAttribute("data-active"),
      );
      const next = activeIndex + (forward ? 1 : -1);
      if (next < 0) goTo(current - 1);
      else if (next >= triggers.length) goTo(current + 1);
      else activateTab(group, next);
    }
  }
  if (e.key === "r" || e.key === "R") {
    document.querySelectorAll("[data-tabs]").forEach((g) => activateTab(g, 0));
    goTo(0);
  }
  if (e.key === "s" || e.key === "S") toggleSidebar();
  if (e.key === "n" || e.key === "N") {
    if (nav?.hasAttribute("data-hidden")) showNav();
    else { clearTimeout(hideTimer); nav?.setAttribute("data-hidden", ""); }
  }
  if (e.key === "Tab") {
    e.preventDefault();
    const group = slides[current].matches("[data-tabs]")
      ? slides[current]
      : slides[current].querySelector("[data-tabs]");
    const forward = !e.shiftKey;
    if (!group) {
      forward ? goTo(current + 1) : goTo(current - 1);
      return;
    }
    const triggers = Array.from(group.querySelectorAll("[data-tab-trigger]"));
    const activeIndex = triggers.findIndex((t) =>
      t.hasAttribute("data-active"),
    );
    const next = activeIndex + (forward ? 1 : -1);
    if (next < 0) goTo(current - 1);
    else if (next >= triggers.length) goTo(current + 1);
    else activateTab(group, next);
  }
  if (e.key >= "1" && e.key <= "9") goTo(parseInt(e.key) - 1);
});

// Nav buttons
document
  .querySelector(".deck-nav__prev")
  ?.addEventListener("click", () => goTo(current - 1));
document
  .querySelector(".deck-nav__next")
  ?.addEventListener("click", () => goTo(current + 1));
document
  .querySelector(".deck-nav__reset")
  ?.addEventListener("click", () => {
    document.querySelectorAll("[data-tabs]").forEach((g) => activateTab(g, 0));
    goTo(0);
  });

// Touch swipe
let touchStartX = 0;
document.addEventListener(
  "touchstart",
  (e) => {
    touchStartX = e.touches[0].clientX;
  },
  { passive: true },
);
document.addEventListener("touchend", (e) => {
  const delta = touchStartX - e.changedTouches[0].clientX;
  if (Math.abs(delta) > 50) goTo(current + (delta > 0 ? 1 : -1));
});

/* ─── SIDEBAR ────────────────────────────────────────────────────────────── */

const sidebar = document.querySelector(".deck-sidebar");
const toggleBtn = document.querySelector(".deck-nav__toggle");

function buildThumbnails() {
  const list = document.querySelector(".deck-sidebar__list");
  if (!list) return;

  const listEl = document.querySelector(".deck-sidebar__list");
  const THUMB_W = listEl ? listEl.offsetWidth : 220;
  const THUMB_H = THUMB_W * (9 / 16);
  const scale = Math.max(
    THUMB_W / window.innerWidth,
    THUMB_H / window.innerHeight,
  );

  slides.forEach((slide, i) => {
    const item = document.createElement("div");
    item.className = "thumbnail";

    const num = document.createElement("span");
    num.className = "thumbnail__number";
    num.textContent = i + 1;

    const preview = document.createElement("div");
    preview.className = "thumbnail__preview";
    const clone = slide.cloneNode(true);
    clone.setAttribute("data-active", "");
    clone.setAttribute("data-thumbnail", "");
    clone.removeAttribute("data-leaving");
    if (clone.dataset.slideType === "showcase") {
      clone.querySelector(".showcase__media-item")?.setAttribute("data-active", "");
    }
    clone.style.cssText = `
            width: ${window.innerWidth}px;
            height: ${window.innerHeight}px;
            transform: scale(${scale});
            transform-origin: top left;
            opacity: 1;
            pointer-events: none;
        `;

    preview.appendChild(clone);
    preview.appendChild(num);
    item.appendChild(preview);
    item.addEventListener("click", () => goTo(i));
    list.appendChild(item);
  });
}

function syncThumbnails() {
  document.querySelectorAll(".thumbnail").forEach((thumb, i) => {
    thumb.toggleAttribute("data-active", i === current);
  });
  // Scroll active thumbnail into view
  document
    .querySelector(".thumbnail[data-active]")
    ?.scrollIntoView({ block: "nearest" });
}

function toggleSidebar() {
  const isOpen = document.body.hasAttribute("data-sidebar-open");
  document.body.toggleAttribute("data-sidebar-open", !isOpen);
  toggleBtn?.setAttribute("aria-pressed", String(!isOpen));
}

toggleBtn?.addEventListener("click", toggleSidebar);

/* ─── SHOWCASE SLIDER ────────────────────────────────────────────────────── */

const SHOWCASE_DURATION = 5000;
let showcaseCleanup = null;

function destroyShowcase() {
  if (showcaseCleanup) {
    showcaseCleanup();
    showcaseCleanup = null;
  }
}

function initShowcase(slide) {
  destroyShowcase();
  const items = Array.from(slide.querySelectorAll(".showcase__media-item"));
  const fills = Array.from(slide.querySelectorAll(".showcase__bar-fill"));
  if (items.length === 0) return;

  let activeIndex = 0;
  let timer = null;

  function activate(index) {
    activeIndex = index;
    items.forEach((img, i) => img.toggleAttribute("data-active", i === index));
    fills.forEach((fill, i) => {
      fill.style.transition = "none";
      if (i < index) {
        fill.style.width = "100%";
      } else if (i === index) {
        fill.style.width = "0%";
        fill.offsetWidth; // force reflow
        fill.style.transition = `width ${SHOWCASE_DURATION}ms linear`;
        fill.style.width = "100%";
      } else {
        fill.style.width = "0%";
      }
    });
    clearTimeout(timer);
    timer = setTimeout(() => activate(index < items.length - 1 ? index + 1 : 0), SHOWCASE_DURATION);
  }

  const mediaEl = slide.querySelector(".showcase__media");
  const onClick = (e) => {
    e.stopPropagation();
    activate(activeIndex < items.length - 1 ? activeIndex + 1 : 0);
  };
  mediaEl.addEventListener("click", onClick);

  activate(0);

  showcaseCleanup = () => {
    clearTimeout(timer);
    mediaEl.removeEventListener("click", onClick);
    items.forEach((img) => img.removeAttribute("data-active"));
    fills.forEach((fill) => {
      fill.style.transition = "none";
      fill.style.width = "0%";
    });
  };
}

/* ─── STATEMENT MEDIA ────────────────────────────────────────────────────── */

const STATEMENT_VIDEO_PLAY_DELAY = 1000;
let statementVideoTimer = null;

function activateStatementMedia(slide) {
  if (!slide || slide.dataset.slideType !== 'statement') return;
  const video = slide.querySelector('.statement__media-video');
  if (video) {
    clearTimeout(statementVideoTimer);
    statementVideoTimer = setTimeout(() => {
      video.play().catch(() => {});
    }, STATEMENT_VIDEO_PLAY_DELAY);
  }
}

function deactivateStatementMedia(slide) {
  if (!slide || slide.dataset.slideType !== 'statement') return;
  clearTimeout(statementVideoTimer);
  const video = slide.querySelector('.statement__media-video');
  if (video) {
    video.pause();
    video.currentTime = 0;
  }
}

document.querySelectorAll('.statement__media-video').forEach(video => {
  video.addEventListener('click', () => {
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  });
  video.addEventListener('ended', () => {
    video.currentTime = 0;
    video.play().catch(() => {});
  });
});

/* ─── TABS ────────────────────────────────────────────────────────────────── */

document.querySelectorAll("[data-tabs]").forEach((group) => {
  const triggers = group.querySelectorAll("[data-tab-trigger]");
  const panels = group.querySelectorAll("[data-tab-panel]");

  triggers.forEach((trigger, i) => {
    trigger.addEventListener("click", () => {
      triggers.forEach((t) => t.removeAttribute("data-active"));
      panels.forEach((p) => p.removeAttribute("data-active"));
      trigger.setAttribute("data-active", "");
      panels[i]?.setAttribute("data-active", "");
    });
  });

  triggers[0]?.setAttribute('data-active', '');
  panels[0]?.setAttribute('data-active', '');
});

/* ─── IFRAME FOCUS GUARD ─────────────────────────────────────────────────── */

// When an embedded iframe receives a click it takes keyboard focus, sending
// arrow keys to the prototype instead of the deck. Return focus to the window
// immediately so keyboard navigation always stays with the deck.
window.addEventListener('blur', () => {
  setTimeout(() => {
    if (document.activeElement?.tagName === 'IFRAME') window.focus();
  }, 0);
});

/* ─── NAV AUTO-HIDE ──────────────────────────────────────────────────────── */

const nav = document.querySelector(".deck-nav");
let hideTimer;

function showNav() {
  nav?.removeAttribute("data-hidden");
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (!nav?.matches(":hover")) nav?.setAttribute("data-hidden", "");
  }, 3000);
}

nav?.setAttribute("data-hidden", "");
nav?.addEventListener("mouseenter", () => clearTimeout(hideTimer));
nav?.addEventListener("mouseleave", showNav);

/* ─── COVER SQUARES ──────────────────────────────────────────────────────── */

function alignCoverSquares(cover) {
  if (!cover) return;
  const leftWrapper  = cover.querySelector(".half--left  .logo__wrapper");
  const rightWrapper = cover.querySelector(".half--right .logo__wrapper");
  if (!leftWrapper || !rightWrapper) return;

  [leftWrapper, rightWrapper].forEach(w => {
    w.style.width = w.style.height = w.style.paddingBottom = w.style.marginTop = "";
  });

  const size = Math.min(leftWrapper.offsetWidth, rightWrapper.offsetWidth);
  [leftWrapper, rightWrapper].forEach(w => {
    w.style.width         = size + "px";
    w.style.height        = size + "px";
    w.style.paddingBottom = "0";
  });

  const leftTop  = leftWrapper.getBoundingClientRect().top;
  const rightTop = rightWrapper.getBoundingClientRect().top;
  if (rightTop < leftTop) {
    rightWrapper.style.marginTop = (leftTop - rightTop) + "px";
  }
}

function alignAllCoverSquares() {
  slides.filter(s => s.dataset.slideType === "cover" || s.dataset.slideType === "end").forEach(alignCoverSquares);
}

window.addEventListener("resize", alignAllCoverSquares);

/* ─── INIT ────────────────────────────────────────────────────────────────── */

// Pre-load all embed iframes in the background so they are ready when reached.
document.querySelectorAll('.statement__media-iframe[data-src]').forEach(iframe => {
  iframe.src = iframe.dataset.src;
});

slides[current]?.setAttribute("data-active", "");
if (counterCurrent) counterCurrent.textContent = current + 1;
animateStagger(slides[current]);
if (slides[current]?.dataset.slideType === "showcase") initShowcase(slides[current]);
activateStatementMedia(slides[current]);
alignAllCoverSquares();

if (typeof lucide !== "undefined") lucide.createIcons();

buildThumbnails();
syncThumbnails();
