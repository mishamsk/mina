import type { ReactNode } from "react";

interface ReferenceEntityDeleteDescriptionProps {
  readonly name: ReactNode;
  readonly noun: string;
}

export const ReferenceEntityDeleteDescription = ({
  name,
  noun,
}: ReferenceEntityDeleteDescriptionProps) => (
  <>
    <p className="flex flex-wrap items-center gap-1">
      <span>Delete</span>
      <span className="text-foreground font-mono break-all">{name}</span>
      <span>?</span>
    </p>
    <p>
      This tombstones the {noun} and removes it from default {noun} lists and
      pickers.
    </p>
  </>
);
