import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useSEO } from "@/lib/use-seo";

interface StaticPageProps {
  title: string;
  description: string;
  children: ReactNode;
}

/**
 * Shared shell for public static pages (About, Terms, Privacy, ...).
 * Deliberately rendered OUTSIDE the authenticated app shell so crawlers and
 * logged-out users can read it.
 */
export default function StaticPage({ title, description, children }: StaticPageProps) {
  useSEO({ title, description, index: true });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <Link to="/login" className="flex items-center gap-2">
            <span className="text-lg font-bold tracking-tight text-foreground">Metricorex</span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link to="/about" className="text-muted-foreground transition-colors hover:text-foreground">
              About
            </Link>
            <Link to="/terms" className="text-muted-foreground transition-colors hover:text-foreground">
              Terms
            </Link>
            <Link to="/privacy" className="text-muted-foreground transition-colors hover:text-foreground">
              Privacy
            </Link>
            <Link
              to="/login"
              className="rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10 sm:py-14">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{title}</h1>
        <p className="mt-3 max-w-2xl text-base text-muted-foreground">{description}</p>
        <div className="prose-neutral mt-10 space-y-8 text-[15px] leading-relaxed text-foreground/90">{children}</div>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-4xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} MetriCorex Limited · RC 9619599</span>
          <span>
            Personal &amp; Business — one app.{" "}
            <Link to="/register" className="text-primary hover:underline">
              Create an account
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <div className="mt-3 space-y-3 text-muted-foreground">{children}</div>
    </section>
  );
}
