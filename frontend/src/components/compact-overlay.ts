export const nestedControlLayerSelector =
  "[data-slot='popover-content'], [data-slot='select-content']";

export const controlLayerBelongsToMobileControls = (
  layer: Element,
): boolean => {
  let currentLayer: Element | null = layer;
  const visited = new Set<Element>();
  while (currentLayer && !visited.has(currentLayer)) {
    visited.add(currentLayer);
    const controlledIds = new Set<string>([
      currentLayer.id,
      ...Array.from(
        currentLayer.querySelectorAll<HTMLElement>("[id]"),
        (node) => node.id,
      ),
    ]);
    const candidates: readonly HTMLElement[] = Array.from(
      document.querySelectorAll<HTMLElement>("[aria-controls]"),
    );
    const trigger: HTMLElement | undefined = candidates.find((candidate) =>
      candidate
        .getAttribute("aria-controls")
        ?.split(/\s+/)
        .some((id) => controlledIds.has(id)),
    );
    if (!trigger) return false;
    if (trigger.closest("[data-mobile-table-controls-content]")) return true;
    currentLayer = trigger.closest(nestedControlLayerSelector);
  }
  return false;
};

export const markMobileControlsLayer = (layer: Element | null): void => {
  if (!layer || !controlLayerBelongsToMobileControls(layer)) return;
  layer.setAttribute("data-mobile-controls-layer", "true");
};

export const preserveNestedControlLayer = (event: Event): void => {
  const layer =
    event.target instanceof Element
      ? event.target.closest(nestedControlLayerSelector)
      : null;
  if (layer?.hasAttribute("data-mobile-controls-layer")) {
    event.preventDefault();
  }
};
