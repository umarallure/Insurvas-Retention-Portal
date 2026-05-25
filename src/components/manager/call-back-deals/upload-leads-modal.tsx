"use client";

import React from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Loader2, Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";

type UploadLeadsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted?: () => void;
};

type UploadResult = {
  ok: boolean;
  inserted: number;
  skipped: number;
  errors: string[];
} | null;

const EXPECTED_COLUMNS = ["NAME", "LAST NAME", "PHONE", "MED ID"];

export function UploadLeadsModal(props: UploadLeadsModalProps) {
  const { open, onOpenChange, onCompleted } = props;
  const { toast } = useToast();
  const toastRef = React.useRef(toast);
  React.useEffect(() => { toastRef.current = toast; }, [toast]);

  const [file, setFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [result, setResult] = React.useState<UploadResult>(null);

  const reset = React.useCallback(() => {
    setFile(null);
    setUploading(false);
    setResult(null);
  }, []);

  React.useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setResult(null);

    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          const base64Data = result.split(",")[1] ?? result;
          resolve(base64Data);
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      });

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const res = await fetch("/api/call-back-deals/upload-leads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ file: base64, fileName: file.name }),
      });

      const data = await res.json() as UploadResult & { error?: string };
      if (!res.ok || data?.error) {
        throw new Error(data?.error ?? "Upload failed");
      }

      setResult(data);

      toastRef.current({
        title: "Upload complete",
        description: `Inserted ${data?.inserted} leads, skipped ${data?.skipped}`,
      });
    } catch (error) {
      toastRef.current({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const canUpload = file && !uploading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Upload Leads</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="text-sm text-muted-foreground">
            Upload an Excel (.xlsx) or CSV file with leads to import into the call back deals table.
            Leads will be set to stage <strong>&quot;Internal-Leads-Never-Called&quot;</strong> and left unassigned.
          </div>

          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-sm font-medium mb-2">Expected columns:</div>
            <div className="flex flex-wrap gap-2">
              {EXPECTED_COLUMNS.map((col) => (
                <span key={col} className="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                  {col}
                </span>
              ))}
            </div>
          </div>

          <div className="border-2 border-dashed rounded-md p-6 text-center cursor-pointer hover:bg-muted/20 transition-colors" onClick={() => document.getElementById("upload-file-input")?.click()}>
            <input
              id="upload-file-input"
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setFile(f);
              }}
            />
            {file ? (
              <div className="flex items-center justify-center gap-2">
                <FileSpreadsheet className="h-8 w-8 text-primary" />
                <div className="text-left">
                  <div className="text-sm font-medium">{file.name}</div>
                  <div className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <div className="text-sm font-medium">Click to select a file</div>
                <div className="text-xs text-muted-foreground">.xlsx, .xls, or .csv</div>
              </div>
            )}
          </div>

          {result && (
            <div className={`rounded-md border p-3 ${result.ok ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
              <div className="flex items-center gap-2 text-sm font-medium">
                {result.ok ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-600" />
                )}
                {result.ok ? "Upload successful" : "Upload failed"}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Inserted: {result.inserted} • Skipped: {result.skipped}
              </div>
              {result.errors.length > 0 && (
                <div className="mt-2 max-h-24 overflow-auto text-xs text-red-600 space-y-0.5">
                  {result.errors.slice(0, 20).map((err, idx) => (
                    <div key={idx}>{err}</div>
                  ))}
                  {result.errors.length > 20 && <div>...and {result.errors.length - 20} more</div>}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>
            Close
          </Button>
          <Button onClick={handleUpload} disabled={!canUpload}>
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            {uploading ? "Uploading..." : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}