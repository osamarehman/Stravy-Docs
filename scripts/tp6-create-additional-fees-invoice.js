// ============================================================================
// AIRTABLE SCRIPT: TP6 - Create Additional Fees Invoice
// ============================================================================
// Trigger: Airtable automation AT-P10 when:
//          - "Package Status" = "Completed"
//          - Transportation Reimbursement > 0 OR Late Cancellation Fees > 0
//            OR Over-Delivered Hours > 0
//          - "Additional Fees Invoice Created At" is empty
// Purpose: Create separate Xero invoice for additional fees
//
// SETUP INSTRUCTIONS:
// 1. In Airtable Automations, create a new automation
// 2. Trigger: "When record matches conditions"
//    - Table: Tutoring Packages
//    - Conditions: When "Package Status" = "Completed"
//                  AND (Transportation Reimbursement > 0 OR Late Cancellation Fees > 0
//                       OR Over-Delivered Hours > 0)
//                  AND "Additional Fees Invoice Created At" is empty
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

    // Webhook URLs for Create Additional Fees Invoice (handled in n8n)
    WEBHOOKS: {
        PRODUCTION: 'https://n8n.stryvacademics.com/webhook/tp6-create-additional-fees-invoice',
        TEST: 'https://n8n.stryvacademics.com/webhook-test/tp6-create-additional-fees-invoice',
        USE_TEST: false
    },

    // Webhook configuration
    WEBHOOK_CONFIG: {
        RETRY_ATTEMPTS: 3,
        POLLING_ATTEMPTS: 15,
        POLLING_DELAY_ITERATIONS: 100000
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
        TRANSPORTATION_REIMBURSEMENT: 'Transportation Reimbursement',
        LATE_CANCELLATION_FEES: 'Late Cancellation Fees',
        OVER_DELIVERED_HOURS: 'Over-Delivered Hours',
        HOURLY_SESSION_RATE: 'Hourly Session Rate',
        ADDITIONAL_FEES_INVOICE_ADJUSTMENT: 'Additional Fees Invoice Adjustment',
        ADDITIONAL_FEES_INVOICE_ADJUSTMENT_NOTE: 'Additional Fees Invoice Adjustment Note',
        STUDENT_PARENT_XERO_CONTACT_ID: 'Student/Parent Xero Contact ID',
        TUTOR_NAME: 'Tutor Name',
        STUDENT_NAME: 'Student Name',
        SUBJECT: 'Subject(s)',
        MODE: 'Mode(s)',
        HOURLY_LESSON_RATE: 'Hourly Lesson Rate',
        CONFIRMATION_DATE: 'Confirmation Date',
        COMPLETION_DATE: 'Completion Date',
        TOTAL_ADDITIONAL_FEES_INVOICE_AMOUNT: 'Total Additional Fees Invoice Amount',
        ADDITIONAL_FEES_INVOICE_CREATED_AT: 'Additional Fees Invoice Created At'
    },

    // Payments field names
    PAYMENT_FIELDS: {
        INVOICE_ID: 'Xero Invoice ID',
        PAYMENT_TYPE: 'Payment Type',
        INVOICE_PDF: 'Invoice PDF',
        TUTORING_PACKAGE: 'Tutoring Package'
    }
};


// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Busy-wait delay function
 */
