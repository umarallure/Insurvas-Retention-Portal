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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
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

const REASON_OPTIONS = [
  "Busy",
  "Client not available",
  "Need to gather documents",
  "Need to verify information",
  "Waiting on carrier",
  "Need supervisor approval",
  "Schedule callback",
  "Other",
];

type CallBackQuickDispositionModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submissionId: string;
  clientName: string | null;
  phoneNumber: string | null;
  agentProfileId: string;
  onSuccess?: () => void;
};

export function CallBackQuickDispositionModal({
  open,
  onOpenChange,
  submissionId,
  clientName,
  phoneNumber,
  agentProfileId,
  onSuccess,
}: CallBackQuickDispositionModalProps) {
  const { toast } = useToast();
  const [selectedDisposition, setSelectedDisposition] = React.useState<Disposition | "">("");
  const [reason, setReason] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [callbackDatetime, setCallbackDatetime] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const showCallbackDatetime = selectedDisposition === "callback";

  const handleSave = async () => {
    if (!selectedDisposition) {
      toast({
        title: "Error",
        description: "Please select a disposition",
        variant: "destructive",
      });
      return;
    }

    if (!notes.trim()) {
      toast({
        title: "Error",
        description: "Please add notes",
        variant: "destructive",
      });
      return;
    }

    if (!reason) {
      toast({
        title: "Error",
        description: "Please select a reason",
        variant: "destructive",
      });
      return;
    }

    if (showCallbackDatetime && !callbackDatetime) {
      toast({
        title: "Error",
        description: "Please select a callback date and time",
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
        retention_agent: agentProfileId,
        notes: notes.trim() || null,
        status: selectedDisposition,
        call_result: selectedDisposition,
        from_callback: true,
        is_retention_call: true,
        updated_at: new Date().toISOString(),
      });

      if (error) throw error;

      if (showCallbackDatetime && callbackDatetime) {
        const estScheduled = new Date(new Date(callbackDatetime).getTime() - 4 * 60 * 60 * 1000);
        const { error: scheduleError } = await supabase.from("callback_schedule").insert({
          submission_id: submissionId,
          client_name: clientName || null,
          phone_number: phoneNumber || null,
          agent_profile_id: agentProfileId,
          scheduled_at: new Date(estScheduled).toISOString(),
          status: "scheduled",
        });

        if (scheduleError) {
          console.error("Error saving callback schedule:", scheduleError);
        }
      }

      toast({
        title: "Success",
        description: `Disposition "${selectedDisposition}" saved successfully`,
      });

      onOpenChange(false);
      setSelectedDisposition("");
      setReason("");
      setNotes("");
      setCallbackDatetime("");
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
      setReason("");
      setNotes("");
      setCallbackDatetime("");
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
            <Label htmlFor="reason">Reason *</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                {REASON_OPTIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes *</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes..."
              className="min-h-[100px]"
              required
            />
          </div>

          {showCallbackDatetime && (
            <div className="space-y-2">
              <Label htmlFor="callback">Callback Date & Time *</Label>
              <Input
                id="callback"
                type="datetime-local"
                value={callbackDatetime}
                onChange={(e) => setCallbackDatetime(e.target.value)}
                required
              />
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
            disabled={!selectedDisposition || !reason || !notes.trim() || saving}
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
