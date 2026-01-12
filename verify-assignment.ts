/**
 * Verification script to check assignment profile IDs
 * Verifies the assigned_by_profile_id should be the manager's profile, not the agent's
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

async function verifyAssignment() {
  console.log("=".repeat(80));
  console.log("VERIFYING ASSIGNMENT PROFILE IDs");
  console.log("=".repeat(80));
  console.log();

  try {
    // Check the specific assignment record
    const assignmentId = "1e63883d-edf5-4d69-a677-e383cc71aeb3";
    const dealId = 1020;
    const assigneeProfileId = "1cda9534-ffb8-466b-bfaa-85b372cf7c01";

    console.log("1. Checking assignment record:");
    const { data: assignment, error: assignmentError } = await supabase
      .from("retention_assigned_leads")
      .select("*")
      .eq("id", assignmentId)
      .single();

    if (assignmentError) {
      console.error("  ERROR:", assignmentError.message);
    } else {
      console.log("  Assignment Record:");
      console.log("    ID:", assignment.id);
      console.log("    Deal ID:", assignment.deal_id);
      console.log("    Assignee Profile ID:", assignment.assignee_profile_id);
      console.log("    Assigned By Profile ID:", assignment.assigned_by_profile_id);
      console.log("    Status:", assignment.status);
      console.log("    Assigned At:", assignment.assigned_at);
      console.log();
    }

    // Get profile for assignee (Hussain Khan RA)
    console.log("2. Checking assignee profile (Hussain Khan RA):");
    const { data: assigneeProfile, error: assigneeError } = await supabase
      .from("profiles")
      .select("id, display_name, user_id")
      .eq("id", assigneeProfileId)
      .single();

    if (assigneeError) {
      console.error("  ERROR:", assigneeError.message);
    } else {
      console.log("  Assignee Profile:");
      console.log("    ID:", assigneeProfile.id);
      console.log("    Display Name:", assigneeProfile.display_name);
      console.log("    User ID:", assigneeProfile.user_id);
      console.log();
    }

    // Get profile for assigned_by (currently stored)
    console.log("3. Checking assigned_by profile (currently stored):");
    if (assignment?.assigned_by_profile_id) {
      const { data: assignedByProfile, error: assignedByError } = await supabase
        .from("profiles")
        .select("id, display_name, user_id")
        .eq("id", assignment.assigned_by_profile_id)
        .single();

      if (assignedByError) {
        console.error("  ERROR:", assignedByError.message);
      } else {
        console.log("  Assigned By Profile (currently stored):");
        console.log("    ID:", assignedByProfile.id);
        console.log("    Display Name:", assignedByProfile.display_name);
        console.log("    User ID:", assignedByProfile.user_id);
        console.log();
      }
    } else {
      console.log("  No assigned_by_profile_id found in assignment record");
      console.log();
    }

    // Get manager profile by user_id from auth.users
    console.log("4. Getting manager profile from auth.users (admin@unlimited...):");
    const managerUserId = "d3c3a396-ef9d-423b-9e62-335cdba3fd8a"; // From auth.users check
    const { data: managerProfile, error: managerProfileError } = await supabase
      .from("profiles")
      .select("id, display_name, user_id")
      .eq("user_id", managerUserId)
      .single();

    if (managerProfileError) {
      console.error("  ERROR:", managerProfileError.message);
    } else {
      console.log("  Manager Profile (should be assigned_by):");
      console.log("    ID:", managerProfile.id);
      console.log("    Display Name:", managerProfile.display_name);
      console.log("    User ID:", managerProfile.user_id);
      console.log();
    }

    // Check auth.users for manager email
    console.log("5. Checking auth.users for manager email:");
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
    
    if (authError) {
      console.error("  ERROR (need service role key for this):", authError.message);
    } else {
      const managerUsers = (authUsers?.users ?? []).filter((u) => 
        u.email?.toLowerCase().includes("admin@unlimited")
      );
      console.log(`  Found ${managerUsers.length} manager user(s) in auth:`);
      managerUsers.forEach((user, idx) => {
        console.log(`    ${idx + 1}. User ID: ${user.id}, Email: ${user.email}`);
      });
      console.log();
    }

    // Summary
    console.log("=".repeat(80));
    console.log("SUMMARY");
    console.log("=".repeat(80));
    if (assignment && assigneeProfile && managerProfile) {
      console.log(`Assignment Record:`);
      console.log(`  Deal ID: ${assignment.deal_id}`);
      console.log(`  Assignee Profile ID: ${assignment.assignee_profile_id}`);
      console.log(`    → ${assigneeProfile.display_name ?? "N/A"}`);
      console.log(`  Assigned By Profile ID (current): ${assignment.assigned_by_profile_id}`);
      console.log();
      
      if (assignment.assignee_profile_id === assignment.assigned_by_profile_id) {
        console.log("❌ ISSUE FOUND: assigned_by_profile_id is the same as assignee_profile_id");
        console.log("   Current value: Both are", assignment.assignee_profile_id);
        console.log("   This means the manager profile ID was NOT used.");
        console.log();
        console.log("   Expected:");
        console.log(`     assigned_by_profile_id should be: ${managerProfile.id}`);
        console.log(`     (Manager: ${managerProfile.display_name ?? "N/A"})`);
        console.log();
        console.log("   The fix has been applied - new assignments will use the manager's profile ID.");
      } else {
        console.log("✓ assigned_by_profile_id is different from assignee_profile_id");
        if (assignment.assigned_by_profile_id === managerProfile.id) {
          console.log("✓ assigned_by_profile_id matches manager profile ID (CORRECT)");
        } else {
          console.log("⚠ assigned_by_profile_id does NOT match manager profile ID");
          console.log(`   Expected: ${managerProfile.id} (${managerProfile.display_name})`);
          console.log(`   Current: ${assignment.assigned_by_profile_id}`);
        }
      }
    }
    console.log("=".repeat(80));

  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

verifyAssignment().catch((error) => {
  console.error("Script error:", error);
  process.exit(1);
});

