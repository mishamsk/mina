import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "group/badge font-heading inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden border border-[var(--border-ink)] px-2 py-0.5 text-[11px] leading-none font-semibold whitespace-nowrap uppercase shadow-[var(--shadow-chip)] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/90",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/90",
        destructive:
          "bg-destructive text-destructive-foreground [a]:hover:bg-destructive/90",
        outline:
          "bg-card text-foreground [a]:hover:bg-muted [a]:hover:text-foreground",
        ghost:
          "border-transparent bg-transparent text-muted-foreground [a]:hover:bg-muted [a]:hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
