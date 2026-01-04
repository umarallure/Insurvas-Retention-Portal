"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { ListChecks } from "lucide-react";

type QuickDispositionButtonProps = {
  onClick: () => void;
  disabled?: boolean;
};

export function QuickDispositionButton({
  onClick,
  disabled = false,
}: QuickDispositionButtonProps) {
  return (
    <Button
      type="button"
      variant="default"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className="gap-2"
    >
      <ListChecks className="h-4 w-4" />
      Quick Disposition
    </Button>
  );
}
