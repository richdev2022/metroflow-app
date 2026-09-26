import { motion, type Variants } from "framer-motion";
import type { ReactNode } from "react";
import { ArrowLeft, BadgeCheck, CalendarClock, TrendingUp } from "lucide-react";
import { BrandLogo, BrandMark } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 22 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.21, 0.47, 0.32, 0.98] },
  },
};

/** Floating glass dashboard card — pure decoration for the showcase panel. */
function FloatCard({
  className,
  delay = 0,
  children,
}: {
  className: string;
  delay?: number;
  children: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.7, delay: 0.5 + delay, ease: "easeOut" }}
      className={`absolute ${className}`}
    >
      <motion.div
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 5.5 + delay * 2, repeat: Infinity, ease: "easeInOut", delay }}
        className="rounded-2xl border border-white/15 bg-white/[0.07] p-4 shadow-2xl shadow-black/40 backdrop-blur-xl"
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

/** Aurora blob — slow drifting gradient orb. */
function Aurora({
  className,
  duration,
  shift,
}: {
  className: string;
  duration: number;
  shift: { x: number; y: number };
}) {
  return (
    <motion.div
      aria-hidden="true"
      className={`pointer-events-none absolute rounded-full blur-[90px] ${className}`}
      animate={{
        x: [0, shift.x, 0],
        y: [0, shift.y, 0],
        scale: [1, 1.15, 1],
      }}
      transition={{ duration, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

function ShowcasePanel() {
  return (
    <div className="relative hidden overflow-hidden bg-[#0A0E1A] lg:flex lg:flex-col">
      {/* Aurora glows */}
      <Aurora
        className="left-[-8rem] top-[-6rem] h-[26rem] w-[26rem] bg-blue-600/30"
        duration={16}
        shift={{ x: 60, y: 40 }}
      />
      <Aurora
        className="bottom-[-8rem] right-[-6rem] h-[30rem] w-[30rem] bg-violet-600/25"
        duration={19}
        shift={{ x: -70, y: -50 }}
      />
      <Aurora
        className="left-[35%] top-[45%] h-[22rem] w-[22rem] bg-cyan-500/15"
        duration={22}
        shift={{ x: 40, y: -60 }}
      />

      {/* Grid overlay */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse 90% 80% at 50% 40%, black 30%, transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 90% 80% at 50% 40%, black 30%, transparent 75%)",
        }}
      />

      {/* Brand */}
      <div className="relative z-10 p-8">
        <BrandLogo
          size={38}
          wordmarkClassName="text-lg font-bold tracking-tight text-white"
        />
      </div>

      {/* Floating dashboard cards */}
      <div className="relative z-10 mx-auto flex w-full max-w-lg flex-1 items-center justify-center px-8">
        <FloatCard className="left-6 top-16 w-56" delay={0.1}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-300">Monthly revenue</p>
            <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
          </div>
          <p className="mt-1 text-2xl font-bold text-white">₦2.42M</p>
          <div className="mt-3 flex h-10 items-end gap-1.5">
            {[38, 55, 42, 70, 58, 90].map((h, i) => (
              <motion.div
                key={i}
                initial={{ height: 0 }}
                animate={{ height: `${h}%` }}
                transition={{ duration: 0.8, delay: 1 + i * 0.12, ease: "easeOut" }}
                className={`flex-1 rounded-sm ${
                  i === 5
                    ? "bg-gradient-to-t from-blue-600 to-violet-400"
                    : "bg-white/20"
                }`}
              />
            ))}
          </div>
        </FloatCard>

        <FloatCard className="right-4 top-40 w-52" delay={0.45}>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/20">
              <BadgeCheck className="h-5 w-5 text-emerald-400" />
            </span>
            <div>
              <p className="text-sm font-semibold text-white">Payroll run</p>
              <p className="text-xs text-slate-400">24 employees · NGN</p>
            </div>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <motion.div
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: 1.4, delay: 1.6, ease: "easeOut" }}
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
            />
          </div>
        </FloatCard>

        <FloatCard className="bottom-24 left-16 w-60" delay={0.8}>
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              {["from-blue-500 to-cyan-400", "from-violet-500 to-fuchsia-400", "from-amber-500 to-orange-400"].map(
                (g, i) => (
                  <span
                    key={i}
                    className={`flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#141B2E] bg-gradient-to-br text-[11px] font-bold text-white ${g}`}
                  >
                    {["AD", "KO", "+6"][i]}
                  </span>
                ),
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Design standup</p>
              <p className="flex items-center gap-1.5 text-xs text-slate-400">
                <CalendarClock className="h-3 w-3" /> 9:30 AM · Room 2
              </p>
            </div>
          </div>
        </FloatCard>
      </div>

      {/* Headline */}
      <div className="relative z-10 px-10 pb-12">
        <motion.h2
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.35, ease: "easeOut" }}
          className="max-w-md text-3xl font-bold leading-tight tracking-tight text-white"
        >
          Run your entire business{" "}
          <span className="bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">
            in one place.
          </span>
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.5, ease: "easeOut" }}
          className="mt-3 max-w-md text-sm leading-relaxed text-slate-400"
        >
          Projects, meetings, payroll and business banking — unified on a single
          platform built for modern teams.
        </motion.p>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.7 }}
          className="mt-6 flex flex-wrap items-center gap-2"
        >
          {["2FA security", "NDPR compliant", "99.9% uptime"].map((chip) => (
            <span
              key={chip}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300 backdrop-blur"
            >
              {chip}
            </span>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

/**
 * Shared animated layout for the auth pages (login, register, forgot/reset
 * password). Dark/light aware — the showcase panel stays premium-dark in both
 * themes while the form panel follows the active theme tokens.
 */
export default function AuthShell({
  title,
  subtitle,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-2">
      <ShowcasePanel />

      {/* Form panel */}
      <div className="relative flex min-h-screen flex-col overflow-hidden">
        {/* Soft ambient glows on the form side */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 right-[-8rem] h-80 w-80 rounded-full bg-blue-500/10 blur-[100px] dark:bg-blue-600/15"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-[-6rem] left-[-6rem] h-72 w-72 rounded-full bg-violet-500/10 blur-[100px] dark:bg-violet-600/15"
        />

        {/* Top bar */}
        <div className="relative z-10 flex items-center justify-between px-5 pt-5 sm:px-8">
          <a
            href={import.meta.env.VITE_SITE_URL || "#"}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back to site</span>
          </a>
          <ThemeToggle />
        </div>

        {/* Mobile brand */}
        <div className="relative z-10 mt-6 flex justify-center lg:hidden">
          <BrandLogo size={38} />
        </div>

        {/* Form content */}
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="relative z-10 flex flex-1 items-center justify-center px-5 py-8 sm:px-8"
        >
          <div className={`w-full ${wide ? "max-w-[480px]" : "max-w-[420px]"}`}>
            <motion.div variants={item} className="mb-8 hidden justify-center lg:flex">
              <BrandMark size={52} className="drop-shadow-lg shadow-blue-600/30" />
            </motion.div>
            <motion.h1
              variants={item}
              className="text-center text-2xl font-bold tracking-tight text-foreground sm:text-[1.7rem]"
            >
              {title}
            </motion.h1>
            {subtitle && (
              <motion.p
                variants={item}
                className="mt-2 text-center text-sm text-muted-foreground"
              >
                {subtitle}
              </motion.p>
            )}
            <motion.div variants={item} className="mt-8">
              {children}
            </motion.div>
          </div>
        </motion.div>

        {/* Legal footer */}
        <div className="relative z-10 pb-6 text-center text-xs text-muted-foreground/70">
          © {new Date().getFullYear()} MetriCorex Limited · RC 9619594 ·{" "}
          <a href={import.meta.env.VITE_SITE_URL || "#"} className="hover:text-foreground">
            Home
          </a>
        </div>
      </div>
    </div>
  );
}
