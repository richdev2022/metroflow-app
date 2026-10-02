import { useEffect } from "react";

interface SeoOptions {
  title: string;
  description: string;
  /** Canonical path (e.g. "/about") — combined with the app origin. */
  path?: string;
  /** Set false for private/authenticated pages (noindex). */
  index?: boolean;
}

const SITE_NAME = "Metricorex";

function upsertMeta(selector: string, attrs: Record<string, string>) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    document.head.appendChild(el);
  }
  Object.entries(attrs).forEach(([k, v]) => el!.setAttribute(k, v));
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/**
 * Lightweight per-page SEO (no helmet dependency): sets the document title,
 * meta description, robots, canonical URL and Open Graph/Twitter tags.
 *
 * The app now covers BOTH Personal and Business — page copy should reflect
 * whichever surface the page represents (see index.html for the default).
 */
export function useSEO({ title, description, path, index = true }: SeoOptions) {
  useEffect(() => {
    const fullTitle = title.includes(SITE_NAME) ? title : `${title} · ${SITE_NAME}`;
    document.title = fullTitle;

    upsertMeta('meta[name="description"]', { name: "description", content: description });
    upsertMeta('meta[name="robots"]', {
      name: "robots",
      content: index ? "index, follow" : "noindex, nofollow",
    });

    const url = `${window.location.origin}${path || window.location.pathname}`;
    upsertLink("canonical", url);

    upsertMeta('meta[property="og:title"]', { property: "og:title", content: fullTitle });
    upsertMeta('meta[property="og:description"]', { property: "og:description", content: description });
    upsertMeta('meta[property="og:url"]', { property: "og:url", content: url });

    upsertMeta('meta[name="twitter:title"]', { name: "twitter:title", content: fullTitle });
    upsertMeta('meta[name="twitter:description"]', { name: "twitter:description", content: description });
  }, [title, description, path, index]);
}

export default useSEO;
