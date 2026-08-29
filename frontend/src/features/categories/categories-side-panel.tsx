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
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { ReferenceEntityDeleteDescription } from "@/components/reference-entity-delete-description";
import { Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { IntentBadge, intentLabel } from "./intent-badge";
import { refreshCategoriesAfterMutation } from "./use-categories-resource";

type CategoryFormField = "displayLabel" | "fqn" | "general" | "intent";
type CategoryFormErrors = Partial<Record<CategoryFormField, string>>;

interface CategoryFormState {
  readonly displayLabel: string;
  readonly economicIntent: CategoryEconomicIntent | "";
  readonly fqn: string;
  readonly isHidden: boolean;
}

interface CategoriesSidePanelProps {
  readonly category: Category | undefined;
  readonly initialEconomicIntent?: CategoryEconomicIntent;
  readonly mode: "create" | "edit";
  readonly onClose: () => void;
  readonly onNotice: (message: string) => void;
  readonly open: boolean;
}

const economicIntents: readonly CategoryEconomicIntent[] = [
  "expense",
  "income",
];
const emptyIntentValue = "mina-empty-intent";

const intentEffects = {
  expense:
    "Positive flow records are expense; negative flow records are refund.",
  income:
    "Negative flow records are income; positive flow records are clawback.",
} satisfies Record<CategoryEconomicIntent, string>;

const blankForm = (
  initialEconomicIntent?: CategoryEconomicIntent,
): CategoryFormState => ({
  displayLabel: "",
  economicIntent: initialEconomicIntent ?? "",
  fqn: "",
  isHidden: false,
});

const formFromCategory = (category: Category | undefined): CategoryFormState =>
  category
    ? {
        displayLabel: category.display_label_override ?? "",
        economicIntent: category.economic_intent,
        fqn: category.fqn,
        isHidden: category.is_hidden,
      }
    : blankForm();

const fieldErrorsFromAPI = (message: string): CategoryFormErrors => {
  const lower = message.toLowerCase();
  if (lower.includes("display_label")) {
    return { displayLabel: message };
  }
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
  if (form.displayLabel !== form.displayLabel.trim()) {
    errors.displayLabel = "Remove leading or trailing whitespace.";
  }
  return errors;
};

const validateFormField = (
  form: CategoryFormState,
  mode: "create" | "edit",
  field: CategoryFormField,
): string | undefined => validateForm(form, mode)[field];

const FieldError = ({
  id,
  message,
}: {
  readonly id?: string;
  readonly message: string | undefined;
}) =>
  message ? (
    <p id={id} className="text-destructive text-xs">
      {message}
    </p>
  ) : null;

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
  initialEconomicIntent,
  mode,
  onClose,
  onNotice,
}: Omit<CategoriesSidePanelProps, "open">) => {
  const panelRef = useRef<HTMLElement | null>(null);
  const panelSessionActiveRef = useRef(true);
  const categoryDeleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const [form, setForm] = useState<CategoryFormState>(() =>
    mode === "create"
      ? blankForm(initialEconomicIntent)
      : formFromCategory(category),
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
          "[role='alertdialog']",
        );
        if (openModal) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

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
    const displayLabel = form.displayLabel || null;
    const displayLabelChanged =
      mode === "edit" &&
      category !== undefined &&
      displayLabel !== category.display_label_override;
    const result =
      mode === "create"
        ? await createLedgerCategory({
            display_label: displayLabel,
            economic_intent: form.economicIntent as CategoryEconomicIntent,
            fqn: form.fqn.trim(),
            is_hidden: form.isHidden,
          } satisfies CreateCategoryRequest)
        : category
          ? await updateLedgerCategory(category.category_id, {
              ...(displayLabelChanged ? { display_label: displayLabel } : {}),
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

          <Field
            htmlFor="category-display-label"
            label="Display label (optional)"
          >
            <input
              id="category-display-label"
              type="text"
              disabled={saving}
              aria-describedby={
                fieldErrors.displayLabel
                  ? "category-display-label-help category-display-label-error"
                  : "category-display-label-help"
              }
              aria-invalid={fieldErrors.displayLabel ? true : undefined}
              className="bg-card disabled:bg-muted h-9 border-2 border-[var(--border-ink)] px-2 font-mono text-sm shadow-[var(--shadow-pixel)] disabled:shadow-none"
              placeholder="Automatic from FQN"
              value={form.displayLabel}
              onBlur={() => {
                setFieldError(
                  "displayLabel",
                  validateFormField(form, mode, "displayLabel"),
                );
              }}
              onChange={(event) => {
                updateForm({ displayLabel: event.target.value });
                setFieldError("displayLabel", undefined);
              }}
            />
            <p
              id="category-display-label-help"
              className="text-muted-foreground font-body text-xs"
            >
              Leave blank to use the final one or two FQN segments
              automatically.
            </p>
            <FieldError
              id="category-display-label-error"
              message={fieldErrors.displayLabel}
            />
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
              <Select
                value={form.economicIntent}
                onValueChange={(value) => {
                  updateForm({
                    economicIntent:
                      value === emptyIntentValue
                        ? ""
                        : (value as CategoryEconomicIntent),
                  });
                  setFieldError("intent", undefined);
                }}
              >
                <SelectTrigger
                  id="category-intent"
                  onBlur={() => {
                    setFieldError(
                      "intent",
                      validateFormField(form, mode, "intent"),
                    );
                  }}
                >
                  <SelectValue placeholder="Select intent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={emptyIntentValue}>
                    Select intent
                  </SelectItem>
                  {economicIntents.map((intent) => (
                    <SelectItem key={intent} value={intent}>
                      {intentLabel(intent)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <Tooltip
                label={
                  category.deletable !== true
                    ? "Category has active dependent records."
                    : "Delete category"
                }
                asChild
              >
                <Button
                  ref={categoryDeleteButtonRef}
                  type="button"
                  variant="destructive"
                  aria-disabled={
                    category.deletable !== true ? "true" : undefined
                  }
                  onClick={() => {
                    if (category.deletable !== true) {
                      return;
                    }
                    setDeleteErrorMessage(undefined);
                    setCategoryDeleteOpen(true);
                  }}
                >
                  <Trash aria-hidden="true" />
                  Delete
                </Button>
              </Tooltip>
            ) : null}
            <Button type="submit" disabled={saving}>
              <Check aria-hidden="true" />
              {saving ? "Saving" : mode === "create" ? "Create" : "Save"}
            </Button>
          </div>
        </form>
      </div>

      <ConfirmationDialog
        confirmIcon={<Trash aria-hidden="true" />}
        confirmLabel="Delete category"
        errorMessage={deleteErrorMessage}
        open={categoryDeleteOpen && category !== undefined}
        pending={deletingCategory}
        pendingLabel="Deleting"
        title="Delete category"
        onConfirm={() => {
          void deleteCategory();
        }}
        onOpenChange={(open) => {
          if (!open) {
            closeCategoryDelete();
          }
        }}
      >
        {category ? (
          <ReferenceEntityDeleteDescription
            name={category.fqn}
            noun="category"
          />
        ) : null}
      </ConfirmationDialog>
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
      initialEconomicIntent={props.initialEconomicIntent}
      mode={props.mode}
      onClose={props.onClose}
      onNotice={props.onNotice}
    />
  );
};
