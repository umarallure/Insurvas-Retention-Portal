"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface MultiSelectProps {
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  className?: string;
  showAllOption?: boolean;
  allOptionLabel?: string;
  disabled?: boolean;
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Select items...",
  className,
  showAllOption = false,
  allOptionLabel = "All",
  disabled = false,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);

  const handleToggle = (option: string) => {
    if (option === "__ALL__") {
      // Toggle "All" - if all are selected, clear; otherwise select all
      if (selected.length === options.length) {
        onChange([]);
      } else {
        onChange([...options]);
      }
    } else {
      if (selected.includes(option)) {
        onChange(selected.filter((s) => s !== option));
      } else {
        onChange([...selected, option]);
      }
    }
  };

  const isAllSelected = selected.length === options.length && options.length > 0;

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className={cn("w-full justify-between", className)}
          disabled={disabled}
        >
          <div className="flex flex-wrap gap-1 flex-1 min-w-0">
            {selected.length === 0 || (showAllOption && isAllSelected) ? (
              <span className="text-muted-foreground">
                {showAllOption && isAllSelected ? allOptionLabel : placeholder}
              </span>
            ) : selected.length <= 2 ? (
              selected.map((item) => (
                <Badge key={item} variant="secondary" className="mr-1">
                  {item}
                </Badge>
              ))
            ) : (
              <Badge variant="secondary">
                {selected.length} selected
              </Badge>
            )}
          </div>
          {selected.length > 0 && (
            <X
              className="ml-2 h-4 w-4 shrink-0 opacity-50 hover:opacity-100"
              onClick={handleClear}
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <div className="max-h-[300px] overflow-y-auto p-1">
          {options.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No options available.
            </div>
          ) : (
            <>
              {showAllOption && (
                <div
                  className="flex items-center space-x-2 p-2 hover:bg-accent rounded-sm cursor-pointer font-medium"
                  onClick={(e) => {
                    e.preventDefault();
                    handleToggle("__ALL__");
                  }}
                >
                  <Checkbox
                    checked={isAllSelected}
                    onCheckedChange={() => handleToggle("__ALL__")}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className="text-sm">{allOptionLabel}</span>
                </div>
              )}
              {showAllOption && options.length > 0 && (
                <div className="h-px bg-border my-1" />
              )}
              {options.map((option) => (
              <div
                key={option}
                className="flex items-center space-x-2 p-2 hover:bg-accent rounded-sm cursor-pointer"
                onClick={(e) => {
                  e.preventDefault();
                  handleToggle(option);
                }}
              >
                <Checkbox
                  checked={selected.includes(option)}
                  onCheckedChange={(checked) => {
                    if (checked !== selected.includes(option)) {
                      handleToggle(option);
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
                <span className="text-sm">{option}</span>
              </div>
              ))}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

