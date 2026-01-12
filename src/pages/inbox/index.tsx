import * as React from "react";
import { useRouter } from "next/router";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";

import { InboxList } from "@/components/inbox/inbox-list";
import { InboxMail } from "@/components/inbox/inbox-mail";

import type { Mail } from "@/types";
import { InboxIcon } from "lucide-react";

type Tab = "all" | "unread";

export default function InboxPage() {
  const router = useRouter();
  const isMobile = useIsMobile();

  const [tab, setTab] = React.useState<Tab>("all");
  const [mails, setMails] = React.useState<Mail[]>([]);
  const [selectedMail, setSelectedMail] = React.useState<Mail | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    // Inbox is not yet implemented - show empty state
    (async () => {
      if (!cancelled) setMails([]);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredMails = React.useMemo(() => {
    if (tab === "unread") return mails.filter((m) => !!m.unread);
    return mails;
  }, [mails, tab]);

  // Reset selected mail if it's not in the filtered mails.
  React.useEffect(() => {
    if (!selectedMail) return;
    if (!filteredMails.find((m) => m.id === selectedMail.id)) {
      setSelectedMail(null);
    }
  }, [filteredMails, selectedMail]);

  // Support /inbox?id=123 (from notifications slideover).
  React.useEffect(() => {
    if (!router.isReady) return;
    const idRaw = router.query.id;
    const id = typeof idRaw === "string" ? Number.parseInt(idRaw, 10) : undefined;
    if (!id || Number.isNaN(id)) return;
    const match = mails.find((m) => m.id === id);
    if (match) setSelectedMail(match);
  }, [router.isReady, router.query.id, mails]);

  const isMailPanelOpen = !!selectedMail;

  return (
    <div className="flex w-full">
      <div className="w-full lg:w-[28%] lg:min-w-[320px] lg:max-w-[420px] border-r">
        <div className="flex h-14 items-center gap-2 border-b px-4 sm:px-6">
          <div className="text-sm font-medium">Inbox</div>
          <Badge variant="secondary" className="ml-auto">
            {filteredMails.length}
          </Badge>
        </div>

        <div className="flex items-center justify-between border-b px-4 py-2 sm:px-6">
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="unread">Unread</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {filteredMails.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-8 text-center">
            <div className="text-sm text-muted-foreground">No messages yet</div>
          </div>
        ) : (
          <InboxList
            mails={filteredMails}
            selectedMail={selectedMail}
            onSelect={(mail) => setSelectedMail(mail)}
          />
        )}
      </div>

      {/* Desktop detail panel */}
      <div className="hidden lg:flex flex-1">
        {selectedMail ? (
          <div className="w-full">
            <InboxMail mail={selectedMail} onClose={() => setSelectedMail(null)} />
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            <InboxIcon className="size-24" />
          </div>
        )}
      </div>

      {/* Mobile slideover */}
      {isMobile ? (
        <Sheet open={isMailPanelOpen} onOpenChange={(open) => !open && setSelectedMail(null)}>
          <SheetContent side="right" className="w-full p-0 sm:max-w-md">
            {selectedMail ? (
              <InboxMail mail={selectedMail} onClose={() => setSelectedMail(null)} />
            ) : null}
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  );
}
