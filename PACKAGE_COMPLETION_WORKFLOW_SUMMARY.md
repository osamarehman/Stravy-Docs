# Package Completion Workflow - Consolidated Script

## Overview

Created a single consolidated Airtable script that replaces the 6 separate package completion scripts (TP4-TP9). This new script is more efficient, maintainable, and reduces unnecessary API calls between Airtable and n8n.

## File Location

`scripts/package-completion-workflow.js`

## How It Works

### Single Trigger
- **Trigger**: When "Package Status" = "Completed"
- **Action**: Run the consolidated script

### What the Script Does

1. **Fetches ALL Related Data** (in one pass):
   - Package data (54 fields including status, timestamps, fees, etc.)
   - All lessons data (sorted by date, oldest to newest)
   - All payments data
   - Payout data
   - Tutor data (including bank details for PO)
   - Student data
   - Parent data (including billing address)

2. **Applies Business Logic**:
   - Determines which workflows need to run based on timestamps and data
   - Identifies email template variant (A/B/C/D)
   - Validates required fields
   - Checks for additional fees

3. **Sends Comprehensive Payload to n8n**:
   - All data in one webhook call
   - Workflow flags indicating what needs to be done
   - Email template determination
   - Ready for n8n to process

## Workflows Included

The script determines and flags which of these workflows need to run:

1. **Update Base Invoice** (TP4)
   - Runs if: `Invoice Updated At` is empty AND `Xero Invoice ID` exists

2. **Generate Package Report PDF** (TP5)
   - Runs if: `Package Report Generated At` is empty

3. **Create Additional Fees Invoice** (TP6)
   - Runs if: `Additional Fees Invoice Created At` is empty AND has additional fees

4. **Send Client Completion Email** (TP7)
   - Runs if: `Client Completion Email Sent At` is empty AND prerequisites are met

5. **Update Tutor Bill** (TP8)
   - Runs if: `Bill Updated At` is empty AND `Xero Bill ID` exists

6. **Create Self-Billed Invoice/PO** (TP9)
   - Runs if: `Bill Updated At` exists

7. **Send Tutor Completion Email**
   - Runs if: `Tutor Completion Email Sent At` is empty AND bill is updated

## Email Template Variants

The script automatically determines which email template to use:

- **Template A**: Paid, No Additional Fees → Package Report PDF only
- **Template B**: Paid, With Additional Fees → Package Report + Additional Fees Invoice
- **Template C**: Unpaid, No Additional Fees → Package Report + Main Invoice
- **Template D**: Unpaid, With Additional Fees → Package Report + Both Invoices

## Data Sent to n8n

```json
{
  "metadata": {
    "airtableRecordId": "rec...",
    "processedAt": "2025-11-15T...",
    "scriptVersion": "1.0.0"
  },
  "workflows": {
    "updateBaseInvoice": true/false,
    "generatePackageReport": true/false,
    "createAdditionalFeesInvoice": true/false,
    "sendClientCompletionEmail": true/false,
    "updateTutorBill": true/false,
    "createSelfBilledInvoice": true/false,
    "sendTutorCompletionEmail": true/false
  },
  "package": { /* all package data */ },
  "lessons": [ /* array of all lessons */ ],
  "payments": [ /* array of payments */ ],
  "payout": { /* payout data */ },
  "tutor": { /* tutor data with bank details */ },
  "student": { /* student data */ },
  "parent": { /* parent data with billing address */ },
  "emailTemplate": "TEMPLATE_A" // or B, C, D
}
```

## Benefits

### Efficiency
- **Single automation trigger** instead of 6+ separate triggers
- **One webhook call** with all data instead of multiple calls
- **Reduced n8n → Airtable API calls** (n8n doesn't need to fetch data back)

### Maintainability
- **Single script to maintain** instead of 6 separate scripts
- **Consistent helper functions** and error handling
- **Clear workflow determination logic**

### Robustness
- **Comprehensive error handling** with admin notifications
- **Validation** of required fields
- **Detailed logging** for debugging
- **Graceful handling** of missing related records

### Developer Experience
- **Well-documented code** with clear sections
- **Consistent data structure** sent to n8n
- **Easy to extend** with new workflows or data

## n8n Implementation

The n8n workflow will receive the payload and:

1. **Check workflow flags** to determine what to execute
2. **Update Xero invoices/bills** using the provided data
3. **Generate PDFs**:
   - Package report (using lessons data)
   - Additional fees invoice (if needed)
4. **Update Airtable** with Xero IDs and timestamps
5. **Send emails**:
   - Render HTML templates using provided data
   - Attach appropriate PDFs based on template variant
   - Send to client/tutor
6. **Handle errors** and notify admins

## Setup in Airtable

1. Create a new automation in Airtable
2. **Trigger**: "When record matches conditions"
   - Table: `Tutoring Packages`
   - Condition: When `Package Status` = "Completed"
3. **Action**: "Run a script"
   - Copy and paste the content of `scripts/package-completion-workflow.js`
   - Configure input variable:
     - Name: `packageRecordId`
     - Value: Select the Package record ID from trigger

## Webhook Configuration

The script uses these webhook URLs:

- **Production**: `https://n8n.stryvacademics.com/webhook/31982ff6-c1f7-4ff3-a373-0f11cd6a6159`
- **Test**: `https://n8n.stryvacademics.com/webhook-test/31982ff6-c1f7-4ff3-a373-0f11cd6a6159`

Toggle between them using `CONFIG.WEBHOOKS.USE_TEST` (default: `false`)

## Testing

To test the script:

1. Set `USE_TEST: true` in the config
2. Find a completed package in Airtable
3. Temporarily clear the `Package Status` field
4. Set it back to "Completed" to trigger the automation
5. Check the automation run logs in Airtable
6. Verify the webhook was called successfully
7. Check n8n for the received payload

## Migration from Old Scripts

The old individual scripts (TP4-TP9) are still available in the `scripts/` folder for reference:

- `tp4-update-base-package-invoice.js`
- `tp5-generate-package-report-pdf.js`
- `tp6-create-additional-fees-invoice.js`
- `tp7-send-completion-email.js`
- `tp8-update-tutor-bill.js`
- `tp9-create-self-billed-invoice.js`

These can be archived or removed once the consolidated script is tested and confirmed working.

## Admin Notifications

The script creates admin notifications for:

- ✅ **Success**: When workflow is triggered successfully
- 🚨 **Errors**: When any error occurs during execution

Notifications include:
- Package ID and details
- Which workflows will execute
- Email template variant
- Error details (if applicable)

## Field Names Reference

The script uses the latest field names from the `new_base_schema.json`. All field mappings are configured in the `CONFIG` object at the top of the script.

Key field name updates handled:
- `Accrued Transportation Reimbursement` (was `Transportation Reimbursement`)
- `Accrued Late Cancellation Fees` (was `Late Cancellation Fees`)
- `Mode` (multiple select, with lookup `Mode(s)` for text)
- `Client Package Completion Email Sent At` (full field name)
- And more...

## Next Steps

1. ✅ Script created and committed
2. ⏳ Set up n8n workflow to handle the payload
3. ⏳ Test with a completed package
4. ⏳ Deploy to production
5. ⏳ Archive old individual scripts

## Support

For questions or issues:
- Check automation run logs in Airtable
- Review n8n workflow execution logs
- Check admin notifications table
- Contact the development team

---

**Created**: 2025-11-15
**Version**: 1.0.0
**Branch**: `claude/consolidate-package-completion-workflow-01LTxFiAxGAbXyJr61d9gYeK`
