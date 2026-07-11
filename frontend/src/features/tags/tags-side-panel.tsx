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
  createLedgerTag,
  type CreateTagRequest,
  deleteLedgerTagById,
  type Tag,
  updateLedgerTag,
  type UpdateTagRequest,
} from "@/api";
import { Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

import { refreshTagsAfterMutation } from "./use-tags-resource";

type TagFormField = "fqn" | "general";
type TagFormErrors = Partial<Record<TagFormField, string>>;

interface TagFormState {
  readonly fqn: string;
  readonly isHidden: boolean;
}

interface TagsSidePanelProps {
  readonly mode: "create" | "edit";
  readonly onClose: () => void;
  readonly onNotice: (message: string) => void;
  readonly open: boolean;
  readonly tag: Tag | undefined;
}

const focusableSelector =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

const blankForm = (): TagFormState => ({
  fqn: "",
  isHidden: false,
});

const formFromTag = (tag: Tag | undefined): TagFormState =>
  tag
    ? {
        fqn: tag.fqn,
        isHidden: tag.is_hidden,
      }
    : blankForm();

const fieldErrorsFromAPI = (message: string): TagFormErrors => {
  const lower = message.toLowerCase();
  if (lower.includes("fqn") || lower.includes("name")) {
    return { fqn: message };
  }
  return { general: message };
};

const hasErrors = (errors: TagFormErrors): boolean =>
  Object.values(errors).some(Boolean);

const validateForm = (
  form: TagFormState,
  mode: "create" | "edit",
): TagFormErrors => {
  const errors: TagFormErrors = {};
  if (mode === "create" && !form.fqn.trim()) {
    errors.fqn = "FQN is required.";
  }
  return errors;
};

const validateFormField = (
  form: TagFormState,
  mode: "create" | "edit",
  field: TagFormField,
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

const TagsSidePanelContent = ({
  mode,
  onClose,
  onNotice,
  tag,
}: Omit<TagsSidePanelProps, "open">) => {
  const panelRef = useRef<HTMLElement | null>(null);
  const panelSessionActiveRef = useRef(true);
  const tagDeleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const cancelDeleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const [form, setForm] = useState<TagFormState>(() =>
    mode === "create" ? blankForm() : formFromTag(tag),
  );
  const [fieldErrors, setFieldErrors] = useState<TagFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [tagDeleteOpen, setTagDeleteOpen] = useState(false);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<
    string | undefined
  >();
  const [deletingTag, setDeletingTag] = useState(false);

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
  }, [mode, tag?.tag_id]);

  const closeTagDelete = useCallback(() => {
    if (!deletingTag) {
      setTagDeleteOpen(false);
      setDeleteErrorMessage(undefined);
      window.requestAnimationFrame(() => {
        tagDeleteButtonRef.current?.focus({ preventScroll: true });
      });
    }
  }, [deletingTag]);

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
        if (tagDeleteOpen) {
          closeTagDelete();
        } else if (saving) {
          return;
        } else {
          onClose();
        }
        return;
      }

      if (event.key !== "Tab" || !tagDeleteOpen) {
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
  }, [closeTagDelete, onClose, saving, tagDeleteOpen]);

  useEffect(() => {
    if (!tagDeleteOpen) {
      return;
    }
    window.requestAnimationFrame(() => {
      cancelDeleteButtonRef.current?.focus({ preventScroll: true });
    });
  }, [tagDeleteOpen]);

  const updateForm = (patch: Partial<TagFormState>) => {
    setForm((current) => ({ ...current, ...patch }));
  };

  const setFieldError = (field: TagFormField, message: string | undefined) => {
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
        ? await createLedgerTag({
            fqn: form.fqn.trim(),
            is_hidden: form.isHidden,
          } satisfies CreateTagRequest)
        : tag
          ? await updateLedgerTag(tag.tag_id, {
              is_hidden: form.isHidden,
            } satisfies UpdateTagRequest)
          : undefined;
    if (!result) {
      if (!panelSessionActiveRef.current) {
        return;
      }
      setSaving(false);
      return;
    }

    if (result.data) {
      await refreshTagsAfterMutation();
      if (!panelSessionActiveRef.current) {
        return;
      }
      onClose();
      onNotice(mode === "create" ? "Tag created." : "Tag updated.");
      return;
    }

    setSaving(false);
    const message = apiErrorMessage(result.error, "Tag could not be saved.");
    setFieldErrors((current) => ({
      ...current,
      ...fieldErrorsFromAPI(message),
    }));
  };

  const deleteTag = async () => {
    if (!tag || deletingTag) {
      return;
    }
    setDeletingTag(true);
    setDeleteErrorMessage(undefined);
    const result = await deleteLedgerTagById(tag.tag_id);
    if (!panelSessionActiveRef.current) {
      return;
    }
    if (result.data !== undefined || !result.error) {
      await refreshTagsAfterMutation();
      onClose();
      onNotice("Tag deleted.");
      return;
    }
    setDeletingTag(false);
    setDeleteErrorMessage(
      apiErrorMessage(result.error, "Tag could not be deleted."),
    );
  };

  const title = mode === "create" ? "Create tag" : "Edit tag";

  return (
    <aside
      ref={panelRef}
      role="dialog"
      aria-labelledby="tags-side-panel-title"
      className="bg-card fixed top-4 right-4 bottom-4 z-50 flex w-[min(520px,calc(100vw-2rem))] max-w-full flex-col border-2 border-[var(--border-ink)] shadow-[var(--shadow-pixel)]"
      data-testid="tags-side-panel"
      tabIndex={-1}
    >
      <div className="bg-card sticky top-0 z-10 flex items-start justify-between gap-3 border-b-2 border-[var(--border-ink)] p-4">
        <div className="min-w-0">
          <p className="font-heading text-muted-foreground text-xs font-semibold uppercase">
            Tags
          </p>
          <h2 id="tags-side-panel-title" className="text-pixel text-base">
            {title}
          </h2>
        </div>
        <Tooltip label="Close tag panel" asChild>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Close tag panel"
            disabled={saving}
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
          <Field htmlFor="tag-fqn" label="FQN">
            <input
              id="tag-fqn"
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
            {mode === "edit" && tag ? (
              <Button
                ref={tagDeleteButtonRef}
                type="button"
                variant="destructive"
                onClick={() => {
                  setDeleteErrorMessage(undefined);
                  setTagDeleteOpen(true);
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

      {tagDeleteOpen && tag ? (
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-[color-mix(in_srgb,var(--frame),transparent_18%)] p-4"
          role="presentation"
        >
          <section
            ref={dialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-tag-title"
            aria-describedby="delete-tag-description"
            className="bg-card w-[min(480px,100%)] border-2 border-[var(--border-ink)] p-4 shadow-[var(--shadow-pixel)]"
            tabIndex={-1}
          >
            <h3
              id="delete-tag-title"
              className="font-heading text-base font-bold uppercase"
            >
              Delete tag
            </h3>
            <div
              id="delete-tag-description"
              className="font-body text-muted-foreground mt-3 space-y-2 text-sm"
            >
              <p className="flex flex-wrap items-center gap-1">
                <span>Delete</span>
                <span className="text-foreground font-mono font-medium break-all">
                  {tag.fqn}
                </span>
                <span>?</span>
              </p>
              <p>
                This tombstones the tag and removes it from default tag lists
                and pickers.
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
                disabled={deletingTag}
                onClick={closeTagDelete}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deletingTag}
                onClick={() => {
                  void deleteTag();
                }}
              >
                <Trash aria-hidden="true" />
                {deletingTag ? "Deleting" : "Delete tag"}
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </aside>
  );
};

export const TagsSidePanel = (props: TagsSidePanelProps) => {
  if (!props.open) {
    return null;
  }

  return (
    <TagsSidePanelContent
      key={`${props.mode}:${props.tag?.tag_id ?? "new"}`}
      mode={props.mode}
      onClose={props.onClose}
      onNotice={props.onNotice}
      tag={props.tag}
    />
  );
};
