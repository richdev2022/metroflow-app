import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

/**
 * Premium sidebar toggle — animated hamburger that morphs into an X.
 *
 * - Mobile: reacts to the drawer (`openMobile`).
 * - Desktop: reacts to the collapsible sidebar (`state`).
 *
 * Styling: soft card surface, gradient bars, press-scale and focus ring so it
 * feels like a first-class control rather than a bare icon.
 */
export function SidebarToggleButton({ className }: { className?: string }) {
  const { state, isMobile, openMobile, toggleSidebar } = useSidebar();
  const expanded = isMobile ? openMobile : state === "expanded";

  return (
    <button
      type="button"
      onClick={toggleSidebar}
      aria-label={expanded ? "Close sidebar" : "Open sidebar"}
      aria-expanded={expanded}
      title={expanded ? "Close sidebar" : "Open sidebar"}
      className={cn(
        "group relative inline-flex h-10 w-10 items-center justify-center rounded-xl",
        "border border-border/70 bg-card shadow-sm backdrop-blur transition-all duration-200",
        "hover:border-primary/40 hover:bg-accent hover:shadow-md",
        "active:scale-90",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        className,
      )}
    >
      {/* soft brand glow behind the bars */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br from-primary/10 via-transparent to-primary/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      />
      <span
        aria-hidden="true"
        className="relative flex h-4 w-[18px] flex-col justify-between"
      >
        <span
          className={cn(
            "h-[2px] w-full rounded-full bg-gradient-to-r from-primary to-primary/60 transition-all duration-300 ease-in-out",
            expanded && "translate-y-[7px] rotate-45",
          )}
        />
        <span
          className={cn(
            "h-[2px] w-full rounded-full bg-gradient-to-r from-primary to-primary/60 transition-all duration-200 ease-in-out",
            expanded && "scale-x-0 opacity-0",
          )}
        />
        <span
          className={cn(
            "h-[2px] w-full rounded-full bg-gradient-to-r from-primary to-primary/60 transition-all duration-300 ease-in-out",
            expanded && "-translate-y-[7px] -rotate-45",
          )}
        />
      </span>
    </button>
  );
}

export default SidebarToggleButton;
