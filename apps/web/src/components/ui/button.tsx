import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-all select-none disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 [&_svg]:shrink-0 active:scale-[.98]",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-fg shadow-sm hover:opacity-90",
        secondary: "bg-surface text-fg border border-border shadow-card hover:bg-hover",
        ghost: "text-muted hover:bg-hover hover:text-fg",
        subtle: "bg-surface-2 text-fg hover:bg-hover",
        accent: "bg-accent text-white shadow-sm hover:opacity-90",
        danger: "bg-rose-600 text-white hover:bg-rose-700",
      },
      size: {
        xs: "h-6 px-2 text-xs [&_svg]:size-3.5",
        sm: "h-7 px-2.5 text-[13px] [&_svg]:size-3.5",
        md: "h-8 px-3 text-[13px] [&_svg]:size-4",
        lg: "h-10 px-4 text-sm [&_svg]:size-4",
        icon: "size-8 [&_svg]:size-4",
        "icon-sm": "size-7 [&_svg]:size-3.5",
        "icon-xs": "size-6 rounded-md [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, type = "button", ...props }, ref) => (
  <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
));
Button.displayName = "Button";
