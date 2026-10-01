import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Compass, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * AppTour — a first-run guided tour for the Metricorex dashboard.
 *
 * - Spotlight overlay: the target element is highlighted while the rest of
 *   the page dims; a tooltip card explains the feature.
 * - Back / Next / Skip navigation with a progress bar; the last step finishes.
 * - Steps without a visible target (e.g. collapsed sidebar on mobile) render
 *   as a centred card, so the tour works on every breakpoint.
 * - Mobile-safe: the card never exceeds the viewport (max-height with a
 *   scrollable body), position is clamped to 12px margins on every side, the
 *   18 progress dots collapse into a compact progress bar, tap-to-advance on
 *   the dimmer is disabled on touch (prevents accidental skips), and the
 *   Back/Next buttons grow to 36px touch targets on small screens.
 * - Auto-starts once per browser (localStorage), and can be restarted from
 *   the sidebar ("Take the tour") via the `metricorex:restart-tour` event.
 */

const STORAGE_KEY = "metricorex:tour:seen:v1";
const RESTART_EVENT = "metricorex:restart-tour";

interface TourStep {
  /** CSS selector for the spotlight target; omit for a centred card. */
  selector?: string;
  icon?: React.ReactNode;
  title: string;
  body: string;
}

const STEPS: TourStep[] = [
  {
    icon: <Compass className="h-6 w-6 text-violet-500" />,
    title: "Welcome to Metricorex 👋",
    body:
      "This quick tour walks you through every feature — chat, calls, meetings, payroll, wallet and more. It takes about a minute, and you can skip it any time.",
  },
  {
    selector: '[data-tour="nav-dashboard"]',
    title: "Dashboard",
    body: "Your mission control — live stats, recent activity and everything happening across your business at a glance.",
  },
  {
    selector: '[data-tour="nav-tasks"]',
    title: "Tasks",
    body: "Create tasks, assign teammates, set priorities and track work from to-do to done. Attach files up to 100 MB.",
  },
  {
    selector: '[data-tour="nav-board"]',
    title: "Board",
    body: "A Kanban view of your work — drag cards between columns as progress happens. Great for sprints and pipelines.",
  },
  {
    selector: '[data-tour="nav-backlog"]',
    title: "Backlog",
    body: "Park future work here. Groom it into the Board whenever your team is ready to pick it up.",
  },
  {
    selector: '[data-tour="nav-ideas"]',
    title: "Ideas",
    body: "Collect ideas from the whole team and vote on the best ones — the loudest voice isn't needed, just the best ideas.",
  },
  {
    selector: '[data-tour="nav-meetings"]',
    title: "Meetings",
    body: "Start an instant meeting or schedule recurring ones with guests. Join by link or code, with AI notes and recordings.",
  },
  {
    selector: '[data-tour="nav-calendar"]',
    title: "Calendar",
    body: "See every meeting on a month grid, colour-coded and ready to join — never miss a standup again.",
  },
  {
    selector: '[data-tour="nav-chat"]',
    title: "Chat",
    body: "WhatsApp-style messaging for your team: styled text, voice notes, images, videos up to 100 MB, forwarding, GIFs and MetricAi smart replies.",
  },
  {
    selector: '[data-tour="nav-metric-ai"]',
    title: "MetricAi",
    body: "Your built-in AI assistant — ask questions, analyse images and videos, generate documents and get insights from your data.",
  },
  {
    selector: '[data-tour="nav-calls"]',
    title: "Calls",
    body: "Audio & video calls with live captions, real-time translation and the MetricAi Call Copilot that summaries key points while you talk.",
  },
  {
    selector: '[data-tour="nav-recordings"]',
    title: "Recordings",
    body: "Every call recording and meeting report lives here — download, share or attach them to tasks.",
  },
  {
    selector: '[data-tour="nav-team"]',
    title: "Team",
    body: "Invite teammates, manage roles and permissions, and see who's doing what across your workspace.",
  },
  {
    selector: '[data-tour="nav-wallet"]',
    title: "Wallet",
    body: "Fund your business wallet, manage virtual accounts and keep an eye on your balance in real time.",
  },
  {
    selector: '[data-tour="nav-payroll"]',
    title: "Payroll",
    body: "Pay salaries in NGN or USD — bulk payouts, employee management and payroll runs with verification built in.",
  },
  {
    selector: '[data-tour="nav-transfer-history"]',
    title: "Transfer History",
    body: "A full ledger of every transfer in and out — searchable, filterable and exportable.",
  },
  {
    selector: '[data-tour="nav-profile"]',
    title: "Profile & Settings",
    body: "Update your picture, secure your account with 2FA, and manage notifications. You can also re-run this tour from Settings.",
  },
  {
    icon: <Check className="h-6 w-6 text-emerald-500" />,
    title: "You're all set! 🎉",
    body:
      "That's the tour! Hover over anything that looks unfamiliar — many parts of Metricorex have tooltips with extra detail. Need this tour again? It's waiting in the sidebar under “Take the tour”.",
  },
];

