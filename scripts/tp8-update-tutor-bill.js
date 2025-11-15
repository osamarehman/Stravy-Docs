// ============================================================================
// AIRTABLE SCRIPT: TP8 - Update Tutor Bill
// ============================================================================
// Trigger: Airtable automation AT-P5 when "Package Status" = "Completed"
// Purpose: Update existing tutor bill in Xero with verified package details
//
// SETUP INSTRUCTIONS:
// 1. In Airtable Automations, create a new automation
// 2. Trigger: "When record matches conditions"
//    - Table: Tutoring Packages
//    - Conditions: When "Package Status" = "Completed"
// 3. Action: "Run a script"
//    - Paste this script
//    - In "Configure input variables":
//      - Variable name: packageRecordId
//      - Value: Select the Package record ID from the trigger
// ============================================================================


// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    // Admin User ID for notifications
    ADMIN_USER_ID: 'usrZy7b3Gx6C2hu6Z',

    // Webhook URLs for Update Bill (handled in n8n)
    WEBHOOKS: {
        PRODUCTION: 'https://n8n.stryvacademics.com/webhook/tp8-update-tutor-bill',
        TEST: 'https://n8n.stryvacademics.com/webhook-test/tp8-update-tutor-bill',
        USE_TEST: false
    },

    // Table Names
    TABLES: {
        TUTORING_PACKAGES: 'Tutoring Packages',
        ADMIN_NOTIFICATIONS: 'Admin Notifications'
    },

    // Tutoring Packages field names
    PACKAGE_FIELDS: {
        PACKAGE_ID: 'Package ID',
        XERO_BILL_ID: 'Xero Bill ID',
        PRE_MIGRATION_PACKAGE: 'Pre-Migration Package',
        PRE_MIGRATION_HOURS_DELIVERED: 'Pre-Migration Hours Delivered',
        TOTAL_HOURS_DELIVERED: 'Total Hours Delivered',
        HOURLY_TUTOR_INCOME: 'Hourly Tutor Income',
        TRANSPORTATION_REIMBURSEMENT: 'Transportation Reimbursement',
        LATE_CANCELLATION_FEES: 'Late Cancellation Fees',
        PAYOUT_ADJUSTMENT: 'Payout Adjustment',
        PAYOUT_ADJUSTMENT_NOTE: 'Payout Adjustment Note',
        TUTOR_NAME: 'Tutor Name',
        STUDENT_NAME: 'Student Name',
        SUBJECT: 'Subject(s)',
        MODE: 'Mode(s)',
        CONFIRMATION_DATE: 'Confirmation Date',
        COMPLETION_DATE: 'Completion Date',
        BILL_UPDATED_AT: 'Bill Updated At'
    }
};


// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Safely get a string from a cell
 */
function safeString(value, defaultValue = '') {
    if (value === null || value === undefined || value === '') {
        return defaultValue;
    }
    return String(value).trim();
}

/**
 * Safely get a number from a cell
 */
function safeNumber(value, defaultValue = 0) {
    if (value === null || value === undefined || value === '') {
        return defaultValue;
    }
    const num = Number(value);
    return isNaN(num) ? defaultValue : num;
}

/**
 * Format date for display
 */
function formatDate(dateValue) {
    if (!dateValue) {
        return null;
    }
    try {
        const date = new Date(dateValue);
        return date.toISOString().split('T')[0];
    } catch (error) {
        return null;
    }
}

/**
 * Create admin notification
 */
async function createAdminNotification(title, details, priority, category, status) {
    try {
        const adminNotificationsTbl = base.getTable(CONFIG.TABLES.ADMIN_NOTIFICATIONS);

        await adminNotificationsTbl.createRecordAsync({
            "Assigned To": [{id: CONFIG.ADMIN_USER_ID}],
            "Priority": {name: priority},
            "Notification Category": {name: category},
            "Title": String(title).substring(0, 500),
            "Details": String(details).substring(0, 10000),
            "Action Status": {name: status}
        });

        console.log('✅ Admin notification created');
    } catch (error) {
        console.error('Failed to create admin notification:', error);
    }
}

/**
 * Send email notification
 */
async function sendEmailNotification(subject, body) {
    try {
        const emailWebhook = 'https://n8n.stryvacademics.com/webhook/send-admin-email';

        await fetch(emailWebhook, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                to: 'team@stryvacademics.com',
                subject: subject,
                body: body
            })
        });

        console.log('✅ Email notification sent');
    } catch (error) {
        console.error('Failed to send email notification:', error);
    }
}


// ============================================================================
// MAIN FUNCTION
// ============================================================================

