// ============================================================================
// AIRTABLE SCRIPT: TP7 - Send Completion Email
// ============================================================================
// Trigger: Airtable automation AT-P11 when ALL conditions met:
//          - "Invoice Updated At" populated
//          - "Package Report Generated At" populated
//          - No additional fees OR "Additional Fees Invoice Created At" populated
//          - "Completion Email Sent At" is empty
// Purpose: Send package completion email with appropriate template and PDFs
//
// SETUP INSTRUCTIONS:
// 1. In Airtable Automations, create a new automation
// 2. Trigger: "When record matches conditions"
//    - Table: Tutoring Packages
//    - Conditions: When "Invoice Updated At" is not empty
//                  AND "Package Report Generated At" is not empty
//                  AND "Completion Email Sent At" is empty
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

    // Webhook URL for Sending Email (handled in n8n)
    WEBHOOKS: {
        PRODUCTION: 'https://n8n.stryvacademics.com/webhook/tp7-send-completion-email',
        TEST: 'https://n8n.stryvacademics.com/webhook-test/tp7-send-completion-email',
        USE_TEST: false
    },

    // Table Names
    TABLES: {
        TUTORING_PACKAGES: 'Tutoring Packages',
        PAYMENTS: 'Payments',
        ADMIN_NOTIFICATIONS: 'Admin Notifications'
    },

    // Tutoring Packages field names
    PACKAGE_FIELDS: {
        PACKAGE_ID: 'Package ID',
        STUDENT_NAME: 'Student Name',
        TUTOR_NAME: 'Tutor Name',
        SUBJECT: 'Subject(s)',
        TOTAL_HOURS_DELIVERED: 'Total Hours Delivered',
        COMPLETION_DATE: 'Completion Date',
        PACKAGE_INVOICE_STATUS: 'Package Invoice Status',
        PACKAGE_REPORT_PDF: 'Package Report PDF',
        BASE_INVOICE_PAYMENT_RECORD: 'Base Invoice Payment Record',
        ADDITIONAL_FEES_INVOICE_PAYMENT_RECORD: 'Additional Fees Invoice Payment Record',
        CLIENT_EMAIL: 'Client Email',
        CLIENT_FIRST_NAME: 'Client First Name',
        COMPLETION_EMAIL_SENT_AT: 'Client Package Completion Email Sent At'
    },

    // Payments field names
    PAYMENT_FIELDS: {
        INVOICE_PDF: 'Invoice PDF',
        PAYMENT_ID: 'Payment ID'
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
        return 'N/A';
    }
    try {
        const date = new Date(dateValue);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    } catch (error) {
        return 'N/A';
    }
}

/**
 * Get single select name
 */
