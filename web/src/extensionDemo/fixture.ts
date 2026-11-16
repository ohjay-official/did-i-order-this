import { sampleThreads, type SampleThread } from "../demo/seed.ts";

/**
 * Gmail-like markup for the hosted extension fixture at /extension-demo/.
 * The extension's content script reads the same selectors it reads in Gmail
 * (h2.hP, span.gD[email], span.g3, div.a3s), so judges can try the side panel
 * without signing in to Gmail. This is a fixture, not Gmail and not real mail.
 */

export const FIXTURE_PATH = "/extension-demo/";
export const FIXTURE_ORIGIN = "https://did-i-order-this.vercel.app";
export const FIXTURE_MATCH = `${FIXTURE_ORIGIN}${FIXTURE_PATH}*`;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Inner markup of the fixture's role="main" region for one sample thread. */
export function fixtureThreadHtml(thread: SampleThread): string {
  return `<h2 class="hP">${escapeHtml(thread.subject)}</h2>
        <p class="fixture-from"><span class="gD" email="${escapeHtml(thread.fromEmail)}">${escapeHtml(thread.fromName)}</span> <span class="go">&lt;${escapeHtml(thread.fromEmail)}&gt;</span></p>
        <p class="fixture-date"><span class="g3" title="${escapeHtml(thread.date)}">${escapeHtml(thread.date)}</span></p>
        <div class="a3s aiL">${escapeHtml(thread.body)}</div>`;
}

export function fixtureThread(id: string | null | undefined): SampleThread {
  return sampleThreads.find((thread) => thread.id === id) ?? sampleThreads[0];
}

/** Wires the thread buttons and ?thread= on the fixture page. */
export function mountFixture(doc: Document, search = ""): void {
  const main = doc.querySelector<HTMLElement>("[data-fixture-main]");
  if (!main) return;
  const show = (id: string | null | undefined) => {
    const thread = fixtureThread(id);
    main.innerHTML = fixtureThreadHtml(thread);
    for (const button of doc.querySelectorAll<HTMLButtonElement>("[data-fixture-thread]")) {
      button.setAttribute("aria-pressed", button.dataset.fixtureThread === thread.id ? "true" : "false");
    }
  };
  const wanted = new URLSearchParams(search).get("thread");
  if (wanted) show(wanted);
  for (const button of doc.querySelectorAll<HTMLButtonElement>("[data-fixture-thread]")) {
    button.addEventListener("click", () => show(button.dataset.fixtureThread));
  }
}
