/**
 * Favicon unread badge.
 *
 * setFaviconBadge(count) draws the unread count onto a 64x64 canvas copy of
 * the current favicon (red circle pinned to the top-right corner, white bold
 * count, "99+" cap) and swaps it in as an extra <link rel="icon"> appended to
 * <head>. The original favicon <link> is never modified, so
 * setFaviconBadge(0) restores the original favicon simply by removing the
 * injected link. Self-contained + idempotent: repeat calls with the same
 * count are no-ops, and a count that changes while the image is loading is
 * ignored (the newer render wins).
 */

const BADGE_SIZE = 64;
const BADGE_RADIUS = 18; // ~56% of the canvas, anchored to the top-right corner
const BADGE_CENTER_X = 46;
const BADGE_CENTER_Y = 18;
const BADGE_COLOR = "#dc2626";
const BADGE_TEXT_BASE_PX = 26;
const BADGE_TEXT_FONT = "Arial";
const BADGE_CAP_LABEL = "99+";
const FALLBACK_ICON_HREF = "/favicon.ico";

let originalHref: string | null = null; // first-seen favicon href
let injectedLink: HTMLLinkElement | null = null;
let lastCount: number | null = null;

/** First icon <link> in <head> — rel="icon" in any flavour. */
function findFaviconLink(): HTMLLinkElement | null {
  return document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
}

/** Red circle + white count. `count` is used for stale-render guarding. */
function renderBadge(count: number, sourceHref: string | null): void {
  const canvas = document.createElement("canvas");
  canvas.width = BADGE_SIZE;
  canvas.height = BADGE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const drawBadgeLayer = () => {
    // Filled red circle, top-right.
    ctx.fillStyle = BADGE_COLOR;
    ctx.beginPath();
    ctx.arc(BADGE_CENTER_X, BADGE_CENTER_Y, BADGE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    // White bold count, centred in the circle ("99+" cap — shrink to fit).
    const label = count > 99 ? BADGE_CAP_LABEL : String(count);
    let fontSize = BADGE_TEXT_BASE_PX;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    do {
      ctx.font = `bold ${fontSize}px ${BADGE_TEXT_FONT}`;
      fontSize -= 2;
    } while (ctx.measureText(label).width > BADGE_RADIUS * 2 - 6 && fontSize >= 12);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, BADGE_CENTER_X, BADGE_CENTER_Y + 1);
  };

  /** Draw a plain default icon (used when the original fails to load). */
  const drawPlainDefault = () => {
    ctx.clearRect(0, 0, BADGE_SIZE, BADGE_SIZE);
    ctx.fillStyle = "#4353ff"; // brand colour
    ctx.fillRect(0, 0, BADGE_SIZE, BADGE_SIZE);
  };

  const apply = () => {
    if (count !== lastCount) return; // a newer count took over while loading
    let dataUrl: string;
    try {
      dataUrl = canvas.toDataURL("image/png");
    } catch (e) {
      // Tainted canvas (cross-origin favicon) — retry without the image.
      drawPlainDefault();
      drawBadgeLayer();
      try {
        dataUrl = canvas.toDataURL("image/png");
      } catch (e2) {
        return; // give up — keep the current favicon
      }
    }
    if (!injectedLink || !injectedLink.isConnected) {
      injectedLink = document.createElement("link");
      injectedLink.rel = "icon";
      injectedLink.setAttribute("data-favicon-badge", "1");
      // Appended last so browsers prefer it over the original links.
      document.head.appendChild(injectedLink);
    }
    injectedLink.href = dataUrl;
  };

  if (sourceHref) {
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, BADGE_SIZE, BADGE_SIZE);
      ctx.drawImage(img, 0, 0, BADGE_SIZE, BADGE_SIZE);
      drawBadgeLayer();
      apply();
    };
    img.onerror = () => {
      drawPlainDefault();
      drawBadgeLayer();
      apply();
    };
    img.src = sourceHref;
  } else {
    drawPlainDefault();
    drawBadgeLayer();
    apply();
  }
}

/**
 * Show `count` as a badge on the favicon. count <= 0 restores the original
 * favicon (and removes any injected badge link).
 */
export function setFaviconBadge(count: number): void {
  if (typeof document === "undefined") return;
  const next = Math.max(0, Math.floor(count) || 0);
  if (lastCount === next) return; // unchanged — nothing to redraw
  lastCount = next;

  if (next <= 0) {
    // The original <link> was never touched, so dropping the injected clone
    // restores the original favicon URL.
    if (injectedLink && injectedLink.parentNode) {
      injectedLink.parentNode.removeChild(injectedLink);
    }
    injectedLink = null;
    return;
  }

  if (originalHref === null) {
    originalHref = findFaviconLink()?.getAttribute("href") || FALLBACK_ICON_HREF;
  }
  renderBadge(next, originalHref);
}
