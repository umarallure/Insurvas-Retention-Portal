# After Hours & Draft Date Logic Documentation

## 1. After Hours Lead Hiding Logic (5 PM Rule)

### Location
- **File**: `RetentionPortal/src/lib/agent/after-hours-filter.ts`
- **Used in**: `RetentionPortal/src/pages/agent/assigned-leads/index.tsx`

### Purpose
Hides certain leads from agents after 5 PM NY time to prevent dialing leads that can't be handled because carrier customer service is closed.

### How It Works

#### Time Window
- **Restricted Hours**: 5:00 PM - 9:00 AM (next day) NY time
- Uses `America/New_York` timezone
- Logic: `hour >= 17 OR hour < 9`

#### Conditions for Hiding
A lead is hidden if **ALL** of the following are true:

1. **Current time is in restricted hours** (5 PM - 9 AM NY time)
2. **Carrier is restricted**:
   - Aetna
   - RNA (Royal Neighbors)
   - Transamerica
3. **Category is restricted**:
   - "Failed Payment"
   - "Pending Lapse"

#### Code Flow

```typescript
shouldHideLeadAfterHours(ghlStage, carrier)
  ↓
1. Check if current NY time is 5 PM - 9 AM
   └─ isInRestrictedHoursNY()
      └─ Returns: hour >= 17 || hour < 9
  ↓
2. Check if carrier is restricted
   └─ isRestrictedCarrier(carrier)
      └─ Checks: AETNA, RNA, TRANSAMERICA
  ↓
3. Check if category matches
   └─ getDealCategoryAndTagFromGhlStage(ghlStage)
      └─ Returns category: "Failed Payment" or "Pending Lapse"
  ↓
4. Returns true if ALL conditions met
```

#### Where It's Applied

**In Assigned Leads Page** (`/agent/assigned-leads`):
```typescript
const filteredLeads = sourceLeads.filter((row) => {
  const shouldHide = shouldHideLeadAfterHours(
    row.deal?.ghl_stage ?? null,
    row.deal?.carrier ?? null
  );
  if (shouldHide) {
    return false; // Hide this lead
  }
  // ... other filters
});
```

### Example Scenarios

| Time (NY) | Carrier | Category | Hidden? | Reason |
|-----------|---------|----------|---------|--------|
| 4:00 PM | Aetna | Failed Payment | ❌ No | Before 5 PM |
| 5:30 PM | Aetna | Failed Payment | ✅ Yes | After 5 PM + Restricted carrier + Restricted category |
| 6:00 PM | Aetna | New Sale | ❌ No | Category not restricted |
| 6:00 PM | Liberty | Failed Payment | ❌ No | Carrier not restricted |
| 8:00 AM | Aetna | Failed Payment | ✅ Yes | Still in restricted hours (before 9 AM) |
| 10:00 AM | Aetna | Failed Payment | ❌ No | Outside restricted hours |

---

## 2. Draft Date Logic

### Location
- **File**: `RetentionPortal/src/lib/fixed-policies/draft-date-status.ts`
- **Helper**: `RetentionPortal/src/lib/fixed-policies/business-days.ts`
- **Used in**: 
  - Manager Fixed Policies page
  - Handled policies tracking
  - Policy status confirmation

### Purpose
Tracks draft dates for policies and determines when managers need to confirm policy status after the draft date has passed.

### How It Works

#### Key Concepts

1. **Draft Date**: The date when a policy payment is scheduled to be drafted
2. **Business Days**: Excludes weekends (Saturday & Sunday)
3. **Eastern Time**: All calculations use `America/New_York` timezone
4. **Confirmation Rule**: After 2+ business days past draft date, manager needs to confirm status

#### Status Calculation

```typescript
getDraftDateStatus(draftDate, statusWhenFixed)
  ↓
1. Convert draft date to Eastern Time at midnight
2. Get today in Eastern Time at midnight
3. Calculate business days since draft date
4. Determine if draft is future or past
5. Calculate status message and confirmation needs
```

#### Status Messages

**Future Draft Dates:**
- `businessDaysUntil === 0`: "Draft today" (green/success)
- `businessDaysUntil === 1`: "Draft tomorrow" (green/success)
- `businessDaysUntil > 1`: "Draft in X business days" (default)

