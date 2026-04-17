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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";

type Disposition =
  | "Busy"
  | "No Answer"
  | "Answering Machine"
  | "Wrong Number"
  | "Do Not Call"
  | "On Hold"
  | "hangup"
  | "callback"
  | "sale"
  | " DQ";

const DISPOSITION_OPTIONS: Array<{ value: Disposition; label: string }> = [
  { value: "Busy", label: "Busy" },
  { value: "No Answer", label: "No Answer" },
  { value: "Answering Machine", label: "Answering Machine" },
  { value: "Wrong Number", label: "Wrong Number" },
  { value: "Do Not Call", label: "Do Not Call" },
  { value: "On Hold", label: "On Hold" },
  { value: "hangup", label: "Hung Up" },
  { value: "callback", label: "Callback" },
  { value: "sale", label: "Sale" },
  { value: " DQ", label: " DQ" },
];

type CallBackQuickDispositionModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submissionId: string;
  clientName: string | null;
  phoneNumber: string | null;
  agentName: string;
  onSuccess?: () => void;
};

export function CallBackQuickDispositionModal({
  open,
  onOpenChange,
  submissionId,
  clientName,
  phoneNumber,
  agentName,
  onSuccess,
}: CallBackQuickDispositionModalProps) {
  const { toast } = useToast();
  const [selectedDisposition, setSelectedDisposition] = React.useState<Disposition | "">("");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const handleSave = async () => {
    if (!selectedDisposition) {
      toast({
        title: "Error",
        description: "Please select a disposition",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    try {
      const today = new Date().toISOString().split("T")[0];

      const { error } = await supabase.from("retention_deal_flow").insert({
        submission_id: submissionId,
        client_phone_number: phoneNumber || null,
        insured_name: clientName || null,
        date: today,
        retention_agent: agentName,
        notes: notes.trim() || null,
        status: selectedDisposition,
        call_result: selectedDisposition,
        from_callback: true,
        is_retention_call: true,
        updated_at: new Date().toISOString(),
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: `Disposition "${selectedDisposition}" saved successfully`,
      });

      onOpenChange(false);
      setSelectedDisposition("");
      setNotes("");
      onSuccess?.();
    } catch (error) {
      console.error("Error saving disposition:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save disposition",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  React.useEffect(() => {
    if (!open) {
      setSelectedDisposition("");
      setNotes("");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Quick Disposition</DialogTitle>
          <DialogDescription>
            Record disposition for {clientName || "this lead"} - {phoneNumber || "no phone"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-3">
            <Label>Disposition *</Label>
            <div className="grid grid-cols-2 gap-2">
              {DISPOSITION_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center space-x-2 rounded-md border px-3 py-2 cursor-pointer hover:bg-muted/50 ${
                    selectedDisposition === opt.value ? "bg-muted border-primary" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="disposition"
                    value={opt.value}
                    checked={selectedDisposition === opt.value}
                    onChange={(e) => setSelectedDisposition(e.target.value as Disposition)}
                    className="accent-primary"
                  />
                  <span className="flex-1 text-sm">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes..."
              className="min-h-[100px]"
            />
          </div>
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
