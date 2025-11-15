// ============================================================================
// AIRTABLE SCRIPT: TP5 - Generate Package Report PDF
// ============================================================================
// Trigger: Airtable automation AT-TP9 when "Package Status" = "Completed"
//          AND "Package Report PDF" is empty
// Purpose: Generate consolidated package report PDF from all lessons
//
// SETUP INSTRUCTIONS:
// 1. In Airtable Automations, create a new automation
// 2. Trigger: "When record matches conditions"
//    - Table: Tutoring Packages
//    - Conditions: When "Package Status" = "Completed"
//                  AND "Package Report PDF" is empty
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

    // Webhook URLs for PDF Generation (handled in n8n)
    WEBHOOKS: {
        PRODUCTION: 'https://n8n.stryvacademics.com/webhook/tp5-generate-package-report',
        TEST: 'https://n8n.stryvacademics.com/webhook-test/tp5-generate-package-report',
        USE_TEST: false
    },

    // Webhook configuration
    WEBHOOK_CONFIG: {
        RETRY_ATTEMPTS: 2,
        POLLING_ATTEMPTS: 30, // PDF generation can take time
        POLLING_DELAY_ITERATIONS: 200000 // Longer delay for PDF generation
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
        PACKAGE_REPORT_PDF: 'Package Report PDF',
        PACKAGE_REPORT_GENERATED_AT: 'Package Report Generated At',
        LESSONS: 'Lessons',
        TUTOR_NAME: 'Tutor Name',
        STUDENT_NAME: 'Student Name',
        SUBJECT: 'Subject(s)',
        TOTAL_HOURS_DELIVERED: 'Total Hours Delivered',
        PRE_MIGRATION_PACKAGE: 'Pre-Migration Package',
        CONFIRMATION_DATE: 'Confirmation Date',
        COMPLETION_DATE: 'Completion Date'
    },

    // Lesson fields
    LESSON_FIELDS: {
        LESSON_ID: 'Lesson ID',
        LESSON_DATE: 'Lesson Date',
        LESSON_START_TIME: 'Lesson Start Time',
        LESSON_DURATION: 'Lesson Duration',
        LOCATION: 'Location',
        TUTOR_NOTES: 'Tutor Notes',
        HOMEWORK: 'Homework',
        PROGRESS_NOTES: 'Progress Notes',
        LESSON_REPORT_PDF: 'Lesson Report PDF',
        CREATED_AT: 'Created At'
    }
};


// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Busy-wait delay function (Airtable doesn't support setTimeout)
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
 * Format datetime for display
 */
function formatDateTime(dateValue) {
    if (!dateValue) {
        return 'N/A';
    }
    try {
        const date = new Date(dateValue);
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Hong_Kong'
        });
    } catch (error) {
        return 'N/A';
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
 * Call webhook to generate PDF and poll for completion
 */
async function callPDFWebhookAndWait(packageRecordId, packageData, lessonsData) {
    const webhookUrl = CONFIG.WEBHOOKS.USE_TEST ? CONFIG.WEBHOOKS.TEST : CONFIG.WEBHOOKS.PRODUCTION;

    console.log(`Calling PDF generation webhook: ${webhookUrl}`);

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
                    packageData: packageData,
                    lessonsData: lessonsData
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
            console.log('Webhook triggered successfully:', JSON.stringify(data));
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

    // STEP 2: Poll for PDF attachment in Package Report PDF field
    console.log(`Polling for Package Report PDF (max ${MAX_POLLING_ATTEMPTS} attempts)...`);

    const packagesTbl = base.getTable(CONFIG.TABLES.TUTORING_PACKAGES);

    for (let pollAttempt = 1; pollAttempt <= MAX_POLLING_ATTEMPTS; pollAttempt++) {
        console.log(`Poll attempt ${pollAttempt}/${MAX_POLLING_ATTEMPTS}...`);

        // Add delay between polls
        if (pollAttempt > 1) {
            busyWait(CONFIG.WEBHOOK_CONFIG.POLLING_DELAY_ITERATIONS);
        }

        // Query package table to check if PDF is attached
        const packageQuery = await packagesTbl.selectRecordsAsync({
            fields: [CONFIG.PACKAGE_FIELDS.PACKAGE_REPORT_PDF]
        });

        const packageRecord = packageQuery.getRecord(packageRecordId);

        if (packageRecord) {
            const pdfAttachment = packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.PACKAGE_REPORT_PDF);

            if (pdfAttachment && Array.isArray(pdfAttachment) && pdfAttachment.length > 0) {
                console.log(`✅ Package Report PDF found`);
                return {
                    success: true,
                    pdfUrl: pdfAttachment[0].url
                };
            } else {
                console.log(`PDF not yet attached (poll ${pollAttempt}/${MAX_POLLING_ATTEMPTS})`);
            }
        } else {
            console.error(`Package record ${packageRecordId} not found`);
            throw new Error(`Package record ${packageRecordId} not found during polling`);
        }
    }

    // If we've exhausted all polling attempts
    throw new Error(`Failed to find Package Report PDF after ${MAX_POLLING_ATTEMPTS} polling attempts. The PDF generation may still be processing.`);
}


