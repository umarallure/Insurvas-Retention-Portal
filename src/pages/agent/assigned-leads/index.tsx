import * as React from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function AssignedLeadsPage() {
  return (
    <div className="w-full px-8 py-10 min-h-screen bg-muted/20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Assigned Leads</h1>
          <p className="text-muted-foreground text-sm mt-1">
            View all leads assigned to you so you can prioritize and choose which lead to contact next.
          </p>
        </div>
      </div>

      <div className="mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Assigned Leads</CardTitle>
            <CardDescription>
              List view with essential lead data (Name, Status, Last Contact Date). Smart Filters supported.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Input placeholder="Search by name..." />
              <div className="flex gap-2">
                <Button variant="secondary" type="button">
                  Smart Filters
                </Button>
                <Button type="button">Refresh</Button>
              </div>
            </div>

            <div className="rounded-md border">
              <div className="grid grid-cols-3 gap-3 p-3 text-sm font-medium text-muted-foreground">
                <div>Name</div>
                <div>Status</div>
                <div>Last Contact Date</div>
              </div>
              <div className="border-t p-3 text-sm text-muted-foreground">No assigned leads yet.</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