async function updateTutorBill(packageRecordId) {
    try {
        console.log(`Fetching package record: ${packageRecordId}`);

        // Fetch package record
        const packagesTbl = base.getTable(CONFIG.TABLES.TUTORING_PACKAGES);
        const packageQuery = await packagesTbl.selectRecordsAsync({
            fields: Object.values(CONFIG.PACKAGE_FIELDS)
        });
        const packageRecord = packageQuery.getRecord(packageRecordId);

        if (!packageRecord) {
            throw new Error(`Package record not found: ${packageRecordId}`);
        }

        console.log('✅ Package record found');

        // Extract package data
        const packageData = {
            packageId: safeString(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.PACKAGE_ID)),
            xeroBillId: safeString(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.XERO_BILL_ID)),
            preMigrationPackage: packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.PRE_MIGRATION_PACKAGE) || false,
            preMigrationHoursDelivered: safeNumber(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.PRE_MIGRATION_HOURS_DELIVERED)),
            totalHoursDelivered: safeNumber(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.TOTAL_HOURS_DELIVERED)),
            hourlyTutorIncome: safeNumber(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.HOURLY_TUTOR_INCOME)),
            transportationReimbursement: safeNumber(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.TRANSPORTATION_REIMBURSEMENT)),
            lateCancellationFees: safeNumber(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.LATE_CANCELLATION_FEES)),
            payoutAdjustment: safeNumber(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.PAYOUT_ADJUSTMENT)),
            payoutAdjustmentNote: safeString(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.PAYOUT_ADJUSTMENT_NOTE)),
            tutorName: safeString(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.TUTOR_NAME)),
            studentName: safeString(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.STUDENT_NAME)),
            subject: safeString(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.SUBJECT)),
            mode: safeString(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.MODE)),
            confirmationDate: formatDate(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.CONFIRMATION_DATE)),
            completionDate: formatDate(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.COMPLETION_DATE))
        };

        // Validate required fields
        if (!packageData.xeroBillId) {
            throw new Error('Xero Bill ID is missing');
        }

        console.log('Package Data:', JSON.stringify(packageData, null, 2));

        // Call webhook to update bill in Xero (n8n handles this)
        const webhookUrl = CONFIG.WEBHOOKS.USE_TEST ? CONFIG.WEBHOOKS.TEST : CONFIG.WEBHOOKS.PRODUCTION;
        console.log(`Calling webhook: ${webhookUrl}`);

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                packageRecordId: packageRecordId,
                packageData: packageData
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Webhook call failed: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        console.log('Webhook response:', JSON.stringify(result));

        // Update Airtable record
        await packagesTbl.updateRecordAsync(packageRecordId, {
            [CONFIG.PACKAGE_FIELDS.BILL_UPDATED_AT]: new Date().toISOString()
        });

        console.log('✅ Bill Updated At timestamp set');

        // Create success notification
        await createAdminNotification(
            `✅ Tutor Bill Updated - ${packageData.packageId}`,
            `Tutor bill successfully updated in Xero.

Package: ${packageData.packageId}
Tutor: ${packageData.tutorName}
Student: ${packageData.studentName}
Xero Bill ID: ${packageData.xeroBillId}
Total Hours Delivered: ${packageData.totalHoursDelivered}
Pre-Migration Package: ${packageData.preMigrationPackage ? 'Yes' : 'No'}
Completion Date: ${packageData.completionDate}

This will trigger AT-P6 to create the Billed PO.`,
            'Regular',
            'Packages',
            'Completed'
        );

        console.log('✅ TP8: Update Tutor Bill - COMPLETE');

    } catch (error) {
        console.error('❌ Error in updateTutorBill:', error);

        // Create error notification and send email
        await createAdminNotification(
            `🚨 CRITICAL ERROR: Tutor Bill Update Failed`,
            `Failed to update tutor bill in Xero.

Package Record ID: ${packageRecordId}
Error: ${error.message}

Action Required: URGENT - Tutor is waiting for payment. Review error and manually update bill in Xero.`,
            'Urgent',
            'System Error',
            'Pending'
        );

        await sendEmailNotification(
            `🚨 CRITICAL: Tutor Bill Update Failed - ${packageRecordId}`,
            `Failed to update tutor bill for package ${packageRecordId}.

Error: ${error.message}

Action Required: URGENT - Tutor is waiting for payment. Review error and manually update bill in Xero.`
        );

        throw error;
    }
}


// ============================================================================
// MAIN SCRIPT EXECUTION
// ============================================================================

(async function main() {
    try {
        console.log('='.repeat(60));
        console.log('TP8: UPDATE TUTOR BILL');
        console.log('='.repeat(60));

        // Get input
        const inputConfig = input.config();
        console.log('Input config:', JSON.stringify(inputConfig));

        const packageRecordId = inputConfig.packageRecordId || inputConfig['packageRecordId'] ||
                                inputConfig['Package ID'] || inputConfig.recordId;

        if (!packageRecordId) {
            throw new Error('Package Record ID not provided. Please configure the automation input variable.');
        }

        console.log(`Package Record ID: ${packageRecordId}\n`);

        await updateTutorBill(packageRecordId);

        console.log('\n' + '='.repeat(60));
        console.log('✅ SCRIPT COMPLETE');
        console.log('='.repeat(60));

    } catch (error) {
        console.error('\n' + '='.repeat(60));
        console.error('❌ SCRIPT FAILED');
        console.error('='.repeat(60));
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        console.error('='.repeat(60));

        throw error;
    }
})();
