import { Check, Close, Trash } from "pixelarticons/react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  apiErrorMessage,
  type Category,
  type CategoryEconomicIntent,
  type CreateCategoryRequest,
  createLedgerCategory,
  deleteLedgerCategoryById,
  type UpdateCategoryRequest,
  updateLedgerCategory,
} from "@/api";
import { Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

import { IntentBadge, intentLabel } from "./intent-badge";
import { refreshCategoriesAfterMutation } from "./use-categories-resource";

type CategoryFormField = "fqn" | "general" | "intent";
type CategoryFormErrors = Partial<Record<CategoryFormField, string>>;

interface CategoryFormState {
  readonly economicIntent: CategoryEconomicIntent | "";
  readonly fqn: string;
  readonly isHidden: boolean;
}

interface CategoriesSidePanelProps {
  readonly category: Category | undefined;
  readonly mode: "create" | "edit";
  readonly onClose: () => void;
  readonly onNotice: (message: string) => void;
  readonly open: boolean;
}

const economicIntents: readonly CategoryEconomicIntent[] = [
  "expense",
  "fee",
  "income",
  "refund",
  "transfer",
  "exchange",
  "adjustment",
  "fx_gain_loss",
];

const intentEffects = {
  adjustment: "Excluded from ordinary totals; used for adjustment views.",
  exchange: "Excluded from spend and income totals; used for exchange views.",
  expense:
    "Included in spending totals; standalone transactions classify as spend.",
  fee: "Included in spending totals; attached fees annotate the primary class.",
  fx_gain_loss:
    "Included in gain/loss reporting outside ordinary spend and income totals.",
  income: "Counts toward income totals.",
  refund: "Counts toward refund totals and stays out of gross income.",
  transfer:
    "Excluded from spend and income totals; used for cashflow and balance movement.",
} satisfies Record<CategoryEconomicIntent, string>;

const focusableSelector =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

const blankForm = (): CategoryFormState => ({
  economicIntent: "",
  fqn: "",
  isHidden: false,
});

const formFromCategory = (category: Category | undefined): CategoryFormState =>
  category
    ? {
        economicIntent: category.economic_intent,
        fqn: category.fqn,
        isHidden: category.is_hidden,
      }
    : blankForm();

const fieldErrorsFromAPI = (message: string): CategoryFormErrors => {
  const lower = message.toLowerCase();
  if (lower.includes("fqn") || lower.includes("name")) {
    return { fqn: message };
  }
  if (lower.includes("economic_intent") || lower.includes("intent")) {
    return { intent: message };
  }
  return { general: message };
};

const hasErrors = (errors: CategoryFormErrors): boolean =>
  Object.values(errors).some(Boolean);

const validateForm = (
  form: CategoryFormState,
  mode: "create" | "edit",
): CategoryFormErrors => {
  const errors: CategoryFormErrors = {};
  if (mode === "create" && !form.fqn.trim()) {
    errors.fqn = "FQN is required.";
  }
  if (mode === "create" && !form.economicIntent) {
    errors.intent = "Intent is required.";
  }
  return errors;
};

const validateFormField = (
  form: CategoryFormState,
  mode: "create" | "edit",
  field: CategoryFormField,
): string | undefined => validateForm(form, mode)[field];

const FieldError = ({ message }: { readonly message: string | undefined }) =>
  message ? <p className="text-destructive text-xs">{message}</p> : null;

const Field = ({
  children,
  htmlFor,
  label,
}: {
  readonly children: ReactNode;
  readonly htmlFor: string;
  readonly label: string;
}) => (
  <div className="flex flex-col gap-1">
    <label
      id={`${htmlFor}-label`}
      htmlFor={htmlFor}
      className="text-sm font-semibold"
    >
      {label}
    </label>
    {children}
  </div>
);

const CategoriesSidePanelContent = ({
  category,
  mode,
  onClose,
  onNotice,
}: Omit<CategoriesSidePanelProps, "open">) => {
  const panelRef = useRef<HTMLElement | null>(null);
  const panelSessionActiveRef = useRef(true);
  const categoryDeleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const cancelDeleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const [form, setForm] = useState<CategoryFormState>(() =>
    mode === "create" ? blankForm() : formFromCategory(category),
  );
  const [fieldErrors, setFieldErrors] = useState<CategoryFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [categoryDeleteOpen, setCategoryDeleteOpen] = useState(false);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<
    string | undefined
  >();
  const [deletingCategory, setDeletingCategory] = useState(false);

  useEffect(() => {
    panelSessionActiveRef.current = true;
    return () => {
      panelSessionActiveRef.current = false;
    };
  }, []);

  useEffect(() => {
    window.requestAnimationFrame(() => {
      panelRef.current?.focus({ preventScroll: true });
    });
  }, [mode, category?.category_id]);

  const closeCategoryDelete = useCallback(() => {
    if (!deletingCategory) {
      setCategoryDeleteOpen(false);
      setDeleteErrorMessage(undefined);
      window.requestAnimationFrame(() => {
        categoryDeleteButtonRef.current?.focus({ preventScroll: true });
      });
    }
  }, [deletingCategory]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (event.defaultPrevented) {
          return;
        }
        const openModal = document.querySelector<HTMLElement>(
          "[role='alertdialog'][aria-modal='true']",
        );
        if (openModal && openModal !== dialogRef.current) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (categoryDeleteOpen) {
          closeCategoryDelete();
        } else {
          onClose();
        }
        return;
      }

      if (event.key !== "Tab" || !categoryDeleteOpen) {
        return;
      }

      const trapRoot = dialogRef.current;
      if (!trapRoot) {
        return;
      }
      const focusable = Array.from(
        trapRoot.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => !element.hasAttribute("disabled"));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        trapRoot.focus();
        return;
      }
      if (!trapRoot.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
        return;
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      document.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [categoryDeleteOpen, closeCategoryDelete, onClose]);

  useEffect(() => {
    if (!categoryDeleteOpen) {
      return;
    }
    window.requestAnimationFrame(() => {
      cancelDeleteButtonRef.current?.focus({ preventScroll: true });
    });
  }, [categoryDeleteOpen]);

  const updateForm = (patch: Partial<CategoryFormState>) => {
    setForm((current) => ({ ...current, ...patch }));
  };

  const setFieldError = (
    field: CategoryFormField,
    message: string | undefined,
  ) => {
    setFieldErrors((current) => {
      const next = { ...current };
      if (message) {
        next[field] = message;
      } else {
        delete next[field];
      }
      return next;
    });
  };

  const submitForm = async () => {
    if (saving) {
      return;
    }

    const nextErrors = validateForm(form, mode);
    setFieldErrors(nextErrors);
    if (hasErrors(nextErrors)) {
      return;
    }

    setSaving(true);
    const result =
      mode === "create"
        ? await createLedgerCategory({
            economic_intent: form.economicIntent as CategoryEconomicIntent,
            fqn: form.fqn.trim(),
            is_hidden: form.isHidden,
          } satisfies CreateCategoryRequest)
        : category
          ? await updateLedgerCategory(category.category_id, {
              is_hidden: form.isHidden,
            } satisfies UpdateCategoryRequest)
          : undefined;
    if (!result) {
      if (panelSessionActiveRef.current) {
        setSaving(false);
      }
      return;
    }

    if (result.data) {
      await refreshCategoriesAfterMutation();
      onClose();
      onNotice(mode === "create" ? "Category created." : "Category updated.");
      return;
    }

    if (!panelSessionActiveRef.current) {
      return;
    }
    setSaving(false);
    const message = apiErrorMessage(
      result.error,
      "Category could not be saved.",
    );
    setFieldErrors((current) => ({
      ...current,
      ...fieldErrorsFromAPI(message),
    }));
  };

  const deleteCategory = async () => {
    if (!category || deletingCategory) {
      return;
    }
    setDeletingCategory(true);
    setDeleteErrorMessage(undefined);
    const result = await deleteLedgerCategoryById(category.category_id);
    if (!panelSessionActiveRef.current) {
      return;
    }
    if (result.data !== undefined || !result.error) {
      await refreshCategoriesAfterMutation();
      onClose();
      onNotice("Category deleted.");
      return;
    }
    setDeletingCategory(false);
    setDeleteErrorMessage(
      apiErrorMessage(result.error, "Category could not be deleted."),
    );
  };

  const title = mode === "create" ? "Create category" : "Edit category";
  const selectedIntent =
    form.economicIntent === "" ? undefined : form.economicIntent;

  return (
    <aside
      ref={panelRef}
      role="dialog"
      aria-labelledby="categories-side-panel-title"
      className="bg-card fixed top-4 right-4 bottom-4 z-50 flex w-[min(520px,calc(100vw-2rem))] max-w-full flex-col border-2 border-[var(--border-ink)] shadow-[var(--shadow-pixel)]"
      data-testid="categories-side-panel"
      tabIndex={-1}
    >
      <div className="bg-card sticky top-0 z-10 flex items-start justify-between gap-3 border-b-2 border-[var(--border-ink)] p-4">
        <div className="min-w-0">
          <p className="font-heading text-muted-foreground text-xs font-semibold uppercase">
            Categories
          </p>
          <h2 id="categories-side-panel-title" className="text-pixel text-base">
            {title}
          </h2>
        </div>
        <Tooltip label="Close category panel" asChild>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Close category panel"
            onClick={onClose}
          >
            <Close aria-hidden="true" />
          </Button>
        </Tooltip>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submitForm();
          }}
        >
          <Field htmlFor="category-fqn" label="FQN">
            <input
              id="category-fqn"
              className="bg-card disabled:bg-muted h-9 border-2 border-[var(--border-ink)] px-2 font-mono text-sm shadow-[var(--shadow-pixel)]"
              readOnly={mode === "edit"}
              value={form.fqn}
              onBlur={() => {
                setFieldError("fqn", validateFormField(form, mode, "fqn"));
              }}
              onChange={(event) => {
                updateForm({ fqn: event.target.value });
                setFieldError("fqn", undefined);
              }}
            />
            <FieldError message={fieldErrors.fqn} />
          </Field>

          <Field htmlFor="category-intent" label="Intent">
            {mode === "edit" && selectedIntent ? (
              <div
                id="category-intent"
                aria-labelledby="category-intent-label"
                className="flex h-9 items-center"
              >
                <IntentBadge economicIntent={selectedIntent} />
              </div>
            ) : (
              <select
                id="category-intent"
                className="bg-card h-9 border-2 border-[var(--border-ink)] px-2 font-mono text-sm shadow-[var(--shadow-pixel)]"
                value={form.economicIntent}
                onBlur={() => {
                  setFieldError(
                    "intent",
                    validateFormField(form, mode, "intent"),
                  );
                }}
                onChange={(event) => {
                  updateForm({
                    economicIntent: event.target
                      .value as CategoryEconomicIntent,
                  });
                  setFieldError("intent", undefined);
                }}
              >
                <option value="">Select intent</option>
                {economicIntents.map((intent) => (
                  <option key={intent} value={intent}>
                    {intentLabel(intent)}
                  </option>
                ))}
              </select>
            )}
            <FieldError message={fieldErrors.intent} />
            {selectedIntent ? (
              <p className="font-body text-muted-foreground text-sm">
                {intentEffects[selectedIntent]}
              </p>
            ) : null}
          </Field>

          <label className="flex h-9 items-center gap-2 border-2 border-[var(--border-ink)] px-2 font-mono text-sm shadow-[var(--shadow-pixel)]">
            <Checkbox
              checked={form.isHidden}
              aria-label="Hidden"
              onCheckedChange={(checked) => {
                updateForm({ isHidden: checked === true });
              }}
            />
            Hidden
          </label>

          {fieldErrors.general ? (
            <p
              role="alert"
              className="border-destructive text-destructive border-2 p-2 text-sm"
            >
              {fieldErrors.general}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 border-t-2 border-[var(--border-ink)] pt-4">
            {mode === "edit" && category ? (
              <Button
                ref={categoryDeleteButtonRef}
                type="button"
                variant="destructive"
                onClick={() => {
                  setDeleteErrorMessage(undefined);
                  setCategoryDeleteOpen(true);
                }}
              >
                <Trash aria-hidden="true" />
                Delete
              </Button>
            ) : null}
            <Button type="submit" disabled={saving}>
              <Check aria-hidden="true" />
              {saving ? "Saving" : mode === "create" ? "Create" : "Save"}
            </Button>
          </div>
        </form>
      </div>

      {categoryDeleteOpen && category ? (
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-[color-mix(in_srgb,var(--frame),transparent_18%)] p-4"
          role="presentation"
        >
          <section
            ref={dialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-category-title"
            aria-describedby="delete-category-description"
            className="bg-card w-[min(480px,100%)] border-2 border-[var(--border-ink)] p-4 shadow-[var(--shadow-pixel)]"
            tabIndex={-1}
          >
            <h3
              id="delete-category-title"
              className="font-heading text-base font-bold uppercase"
            >
              Delete category
            </h3>
            <div
              id="delete-category-description"
              className="font-body text-muted-foreground mt-3 space-y-2 text-sm"
            >
              <p className="flex flex-wrap items-center gap-1">
                <span>Delete</span>
                <span className="text-foreground font-mono font-medium break-all">
                  {category.fqn}
                </span>
                <span>?</span>
              </p>
              <p>
                This tombstones the category and removes it from default
                category lists and pickers.
              </p>
            </div>
            {deleteErrorMessage ? (
              <p
                className="border-destructive text-destructive mt-3 border-2 p-2 text-sm"
                role="alert"
              >
                {deleteErrorMessage}
              </p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button
                ref={cancelDeleteButtonRef}
                type="button"
                variant="outline"
                disabled={deletingCategory}
                onClick={closeCategoryDelete}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deletingCategory}
                onClick={() => {
                  void deleteCategory();
                }}
              >
                <Trash aria-hidden="true" />
                {deletingCategory ? "Deleting" : "Delete category"}
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </aside>
  );
};

export const CategoriesSidePanel = (props: CategoriesSidePanelProps) => {
  if (!props.open) {
    return null;
  }

  return (
    <CategoriesSidePanelContent
      key={`${props.mode}:${props.category?.category_id ?? "new"}`}
      category={props.category}
      mode={props.mode}
      onClose={props.onClose}
      onNotice={props.onNotice}
    />
  );
};
