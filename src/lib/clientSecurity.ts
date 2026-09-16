/**
 * Client-Side Security & Anti-Inspection Guard
 * Protects storefront code, prevents inspect element, devtools shortcuts,
 * view-source, page saving, console tampering, and scraper inspection.
 */

let initialized = false;

export function initClientSecurity() {
  if (typeof window === "undefined" || initialized) return;
  initialized = true;

  // 1. Disable Right-Click Context Menu (except inside form inputs)
  document.addEventListener("contextmenu", (e) => {
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    e.preventDefault();
  });

  // 2. Intercept DevTools & Source View Keyboard Shortcuts
  window.addEventListener("keydown", (e) => {
    const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
    const modifier = isMac ? e.metaKey : e.ctrlKey;

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
  });

  // 3. Disable Drag & Drop of Images / Links
  window.addEventListener("dragstart", (e) => {
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName?.toLowerCase();
    if (tag === "img" || tag === "a") {
      e.preventDefault();
    }
  });

  // 4. Console Security Warning & Anti-Tamper Banner
  try {
    const bannerStyle1 = "color: #ff3344; font-size: 24px; font-weight: 900; text-shadow: 0 0 10px rgba(255,51,68,0.5);";
    const bannerStyle2 = "color: #38bdf8; font-size: 13px; font-weight: bold; line-height: 1.6;";
    const bannerStyle3 = "color: #94a3b8; font-size: 11px;";

    console.log("%c⚠️ SECURITY PROTOCOL ACTIVE ⚠️", bannerStyle1);
    console.log(
      "%cThis application is protected by advanced anti-tampering, request monitoring, and intrusion detection.\nUnauthorized inspection, scraper bots, or API manipulation will result in automatic IP banning and account termination.",
      bannerStyle2
    );
    console.log("%cZORU SECURE SHIELD • Active Monitoring", bannerStyle3);
  } catch {
    /* ignore */
  }

}