function isSeen(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* private mode — ignore */
  }
}

export default function AppTour() {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [targetMissing, setTargetMissing] = useState(false);
  const rafRef = useRef<number>(0);
  const cardRef = useRef<HTMLDivElement | null>(null);
  // The card's height is measured from the DOM (text wraps at narrow widths);
  // its width is deterministic: min(340px, 100vw - 24px).
  const [cardH, setCardH] = useState(240);
  // Touch devices: tapping the dimmer advances the tour, which is far too easy
  // to hit accidentally on a phone — tap-to-advance stays desktop-only.
  const [coarsePointer] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)")?.matches === true,
  );

  const step = STEPS[stepIndex];
  const last = stepIndex === STEPS.length - 1;

  const start = useCallback(() => {
    setStepIndex(0);
    setActive(true);
  }, []);

  // Auto-start once per browser
  useEffect(() => {
    if (isSeen()) return;
    const t = window.setTimeout(() => {
      if (!isSeen()) start();
    }, 1200);
    return () => window.clearTimeout(t);
  }, [start]);

  // Restart via sidebar event
  useEffect(() => {
    const handler = () => start();
    window.addEventListener(RESTART_EVENT, handler);
    return () => window.removeEventListener(RESTART_EVENT, handler);
  }, [start]);

  const measure = useCallback(() => {
    if (!active) return;
    // Track the rendered card height so the placement math below matches the
    // real card (it grows taller as text wraps on narrow screens).
    const cardEl = cardRef.current;
    if (cardEl) {
      const h = cardEl.getBoundingClientRect().height;
      setCardH((prev) => (Math.abs(prev - h) > 1 ? h : prev));
    }
    const current = STEPS[stepIndex];
    if (!current.selector) {
      setRect(null);
      setTargetMissing(true);
      return;
    }
    const el = document.querySelector(current.selector) as HTMLElement | null;
    if (!el) {
      setRect(null);
      setTargetMissing(true);
      return;
    }
    const style = window.getComputedStyle(el);
    const visible = style.display !== "none" && style.visibility !== "hidden" && el.getClientRects().length > 0;
    if (!visible) {
      setRect(null);
      setTargetMissing(true);
      return;
    }
    const target = el.getBoundingClientRect();
    if (target.width < 8 || target.height < 8) {
      setRect(null);
      setTargetMissing(true);
      return;
    }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    setRect(el.getBoundingClientRect());
    setTargetMissing(false);
  }, [active, stepIndex]);

  // Measure on step change + keep in sync with resizes (rect uses viewport
  // coords and the overlay is fixed, so scroll doesn't need re-measuring —
  // but smooth scrolling animates, so re-measure over the next few frames).
  useEffect(() => {
    if (!active) return;
    measure();
    let frames = 0;
    const tick = () => {
      frames += 1;
      measure();
      // 60 frames (~1s) so the loop outlives smooth scrollIntoView on phones.
      if (frames < 60) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
    };
  }, [active, stepIndex, measure]);

  // Lock scroll while the tour is active
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);

  const finish = useCallback(() => {
    markSeen();
    setActive(false);
  }, []);

  const next = () => (last ? finish() : setStepIndex((i) => Math.min(STEPS.length - 1, i + 1)));
  const back = () => setStepIndex((i) => Math.max(0, i - 1));

  if (!active) return null;

  const centered = targetMissing || !rect;

  // Tooltip position. The card's width is deterministic — min(340, vw - 24) —
  // so the clamp math matches what is actually rendered; its height is the
  // DOM-measured cardH. top/left are always clamped into the viewport with
  // 12px margins, so the card can never be pushed off-screen, even when the
  // spotlight target is partly outside the viewport (e.g. a drawer that is
  // animating). Centering uses flex (not transform) so framer-motion's own
  // transform animations can't displace the card.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cardW = Math.min(340, vw - 24);
  const cardHUsed = Math.min(cardH, vh - 24);
  let cardStyle: React.CSSProperties = { position: "relative" };
  if (!centered && rect) {
    const r = rect;
    const spaceBelow = vh - r.bottom;
    const placeBelow = spaceBelow > cardHUsed + 24 || spaceBelow >= r.top;
    const top = placeBelow ? r.bottom + 14 : r.top - cardHUsed - 14;
    cardStyle = {
      position: "absolute",
      top: Math.min(Math.max(12, top), Math.max(12, vh - cardHUsed - 12)),
      left: Math.min(Math.max(12, r.left + r.width / 2 - cardW / 2), Math.max(12, vw - cardW - 12)),
    };
  }

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200]"
        role="dialog"
        aria-modal="true"
        aria-label="Product tour"
      >
        {/* Dimmer with spotlight cut-out */}
        {!centered && rect && (
          <div
            className="absolute rounded-2xl ring-4 ring-violet-500/70"
            style={{
              top: rect.top - 6,
              left: rect.left - 6,
              width: rect.width + 12,
              height: rect.height + 12,
              boxShadow: "0 0 0 9999px rgba(8, 10, 24, 0.72)",
              transition: "all 350ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          />
        )}
        {centered && <div className="absolute inset-0 bg-[#080a18]/75" />}

        {/* Click anywhere on the dimmer advances (desktop only — on touch
            devices accidental taps skip steps, so use the buttons) */}
        {!coarsePointer && <div className="absolute inset-0" onClick={next} />}

        {/* Card — a pointer-events-none wrapper handles flex centering in
            "no target" mode (transform-free, so framer-motion's entrance
            animation can't displace it); anchored mode positions the card
            absolutely inside the same viewport-sized wrapper. */}
        <div
          className={`pointer-events-none absolute inset-0 ${
            centered ? "flex items-center justify-center p-3" : ""
          }`}
        >
          <motion.div
            ref={cardRef}
            key={stepIndex}
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="pointer-events-auto flex w-[340px] max-w-[calc(100vw-24px)] flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-[#101631]"
            style={{ maxHeight: "calc(100dvh - 24px)", ...cardStyle }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={finish}
              aria-label="Skip tour"
              className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Scrollable body — keeps the actions reachable on short screens */}
            <div className="min-h-0 overflow-y-auto overscroll-contain">
              <div className="flex items-start gap-3">
                {step.icon && <div className="mt-0.5 shrink-0">{step.icon}</div>}
                <div className="min-w-0 pr-4">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                    {step.body}
                  </p>
                </div>
              </div>
            </div>

            {/* Compact progress bar + actions — fits 320px-wide screens */}
            <div className="mt-4 flex shrink-0 items-center gap-2.5">
              <div
                className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-white/15"
                role="progressbar"
                aria-valuenow={stepIndex + 1}
                aria-valuemin={1}
                aria-valuemax={STEPS.length}
                aria-label="Tour progress"
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-[width] duration-300"
                  style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
                />
              </div>
              <span className="shrink-0 text-[11px] font-semibold tabular-nums text-slate-400">
                {stepIndex + 1}/{STEPS.length}
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                {stepIndex > 0 && (
                  <Button variant="ghost" size="sm" onClick={back} className="h-9 gap-1 text-slate-500 sm:h-8">
                    <ArrowLeft className="h-3.5 w-3.5" /> Back
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={next}
                  className="h-9 gap-1 border-0 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-md sm:h-8"
                >
                  {last ? "Finish" : "Next"} <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

/** Fire the restart event (used by the sidebar "Take the tour" button). */
export function restartAppTour() {
  window.dispatchEvent(new Event(RESTART_EVENT));
}

/** True when the user has completed/skipped the tour in this browser. */
export function hasSeenAppTour() {
  return isSeen();
}
