import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const bubbleVariants = cva(
  "relative flex w-fit max-w-[85%] min-w-0 flex-col gap-1 data-[align=end]:self-end data-[variant=ghost]:max-w-full",
  {
    variants: {
      variant: {
        muted: "*:data-[slot=bubble-content]:bg-muted",
        ghost: "*:data-[slot=bubble-content]:bg-transparent *:data-[slot=bubble-content]:p-0",
        destructive:
          "*:data-[slot=bubble-content]:bg-destructive/10 *:data-[slot=bubble-content]:text-destructive",
      },
    },
    defaultVariants: { variant: "muted" },
  },
);

export const Bubble = ({
  variant,
  align = "start",
  className,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof bubbleVariants> & { align?: "start" | "end" }) => (
  <div
    data-slot="bubble"
    data-variant={variant}
    data-align={align}
    className={cn(bubbleVariants({ variant }), className)}
    {...props}
  />
);

export const BubbleContent = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    data-slot="bubble-content"
    className={cn(
      "w-fit max-w-full min-w-0 overflow-hidden rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap wrap-break-word",
      className,
    )}
    {...props}
  />
);
