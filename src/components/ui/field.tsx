import * as React from "react"
import { cn } from "@/lib/utils"

const Field = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    orientation?: "horizontal" | "vertical"
  }
>(({ className, orientation = "vertical", ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-slot="field"
      className={cn(
        "flex",
        orientation === "vertical" ? "flex-col gap-2" : "flex-row items-center gap-2",
        className
      )}
      {...props}
    />
  )
})
Field.displayName = "Field"

const FieldGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-slot="field-group"
      className={cn("flex flex-col gap-4", className)}
      {...props}
    />
  )
})
FieldGroup.displayName = "FieldGroup"

const FieldLabel = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => {
  return (
    <label
      ref={ref}
      data-slot="field-label"
      className={cn(
        "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className
      )}
      {...props}
    />
  )
})
FieldLabel.displayName = "FieldLabel"

const FieldDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => {
  return (
    <p
      ref={ref}
      data-slot="field-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
})
FieldDescription.displayName = "FieldDescription"

const FieldError = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement> & {
    errors?: Array<{ message?: string } | undefined>
  }
>(({ className, errors, ...props }, ref) => {
  if (!errors || errors.length === 0) return null

  return (
    <p
      ref={ref}
      data-slot="field-error"
      className={cn("text-sm font-medium text-destructive", className)}
      {...props}
    >
      {errors[0]?.message}
    </p>
  )
})
FieldError.displayName = "FieldError"

export { Field, FieldGroup, FieldLabel, FieldDescription, FieldError }

