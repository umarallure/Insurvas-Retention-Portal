"use client";

import { useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

type CrmLeadNoteRow = {
  id: string;
  lead_id: string;
  body: string;
  created_at: string;
  created_by: string | null;
};

interface CrmLeadNotesPanelProps {
  policyId: string;
  className?: string;
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) return "Unknown date";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString();
}

export function CrmLeadNotesPanel({ policyId, className }: CrmLeadNotesPanelProps) {
  const [notes, setNotes] = useState<CrmLeadNoteRow[]>([]);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/crm-lead-notes?policyId=${encodeURIComponent(policyId)}`);
        const payload = await response.json() as { notes: CrmLeadNoteRow[]; lead_id: string | null; error?: string };

        if (cancelled) return;

        if (!response.ok) {
          throw new Error(payload.error || "Failed to load lead notes");
        }

        setNotes(payload.notes);
        setLeadId(payload.lead_id);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load lead notes");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (!policyId) {
      setLoading(false);
      setNotes([]);
      setLeadId(null);
      return;
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [policyId]);

  if (loading) {
    return (
      <div className={className}>
        <div className="rounded-md border p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading CRM lead notes...
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={className}>
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="rounded-md border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">CRM Lead Notes</div>
            <div className="text-sm text-muted-foreground">
              {leadId ? `Lead ID: ${leadId}` : "No lead found"}
            </div>
          </div>
          <Badge variant="outline">{notes.length} notes</Badge>
        </div>

        <Separator className="my-3" />

        {notes.length === 0 ? (
          <div className="text-sm text-muted-foreground">No notes found for this lead in CRM.</div>
        ) : (
          <ScrollArea className="h-[32rem] pr-4">
            <div className="space-y-3">
              {notes.map((note) => (
                <div key={note.id} className="rounded-md border p-3">
                  <div className="text-sm font-medium">
                    {formatTimestamp(note.created_at)}
                  </div>
                  <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">
                    {note.body}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}