/**
 * Activity Timeline Component
 * Displays complete activity timeline from call_update_logs
 */

"use client";

import { useEffect, useState } from "react";
import { getActivityTimeline, type ActivityTimeline, type TimelineEvent } from "@/lib/activity-timeline/timeline-utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, User, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { format } from "date-fns";

interface ActivityTimelineProps {
  submissionId: string;
  className?: string;
}

export function ActivityTimeline({ submissionId, className }: ActivityTimelineProps) {
  const [timeline, setTimeline] = useState<ActivityTimeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadTimeline() {
      try {
        setLoading(true);
        setError(null);
        const data = await getActivityTimeline(submissionId);
        setTimeline(data);
      } catch (err) {
        console.error("[ActivityTimeline] Error loading timeline:", err);
        setError("Failed to load activity timeline");
      } finally {
        setLoading(false);
      }
    }

    if (submissionId) {
      loadTimeline();
    }
  }, [submissionId]);

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Activity Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-sm text-muted-foreground">Loading timeline...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Activity Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-sm text-destructive">{error}</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!timeline || timeline.events.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Activity Timeline</CardTitle>
          <CardDescription>Complete history of all activities</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-sm text-muted-foreground">No activity recorded yet</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Activity Timeline</CardTitle>
        <CardDescription>
          {timeline.totalEvents} event{timeline.totalEvents !== 1 ? "s" : ""}
          {timeline.duration && ` • Duration: ${timeline.duration}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {timeline.events.map((event, index) => (
            <TimelineEventItem
              key={event.id}
              event={event}
              isLast={index === timeline.events.length - 1}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TimelineEventItem({
  event,
  isLast,
}: {
  event: TimelineEvent;
  isLast: boolean;
}) {
  const getEventIcon = () => {
    const eventType = event.eventType.toLowerCase();
    if (eventType.includes("submitted") || eventType.includes("completed")) {
      return <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />;
    }
    if (eventType.includes("error") || eventType.includes("failed")) {
      return <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />;
    }
    if (eventType.includes("started") || eventType.includes("claimed")) {
      return <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
    }
    return <FileText className="h-4 w-4 text-gray-600 dark:text-gray-400" />;
  };

  const getEventBadgeColor = () => {
    const eventType = event.eventType.toLowerCase();
    if (eventType.includes("submitted") || eventType.includes("completed")) {
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    }
    if (eventType.includes("error") || eventType.includes("failed")) {
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    }
    if (eventType.includes("started") || eventType.includes("claimed")) {
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    }
    return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300";
  };

  return (
    <div className="relative flex gap-4">
      {/* Timeline line */}
      {!isLast && (
        <div className="absolute left-[11px] top-6 bottom-0 w-0.5 bg-border" />
      )}

      {/* Icon */}
      <div className="relative z-10 flex h-6 w-6 items-center justify-center rounded-full bg-background border-2 border-border">
        {getEventIcon()}
      </div>

      {/* Content */}
      <div className="flex-1 space-y-1 pb-4">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={getEventBadgeColor()}>
            {event.eventType
              .split("_")
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(" ")}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {event.formattedDate} at {event.formattedTime}
          </span>
        </div>

        <div className="text-sm font-medium">{event.description}</div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <User className="h-3 w-3" />
            <span>{event.agentName}</span>
            {event.agentType && (
              <span className="ml-1">({event.agentType})</span>
            )}
          </div>
          {event.isRetentionCall && (
            <Badge variant="secondary" className="text-xs">
              Retention Call
            </Badge>
          )}
        </div>

        {/* Event details (if available) */}
        {Object.keys(event.eventDetails).length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              View details
            </summary>
            <pre className="mt-2 rounded-md bg-muted p-2 text-xs overflow-auto">
              {JSON.stringify(event.eventDetails, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}


