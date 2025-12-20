import * as React from "react";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { SettingsShell } from "@/components/settings/settings-shell";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { toast } from "sonner";

const passwordSchema = z
  .object({
    current: z.string().min(8, "Must be at least 8 characters"),
    new: z.string().min(8, "Must be at least 8 characters"),
  })
  .superRefine((val, ctx) => {
    if (val.current && val.new && val.current === val.new) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["new"],
        message: "Passwords must be different",
      });
    }
  });

type PasswordSchema = z.infer<typeof passwordSchema>;

export default function SettingsSecurityPage() {
  const form = useForm<PasswordSchema>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      current: "",
      new: "",
    },
  });

  const onSubmit = (values: PasswordSchema) => {
    toast.success("Updated", { description: "Password updated." });
    console.log(values);
    form.reset();
  };

  return (
    <SettingsShell>
      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>
            Confirm your current password before setting a new one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex max-w-xs flex-col gap-4">
              <FormField
                control={form.control}
                name="current"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input type="password" placeholder="Current password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="new"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input type="password" placeholder="New password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-fit">
                Update
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-tl from-red-500/10 from-5% to-background">
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>
            No longer want to use our service? You can delete your account here. This action is not
            reversible. All information related to this account will be deleted permanently.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-end">
          <Button variant="destructive">Delete account</Button>
        </CardContent>
      </Card>
    </SettingsShell>
  );
}
