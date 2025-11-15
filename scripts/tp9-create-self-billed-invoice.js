// ============================================================================
// AIRTABLE SCRIPT: TP9 - Create Self-Billed Invoice (Purchase Order)
// ============================================================================
// Trigger: Airtable automation AT-P6 when "Bill Updated At" populated
// Purpose: Create self-billed invoice (Xero PO with Billed status) for tutor
//
// SETUP INSTRUCTIONS:
// 1. In Airtable Automations, create a new automation
// 2. Trigger: "When record matches conditions"
//    - Table: Tutoring Packages
//    - Conditions: When "Bill Updated At" is not empty
//                  AND "Self-Billed Invoice Created At" is empty
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

    // Webhook URLs for Create Self-Billed Invoice (handled in n8n)
    WEBHOOKS: {
        PRODUCTION: 'https://n8n.stryvacademics.com/webhook/tp9-create-self-billed-invoice',
        TEST: 'https://n8n.stryvacademics.com/webhook-test/tp9-create-self-billed-invoice',
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
        PAYOUTS: 'Payouts',
        LESSONS: 'Lessons',
        ADMIN_NOTIFICATIONS: 'Admin Notifications'
    },

    // Tutoring Packages field names
    PACKAGE_FIELDS: {
        PACKAGE_ID: 'Package ID',
        XERO_BILL_ID: 'Xero Bill ID',
        TUTOR_XERO_CONTACT_ID: 'Tutor Xero Contact ID',
        TOTAL_HOURS_EXPECTED: 'Total Hours Expected',
        TUTOR_HOURLY_INCOME: 'Hourly Tutor Income',
        PRE_MIGRATION_PACKAGE: 'Pre-Migration Package',
        PRE_MIGRATION_HOURS_DELIVERED: 'Pre-Migration Hours Delivered',
        TOTAL_HOURS_DELIVERED: 'Total Hours Delivered',
        TOTAL_PAYOUT_AMOUNT: 'Total Payout Amount',
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
        LESSONS: 'Lessons',
        PAYOUT_RECORD: 'Payout'
    },

    // Payouts field names
    PAYOUT_FIELDS: {
        XERO_PO_ID: 'Xero PO ID',
        SELF_BILLED_INVOICE_PDF: 'Self-Billed Invoice PDF',
        TUTORING_PACKAGE: 'Tutoring Package'
    },

    // Lesson fields
    LESSON_FIELDS: {
        LESSON_ID: 'Lesson ID',
        LESSON_DATE: 'Lesson Date',
        LESSON_DURATION: 'Lesson Duration',
        HOURS_COUNTED: 'Hours Counted'
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
 * Call webhook to create PO and poll for Payout record updates
 */
async function callPOWebhookAndWait(packageRecordId, poData, payoutRecordId) {
    const webhookUrl = CONFIG.WEBHOOKS.USE_TEST ? CONFIG.WEBHOOKS.TEST : CONFIG.WEBHOOKS.PRODUCTION;

    console.log(`Calling PO creation webhook: ${webhookUrl}`);

    const MAX_WEBHOOK_ATTEMPTS = CONFIG.WEBHOOK_CONFIG.RETRY_ATTEMPTS;
    const MAX_POLLING_ATTEMPTS = CONFIG.WEBHOOK_CONFIG.POLLING_ATTEMPTS;

    // STEP 1: Call the webhook with retries
    let webhookSuccess = false;

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
                    payoutRecordId: payoutRecordId,
                    poData: poData
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

    // STEP 2: Poll for PO PDF in Payouts record
    console.log(`Polling for Self-Billed Invoice PDF in Payout record (max ${MAX_POLLING_ATTEMPTS} attempts)...`);

    const payoutsTbl = base.getTable(CONFIG.TABLES.PAYOUTS);

    for (let pollAttempt = 1; pollAttempt <= MAX_POLLING_ATTEMPTS; pollAttempt++) {
        console.log(`Poll attempt ${pollAttempt}/${MAX_POLLING_ATTEMPTS}...`);

        if (pollAttempt > 1) {
            busyWait(CONFIG.WEBHOOK_CONFIG.POLLING_DELAY_ITERATIONS);
        }

        const payoutsQuery = await payoutsTbl.selectRecordsAsync({
            fields: [CONFIG.PAYOUT_FIELDS.SELF_BILLED_INVOICE_PDF, CONFIG.PAYOUT_FIELDS.XERO_PO_ID]
        });

        const payoutRecord = payoutsQuery.getRecord(payoutRecordId);

        if (payoutRecord) {
            const poPDF = payoutRecord.getCellValue(CONFIG.PAYOUT_FIELDS.SELF_BILLED_INVOICE_PDF);
            const xeroPoId = payoutRecord.getCellValue(CONFIG.PAYOUT_FIELDS.XERO_PO_ID);

            if (poPDF && Array.isArray(poPDF) && poPDF.length > 0 && xeroPoId) {
                console.log(`✅ Self-Billed Invoice PDF and Xero PO ID found in Payout record`);
                return {
                    success: true,
                    payoutRecordId: payoutRecordId,
                    xeroPoId: xeroPoId,
                    poPdfUrl: poPDF[0].url
                };
            } else {
                console.log(`PO data not yet complete (poll ${pollAttempt}/${MAX_POLLING_ATTEMPTS})`);
            }
        } else {
            console.error(`Payout record ${payoutRecordId} not found`);
            throw new Error(`Payout record ${payoutRecordId} not found during polling`);
        }
    }

    throw new Error(`Failed to find complete PO data after ${MAX_POLLING_ATTEMPTS} polling attempts.`);
}


// ============================================================================
// MAIN FUNCTION
// ============================================================================

async function createSelfBilledInvoice(packageRecordId) {
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
            tutorXeroContactId: safeString(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.TUTOR_XERO_CONTACT_ID)),
            totalHoursExpected: safeNumber(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.TOTAL_HOURS_EXPECTED)),
            tutorHourlyIncome: safeNumber(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.TUTOR_HOURLY_INCOME)),
            preMigrationPackage: packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.PRE_MIGRATION_PACKAGE) || false,
            preMigrationHoursDelivered: safeNumber(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.PRE_MIGRATION_HOURS_DELIVERED)),
            totalHoursDelivered: safeNumber(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.TOTAL_HOURS_DELIVERED)),
            totalPayoutAmount: safeNumber(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.TOTAL_PAYOUT_AMOUNT)),
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
        if (!packageData.tutorXeroContactId) {
            throw new Error('Tutor Xero Contact ID is missing');
        }

        console.log('Package Data:', JSON.stringify(packageData, null, 2));

        // Fetch all lessons for package summary
        const lessonsLinks = packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.LESSONS);
        let lessonsData = [];

        if (lessonsLinks && lessonsLinks.length > 0) {
            console.log(`Fetching ${lessonsLinks.length} lessons...`);

            const lessonsTbl = base.getTable(CONFIG.TABLES.LESSONS);
            const lessonsQuery = await lessonsTbl.selectRecordsAsync({
                fields: Object.values(CONFIG.LESSON_FIELDS)
            });

            for (const lessonLink of lessonsLinks) {
                const lessonRecord = lessonsQuery.getRecord(lessonLink.id);
                if (lessonRecord) {
                    lessonsData.push({
                        lessonId: safeString(lessonRecord.getCellValue(CONFIG.LESSON_FIELDS.LESSON_ID)),
                        lessonDate: formatDate(lessonRecord.getCellValue(CONFIG.LESSON_FIELDS.LESSON_DATE)),
                        lessonDuration: safeNumber(lessonRecord.getCellValue(CONFIG.LESSON_FIELDS.LESSON_DURATION)),
                        hoursCounted: safeNumber(lessonRecord.getCellValue(CONFIG.LESSON_FIELDS.HOURS_COUNTED))
                    });
                }
            }

            console.log(`✅ Fetched ${lessonsData.length} lessons`);
        }

        // Get Payout record ID (should be linked)
        const payoutLinks = packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.PAYOUT_RECORD);
        if (!payoutLinks || payoutLinks.length === 0) {
            throw new Error('Payout record not linked to package');
        }
        const payoutRecordId = payoutLinks[0].id;

        console.log(`Payout Record ID: ${payoutRecordId}`);

        // Call webhook to create PO in Xero and attach PDF
        const poData = {
            ...packageData,
            lessonsData: lessonsData
        };

        const result = await callPOWebhookAndWait(packageRecordId, poData, payoutRecordId);

        console.log(`✅ PO created and PDF attached to Payout record`);
        console.log(`Xero PO ID: ${result.xeroPoId}`);

        // Create success notification
        await createAdminNotification(
            `✅ Self-Billed Invoice Created - ${packageData.packageId}`,
            `Self-billed invoice (Purchase Order) successfully created in Xero.

Package: ${packageData.packageId}
Tutor: ${packageData.tutorName}
Student: ${packageData.studentName}
Xero PO ID: ${result.xeroPoId}
Payout Record ID: ${payoutRecordId}
Total Payout Amount: ${packageData.totalPayoutAmount}
Pre-Migration Package: ${packageData.preMigrationPackage ? 'Yes' : 'No'}

This will trigger AT-P7 to send PO email to tutor.`,
            'Regular',
            'Packages',
            'Completed'
        );

        console.log('✅ TP9: Create Self-Billed Invoice - COMPLETE');

    } catch (error) {
        console.error('❌ Error in createSelfBilledInvoice:', error);

        // Create error notification and send email
        await createAdminNotification(
            `🚨 CRITICAL ERROR: Self-Billed Invoice Failed`,
            `Failed to create self-billed invoice (PO) for tutor.

Package Record ID: ${packageRecordId}
Error: ${error.message}

Action Required: URGENT - Tutor is waiting for PO to sign. Review error and manually create PO in Xero.`,
            'Urgent',
            'System Error',
            'Pending'
        );

        await sendEmailNotification(
            `🚨 CRITICAL: Self-Billed Invoice Failed - ${packageRecordId}`,
            `Failed to create self-billed invoice (PO) for package ${packageRecordId}.

Error: ${error.message}

Action Required: URGENT - Tutor is waiting for PO to sign. Review error and manually create PO in Xero.`
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
        console.log('TP9: CREATE SELF-BILLED INVOICE (PURCHASE ORDER)');
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

        await createSelfBilledInvoice(packageRecordId);

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
