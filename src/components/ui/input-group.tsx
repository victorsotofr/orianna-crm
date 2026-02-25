import * as React from "react"
import { cn } from "@/lib/utils"

const InputGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-slot="input-group"
      className={cn("relative flex flex-col", className)}
      {...props}
    />
  )
})
InputGroup.displayName = "InputGroup"

const InputGroupAddon = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    align?: "block-start" | "block-end"
  }
>(({ className, align = "block-start", ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-slot="input-group-addon"
      className={cn(
        "pointer-events-none absolute inset-x-0 flex px-3",
        align === "block-start" ? "top-0 items-start pt-3" : "bottom-0 items-end pb-3",
        className
      )}
      {...props}
    />
  )
})
InputGroupAddon.displayName = "InputGroupAddon"

const InputGroupText = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => {
  return (
    <span
      ref={ref}
      data-slot="input-group-text"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
})
InputGroupText.displayName = "InputGroupText"

const InputGroupTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      data-slot="input-group-textarea"
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
})
InputGroupTextarea.displayName = "InputGroupTextarea"

export { InputGroup, InputGroupAddon, InputGroupText, InputGroupTextarea }

