"use client";

import * as React from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Loader2, EditIcon } from "lucide-react";

type RetentionAgentRow = {
  id: string;
  profile_id: string;
  display_name: string | null;
  email: string | null;
  active: boolean;
  assigned_agency: string | null;
  created_at: string;
};

const AGENCY_OPTIONS = [
  "Heritage Insurance",
  "Safe Harbor Insurance",
  "Unlimited Insurance",
];

export default function UserManagementPage() {
  const { toast } = useToast();
  const toastRef = React.useRef(toast);
  React.useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const [agents, setAgents] = React.useState<RetentionAgentRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [editOpen, setEditOpen] = React.useState(false);
  const [editingAgent, setEditingAgent] = React.useState<RetentionAgentRow | null>(null);
  const [editAgency, setEditAgency] = React.useState<string>("");
  const [saving, setSaving] = React.useState(false);

  const loadAgents = React.useCallback(async () => {
    setLoading(true);
    try {
      const { data: raRows, error: raError } = await supabase
        .from("retention_agents")
        .select("id, profile_id, active, assigned_agency, created_at")
        .order("created_at", { ascending: false });

      if (raError) throw raError;

      const profileIds = (raRows ?? []).map((row) => row.profile_id as string);
      if (profileIds.length === 0) {
        setAgents([]);
        return;
      }

      const { data: profileRows, error: profilesError } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", profileIds);

      if (profilesError) throw profilesError;

      const profileMap = new Map<string, { display_name: string | null }>();
      for (const p of profileRows ?? []) {
        profileMap.set(p.id, { display_name: p.display_name });
      }

      const mapped: RetentionAgentRow[] = (raRows ?? []).map((ra) => {
        const profile = profileMap.get(ra.profile_id);
        return {
          id: ra.id,
          profile_id: ra.profile_id,
          display_name: profile?.display_name ?? null,
          email: null,
          active: ra.active,
          assigned_agency: ra.assigned_agency,
          created_at: ra.created_at,
        };
      });

      setAgents(mapped);
    } catch (error) {
      console.error("[user-management] loadAgents error", error);
      toastRef.current({
        title: "Failed to load",
        description: "Could not load agents.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  const openEditModal = (agent: RetentionAgentRow) => {
    setEditingAgent(agent);
    setEditAgency(agent.assigned_agency ?? "");
    setEditOpen(true);
  };

  const handleSaveAgency = async () => {
    if (!editingAgent) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("retention_agents")
        .update({ assigned_agency: editAgency || null })
        .eq("id", editingAgent.id);

      if (error) throw error;

      toastRef.current({
        title: "Updated",
        description: `Agency updated for ${editingAgent.display_name ?? "agent"}.`,
      });

      setEditOpen(false);
      setEditingAgent(null);
      await loadAgents();
    } catch (error) {
      console.error("[user-management] update error", error);
      toastRef.current({
        title: "Failed to update",
        description: "Could not update agency.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const filteredAgents = React.useMemo(() => {
    if (!search.trim()) return agents;
    const s = search.toLowerCase();
    return agents.filter(
      (a) =>
        (a.display_name ?? "").toLowerCase().includes(s),
    );
  }, [agents, search]);

  return (
    <div className="w-full px-8 py-10 min-h-screen bg-muted/20">
      <div className="mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>User Management</CardTitle>
            <CardDescription>Manage retention agents and their assigned agencies.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Input
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1"
              />
              <Button
                variant="outline"
                onClick={() => void loadAgents()}
                disabled={loading}
              >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Refresh
              </Button>
            </div>

            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Name</th>
                    <th className="text-left px-3 py-2 font-medium">Assigned Agency</th>
                    <th className="text-left px-3 py-2 font-medium">Status</th>
                    <th className="text-right px-3 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin inline mr-2" /> Loading...
                      </td>
                    </tr>
                  ) : filteredAgents.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-muted-foreground">
                        No agents found.
                      </td>
                    </tr>
                  ) : (
                    filteredAgents.map((agent) => (
                      <tr key={agent.id} className="border-t">
                        <td className="px-3 py-2 truncate max-w-[200px]">
                          {agent.display_name ?? "—"}
                        </td>
                        <td className="px-3 py-2 truncate max-w-[200px]">
                          {agent.assigned_agency ? (
                            <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                              {agent.assigned_agency}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">Not assigned</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {agent.active ? (
                            <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditModal(agent)}
                          >
                            <EditIcon className="h-4 w-4 mr-1" />
                            Edit Agency
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Assigned Agency</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {editingAgent && (
              <div className="text-sm text-muted-foreground">
                <div className="font-medium">{editingAgent.display_name ?? "Unknown"}</div>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">Assigned Agency</label>
              <Select value={editAgency || "none"} onValueChange={(v) => setEditAgency(v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select agency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {AGENCY_OPTIONS.map((agency) => (
                    <SelectItem key={agency} value={agency}>
                      {agency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSaveAgency} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