// ============================================================================
// MAIN FUNCTION
// ============================================================================

async function generatePackageReportPDF(packageRecordId) {
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
            tutorName: safeString(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.TUTOR_NAME)),
            studentName: safeString(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.STUDENT_NAME)),
            subject: safeString(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.SUBJECT)),
            totalHoursDelivered: safeNumber(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.TOTAL_HOURS_DELIVERED)),
            preMigrationPackage: packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.PRE_MIGRATION_PACKAGE) || false,
            confirmationDate: formatDate(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.CONFIRMATION_DATE)),
            completionDate: formatDate(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.COMPLETION_DATE))
        };

        console.log('Package Data:', JSON.stringify(packageData, null, 2));

        // Fetch all linked lessons
        const lessonsLinks = packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.LESSONS);
        let lessonsData = [];

        if (lessonsLinks && lessonsLinks.length > 0) {
            console.log(`Fetching ${lessonsLinks.length} lessons...`);

            const lessonsTbl = base.getTable(CONFIG.TABLES.LESSONS);
            const lessonsQuery = await lessonsTbl.selectRecordsAsync({
                fields: Object.values(CONFIG.LESSON_FIELDS)
            });

            // Get all lesson records and sort by date
            for (const lessonLink of lessonsLinks) {
                const lessonRecord = lessonsQuery.getRecord(lessonLink.id);
                if (lessonRecord) {
                    const lessonData = {
                        lessonId: safeString(lessonRecord.getCellValue(CONFIG.LESSON_FIELDS.LESSON_ID)),
                        lessonDate: formatDate(lessonRecord.getCellValue(CONFIG.LESSON_FIELDS.LESSON_DATE)),
                        lessonStartTime: safeString(lessonRecord.getCellValue(CONFIG.LESSON_FIELDS.LESSON_START_TIME)),
                        lessonDuration: safeNumber(lessonRecord.getCellValue(CONFIG.LESSON_FIELDS.LESSON_DURATION)),
                        location: safeString(lessonRecord.getCellValue(CONFIG.LESSON_FIELDS.LOCATION)),
                        tutorNotes: safeString(lessonRecord.getCellValue(CONFIG.LESSON_FIELDS.TUTOR_NOTES)),
                        homework: safeString(lessonRecord.getCellValue(CONFIG.LESSON_FIELDS.HOMEWORK)),
                        progressNotes: safeString(lessonRecord.getCellValue(CONFIG.LESSON_FIELDS.PROGRESS_NOTES)),
                        createdAt: lessonRecord.getCellValue(CONFIG.LESSON_FIELDS.CREATED_AT)
                    };

                    // Get lesson report PDF if attached
                    const lessonReportPDF = lessonRecord.getCellValue(CONFIG.LESSON_FIELDS.LESSON_REPORT_PDF);
                    if (lessonReportPDF && Array.isArray(lessonReportPDF) && lessonReportPDF.length > 0) {
                        lessonData.lessonReportPdfUrl = lessonReportPDF[0].url;
                    }

                    lessonsData.push(lessonData);
                }
            }

            // Sort lessons by date (oldest to newest)
            lessonsData.sort((a, b) => {
                const dateA = new Date(a.lessonDate || 0);
                const dateB = new Date(b.lessonDate || 0);
                return dateA - dateB;
            });

            console.log(`✅ Fetched and sorted ${lessonsData.length} lessons`);
        } else {
            console.log('⚠️ No lessons found for this package');
        }

        // Call webhook to generate PDF and wait for completion
        console.log('Calling PDF generation webhook...');
        const pdfResult = await callPDFWebhookAndWait(packageRecordId, packageData, lessonsData);

        // Update Package Report Generated At timestamp
        await packagesTbl.updateRecordAsync(packageRecordId, {
            [CONFIG.PACKAGE_FIELDS.PACKAGE_REPORT_GENERATED_AT]: new Date().toISOString()
        });

        console.log('✅ Package Report Generated At timestamp set');

        // Create success notification
        await createAdminNotification(
            `✅ Package Report Generated - ${packageData.packageId}`,
            `Package report PDF successfully generated.

Package: ${packageData.packageId}
Tutor: ${packageData.tutorName}
Student: ${packageData.studentName}
Total Lessons: ${lessonsData.length}
Total Hours: ${packageData.totalHoursDelivered}
Pre-Migration Package: ${packageData.preMigrationPackage ? 'Yes' : 'No'}`,
            'Regular',
            'Packages',
            'Completed'
        );

        console.log('✅ TP5: Generate Package Report PDF - COMPLETE');

    } catch (error) {
        console.error('❌ Error in generatePackageReportPDF:', error);

        // Create error notification
        await createAdminNotification(
            `🚨 ERROR: Package Report Generation Failed`,
            `Failed to generate package report PDF.

Package Record ID: ${packageRecordId}
Error: ${error.message}

Action Required: Review error and manually generate PDF if needed. Package completion can proceed without report (manual generation).`,
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
        console.log('TP5: GENERATE PACKAGE REPORT PDF');
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

        await generatePackageReportPDF(packageRecordId);

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
