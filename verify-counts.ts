/**
 * Verification script to check lead counts in the database
 * Reads from .env file and runs SELECT queries only
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// Read .env file
const envPath = path.join(__dirname, ".env");
const envContent = fs.readFileSync(envPath, "utf-8");

const envVars: Record<string, string> = {};
envContent.split("\n").forEach((line) => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith("#")) {
    const [key, ...valueParts] = trimmed.split("=");
    if (key && valueParts.length > 0) {
      const value = valueParts.join("=").trim().replace(/^["']|["']$/g, "");
      envVars[key.trim()] = value;
    }
  }
});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = envVars.SUPABASE_SERVICE_ROLE_KEY || envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Error: Missing required environment variables");
  console.error("Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

async function verifyCounts() {
  console.log("=".repeat(80));
  console.log("VERIFYING LEAD COUNTS FROM DATABASE");
  console.log("=".repeat(80));
  console.log();

  try {
    // 1. Total active deals (all is_active = true)
    console.log("1. Total Active Deals (is_active = true):");
    const { count: totalActiveCount, error: totalActiveError } = await supabase
      .from("monday_com_deals")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true);

    if (totalActiveError) {
      console.error("  ERROR:", totalActiveError.message);
    } else {
      console.log(`  Count: ${totalActiveCount ?? 0}`);
    }
    console.log();

    // 2. Active deals WITH monday_item_id (matching retention portal filter)
    console.log("2. Active Deals WITH monday_item_id (Retention Portal filter):");
    const { count: withMondayIdCount, error: withMondayIdError } = await supabase
      .from("monday_com_deals")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true)
      .not("monday_item_id", "is", null);

    if (withMondayIdError) {
      console.error("  ERROR:", withMondayIdError.message);
    } else {
      console.log(`  Count: ${withMondayIdCount ?? 0}`);
    }
    console.log();

    // 3. Active deals WITHOUT monday_item_id
    console.log("3. Active Deals WITHOUT monday_item_id:");
    const { count: withoutMondayIdCount, error: withoutMondayIdError } = await supabase
      .from("monday_com_deals")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true)
      .is("monday_item_id", null);

    if (withoutMondayIdError) {
      console.error("  ERROR:", withoutMondayIdError.message);
    } else {
      console.log(`  Count: ${withoutMondayIdCount ?? 0}`);
    }
    console.log();

    // 4. Check each category for customers page
    console.log("4. Customers Page Categories (with monday_item_id filter):");
    
    const categories = {
      "Failed Payment": [
        "FDPF Pending Reason",
        "FDPF Incorrect Banking Info",
        "FDPF Insufficient Funds",
        "FDPF Unauthorized Draft",
      ],
      "Pending Lapse": [
        "Pending Lapse",
        "Pending Lapse Pending Reason",
        "Pending Lapse Incorrect Banking Info",
        "Pending Lapse Insufficient Funds",
        "Pending Lapse Unauthorized Draft",
      ],
      "Pending Manual Action": ["Pending Manual Action"],
      "Chargeback": [
        "Chargeback Cancellation",
        "Chargeback Payment Failure",
        "Chargeback Failed Payment",
      ],
    };

    let totalCategoryCount = 0;
    for (const [category, stages] of Object.entries(categories)) {
      // Build OR query for stages
      const stageFilters = stages.map((stage) => `ghl_stage.ilike.%${stage}%`).join(",");
      
      const { count: categoryCount, error: categoryError } = await supabase
        .from("monday_com_deals")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true)
        .not("monday_item_id", "is", null)
        .or(stageFilters);

      if (categoryError) {
        console.error(`  ${category}: ERROR - ${categoryError.message}`);
      } else {
        console.log(`  ${category}: ${categoryCount ?? 0}`);
        totalCategoryCount += categoryCount ?? 0;
      }
    }
    console.log(`  Total (sum of categories): ${totalCategoryCount}`);
    console.log();

    // 5. Deals with monday_item_id but NOT matching any category
    console.log("5. Active Deals with monday_item_id but NOT in any category:");
    const allStageFilters = Object.values(categories)
      .flat()
      .map((stage) => `ghl_stage.ilike.%${stage}%`)
      .join(",");

    // Get all active deals with monday_item_id
    const { data: allActiveDeals, error: allActiveError } = await supabase
      .from("monday_com_deals")
      .select("id, ghl_stage")
      .eq("is_active", true)
      .not("monday_item_id", "is", null);

    if (allActiveError) {
      console.error("  ERROR:", allActiveError.message);
    } else {
      // Filter out deals matching categories
      const dealsInCategories = new Set<number>();
      
      // Check each deal against category stages
      for (const deal of allActiveDeals ?? []) {
        const ghlStage = (deal.ghl_stage as string)?.toLowerCase() || "";
        const matchesCategory = Object.values(categories).some((stages) =>
          stages.some((stage) => ghlStage.includes(stage.toLowerCase()))
        );
        if (matchesCategory) {
          dealsInCategories.add(deal.id);
        }
      }

      const notInCategories = (allActiveDeals ?? []).length - dealsInCategories.size;
      console.log(`  Count: ${notInCategories}`);
    }
    console.log();

    // 6. Check with date filter (last 14 days - default dashboard range)
    console.log("6. Active Deals (Last 14 Days - Default Dashboard Filter):");
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    fourteenDaysAgo.setHours(0, 0, 0, 0);
    
    const { count: last14DaysCount, error: last14DaysError } = await supabase
      .from("monday_com_deals")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true)
      .not("monday_item_id", "is", null)
      .gte("last_updated", fourteenDaysAgo.toISOString());

    if (last14DaysError) {
      console.error("  ERROR:", last14DaysError.message);
    } else {
      console.log(`  Count: ${last14DaysCount ?? 0}`);
      console.log(`  Date range: ${fourteenDaysAgo.toLocaleDateString()} to today`);
    }
    console.log();

    // 7. Check with date filter (last 30 days)
    console.log("7. Active Deals (Last 30 Days):");
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);
    
    const { count: last30DaysCount, error: last30DaysError } = await supabase
      .from("monday_com_deals")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true)
      .not("monday_item_id", "is", null)
      .gte("last_updated", thirtyDaysAgo.toISOString());

    if (last30DaysError) {
      console.error("  ERROR:", last30DaysError.message);
    } else {
      console.log(`  Count: ${last30DaysCount ?? 0}`);
    }
    console.log();

    // 8. Summary
    console.log("=".repeat(80));
    console.log("SUMMARY");
    console.log("=".repeat(80));
    console.log(`Total Active Deals (ALL TIME):         ${totalActiveCount ?? 0}`);
    console.log(`  - With monday_item_id:               ${withMondayIdCount ?? 0}`);
    console.log(`  - Without monday_item_id:            ${withoutMondayIdCount ?? 0}`);
    console.log();
    console.log(`Date Filtered Counts (with monday_item_id):`);
    console.log(`  - Last 14 days (default dashboard):  ${last14DaysCount ?? 0}`);
    console.log(`  - Last 30 days:                      ${last30DaysCount ?? 0}`);
    console.log();
    console.log(`Customers Page (with monday_item_id):`);
    console.log(`  - In categories:                     ${totalCategoryCount}`);
    console.log(`  - Not in categories:                 ${(withMondayIdCount ?? 0) - totalCategoryCount}`);
    console.log();
    console.log("Expected values:");
    console.log("  - Dashboard (with 14-day filter):    ~1930");
    console.log("  - Dashboard (no date filter):        ~4938");
    console.log("  - Retention portal (no filter):      ~4938");
    console.log("  - Customers page categories sum:     ~1559");
    console.log("=".repeat(80));

  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

verifyCounts().catch((error) => {
  console.error("Script error:", error);
  process.exit(1);
});

