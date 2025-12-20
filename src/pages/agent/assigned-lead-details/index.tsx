import * as React from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function AssignedLeadDetailsPage() {
  return (
    <div className="w-full px-8 py-10 min-h-screen bg-muted/20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Lead Details</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Access detailed lead information so you can understand the customer’s history and policy status before calling.
          </p>
        </div>
      </div>

      <div className="mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Assigned Lead Details</CardTitle>
            <CardDescription>
              Policy details, contact info, full history/notes, and lead source.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-md border p-4">
                <div className="text-sm font-medium">Contact Info</div>
                <Separator className="my-3" />
                <div className="text-sm text-muted-foreground">Name: —</div>
                <div className="text-sm text-muted-foreground">Phone: —</div>
                <div className="text-sm text-muted-foreground">Email: —</div>
              </div>

              <div className="rounded-md border p-4">
                <div className="text-sm font-medium">Policy Details</div>
                <Separator className="my-3" />
                <div className="text-sm text-muted-foreground">Policy #: —</div>
                <div className="text-sm text-muted-foreground">Status: —</div>
                <div className="text-sm text-muted-foreground">Renewal Date: —</div>
              </div>
            </div>

            <div className="rounded-md border p-4">
              <div className="text-sm font-medium">History / Notes</div>
              <Separator className="my-3" />
              <div className="text-sm text-muted-foreground">No notes yet.</div>
            </div>

            <div className="rounded-md border p-4">
              <div className="text-sm font-medium">Lead Source</div>
              <Separator className="my-3" />
              <div className="text-sm text-muted-foreground">—</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
