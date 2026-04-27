"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAccess } from "@/components/access-context";

const HOURS = Array.from({ length: 14 }, (_, i) => i + 8); // 8am to 9pm EST

export default function CallbackCalendarPage() {
  const [schedules, setSchedules] = useState<{
    id: string;
    submission_id: string;
    deal_id?: string;
    client_name: string | null;
    phone_number: string | null;
    scheduled_at: string;
    status: string;
  }[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date();
    // Get EST time
    const estTime = new Date(now.getTime() - (now.getTimezoneOffset() - 4 * 60) * 60 * 1000);
    estTime.setHours(12, 0, 0, 0);
    return estTime;
  });
  const access = useAccess();
  const profileId = access?.access?.profileId;
  console.log("[callback-calendar] Access profileId:", profileId);

  const loadSchedules = useCallback(async () => {
    setLoading(true);
    try {
      console.log("[callback-calendar] Starting load with profileId:", profileId);

      if (!profileId) {
        console.log("[callback-calendar] No profile ID found");
        setSchedules([]);
        return;
      }

      // Get all schedules for this profile with their call_back_deals id
      const { data: allSchedules, error } = await supabase
        .from("callback_schedule")
        .select("id, submission_id, client_name, phone_number, scheduled_at, status")
        .eq("agent_profile_id", profileId)
        .eq("status", "scheduled")
        .order("scheduled_at", { ascending: true });

      if (!allSchedules || allSchedules.length === 0) {
        console.log("[callback-calendar] No schedules found for profile:", profileId);
        setSchedules([]);
        return;
      }

      // Get the submission_ids and look up call_back_deals ids
      const submissionIds = allSchedules.map(s => s.submission_id).filter(Boolean);
      const { data: dealsData } = await supabase
        .from("call_back_deals")
        .select("id, submission_id")
        .in("submission_id", submissionIds);

      const dealIdMap = new Map((dealsData ?? []).map(d => [d.submission_id, d.id]));

      // Map the deal IDs to schedules
      const schedulesWithDealId = allSchedules.map(s => ({
        ...s,
        deal_id: dealIdMap.get(s.submission_id) || s.submission_id
      }));

      console.log("[callback-calendar] Raw schedules:", schedulesWithDealId);

      if (!schedulesWithDealId || schedulesWithDealId.length === 0) {
        console.log("[callback-calendar] No schedules found for profile:", profileId);
        setSchedules([]);
        return;
      }

      // Filter by current date
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const day = currentDate.getDate();
      
      const startOfDay = new Date(Date.UTC(year, month, day, 4, 0, 0, 0));
      const endOfDay = new Date(Date.UTC(year, month, day, 27, 59, 59, 999));

      const filtered = schedulesWithDealId.filter((s) => {
        const scheduled = new Date(s.scheduled_at);
        return scheduled >= startOfDay && scheduled <= endOfDay;
      });

      console.log("[callback-calendar] Filtered schedules:", filtered);
      console.log("[callback-calendar] Schedules state:", schedules);
      setSchedules(filtered);
    } catch (error) {
      console.error("[callback-calendar] Load error:", error);
    } finally {
      setLoading(false);
    }
  }, [currentDate, profileId]);

  useEffect(() => {
    void loadSchedules();
  }, [loadSchedules]);

  const getSchedulesForHour = (hour: number) => {
    return schedules.filter((s) => {
      const scheduled = new Date(s.scheduled_at);
      // Convert UTC to EST hour
      let estHour = scheduled.getUTCHours() - 4;
      if (estHour < 0) estHour += 24;
      return estHour === hour;
    });
  };

  const formatHour = (hour: number) => {
    if (hour === 0 || hour === 24) return "12AM";
    if (hour < 12) return `${hour}AM`;
    if (hour === 12) return "12PM";
    return `${hour - 12}PM`;
  };

  const toEstDate = (date: Date) => {
    const estOffset = -4 * 60 * 1000;
    return new Date(date.getTime() + estOffset - (date.getTimezoneOffset() * 60 * 1000));
  };

  const prevDay = () => {
    const prev = toEstDate(currentDate);
    prev.setDate(prev.getDate() - 1);
    setCurrentDate(prev);
  };

  const nextDay = () => {
    const next = toEstDate(currentDate);
    next.setDate(next.getDate() + 1);
    setCurrentDate(next);
  };

  const today = () => {
    const now = new Date();
    const estNow = toEstDate(now);
    setCurrentDate(estNow);
  };

  return (
    <div className="w-full px-4 py-6 min-h-screen bg-muted/20">
      <div className="w-full">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>My Callback Calendar</CardTitle>
                <CardDescription>Your scheduled callbacks for {currentDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={prevDay}>
                  Prev
                </Button>
                <Button variant="outline" size="sm" onClick={today}>
                  Today
                </Button>
                <Button variant="outline" size="sm" onClick={nextDay}>
                  Next
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void loadSchedules()} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center p-12 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                Loading...
              </div>
            ) : (
              <div className="divide-y">
                {HOURS.map((hour) => {
                  const hourSchedules = getSchedulesForHour(hour);
                  return (
                    <div key={hour} className="flex min-h-[60px]">
                      <div className="w-20 py-3 px-2 text-right text-sm text-muted-foreground font-medium shrink-0 border-r">
                        {formatHour(hour)}
                      </div>
                      <div className="flex-1 py-2 px-3 flex flex-wrap gap-2">
                        {hourSchedules.length === 0 ? (
                          <div className="text-sm text-muted-foreground/50">-</div>
                        ) : (
                          hourSchedules.map((schedule) => {
                            const utcDate = new Date(schedule.scheduled_at);
                            // Convert to EST for display
                            let estTime = new Date(utcDate.getTime() - 4 * 60 * 60 * 1000);
                            const time = estTime.toLocaleTimeString("en-US", {
                              hour: "numeric",
                              minute: "2-digit",
                            });
                            return (
                              <div
                                key={schedule.id}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm"
                              >
                                <span className="font-medium">{schedule.client_name ?? "Unknown"}</span>
                                <span className="text-xs opacity-80">({schedule.phone_number ?? "—"})</span>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="ml-2 h-6 text-xs"
                                  asChild
                                >
                                  <a href={`/agent/call-back-deal-details?id=${schedule.deal_id}`}>View</a>
                                </Button>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}