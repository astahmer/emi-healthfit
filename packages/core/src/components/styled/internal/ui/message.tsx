import * as React from "react";

import { cn } from "./utils.ts";

type MessageSurfaceProps = React.ComponentProps<"div">;

export const Message = ({
  className,
  align = "start",
  ...props
}: MessageSurfaceProps & { align?: "start" | "end" }) => (
  <div
    data-slot="message"
    data-align={align}
    className={cn(
      "group/message relative flex w-full min-w-0 gap-2 text-sm data-[align=end]:flex-row-reverse",
      className,
    )}
    {...props}
  />
);

export const MessageContent = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    data-slot="message-content"
    className={cn(
      "flex w-full min-w-0 flex-col gap-2.5 wrap-break-word group-data-[align=end]/message:*:data-slot:self-end",
      className,
    )}
    {...props}
  />
);

export const MessageFooter = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    data-slot="message-footer"
    className={cn(
      "flex max-w-full min-w-0 items-center px-3 text-xs text-muted-foreground group-data-[align=end]/message:justify-end",
      className,
    )}
    {...props}
  />
);
