"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type AgentOption = {
  id: string;
  name: string;
};

type ClaimCallModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadName?: string;
  leadId?: string;
  onClaim?: (leadId?: string) => void;
};

export function ClaimCallModal({ open, onOpenChange, leadName, leadId, onClaim }: ClaimCallModalProps) {
  const [agentType, setAgentType] = React.useState<"buffer" | "licensed">("buffer");
  const [bufferAgent, setBufferAgent] = React.useState("");
  const [licensedAgent, setLicensedAgent] = React.useState("");
  const [isRetentionCall, setIsRetentionCall] = React.useState(true);

  const bufferAgents: AgentOption[] = [
    { id: "buffer-1", name: "Buffer Agent A" },
    { id: "buffer-2", name: "Buffer Agent B" },
  ];

  const licensedAgents: AgentOption[] = [
    { id: "licensed-1", name: "Licensed Agent X" },
    { id: "licensed-2", name: "Licensed Agent Y" },
  ];

  const canSubmit =
    (agentType === "buffer" && bufferAgent) || (agentType === "licensed" && licensedAgent);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            Claim Call {leadName ? `for ${leadName}` : ""}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Lead ID: {leadId ?? "—"}
          </p>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Select Workflow Type</Label>
            <Select
              value={agentType}
              onValueChange={(value) => setAgentType(value as "buffer" | "licensed")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select workflow" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="buffer">Buffer Agent</SelectItem>
                <SelectItem value="licensed">Licensed Agent</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {agentType === "buffer" ? (
            <div className="space-y-2">
              <Label>Select Buffer Agent</Label>
              <Select value={bufferAgent} onValueChange={setBufferAgent}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose buffer agent" />
                </SelectTrigger>
                <SelectContent>
                  {bufferAgents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!bufferAgents.length ? (
                <p className="text-sm text-muted-foreground">
                  No buffer agents available. Switch to &quot;Licensed Agent&quot; workflow.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Select Licensed Agent</Label>
              <Select value={licensedAgent} onValueChange={setLicensedAgent}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose licensed agent" />
                </SelectTrigger>
                <SelectContent>
                  {licensedAgents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!licensedAgents.length ? (
                <p className="text-sm text-muted-foreground">
                  No licensed agents available. Please add licensed agents.
                </p>
              ) : null}
            </div>
          )}

          <div className="flex items-center justify-between space-x-3 rounded-md border bg-muted/30 px-4 py-3">
            <div>
              <p className="text-sm font-medium">Mark as Retention Call</p>
              <p className="text-xs text-muted-foreground">
                This claim will be tracked as a retention team call
              </p>
            </div>
            <Switch
              checked={isRetentionCall}
              onCheckedChange={setIsRetentionCall}
              aria-label="Mark as retention call"
            />
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={() => {
              onOpenChange(false);
              if (onClaim) onClaim(leadId);
            }}
          >
            Claim &amp; Reconnect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
