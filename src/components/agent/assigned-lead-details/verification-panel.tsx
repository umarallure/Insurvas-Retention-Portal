"use client";

import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Loader2, Phone } from "lucide-react";
import { titleizeKey } from "@/lib/agent/assigned-lead-details.logic";

type VerificationPanelProps = {
  selectedPolicyView: {
    callCenter?: string | null;
    policyNumber?: string | null;
    clientName?: string | null;
    carrier?: string | null;
    agentName?: string | null;
  } | null;
  loading: boolean;
  error: string | null;
  verificationItems: Array<Record<string, unknown>>;
  verificationInputValues: Record<string, string>;
  onToggleVerification: (itemId: string, checked: boolean) => void;
  onUpdateValue: (itemId: string, value: string) => void;
};

export function VerificationPanel({
  selectedPolicyView,
  loading,
  error,
  verificationItems,
  verificationInputValues,
  onToggleVerification,
  onUpdateValue,
}: VerificationPanelProps) {
  const { toast } = useToast();
  const [showUnderwritingModal, setShowUnderwritingModal] = React.useState(false);
  const [conditionInput, setConditionInput] = React.useState("");
  const [medicationInput, setMedicationInput] = React.useState("");
  const [toolkitUrl, setToolkitUrl] = React.useState("https://insurancetoolkits.com/login");
  const [dncCheckingItemId, setDncCheckingItemId] = React.useState<string | null>(null);
  const [showDncModal, setShowDncModal] = React.useState(false);
  const [pendingPhoneVerification, setPendingPhoneVerification] = React.useState<string | null>(null);
  const [phoneDncStatusByItem, setPhoneDncStatusByItem] = React.useState<Record<string, "clear" | "dnc" | "tcpa">>({});
  const [phoneDncStatus, setPhoneDncStatus] = React.useState<"clear" | "dnc" | "tcpa" | null>(null);
  const [dncMessage, setDncMessage] = React.useState<string | null>(null);

  const [underwritingData, setUnderwritingData] = React.useState({
    tobaccoLast12Months: "" as "yes" | "no" | "",
    healthConditions: [] as string[],
    medications: [] as string[],
    height: "",
    weight: "",
    carrier: "",
    productLevel: "",
    coverageAmount: "",
    monthlyPremium: "",
  });

  const addTag = (raw: string, key: "healthConditions" | "medications") => {
    const value = raw.trim();
    if (!value) return;
    setUnderwritingData((prev) => {
      if (prev[key].some((v) => v.toLowerCase() === value.toLowerCase())) return prev;
      return { ...prev, [key]: [...prev[key], value] };
    });
  };

  const removeTag = (key: "healthConditions" | "medications", index: number) => {
    setUnderwritingData((prev) => ({
      ...prev,
      [key]: prev[key].filter((_, i) => i !== index),
    }));
  };

  const setFieldValueAndVerify = (fieldName: string, value: string) => {
    const item = verificationItems.find(
      (i) => typeof i.id === "string" && typeof i.field_name === "string" && i.field_name === fieldName,
    );
    if (!item || typeof item.id !== "string") return;

    void onUpdateValue(item.id, value);
    void onToggleVerification(item.id, true);
  };

  const cleanMoney = (v: string) => v.replace(/\$/g, "").replace(/,/g, "").trim();

  const checkDnc = async (itemId: string) => {
    const item = verificationItems.find((i) => i.id === itemId);
    const phoneValue =
      verificationInputValues[itemId] ??
      (item && typeof item.verified_value === "string" ? item.verified_value : "") ??
      (item && typeof item.original_value === "string" ? item.original_value : "") ??
      "";

    const cleanPhone = phoneValue.replace(/\D/g, "");
    if (!cleanPhone || cleanPhone.length < 10) {
      toast({
        title: "Invalid Phone Number",
        description: "Please enter a valid phone number before checking DNC.",
        variant: "destructive",
      });
      return;
    }

    setDncCheckingItemId(itemId);
    try {
      const { data, error } = await supabase.functions.invoke("dnc-lookup", {
        body: { mobileNumber: cleanPhone },
      });

      if (error) {
        throw new Error(error.message || "DNC lookup failed");
      }

      const payload =
        data && typeof data === "object" && "data" in (data as Record<string, unknown>)
          ? ((data as Record<string, unknown>).data as Record<string, unknown> | null)
          : (data as Record<string, unknown> | null);

      const listIncludes = (value: unknown) =>
        Array.isArray(value) && value.some((v) => typeof v === "string" && (v === cleanPhone || v.endsWith(cleanPhone.slice(-10))));

      const isDnc = listIncludes(payload?.federal_dnc) || listIncludes(payload?.dnc);
      const isTcpa = listIncludes(payload?.tcpa_litigator);

      const status: "clear" | "dnc" | "tcpa" = isTcpa ? "tcpa" : isDnc ? "dnc" : "clear";
      const message = isTcpa
        ? "WARNING: This number is flagged as TCPA/Litigator."
        : isDnc
          ? "This number is on the DNC list. Proceed with verbal consent."
          : "This number is clear. Please verify consent with the customer.";

      setPhoneDncStatusByItem((prev) => ({ ...prev, [itemId]: status }));
      setPhoneDncStatus(status);
      setDncMessage(message);
      setPendingPhoneVerification(itemId);
      setShowDncModal(true);

      toast({
        title: status === "tcpa" ? "TCPA Warning" : status === "dnc" ? "DNC Warning" : "Phone Check Complete",
        description: message,
        variant: status === "tcpa" ? "destructive" : "default",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unable to check DNC status.";
      toast({
        title: "DNC Check Failed",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setDncCheckingItemId(null);
    }
  };

  const handleDncModalConfirm = () => {
    if (pendingPhoneVerification) {
      void onToggleVerification(pendingPhoneVerification, true);
      toast({
        title: "Consent Verified",
        description: "Phone number verified with customer consent.",
      });
    }
    setPendingPhoneVerification(null);
    setPhoneDncStatus(null);
    setDncMessage(null);
    setShowDncModal(false);
  };

  const handleDncModalCancel = () => {
    setPendingPhoneVerification(null);
    setPhoneDncStatus(null);
    setDncMessage(null);
    setShowDncModal(false);
  };

  const getVerificationFieldValue = React.useCallback(
    (fieldName: string) => {
      const item = verificationItems.find(
        (i) => typeof i.id === "string" && typeof i.field_name === "string" && i.field_name === fieldName,
      );
      if (!item) return "";

      const itemId = typeof item.id === "string" ? item.id : "";
      if (!itemId) return "";

      const fromInput = verificationInputValues[itemId];
      if (typeof fromInput === "string" && fromInput.trim().length > 0) return fromInput.trim();

      const verifiedValue = typeof item.verified_value === "string" ? item.verified_value.trim() : "";
      if (verifiedValue) return verifiedValue;

      const originalValue = typeof item.original_value === "string" ? item.original_value.trim() : "";
      return originalValue;
    },
    [verificationItems, verificationInputValues],
  );

  React.useEffect(() => {
    if (!showUnderwritingModal) return;

    const parseTagList = (value: string) =>
      value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);

    const tobaccoRaw = getVerificationFieldValue("tobacco_use").toLowerCase();
    const tobaccoLast12Months: "yes" | "no" | "" =
      tobaccoRaw === "yes" || tobaccoRaw === "true" || tobaccoRaw === "1"
        ? "yes"
        : tobaccoRaw === "no" || tobaccoRaw === "false" || tobaccoRaw === "0"
          ? "no"
          : "";

    setUnderwritingData({
      tobaccoLast12Months,
      healthConditions: parseTagList(getVerificationFieldValue("health_conditions")),
      medications: parseTagList(getVerificationFieldValue("medications")),
      height: getVerificationFieldValue("height"),
      weight: getVerificationFieldValue("weight"),
      carrier: getVerificationFieldValue("carrier"),
      productLevel: getVerificationFieldValue("insurance_application_details"),
      coverageAmount: getVerificationFieldValue("coverage_amount"),
      monthlyPremium: getVerificationFieldValue("monthly_premium"),
    });

    setConditionInput("");
    setMedicationInput("");
  }, [showUnderwritingModal, getVerificationFieldValue]);

  const saveUnderwritingToVerification = () => {
    if (underwritingData.tobaccoLast12Months) {
      setFieldValueAndVerify("tobacco_use", underwritingData.tobaccoLast12Months === "yes" ? "Yes" : "No");
    }

    if (underwritingData.healthConditions.length > 0) {
      setFieldValueAndVerify("health_conditions", underwritingData.healthConditions.join(", "));
    }

    if (underwritingData.medications.length > 0) {
      setFieldValueAndVerify("medications", underwritingData.medications.join(", "));
    }

    if (underwritingData.height.trim()) {
      setFieldValueAndVerify("height", underwritingData.height.trim());
    }

    if (underwritingData.weight.trim()) {
      setFieldValueAndVerify("weight", underwritingData.weight.trim());
    }

    if (underwritingData.carrier.trim()) {
      setFieldValueAndVerify("carrier", underwritingData.carrier.trim());
    }

    if (underwritingData.productLevel.trim()) {
      setFieldValueAndVerify("insurance_application_details", underwritingData.productLevel.trim());
    }

    if (underwritingData.coverageAmount.trim()) {
      setFieldValueAndVerify("coverage_amount", cleanMoney(underwritingData.coverageAmount));
    }

    if (underwritingData.monthlyPremium.trim()) {
      setFieldValueAndVerify("monthly_premium", cleanMoney(underwritingData.monthlyPremium));
    }

    setShowUnderwritingModal(false);
  };

  return (
    <Card className="h-fit lg:sticky lg:top-24 lg:max-h-[calc(100vh-6rem)] lg:flex lg:flex-col">
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base font-semibold">Verification Panel</CardTitle>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setShowUnderwritingModal(true)}>
              Underwriting
            </Button>
            <div className="text-xs rounded-md bg-muted px-2 py-1 font-medium text-foreground">
              {selectedPolicyView?.callCenter ?? "-"}
            </div>
          </div>
        </div>
        <CardDescription>
          {selectedPolicyView ? `Selected policy: ${selectedPolicyView.policyNumber ?? "—"}` : "Select a policy to view verification."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 lg:flex-1 lg:min-h-0 lg:overflow-y-auto">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div className="text-muted-foreground">Client Name</div>
          <div className="font-semibold text-foreground text-right">{selectedPolicyView?.clientName ?? "—"}</div>

          <div className="text-muted-foreground">Carrier</div>
          <div className="font-semibold text-foreground text-right">{selectedPolicyView?.carrier ?? "—"}</div>

          <div className="text-muted-foreground">Policy Number</div>
          <div className="font-semibold text-foreground text-right">{selectedPolicyView?.policyNumber ?? "—"}</div>

          <div className="text-muted-foreground">Agent</div>
          <div className="font-semibold text-foreground text-right">{selectedPolicyView?.agentName ?? "—"}</div>
        </div>

        <Separator />

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading verification...</div>
        ) : error ? (
          <div className="text-sm text-red-600">{error}</div>
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
                      {fieldName === "phone_number" ? (
                        <Button
                          type="button"
                          size="sm"
                          className="h-6 text-[11px] px-2 bg-blue-600 hover:bg-blue-700 text-white"
                          onClick={() => void checkDnc(itemId)}
                          disabled={dncCheckingItemId === itemId}
                        >
                          {dncCheckingItemId === itemId ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Phone className="h-3 w-3 mr-1" />}
                          Check
                        </Button>
                      ) : null}
                      {fieldName === "phone_number" && phoneDncStatusByItem[itemId] ? (
                        <Badge
                          variant={phoneDncStatusByItem[itemId] === "tcpa" ? "destructive" : phoneDncStatusByItem[itemId] === "dnc" ? "outline" : "secondary"}
                          className="text-[10px]"
                        >
                          {phoneDncStatusByItem[itemId].toUpperCase()}
                        </Badge>
                      ) : null}
                      <div className="text-[11px] text-muted-foreground">{checked ? "Verified" : "Pending"}</div>
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          void onToggleVerification(itemId, Boolean(v));
                        }}
                      />
                    </div>
                  </div>

                  <Input value={value} onChange={(e) => void onUpdateValue(itemId, e.target.value)} className="text-xs" />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={showUnderwritingModal} onOpenChange={setShowUnderwritingModal}>
        <DialogContent
          className="w-[98vw] max-w-[98vw] sm:max-w-[98vw] h-[96vh] max-h-[96vh] overflow-y-auto"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          showCloseButton={false}
        >
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-purple-700">Underwriting</DialogTitle>
            <DialogDescription className="text-base">
              Please read the following script to the customer and verify all information.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4 text-xl">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.35fr] gap-6 items-stretch">
              <div className="bg-gray-50 p-4 rounded-lg border h-full overflow-y-auto">
                <h4 className="font-bold text-2xl mb-3">Underwriting Questions</h4>

                <div className="space-y-4 text-xl">
                  <p className="font-medium">
                    "I am going to ask you some medical questions and we expect your honesty that is going to save us a lot of time. And, this will help us evaluate which insurance carrier comes back with the maximum benefit at the lowest rates for you."
                  </p>

                  <div className="space-y-3 p-4 bg-white rounded-lg border">
                    <p className="font-bold text-xl">Question 1:</p>
                    <p className="text-lg">Have you ever been diagnosed or treated for Alzheimer's Dementia, Congestive heart failure, organ transplant, HIV, AIDS, ARC, Leukemia, Tuberculosis, chronic Respiratory disease, currently paralyzed, amputation due to a disease? Are you currently hospitalized in a nursing facility? Due to a disease are you currently confined to a wheelchair? Are you currently on oxygen?</p>
                  </div>

                  <div className="space-y-3 p-4 bg-white rounded-lg border">
                    <p className="font-bold text-xl">Question 2:</p>
                    <p className="text-lg">In the last 5 years, have you had any heart attacks, cancers, Alzheimer's, dementia, congestive heart failure, kidney failure or an organ removal? Have you ever had any disorders of the kidney, lung, brain, heart, circulatory system or liver? Or In the last 3 years have you been diagnosed and treated for leukemia, sickle cell anemia, brain disorder, Alzheimer's or dementia, aneurysm, diabetic coma, amputation due to any disease, cirrhosis of the liver, Multiple Sclerosis, chronic respiratory disease, tuberculosis, chronic pneumonia, hepatitis? Or In the last 2 years if you had any stents, pacemaker, defibrillator, valve replacement, stroke, TIA or paralysis?</p>
                  </div>

                  <div className="space-y-3 p-4 bg-white rounded-lg border">
                    <p className="font-bold text-xl">Question 3:</p>
                    <p className="text-lg">Or if you have any complications from diabetes? Like (Neuropathy, amputation due to diabetes, retinopathy, diabetic coma, etc) Have you been treated or diagnosed with COPD, Bipolar, or schizophrenia?</p>
                  </div>

                  <div className="mt-4 p-3 bg-yellow-50 rounded border border-yellow-200">
                    <p className="font-bold mb-2 text-xl">Tobacco Usage:</p>
                    <p className="text-lg">Have you consumed any tobacco or nicotine products in the last 12 months?</p>
                    <div className="flex gap-4 mt-2">
                      <label className="flex items-center gap-2 text-xl">
                        <input
                          type="radio"
                          name="tobacco"
                          checked={underwritingData.tobaccoLast12Months === "yes"}
                          onChange={() => setUnderwritingData({ ...underwritingData, tobaccoLast12Months: "yes" })}
                        />
                        Yes
                      </label>
                      <label className="flex items-center gap-2 text-xl">
                        <input
                          type="radio"
                          name="tobacco"
                          checked={underwritingData.tobaccoLast12Months === "no"}
                          onChange={() => setUnderwritingData({ ...underwritingData, tobaccoLast12Months: "no" })}
                        />
                        No
                      </label>
                    </div>
                  </div>

                  <p className="font-medium text-xl mt-4">Lastly, do you have any health conditions or take any prescribed medication on a regular basis?</p>

                  <div className="p-4 bg-white rounded-lg border">
                    <p className="font-bold text-xl">Follow Up:</p>
                    <ul className="list-disc ml-6 text-lg mt-2">
                      <li>How many medications are you taking on a daily basis?</li>
                      <li>Do you know what those medications are for?</li>
                      <li>Do you have your medications, or a list of your medications nearby?</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="bg-white border-2 border-purple-200 rounded-lg overflow-hidden flex flex-col">
                <div className="bg-purple-600 text-white px-4 py-2 font-bold text-lg flex justify-between items-center flex-shrink-0">
                  <span>Insurance Toolkit</span>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setToolkitUrl("https://insurancetoolkits.com/fex/quoter")}
                    >
                      Quote Tool
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs text-white border-white hover:bg-purple-700"
                      onClick={() => setToolkitUrl("https://insurancetoolkits.com/login")}
                    >
                      Login
                    </Button>
                  </div>
                </div>
                <div className="border-2 border-purple-300 rounded-lg overflow-hidden bg-white flex-1" style={{ minHeight: "600px" }}>
                  <iframe
                    style={{ border: "none", height: "100%", width: "100%" }}
                    src={toolkitUrl}
                    title="Insurance Toolkit"
                    id="healthKitIframe"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xl font-bold">Health Conditions:</Label>
              <div className="rounded-md border p-3 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {underwritingData.healthConditions.map((tag, idx) => (
                    <Badge key={`${tag}-${idx}`} variant="secondary" className="text-base px-3 py-1 gap-2">
                      {tag}
                      <button type="button" onClick={() => removeTag("healthConditions", idx)} aria-label={`Remove ${tag}`}>
                        x
                      </button>
                    </Badge>
                  ))}
                </div>
                <Input
                  value={conditionInput}
                  onChange={(e) => setConditionInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag(conditionInput, "healthConditions");
                      setConditionInput("");
                    }
                  }}
                  placeholder="Type and press Enter to add conditions..."
                  className="text-xl h-12"
                />
              </div>
              <p className="text-sm text-gray-500">Click on conditions above to add them, or type custom conditions.</p>
            </div>

            <div className="space-y-2">
              <Label className="text-xl font-bold">Medications:</Label>
              <div className="rounded-md border p-3 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {underwritingData.medications.map((tag, idx) => (
                    <Badge key={`${tag}-${idx}`} variant="secondary" className="text-base px-3 py-1 gap-2">
                      {tag}
                      <button type="button" onClick={() => removeTag("medications", idx)} aria-label={`Remove ${tag}`}>
                        x
                      </button>
                    </Badge>
                  ))}
                </div>
                <Input
                  value={medicationInput}
                  onChange={(e) => setMedicationInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag(medicationInput, "medications");
                      setMedicationInput("");
                    }
                  }}
                  placeholder="Type and press Enter to add medications..."
                  className="text-xl h-12"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xl font-bold">Height:</Label>
                <Input
                  value={underwritingData.height}
                  onChange={(e) => setUnderwritingData({ ...underwritingData, height: e.target.value })}
                  placeholder="e.g., 5 ft 10 in"
                  className="text-xl h-12"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xl font-bold">Weight:</Label>
                <Input
                  value={underwritingData.weight}
                  onChange={(e) => setUnderwritingData({ ...underwritingData, weight: e.target.value })}
                  placeholder="e.g., 180 lbs"
                  className="text-xl h-12"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xl font-bold">Carrier:</Label>
                <Input
                  value={underwritingData.carrier}
                  onChange={(e) => setUnderwritingData({ ...underwritingData, carrier: e.target.value })}
                  placeholder="e.g., AMAM"
                  className="text-xl h-12"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xl font-bold">Product Level:</Label>
                <Input
                  value={underwritingData.productLevel}
                  onChange={(e) => setUnderwritingData({ ...underwritingData, productLevel: e.target.value })}
                  placeholder="e.g., Preferred"
                  className="text-xl h-12"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xl font-bold">Coverage Amount:</Label>
                <Input
                  value={underwritingData.coverageAmount}
                  onChange={(e) => setUnderwritingData({ ...underwritingData, coverageAmount: e.target.value })}
                  placeholder="e.g., $10,000"
                  className="text-xl h-12"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xl font-bold">Monthly Premium:</Label>
                <Input
                  value={underwritingData.monthlyPremium}
                  onChange={(e) => setUnderwritingData({ ...underwritingData, monthlyPremium: e.target.value })}
                  placeholder="e.g., $50.00"
                  className="text-xl h-12"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4 flex-col gap-2">
            <div className="text-sm text-gray-600 text-center">
              Clicking "Save & Verify All" will save all fields below to the verification panel and mark them as verified.
            </div>
            <div className="flex gap-2 w-full">
              <Button type="button" variant="outline" className="text-lg px-6 flex-1" onClick={() => setShowUnderwritingModal(false)}>
                Cancel
              </Button>
              <Button type="button" className="text-lg px-6 bg-green-600 hover:bg-green-700 flex-1" onClick={saveUnderwritingToVerification}>
                Save & Verify All
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDncModal} onOpenChange={setShowDncModal}>
        <DialogContent className={phoneDncStatus === "tcpa" ? "border-red-500 max-w-2xl" : "max-w-2xl"}>
          <DialogHeader>
            <DialogTitle className={phoneDncStatus === "tcpa" ? "text-red-600 text-2xl" : phoneDncStatus === "dnc" ? "text-orange-600 text-2xl" : "text-blue-600 text-2xl"}>
              {phoneDncStatus === "tcpa" ? "TCPA LITIGATOR WARNING" : phoneDncStatus === "dnc" ? "Do Not Call List" : "Phone Verification"}
            </DialogTitle>
            <DialogDescription className="text-base">
              {phoneDncStatus === "tcpa"
                ? "This number is flagged as a TCPA Litigator. Proceeding may result in legal issues."
                : "Please read the following script to the customer to obtain verbal consent."}
            </DialogDescription>
          </DialogHeader>

          {phoneDncStatus === "tcpa" ? (
            <div className="py-4">
              <p className="text-red-600 font-bold text-center text-2xl">WARNING: This number is a TCPA LITIGATOR</p>
              <p className="text-lg text-gray-600 text-center mt-3">This number has been flagged as a TCPA litigator. It is recommended to not proceed with this lead.</p>
            </div>
          ) : (
            <div className="py-4">
              {phoneDncStatus === "dnc" ? (
                <p className="text-orange-600 text-lg font-bold mb-3">This number is on the Do Not Call list.</p>
              ) : null}
              <div className="bg-gray-50 p-6 rounded-lg border-2 border-gray-200 space-y-3">
                <p className="text-lg font-medium">Is your phone number <span className="text-blue-600 font-bold">{pendingPhoneVerification ? verificationInputValues[pendingPhoneVerification] ?? "" : ""}</span> on the Federal, National or State Do Not Call List?</p>
                <p className="text-gray-500 text-sm">If a customer says no and we see it is on DNC, we still need verbal consent.</p>
                <p className="text-lg font-medium">Sir/Ma'am, even if your phone number is on the Federal National or State Do Not Call list, do we still have your permission to call you and submit your application for insurance to <span className="text-blue-600 font-bold">{getVerificationFieldValue("carrier") || selectedPolicyView?.carrier || "selected carrier"}</span> via your phone number <span className="text-blue-600 font-bold">{pendingPhoneVerification ? verificationInputValues[pendingPhoneVerification] ?? "" : ""}</span>? And do we have your permission to call you on the same phone number in the future if needed?</p>
                <p className="text-base text-gray-600 font-semibold">Make sure you get a clear YES on it.</p>
              </div>
              {dncMessage ? <p className="mt-3 text-sm text-muted-foreground">{dncMessage}</p> : null}
            </div>
          )}

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={handleDncModalCancel} className="text-lg px-6 py-3">
              Cancel
            </Button>
            {phoneDncStatus !== "tcpa" ? (
              <Button onClick={handleDncModalConfirm} className="text-lg px-6 py-3 bg-green-600 hover:bg-green-700">
                I Got Verbal Consent - Proceed
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

