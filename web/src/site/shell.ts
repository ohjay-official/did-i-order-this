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
        <div class="site-bar-actions">
          <button type="button" class="menu-toggle" data-menu-toggle aria-expanded="false" aria-controls="site-menu">
            Menu
          </button>
          <a class="nav-action" href="/app/">Sample inbox</a>
        </div>
      </div>
      <div class="menu-overlay" id="site-menu" data-menu-overlay hidden>
        <div class="menu-sheet">
          <p class="menu-kicker">Did I Order This?</p>
          <nav class="menu-nav" aria-label="Site">
            <a href="/"${current === "/" ? ' aria-current="page"' : ""}>Home</a>
            ${NAV.map((item) => {
              const active = isActive(item.href, current);
              return `<a href="${item.href}"${active ? ' aria-current="page"' : ""}>${item.label}</a>`;
            }).join("")}
          </nav>
          <a class="btn menu-cta" href="/app/">Open the sample inbox</a>
        </div>
      </div>
    `;

    const toggle = header.querySelector<HTMLButtonElement>("[data-menu-toggle]");
    const overlay = header.querySelector<HTMLElement>("[data-menu-overlay]");
    const bar = header.querySelector(".site-bar");

    const setOpen = (open: boolean) => {
      toggle?.setAttribute("aria-expanded", open ? "true" : "false");
      if (toggle) toggle.textContent = open ? "Close" : "Menu";
      if (overlay) {
        overlay.hidden = !open;
        overlay.classList.toggle("is-open", open);
      }
      doc.body.classList.toggle("menu-open", open);
    };

    toggle?.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") === "true";
      setOpen(!open);
    });

    overlay?.addEventListener("click", (event) => {
      if (event.target === overlay) setOpen(false);
    });

    doc.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && toggle?.getAttribute("aria-expanded") === "true") {
        setOpen(false);
      }
    });

    const syncScroll = () => {
      bar?.classList.toggle("is-scrolled", window.scrollY > 12);
    };
    syncScroll();
    window.addEventListener("scroll", syncScroll, { passive: true });
  }

  if (footer) {
    footer.innerHTML = `
      <div class="footer-inner">
        <div class="footer-brand">
          <p class="footer-name">Did I Order This?</p>
          <p class="footer-tag">A delivery-scam guard for email. It checks a claim against the orders and tracking numbers stored on this device.</p>
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
      <p class="footer-meta">Apache License 2.0. Built for the #BuildHybridAI 2026 event. Inference runs through Firebase AI Logic. Visual craft follows unslop by Damir Sokolovsky, CC BY 4.0.</p>
    `;
  }
}
