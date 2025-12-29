"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  formatCurrency,
  formatValue,
  pickRowValue,
  titleizeKey,
  useAssignedLeadDetails,
} from "@/lib/agent/assigned-lead-details.logic";

export default function AssignedLeadDetailsPage() {
  const {
    lead,
    selectedDeal,
    personalLeadLoading,
    mondayLoading,
    duplicateLoading,
    mondayError,
    duplicateError,
    policyCards,
    policyViews,
    selectedPolicyKey,
    setSelectedPolicyKey,
    selectedPolicyView,
    verificationSessionId,
    verificationLoading,
    verificationError,
    verificationItems,
    verificationInputValues,
    toggleVerificationItem,
    updateVerificationItemValue,
    retentionModalOpen,
    setRetentionModalOpen,
    retentionAgent,
    setRetentionAgent,
    retentionAgentLocked,
    retentionType,
    setRetentionType,
    retentionAgentOptions,
    openRetentionWorkflowModal,
    startRetentionWorkflow,
    retentionStep,
    setRetentionStep,
    goToCallUpdate,
    bankingPolicyStatus,
    setBankingPolicyStatus,
    bankingAccountHolderName,
    setBankingAccountHolderName,
    bankingBankName,
    setBankingBankName,
    bankingRoutingNumber,
    setBankingRoutingNumber,
    bankingAccountNumber,
    setBankingAccountNumber,
    bankingAccountType,
    setBankingAccountType,
    bankingDraftDate,
    setBankingDraftDate,
    bankingSaving,
    bankingSaveError,
    saveBankingInfoToMondayNotes,
    dailyFlowLoading,
    dailyFlowError,
    dailyFlowRows,
    notesItems,
    personalName,
    personalPhone,
    personalEmail,
    personalAddress1,
    personalCity,
    personalState,
    personalZip,
    personalPolicyNumber,
    personalCarrier,
    personalProductType,
    personalMonthlyPremium,
    personalDob,
    personalSsnLast4,
    personalAgent,
    personalCenter,
    personalAdditionalEntries,
    loading,
    error,
    name,
    carrier,
    productType,
    center,
  } = useAssignedLeadDetails();

  return (
    <div className="w-full px-8 py-10 min-h-screen bg-muted/20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Lead Details</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Detailed information for the assigned lead.
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl">
        <Card>
          <CardHeader>
            <CardTitle>{name}</CardTitle>
            <CardDescription>
              {carrier !== "-" ? carrier : ""}
              {productType !== "-" ? ` • ${productType}` : ""}
              {center !== "-" ? ` • ${center}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading lead details...</div>
            ) : error ? (
              <div className="text-sm text-red-600">{error}</div>
            ) : !lead && !selectedDeal ? (
              <div className="text-sm text-muted-foreground">Lead not found.</div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr] lg:items-start">
                <div className="min-w-0">
                <Tabs defaultValue="policies" className="w-full min-w-0">
                  <TabsList className="w-full justify-start">
                    <TabsTrigger value="policies">Policies</TabsTrigger>
                    <TabsTrigger value="daily">Daily Deal Flow</TabsTrigger>
                    <TabsTrigger value="personal">Personal Details</TabsTrigger>
                    <TabsTrigger value="notes">Notes</TabsTrigger>
                  </TabsList>

                  <TabsContent value="policies" className="pt-2">
                    <div className="rounded-md border p-4">
                      <div className="text-sm font-medium">Policies</div>
                      <Separator className="my-3" />

                      {mondayLoading || duplicateLoading ? (
                        <div className="text-sm text-muted-foreground">Loading policies...</div>
                      ) : mondayError || duplicateError ? (
                        <div className="text-sm text-red-600">{mondayError ?? duplicateError}</div>
                      ) : policyCards.length === 0 ? (
                        <div className="text-sm text-muted-foreground">No policies found.</div>
                      ) : (
                        <div className="grid gap-3">
                          {policyViews.map((p) => {
                            const isSelected = p.key === selectedPolicyKey;
                            return (
                              <button
                                key={p.key}
                                type="button"
                                onClick={() => setSelectedPolicyKey(p.key)}
                                className={
                                  "text-left rounded-md border bg-background p-4 w-full transition-colors " +
                                  (isSelected ? "ring-2 ring-primary border-primary/40" : "hover:bg-muted/30")
                                }
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="text-sm font-semibold text-foreground truncate" title={p.clientName}>
                                      {p.clientName}
                                    </div>
                                    <div
                                      className="text-xs text-muted-foreground truncate"
                                      title={String(p.callCenter ?? "")}
                                    >
                                      {p.callCenter ?? "—"}
                                    </div>
                                  </div>
                                  <div className="text-[11px] rounded-md bg-muted px-2 py-1 font-medium text-foreground whitespace-nowrap">
                                    {p.status}
                                  </div>
                                </div>

                                <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                                  <div className="text-muted-foreground">Last Updated</div>
                                  <div className="font-semibold text-foreground text-right">
                                    {formatValue(p.lastUpdated)}
                                  </div>

                                  <div className="text-muted-foreground">Carrier</div>
                                  <div className="font-semibold text-foreground text-right truncate" title={p.carrier ?? undefined}>
                                    {p.carrier ?? "—"}
                                  </div>

                                  <div className="text-muted-foreground">Policy #</div>
                                  <div
                                    className="font-semibold text-foreground text-right truncate"
                                    title={p.policyNumber ?? undefined}
                                  >
                                    {p.policyNumber ?? "—"}
                                  </div>

                                  <div className="text-muted-foreground">Agent</div>
                                  <div
                                    className="font-semibold text-foreground text-right truncate"
                                    title={p.agentName ?? undefined}
                                  >
                                    {p.agentName ?? "—"}
                                  </div>

                                  <div className="text-muted-foreground">Coverage</div>
                                  <div className="font-semibold text-foreground text-right">
                                    {formatValue(p.coverage)}
                                  </div>

                                  <div className="text-muted-foreground">Monthly Premium</div>
                                  <div className="font-semibold text-foreground text-right">
                                    {formatCurrency(p.monthlyPremium)}
                                  </div>

                                  <div className="text-muted-foreground">Initial Draft Date</div>
                                  <div className="font-semibold text-foreground text-right">
                                    {formatValue(p.initialDraftDate)}
                                  </div>
                                </div>

                                <div className="mt-3">
                                  <div className="text-xs text-muted-foreground">Status notes</div>
                                  <div className="text-sm text-foreground line-clamp-2" title={p.statusNotes ?? undefined}>
                                    {p.statusNotes ?? "—"}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </TabsContent>

                <TabsContent value="daily" className="pt-2">
                  <div className="rounded-md border p-4 min-w-0">
                    <div className="text-sm font-medium">Daily Deal Flow</div>
                    <Separator className="my-3" />

                    {dailyFlowLoading ? (
                      <div className="text-sm text-muted-foreground">Loading daily deal flow...</div>
                    ) : dailyFlowError ? (
                      <div className="text-sm text-red-600">{dailyFlowError}</div>
                    ) : dailyFlowRows.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No daily deal flow records found.</div>
                    ) : (
                      <div className="w-full max-w-full overflow-x-auto rounded-md border">
                        <Table className="w-max min-w-full">
                          <TableHeader>
                            <TableRow>
                              <TableHead className="whitespace-nowrap">Date</TableHead>
                              <TableHead className="whitespace-nowrap">Lead Vendor</TableHead>
                              <TableHead className="whitespace-nowrap">Insured Name</TableHead>
                              <TableHead className="whitespace-nowrap">Phone Number</TableHead>
                              <TableHead className="whitespace-nowrap">Buffer Agent</TableHead>
                              <TableHead className="whitespace-nowrap">Retention Agent</TableHead>
                              <TableHead className="whitespace-nowrap">Agent</TableHead>
                              <TableHead className="whitespace-nowrap">Licensed Account</TableHead>
                              <TableHead className="whitespace-nowrap">Status</TableHead>
                              <TableHead className="whitespace-nowrap">Call Result</TableHead>
                              <TableHead className="whitespace-nowrap">Carrier</TableHead>
                              <TableHead className="whitespace-nowrap">Product Type</TableHead>
                              <TableHead className="whitespace-nowrap">Draft Date</TableHead>
                              <TableHead className="whitespace-nowrap">Monthly Premium</TableHead>
                              <TableHead className="whitespace-nowrap">Face Amount</TableHead>
                              <TableHead className="whitespace-nowrap">Policy Number</TableHead>
                              <TableHead className="whitespace-nowrap">Placement Status</TableHead>
                              <TableHead className="whitespace-nowrap">From Callback</TableHead>
                              <TableHead className="whitespace-nowrap">Is Callback</TableHead>
                              <TableHead className="text-right whitespace-nowrap">Retention Call</TableHead>
                              <TableHead className="whitespace-nowrap">Sync Status</TableHead>
                              <TableHead className="whitespace-nowrap">Notes</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {dailyFlowRows.map((row, idx) => (
                              <TableRow key={String(row["id"] ?? idx)}>
                                <TableCell className="whitespace-nowrap">{formatValue(row["date"])}</TableCell>
                                <TableCell className="whitespace-nowrap">{formatValue(pickRowValue(row, ["lead_vendor"]))}</TableCell>
                                <TableCell className="whitespace-nowrap">{formatValue(pickRowValue(row, ["insured_name"]))}</TableCell>
                                <TableCell className="whitespace-nowrap">{formatValue(pickRowValue(row, ["client_phone_number"]))}</TableCell>
                                <TableCell className="whitespace-nowrap">{formatValue(pickRowValue(row, ["buffer_agent"]))}</TableCell>
                                <TableCell className="whitespace-nowrap">{formatValue(pickRowValue(row, ["retention_agent"]))}</TableCell>
                                <TableCell className="whitespace-nowrap">{formatValue(pickRowValue(row, ["agent"]))}</TableCell>
                                <TableCell className="whitespace-nowrap">{formatValue(pickRowValue(row, ["licensed_agent_account"]))}</TableCell>
                                <TableCell className="whitespace-nowrap">{formatValue(pickRowValue(row, ["status"]))}</TableCell>
                                <TableCell className="whitespace-nowrap">{formatValue(pickRowValue(row, ["call_result"]))}</TableCell>
                                <TableCell className="whitespace-nowrap">{formatValue(pickRowValue(row, ["carrier"]))}</TableCell>
                                <TableCell className="whitespace-nowrap">{formatValue(pickRowValue(row, ["product_type"]))}</TableCell>
                                <TableCell className="whitespace-nowrap">{formatValue(pickRowValue(row, ["draft_date"]))}</TableCell>
                                <TableCell className="whitespace-nowrap">{formatValue(pickRowValue(row, ["monthly_premium"]))}</TableCell>
                                <TableCell className="whitespace-nowrap">{formatValue(pickRowValue(row, ["face_amount"]))}</TableCell>
                                <TableCell className="whitespace-nowrap">{formatValue(pickRowValue(row, ["policy_number"]))}</TableCell>
                                <TableCell className="whitespace-nowrap">{formatValue(pickRowValue(row, ["placement_status"]))}</TableCell>
                                <TableCell className="whitespace-nowrap">{formatValue(pickRowValue(row, ["from_callback"]))}</TableCell>
                                <TableCell className="whitespace-nowrap">{formatValue(pickRowValue(row, ["is_callback"]))}</TableCell>
                                <TableCell className="text-right whitespace-nowrap">{formatValue(pickRowValue(row, ["is_retention_call"]))}</TableCell>
                                <TableCell className="whitespace-nowrap">{formatValue(pickRowValue(row, ["sync_status"]))}</TableCell>
                                <TableCell className="whitespace-nowrap max-w-[320px] truncate" title={String(pickRowValue(row, ["notes"]) ?? "")}>{formatValue(pickRowValue(row, ["notes"]))}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="notes" className="pt-2">
                  <div className="rounded-md border p-4">
                    <div className="text-sm font-medium">Notes</div>
                    <Separator className="my-3" />
                    {notesItems.length === 0 ? (
                      <div className="text-sm text-muted-foreground whitespace-pre-wrap">No notes.</div>
                    ) : (
                      <div className="space-y-3">
                        {notesItems.map((n, idx) => (
                          <div key={`${n.source}-${idx}`} className="rounded-md border bg-background p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-xs font-semibold text-muted-foreground">Source: {n.source}</div>
                              <div className="text-xs text-muted-foreground">{n.date ?? "—"}</div>
                            </div>
                            <div className="text-sm text-foreground whitespace-pre-wrap mt-2">{n.text}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="personal" className="pt-2">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-md border p-4">
                      <div className="text-sm font-medium">Contact & Address</div>
                      <Separator className="my-3" />
                      {personalLeadLoading ? (
                        <div className="text-sm text-muted-foreground">Loading lead info...</div>
                      ) : null}
                      <div className="text-sm text-muted-foreground">Name: {personalName}</div>
                      <div className="text-sm text-muted-foreground">Phone: {personalPhone}</div>
                      <div className="text-sm text-muted-foreground">Email: {personalEmail}</div>
                      <div className="text-sm text-muted-foreground mt-3">
                        Address: {personalAddress1}
                        {personalAddress1 !== "-" ? ", " : ""}
                        {personalCity !== "-" ? `${personalCity}, ` : ""}
                        {personalState !== "-" ? personalState : ""}
                        {personalZip !== "-" ? ` ${personalZip}` : ""}
                      </div>
                    </div>

                    <div className="rounded-md border p-4">
                      <div className="text-sm font-medium">Policy & Client</div>
                      <Separator className="my-3" />
                      <div className="text-sm text-muted-foreground">Policy #: {personalPolicyNumber}</div>
                      <div className="text-sm text-muted-foreground">Carrier: {personalCarrier}</div>
                      <div className="text-sm text-muted-foreground">Product Type: {personalProductType}</div>
                      <div className="text-sm text-muted-foreground">Monthly Premium: {personalMonthlyPremium}</div>
                      <div className="text-sm text-muted-foreground mt-3">DOB: {personalDob}</div>
                      <div className="text-sm text-muted-foreground">SSN (last 4): {personalSsnLast4}</div>
                      <div className="text-sm text-muted-foreground mt-3">Agent: {personalAgent}</div>
                    </div>
                  </div>

                  <div className="rounded-md border p-4 mt-4">
                    <div className="text-sm font-medium">Lead Source</div>
                    <Separator className="my-3" />
                    <div className="text-sm text-muted-foreground">Center: {personalCenter}</div>
                  </div>

                  {personalAdditionalEntries.length > 0 && (
                    <div className="rounded-md border p-4 mt-4">
                      <div className="text-sm font-medium">Additional Details</div>
                      <Separator className="my-3" />
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {personalAdditionalEntries.map(([key, value]) => {
                          const isAdditionalNotes = key === "additional_notes";
                          return (
                            <div key={key} className={isAdditionalNotes ? "space-y-1 sm:col-span-2 lg:col-span-3" : "space-y-0.5"}>
                              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                                {titleizeKey(key)}
                              </div>
                              {isAdditionalNotes ? (
                                <div className="rounded-md border bg-muted/20 p-3 text-xs text-foreground whitespace-pre-wrap wrap-break-word max-h-64 overflow-auto">
                                  {formatValue(value)}
                                </div>
                              ) : (
                                <div className="text-xs text-foreground wrap-break-word">{formatValue(value)}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </TabsContent>
                </Tabs>
                </div>

                <Card className="h-fit lg:sticky lg:top-24 lg:max-h-[calc(100vh-6rem)] lg:flex lg:flex-col">
                  <CardHeader className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="text-base font-semibold">Verification Panel</CardTitle>
                      <div className="text-xs rounded-md bg-muted px-2 py-1 font-medium text-foreground">
                        {selectedPolicyView?.callCenter ?? "—"}
                      </div>
                    </div>
                    <CardDescription>
                      {selectedPolicyView
                        ? `Selected policy: ${selectedPolicyView.policyNumber ?? "—"}`
                        : "Select a policy to view verification."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 lg:flex-1 lg:min-h-0 lg:overflow-y-auto">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                      <div className="text-muted-foreground">Client Name</div>
                      <div className="font-semibold text-foreground text-right">
                        {selectedPolicyView?.clientName ?? "—"}
                      </div>

                      <div className="text-muted-foreground">Carrier</div>
                      <div className="font-semibold text-foreground text-right">
                        {selectedPolicyView?.carrier ?? "—"}
                      </div>

                      <div className="text-muted-foreground">Policy Number</div>
                      <div className="font-semibold text-foreground text-right">
                        {selectedPolicyView?.policyNumber ?? "—"}
                      </div>

                      <div className="text-muted-foreground">Agent</div>
                      <div className="font-semibold text-foreground text-right">
                        {selectedPolicyView?.agentName ?? "—"}
                      </div>
                    </div>

                    <Separator />

                    {verificationLoading ? (
                      <div className="text-sm text-muted-foreground">Loading verification...</div>
                    ) : verificationError ? (
                      <div className="text-sm text-red-600">{verificationError}</div>
                    ) : verificationItems.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No verification fields yet.</div>
                    ) : (
                      <div className="space-y-3">
                        {verificationItems.map((item) => {
                          const itemId = typeof item.id === "string" ? item.id : null;
                          if (!itemId) return null;
                          const fieldName = typeof item.field_name === "string" ? item.field_name : "";
                          const checked = !!item.is_verified;
                          const value = verificationInputValues[itemId] ?? "";

                          return (
                            <div key={itemId} className="rounded-lg border bg-card px-3 py-2 space-y-2">
                              <div className="flex items-center gap-2">
                                <div className="text-xs font-medium text-foreground truncate" title={fieldName}>
                                  {titleizeKey(fieldName || "Field")}
                                </div>
                                <div className="ml-auto flex items-center gap-2">
                                  <div className="text-[11px] text-muted-foreground">
                                    {checked ? "Verified" : "Pending"}
                                  </div>
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={(v) => {
                                      void toggleVerificationItem(itemId, Boolean(v));
                                    }}
                                  />
                                </div>
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

                    <Button
                      type="button"
                      className="w-full"
                      onClick={() => {
                        openRetentionWorkflowModal();
                      }}
                      disabled={
                        (!lead || typeof lead.id !== "string") &&
                        (!verificationSessionId || typeof verificationSessionId !== "string")
                      }
                    >
                      Start Retention Workflow
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={retentionModalOpen} onOpenChange={setRetentionModalOpen}>
        <DialogContent className="sm:max-w-lg">
          {retentionStep === "select" ? (
            <>
              <DialogHeader>
                <DialogTitle>Retention Workflow</DialogTitle>
                <DialogDescription>Select agent and workflow type to proceed</DialogDescription>
              </DialogHeader>

              <div className="space-y-6">
                <div className="space-y-2">
                  <Label>Select Retention Agent</Label>
                  <Select value={retentionAgent} onValueChange={setRetentionAgent} disabled={retentionAgentLocked}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Agent" />
                    </SelectTrigger>
                    <SelectContent>
                      {retentionAgentOptions.map((agentName) => (
                        <SelectItem key={agentName} value={agentName}>
                          {agentName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Retention Call Type</Label>
                  <Select value={retentionType} onValueChange={(val) => setRetentionType(val as typeof retentionType)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new_sale">New Sale</SelectItem>
                      <SelectItem value="fixed_payment">Fixed Failed Payment</SelectItem>
                      <SelectItem value="carrier_requirements">Fulfilling Carrier Requirements</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setRetentionModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => void startRetentionWorkflow()}
                  disabled={!retentionAgent || !retentionType || !selectedPolicyView?.policyNumber}
                >
                  Next
                </Button>
              </DialogFooter>
            </>
          ) : null}

          {retentionStep === "carrier_alert" ? (
            <>
              <DialogHeader>
                <DialogTitle>Policy Status Alert</DialogTitle>
                <DialogDescription>
                  This is not a pending policy. Either select a new workflow, or different policy.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setRetentionModalOpen(false);
                    setRetentionStep("select");
                  }}
                >
                  Select Different Policy
                </Button>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    onClick={() => {
                      setRetentionType("fixed_payment");
                      setRetentionStep("banking_form");
                    }}
                  >
                    Switch to Fixing Failed Payment
                  </Button>

                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    onClick={() => {
                      setRetentionType("new_sale");
                      setRetentionStep("select");
                    }}
                  >
                    Switch to New Sale
                  </Button>
                </div>

                <Button type="button" className="w-full" onClick={() => void goToCallUpdate()}>
                  Update Call Result
                </Button>
              </div>
            </>
          ) : null}

          {retentionStep === "banking_form" ? (
            <>
              <DialogHeader>
                <DialogTitle>Banking Information</DialogTitle>
                <DialogDescription>Add banking details and save.</DialogDescription>
              </DialogHeader>

              <div className="space-y-6">
                <div className="space-y-3">
                  <Label>Policy Status</Label>
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => setBankingPolicyStatus("issued")}
                      className={
                        "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors " +
                        (bankingPolicyStatus === "issued"
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-foreground hover:bg-muted/50")
                      }
                    >
                      <span className="inline-block h-3 w-3 rounded-full border border-primary">
                        {bankingPolicyStatus === "issued" ? (
                          <span className="block h-2 w-2 rounded-full bg-primary m-px" />
                        ) : null}
                      </span>
                      <span>Policy has been issued</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setBankingPolicyStatus("pending")}
                      className={
                        "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors " +
                        (bankingPolicyStatus === "pending"
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background text-foreground hover:bg-muted/50")
                      }
                    >
                      <span className="inline-block h-3 w-3 rounded-full border border-primary">
                        {bankingPolicyStatus === "pending" ? (
                          <span className="block h-2 w-2 rounded-full bg-primary m-px" />
                        ) : null}
                      </span>
                      <span>Policy is pending (lead is in pending manual action on GHL)</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Account Holder Name</Label>
                    <Input value={bankingAccountHolderName} onChange={(e) => setBankingAccountHolderName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Bank Name</Label>
                    <Input value={bankingBankName} onChange={(e) => setBankingBankName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Routing Number</Label>
                    <Input value={bankingRoutingNumber} onChange={(e) => setBankingRoutingNumber(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Account Number</Label>
                    <Input value={bankingAccountNumber} onChange={(e) => setBankingAccountNumber(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Account Type</Label>
                    <Select
                      value={bankingAccountType}
                      onValueChange={(v) => {
                        if (v === "Checking" || v === "Savings" || v === "") {
                          setBankingAccountType(v);
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Checking">Checking</SelectItem>
                        <SelectItem value="Savings">Savings</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Draft Date</Label>
                    <Input type="date" value={bankingDraftDate} onChange={(e) => setBankingDraftDate(e.target.value)} />
                  </div>
                </div>

                {bankingSaveError ? <div className="text-sm text-red-600">{bankingSaveError}</div> : null}
              </div>

              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setRetentionStep("select")}>Back</Button>
                <Button
                  type="button"
                  disabled={
                    bankingSaving ||
                    !bankingAccountHolderName ||
                    !bankingBankName ||
                    !bankingRoutingNumber ||
                    !bankingAccountNumber ||
                    !bankingAccountType ||
                    !bankingDraftDate
                  }
                  onClick={() => {
                    const run = async () => {
                      await saveBankingInfoToMondayNotes();
                      await goToCallUpdate();
                    };
                    void run();
                  }}
                >
                  {bankingSaving ? "Saving..." : "Save and Continue"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
