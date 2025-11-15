// ============================================================================
// AIRTABLE SCRIPT: TP4 - Update Base Package Invoice
// ============================================================================
// Trigger: Airtable automation AT-P8 when "Package Status" = "Completed"
//          and "Client Package Completion Email" is Empty
// Purpose: Update Xero invoice with package completion details
//
// SETUP INSTRUCTIONS:
// 1. In Airtable Automations, create a new automation
// 2. Trigger: "When record matches conditions"
//    - Table: Tutoring Packages
//    - Conditions: When "Package Status" = "Completed"
//                  AND "Client Package Completion Email Sent At" is empty
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

    // Webhook URLs for Update Invoice (handled in n8n)
    WEBHOOKS: {
        PRODUCTION: 'https://n8n.stryvacademics.com/webhook/tp4-update-package-invoice',
        TEST: 'https://n8n.stryvacademics.com/webhook-test/tp4-update-package-invoice',
        USE_TEST: false
    },

    // Table Names
    TABLES: {
        TUTORING_PACKAGES: 'Tutoring Packages',
        LESSONS: 'Lessons',
        ADMIN_NOTIFICATIONS: 'Admin Notifications'
    },

    // Tutoring Packages field names
    PACKAGE_FIELDS: {
        PACKAGE_ID: 'Package ID',
        PRE_MIGRATION_PACKAGE: 'Pre-Migration Package',
        PRE_MIGRATION_HOURS_DELIVERED: 'Pre-Migration Hours Delivered',
        TOTAL_HOURS_DELIVERED: 'Total Hours Delivered',
        HOURLY_SESSION_RATE: 'Hourly Session Rate',
        HOURS_DELIVERED: 'Hours Delivered', // rollup from lessons
        XERO_INVOICE_ID: 'Xero Invoice ID',
        TUTOR_NAME: 'Tutor Name',
        STUDENT_NAME: 'Student Name',
        SUBJECT: 'Subject(s)',
        MODE: 'Mode(s)',
        BASE_PACKAGE_HOURS: 'Base Package Hours',
        HOURLY_TUTOR_INCOME: 'Hourly Tutor Income',
        CONFIRMATION_DATE: 'Confirmation Date',
        COMPLETION_DATE: 'Completion Date',
        INVOICE_UPDATED_AT: 'Invoice Updated At',
        LESSONS: 'Lessons'
    },

    // Lesson fields
    LESSON_FIELDS: {
        LESSON_DATE: 'Lesson Date',
        LESSON_DURATION: 'Lesson Duration',
        HOURS_COUNTED: 'Hours Counted'
    }
};


// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Safely get a value from a cell
 */
function safeGet(value, defaultValue = null) {
    if (value === null || value === undefined || value === '') {
        return defaultValue;
    }
    return value;
}

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
        return date.toISOString().split('T')[0]; // YYYY-MM-DD
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


// ============================================================================
// MAIN FUNCTION
// ============================================================================

async function updateBasePackageInvoice(packageRecordId) {
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
            xeroInvoiceId: safeString(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.XERO_INVOICE_ID)),
            preMigrationPackage: packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.PRE_MIGRATION_PACKAGE) || false,
            preMigrationHoursDelivered: safeNumber(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.PRE_MIGRATION_HOURS_DELIVERED)),
            totalHoursDelivered: safeNumber(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.TOTAL_HOURS_DELIVERED)),
            hourlySessionRate: safeNumber(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.HOURLY_SESSION_RATE)),
            tutorName: safeString(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.TUTOR_NAME)),
            studentName: safeString(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.STUDENT_NAME)),
            subject: safeString(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.SUBJECT)),
            mode: safeString(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.MODE)),
            basePackageHours: safeNumber(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.BASE_PACKAGE_HOURS)),
            hourlyTutorIncome: safeNumber(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.HOURLY_TUTOR_INCOME)),
            confirmationDate: formatDate(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.CONFIRMATION_DATE)),
            completionDate: formatDate(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.COMPLETION_DATE))
        };

        // Validate required fields
        if (!packageData.xeroInvoiceId) {
            throw new Error('Xero Invoice ID is missing');
        }

        console.log('Package Data:', JSON.stringify(packageData, null, 2));

        // Call webhook to update invoice in Xero (n8n handles this)
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
            [CONFIG.PACKAGE_FIELDS.INVOICE_UPDATED_AT]: new Date().toISOString()
        });

        console.log('✅ Invoice Updated At timestamp set');

        // Create success notification
        await createAdminNotification(
            `✅ Invoice Updated - ${packageData.packageId}`,
            `Base package invoice successfully updated in Xero.

Package: ${packageData.packageId}
Tutor: ${packageData.tutorName}
Student: ${packageData.studentName}
Xero Invoice ID: ${packageData.xeroInvoiceId}
Total Hours Delivered: ${packageData.totalHoursDelivered}
Completion Date: ${packageData.completionDate}`,
            'Regular',
            'Packages',
            'Completed'
        );

        console.log('✅ TP4: Update Base Package Invoice - COMPLETE');

    } catch (error) {
        console.error('❌ Error in updateBasePackageInvoice:', error);

        // Create error notification
        await createAdminNotification(
            `🚨 ERROR: Invoice Update Failed`,
            `Failed to update base package invoice.

Package Record ID: ${packageRecordId}
Error: ${error.message}

Action Required: Review error and manually update invoice in Xero if needed.`,
            'Urgent',
            'System Error',
            'Pending'
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
        console.log('TP4: UPDATE BASE PACKAGE INVOICE');
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

        await updateBasePackageInvoice(packageRecordId);

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
