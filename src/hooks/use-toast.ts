import { toast as toastifyToast, ToastOptions, Slide } from "react-toastify";

export type ToastVariant = "default" | "destructive" | "success";

interface ToastArgs {
  title?: string;
  description?: string;
  variant?: ToastVariant;
}

/**
 * Simple hook-compatible API that matches the Agents portal `use-toast` shape
 * enough for our current usage: `const { toast } = useToast(); toast({ ... })`.
 */
export function useToast() {
  function toast({ title, description, variant = "default" }: ToastArgs) {
    const message = description ?? title ?? "";
    const combined = title && description ? `${title} — ${description}` : message;

    const options: ToastOptions = {
      type:
        variant === "destructive"
          ? "error"
          : variant === "success"
          ? "success"
          : "default",
      transition: Slide,
    };

    toastifyToast(combined, options);
  }

  return { toast };
}

// Convenience alias matching the old Agents Portal API surface
export const toast = toastifyToast;
