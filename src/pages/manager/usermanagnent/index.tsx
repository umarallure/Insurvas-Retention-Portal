import * as React from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function UserManagementPage() {
  return (
    <div className="w-full px-8 py-10 min-h-screen bg-muted/20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">User Management</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Administrative page to create, edit, deactivate users and assign roles (Retention Agent / Sales Manager).
          </p>
        </div>
        <Button type="button">Add User</Button>
      </div>

      <div className="mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Users</CardTitle>
            <CardDescription>Add, edit, reset password, and assign roles (placeholder).</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Input placeholder="Search by name or email..." />
              <div className="flex gap-2">
                <Button variant="secondary" type="button">
                  Filter: Role
                </Button>
                <Button variant="secondary" type="button">
                  Filter: Status
                </Button>
              </div>
            </div>

            <div className="rounded-md border">
              <div className="grid grid-cols-4 gap-3 p-3 text-sm font-medium text-muted-foreground">
                <div>Name</div>
                <div>Email</div>
                <div>Role</div>
                <div>Status</div>
              </div>
              <div className="border-t p-3 text-sm text-muted-foreground">No users loaded.</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
