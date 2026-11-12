export interface ShellOptions {
  current: string;
}

const NAV = [
  { href: "/how-it-works/", label: "How it works" },
  { href: "/features/", label: "Features" },
  { href: "/privacy/", label: "Privacy" },
  { href: "/extension/", label: "Extension" },
  { href: "/pricing/", label: "Pricing" },
  { href: "/faq/", label: "FAQ" },
  { href: "/about/", label: "About" },
];

function normalizePath(path: string): string {
  if (!path || path === "/") return "/";
  return path.endsWith("/") ? path : `${path}/`;
}

function isActive(href: string, current: string): boolean {
  return normalizePath(href) === normalizePath(current);
}

export function mountShell(doc: Document, options: ShellOptions): void {
  const current = normalizePath(options.current || doc.location.pathname);
  const header = doc.querySelector("[data-site-header]");
  const footer = doc.querySelector("[data-site-footer]");

  if (header) {
    header.innerHTML = `
      <a class="skip-link" href="#content">Skip to content</a>
      <div class="site-bar">
        <a class="wordmark" href="/" aria-label="Did I Order This, home">
          <span class="wordmark-mark" aria-hidden="true"></span>
          <span class="wordmark-text">Did I Order This?</span>
        </a>
        <button type="button" class="menu-toggle" data-menu-toggle aria-expanded="false" aria-controls="site-nav">
          Menu
        </button>
        <nav id="site-nav" class="site-nav" data-site-nav aria-label="Primary">
          ${NAV.map((item) => {
            const active = isActive(item.href, current);
            const extra = item.href === "/how-it-works/" || item.href === "/privacy/" ? "" : " nav-extra";
            return `<a class="${extra.trim()}" href="${item.href}"${active ? ' aria-current="page"' : ""}>${item.label}</a>`;
          }).join("")}
          <a class="nav-action" href="/app/">Open the sample inbox</a>
        </nav>
      </div>
    `;

    const toggle = header.querySelector<HTMLButtonElement>("[data-menu-toggle]");
    const nav = header.querySelector<HTMLElement>("[data-site-nav]");
    toggle?.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", open ? "false" : "true");
      nav?.classList.toggle("is-open", !open);
    });
  }

  if (footer) {
    footer.innerHTML = `
      <div class="footer-inner">
        <div class="footer-brand">
          <p class="footer-name">Did I Order This?</p>
          <p class="footer-tag">A delivery-scam guard that checks an email against the parcels stored on this device.</p>
        </div>
        <div class="footer-cols">
          <div>
            <p class="footer-heading">Product</p>
            <a href="/app/">Sample inbox</a>
            <a href="/how-it-works/">How it works</a>
            <a href="/features/">Features</a>
            <a href="/extension/">Chrome extension</a>
          </div>
          <div>
            <p class="footer-heading">Trust</p>
            <a href="/privacy/">Privacy and security</a>
            <a href="/pricing/">Pricing</a>
            <a href="/faq/">FAQ</a>
            <a href="/about/">About</a>
          </div>
        </div>
      </div>
      <p class="footer-meta">Apache License 2.0. Built for the #BuildHybridAI 2026 event. Inference runs through Firebase AI Logic.</p>
    `;
  }
}
