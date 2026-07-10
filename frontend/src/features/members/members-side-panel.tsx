import { Check, Close, Trash } from "pixelarticons/react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  createLedgerMember,
  type CreateMemberRequest,
  deleteLedgerMemberById,
  type Member,
  updateLedgerMember,
  type UpdateMemberRequest,
} from "@/api";
import { Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";

import { memberAPIErrorMessage } from "./member-api-error-message";
import { refreshMembersAfterMutation } from "./use-members-resource";

type MemberFormField = "general" | "name";
type MemberFormErrors = Partial<Record<MemberFormField, string>>;

interface MemberFormState {
  readonly name: string;
}

interface MembersSidePanelProps {
  readonly member: Member | undefined;
  readonly mode: "create" | "edit";
  readonly onClose: () => void;
  readonly onNotice: (message: string) => void;
  readonly open: boolean;
}

const focusableSelector =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

const blankForm = (): MemberFormState => ({
  name: "",
});

const formFromMember = (member: Member | undefined): MemberFormState =>
  member
    ? {
        name: member.name,
      }
    : blankForm();

const fieldErrorsFromAPI = (message: string): MemberFormErrors => {
  const lower = message.toLowerCase();
  if (lower.includes("name")) {
    return { name: message };
  }
  return { general: message };
};

const hasErrors = (errors: MemberFormErrors): boolean =>
  Object.values(errors).some(Boolean);

const validateForm = (form: MemberFormState): MemberFormErrors => {
  const errors: MemberFormErrors = {};
  if (!form.name.trim()) {
    errors.name = "Name is required.";
  }
  return errors;
};

const validateFormField = (
  form: MemberFormState,
  field: MemberFormField,
): string | undefined => validateForm(form)[field];

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

const MembersSidePanelContent = ({
  member,
  mode,
  onClose,
  onNotice,
}: Omit<MembersSidePanelProps, "open">) => {
  const panelRef = useRef<HTMLElement | null>(null);
  const panelSessionActiveRef = useRef(true);
  const memberDeleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const cancelDeleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const [form, setForm] = useState<MemberFormState>(() =>
    mode === "create" ? blankForm() : formFromMember(member),
  );
  const [fieldErrors, setFieldErrors] = useState<MemberFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [memberDeleteOpen, setMemberDeleteOpen] = useState(false);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<
    string | undefined
  >();
  const [deletingMember, setDeletingMember] = useState(false);

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
  }, [member?.member_id, mode]);

  const closeMemberDelete = useCallback(() => {
    if (!deletingMember) {
      setMemberDeleteOpen(false);
      setDeleteErrorMessage(undefined);
      window.requestAnimationFrame(() => {
        memberDeleteButtonRef.current?.focus({ preventScroll: true });
      });
    }
  }, [deletingMember]);

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
        if (memberDeleteOpen) {
          closeMemberDelete();
        } else if (saving) {
          return;
        } else {
          onClose();
        }
        return;
      }

      if (event.key !== "Tab" || !memberDeleteOpen) {
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
  }, [closeMemberDelete, memberDeleteOpen, onClose, saving]);

  useEffect(() => {
    if (!memberDeleteOpen) {
      return;
    }
    window.requestAnimationFrame(() => {
      cancelDeleteButtonRef.current?.focus({ preventScroll: true });
    });
  }, [memberDeleteOpen]);

  const updateForm = (patch: Partial<MemberFormState>) => {
    setForm((current) => ({ ...current, ...patch }));
  };

  const setFieldError = (
    field: MemberFormField,
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

    const nextErrors = validateForm(form);
    setFieldErrors(nextErrors);
    if (hasErrors(nextErrors)) {
      return;
    }

    const normalizedName = form.name.trim();
    setSaving(true);
    const result =
      mode === "create"
        ? await createLedgerMember({
            name: normalizedName,
          } satisfies CreateMemberRequest)
        : member
          ? await updateLedgerMember(member.member_id, {
              name: normalizedName,
            } satisfies UpdateMemberRequest)
          : undefined;
    if (!result) {
      if (!panelSessionActiveRef.current) {
        return;
      }
      setSaving(false);
      return;
    }

    if (result.data) {
      await refreshMembersAfterMutation({
        invalidateTransactions: mode === "edit",
      });
      if (!panelSessionActiveRef.current) {
        return;
      }
      onClose();
      onNotice(mode === "create" ? "Member created." : "Member updated.");
      return;
    }

    setSaving(false);
    const message = memberAPIErrorMessage(
      result.error,
      "Member could not be saved.",
    );
    setFieldErrors((current) => ({
      ...current,
      ...fieldErrorsFromAPI(message),
    }));
  };

  const deleteMember = async () => {
    if (!member || deletingMember) {
      return;
    }
    setDeletingMember(true);
    setDeleteErrorMessage(undefined);
    const result = await deleteLedgerMemberById(member.member_id);
    if (!panelSessionActiveRef.current) {
      return;
    }
    if (result.data !== undefined || !result.error) {
      await refreshMembersAfterMutation();
      onClose();
      onNotice("Member deleted.");
      return;
    }
    setDeletingMember(false);
    setDeleteErrorMessage(
      memberAPIErrorMessage(result.error, "Member could not be deleted."),
    );
  };

  const title = mode === "create" ? "Create member" : "Edit member";

  return (
    <aside
      ref={panelRef}
      role="dialog"
      aria-labelledby="members-side-panel-title"
      className="bg-card fixed top-4 right-4 bottom-4 z-50 flex w-[min(520px,calc(100vw-2rem))] max-w-full flex-col border-2 border-[var(--border-ink)] shadow-[var(--shadow-pixel)]"
      data-testid="members-side-panel"
      tabIndex={-1}
    >
      <div className="bg-card sticky top-0 z-10 flex items-start justify-between gap-3 border-b-2 border-[var(--border-ink)] p-4">
        <div className="min-w-0">
          <p className="font-heading text-muted-foreground text-xs font-semibold uppercase">
            Members
          </p>
          <h2 id="members-side-panel-title" className="text-pixel text-base">
            {title}
          </h2>
        </div>
        <Tooltip label="Close member panel" asChild>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Close member panel"
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
          <Field htmlFor="member-name" label="Name">
            <input
              id="member-name"
              className="bg-card h-9 border-2 border-[var(--border-ink)] px-2 font-mono text-sm shadow-[var(--shadow-pixel)]"
              value={form.name}
              onBlur={() => {
                setFieldError("name", validateFormField(form, "name"));
              }}
              onChange={(event) => {
                updateForm({ name: event.target.value });
                setFieldError("name", undefined);
              }}
            />
            <FieldError message={fieldErrors.name} />
          </Field>

          {fieldErrors.general ? (
            <p
              role="alert"
              className="border-destructive text-destructive border-2 p-2 text-sm"
            >
              {fieldErrors.general}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 border-t-2 border-[var(--border-ink)] pt-4">
            {mode === "edit" && member ? (
              <Tooltip
                label={
                  member.deletable !== true
                    ? "Member has attributed records."
                    : "Delete member"
                }
                asChild
              >
                <Button
                  ref={memberDeleteButtonRef}
                  type="button"
                  variant="destructive"
                  aria-disabled={member.deletable !== true ? "true" : undefined}
                  className="aria-disabled:bg-card aria-disabled:text-muted-foreground aria-disabled:border-muted-foreground aria-disabled:cursor-not-allowed aria-disabled:shadow-none"
                  onClick={() => {
                    if (member.deletable !== true) {
                      return;
                    }
                    setDeleteErrorMessage(undefined);
                    setMemberDeleteOpen(true);
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

      {memberDeleteOpen && member ? (
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-[color-mix(in_srgb,var(--frame),transparent_18%)] p-4"
          role="presentation"
        >
          <section
            ref={dialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-member-title"
            aria-describedby="delete-member-description"
            className="bg-card w-[min(480px,100%)] border-2 border-[var(--border-ink)] p-4 shadow-[var(--shadow-pixel)]"
            tabIndex={-1}
          >
            <h3
              id="delete-member-title"
              className="font-heading text-base font-bold uppercase"
            >
              Delete member
            </h3>
            <div
              id="delete-member-description"
              className="font-body text-muted-foreground mt-3 space-y-2 text-sm"
            >
              <p className="flex flex-wrap items-center gap-1">
                <span>Delete</span>
                <span className="text-foreground font-mono font-medium break-all">
                  {member.name}
                </span>
                <span>?</span>
              </p>
              <p>
                This tombstones the member and removes it from default member
                lists and pickers.
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
                disabled={deletingMember}
                onClick={closeMemberDelete}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deletingMember}
                onClick={() => {
                  void deleteMember();
                }}
              >
                <Trash aria-hidden="true" />
                {deletingMember ? "Deleting" : "Delete member"}
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </aside>
  );
};

export const MembersSidePanel = (props: MembersSidePanelProps) => {
  if (!props.open) {
    return null;
  }

  return (
    <MembersSidePanelContent
      key={`${props.mode}:${props.member?.member_id ?? "new"}`}
      member={props.member}
      mode={props.mode}
      onClose={props.onClose}
      onNotice={props.onNotice}
    />
  );
};
