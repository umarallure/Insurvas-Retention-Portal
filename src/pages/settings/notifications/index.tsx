import * as React from "react";

import { SettingsShell } from "@/components/settings/settings-shell";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

type State = {
  email: boolean;
  desktop: boolean;
  product_updates: boolean;
  weekly_digest: boolean;
  important_updates: boolean;
};

const sections = [
  {
    title: "Notification channels",
    description: "Where can we notify you?",
    fields: [
      {
        name: "email" as const,
        label: "Email",
        description: "Receive a daily email digest.",
      },
      {
        name: "desktop" as const,
        label: "Desktop",
        description: "Receive desktop notifications.",
      },
    ],
  },
  {
    title: "Account updates",
    description: "Receive updates about Nuxt UI.",
    fields: [
      {
        name: "weekly_digest" as const,
        label: "Weekly digest",
        description: "Receive a weekly digest of news.",
      },
      {
        name: "product_updates" as const,
        label: "Product updates",
        description: "Receive a monthly email with all new features and updates.",
      },
      {
        name: "important_updates" as const,
        label: "Important updates",
        description: "Receive emails about important updates like security fixes, maintenance, etc.",
      },
    ],
  },
];

export default function SettingsNotificationsPage() {
  const [state, setState] = React.useState<State>({
    email: true,
    desktop: false,
    product_updates: true,
    weekly_digest: false,
    important_updates: true,
  });

  const onChange = (next: State) => {
    setState(next);
    console.log(next);
  };

  return (
    <SettingsShell>
      {sections.map((section) => (
        <div key={section.title}>
          <div className="mb-4">
            <div className="text-base font-semibold">{section.title}</div>
            <div className="text-sm text-muted-foreground">{section.description}</div>
          </div>

          <Card>
            <CardHeader className="sr-only">{section.title}</CardHeader>
            <CardContent className="divide-y p-0">
              {section.fields.map((field) => (
                <div
                  key={field.name}
                  className="flex items-center justify-between gap-3 p-4"
                >
                  <div className="min-w-0">
                    <Label className="text-sm">{field.label}</Label>
                    <div className="text-sm text-muted-foreground">{field.description}</div>
                  </div>
                  <Switch
                    checked={state[field.name]}
                    onCheckedChange={(checked) =>
                      onChange({
                        ...state,
                        [field.name]: checked,
                      })
                    }
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ))}
    </SettingsShell>
  );
}
