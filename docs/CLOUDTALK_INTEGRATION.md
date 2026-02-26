# CloudTalk Campaign Integration - Retention Portal

## Overview
This integration automatically adds leads to CloudTalk campaigns when they are assigned to agents in the Retention Portal. Leads are added as contacts with agent-specific tags, which automatically route them to the correct agent's parallel dialer campaign.

## How It Works

### 1. Campaign Setup (One-time, in CloudTalk Dashboard)
- Each agent has their own campaign (e.g., Campaign ID: 293641 for Hussain)
- Each campaign is configured to "Select contacts by tags"
- Each agent has a unique tag (e.g., Tag ID: 1165830 for Hussain)
- The campaign monitors this tag and automatically adds any contact with that tag to the dialing queue

### 2. Lead Assignment Flow
When a manager assigns a lead to an agent:

1. **Assignment Saved**: Lead is saved to `retention_assigned_leads` table
2. **CloudTalk Contact Created**: System automatically:
   - Formats the phone number (adds +1 for US numbers)
   - Parses the name into first/last name
   - Creates a contact in CloudTalk with the agent's tag
   - Contact automatically appears in agent's campaign queue

### 3. Automatic Routing
- Contact is created with agent's tag (e.g., Tag 1165830)
- CloudTalk campaign detects the new contact with that tag
- Contact is added to the agent's parallel dialer queue
- Agent sees the lead in their CloudTalk dashboard immediately

## Current Configuration (Hardcoded)

**Hussain's Config:**
- Agent ID: `530325`
- Campaign ID: `293641`
- Tag ID: `1165830`

**Note:** Currently, ALL agents use Hussain's config. To add more agents:
1. Create a campaign for each agent in CloudTalk dashboard
2. Create a unique tag for each agent
3. Update `RetentionPortal/src/lib/cloudtalk/contact.ts` to add agent mappings

## Files Created/Modified

### New Files:
1. **`src/lib/cloudtalk/contact.ts`**
   - CloudTalk contact API integration
   - Handles phone formatting, name parsing
   - Maps agent profile IDs to CloudTalk configs

2. **`src/pages/api/cloudtalk/contact/add.ts`**
   - Server-side API proxy
   - Securely handles CloudTalk API credentials
   - Validates input and formats data

### Modified Files:
1. **`src/pages/manager/assign-lead/index.tsx`**
   - Added CloudTalk contact creation after single lead assignment
   - Non-blocking (assignment succeeds even if CloudTalk fails)

2. **`src/components/manager/assign-lead/bulk-assign-modal.tsx`**
   - Added CloudTalk contact creation after bulk assignment
   - Processes contacts in batches (fire-and-forget)

## API Flow

```
Manager assigns lead
    ↓
Save to retention_assigned_leads
    ↓
Call /api/cloudtalk/contact/add
    ↓
Server: Format phone, parse name
    ↓
Server: Call CloudTalk API
    ↓
CloudTalk: Create contact with agent's tag
    ↓
CloudTalk Campaign: Auto-adds contact to queue
    ↓
Agent: Sees lead in CloudTalk dashboard
```

## Environment Variables Required

Add these to your `.env.local`:
```env
NEXT_PUBLIC_CLOUDTALK_ACCOUNT_ID=MKOSQ9VM4BFPG5Y6BDIOCMJC
NEXT_PUBLIC_CLOUDTALK_API_SECRET=L2m4vwQfCG?84OMKX5speLKoll.qw4Ns5reC5ylreZcIX
```

## Error Handling

- CloudTalk contact creation is **non-blocking**
- If CloudTalk API fails, the assignment still succeeds
- Errors are logged to console but don't interrupt the workflow
- This ensures assignment always works even if CloudTalk is down

## Testing

1. Assign a lead to Hussain (or any agent using default config)
2. Check CloudTalk dashboard - contact should appear in campaign queue
3. Verify contact has the correct tag (1165830)
4. Agent should see the lead in their parallel dialer

## Future Enhancements

1. **Multi-Agent Support**: Add database table to map profile IDs to CloudTalk configs
2. **Error Notifications**: Optionally notify managers if CloudTalk sync fails
3. **Retry Logic**: Retry failed CloudTalk API calls
4. **Contact Deduplication**: Check if contact already exists before creating
5. **Update Existing Contacts**: Update tag if lead is reassigned to different agent

## Notes

- Phone numbers are automatically formatted with +1 for US numbers
- Names are parsed into first/last name (falls back to "Unknown Contact" if missing)
- Contacts are created with the agent's tag, which routes them to the correct campaign
- No need to edit campaigns after initial setup - just add contacts with tags
