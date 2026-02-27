"use client";

import * as React from "react";
import { PhoneIcon, PhoneOffIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

type VicidialWrapperProps = {
  agentUser: string;
  campaignId?: string;
  sessionActive: boolean;
  sessionUpdating?: boolean;
  onStartSession?: () => void;
  onEndSession?: () => void;
};

type CallState = "idle" | "dialing" | "in-call" | "ending";

const DEFAULT_DISPOSITIONS = [
  "SALE",
  "CBHOLD",
  "CALLBK",
  "NEW",
  "NA",
  "N",
  "DROP",
  "DNC",
];

export type VicidialWrapperHandle = {
  notifyExternalDial: (phone: string) => void;
  notifyExternalHangup: () => void;
};

export const VicidialWrapper = React.forwardRef<VicidialWrapperHandle, VicidialWrapperProps>(
  (
    {
      agentUser,
      campaignId,
      sessionActive,
      sessionUpdating = false,
      onStartSession,
      onEndSession,
    },
    ref,
  ) => {
    const [manualNumber, setManualNumber] = React.useState("");
    const [callState, setCallState] = React.useState<CallState>("idle");
    const [lastDialedNumber, setLastDialedNumber] = React.useState<string | null>(null);
    const [disposition, setDisposition] = React.useState<string>("");
    const [savingDisposition, setSavingDisposition] = React.useState(false);
    const [message, setMessage] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const { toast } = useToast();

    const hasActiveCall = callState === "dialing" || callState === "in-call" || callState === "ending";
    const [transferNumber, setTransferNumber] = React.useState("");
    const [dtmfDigits, setDtmfDigits] = React.useState("");
    const [transferLoading, setTransferLoading] = React.useState(false);
    const [parkLoading, setParkLoading] = React.useState(false);
    const [dtmfLoading, setDtmfLoading] = React.useState(false);

    React.useImperativeHandle(
      ref,
      () => ({
        notifyExternalDial(phone: string) {
          if (!phone) return;
          setLastDialedNumber(phone);
          setCallState("in-call");
          setMessage("Call in progress via VICIdial.");
        },
        notifyExternalHangup() {
          setCallState("idle");
        },
      }),
      [],
    );

    async function ensurePausedForManualDial() {
    const res = await fetch("/api/vicidial/agent-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_user: agentUser,
        status: "PAUSE",
        campaign_id: campaignId,
      }),
    });
    const data = (await res.json()) as { ok?: boolean; raw?: string; error?: string; message?: string };
    if (!res.ok || data.ok === false) {
      throw new Error(data.raw || data.error || data.message || "Failed to pause agent for manual dial");
    }
  }

    async function handleDial(number: string) {
     const trimmed = number.replace(/\s+/g, "");
     if (!trimmed || !agentUser) return;

     setError(null);
     setMessage(null);
     try {
      // Vicidial external_dial expects the agent to be PAUSED first.
      await ensurePausedForManualDial();

      setCallState("dialing");
       const res = await fetch("/api/vicidial/dial", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({
           phone_number: trimmed,
           agent_user: agentUser,
           campaign_id: campaignId,
         }),
       });
      const data = (await res.json()) as { ok?: boolean; raw?: string; error?: string };
      if (!res.ok || data.ok === false) {
        throw new Error(data.raw || data.error || "Failed to dial");
    }
       setLastDialedNumber(trimmed);
       setCallState("in-call");
       setMessage("Dial command sent to VICIdial.");
      toast({
        variant: "success",
        title: "Dialing",
        description: `Dial command sent for ${trimmed}`,
      });
     } catch (e) {
       setCallState("idle");
      const msg = e instanceof Error ? e.message : "Failed to dial";
      setError(msg);
      toast({
        variant: "destructive",
        title: "Dial failed",
        description: msg,
      });
     }
   }

    async function handleHangup() {
     if (!agentUser || !hasActiveCall) return;
     setError(null);
     setMessage(null);
     setCallState("ending");
     try {
       const res = await fetch("/api/vicidial/hangup", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({
           agent_user: agentUser,
           campaign_id: campaignId,
         }),
       });
       const data = (await res.json()) as { ok?: boolean; raw?: string };
       if (!res.ok || data.ok === false) {
         throw new Error(data.raw || "Failed to hang up");
       }
       setCallState("idle");
       setMessage("Hangup command sent to VICIdial.");
      toast({
        variant: "success",
        title: "Call ended",
        description: "Hangup command sent to VICIdial.",
      });
     } catch (e) {
       setCallState("idle");
      const msg = e instanceof Error ? e.message : "Failed to hang up";
      setError(msg);
      toast({
        variant: "destructive",
        title: "Hangup failed",
        description: msg,
      });
     }
    }

    async function handleSaveDisposition() {
      const status = disposition.trim().toUpperCase();
      if (!status || !agentUser) return;

      setSavingDisposition(true);
      setError(null);
      setMessage(null);
      try {
        const res = await fetch("/api/vicidial/agent-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agent_user: agentUser,
            status,
            campaign_id: campaignId,
          }),
        });
        const data = (await res.json()) as { ok?: boolean; raw?: string; error?: string; message?: string };
        if (!res.ok || data.ok === false) {
          throw new Error(data.raw || data.error || data.message || "Failed to set disposition");
        }
        setMessage(`Disposition ${status} sent to VICIdial.`);
        setDisposition("");
        toast({
          variant: "success",
          title: "Status updated",
          description: `Disposition ${status} sent to VICIdial.`,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to set disposition";
        setError(msg);
        toast({
          variant: "destructive",
          title: "Status update failed",
          description: msg,
        });
      } finally {
        setSavingDisposition(false);
      }
    }

    const disabledReason =
      !agentUser
        ? "Missing NEXT_PUBLIC_VICIDIAL_AGENT_USER env var."
        : !sessionActive
          ? "Start a VICIdial session to place calls."
          : null;

    return (
      <Card className="h-full rounded-none border-0 shadow-none">
        <CardHeader className="border-b pb-3">
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <PhoneIcon className="h-5 w-5" />
              Vicidial Call Controls
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={sessionActive ? "default" : "secondary"}>
                {sessionActive ? "Session Active" : "Session Inactive"}
              </Badge>
              {hasActiveCall && lastDialedNumber ? (
                <Badge variant="outline" className="text-xs">
                  In call: {lastDialedNumber}
                </Badge>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="h-full flex flex-col gap-4 p-4">
          {disabledReason ? (
            <div className="text-sm text-muted-foreground">{disabledReason}</div>
          ) : null}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Agent status + manual dial */}
            <div className="space-y-3 rounded-2xl border bg-card/80 p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Agent Status &amp; Manual Dial
                </div>
                {onStartSession != null && onEndSession != null ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">Agent</span>
                    <Button
                      variant={sessionActive ? "secondary" : "outline"}
                      size="xs"
                      className="h-7 px-3 text-[11px]"
                      onClick={() => void (sessionActive ? onEndSession() : onStartSession())}
                      disabled={sessionUpdating || !agentUser}
                    >
                      {sessionUpdating
                        ? sessionActive
                          ? "Pausing..."
                          : "Going Active..."
                        : sessionActive
                          ? "Pause"
                          : "Go Active"}
                    </Button>
                    <Badge variant={sessionActive ? "default" : "secondary"} className="text-[10px] px-2">
                      {sessionActive ? "Active" : "Paused"}
                    </Badge>
                  </div>
                ) : null}
              </div>

              <div className="space-y-2">
                <div className="text-[11px] uppercase font-medium text-muted-foreground">Manual Dial</div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter phone number"
                    value={manualNumber}
                    onChange={(e) => setManualNumber(e.target.value)}
                    disabled={!!disabledReason || callState === "dialing" || callState === "ending"}
                  />
                  <Button
                    type="button"
                    onClick={() => void handleDial(manualNumber)}
                    disabled={!!disabledReason || callState === "dialing" || callState === "ending" || !manualNumber.trim()}
                  >
                    <PhoneIcon className="h-4 w-4 mr-1" />
                    {callState === "dialing" ? "Dialing..." : "Dial"}
                  </Button>
                </div>
                {lastDialedNumber ? (
                  <div className="text-[11px] text-muted-foreground">
                    Last dialed: <span className="font-mono">{lastDialedNumber}</span>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Active call controls */}
            <div className="space-y-3 rounded-2xl border bg-card/80 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Active Call Controls
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  className="h-11 rounded-full text-sm"
                  onClick={() => void handleHangup()}
                  disabled={!agentUser || !hasActiveCall}
                >
                  <PhoneOffIcon className="h-4 w-4 mr-2" />
                  {callState === "ending" ? "Ending..." : "Hang Up"}
                </Button>
                <div className="text-xs text-muted-foreground">
                  State:{" "}
                  <span className="font-medium">
                    {callState === "idle" && "Idle"}
                    {callState === "dialing" && "Dialing"}
                    {callState === "in-call" && "In Call"}
                    {callState === "ending" && "Ending"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Transfer & Park row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-3 rounded-2xl border bg-card/80 p-4 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Transfer &amp; Park
              </div>
              <div className="space-y-2">
                <div className="text-[11px] uppercase font-medium text-muted-foreground">Transfer</div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Number or extension"
                    value={transferNumber}
                    onChange={(e) => setTransferNumber(e.target.value)}
                    disabled={!agentUser || !hasActiveCall || transferLoading}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!agentUser || !hasActiveCall || !transferNumber.trim() || transferLoading}
                    onClick={async () => {
                      const target = transferNumber.replace(/\s+/g, "");
                      if (!target || !agentUser) return;
                      setTransferLoading(true);
                      setError(null);
                      try {
                        const res = await fetch("/api/vicidial/transfer", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            agent_user: agentUser,
                            campaign_id: campaignId,
                            value: "BLIND_TRANSFER",
                            phone_number: target,
                          }),
                        });
                        const data = (await res.json()) as { ok?: boolean; raw?: string; error?: string };
                        if (!res.ok || data.ok === false) {
                          throw new Error(data.raw || data.error || "Failed to transfer");
                        }
                        toast({
                          variant: "success",
                          title: "Transfer sent",
                          description: `Blind transfer to ${target} requested.`,
                        });
                      } catch (e) {
                        const msg = e instanceof Error ? e.message : "Failed to transfer call";
                        setError(msg);
                        toast({
                          variant: "destructive",
                          title: "Transfer failed",
                          description: msg,
                        });
                      } finally {
                        setTransferLoading(false);
                      }
                    }}
                  >
                    {transferLoading ? "Transferring..." : "Blind Transfer"}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-[11px] uppercase font-medium text-muted-foreground">Park &amp; DTMF</div>
                <div className="flex flex-wrap gap-2 items-center">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!agentUser || !hasActiveCall || parkLoading}
                    onClick={async () => {
                      if (!agentUser || !hasActiveCall) return;
                      setParkLoading(true);
                      setError(null);
                      try {
                        const res = await fetch("/api/vicidial/park", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            agent_user: agentUser,
                            campaign_id: campaignId,
                            value: "PARK_CUSTOMER",
                          }),
                        });
                        const data = (await res.json()) as { ok?: boolean; raw?: string; error?: string };
                        if (!res.ok || data.ok === false) {
                          throw new Error(data.raw || data.error || "Failed to park customer");
                        }
                        toast({
                          variant: "success",
                          title: "Customer parked",
                          description: "Park command sent to VICIdial.",
                        });
                      } catch (e) {
                        const msg = e instanceof Error ? e.message : "Failed to park customer";
                        setError(msg);
                        toast({
                          variant: "destructive",
                          title: "Park failed",
                          description: msg,
                        });
                      } finally {
                        setParkLoading(false);
                      }
                    }}
                  >
                    {parkLoading ? "Parking..." : "Park Customer"}
                  </Button>
                  <Input
                    className="w-28"
                    placeholder="DTMF"
                    value={dtmfDigits}
                    onChange={(e) => setDtmfDigits(e.target.value.toUpperCase())}
                    disabled={!agentUser || !hasActiveCall || dtmfLoading}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!agentUser || !hasActiveCall || !dtmfDigits.trim() || dtmfLoading}
                    onClick={async () => {
                      const value = dtmfDigits.trim();
                      if (!value || !agentUser) return;
                      setDtmfLoading(true);
                      setError(null);
                      try {
                        const res = await fetch("/api/vicidial/dtmf", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            agent_user: agentUser,
                            campaign_id: campaignId,
                            value,
                          }),
                        });
                        const data = (await res.json()) as { ok?: boolean; raw?: string; error?: string };
                        if (!res.ok || data.ok === false) {
                          throw new Error(data.raw || data.error || "Failed to send DTMF");
                        }
                        toast({
                          variant: "success",
                          title: "DTMF sent",
                          description: `DTMF "${value}" sent to VICIdial.`,
                        });
                      } catch (e) {
                        const msg = e instanceof Error ? e.message : "Failed to send DTMF";
                        setError(msg);
                        toast({
                          variant: "destructive",
                          title: "DTMF failed",
                          description: msg,
                        });
                      } finally {
                        setDtmfLoading(false);
                      }
                    }}
                  >
                    {dtmfLoading ? "Sending..." : "Send DTMF"}
                  </Button>
                </div>
              </div>
            </div>
            {/* Dispositioning */}
            <div className="space-y-3 rounded-2xl border bg-card/80 p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Dispositioning
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {DEFAULT_DISPOSITIONS.map((d) => (
                    <Button
                      key={d}
                      type="button"
                      variant={disposition === d ? "default" : "outline"}
                      size="sm"
                      className="text-xs"
                      onClick={() => setDisposition(d)}
                      disabled={!!disabledReason}
                    >
                      {d}
                    </Button>
                  ))}
                </div>
                <div className="flex gap-2 items-center">
                  <Input
                    placeholder="Or type custom status (e.g. XFER, CLOSER)"
                    value={disposition}
                    onChange={(e) => setDisposition(e.target.value.toUpperCase())}
                    disabled={!!disabledReason}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void handleSaveDisposition()}
                    disabled={!!disabledReason || !disposition.trim() || savingDisposition}
                  >
                    {savingDisposition ? "Saving..." : "Set Status"}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {message ? <div className="text-xs text-emerald-700">{message}</div> : null}
          {error ? <div className="text-xs text-destructive">{error}</div> : null}
        </CardContent>
      </Card>
    );
  }
);

VicidialWrapper.displayName = "VicidialWrapper";
