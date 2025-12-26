import * as React from "react";
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

type VerificationItem = {
  label: string;
  value: string;
  verified: boolean;
};

const verificationItems: VerificationItem[] = [
  { label: "Lead Vendor", value: "Zupax Marketing", verified: true },
  { label: "Customer Full Name", value: "John Smith", verified: true },
  { label: "Date of Birth", value: "2025-12-11", verified: true },
  { label: "Age", value: "Enter age", verified: false },
  { label: "Birth State", value: "Enter birth state", verified: false },
  { label: "Social Security", value: "Enter SSN", verified: false },
  { label: "Driver License", value: "Enter DL", verified: false },
  { label: "City", value: "San Francisco, CA", verified: false },
  { label: "Phone", value: "(111) 111-1111", verified: true },
  { label: "Email", value: "john@example.com", verified: false },
];

export default function CallUpdatePage() {
  const router = useRouter();
  const [applicationSubmitted, setApplicationSubmitted] = React.useState<"yes" | "no">("yes");
  const [callSource, setCallSource] = React.useState("BPO Transfer");
  const [bufferAgent, setBufferAgent] = React.useState("Justine");
  const [licensedAgent, setLicensedAgent] = React.useState("Claudia");
  const [notes, setNotes] = React.useState("");
  const [statusStage, setStatusStage] = React.useState("");

  const verifiedCount = verificationItems.filter((i) => i.verified).length;
  const totalCount = 31;
  const progress = Math.round((verifiedCount / totalCount) * 100);

  return (
    <div className="w-full px-4 md:px-8 lg:px-10 py-6 min-h-screen bg-muted/15">
      <div className="flex flex-col gap-3 mb-6">
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

        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Update Call Result</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Update the status and details for this lead.
          </p>
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
              <span>Agent: Unknown</span>
              <Separator orientation="vertical" className="h-4" />
              <span>Time: 18:46:29</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">{verifiedCount} of {totalCount} fields verified</span>
              <span className="text-primary font-semibold">{progress}%</span>
              <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">Just Started</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2">
              {verificationItems.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between rounded-lg border bg-card px-3 py-2 shadow-[0_1px_0_rgba(0,0,0,0.02)]"
                >
                  <div className="flex items-center gap-3">
                    <Checkbox checked={item.verified} />
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.value}</p>
                    </div>
                  </div>
                  {item.verified ? (
                    <Badge variant="outline" className="border-green-500/30 text-green-700 bg-green-500/10">
                      Verified
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Pending</Badge>
                  )}
                </div>
              ))}
            </div>
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
              <CardDescription>Was the application submitted?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
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
                        <SelectValue placeholder="Select buffer agent" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Justine">Justine</SelectItem>
                        <SelectItem value="Alex">Alex</SelectItem>
                        <SelectItem value="Kim">Kim</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Agent who took the call</Label>
                    <Select value={licensedAgent} onValueChange={setLicensedAgent}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select agent" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Claudia">Claudia</SelectItem>
                        <SelectItem value="Jordan">Jordan</SelectItem>
                        <SelectItem value="Taylor">Taylor</SelectItem>
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
                        <Label>Lead Vendor</Label>
                        <Input placeholder="Zupax Marketing" defaultValue="Zupax Marketing" />
                      </div>
                      <div className="space-y-2">
                        <Label>Carrier</Label>
                        <Input placeholder="Carrier name" />
                      </div>
                      <div className="space-y-2">
                        <Label>Product</Label>
                        <Input placeholder="Product type" />
                      </div>
                      <div className="space-y-2">
                        <Label>Submission Date</Label>
                        <Input type="date" defaultValue="2025-12-11" />
                      </div>
                      <div className="space-y-2">
                        <Label>Underwriting</Label>
                        <Select defaultValue="no">
                          <SelectTrigger>
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="yes">Yes</SelectItem>
                            <SelectItem value="no">No</SelectItem>
                          </SelectContent>
                        </Select>
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

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Accident Date</Label>
                        <Input type="date" defaultValue="2025-12-11" />
                      </div>
                      <div className="space-y-2">
                        <Label>Accident Location</Label>
                        <Input defaultValue="111 Pine Street, San Francisco, CA" />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label>Scenario</Label>
                        <Textarea
                          placeholder="Describe the accident scenario..."
                          defaultValue="Lorem ipsum dolor sit amet..."
                          className="min-h-[120px]"
                        />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label>Injuries</Label>
                        <Textarea placeholder="Injury details" defaultValue="Lorem ipsum dolor sit amet..." />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label>Medical Attention</Label>
                        <Textarea placeholder="Medical attention details" defaultValue="Lorem ipsum dolor sit amet..." />
                      </div>
                      <div className="space-y-2 sm:col-span-2 grid sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Police Attended</Label>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm">Yes</Button>
                            <Button variant="outline" size="sm">No</Button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Was Insured</Label>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm">Yes</Button>
                            <Button variant="outline" size="sm">No</Button>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2 sm:col-span-2 grid sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Vehicle Registration</Label>
                          <Input placeholder="Enter registration" />
                        </div>
                        <div className="space-y-2">
                          <Label>Insurance Company</Label>
                          <Input placeholder="Insurance company" />
                        </div>
                      </div>
                      <div className="space-y-2 sm:col-span-2 grid sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Third Party Vehicle Registration</Label>
                          <Input placeholder="Enter registration" />
                        </div>
                        <div className="space-y-2">
                          <Label>Other Party Admitted Fault</Label>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm">Yes</Button>
                            <Button variant="outline" size="sm">No</Button>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2 sm:col-span-2 grid sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Number of Passengers</Label>
                          <Input type="number" min={0} defaultValue={1} />
                        </div>
                        <div className="space-y-2">
                          <Label>Prior Attorney Involved</Label>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm">Yes</Button>
                            <Button variant="outline" size="sm">No</Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              <div className="flex items-center justify-end gap-3">
                <Button variant="outline">Cancel</Button>
                <Button>Save Call Result</Button>
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
              <Textarea placeholder="Load details..." className="min-h-[96px]" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
