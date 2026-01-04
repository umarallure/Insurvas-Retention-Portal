import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useCallUpdate } from "@/lib/agent/call-update.logic";

function normalizeVendorForMatch(vendor: string) {
  const s = vendor
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const suffixes = new Set([
    "bpo",
    "llc",
    "inc",
    "ltd",
    "corp",
    "corporation",
    "company",
    "co",
    "limited",
    "pllc",
    "pc",
  ]);

  const parts = s.split(" ").filter(Boolean);
  while (parts.length > 1 && suffixes.has(parts[parts.length - 1] ?? "")) {
    parts.pop();
  }
  return parts.join(" ");
}

export default function CallUpdatePage() {
  const router = useRouter();
  const { toast } = useToast();
  const {
    lead,
    insuredName,
    leadVendor,
    phoneNumber,
    carrier,
    productType,
    sessionCallCenter,
    sessionPolicyNumber,
    loadingLead,
    leadError,
    verificationItems,
    verificationLoading,
    verificationError,
    verificationInputValues,
    toggleVerificationItem,
    updateVerificationItemValue,
    verificationProgress,
    dealFlowRow,
    dealFlowLoading,
    dealFlowError,
    saveDealFlow,
    hasDealFlowColumn,
    sanitizeDealFlowPatch,
    agentOptions,
    agentOptionsLoading,
    agentOptionsError,
    centerOptions,
    centerOptionsLoading,
    centerOptionsError,
    carrierOptions,
    carrierOptionsLoading,
    carrierOptionsError,
    policyNumber,
    retentionAgent,
    retentionType,
    titleizeKey,
  } = useCallUpdate();

  const [saving, setSaving] = useState(false);

  const [applicationSubmitted, setApplicationSubmitted] = useState<"yes" | "no">("yes");
  const [callSource, setCallSource] = useState("");
  const [bufferAgent, setBufferAgent] = useState("");
  const [licensedAgent, setLicensedAgent] = useState("");
  const [notes, setNotes] = useState("");
  const [statusStage, setStatusStage] = useState("");
  const [submissionDate, setSubmissionDate] = useState("");
  const [draftDate, setDraftDate] = useState("");
  const [monthlyPremium, setMonthlyPremium] = useState("");
  const [coverageAmount, setCoverageAmount] = useState("");
  const [sentToUnderwriting, setSentToUnderwriting] = useState<"yes" | "no" | "">("");
  const [selectedCenter, setSelectedCenter] = useState("");
  const [selectedCarrier, setSelectedCarrier] = useState("");

  useEffect(() => {
    if (!router.isReady) return;
    const draftFromRoute = typeof router.query.draftDate === "string" ? router.query.draftDate : "";
    if (!draftFromRoute.trim().length) return;

    // Only seed from route when there isn't already an existing value loaded.
    if (!draftDate.trim().length && !(dealFlowRow?.draft_date ?? "").toString().trim().length) {
      setDraftDate(draftFromRoute);
    }
  }, [dealFlowRow?.draft_date, draftDate, router.isReady, router.query.draftDate]);

  useEffect(() => {
    if (!dealFlowRow) return;
    setBufferAgent(dealFlowRow.buffer_agent ?? "");
    setLicensedAgent(dealFlowRow.licensed_agent_account ?? "");
    setStatusStage(dealFlowRow.status ?? "");
    setNotes(dealFlowRow.notes ?? "");
    setCallSource(dealFlowRow.call_result ?? "");
    setSubmissionDate(dealFlowRow.date ?? "");
    {
      const dd = (dealFlowRow.draft_date ?? "").toString().trim();
      if (dd.length) setDraftDate(dd);
    }
    setMonthlyPremium(dealFlowRow.monthly_premium != null ? String(dealFlowRow.monthly_premium) : "");
    setCoverageAmount(dealFlowRow.face_amount != null ? String(dealFlowRow.face_amount) : "");
    setSelectedCenter(dealFlowRow.lead_vendor ?? leadVendor ?? "");
    setSelectedCarrier(dealFlowRow.carrier ?? carrier ?? "");

    const hasNoFlowInputs =
      !(dealFlowRow.status ?? "").trim().length &&
      !(dealFlowRow.notes ?? "").trim().length;
    setApplicationSubmitted(hasNoFlowInputs ? "yes" : "no");

    const underwritingColumnCandidates = [
      "sent_to_underwriting",
      "send_to_underwriting",
      "sent_to_uw",
      "sent_to_underwriting_flag",
    ];
    const found = underwritingColumnCandidates.find((c) => hasDealFlowColumn(c)) ?? null;
    if (found) {
      const raw = (dealFlowRow as unknown as Record<string, unknown>)[found];
      if (typeof raw === "boolean") setSentToUnderwriting(raw ? "yes" : "no");
      else if (typeof raw === "string") {
        const t = raw.trim().toLowerCase();
        if (t === "yes" || t === "true" || t === "1") setSentToUnderwriting("yes");
        else if (t === "no" || t === "false" || t === "0") setSentToUnderwriting("no");
        else setSentToUnderwriting("");
      } else if (typeof raw === "number") setSentToUnderwriting(raw ? "yes" : "no");
      else setSentToUnderwriting("");
    } else {
      setSentToUnderwriting("");
    }
  }, [dealFlowRow, hasDealFlowColumn, leadVendor, carrier]);

  const progress = verificationProgress.percent;

  return (
    <div className="w-full px-4 md:px-8 lg:px-10 py-6 min-h-screen bg-muted/15">
      <div className="flex flex-col gap-3 mb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-2">
            ← Back to Dashboard
          </Button>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Progress</span>
            <div className="h-2 w-40 rounded-full bg-muted overflow-hidden">
              <div className="h-2 bg-primary" style={{ width: `${progress}%` }} />
            </div>
            <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-amber-200">
              Just Started
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-[1.05fr,1.15fr] max-w-7xl mx-auto">
        {/* Left: Verification Panel */}
        <Card className="shadow-md border border-muted/60">
          <CardHeader className="space-y-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Verification Panel</CardTitle>
              <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                IN PROGRESS
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>Agent: {retentionAgent || "—"}</span>
              <Separator orientation="vertical" className="h-4" />
              <span>Policy: {sessionPolicyNumber || policyNumber || "—"}</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>Call Center: {sessionCallCenter || leadVendor || "—"}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">
                {verificationProgress.verified} of {verificationProgress.total} fields verified
              </span>
              <span className="text-primary font-semibold">{progress}%</span>
              <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">Just Started</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingLead ? (
              <div className="text-sm text-muted-foreground">Loading lead...</div>
            ) : leadError ? (
              <div className="text-sm text-red-600">{leadError}</div>
            ) : !lead ? (
              <div className="text-sm text-muted-foreground">Lead not found.</div>
            ) : verificationLoading ? (
              <div className="text-sm text-muted-foreground">Loading verification...</div>
            ) : verificationError ? (
              <div className="text-sm text-red-600">{verificationError}</div>
            ) : verificationItems.length === 0 ? (
              <div className="text-sm text-muted-foreground">No verification fields yet.</div>
            ) : (
              <div className="space-y-2">
                {verificationItems.map((item) => {
                  const itemId = typeof item.id === "string" ? item.id : null;
                  if (!itemId) return null;
                  const fieldName = typeof item.field_name === "string" ? item.field_name : "";
                  const checked = !!item.is_verified;
                  const value = verificationInputValues[itemId] ?? "";

                  return (
                    <div
                      key={itemId}
                      className="rounded-lg border bg-card px-3 py-2 shadow-[0_1px_0_rgba(0,0,0,0.02)] space-y-2"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => {
                              void toggleVerificationItem(itemId, Boolean(v));
                            }}
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate" title={fieldName}>
                              {titleizeKey(fieldName || "Field")}
                            </p>
                          </div>
                        </div>

                        {checked ? (
                          <Badge variant="outline" className="border-green-500/30 text-green-700 bg-green-500/10">
                            Verified
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Pending</Badge>
                        )}
                      </div>

                      <Input
                        value={value}
                        onChange={(e) => {
                          void updateVerificationItemValue(itemId, e.target.value);
                        }}
                        className="text-xs"
                      />
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" className="bg-red-100 text-red-700 border-red-200">
                Call Dropped
              </Button>
              <Button size="sm" variant="secondary" className="bg-slate-100 text-slate-700 border-slate-200">
                Call Done
              </Button>
              <Button size="sm" variant="secondary" className="bg-indigo-100 text-indigo-700 border-indigo-200">
                Transfer to Other Licensed Agent
              </Button>
            </div>
            <Button variant="outline" size="sm" className="w-full">
              Copy Edited Notes
            </Button>
          </CardContent>
        </Card>

        {/* Right: Call Result Form */}
        <div className="space-y-4">
          <Card className="shadow-md border border-muted/60">
            <CardHeader>
              <CardTitle>Update Call Result</CardTitle>
              <CardDescription>
                {insuredName}
                {policyNumber ? ` • ${policyNumber}` : ""}
                {selectedCenter ? ` • ${selectedCenter}` : leadVendor ? ` • ${leadVendor}` : ""}
                {phoneNumber ? ` • ${phoneNumber}` : ""}
                {retentionType ? ` • ${retentionType}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {dealFlowLoading ? (
                <div className="text-sm text-muted-foreground">Loading call update...</div>
              ) : dealFlowError ? (
                <div className="text-sm text-red-600">{dealFlowError}</div>
              ) : null}

              <div className="flex items-center gap-3">
                <Button
                  variant={applicationSubmitted === "yes" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setApplicationSubmitted("yes")}
                >
                  Yes
                </Button>
                <Button
                  variant={applicationSubmitted === "no" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setApplicationSubmitted("no")}
                >
                  No
                </Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Call Source *</Label>
                  <Select value={callSource} onValueChange={setCallSource}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select source" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BPO Transfer">BPO Transfer</SelectItem>
                      <SelectItem value="Inbound">Inbound</SelectItem>
                      <SelectItem value="Outbound">Outbound</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-lg border bg-muted/40 p-3 space-y-3">
                <p className="text-sm font-semibold">Call Information</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Buffer Agent</Label>
                    <Select value={bufferAgent} onValueChange={setBufferAgent}>
                      <SelectTrigger>
                        <SelectValue placeholder={agentOptionsLoading ? "Loading agents..." : "Select buffer agent"} />
                      </SelectTrigger>
                      <SelectContent>
                        {agentOptionsError ? (
                          <SelectItem value="__disabled_agents_error__" disabled>
                            Failed to load agents
                          </SelectItem>
                        ) : agentOptions.length ? (
                          agentOptions.map((a) => (
                            <SelectItem key={a.id} value={a.display_name}>
                              {a.display_name}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="__disabled_agents_empty__" disabled>
                            No agents found
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Agent who took the call</Label>
                    <Select value={licensedAgent} onValueChange={setLicensedAgent}>
                      <SelectTrigger>
                        <SelectValue placeholder={agentOptionsLoading ? "Loading agents..." : "Select agent"} />
                      </SelectTrigger>
                      <SelectContent>
                        {agentOptionsError ? (
                          <SelectItem value="__disabled_agents_error__" disabled>
                            Failed to load agents
                          </SelectItem>
                        ) : agentOptions.length ? (
                          agentOptions.map((a) => (
                            <SelectItem key={a.id} value={a.display_name}>
                              {a.display_name}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="__disabled_agents_empty__" disabled>
                            No agents found
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {applicationSubmitted === "no" ? (
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <Label>Status/Stage *</Label>
                      <Select value={statusStage} onValueChange={setStatusStage}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status/stage" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="call_dropped">Call Dropped</SelectItem>
                          <SelectItem value="not_submitted">Not Submitted</SelectItem>
                          <SelectItem value="callback_scheduled">Callback Scheduled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Notes *</Label>
                      <Textarea
                        placeholder="Why the call got dropped or not submitted? Provide the reason (required)"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className={`min-h-[90px] ${notes.trim() === "" ? "border-destructive/60" : ""}`}
                      />
                      {notes.trim() === "" ? (
                        <p className="text-xs text-destructive">Notes are required</p>
                      ) : null}
                    </div>
                    {notes.trim() === "" ? (
                      <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        Please complete all required fields: Notes
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {applicationSubmitted === "yes" ? (
                <Card className="shadow-none border border-emerald-100 bg-emerald-50">
                  <CardHeader>
                    <CardTitle>Application Submitted Details</CardTitle>
                    <CardDescription>Capture submission specifics.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Licensed Agent Account</Label>
                        <Select value={licensedAgent} onValueChange={setLicensedAgent}>
                          <SelectTrigger>
                            <SelectValue
                              placeholder={agentOptionsLoading ? "Loading agents..." : "Select licensed account"}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {agentOptionsError ? (
                              <SelectItem value="__disabled_agents_error__" disabled>
                                Failed to load agents
                              </SelectItem>
                            ) : agentOptions.length ? (
                              agentOptions.map((a) => (
                                <SelectItem key={a.id} value={a.display_name}>
                                  {a.display_name}
                                </SelectItem>
                              ))
                            ) : (
                              <SelectItem value="__disabled_agents_empty__" disabled>
                                No agents found
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Carrier Name</Label>
                        <Select value={selectedCarrier} onValueChange={setSelectedCarrier}>
                          <SelectTrigger>
                            <SelectValue
                              placeholder={carrierOptionsLoading ? "Loading carriers..." : "Select carrier"}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {selectedCarrier.trim().length &&
                            !carrierOptions.some(
                              (c) => (c.carrier_name ?? "").toString().trim() === selectedCarrier.trim(),
                            ) ? (
                              <SelectItem value={selectedCarrier.trim()}>{selectedCarrier.trim()}</SelectItem>
                            ) : null}
                            {carrierOptionsError ? (
                              <SelectItem value="__disabled_carriers_error__" disabled>
                                Failed to load carriers
                              </SelectItem>
                            ) : carrierOptions.length ? (
                              carrierOptions
                                .filter((c) => (c.carrier_name ?? "").toString().trim().length)
                                .map((c) => (
                                  <SelectItem key={c.id} value={(c.carrier_name ?? "").toString().trim()}>
                                    {(c.carrier_name ?? "").toString()}
                                  </SelectItem>
                                ))
                            ) : (
                              <SelectItem value="__disabled_carriers_empty__" disabled>
                                No carriers found
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Product Type</Label>
                        <Input placeholder="Select product type" value={productType} readOnly />
                      </div>
                      <div className="space-y-2">
                        <Label>Lead Vendor</Label>
                        <Select value={selectedCenter} onValueChange={setSelectedCenter}>
                          <SelectTrigger>
                            <SelectValue
                              placeholder={centerOptionsLoading ? "Loading centers..." : "Select lead vendor"}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {selectedCenter.trim().length &&
                            !centerOptions.some(
                              (c) =>
                                normalizeVendorForMatch((c.lead_vendor ?? "").toString()) ===
                                normalizeVendorForMatch(selectedCenter),
                            ) ? (
                              <SelectItem value={selectedCenter.trim()}>{selectedCenter.trim()}</SelectItem>
                            ) : null}
                            {centerOptionsError ? (
                              <SelectItem value="__disabled_centers_error__" disabled>
                                Failed to load centers
                              </SelectItem>
                            ) : centerOptions.length ? (
                              centerOptions
                                .filter((c) => (c.lead_vendor ?? "").trim().length)
                                .map((c) => (
                                  <SelectItem key={c.id} value={(c.lead_vendor ?? "").trim()}>
                                    {(c.center_name ?? c.lead_vendor ?? "").toString()}
                                  </SelectItem>
                                ))
                            ) : (
                              <SelectItem value="__disabled_centers_empty__" disabled>
                                No centers found
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Draft Date</Label>
                        <Input type="date" value={draftDate} onChange={(e) => setDraftDate(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Monthly Premium</Label>
                        <Input
                          type="number"
                          inputMode="decimal"
                          placeholder="0.00"
                          value={monthlyPremium}
                          onChange={(e) => setMonthlyPremium(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Coverage Amount</Label>
                        <Input
                          type="number"
                          inputMode="decimal"
                          placeholder="0.00"
                          value={coverageAmount}
                          onChange={(e) => setCoverageAmount(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Submission Date</Label>
                        <Input type="date" value={submissionDate} onChange={(e) => setSubmissionDate(e.target.value)} />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label>Sent to Underwriting?</Label>
                        <div className="flex items-center gap-3">
                          <Button
                            type="button"
                            variant={sentToUnderwriting === "yes" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setSentToUnderwriting("yes")}
                          >
                            Yes
                          </Button>
                          <Button
                            type="button"
                            variant={sentToUnderwriting === "no" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setSentToUnderwriting("no")}
                          >
                            No
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label>Agent Notes</Label>
                        <Textarea
                          placeholder="Enter any additional notes about this application..."
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          className="min-h-[80px]"
                        />
                        <p className="text-xs text-muted-foreground">
                          Application details will be auto-generated and combined with your notes when saved.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              <div className="flex items-center justify-end gap-3">
                <Button variant="outline">Cancel</Button>
                <Button
                  disabled={
                    saving ||
                    dealFlowLoading ||
                    !dealFlowRow ||
                    !callSource.trim().length ||
                    (applicationSubmitted === "no" && (!statusStage.trim().length || !notes.trim().length))
                  }
                  onClick={() => {
                    const run = async () => {
                      if (!dealFlowRow) return;

                      const underwritingColumnCandidates = [
                        "sent_to_underwriting",
                        "send_to_underwriting",
                        "sent_to_uw",
                        "sent_to_underwriting_flag",
                      ];
                      const underwritingColumnName =
                        underwritingColumnCandidates.find((c) => hasDealFlowColumn(c)) ?? null;

                      const monthlyPremiumNumber = monthlyPremium.trim().length
                        ? Number(monthlyPremium)
                        : null;
                      const coverageAmountNumber = coverageAmount.trim().length
                        ? Number(coverageAmount)
                        : null;

                      setSaving(true);
                      try {
                        const basePatch: Record<string, unknown> = {
                          insured_name: insuredName,
                          lead_vendor: selectedCenter || leadVendor || null,
                          client_phone_number: phoneNumber || null,
                          buffer_agent: bufferAgent || null,
                          licensed_agent_account: licensedAgent || null,
                          agent: licensedAgent || null,
                          call_result: callSource || null,
                          policy_number: policyNumber ?? null,
                          retention_agent: retentionAgent || null,
                        };

                        if (applicationSubmitted === "no") {
                          basePatch["status"] = statusStage || null;
                          basePatch["notes"] = notes || null;
                        } else {
                          basePatch["status"] = null;
                          basePatch["notes"] = notes || null;
                          basePatch["date"] = submissionDate || null;
                          basePatch["draft_date"] = draftDate || null;
                          basePatch["monthly_premium"] =
                            typeof monthlyPremiumNumber === "number" && Number.isFinite(monthlyPremiumNumber)
                              ? monthlyPremiumNumber
                              : null;
                          basePatch["face_amount"] =
                            typeof coverageAmountNumber === "number" && Number.isFinite(coverageAmountNumber)
                              ? coverageAmountNumber
                              : null;
                          basePatch["carrier"] = selectedCarrier || carrier || null;
                          basePatch["product_type"] = productType || null;

                          if (underwritingColumnName) {
                            basePatch[underwritingColumnName] =
                              sentToUnderwriting === "" ? null : sentToUnderwriting === "yes";
                          }
                        }

                        const merged = {
                          ...(dealFlowRow as unknown as Record<string, unknown>),
                          ...basePatch,
                        };
                        const fullPayload = sanitizeDealFlowPatch(merged);

                        await saveDealFlow({
                          ...(fullPayload as Partial<NonNullable<typeof dealFlowRow>>),
                        });

                        toast({
                          title: "Saved",
                          description: "Call update record saved successfully.",
                          variant: "success",
                        });
                      } catch (e) {
                        const msg = e instanceof Error ? e.message : "Failed to save call update record.";
                        toast({
                          title: "Save failed",
                          description: msg,
                          variant: "destructive",
                        });
                      } finally {
                        setSaving(false);
                      }
                    };
                    void run();
                  }}
                >
                  Save Call Result
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="shadow-none border border-dashed border-muted/70 max-w-7xl mx-auto mt-4">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Additional Notes & Lead Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Agent Notes</Label>
              <Textarea placeholder="Enter additional notes..." className="min-h-[96px]" />
            </div>
            <div className="space-y-2">
              <Label>Lead Details</Label>
              <Textarea
                placeholder="Load details..."
                className="min-h-[96px]"
                value={insuredName}
                readOnly
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
