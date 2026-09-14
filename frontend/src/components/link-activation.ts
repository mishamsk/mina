import type { KeyboardEvent, MouseEvent } from "react";

export const isPlainLinkClick = (event: MouseEvent<HTMLElement>): boolean =>
  !event.defaultPrevented &&
  event.button === 0 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey;

// Row shortcuts activate their real link; the router and browser own navigation.
export const activateRowLink = (
  event: KeyboardEvent<HTMLElement> | MouseEvent<HTMLElement>,
): void => {
  if ("key" in event) {
    if (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      (event.key !== "Enter" && event.key !== " ")
    )
      return;
  } else if (!isPlainLinkClick(event)) {
    return;
  }

  const target = event.target;
  if (!(target instanceof Element)) return;
  const control = target.closest(
    "a, button, input, select, textarea, summary, [role='button'], " +
      "[contenteditable='true'], " +
      "[tabindex]:not([tabindex='-1']):not([data-slot='tooltip-trigger'])",
  );
  if (control && control !== event.currentTarget) return;

  const link =
    event.currentTarget.querySelector<HTMLAnchorElement>("a[data-row-link]");
  if (!link) return;
  if ("key" in event) event.preventDefault();
  link.click();
};
