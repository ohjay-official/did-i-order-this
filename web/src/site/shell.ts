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

const ICON_X = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.78L17.75 3Zm-1.08 16.2h1.7L7.4 4.73H5.58L16.67 19.2Z"/></svg>`;
const ICON_GITHUB = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.56 9.56 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"/></svg>`;

const SOCIAL = `
  <a class="social" href="https://x.com/Oh_Jay0" target="_blank" rel="noopener">${ICON_X}<span>@Oh_Jay0 on X</span></a>
  <a class="social" href="https://github.com/ohjay-official" target="_blank" rel="noopener">${ICON_GITHUB}<span>ohjay-official on GitHub</span></a>
`;

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
          <div class="menu-glow" aria-hidden="true"></div>
          <p class="menu-kicker">Menu</p>
          <nav class="menu-nav" aria-label="Site">
            ${[{ href: "/", label: "Home" }, ...NAV]
              .map((item, i) => {
                const active = isActive(item.href, current);
                return `<a href="${item.href}"${active ? ' aria-current="page"' : ""}><span class="menu-num">${String(i + 1).padStart(2, "0")}</span><span class="menu-label">${item.label}</span></a>`;
              })
              .join("")}
          </nav>
          <div class="menu-foot">
            <a class="btn menu-cta" href="/app/">Open the sample inbox</a>
            <div class="menu-social">${SOCIAL}</div>
          </div>
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
      <section class="fx-cta" aria-labelledby="fx-title">
        <div class="fx-aurora" aria-hidden="true"><span></span><span></span><span></span></div>
        <div class="fx-reach" aria-hidden="true">
          <img class="fx-hand is-left" src="/media/hand-left.webp" alt="" loading="lazy" decoding="async" width="1200" height="319" />
          <span class="fx-ring"></span>
          <img class="fx-hand is-right" src="/media/hand-right.webp" alt="" loading="lazy" decoding="async" width="1200" height="319" />
        </div>
        <div class="fx-cta-copy">
          <p class="fx-kicker">Before you pay a release fee</p>
          <h2 id="fx-title">Paste the email. Check it against what you ordered.</h2>
          <div class="fx-actions">
            <a class="btn fx-primary" href="/app/">Open the sample inbox</a>
            <a class="btn fx-ghost" href="https://x.com/Oh_Jay0" target="_blank" rel="noopener">Follow the build on X</a>
          </div>
        </div>
        <figure class="fx-panel">
          <div class="fx-panel-bar"><span></span><span></span><span></span><em>Chrome side panel</em></div>
          <div class="fx-panel-body">
            <p class="fx-panel-name">Did I Order This?</p>
            <p class="fx-panel-note">Reads only the Gmail thread that is open.</p>
            <p class="fx-panel-meta"><strong>From</strong> DHL Express Desk</p>
            <p class="fx-panel-meta"><strong>Subject</strong> Your parcel is held. Pay the release fee.</p>
            <div class="mock-verdict is-warning">
              <p class="kicker">Warning</p>
              <p class="headline">You're not expecting any parcel right now.</p>
              <span class="stamp">Checked on this device</span>
            </div>
          </div>
          <figcaption>The side panel as it renders in the unpacked build. A Chrome Web Store listing is planned, not live.</figcaption>
        </figure>
      </section>
      <div class="fx-foot">
        <div class="fx-arc" aria-hidden="true"></div>
        <div class="fx-cols">
          <div class="fx-brand">
            <p class="footer-name">Did I Order This?</p>
            <p class="footer-tag">A delivery-scam guard for email. It checks a claim against the orders and tracking numbers stored on this device.</p>
            <div class="fx-social">${SOCIAL}</div>
          </div>
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
          <div>
            <p class="footer-heading">The build</p>
            <p class="fx-note">Built for the #BuildHybridAI 2026 event. Inference runs through Firebase AI Logic: on this device first, the cloud only after you agree.</p>
            <p class="fx-note">Visual craft follows unslop by Damir Sokolovsky, CC BY 4.0.</p>
          </div>
        </div>
        <p class="footer-meta fx-meta"><span>&copy; 2026 Did I Order This?</span><span>Apache License 2.0</span></p>
        <p class="fx-wordmark" aria-hidden="true">Did I Order This?</p>
      </div>
    `;
  }
}
