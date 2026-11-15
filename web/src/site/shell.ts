/** Brand mark: a parcel whose tape unspools into a question mark. Source: /brand/mark.svg */
export const LOGO_MARK = `<svg class="wordmark-mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><rect x="7" y="20" width="50" height="40" rx="8" fill="#c4451c"/><rect x="3" y="6" width="58" height="12" rx="4.5" fill="#8f2a12"/><rect x="28.75" y="6" width="6.5" height="20" fill="#fdf1e6"/><path d="M23.5 34a8.5 8.5 0 1 1 12.3 7.6c-2.4 1.2-3.8 2.8-3.8 5.6v.8" fill="none" stroke="#fdf1e6" stroke-width="6.5" stroke-linecap="round"/><circle cx="32" cy="53.6" r="3.8" fill="#fdf1e6"/></svg>`;
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

const ICON_SPARKLE = `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path fill="currentColor" d="M8 0.8l1.6 4.5 4.6 1.7-4.6 1.7L8 13.2 6.4 8.7 1.8 7l4.6-1.7z"/><path fill="currentColor" d="M13 10.5l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z"/></svg>`;

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
          ${LOGO_MARK}
          <span class="wordmark-text">Did I Order This<span class="wordmark-q">?</span></span>
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
        <div class="fx-cta-grid">
          <div class="fx-cta-copy">
            <p class="fx-pill fx-seq" style="--d:0ms">${ICON_SPARKLE}<span>Before you pay a release fee</span></p>
            <h2 id="fx-title">
              <span class="fx-line fx-seq" style="--d:120ms">Paste the email.</span>
              <span class="fx-line fx-seq" style="--d:220ms">Check it against what you ordered.</span>
            </h2>
            <p class="fx-lede fx-seq" style="--d:360ms">Paste one email, or open the sample inbox. The read starts on this device, and the hosted site uses the cloud only after you agree. No account, nothing to install.</p>
            <div class="fx-actions fx-seq" style="--d:480ms">
              <a class="fx-cta-btn" href="/app/">Open the sample inbox</a>
              <a class="fx-ghost-link" href="https://x.com/Oh_Jay0" target="_blank" rel="noopener">Follow the build on X</a>
            </div>
          </div>
          <figure class="fx-editor">
            <div class="fx-editor-frame fx-seq" style="--d:560ms">
              <div class="fx-editor-bar"><span></span><span></span><span></span><em>Chrome side panel</em></div>
              <div class="fx-editor-body">
                <p class="fx-panel-name">Did I Order This?</p>
                <p class="fx-panel-note">Reads only the Gmail thread that is open.</p>
                <p class="fx-panel-meta"><strong>From</strong> DHL Express Desk</p>
                <p class="fx-panel-meta"><strong>Subject</strong> Your parcel is held. Pay the release fee.</p>
                <span class="fx-check">Check this email</span>
                <div class="mock-verdict is-warning">
                  <p class="kicker">Warning</p>
                  <p class="headline">You're not expecting any parcel right now.</p>
                  <span class="stamp">Checked on this device</span>
                  <ul class="fx-reasons">
                    <li>Cited tracking number: GM123456789012345.</li>
                    <li>There are no expected parcels stored on this device right now.</li>
                  </ul>
                </div>
              </div>
            </div>
            <figcaption class="fx-seq" style="--d:700ms">The side panel as it renders in the unpacked build. A Chrome Web Store listing is planned, not live.</figcaption>
          </figure>
        </div>
      </section>
      <div class="fx-foot">
        <div class="fx-glow" aria-hidden="true">
          <div class="fx-aurora"><span></span><span></span><span></span></div>
          <svg class="fx-arc" viewBox="0 0 1326 400" preserveAspectRatio="none" focusable="false">
            <defs>
              <linearGradient id="fx-arc-grad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stop-color="#8b1e12" />
                <stop offset="0.55" stop-color="#e24a2b" />
                <stop offset="1" stop-color="#f0b14a" />
              </linearGradient>
            </defs>
            <path d="M0 143 C 380 300, 640 392, 816 386 S 1180 330, 1326 334" fill="none" stroke="url(#fx-arc-grad)" stroke-width="1.6" vector-effect="non-scaling-stroke" />
          </svg>
          <span class="fx-ring"></span>
        </div>
        <div class="fx-cols">
          <div class="fx-brand fx-seq" style="--d:0ms">
            <p class="footer-name">${LOGO_MARK}Did I Order This<span class="wordmark-q">?</span></p>
            <p class="footer-tag">A delivery-scam guard for email. It checks a claim against the orders and tracking numbers stored on this device.</p>
            <div class="fx-social">${SOCIAL}</div>
          </div>
          <div class="fx-seq" style="--d:120ms">
            <p class="footer-heading">Product</p>
            <a href="/app/">Sample inbox</a>
            <a href="/how-it-works/">How it works</a>
            <a href="/features/">Features</a>
            <a href="/extension/">Chrome extension</a>
          </div>
          <div class="fx-seq" style="--d:220ms">
            <p class="footer-heading">Trust</p>
            <a href="/privacy/">Privacy and security</a>
            <a href="/privacy/#policy">Privacy policy</a>
            <a href="/pricing/">Pricing</a>
            <a href="/faq/">FAQ</a>
            <a href="/about/">About</a>
          </div>
          <div class="fx-seq" style="--d:320ms">
            <p class="footer-heading">The build</p>
            <p class="fx-note">Built for the #BuildHybridAI 2026 event. Inference runs through Firebase AI Logic: on this device first, the cloud only after you agree.</p>
            <p class="fx-note">Apache License 2.0. Visual craft follows unslop by Damir Sokolovsky, CC BY 4.0.</p>
          </div>
        </div>
        <div class="fx-rule" aria-hidden="true"></div>
        <div class="fx-reach">
          <img class="fx-hand is-left" src="/media/hand-left.webp" alt="" loading="lazy" decoding="async" width="582" height="290" />
          <p class="fx-sign">&copy;2026<strong>Did I Order This?</strong>Check the order, not the logo.</p>
          <img class="fx-hand is-right" src="/media/hand-right.webp" alt="" loading="lazy" decoding="async" width="558" height="328" />
        </div>
        <svg class="fx-wordmark" viewBox="0 0 289 64" aria-hidden="true" focusable="false"><path d="M13.56 20.04Q17.6 20.04 20.340000000000003 21.06Q23.080000000000002 22.08 24.740000000000002 23.88Q26.400000000000002 25.68 27.12 28.0Q27.84 30.32 27.84 32.92Q27.84 35.480000000000004 27.060000000000002 37.84Q26.28 40.2 24.58 42.040000000000006Q22.88 43.88 20.16 44.94Q17.44 46.0 13.56 46.0H3.16V20.04ZM7.0 42.52H13.52Q16.6 42.52 18.6 41.7Q20.6 40.88 21.78 39.5Q22.96 38.12 23.46 36.4Q23.96 34.68 23.96 32.92Q23.96 31.119999999999997 23.46 29.439999999999998Q22.96 27.759999999999998 21.78 26.419999999999998Q20.6 25.08 18.6 24.299999999999997Q16.6 23.52 13.52 23.52H7.0Z"/><path d="M35.8 17.8V21.919999999999998H31.04V17.8ZM31.52 26.04H35.32V46.0H31.52Z"/><path d="M47.76 46.4Q45.16 46.4 43.04 45.08Q40.92 43.76 39.7 41.42Q38.48 39.08 38.48 36.04Q38.48 33.0 39.68 30.66Q40.88 28.32 42.96 26.98Q45.04 25.64 47.76 25.64Q50.120000000000005 25.64 51.68000000000001 26.439999999999998Q53.24 27.24 54.120000000000005 28.68Q55.0 30.119999999999997 55.38 31.999999999999996Q55.760000000000005 33.879999999999995 55.760000000000005 36.04Q55.760000000000005 37.64 55.36 39.44Q54.96 41.24 54.08 42.84Q53.2 44.44 51.64 45.42Q50.08 46.4 47.76 46.4ZM48.84 43.08Q50.96 43.08 52.42 42.14Q53.879999999999995 41.2 54.599999999999994 39.6Q55.32 38.0 55.32 36.04Q55.32 33.92 54.58 32.32Q53.84 30.72 52.38 29.84Q50.92 28.96 48.84 28.96Q45.72 28.96 44.019999999999996 30.96Q42.32 32.96 42.32 36.04Q42.32 38.12 43.16 39.7Q44.0 41.28 45.46 42.18Q46.92 43.08 48.84 43.08ZM55.32 18.04H59.16V46.0H55.64Q55.519999999999996 45.12 55.42 43.84Q55.32 42.56 55.32 41.64Z"/><path d="M72.71999999999998 20.04H76.55999999999999V46.0H72.71999999999998Z"/><path d="M102.83999999999999 46.44Q98.79999999999998 46.44 95.65999999999998 44.8Q92.51999999999998 43.16 90.73999999999998 40.16Q88.96 37.16 88.96 33.04Q88.96 28.88 90.73999999999998 25.88Q92.51999999999998 22.88 95.65999999999998 21.24Q98.79999999999998 19.599999999999998 102.83999999999999 19.599999999999998Q106.91999999999999 19.599999999999998 110.03999999999999 21.24Q113.16 22.88 114.96 25.88Q116.75999999999999 28.88 116.75999999999999 33.04Q116.75999999999999 37.16 114.96 40.16Q113.16 43.16 110.03999999999999 44.8Q106.91999999999999 46.44 102.83999999999999 46.44ZM102.83999999999999 42.96Q105.71999999999998 42.96 107.95999999999998 41.84Q110.19999999999999 40.72 111.51999999999998 38.519999999999996Q112.83999999999999 36.32 112.83999999999999 33.04Q112.83999999999999 29.759999999999998 111.51999999999998 27.56Q110.19999999999999 25.36 107.95999999999998 24.22Q105.71999999999998 23.08 102.83999999999999 23.08Q100.03999999999999 23.08 97.75999999999999 24.22Q95.47999999999999 25.36 94.16 27.56Q92.83999999999999 29.759999999999998 92.83999999999999 33.04Q92.83999999999999 36.32 94.16 38.519999999999996Q95.47999999999999 40.72 97.75999999999999 41.84Q100.03999999999999 42.96 102.83999999999999 42.96Z"/><path d="M120.11999999999999 26.04H123.96V46.0H120.11999999999999ZM130.72 29.44Q128.64 29.44 127.17999999999999 30.4Q125.72 31.36 124.86 32.76Q124.0 34.16 123.72 35.44L123.67999999999999 33.16Q123.72 32.76 123.9 31.9Q124.08 31.04 124.56 29.96Q125.03999999999999 28.88 125.84 27.9Q126.64 26.919999999999998 127.84 26.28Q129.04 25.64 130.72 25.64Z"/><path d="M141.23999999999998 46.4Q138.64 46.4 136.51999999999998 45.08Q134.39999999999998 43.76 133.17999999999998 41.42Q131.95999999999998 39.08 131.95999999999998 36.04Q131.95999999999998 33.0 133.15999999999997 30.66Q134.35999999999999 28.32 136.44 26.98Q138.51999999999998 25.64 141.23999999999998 25.64Q143.6 25.64 145.16 26.439999999999998Q146.72 27.24 147.6 28.68Q148.48 30.119999999999997 148.85999999999999 31.999999999999996Q149.23999999999998 33.879999999999995 149.23999999999998 36.04Q149.23999999999998 37.64 148.83999999999997 39.44Q148.44 41.24 147.56 42.84Q146.67999999999998 44.44 145.12 45.42Q143.56 46.4 141.23999999999998 46.4ZM142.32 43.08Q144.44 43.08 145.89999999999998 42.14Q147.35999999999999 41.2 148.07999999999998 39.6Q148.79999999999998 38.0 148.79999999999998 36.04Q148.79999999999998 33.92 148.06 32.32Q147.32 30.72 145.85999999999999 29.84Q144.39999999999998 28.96 142.32 28.96Q139.2 28.96 137.5 30.96Q135.79999999999998 32.96 135.79999999999998 36.04Q135.79999999999998 38.12 136.64 39.7Q137.48 41.28 138.94 42.18Q140.39999999999998 43.08 142.32 43.08ZM148.79999999999998 18.04H152.64V46.0H149.12Q149.0 45.12 148.89999999999998 43.84Q148.79999999999998 42.56 148.79999999999998 41.64Z"/><path d="M172.56 39.519999999999996H176.2Q175.88 41.48 174.68 43.04Q173.48 44.6 171.51999999999998 45.519999999999996Q169.55999999999997 46.44 166.92 46.44Q163.79999999999998 46.44 161.35999999999999 45.12Q158.92 43.8 157.51999999999998 41.48Q156.11999999999998 39.16 156.11999999999998 36.08Q156.11999999999998 32.96 157.47999999999996 30.62Q158.83999999999997 28.28 161.23999999999998 26.96Q163.64 25.64 166.72 25.64Q169.95999999999998 25.64 172.15999999999997 26.92Q174.35999999999999 28.2 175.42 30.700000000000003Q176.48 33.2 176.27999999999997 36.92H159.92Q160.11999999999998 38.72 161.01999999999998 40.12Q161.92 41.519999999999996 163.42 42.31999999999999Q164.92 43.12 166.88 43.12Q169.07999999999998 43.12 170.56 42.12Q172.04 41.12 172.56 39.519999999999996ZM166.76 28.919999999999998Q164.16 28.919999999999998 162.44 30.299999999999997Q160.72 31.68 160.16 33.96H172.44Q172.27999999999997 31.52 170.67999999999998 30.22Q169.07999999999998 28.919999999999998 166.76 28.919999999999998Z"/><path d="M179.12 26.04H182.96V46.0H179.12ZM189.72 29.44Q187.64 29.44 186.18 30.4Q184.72 31.36 183.86 32.76Q183.0 34.16 182.72 35.44L182.68 33.16Q182.72 32.76 182.89999999999998 31.9Q183.07999999999998 31.04 183.56 29.96Q184.04 28.88 184.83999999999997 27.9Q185.64 26.919999999999998 186.83999999999997 26.28Q188.04 25.64 189.72 25.64Z"/><path d="M197.76 20.04H220.51999999999998V23.48H197.76ZM207.2 23.08H211.07999999999998V46.0H207.2Z"/><path d="M238.0 46.0V33.96Q238.0 32.36 237.48000000000002 31.32Q236.96 30.28 235.92000000000002 29.740000000000002Q234.88 29.2 233.28 29.2Q231.52 29.2 230.06 30.02Q228.6 30.84 227.68 32.22Q226.76 33.6 226.56 35.32L226.52 33.04Q226.72 31.48 227.38 30.119999999999997Q228.04 28.759999999999998 229.06 27.759999999999998Q230.08 26.759999999999998 231.44 26.2Q232.8 25.64 234.4 25.64Q236.08 25.64 237.44 26.1Q238.8 26.56 239.78 27.5Q240.76 28.44 241.28 29.78Q241.8 31.119999999999997 241.8 32.84V46.0ZM223.0 46.0V18.04H226.8V46.0Z"/><path d="M250.24 17.8V21.919999999999998H245.48000000000002V17.8ZM245.96 26.04H249.76V46.0H245.96Z"/><path d="M253.07999999999998 39.519999999999996H256.6Q256.8 41.12 258.03999999999996 42.14Q259.28 43.16 261.52 43.16Q262.96 43.16 263.76 42.81999999999999Q264.56 42.48 264.9 41.879999999999995Q265.24 41.28 265.24 40.56Q265.24 39.64 264.76 39.14Q264.28 38.64 263.4 38.3Q262.52 37.96 261.32 37.64Q260.0 37.28 258.68 36.8Q257.36 36.32 256.26 35.64Q255.16 34.96 254.5 33.94Q253.84 32.92 253.84 31.439999999999998Q253.84 30.2 254.38 29.119999999999997Q254.92 28.04 255.94 27.259999999999998Q256.96 26.48 258.32 26.060000000000002Q259.68 25.64 261.32 25.64Q263.6 25.64 265.16 26.46Q266.72 27.28 267.54 28.76Q268.36 30.240000000000002 268.4 32.16H265.04Q264.76 30.48 263.88 29.7Q263.0 28.919999999999998 261.24 28.919999999999998Q259.52 28.919999999999998 258.6 29.6Q257.68 30.28 257.68 31.439999999999998Q257.68 32.32 258.32 32.86Q258.96 33.4 260.03999999999996 33.8Q261.12 34.2 262.48 34.64Q263.76 35.08 264.94 35.54Q266.12 36.0 267.06 36.620000000000005Q268.0 37.24 268.53999999999996 38.22Q269.08 39.2 269.08 40.64Q269.08 42.4 268.2 43.7Q267.32 45.0 265.65999999999997 45.72Q264.0 46.44 261.64 46.44Q259.48 46.44 257.98 45.92Q256.48 45.4 255.46 44.56Q254.44 43.72 253.89999999999998 42.78Q253.35999999999999 41.84 253.18 40.96Q253.0 40.08 253.07999999999998 39.519999999999996Z"/><path d="M277.79999999999995 37.96V31.119999999999997H279.2Q282.4 31.119999999999997 283.98 29.78Q285.56 28.44 285.56 26.0Q285.56 23.68 284.14 22.38Q282.71999999999997 21.08 280.47999999999996 21.08Q279.0 21.08 277.86 21.659999999999997Q276.71999999999997 22.24 276.12 23.28Q275.52 24.32 275.52 25.68H271.71999999999997Q271.67999999999995 24.4 272.05999999999995 23.22Q272.44 22.04 273.2 21.02Q273.96 20.0 275.05999999999995 19.240000000000002Q276.15999999999997 18.48 277.55999999999995 18.04Q278.96 17.599999999999998 280.64 17.599999999999998Q282.76 17.599999999999998 284.38 18.24Q286.0 18.88 287.12 20.0Q288.23999999999995 21.12 288.81999999999994 22.64Q289.4 24.16 289.4 25.919999999999998Q289.4 28.4 288.36 30.119999999999997Q287.32 31.84 285.55999999999995 32.8Q283.79999999999995 33.76 281.59999999999997 34.0V37.96ZM277.35999999999996 46.0V41.88H282.08V46.0Z" class="q"/></svg>
      </div>
    `;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduced && "IntersectionObserver" in window) {
      footer.classList.add("fx-anim");
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            footer.classList.add("is-in");
            observer.disconnect();
          }
        },
        { threshold: 0.08 },
      );
      observer.observe(footer.querySelector(".fx-cta") ?? footer);
    }
  }
}
