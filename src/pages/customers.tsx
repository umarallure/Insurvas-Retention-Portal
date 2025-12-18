import * as React from "react";
import { Button } from "@/components/ui/button";
import { RefreshCcw } from "lucide-react";
import { GroupedDealsView } from "@/components/customers/grouped-deals-view";

export default function CustomersPage() {
  const [mounted, setMounted] = React.useState(false);
  const [refreshToken, setRefreshToken] = React.useState(0);
  const [loading, setLoading] = React.useState(false);

  const refresh = React.useCallback(() => {
    setLoading(true);
    setRefreshToken((t) => t + 1);
    setTimeout(() => setLoading(false), 300);
  }, []);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="w-full px-8 py-10 min-h-screen bg-muted/20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Customer Pipeline</h1>
            <p className="text-muted-foreground text-sm mt-1">Real-time synchronization with your Monday.com board.</p>
        </div>
        
        <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refresh()} 
            disabled={loading}
            className="w-fit shadow-sm bg-card hover:bg-muted"
        >
            <RefreshCcw className={`mr-2 size-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? "Syncing..." : "Refresh Board"}
        </Button>
      </div>

      <div className="mx-auto">
        {mounted ? <GroupedDealsView key={refreshToken} /> : null}
      </div>
    </div>
  );
}