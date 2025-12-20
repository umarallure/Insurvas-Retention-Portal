import * as React from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function RetentionDailyDealFlowPage() {
  return (
    <div className="w-full px-8 py-10 min-h-screen bg-muted/20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Retention Daily Deal Flow</h1>
          <p className="text-muted-foreground text-sm mt-1">
            View all active leads across agents. Filter by Agent, Status, or Source to monitor workload and bottlenecks.
          </p>
        </div>
      </div>

      <div className="mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>All Leads</CardTitle>
            <CardDescription>Complete deal flow for all agents (placeholder).</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <Input placeholder="Search leads (policy #, phone, name)..." />
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" type="button">
                  Filter: Agent
                </Button>
                <Button variant="secondary" type="button">
                  Filter: Status
                </Button>
                <Button variant="secondary" type="button">
                  Filter: Source
                </Button>
                <Button type="button">Refresh</Button>
              </div>
            </div>

            <div className="rounded-md border">
              <div className="grid grid-cols-4 gap-3 p-3 text-sm font-medium text-muted-foreground">
                <div>Lead</div>
                <div>Agent</div>
                <div>Status</div>
                <div>Last Updated</div>
              </div>
              <div className="border-t p-3 text-sm text-muted-foreground">No data yet.</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
