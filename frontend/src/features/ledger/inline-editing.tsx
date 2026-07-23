import {
  createContext,
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { transactionEntryWillOpenEvent } from "@/store";

const inlineEditScopeSelector = "[data-inline-edit-scope='true']";
const inlineEditorSelector = "[data-inline-editor-id]";
const floatingEditorSelector = "[data-inline-editor-content]";

const textEntryInputTypes = new Set([
  "email",
  "password",
  "search",
  "tel",
  "text",
  "url",
]);

const isTextEntryControl = (target: EventTarget | null): boolean =>
  target instanceof HTMLTextAreaElement ||
  (target instanceof HTMLInputElement &&
    textEntryInputTypes.has(target.type)) ||
  (target instanceof HTMLElement && target.isContentEditable);

interface ActiveInlineEditor {
  readonly id: string;
  readonly restoreFocus: () => void;
}

interface SuppressedPointerDown {
  readonly pointerId: number;
  readonly target: EventTarget | null;
}

export interface InlineEditCoordinator {
  readonly activeEditorId: string | undefined;
  readonly discardActive: (restoreFocus?: boolean) => void;
  readonly finish: (editorId: string, restoreFocus?: boolean) => void;
  readonly requestStart: (editorId: string, restoreFocus: () => void) => void;
}

export const useInlineEditCoordinator = (): InlineEditCoordinator => {
  const [activeEditorId, setActiveEditorId] = useState<string>();
  const activeEditorRef = useRef<ActiveInlineEditor | undefined>(undefined);
  const suppressedPointerDownRef = useRef<SuppressedPointerDown | undefined>(
    undefined,
  );

  const discardActive = useCallback((restoreFocus = false) => {
    const activeEditor = activeEditorRef.current;
    if (!activeEditor) {
      return;
    }

    activeEditorRef.current = undefined;
    setActiveEditorId(undefined);
    if (restoreFocus) {
      activeEditor.restoreFocus();
    }
  }, []);

  const finish = useCallback(
    (editorId: string, restoreFocus = false) => {
      if (activeEditorRef.current?.id === editorId) {
        discardActive(restoreFocus);
      }
    },
    [discardActive],
  );

  const requestStart = useCallback(
    (editorId: string, restoreFocus: () => void) => {
      const activeEditor = activeEditorRef.current;
      if (activeEditor) {
        if (activeEditor.id !== editorId) {
          discardActive(false);
        }
        return;
      }

      activeEditorRef.current = { id: editorId, restoreFocus };
      setActiveEditorId(editorId);
    },
    [discardActive],
  );

  useEffect(() => {
    const onEntryOpen = () => {
      discardActive(false);
    };
    const activeEditorElement = (): Element | null => {
      const activeEditor = activeEditorRef.current;
      if (!activeEditor) {
        return null;
      }
      return (
        Array.from(document.querySelectorAll(inlineEditorSelector)).find(
          (element) =>
            element.getAttribute("data-inline-editor-id") === activeEditor.id,
        ) ?? null
      );
    };

    const isInsideActiveEditor = (target: EventTarget | null): boolean => {
      if (!(target instanceof Node)) {
        return false;
      }
      const activeEditor = activeEditorRef.current;
      const targetElement =
        target instanceof Element ? target : target.parentElement;
      const floatingEditor = targetElement?.closest(floatingEditorSelector);
      return (
        activeEditorElement()?.contains(target) === true ||
        (activeEditor !== undefined &&
          floatingEditor?.getAttribute("data-inline-editor-content") ===
            activeEditor.id)
      );
    };

    const isInsideInlineEditScope = (target: EventTarget | null): boolean =>
      target instanceof Element &&
      target.closest(inlineEditScopeSelector) !== null;

    const activeEditorIsPending = (): boolean =>
      activeEditorElement()?.getAttribute("data-inline-editor-pending") ===
      "true";

    const onPointerDown = (event: PointerEvent) => {
      if (!activeEditorRef.current || isInsideActiveEditor(event.target)) {
        return;
      }

      const conflictingScopeInteraction = isInsideInlineEditScope(event.target);
      if (activeEditorIsPending()) {
        if (conflictingScopeInteraction) {
          suppressedPointerDownRef.current =
            event.button === 0
              ? { pointerId: event.pointerId, target: event.target }
              : undefined;
          event.preventDefault();
          event.stopImmediatePropagation();
        }
        return;
      }

      discardActive(false);
      if (conflictingScopeInteraction) {
        suppressedPointerDownRef.current =
          event.button === 0
            ? { pointerId: event.pointerId, target: event.target }
            : undefined;
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };

    const onClick = (event: MouseEvent) => {
      const suppressedPointerDown = suppressedPointerDownRef.current;
      if (!suppressedPointerDown) {
        return;
      }

      suppressedPointerDownRef.current = undefined;
      if (
        event.target !== suppressedPointerDown.target ||
        (event instanceof PointerEvent &&
          event.pointerId !== suppressedPointerDown.pointerId)
      ) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
    };

    const onPointerUp = (event: PointerEvent) => {
      if (suppressedPointerDownRef.current?.pointerId !== event.pointerId) {
        return;
      }

      window.setTimeout(() => {
        if (suppressedPointerDownRef.current?.pointerId === event.pointerId) {
          suppressedPointerDownRef.current = undefined;
        }
      }, 0);
    };

    const onPointerCancel = (event: PointerEvent) => {
      if (suppressedPointerDownRef.current?.pointerId === event.pointerId) {
        suppressedPointerDownRef.current = undefined;
      }
    };

    const onKeyDownCapture = (event: KeyboardEvent) => {
      if (
        !activeEditorRef.current ||
        isInsideActiveEditor(event.target) ||
        !isInsideInlineEditScope(event.target) ||
        !["Enter", "F2", " "].includes(event.key) ||
        (event.key === " " && isTextEntryControl(event.target))
      ) {
        return;
      }

      if (activeEditorIsPending()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      discardActive(false);
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        !activeEditorRef.current
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (activeEditorIsPending()) {
        return;
      }
      discardActive(true);
    };

    document.addEventListener("pointerdown", onPointerDown, { capture: true });
    window.addEventListener(transactionEntryWillOpenEvent, onEntryOpen);
    document.addEventListener("pointerup", onPointerUp, { capture: true });
    document.addEventListener("pointercancel", onPointerCancel, {
      capture: true,
    });
    document.addEventListener("click", onClick, { capture: true });
    document.addEventListener("keydown", onKeyDownCapture, { capture: true });
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, {
        capture: true,
      });
      window.removeEventListener(transactionEntryWillOpenEvent, onEntryOpen);
      document.removeEventListener("pointerup", onPointerUp, {
        capture: true,
      });
      document.removeEventListener("pointercancel", onPointerCancel, {
        capture: true,
      });
      document.removeEventListener("click", onClick, { capture: true });
      document.removeEventListener("keydown", onKeyDownCapture, {
        capture: true,
      });
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [discardActive]);

  return useMemo(
    () => ({ activeEditorId, discardActive, finish, requestStart }),
    [activeEditorId, discardActive, finish, requestStart],
  );
};

const InlineEditContext = createContext<InlineEditCoordinator | undefined>(
  undefined,
);

export const InlineEditProvider = ({
  children,
  coordinator,
}: {
  readonly children: ReactNode;
  readonly coordinator: InlineEditCoordinator;
}) => (
  <InlineEditContext.Provider value={coordinator}>
    {children}
  </InlineEditContext.Provider>
);

export const InlineEditScope = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & {
    readonly coordinator: InlineEditCoordinator;
  }
>(({ coordinator, ...props }, ref) => (
  <InlineEditProvider coordinator={coordinator}>
    <div ref={ref} data-inline-edit-scope="true" {...props} />
  </InlineEditProvider>
));
InlineEditScope.displayName = "InlineEditScope";

export const InlineEditAsideScope = forwardRef<
  HTMLElement,
  HTMLAttributes<HTMLElement> & {
    readonly coordinator: InlineEditCoordinator;
  }
>(({ coordinator, ...props }, ref) => (
  <InlineEditProvider coordinator={coordinator}>
    <aside ref={ref} data-inline-edit-scope="true" {...props} />
  </InlineEditProvider>
));
InlineEditAsideScope.displayName = "InlineEditAsideScope";

export const useInlineEdit = (): InlineEditCoordinator => {
  const coordinator = useContext(InlineEditContext);
  if (!coordinator) {
    throw new Error("Inline editors require an InlineEditProvider.");
  }
  return coordinator;
};