function busyWait(iterations) {
    for (let i = 0; i < iterations; i++) {
        // Busy wait
    }
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
        // Email sending is handled via n8n webhook
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

/**
 * Call webhook to create invoice and poll for Payment record
 */
async function callInvoiceWebhookAndWait(packageRecordId, invoiceData) {
    const webhookUrl = CONFIG.WEBHOOKS.USE_TEST ? CONFIG.WEBHOOKS.TEST : CONFIG.WEBHOOKS.PRODUCTION;

    console.log(`Calling invoice creation webhook: ${webhookUrl}`);

    const MAX_WEBHOOK_ATTEMPTS = CONFIG.WEBHOOK_CONFIG.RETRY_ATTEMPTS;
    const MAX_POLLING_ATTEMPTS = CONFIG.WEBHOOK_CONFIG.POLLING_ATTEMPTS;

    // STEP 1: Call the webhook with retries
    let webhookSuccess = false;
    let paymentRecordId = null;

    for (let attempt = 1; attempt <= MAX_WEBHOOK_ATTEMPTS; attempt++) {
        console.log(`Webhook attempt ${attempt}/${MAX_WEBHOOK_ATTEMPTS}...`);

        try {
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    packageRecordId: packageRecordId,
                    invoiceData: invoiceData
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Webhook call failed with status ${response.status}: ${errorText}`);

                if (attempt < MAX_WEBHOOK_ATTEMPTS) {
                    console.log(`Retrying webhook...`);
                    busyWait(CONFIG.WEBHOOK_CONFIG.POLLING_DELAY_ITERATIONS);
                    continue;
                } else {
                    throw new Error(`Webhook call failed after ${MAX_WEBHOOK_ATTEMPTS} attempts`);
                }
            }

            const data = await response.json();
            console.log('Webhook response:', JSON.stringify(data));
            paymentRecordId = data.paymentRecordId;
            webhookSuccess = true;
            break;

        } catch (fetchError) {
            console.error('Webhook fetch error:', fetchError);

            if (attempt < MAX_WEBHOOK_ATTEMPTS) {
                console.log(`Retrying webhook...`);
                busyWait(CONFIG.WEBHOOK_CONFIG.POLLING_DELAY_ITERATIONS);
                continue;
            } else {
                throw new Error(`Failed to call webhook after ${MAX_WEBHOOK_ATTEMPTS} attempts: ${fetchError.message}`);
            }
        }
    }

    if (!webhookSuccess) {
        throw new Error('Webhook call failed');
    }

    // STEP 2: Poll for Invoice PDF in Payments record
    console.log(`Polling for Invoice PDF in Payment record (max ${MAX_POLLING_ATTEMPTS} attempts)...`);

    const paymentsTbl = base.getTable(CONFIG.TABLES.PAYMENTS);

    for (let pollAttempt = 1; pollAttempt <= MAX_POLLING_ATTEMPTS; pollAttempt++) {
        console.log(`Poll attempt ${pollAttempt}/${MAX_POLLING_ATTEMPTS}...`);

        if (pollAttempt > 1) {
            busyWait(CONFIG.WEBHOOK_CONFIG.POLLING_DELAY_ITERATIONS);
        }

        const paymentsQuery = await paymentsTbl.selectRecordsAsync({
            fields: [CONFIG.PAYMENT_FIELDS.INVOICE_PDF, CONFIG.PAYMENT_FIELDS.INVOICE_ID]
        });

        const paymentRecord = paymentsQuery.getRecord(paymentRecordId);

        if (paymentRecord) {
            const invoicePDF = paymentRecord.getCellValue(CONFIG.PAYMENT_FIELDS.INVOICE_PDF);

            if (invoicePDF && Array.isArray(invoicePDF) && invoicePDF.length > 0) {
                console.log(`✅ Invoice PDF found in Payment record`);
                return {
                    success: true,
                    paymentRecordId: paymentRecordId,
                    invoicePdfUrl: invoicePDF[0].url
                };
            } else {
                console.log(`Invoice PDF not yet attached (poll ${pollAttempt}/${MAX_POLLING_ATTEMPTS})`);
            }
        } else {
            console.error(`Payment record ${paymentRecordId} not found`);
            throw new Error(`Payment record ${paymentRecordId} not found during polling`);
        }
    }

    throw new Error(`Failed to find Invoice PDF after ${MAX_POLLING_ATTEMPTS} polling attempts.`);
}


// ============================================================================
// MAIN FUNCTION
// ============================================================================

async function createAdditionalFeesInvoice(packageRecordId) {
    let paymentRecordId = null;

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
            transportationReimbursement: safeNumber(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.TRANSPORTATION_REIMBURSEMENT)),
            lateCancellationFees: safeNumber(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.LATE_CANCELLATION_FEES)),
            overDeliveredHours: safeNumber(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.OVER_DELIVERED_HOURS)),
            hourlySessionRate: safeNumber(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.HOURLY_SESSION_RATE)),
            additionalFeesInvoiceAdjustment: safeNumber(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.ADDITIONAL_FEES_INVOICE_ADJUSTMENT)),
            additionalFeesInvoiceAdjustmentNote: safeString(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.ADDITIONAL_FEES_INVOICE_ADJUSTMENT_NOTE)),
            studentParentXeroContactId: safeString(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.STUDENT_PARENT_XERO_CONTACT_ID)),
            tutorName: safeString(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.TUTOR_NAME)),
            studentName: safeString(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.STUDENT_NAME)),
            subject: safeString(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.SUBJECT)),
            mode: safeString(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.MODE)),
            hourlyLessonRate: safeNumber(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.HOURLY_LESSON_RATE)),
            confirmationDate: formatDate(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.CONFIRMATION_DATE)),
            completionDate: formatDate(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.COMPLETION_DATE)),
            totalAdditionalFeesInvoiceAmount: safeNumber(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.TOTAL_ADDITIONAL_FEES_INVOICE_AMOUNT))
        };

        // Validate that there are actually additional fees
        if (packageData.transportationReimbursement <= 0 &&
            packageData.lateCancellationFees <= 0 &&
            packageData.overDeliveredHours <= 0) {
            console.log('⚠️ No additional fees to invoice. Exiting.');
            return;
        }

        // Validate required fields
        if (!packageData.studentParentXeroContactId) {
            throw new Error('Student/Parent Xero Contact ID is missing');
        }

        console.log('Package Data:', JSON.stringify(packageData, null, 2));

        // Step 1: Create Payment record first
        console.log('Creating Payment record...');
        const paymentsTbl = base.getTable(CONFIG.TABLES.PAYMENTS);

        paymentRecordId = await paymentsTbl.createRecordAsync({
            [CONFIG.PAYMENT_FIELDS.PAYMENT_TYPE]: {name: 'Additional Fees Invoice'},
            [CONFIG.PAYMENT_FIELDS.TUTORING_PACKAGE]: [{id: packageRecordId}]
        });

        console.log(`✅ Payment record created: ${paymentRecordId}`);

        // Step 2: Call webhook to create invoice in Xero and attach PDF
        const invoiceData = {
            ...packageData,
            paymentRecordId: paymentRecordId
        };

        const result = await callInvoiceWebhookAndWait(packageRecordId, invoiceData);

        console.log(`✅ Invoice created and PDF attached to Payment record`);

        // Step 3: Update Package record with timestamp
        await packagesTbl.updateRecordAsync(packageRecordId, {
            [CONFIG.PACKAGE_FIELDS.ADDITIONAL_FEES_INVOICE_CREATED_AT]: new Date().toISOString()
        });

        console.log('✅ Additional Fees Invoice Created At timestamp set');

        // Create success notification
        await createAdminNotification(
            `✅ Additional Fees Invoice Created - ${packageData.packageId}`,
            `Additional fees invoice successfully created in Xero.

Package: ${packageData.packageId}
Student: ${packageData.studentName}
Payment Record ID: ${paymentRecordId}
Total Amount: ${packageData.totalAdditionalFeesInvoiceAmount}

Breakdown:
- Over-Delivered Hours: ${packageData.overDeliveredHours} @ ${packageData.hourlyLessonRate}
- Transportation Reimbursement: ${packageData.transportationReimbursement}
- Late Cancellation Fees: ${packageData.lateCancellationFees}
- Adjustment: ${packageData.additionalFeesInvoiceAdjustment}`,
            'Regular',
            'Packages',
            'Completed'
        );

        console.log('✅ TP6: Create Additional Fees Invoice - COMPLETE');

    } catch (error) {
        console.error('❌ Error in createAdditionalFeesInvoice:', error);

        // Rollback: Delete payment record if created
        if (paymentRecordId) {
            try {
                const paymentsTbl = base.getTable(CONFIG.TABLES.PAYMENTS);
                await paymentsTbl.deleteRecordAsync(paymentRecordId);
                console.log('✅ Rolled back Payment record');
            } catch (rollbackError) {
                console.error('Failed to rollback Payment record:', rollbackError);
            }
        }

        // Create error notification and send email
        await createAdminNotification(
            `🚨 CRITICAL ERROR: Additional Fees Invoice Failed`,
            `Failed to create additional fees invoice.

Package Record ID: ${packageRecordId}
Error: ${error.message}

Action Required: URGENT - Review error and manually create invoice in Xero.`,
            'Urgent',
            'System Error',
            'Pending'
        );

        await sendEmailNotification(
            `🚨 CRITICAL: Additional Fees Invoice Failed - ${packageRecordId}`,
            `Failed to create additional fees invoice for package ${packageRecordId}.

Error: ${error.message}

Action Required: Review error and manually create invoice in Xero.`
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
        console.log('TP6: CREATE ADDITIONAL FEES INVOICE');
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

        await createAdditionalFeesInvoice(packageRecordId);

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
