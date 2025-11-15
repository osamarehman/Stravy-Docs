# Airtable Lead Conversion Automation - Setup Guide

## Overview

This guide explains how to set up the **Convert Lead to Client** automation in Airtable. The automation creates User, Parent, and/or Student records when a lead is marked for conversion.

## Problem Fixed

**Original Issue**: The script was failing with "Lead ID not provided" error because the automation wasn't configured to pass the record ID to the script.

**Solution**: The fixed script now:
- Accepts multiple input variable name formats
- Provides clear error messages with setup instructions
- Handles missing fields gracefully
- Includes comprehensive logging for debugging

## Files

- **Script File**: `/scripts/airtable-convert-lead-to-client-FIXED.js`
- **Documentation**: This file

## Prerequisites

Before setting up the automation, ensure you have:

1. **Admin User ID**: Replace `CONFIG.ADMIN_USER_ID` in the script with your actual admin user ID
2. **Webhook URLs**: Verify the n8n webhook URLs in `CONFIG.WEBHOOKS` are correct
3. **Convert to Client Field**: (Optional) Add a checkbox field named "Convert to Client" to the Leads table
   - Field Type: Checkbox
   - Field Name: Convert to Client

## Automation Setup Steps

### Step 1: Create a New Automation

1. In your Airtable base, click **Automations** in the top toolbar
2. Click **Create automation**
3. Name it: "Convert Lead to Client"

### Step 2: Configure the Trigger

**Option A: Using "Convert to Client" Checkbox (Recommended)**

1. Click **Add trigger**
2. Select **When record matches conditions**
3. Configure:
   - **Table**: Leads
   - **View**: All Leads (or your preferred view)
   - **Conditions**:
     - When "Convert to Client" is checked
     - AND "Lead Status" is not "Converted"

**Option B: Manual Button Trigger**

1. Click **Add trigger**
2. Select **When button clicked**
3. Configure:
   - **Table**: Leads
   - Add a button field to trigger the conversion

### Step 3: Add the Script Action

1. Click **Add action**
2. Select **Run a script**
3. Copy the entire content from `/scripts/airtable-convert-lead-to-client-FIXED.js`
4. Paste it into the script editor

### Step 4: Configure Input Variables (CRITICAL)

This is the most important step that fixes the "Lead ID not provided" error:

1. In the script action, click **Configure input variables**
2. Click **+ Add variable**
3. Configure the variable:
   - **Variable name**: `leadRecordId`
   - **Value**: Click in the value field and select the **Record ID** from the trigger step
     - It will appear as a blue pill/chip
     - Look for: "Record ID" from the trigger step

**Example Configuration**:
```
Variable name: leadRecordId
Value: [Record ID from step 1: When record matches conditions]
```

### Step 5: Test the Automation

1. Click **Test automation** in the top right
2. Select a test lead record
3. Review the execution log:
   - Should see: "LEAD CONVERSION SCRIPT STARTED"
   - Should see: "Input config received: {...}"
   - Should see: "CONVERTING LEAD: recXXXXXXXXXX"

### Step 6: Turn On the Automation

1. If the test was successful, toggle the automation **ON**
2. Monitor the first few conversions to ensure everything works correctly

## Workflow Logic

The script performs the following steps:

### For Parent Leads:

1. **Validates** required parent and student information
2. **Creates Parent User** record with status "Active"
3. **Calls Xero webhook** and waits for Xero Contact ID
4. **Creates Parent** record linked to User
5. **Creates Student User** record (dependent) with generated email if needed
6. **Creates Student** record linked to both User and Parent
7. **Updates Lead** record:
   - Status → "Converted"
   - Links to Parent and Student records
   - Sets Converted At date
8. **Creates Admin Notification** with success details

### For Independent Student Leads:

1. **Validates** required student information
2. **Creates Student User** record with status "Active"
3. **Calls Xero webhook** and waits for Xero Contact ID
4. **Creates Student** record linked to User (no parent)
5. **Updates Lead** record:
   - Status → "Converted"
   - Links to Student record
   - Sets Converted At date
6. **Creates Admin Notification** with success details

### On Error:

1. **Rolls back** all created records
2. **Unchecks** "Convert to Client" checkbox (if exists)
3. **Creates Admin Notification** with error details

## Configuration Options

