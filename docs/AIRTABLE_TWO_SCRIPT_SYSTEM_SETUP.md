# Airtable Lead Conversion - Two-Script System Setup Guide

## Overview

The lead conversion process is now split into **TWO separate scripts** to avoid Airtable's 30 query limit:

1. **ACTION SCRIPT** - Creates all records, links, sends webhook, creates notification
2. **POLLING SCRIPT** - Retrieves Xero Contact ID and updates the notification

This approach ensures the main conversion happens quickly without hitting query limits, while Xero ID polling happens separately.

---

## Files

- **ACTION Script**: `/scripts/airtable-convert-lead-ACTION.js`
- **POLLING Script**: `/scripts/airtable-update-xero-id-POLLING.js`
- **Documentation**: This file

---

## Why Two Scripts?

### The Problem

Airtable limits scripts to **30 table queries** per execution. The original single-script approach:
- Creates records (multiple queries)
- Polls for Xero ID up to 30 times (30 queries)
- **Result**: Exceeded the 30 query limit

### The Solution

**Split into two scripts:**

**ACTION SCRIPT** (~10-15 queries):
- Creates Parent/Student and User records
- Links all records bidirectionally
- Triggers Xero webhook
- Creates Admin Notification (status: "Pending")
- Returns User ID and Notification ID to next script

**POLLING SCRIPT** (~10-12 queries):
- Polls for Xero Contact ID (max 10 times)
- Updates Admin Notification with Xero ID
- Changes notification status to "Completed"

**Total queries**: ~20-27 (safely under 30 limit)

---

## Automation Setup

### Step 1: Create the Automation

1. In Airtable, click **Automations** → **Create automation**
2. Name it: "Convert Lead to Client (Two-Script System)"

### Step 2: Configure the Trigger

1. Click **Add trigger**
2. Select **When record matches conditions**
3. Configure:
   - **Table**: Leads
   - **View**: All Leads (or your preferred view)
   - **Conditions**:
     - When "Convert to Client" is checked
     - AND "Lead Status" is not "Converted"

### Step 3: Add ACTION Script (First Action)

1. Click **Add action**
2. Select **Run a script**
3. Copy the entire content from `/scripts/airtable-convert-lead-ACTION.js`
4. Paste it into the script editor

**Configure Input Variables:**
1. Click **Configure input variables**
2. Add variable:
   - **Variable name**: `leadRecordId`
   - **Value**: Select **Record ID** from the trigger step (blue pill)

### Step 4: Add POLLING Script (Second Action)

1. Click **Add action** (after the ACTION script)
2. Select **Run a script**
3. Copy the entire content from `/scripts/airtable-update-xero-id-POLLING.js`
4. Paste it into the script editor

**Configure Input Variables:**
1. Click **Configure input variables**
2. Add TWO variables:

   **Variable 1:**
   - **Variable name**: `userIdForXero`
   - **Value**: Select output from ACTION script → `userIdForXero`

   **Variable 2:**
   - **Variable name**: `notificationId`
   - **Value**: Select output from ACTION script → `notificationId`

### Step 5: Test the Automation

1. Click **Test automation** in the top right
2. Select a test lead record
3. Review both script execution logs:
   - **ACTION script** should show: "LEAD CONVERSION ACTION COMPLETE"
   - **POLLING script** should show: "XERO CONTACT ID POLLING COMPLETE"

### Step 6: Turn On the Automation

1. If tests were successful, toggle the automation **ON**
2. Monitor the first few conversions

---

## Workflow Details

### ACTION SCRIPT Workflow

**For Parent Leads:**
1. Validates required parent and student information
2. Creates Parent User record
3. Creates Parent record → Links to User
4. Links Parent User back to Parent record (bidirectional)
5. Creates Student User record (dependent)
6. Creates Student record → Links to User and Parent
7. Links Student User back to Student record (bidirectional)
8. Triggers Xero webhook (fire and forget)
9. Creates Admin Notification with:
   - Status: "Pending"
   - Details include User ID for Xero
10. Updates Lead record:
    - Status → "Converted"
    - Links to Parent, Student, and User records
    - Sets Converted At timestamp
11. **Outputs** to next script:
    - `userIdForXero`: Parent User ID
    - `notificationId`: Admin Notification ID

**For Independent Student Leads:**
1. Validates required student information
2. Creates Student User record
3. Creates Student record → Links to User
4. Links Student User back to Student record (bidirectional)
5. Triggers Xero webhook (fire and forget)
6. Creates Admin Notification with:
   - Status: "Pending"
   - Details include User ID for Xero
7. Updates Lead record:
   - Status → "Converted"
   - Links to Student and User records
   - Sets Converted At timestamp
8. **Outputs** to next script:
   - `userIdForXero`: Student User ID
   - `notificationId`: Admin Notification ID

### POLLING SCRIPT Workflow

1. **Receives input** from ACTION script:
   - `userIdForXero`: The User record to check
   - `notificationId`: The notification to update

2. **Polls for Xero Contact ID**:
   - Checks Users table for Xero Contact ID field
   - Max 10 attempts with 10-second delays
   - Total polling time: ~100 seconds

