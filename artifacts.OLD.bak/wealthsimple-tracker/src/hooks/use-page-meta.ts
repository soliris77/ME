import { useEffect } from "react";

/**
 * Sets document.title and the meta description tag for the current page.
 * This is a client-side SPA (no SSR), so search engines need to actually
 * render the JS to see these — Googlebot does this, but it's still weaker
 * than server-rendered meta tags. Good enough to make each glossary/pattern
 * page distinct and indexable rather than everything sharing one generic title.
 */
export function usePageMeta(title: string, description: string) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;

    let meta = document.querySelector('meta[name="description"]');
    const previousDescription = meta?.getAttribute("content") ?? "";
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", description);

    return () => {
      document.title = previousTitle;
      meta?.setAttribute("content", previousDescription);
    };
  }, [title, description]);
}
