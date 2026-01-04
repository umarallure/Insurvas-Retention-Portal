"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, Loader2 } from "lucide-react";

import type { Disposition, AgentType } from "@/lib/dispositions/types";
import { DISPOSITION_METADATA, getDispositionMetadata } from "@/lib/dispositions/rules";
import { saveDisposition, validateDispositionRequest } from "@/lib/dispositions/actions";
import { validateDispositionForm } from "@/lib/dispositions/validation";

type QuickDispositionModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: number | null;
  mondayItemId?: string;
  policyNumber?: string;
  policyStatus?: string;
  ghlStage?: string;
  agentId: string;
  agentName: string;
  agentType: AgentType;
  onSuccess?: () => void;
};

export function QuickDispositionModal({
  open,
  onOpenChange,
  dealId,
  mondayItemId,
  policyNumber,
  policyStatus,
  ghlStage,
  agentId,
  agentName,
  agentType,
  onSuccess,
}: QuickDispositionModalProps) {
  const { toast } = useToast();
  const [selectedDisposition, setSelectedDisposition] = React.useState<Disposition | "">("");
  const [notes, setNotes] = React.useState("");
  const [callbackDatetime, setCallbackDatetime] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const allDispositions = React.useMemo(() => {
    return Object.keys(DISPOSITION_METADATA)
      .sort((a, b) => a.localeCompare(b))
      .map((d) => d as Disposition);
  }, []);

  // Get metadata for selected disposition
  const dispositionMetadata = React.useMemo(() => {
    if (!selectedDisposition) return null;
    return getDispositionMetadata(selectedDisposition);
  }, [selectedDisposition]);

  // Reset form when modal closes
  React.useEffect(() => {
    if (!open) {
      setSelectedDisposition("");
      setNotes("");
      setCallbackDatetime("");
    }
  }, [open]);

  const handleSave = async () => {
    if (!dealId || !selectedDisposition) {
      toast({
        title: "Error",
        description: "Please select a disposition",
        variant: "destructive",
      });
      return;
    }

    // Validate form
    const formValidation = validateDispositionForm(
      selectedDisposition,
      notes,
      callbackDatetime
    );

    if (!formValidation.valid) {
      toast({
        title: "Validation Error",
        description: formValidation.error,
        variant: "destructive",
      });
      return;
    }

    // Show warnings if any
    if (formValidation.warnings && formValidation.warnings.length > 0) {
      toast({
        title: "Warning",
        description: formValidation.warnings.join(", "),
      });
    }

    setSaving(true);

    try {
      // Validate request
      const validation = await validateDispositionRequest({
        dealId,
        mondayItemId,
        policyNumber,
        disposition: selectedDisposition,
        notes: notes.trim() || undefined,
        callbackDatetime: callbackDatetime.trim() || undefined,
        agentId,
        agentName,
        agentType,
        policyStatus,
        ghlStage,
      });

      if (!validation.valid) {
        toast({
          title: "Validation Error",
          description: validation.error,
          variant: "destructive",
        });
        setSaving(false);
        return;
      }

      // Save disposition
      const result = await saveDisposition({
        dealId,
        mondayItemId,
        policyNumber,
        disposition: selectedDisposition,
        notes: notes.trim() || undefined,
        callbackDatetime: callbackDatetime.trim() || undefined,
        agentId,
        agentName,
        agentType,
        policyStatus,
        ghlStage,
      });

      if (result.success) {
        toast({
          title: "Success",
          description: `Disposition "${selectedDisposition}" saved successfully`,
        });

        // Show GHL action info if applicable
        if (result.ghlAction && result.ghlAction.type !== "no_action") {
          toast({
            title: "GHL Action Queued",
            description: `Action: ${result.ghlAction.type}`,
          });
        }

        onOpenChange(false);
        onSuccess?.();
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to save disposition",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error saving disposition:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Quick Disposition</DialogTitle>
          <DialogDescription>
            Set disposition for policy {policyNumber || "—"}
            {policyStatus && ` (${policyStatus})`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Disposition Dropdown */}
          <div className="space-y-2">
            <Label htmlFor="disposition">Disposition *</Label>
            <Select
              value={selectedDisposition}
              onValueChange={(value) => setSelectedDisposition(value as Disposition)}
            >
              <SelectTrigger id="disposition">
                <SelectValue placeholder="Select disposition..." />
              </SelectTrigger>
              <SelectContent>
                {allDispositions.map((disp) => {
                  const meta = getDispositionMetadata(disp);
                  return (
                    <SelectItem key={disp} value={disp}>
                      <div className="flex items-center gap-2">
                        <span>{meta.label}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {dispositionMetadata?.description && (
              <p className="text-xs text-muted-foreground">
                {dispositionMetadata.description}
              </p>
            )}
          </div>

          {/* Callback Datetime (conditional) */}
          {dispositionMetadata?.requiresCallback && (
            <div className="space-y-2">
              <Label htmlFor="callback">Callback Date & Time *</Label>
              <Input
                id="callback"
                type="datetime-local"
                value={callbackDatetime}
                onChange={(e) => setCallbackDatetime(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Select the date and time for the callback
              </p>
            </div>
          )}

          {/* Notes (optional, but shown for certain dispositions) */}
          {selectedDisposition && (
            <div className="space-y-2">
              <Label htmlFor="notes">
                Notes {dispositionMetadata?.requiresNotes && "*"}
              </Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any additional notes..."
                className="min-h-[100px]"
                required={dispositionMetadata?.requiresNotes}
              />
            </div>
          )}

          {/* Warning for GHL-affecting dispositions */}
          {dispositionMetadata?.affectsGHL && (
            <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3">
              <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5" />
              <div className="text-sm text-blue-900">
                <p className="font-medium">This disposition will affect GHL</p>
                <p className="text-xs mt-1">
                  Changes will be synced to GoHighLevel automatically
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!selectedDisposition || saving}
            className="flex-1"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Disposition"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
