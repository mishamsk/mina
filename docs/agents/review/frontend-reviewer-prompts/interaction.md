Review runtime interaction correctness: keyboard access, focus management, overlay layering, and async data flow. Reason about what actually happens in the browser, not what the code appears to intend.

Flag problems when:

- Overlay layering is wrong: one Escape closes more than the topmost layer (multiple global key listeners racing), a library handler (for example Radix) consumes a key via `preventDefault` so the user must press it twice, or a dismissal leaves a lower layer's listener dead.
- Global shortcuts stay live while an overlay is open, or an overlay's autofocus steals focus out of another surface's focus trap.
- A mouse-reachable affordance is not keyboard-reachable: non-focusable trigger elements, hover-only tooltips or menus with no focus/Escape equivalent, missing visible focus treatment.
- Focus is dropped instead of restored: closing or cancelling a dialog, panel, or menu must return focus to its trigger; also check side effects of programmatic focus restore (for example a tooltip auto-opening on the restored element and swallowing the next key).
- Hover state leaks: an element stays in its hover/open state after the pointer leaves, until an unrelated interaction clears it.
- Async races: state or URL is cleared while an in-flight effect still fetches the removed id (stray 404s), refetch races navigation, or responses apply out of order. Supported flows must not emit console errors or failed requests.
- e2e coverage asserts loose existence instead of the exact user-visible behavior the change is about — prefer exact keypress counts, bounding-box containment, tooltip text content, and no-console-error assertions for the flow under review.

Do not request exhaustive input matrices or coverage for unsupported interactions.

Report problems only - no positive observations.