Edit these constants in the script to customize behavior:

### Admin Settings
```javascript
ADMIN_USER_ID: 'usrZy7b3Gx6C2hu6Z'  // Your admin user ID for notifications
```

### Webhook Settings
```javascript
WEBHOOKS: {
    PRODUCTION: 'https://n8n.stryvacademics.com/webhook/...',
    TEST: 'https://n8n.stryvacademics.com/webhook-test/...',
    USE_TEST: false  // Set to true for testing
}
```

### Retry/Polling Settings
```javascript
WEBHOOK_CONFIG: {
    RETRY_ATTEMPTS: 3,          // Webhook retry attempts
    POLLING_ATTEMPTS: 15,       // Xero ID polling attempts
    POLLING_DELAY_ITERATIONS: 100000  // Delay between polls
}
```

## Troubleshooting

### Error: "Lead ID not provided"

**Cause**: Input variable not configured correctly

**Solution**:
1. Check Step 4 above
2. Ensure variable name is exactly: `leadRecordId`
3. Ensure value is the Record ID pill from the trigger step
4. Test the automation again

### Error: "Lead record not found"

**Cause**: Wrong record ID being passed

**Solution**:
1. Verify you're selecting the correct Record ID from the trigger
2. Check the automation execution log for the actual ID being passed

### Error: "Missing required parent/student information"

**Cause**: Required fields are empty in the lead record

**Solution**:
1. Check the lead record has all required fields filled:
   - **Parent Lead**: Parent First Name, Last Name, Email, Student First Name, Last Name
   - **Student Lead**: Student First Name, Last Name, Email

### Error: "Failed to get Xero Contact ID after polling"

**Cause**: Xero webhook taking too long or failing

**Solutions**:
1. Check n8n webhook is running and accessible
2. Increase `POLLING_ATTEMPTS` in config
3. Check Xero integration is working
4. Review n8n logs for errors

### Lead converted but "Convert to Client" checkbox won't uncheck

**Cause**: Field doesn't exist or has different name

**Solution**:
1. Add a checkbox field named exactly: "Convert to Client"
2. Or ignore - the script will still work, just won't uncheck the box

## Email Generation for Dependent Students

If a student email is not provided for a dependent student, the script automatically generates a plus-addressed email from the parent's email:

**Format**: `parentemail+studentfirstname@domain.com`

**Example**:
- Parent Email: `john.smith@example.com`
- Student First Name: `Sarah`
- Generated Email: `john.smith+sarah@example.com`

This allows emails to be sent to the same parent inbox while maintaining separate user accounts.

## Admin Notifications

The script creates admin notifications for:

### Success Notification
- **Priority**: Regular
- **Category**: Leads
- **Status**: Completed
- **Details**: All created record IDs, Xero IDs, conversion timestamp

### Error Notification
- **Priority**: Urgent
- **Category**: System Error
- **Status**: Pending
- **Details**: Error message, lead information for manual review

## Field Mappings

### Leads → Users (Parent)
- Parent First Name → First Name
- Parent Last Name → Last Name
- Parent Email → Email
- Parent Phone → Phone
- Role: "Parent"
- Status: "Active"

### Leads → Users (Student)
- Student First Name → First Name
- Student Last Name → Last Name
- Student Email (or generated) → Email
- Student Phone (or parent phone) → Phone
- Role: "Student (Dependent)" or "Student (Independent)"
- Status: "Active"

### Leads → Students
- Grade/Year → Grade/Year
- Learning Preferences → Learning Preferences
- Academic Goals → Academic Goals
- Special Accommodations → Special Accommodations
- Preferred Days and Times → Preferred Days and Times
- Preferred Frequency → Preferred Frequency
- Preferred Modes → Preferred Modes

## Security Considerations

1. **Webhook URLs**: Keep production webhook URLs secure
2. **Admin User ID**: Ensure this is a valid admin user
3. **Rollback**: Failed conversions automatically rollback all created records
4. **Duplicate Prevention**: Script checks if lead is already converted before proceeding

## Support

For issues or questions:
1. Review the automation execution log in Airtable
2. Check the console output for detailed error messages
3. Verify all configuration settings match your base structure
4. Ensure all required fields exist in your tables

## Version History

- **v1.0** (2025-11-15): Fixed "Lead ID not provided" error, improved error handling and logging
