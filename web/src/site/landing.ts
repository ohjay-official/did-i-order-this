interface DemoScenario {
  id: string;
  chip: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  tracking?: string;
  body: string;
  outcome: "warning" | "neutral" | "safe";
  headline: string;
  sourceLabel: string;
  reasons: string[];
}

const SCENARIOS: DemoScenario[] = [
  {
    id: "thread-1-carrier-lure",
    chip: "Fake DHL hold",
    fromName: "DHL Express Desk",
    fromEmail: "alerts@dhl-parcel-desk.example",
    subject: "Your parcel is held. Pay the release fee.",
    tracking: "GM123456789012345",
    body: "Your parcel could not be delivered and is being held at a DHL facility. A customs release fee of $2.99 is due.",
    outcome: "warning",
    headline: "You're not expecting any parcel right now.",
    sourceLabel: "Checked on this device",
    reasons: [
      "Cited tracking number: GM123456789012345.",
      "Your ledger has no expected parcels right now.",
      "The claimed domain dhl-parcel-desk.example is not in the official-domain pack.",
      "The wording asks for a payment, which is common in parcel-hold lures.",
    ],
  },
  {
    id: "thread-3-safe-carrier",
    chip: "Official UPS update",
    fromName: "UPS",
    fromEmail: "mcinfo@ups.com",
    subject: "UPS delivery update for 1Z999AA10123456784",
    tracking: "1Z999AA10123456784",
    body: "A UPS package is on the way. Scheduled delivery is tomorrow. No action is required.",
    outcome: "warning",
    headline: "You're not expecting any parcel right now.",
    sourceLabel: "Checked on this device",
    reasons: [
      "Cited tracking number: 1Z999AA10123456784.",
      "Your ledger has no expected parcels right now.",
      "The claimed domain ups.com is listed as official for UPS.",
    ],
  },
  {
    id: "thread-4-neutral-renewal",
    chip: "Streamhut invoice",
    fromName: "Streamhut Billing",
    fromEmail: "billing@streamhut.example",
    subject: "Your Streamhut invoice is due",
    body: "Your Streamhut plan renews in three days. Invoice INV-88931 for $7.99 is ready.",
    outcome: "neutral",
    headline: "You have no history with this sender.",
    sourceLabel: "Checked on this device",
    reasons: [
      "Cited number: INV-88931.",
      "You have no purchase history with this sender, so this is not an alarm.",
      "The claimed domain streamhut.example is not in the official-domain pack.",
      "The wording asks for a payment, which is common in parcel-hold lures.",
    ],
  },
];

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInstrument(scenario: DemoScenario, phase: "idle" | "reading" | "done"): string {
  const tracking = scenario.tracking
    ? `<p class="demo-track">Tracking number: ${escapeHtml(scenario.tracking)}</p>`
    : "";
  const status =
    phase === "reading"
      ? `<p class="demo-status" data-demo-status>Reading the claim, then checking the ledger on this device</p>`
      : "";
  const verdict =
    phase === "done"
      ? `<div class="preview-verdict result result-${scenario.outcome}" data-demo-verdict>
          <p class="outcome">${escapeHtml(scenario.outcome)}</p>
          <h2 class="headline">${escapeHtml(scenario.headline)}</h2>
          <p class="source-label">${escapeHtml(scenario.sourceLabel)}</p>
          <ul class="reasons">
            ${scenario.reasons.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </div>`
      : "";

  return `
    <div class="demo-thread">
      <p><strong>From</strong> ${escapeHtml(scenario.fromName)} &lt;${escapeHtml(scenario.fromEmail)}&gt;</p>
      <p><strong>Subject</strong> ${escapeHtml(scenario.subject)}</p>
      ${tracking}
      ${status}
      ${verdict}
    </div>
  `;
}

export function mountLanding(root: ParentNode = document): void {
  const stage = root.querySelector<HTMLElement>("[data-demo]");
  if (!stage) return;

  const pane = stage.querySelector<HTMLElement>("[data-demo-pane]");
  const chips = [...stage.querySelectorAll<HTMLButtonElement>("[data-demo-chip]")];
  if (!pane) return;

  let timer: number | undefined;
  let current = SCENARIOS[0];

  const show = (scenario: DemoScenario, instant: boolean) => {
    current = scenario;
    if (timer) window.clearTimeout(timer);
    chips.forEach((chip) => {
      const on = chip.getAttribute("data-demo-chip") === scenario.id;
      chip.classList.toggle("is-current", on);
      chip.setAttribute("aria-pressed", on ? "true" : "false");
    });

    if (instant || prefersReducedMotion()) {
      pane.innerHTML = renderInstrument(scenario, "done");
      return;
    }

    pane.innerHTML = renderInstrument(scenario, "idle");
    pane.classList.remove("is-in");
    void pane.offsetWidth;
    pane.classList.add("is-in");
    timer = window.setTimeout(() => {
      pane.innerHTML = renderInstrument(scenario, "reading");
      timer = window.setTimeout(() => {
        pane.innerHTML = renderInstrument(scenario, "done");
        const stamp = pane.querySelector(".source-label");
        stamp?.classList.add("is-stamped");
      }, 700);
    }, 550);
  };

  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const id = chip.getAttribute("data-demo-chip");
      const next = SCENARIOS.find((item) => item.id === id);
      if (next) show(next, false);
    });
  });

  const start = () => show(current, false);
  if (prefersReducedMotion()) {
    start();
  } else if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          start();
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(stage);
  } else {
    start();
  }
}