function getSingleSelectName(selectValue, defaultValue = null) {
    if (!selectValue || typeof selectValue !== 'object') {
        return defaultValue;
    }
    return selectValue.name || defaultValue;
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

async function sendCompletionEmail(packageRecordId) {
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
            studentName: safeString(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.STUDENT_NAME)),
            tutorName: safeString(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.TUTOR_NAME)),
            subject: safeString(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.SUBJECT)),
            totalHoursDelivered: safeNumber(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.TOTAL_HOURS_DELIVERED)),
            completionDate: formatDate(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.COMPLETION_DATE)),
            packageInvoiceStatus: getSingleSelectName(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.PACKAGE_INVOICE_STATUS)),
            clientEmail: safeString(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.CLIENT_EMAIL)),
            clientFirstName: safeString(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.CLIENT_FIRST_NAME))
        };

        // Validate required fields
        if (!packageData.clientEmail) {
            throw new Error('Client Email is missing');
        }

        console.log('Package Data:', JSON.stringify(packageData, null, 2));

        // Determine email template variant
        const isPaid = packageData.packageInvoiceStatus === 'Paid';

        // Check if additional fees exist
        const additionalFeesPaymentLinks = packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.ADDITIONAL_FEES_INVOICE_PAYMENT_RECORD);
        const hasAdditionalFees = additionalFeesPaymentLinks && additionalFeesPaymentLinks.length > 0;

        let emailTemplate;
        if (isPaid && !hasAdditionalFees) {
            emailTemplate = 'TEMPLATE_A'; // Paid, No Fees
        } else if (isPaid && hasAdditionalFees) {
            emailTemplate = 'TEMPLATE_B'; // Paid, With Fees
        } else if (!isPaid && !hasAdditionalFees) {
            emailTemplate = 'TEMPLATE_C'; // Unpaid, No Fees
        } else {
            emailTemplate = 'TEMPLATE_D'; // Unpaid, With Fees
        }

        console.log(`Email Template: ${emailTemplate}`);

        // Fetch PDFs
        const pdfsToAttach = {
            packageReportPdf: null,
            baseInvoicePdf: null,
            additionalFeesInvoicePdf: null
        };

        // 1. Always fetch Package Report PDF
        const packageReportPDF = packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.PACKAGE_REPORT_PDF);
        if (packageReportPDF && Array.isArray(packageReportPDF) && packageReportPDF.length > 0) {
            pdfsToAttach.packageReportPdf = packageReportPDF[0].url;
            console.log('✅ Package Report PDF found');
        } else {
            console.log('⚠️ Package Report PDF not found');
        }

        // 2. Fetch Base Invoice PDF if unpaid
        if (!isPaid) {
            const baseInvoicePaymentLinks = packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.BASE_INVOICE_PAYMENT_RECORD);
            if (baseInvoicePaymentLinks && baseInvoicePaymentLinks.length > 0) {
                const paymentsTbl = base.getTable(CONFIG.TABLES.PAYMENTS);
                const paymentsQuery = await paymentsTbl.selectRecordsAsync({
                    fields: [CONFIG.PAYMENT_FIELDS.INVOICE_PDF]
                });

                const basePaymentRecord = paymentsQuery.getRecord(baseInvoicePaymentLinks[0].id);
                if (basePaymentRecord) {
                    const baseInvoicePDF = basePaymentRecord.getCellValue(CONFIG.PAYMENT_FIELDS.INVOICE_PDF);
                    if (baseInvoicePDF && Array.isArray(baseInvoicePDF) && baseInvoicePDF.length > 0) {
                        pdfsToAttach.baseInvoicePdf = baseInvoicePDF[0].url;
                        console.log('✅ Base Invoice PDF found');
                    }
                }
            }
        }

        // 3. Fetch Additional Fees Invoice PDF if exists
        if (hasAdditionalFees) {
            const paymentsTbl = base.getTable(CONFIG.TABLES.PAYMENTS);
            const paymentsQuery = await paymentsTbl.selectRecordsAsync({
                fields: [CONFIG.PAYMENT_FIELDS.INVOICE_PDF]
            });

            const additionalFeesPaymentRecord = paymentsQuery.getRecord(additionalFeesPaymentLinks[0].id);
            if (additionalFeesPaymentRecord) {
                const additionalFeesInvoicePDF = additionalFeesPaymentRecord.getCellValue(CONFIG.PAYMENT_FIELDS.INVOICE_PDF);
                if (additionalFeesInvoicePDF && Array.isArray(additionalFeesInvoicePDF) && additionalFeesInvoicePDF.length > 0) {
                    pdfsToAttach.additionalFeesInvoicePdf = additionalFeesInvoicePDF[0].url;
                    console.log('✅ Additional Fees Invoice PDF found');
                }
            }
        }

        console.log('PDFs to attach:', JSON.stringify(pdfsToAttach, null, 2));

        // Call webhook to send email (n8n handles email templates and sending)
        const webhookUrl = CONFIG.WEBHOOKS.USE_TEST ? CONFIG.WEBHOOKS.TEST : CONFIG.WEBHOOKS.PRODUCTION;
        console.log(`Calling email webhook: ${webhookUrl}`);

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                packageRecordId: packageRecordId,
                packageData: packageData,
                emailTemplate: emailTemplate,
                pdfs: pdfsToAttach
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Email webhook failed: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        console.log('Email sent successfully:', JSON.stringify(result));

        // Update Airtable record
        await packagesTbl.updateRecordAsync(packageRecordId, {
            [CONFIG.PACKAGE_FIELDS.COMPLETION_EMAIL_SENT_AT]: new Date().toISOString()
        });

        console.log('✅ Completion Email Sent At timestamp set');

        // Create success notification
        await createAdminNotification(
            `✅ Completion Email Sent - ${packageData.packageId}`,
            `Package completion email successfully sent.

Package: ${packageData.packageId}
Student: ${packageData.studentName}
Client Email: ${packageData.clientEmail}
Template: ${emailTemplate}
Invoice Status: ${packageData.packageInvoiceStatus}
Has Additional Fees: ${hasAdditionalFees ? 'Yes' : 'No'}`,
            'Regular',
            'Packages',
            'Completed'
        );

        console.log('✅ TP7: Send Completion Email - COMPLETE');

    } catch (error) {
        console.error('❌ Error in sendCompletionEmail:', error);

        // Create error notification (mark for manual follow-up)
        await createAdminNotification(
            `🚨 ERROR: Completion Email Failed`,
            `Failed to send package completion email.

Package Record ID: ${packageRecordId}
Error: ${error.message}

Action Required: Email marked as "Not Sent", queue for manual follow-up.`,
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
        console.log('TP7: SEND COMPLETION EMAIL');
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

        await sendCompletionEmail(packageRecordId);

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
