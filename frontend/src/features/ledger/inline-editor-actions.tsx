import { Check, Close } from "pixelarticons/react";
import type { Ref } from "react";

import { Button } from "@/components/ui/button";

export const InlineEditorActions = ({
  disabled = false,
  fieldLabel,
  onCancel,
  onSave,
  saveButtonRef,
  saveDisabled = false,
}: {
  readonly disabled?: boolean;
  readonly fieldLabel: string;
  readonly onCancel: () => void;
  readonly onSave: () => void;
  readonly saveButtonRef?: Ref<HTMLButtonElement>;
  readonly saveDisabled?: boolean;
}) => (
  <div className="flex flex-wrap gap-2">
    <Button
      type="button"
      size="sm"
      className="gap-0.5 px-1"
      aria-label={`Save ${fieldLabel}`}
      disabled={disabled || saveDisabled}
      onClick={onSave}
      ref={saveButtonRef}
    >
      <Check aria-hidden="true" className="size-4" />
      Save
    </Button>
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="gap-0.5 px-1"
      aria-label={`Cancel ${fieldLabel} edit`}
      disabled={disabled}
      onClick={onCancel}
    >
      <Close aria-hidden="true" className="size-4" />
      Cancel
    </Button>
  </div>
);