**Past Draft Dates:**
- `businessDaysSince === 0`: "Draft date today" (yellow/warning)
- `businessDaysSince === 1`: "1 business day past draft" (yellow/warning)
- `businessDaysSince < 2`: "X business days past draft" (yellow/warning)
- `businessDaysSince >= 2`: "X business days past draft" (red/destructive) + **Needs Confirmation**

#### Confirmation Logic

**Needs Confirmation When:**
- Draft date has passed (`!isFuture`)
- 2 or more business days have elapsed (`businessDaysSince >= 2`)

**Confirmation Message:**
- If status requires 3-day wait: `"⚠️ Confirm status: Should be 'Successful Draft' or 'Failed Payment after Fix'"`
  - Applies to: "Policy Dredraft/Redated" or statuses containing "dredraft"
- Otherwise: `"⚠️ Confirm status: Check if policy status needs update"`

#### Business Days Calculation

**Location**: `RetentionPortal/src/lib/fixed-policies/business-days.ts`

```typescript
calculateBusinessDaysSince(date)
  ↓
1. Convert date to Eastern Time at midnight
2. Get today in Eastern Time at midnight
3. If date is future → return 0
4. Count business days (exclude weekends) from date to today
5. Return count
```

**Weekend Exclusion:**
- Saturday (day === 6) → Excluded
- Sunday (day === 0) → Excluded
- Monday-Friday → Included

### Example Scenarios

#### Scenario 1: Future Draft
- **Draft Date**: Friday, Jan 12
- **Today**: Monday, Jan 8
- **Business Days Until**: 4 (Mon, Tue, Wed, Thu)
- **Status**: "Draft in 4 business days" (default)
- **Needs Confirmation**: ❌ No

#### Scenario 2: Draft Today
- **Draft Date**: Monday, Jan 8
- **Today**: Monday, Jan 8
- **Business Days Since**: 0
- **Status**: "Draft today" (success/green)
- **Needs Confirmation**: ❌ No

#### Scenario 3: 1 Day Past Draft
- **Draft Date**: Friday, Jan 5
- **Today**: Monday, Jan 8 (weekend in between)
- **Business Days Since**: 1 (only Monday counted)
- **Status**: "1 business day past draft" (warning/yellow)
- **Needs Confirmation**: ❌ No

#### Scenario 4: 2+ Days Past Draft (Needs Confirmation)
- **Draft Date**: Monday, Jan 1
- **Today**: Thursday, Jan 4
- **Business Days Since**: 3 (Mon, Tue, Wed, Thu)
- **Status**: "3 business days past draft" (destructive/red)
- **Needs Confirmation**: ✅ Yes
- **Message**: "⚠️ Confirm status: Should be 'Successful Draft' or 'Failed Payment after Fix'"

#### Scenario 5: Weekend Handling
- **Draft Date**: Friday, Jan 5
- **Today**: Monday, Jan 8
- **Business Days Since**: 1 (Saturday & Sunday excluded)
- **Status**: "1 business day past draft" (warning/yellow)

### Where It's Used

1. **Manager Fixed Policies Page**:
   - Shows draft status for each policy
   - Highlights policies needing confirmation
   - Filters by "Needs Confirmation"

2. **Handled Policies Tracking**:
   - Calculates if handled policies need attention
   - Shows draft date status in table

3. **Policy Status Transitions**:
   - Determines if 3-day wait rule applies
   - Influences confirmation messages

### Visual Indicators

| Status | Color | Icon | Meaning |
|--------|-------|------|---------|
| Draft today | Green | ✅ | Draft happening today |
| Draft tomorrow | Green | ✅ | Draft tomorrow |
| Draft in X days | Default | 📅 | Future draft |
| Draft date today | Yellow | ⚠️ | Draft date is today |
| 1 day past | Yellow | ⚠️ | 1 business day past |
| 2+ days past | Red | 🚨 | Needs confirmation |

---

## Summary

### After Hours Logic
- **When**: 5 PM - 9 AM NY time
- **What**: Hides leads for Aetna/RNA/Transamerica with "Failed Payment" or "Pending Lapse" categories
- **Why**: These carriers don't work after hours
- **Where**: Agent assigned leads page

### Draft Date Logic
- **When**: Always (real-time calculation)
- **What**: Tracks business days since draft date, flags policies needing confirmation
- **Why**: Managers need to verify policy status after draft date passes
- **Where**: Manager fixed policies page, handled policies tracking

Both logics use **Eastern Time (America/New_York)** for all time calculations to ensure consistency across timezones.
