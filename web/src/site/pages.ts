function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function mountReveals(root: ParentNode): void {
  const items = [...root.querySelectorAll<HTMLElement>("[data-reveal]")];
  if (items.length === 0) return;
  if (prefersReducedMotion() || !("IntersectionObserver" in window)) {
    items.forEach((item) => item.classList.add("is-in"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.2, rootMargin: "0px 0px -8% 0px" },
  );
  items.forEach((item) => io.observe(item));
}

function mountFaq(root: ParentNode): void {
  const items = [...root.querySelectorAll<HTMLDetailsElement>(".faq-item")];
  if (items.length === 0) return;
  items.forEach((item) => {
    item.addEventListener("toggle", () => {
      if (!item.open) return;
      for (const other of items) {
        if (other !== item) other.open = false;
      }
    });
  });
}

export function mountPages(root: ParentNode = document): void {
  mountReveals(root);
  mountFaq(root);
}