3. **Updates Admin Notification** when Xero ID found:
   - Updates title: Removes "Pending Xero ID" message
   - Updates details: Adds Xero Contact ID
   - Changes status: "Pending" → "Completed"

4. **On Error** (Xero ID not found):
   - Adds error message to notification
   - Sets priority to "Urgent"
   - Keeps status as "Pending" for manual review

---

## Configuration

### ACTION Script Config

```javascript
CONFIG = {
    ADMIN_USER_ID: 'usrZy7b3Gx6C2hu6Z',  // Admin for notifications

    WEBHOOKS: {
        PRODUCTION: 'https://n8n.stryvacademics.com/webhook/...',
        TEST: 'https://n8n.stryvacademics.com/webhook-test/...',
        USE_TEST: false
    },

    WEBHOOK_CONFIG: {
        RETRY_ATTEMPTS: 3  // Webhook retry attempts
    }
}
```

### POLLING Script Config

```javascript
CONFIG = {
    POLLING_CONFIG: {
        MAX_ATTEMPTS: 10,           // Polling attempts (10 × 10s = 100s total)
        DELAY_ITERATIONS: 1000000   // Busy-wait iterations (~10 seconds)
    }
}
```

---

## Lead Record Links

After successful conversion, the Lead record will be linked to:

**For Parent Leads:**
- **Link to Parents**: Parent record ID
- **Link to Students**: Student record ID
- **Link to Users**: Parent User record ID

**For Student Leads:**
- **Link to Students**: Student record ID
- **Link to Users**: Student User record ID

---

## Admin Notifications

### Initial Notification (from ACTION Script)

- **Title**: "✅ Lead Converted - Pending Xero ID - [Name]"
- **Priority**: Regular
- **Category**: Leads
- **Status**: Pending
- **Details**: Includes User ID for Xero, all created record IDs

### Updated Notification (from POLLING Script)

- **Title**: "✅ Lead Converted - Xero ID: abc123 - [Name]"
- **Priority**: Regular
- **Category**: Leads
- **Status**: Completed
- **Details**: Includes Xero Contact ID and success message

### Error Notification (if polling fails)

- **Title**: Unchanged
- **Priority**: **Urgent** (escalated)
- **Category**: Leads
- **Status**: Pending
- **Details**: Includes error message and manual action required

---

## Troubleshooting

### Error: "User ID for Xero not provided"

**Cause**: POLLING script not receiving output from ACTION script

**Solution**:
1. Check that ACTION script completed successfully
2. Verify input variables in POLLING script:
   - Variable name: `userIdForXero`
   - Value: Output from ACTION script → `userIdForXero`

### Error: "Notification ID not provided"

**Cause**: POLLING script not receiving notification ID from ACTION script

**Solution**:
1. Check that ACTION script completed successfully
2. Verify input variables in POLLING script:
   - Variable name: `notificationId`
   - Value: Output from ACTION script → `notificationId`

### Error: "Failed to get Xero Contact ID after 10 polling attempts"

**Cause**: Xero webhook taking longer than 100 seconds or failing

**Solutions**:
1. Check n8n webhook is running and accessible
2. Review n8n logs for errors
3. Check Xero integration is working
4. Manually check Users table for the User ID - Xero ID may be there
5. If Xero ID is in Users table, manually update the notification

### Notification stays "Pending" even though Xero ID exists

**Cause**: POLLING script failed to update notification

**Solution**:
1. Check POLLING script execution log for errors
2. Manually update the notification if needed
3. Verify User record has Xero Contact ID
4. Re-run POLLING script manually with the User ID and Notification ID

---

## Query Usage

### ACTION Script (~10-15 queries)
- 1 query: Read lead record
- 2-4 queries: Create records (Parent/Student/User)
- 2-4 queries: Update records (bidirectional links)
- 1 query: Create admin notification
- 1 query: Update lead record

**Total: ~10-15 queries**

### POLLING Script (~10-12 queries)
- 10 queries: Poll for Xero Contact ID (max 10 attempts)
- 1 query: Read notification
- 1 query: Update notification

**Total: ~10-12 queries**

**Combined total: ~20-27 queries** (safely under 30 limit)

---

## Benefits of Two-Script System

✅ **Avoids 30 query limit** - Each script stays well under the limit
✅ **Faster lead conversion** - Main conversion completes in ~5-10 seconds
✅ **Better error handling** - Polling errors don't rollback the conversion
✅ **Clearer logging** - Each script has focused, readable logs
✅ **More reliable** - Webhook can take time without blocking conversion
✅ **Easier to debug** - Can test/modify each script independently

---

## Version History

- **v2.0** (2025-11-15):
  - Split into two-script system (ACTION + POLLING)
  - Avoids 30 query limit issue
  - ACTION script outputs User ID and Notification ID
  - POLLING script updates notification with Xero Contact ID
  - Added "Link to Users" field linking
  - Improved error handling and notifications

- **v1.3** (2025-11-15):
  - Single-script approach with reduced polling (10 attempts)
  - Hit 30 query limit with polling included

---

## Support

For issues or questions:
1. Review both automation script logs in Airtable
2. Check console output for detailed error messages
3. Verify all configuration settings match your base structure
4. Ensure all required fields exist in your tables
5. Check n8n webhook logs if Xero ID issues occur
