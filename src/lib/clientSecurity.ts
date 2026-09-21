/**
 * Client-Side Security & Anti-Inspection Guard
 * Protects storefront code, prevents inspect element, devtools shortcuts,
 * view-source, page saving, printing, console tampering, and scraper inspection.
 */

let initialized = false;

export function initClientSecurity() {
  if (typeof window === "undefined" || initialized) return;
  initialized = true;

  // 1. Silence & sanitize console in production to prevent API/source/state leakage
  try {
    const bannerStyle1 = "color: #ff3344; font-size: 22px; font-weight: 900; text-shadow: 0 0 10px rgba(255,51,68,0.5);";
    const bannerStyle2 = "color: #38bdf8; font-size: 13px; font-weight: bold; line-height: 1.6;";
    const bannerStyle3 = "color: #94a3b8; font-size: 11px;";

    const origLog = console.log;
    origLog("%c⚠️ SECURITY PROTOCOL ACTIVE ⚠️", bannerStyle1);
    origLog(
      "%cThis application is protected by advanced anti-tampering, request monitoring, and intrusion detection.\nAutomated scraping, source inspection, and API reverse-engineering are strictly prohibited.",
      bannerStyle2
    );
    origLog("%cZORU SECURE SHIELD • Active Protection", bannerStyle3);

    // Suppress verbose debug logs that could leak endpoints or internal data
    const noop = () => {};
    window.console.debug = noop;
    window.console.dir = noop;
    window.console.table = noop;
  } catch {
    /* ignore */
  }

  // 2. Disable Right-Click Context Menu (except inside form inputs)
  document.addEventListener("contextmenu", (e) => {
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    e.preventDefault();
    e.stopPropagation();
    return false;
  }, true);

  // 3. Intercept DevTools, Print & Source View Keyboard Shortcuts
  window.addEventListener("keydown", (e) => {
    const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
    const modifier = isMac ? e.metaKey : e.ctrlKey;
    const target = e.target as HTMLElement | null;
    const isInput = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";

    // F12 -> DevTools
    if (e.key === "F12" || e.keyCode === 123) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    // Ctrl+Shift+I or Cmd+Opt+I -> Inspect Element
    if (modifier && e.shiftKey && (e.key === "I" || e.key === "i" || e.keyCode === 73)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    // Ctrl+Shift+J or Cmd+Opt+J -> Console
    if (modifier && e.shiftKey && (e.key === "J" || e.key === "j" || e.keyCode === 74)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    // Ctrl+Shift+C or Cmd+Opt+C -> Element Selector
    if (modifier && e.shiftKey && (e.key === "C" || e.key === "c" || e.keyCode === 67)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    // Ctrl+U or Cmd+U -> View Source
    if (modifier && (e.key === "U" || e.key === "u" || e.keyCode === 85)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    // Ctrl+S or Cmd+S -> Save Page
    if (modifier && (e.key === "S" || e.key === "s" || e.keyCode === 83)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    // Ctrl+P or Cmd+P -> Print Page (Scraping prevention)
    if (modifier && (e.key === "P" || e.key === "p" || e.keyCode === 80)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    // Ctrl+A / Cmd+A outside form fields (prevents bulk text scrape)
    if (!isInput && modifier && (e.key === "A" || e.key === "a" || e.keyCode === 65)) {
      const isAllowed = target?.closest?.(".allow-select, .select-text");
      if (!isAllowed) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    }
  }, true);

  // 4. Disable Drag & Drop of Images / Links
  window.addEventListener("dragstart", (e) => {
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName?.toLowerCase();
    if (tag === "img" || tag === "a") {
      e.preventDefault();
    }
  }, true);

  // 5. Enforce noopener noreferrer on all external links to prevent referrer/redirect leakage
  document.addEventListener("click", (e) => {
    const link = (e.target as HTMLElement | null)?.closest("a");
    if (!link) return;
    const href = link.getAttribute("href");
    if (href && (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("//"))) {
      try {
        const url = new URL(href, window.location.href);
        if (url.origin !== window.location.origin) {
          link.setAttribute("rel", "noopener noreferrer");
          link.setAttribute("referrerpolicy", "no-referrer");
        }
      } catch {
        /* ignore invalid URL */
      }
    }
  }, true);
}
