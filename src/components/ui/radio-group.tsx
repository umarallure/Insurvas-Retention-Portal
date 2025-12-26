import * as React from "react";

// Lightweight placeholders to satisfy imports if needed.
// Currently not used in this project, but kept for API compatibility.

type RadioGroupProps = React.HTMLAttributes<HTMLDivElement>;

const RadioGroup = React.forwardRef<HTMLDivElement, RadioGroupProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={className} {...props} />
  ),
);
RadioGroup.displayName = "RadioGroup";

type RadioGroupItemProps = React.InputHTMLAttributes<HTMLInputElement>;

const RadioGroupItem = React.forwardRef<HTMLInputElement, RadioGroupItemProps>(
  (props, ref) => <input ref={ref} type="radio" {...props} />,
);
RadioGroupItem.displayName = "RadioGroupItem";

export { RadioGroup, RadioGroupItem };
