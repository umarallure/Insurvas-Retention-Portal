"use client";

import * as React from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  formatCurrency,
  formatValue,
  pickRowValue,
  titleizeKey,
  useAssignedLeadDetails,
} from "@/lib/agent/assigned-lead-details.logic";
import { useDashboard } from "@/components/dashboard-context";

export default function AssignedLeadDetailsPage() {
  const { setCurrentLeadPhone } = useDashboard();
  const {
    lead,
    dealId,
    previousAssignedDealId,
    nextAssignedDealId,
    assignedDealsLoading,
    goToPreviousAssignedLead,
    goToNextAssignedLead,
    selectedDeal,
    router,
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
    verificationLoading,
    verificationError,
    verificationItems,
    verificationInputValues,
    toggleVerificationItem,
    updateVerificationItemValue,
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

  React.useEffect(() => {
    const raw = typeof personalPhone === "string" ? personalPhone.trim() : "";
    const phone = raw && raw !== "-" ? raw : null;
    setCurrentLeadPhone(phone);
  }, [personalPhone, setCurrentLeadPhone]);

  React.useEffect(() => {
    return () => {
      setCurrentLeadPhone(null);
    };
  }, [setCurrentLeadPhone]);

  return (
    <div className="w-full px-6 py-8 min-h-screen bg-muted/20">
      <div className="w-full">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <CardTitle>{name}</CardTitle>
                <CardDescription>
                  {carrier !== "-" ? carrier : ""}
                  {productType !== "-" ? ` • ${productType}` : ""}
                  {center !== "-" ? ` • ${center}` : ""}
                </CardDescription>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={assignedDealsLoading || !dealId || !previousAssignedDealId}
                  onClick={() => void goToPreviousAssignedLead()}
                >
                  Previous Lead
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={assignedDealsLoading || !dealId || !nextAssignedDealId}
                  onClick={() => void goToNextAssignedLead()}
                >
                  Next Lead
                </Button>
              </div>
            </div>
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
                        <div className="space-y-3 max-w-xl">
                          {policyViews.map((p) => {
                            const isSelected = p.key === selectedPolicyKey;
                            return (
                              <div
                                key={p.key}
                                onClick={() => setSelectedPolicyKey(p.key)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    setSelectedPolicyKey(p.key);
                                  }
                                }}
                                role="button"
                                tabIndex={0}
                                className={
                                  "text-left rounded-lg border bg-card p-4 transition-all cursor-pointer " +
                                  (isSelected ? "ring-2 ring-primary border-primary shadow-md" : "hover:shadow-sm hover:border-muted-foreground/20")
                                }
                              >
                                <div className="flex items-start justify-between gap-3 mb-3">
                                  <div className="min-w-0 flex-1">
                                    <div className="text-base font-semibold text-foreground truncate" title={p.clientName}>
                                      {p.clientName}
                                    </div>
                                    <div className="text-xs text-muted-foreground truncate mt-0.5" title={String(p.callCenter ?? "")}>
                                      {p.callCenter ?? "—"}
                                    </div>
                                  </div>
                                  <div className="text-xs rounded-md bg-muted px-2.5 py-1 font-medium text-foreground whitespace-nowrap">
                                    {p.status}
                                  </div>
                                </div>

                                <div className="grid grid-cols-[1fr_auto] gap-x-8 gap-y-3">
                                  <div className="space-y-1">
                                    <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Policy #</div>
                                    <div className="text-sm font-medium text-foreground truncate" title={p.policyNumber ?? undefined}>
                                      {p.policyNumber ?? "—"}
                                    </div>
                                  </div>

                                  <div className="space-y-1">
                                    <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Carrier</div>
                                    <div className="text-sm font-medium text-foreground truncate" title={p.carrier ?? undefined}>
                                      {p.carrier ?? "—"}
                                    </div>
                                  </div>

                                  <div className="space-y-1">
                                    <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Agent</div>
                                    <div className="text-sm font-medium text-foreground truncate" title={p.agentName ?? undefined}>
                                      {p.agentName ?? "—"}
                                    </div>
                                  </div>

                                  <div className="space-y-1">
                                    <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Monthly Premium</div>
                                    <div className="text-sm font-medium text-foreground">
                                      {formatCurrency(p.monthlyPremium)}
                                    </div>
                                  </div>

                                  <div className="space-y-1">
                                    <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Coverage</div>
                                    <div className="text-sm font-medium text-foreground">
                                      {formatValue(p.coverage)}
                                    </div>
                                  </div>

                                  <div className="space-y-1">
                                    <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Initial Draft Date</div>
                                    <div className="text-sm font-medium text-foreground">
                                      {formatValue(p.initialDraftDate)}
                                    </div>
                                  </div>
                                </div>

                                <div className="mt-3 pt-3 border-t">
                                  <div className="flex items-baseline justify-between gap-3">
                                    <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Last Updated</div>
                                    <div className="text-xs text-muted-foreground">
                                      {formatValue(p.lastUpdated)}
                                    </div>
                                  </div>
                                </div>

                                <div className="mt-3 pt-3 border-t">
                                  <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Status Notes</div>
                                  <div className="text-sm text-foreground/80 line-clamp-2" title={p.statusNotes ?? undefined}>
                                    {p.statusNotes ?? "—"}
                                  </div>
                                </div>

                                {isSelected ? (
                                  <div className="mt-4">
                                    <Button
                                      type="button"
                                      className="w-full"
                                      onClick={(e) => {
                                        e.stopPropagation();

                                        const leadIdForRoute = typeof lead?.id === "string" ? lead.id : null;
                                        const policyNumberForRoute = p.policyNumber ?? null;
                                        const callCenterForRoute = p.callCenter ?? null;
                                        const carrierForRoute = p.carrier ?? null;
                                        const clientNameForRoute = p.clientName ?? null;
                                        const raw = (p.raw ?? null) as unknown as Record<string, unknown> | null;
                                        const phoneNumberForRoute = raw && typeof raw["phone_number"] === "string" ? (raw["phone_number"] as string) : null;
                                        const dealIdForRoute = raw && typeof raw["id"] === "number" ? (raw["id"] as number) : null;
                                        const dobForRoute = personalDob !== "-" ? personalDob : "";
                                        const ghlStageForRoute = selectedDeal?.ghl_stage ?? "";
                                        const agentNameForRoute = p.agentName && p.agentName !== "—" ? p.agentName : "";
                                        const writingNumberForRoute = raw && typeof raw["writing_no"] === "string" ? (raw["writing_no"] as string) : "";
                                        const ssnLast4Raw = personalSsnLast4 !== "-" ? personalSsnLast4 : "";
                                        const ssnLast4ForRoute = ssnLast4Raw.length > 4 ? ssnLast4Raw.slice(-4) : ssnLast4Raw;
                                        const addressForRoute = personalAddress1 !== "-" ? personalAddress1 : "";

                                        const banking = (() => {
                                          const fields: Record<string, string> = {};
                                          for (const item of verificationItems) {
                                            const itemId = typeof item?.id === "string" ? (item.id as string) : null;
                                            if (!itemId) continue;
                                            const fieldName = typeof item?.field_name === "string" ? (item.field_name as string) : "";
                                            const key = fieldName.trim().toLowerCase();
                                            if (!key) continue;
                                            const v = (verificationInputValues[itemId] ?? "").toString().trim();
                                            if (!v) continue;
                                            fields[key] = v;
                                          }

                                          const find = (pred: (k: string) => boolean) => {
                                            for (const [k, v] of Object.entries(fields)) {
                                              if (pred(k)) return v;
                                            }
                                            return "";
                                          };

                                          return {
                                            institutionName: find((k) => k.includes("institution") || k.includes("bank name")),
                                            beneficiaryRouting: find((k) => k.includes("beneficiary routing") || k.includes("routing")),
                                            beneficiaryAccount: find((k) => k.includes("beneficiary account") || k.includes("account")),
                                            accountType: find((k) => k.includes("account type")),
                                          };
                                        })();

                                        if (!leadIdForRoute || !policyNumberForRoute || policyNumberForRoute === "—") return;

                                        void router.push(
                                          `/agent/retention-workflow?leadId=${encodeURIComponent(leadIdForRoute)}` +
                                            `&dealId=${encodeURIComponent(String(dealIdForRoute ?? ""))}` +
                                            `&policyNumber=${encodeURIComponent(policyNumberForRoute)}` +
                                            `&callCenter=${encodeURIComponent(String(callCenterForRoute ?? ""))}` +
                                            `&carrier=${encodeURIComponent(String(carrierForRoute ?? ""))}` +
                                            `&clientName=${encodeURIComponent(String(clientNameForRoute ?? ""))}` +
                                            `&phoneNumber=${encodeURIComponent(String(phoneNumberForRoute ?? ""))}` +
                                            `&dob=${encodeURIComponent(String(dobForRoute))}` +
                                            `&ghlStage=${encodeURIComponent(String(ghlStageForRoute))}` +
                                            `&agentName=${encodeURIComponent(String(agentNameForRoute))}` +
                                            `&writingNumber=${encodeURIComponent(String(writingNumberForRoute))}` +
                                            `&ssnLast4=${encodeURIComponent(String(ssnLast4ForRoute))}` +
                                            `&address=${encodeURIComponent(String(addressForRoute))}` +
                                            `&bankName=${encodeURIComponent(banking.institutionName)}` +
                                            `&routingNumber=${encodeURIComponent(banking.beneficiaryRouting)}` +
                                            `&accountNumber=${encodeURIComponent(banking.beneficiaryAccount)}` +
                                            `&accountType=${encodeURIComponent(banking.accountType)}`,
                                        );
                                      }}
                                      disabled={!lead || typeof lead.id !== "string" || !p.policyNumber}
                                    >
                                      Start Retention Workflow
                                    </Button>
                                  </div>
                                ) : null}
                              </div>
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
                              <TableHead className="whitespace-nowrap">Agent</TableHead>
                              <TableHead className="whitespace-nowrap">Status</TableHead>
                              <TableHead className="whitespace-nowrap">Call Result</TableHead>
                              <TableHead className="whitespace-nowrap">Carrier</TableHead>
                              <TableHead className="whitespace-nowrap">Product Type</TableHead>
                              <TableHead className="whitespace-nowrap">Draft Date</TableHead>
                              <TableHead className="whitespace-nowrap">Monthly Premium</TableHead>
                              <TableHead className="whitespace-nowrap">Face Amount</TableHead>
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
                                <TableCell className="whitespace-nowrap">{formatValue(pickRowValue(row, ["agent"]))}</TableCell>
                                <TableCell className="whitespace-nowrap">{formatValue(pickRowValue(row, ["status"]))}</TableCell>
                                <TableCell className="whitespace-nowrap">{formatValue(pickRowValue(row, ["call_result"]))}</TableCell>
                                <TableCell className="whitespace-nowrap">{formatValue(pickRowValue(row, ["carrier"]))}</TableCell>
                                <TableCell className="whitespace-nowrap">{formatValue(pickRowValue(row, ["product_type"]))}</TableCell>
                                <TableCell className="whitespace-nowrap">{formatValue(pickRowValue(row, ["draft_date"]))}</TableCell>
                                <TableCell className="whitespace-nowrap">{formatValue(pickRowValue(row, ["monthly_premium"]))}</TableCell>
                                <TableCell className="whitespace-nowrap">{formatValue(pickRowValue(row, ["face_amount"]))}</TableCell>
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

                  </CardContent>
                </Card>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
