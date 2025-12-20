import * as React from "react";
import * as z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const schema = z.object({
  outcome: z.string().min(1, "Select an outcome"),
  callbackAt: z.string().optional(),
  notes: z.string().min(1, "Notes are required"),
});

type FormValues = z.infer<typeof schema>;

export default function CallUpdatePage() {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      outcome: "",
      callbackAt: "",
      notes: "",
    },
  });

  const onSubmit = (values: FormValues) => {
    toast.success("Call outcome logged");
    form.reset({
      outcome: "",
      callbackAt: "",
      notes: "",
    });
    // placeholder: persist values
    void values;
  };

  return (
    <div className="w-full px-8 py-10 min-h-screen bg-muted/20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Call Update</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Log call outcomes quickly so lead status is updated instantly and accurately. Notes are mandatory.
          </p>
        </div>
      </div>

      <div className="mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Call Update</CardTitle>
            <CardDescription>Quick logging, status update, mandatory notes field.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
                <FormField
                  control={form.control}
                  name="outcome"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Outcome</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. reached, no answer, callback scheduled" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="callbackAt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Callback (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="YYYY-MM-DD HH:mm" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Required notes about the call..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end">
                  <Button type="submit">Save</Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
