"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

type NoteRecord = {
  id?: string;
  body?: string | null;
  bodyText?: string | null;
  dateAdded?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
  userId?: string | null;
  contactId?: string | null;
};

type NotesRow = {
  monday_item_id: string;
  ghl_name: string | null;
  call_center: string | null;
  status: string | null;
  subagent_match_mode: string | null;
  subagent_name: string | null;
  subagent_account_id: string | null;
  contact_name: string | null;
  contact_id: string | null;
  notes_count: number | null;
  latest_note_id: string | null;
  latest_note_summary: NoteRecord | null;
  notes: NoteRecord[] | null;
  notes_payload: unknown;
  notes_error: string | null;
  fetched_at: string | null;
  updated_at: string | null;
};

interface ContactNotesPanelProps {
  submissionId: string;
  className?: string;
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) return "Unknown date";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function getNoteText(note: NoteRecord) {
  const text =
    typeof note.bodyText === "string" && note.bodyText.trim().length > 0
      ? note.bodyText
      : typeof note.body === "string" && note.body.trim().length > 0
        ? note.body
        : "";
  return text || "Empty note";
}

function normalizeNoteText(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function getStatusLabel(status: string | null) {
  if (!status) return "Unknown";
  if (status === "notes_fetched") return "Notes Fetched";
  if (status === "contact_not_found") return "Contact Not Found";
  if (status === "subagent_not_found") return "Subagent Not Found";
  if (status === "notes_fetch_failed") return "Notes Fetch Failed";
  return status.replace(/_/g, " ");
}

function getStatusVariant(status: string | null): "default" | "secondary" | "destructive" | "outline" {
  if (status === "notes_fetched") return "default";
  if (status === "contact_not_found" || status === "subagent_not_found" || status === "notes_fetch_failed") {
    return "destructive";
  }
  return "outline";
}

function dedupeNotes(notes: NoteRecord[]) {
  const sorted = [...notes].sort((a, b) => {
    const aTime = Date.parse(a.dateAdded || a.updatedAt || a.createdAt || "") || 0;
    const bTime = Date.parse(b.dateAdded || b.updatedAt || b.createdAt || "") || 0;
    return bTime - aTime;
  });
  const seen = new Set<string>();
  const unique: NoteRecord[] = [];

  for (const note of sorted) {
    const key = normalizeNoteText(getNoteText(note));
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(note);
  }

  return unique;
}

export function ContactNotesPanel({ submissionId, className }: ContactNotesPanelProps) {
  const [row, setRow] = useState<NotesRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/monday-deal-contact-notes?mondayItemId=${encodeURIComponent(submissionId)}`);
        const payload = (await response.json()) as { row?: NotesRow | null; error?: string };

        if (cancelled) return;

        if (!response.ok) {
          if (response.status === 404) {
            setRow(null);
            return;
          }
          throw new Error(payload.error || "Failed to load contact notes");
        }

        setRow(payload.row ?? null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load contact notes");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (!submissionId) {
      setLoading(false);
      setRow(null);
      return;
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [submissionId]);

  const notes = useMemo(() => {
    return dedupeNotes(Array.isArray(row?.notes) ? row.notes : []);
  }, [row]);

  if (loading) {
    return <div className={className}>Loading contact notes...</div>;
  }

  if (error) {
    return <div className={`${className ?? ""} text-sm text-red-600`}>{error}</div>;
  }

  if (!row) {
    return <div className={`${className ?? ""} text-sm text-muted-foreground`}>No contact notes record found for this deal.</div>;
  }

  return (
    <div className={className}>
      <div className="rounded-md border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">GHL Contact Notes</div>
            <div className="text-sm text-muted-foreground">
              {row.contact_name || row.ghl_name || "Unknown contact"}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={getStatusVariant(row.status)}>{getStatusLabel(row.status)}</Badge>
            <Badge variant="outline">{notes.length} notes</Badge>
          </div>
        </div>

        <Separator className="my-3" />

        <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
          <div>Call Center: {row.call_center || "—"}</div>
          <div>Subagent: {row.subagent_name || "—"}</div>
          <div>Account ID: {row.subagent_account_id || "—"}</div>
          <div>Fetched: {formatTimestamp(row.fetched_at)}</div>
        </div>

        {row.status !== "notes_fetched" ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {row.status === "contact_not_found" && "Contact lookup did not resolve for this lead and account."}
            {row.status === "subagent_not_found" && "Call center did not map to a subagent account."}
            {row.status === "notes_fetch_failed" && (row.notes_error || "Notes API request failed.")}
            {!row.status && "No contact note status is available for this lead."}
          </div>
        ) : notes.length === 0 ? (
          <div className="mt-4 text-sm text-muted-foreground">No notes returned for this contact.</div>
        ) : (
          <ScrollArea className="mt-4 h-[32rem] pr-4">
            <div className="space-y-3">
              {notes.map((note, index) => (
                <div key={`${note.id ?? "note"}-${note.dateAdded ?? note.updatedAt ?? index}`} className="rounded-md border p-3">
                  <div className="text-sm font-medium">
                    {formatTimestamp(note.dateAdded || note.updatedAt || note.createdAt)}
                  </div>
                  <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">
                    {getNoteText(note)}
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
