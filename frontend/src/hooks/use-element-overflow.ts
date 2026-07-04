import { useCallback, useEffect, useState } from "react";

const overflowSlopPx = 1;

const elementOverflows = (element: HTMLElement): boolean =>
  element.scrollWidth > element.clientWidth + overflowSlopPx ||
  element.scrollHeight > element.clientHeight + overflowSlopPx;

export const useElementOverflow = <T extends HTMLElement>() => {
  const [element, setElement] = useState<T | null>(null);
  const [overflowing, setOverflowing] = useState(false);

  const ref = useCallback((nextElement: T | null) => {
    setElement(nextElement);
    if (!nextElement) {
      setOverflowing(false);
    }
  }, []);

  useEffect(() => {
    if (!element) {
      return;
    }

    let frame = 0;
    const observeChildren = (observer: ResizeObserver) => {
      observer.observe(element);
      for (const child of element.children) {
        if (child instanceof HTMLElement) {
          observer.observe(child);
        }
      }
    };
    const measure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setOverflowing(elementOverflows(element));
      });
    };

    const resizeObserver = new ResizeObserver(measure);
    observeChildren(resizeObserver);

    const mutationObserver = new MutationObserver(() => {
      resizeObserver.disconnect();
      observeChildren(resizeObserver);
      measure();
    });
    mutationObserver.observe(element, {
      characterData: true,
      childList: true,
      subtree: true,
    });
    window.addEventListener("resize", measure);
    measure();

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
    };
  }, [element]);

  return { isOverflowing: overflowing, ref };
};
