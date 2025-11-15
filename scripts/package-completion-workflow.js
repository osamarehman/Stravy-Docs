// ============================================================================
// AIRTABLE SCRIPT: Package Completion Workflow (Consolidated)
// ============================================================================
// Trigger: Airtable automation when "Package Status" = "Completed"
// Purpose: Gather all package completion data and send to n8n for processing
//
// This script consolidates all package completion workflows:
// - TP4: Update Base Package Invoice
// - TP5: Generate Package Report PDF
// - TP6: Create Additional Fees Invoice
// - TP7: Send Completion Email
// - TP8: Update Tutor Bill
// - TP9: Create Self-Billed Invoice (PO)
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

    // Webhook URLs
    WEBHOOKS: {
        PRODUCTION: 'https://n8n.stryvacademics.com/webhook/31982ff6-c1f7-4ff3-a373-0f11cd6a6159',
        TEST: 'https://n8n.stryvacademics.com/webhook-test/31982ff6-c1f7-4ff3-a373-0f11cd6a6159',
        USE_TEST: false
    },

    // Table Names
    TABLES: {
        TUTORING_PACKAGES: 'Tutoring Packages',
        LESSONS: 'Lessons',
        PAYMENTS: 'Payments',
        PAYOUTS: 'Payouts',
        TUTORS: 'Tutors',
        STUDENTS: 'Students',
        PARENTS: 'Parents',
        ADMIN_NOTIFICATIONS: 'Admin Notifications'
    },

    // Tutoring Packages field names
    PACKAGE_FIELDS: {
        // IDs and Basic Info
        PACKAGE_ID: 'Package ID',
        CREATED_AT: 'Created At',
        CONFIRMATION_DATE: 'Confirmation Date',
        COMPLETION_DATE: 'Completion Date',
        PACKAGE_STATUS: 'Package Status',

        // Links to related records
        TUTOR: 'Tutor',
        STUDENT: 'Student',
        PARENTS: 'Parents',
        SUBJECTS: 'Subjects',
        LESSONS: 'Lessons',
        PAYMENTS: 'Payments',
        PAYOUT: 'Payout',

        // Package Details
        MODE: 'Mode',
        BASE_PACKAGE_HOURS: 'Base Package Hours',
        HOURLY_LESSON_RATE: 'Hourly Lesson Rate',
        HOURLY_TUTOR_INCOME: 'Hourly Tutor Income',

        // Hours Tracking
        HOURS_DELIVERED: 'Hours Delivered',
        PRE_MIGRATION_HOURS_DELIVERED: 'Pre-Migration Hours Delivered',
        TOTAL_HOURS_DELIVERED: 'Total Hours Delivered',
        OVER_DELIVERED_HOURS: 'Over-Delivered Hours',
        PRE_MIGRATION_PACKAGE: 'Pre-Migration Package',

        // Additional Fees
        ACCRUED_TRANSPORTATION_REIMBURSEMENT: 'Accrued Transportation Reimbursement',
        ACCRUED_LATE_CANCELLATION_FEES: 'Accrued Late Cancellation Fees',
        ADDITIONAL_FEES_ADJUSTMENT: 'Additional Fees Adjustment',
        ADDITIONAL_FEES_ADJUSTMENT_NOTE: 'Additional Fees Adjustment Note',
        TOTAL_ACCRUED_ADDITIONAL_FEES: 'Total Accrued Additional Fees',

        // Payout Adjustments
        PAYOUT_ADJUSTMENT: 'Payout Adjustment',
        PAYOUT_ADJUSTMENT_NOTE: 'Payout Adjustment Note',
        TOTAL_ACCRUED_PAYOUT_AMOUNT: 'Total Accrued Payout Amount',

        // Invoice & Payment Status
        PACKAGE_INVOICE_STATUS: 'Package Invoice Status',
        BASE_PACKAGE_PAID: 'Base Package Paid',
        ADDITIONAL_FEES_PAID: 'Additional Fees Paid',

        // Xero IDs
        XERO_INVOICE_ID: 'Xero Invoice ID',
        XERO_BILL_ID: 'Xero Bill ID',

        // Lookup fields (from related records)
        TUTOR_NAME: 'Tutor Name',
        STUDENT_NAME: 'Student Name',
        SUBJECT: 'Subject(s)',
        MODE_TEXT: 'Mode(s)',
        CLIENT_EMAIL: 'Client Email',
        CLIENT_FIRST_NAME: 'Client First Name',
        STUDENT_PARENT_XERO_CONTACT_ID: 'Student/Parent Xero Contact ID',
        TUTOR_XERO_CONTACT_ID: 'Tutor Xero Contact ID',

        // Report & Email Timestamps
        PACKAGE_REPORT_PDF: 'Package Report PDF',
        PACKAGE_REPORT_GENERATED_AT: 'Package Report Generated At',
        INVOICE_UPDATED_AT: 'Invoice Updated At',
        BILL_UPDATED_AT: 'Bill Updated At',
        ADDITIONAL_FEES_INVOICE_CREATED_AT: 'Additional Fees Invoice Created At',
        CLIENT_PACKAGE_COMPLETION_EMAIL_SENT_AT: 'Client Package Completion Email Sent At',
        TUTOR_PACKAGE_COMPLETION_EMAIL_SENT_AT: 'Tutor Package Completion Email Sent At',

        // Notes
        NOTES: 'Notes',
        ADMIN_NOTES: 'Admin Notes'
    },

    // Lesson fields
    LESSON_FIELDS: {
        LESSON_ID: 'Lesson ID',
        LESSON_DATE: 'Lesson Date',
        LESSON_START_TIME: 'Lesson Start Time',
        LESSON_DURATION: 'Lesson Duration',
        HOURS_COUNTED: 'Hours Counted',
        LOCATION: 'Location',
        TUTOR_NOTES: 'Tutor Notes',
        HOMEWORK: 'Homework',
        PROGRESS_NOTES: 'Progress Notes',
        LESSON_REPORT_PDF: 'Lesson Report PDF',
        TRANSPORTATION_REIMBURSEMENT: 'Transportation Reimbursement',
        LATE_CANCELLATION_FEE: 'Late Cancellation Fee',
        CREATED_AT: 'Created At',
        LESSON_STATUS: 'Lesson Status'
    },

    // Payment fields
    PAYMENT_FIELDS: {
        PAYMENT_ID: 'Payment ID',
        PAYMENT_TYPE: 'Payment Type',
        XERO_INVOICE_ID: 'Xero Invoice ID',
        INVOICE_PDF: 'Invoice PDF',
        PAYMENT_STATUS: 'Payment Status',
        AMOUNT: 'Amount',
        CREATED_AT: 'Created At'
    },

    // Payout fields
    PAYOUT_FIELDS: {
        PAYOUT_ID: 'Payout ID',
        XERO_BILL_ID: 'Xero Bill ID',
        XERO_PO_ID: 'Xero PO ID',
        PO_PDF: 'PO PDF',
        PAYOUT_STATUS: 'Payout Status',
        AMOUNT: 'Amount',
        CREATED_AT: 'Created At'
    },

    // Tutor fields
    TUTOR_FIELDS: {
        FULL_NAME: 'Full Name',
        EMAIL: 'Email',
        PHONE: 'Phone',
        BANK_NAME: 'Bank Name',
        BANK_ACCOUNT_NUMBER: 'Bank Account Number',
        BANK_ACCOUNT_NAME: 'Bank Account Name',
        FPS_ID: 'FPS ID'
    },

    // Student fields
    STUDENT_FIELDS: {
        FULL_NAME: 'Full Name',
        EMAIL: 'Email',
        PHONE: 'Phone',
        GRADE_YEAR: 'Grade/Year'
    },

    // Parent fields
    PARENT_FIELDS: {
        FULL_NAME: 'Full Name',
        EMAIL: 'Email',
        PHONE: 'Phone',
        BILLING_ADDRESS: 'Billing Address'
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
 * Safely get boolean
 */
function safeBoolean(value, defaultValue = false) {
    if (value === null || value === undefined) {
        return defaultValue;
    }
    return Boolean(value);
}

/**
 * Format date for display (YYYY-MM-DD)
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
 * Format datetime for display (ISO)
 */
function formatDateTime(dateValue) {
    if (!dateValue) {
        return null;
    }
    try {
        const date = new Date(dateValue);
        return date.toISOString();
    } catch (error) {
        return null;
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
 * Get multiple select names
 */
function getMultipleSelectNames(selectValues) {
    if (!selectValues || !Array.isArray(selectValues)) {
        return [];
    }
    return selectValues.map(v => v.name || '').filter(name => name !== '');
}

/**
 * Get first attachment URL
 */
function getFirstAttachmentUrl(attachments) {
    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
        return attachments[0].url || null;
    }
    return null;
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
// DATA FETCHING FUNCTIONS
// ============================================================================

/**
 * Fetch package data
 */
async function fetchPackageData(packageRecord) {
    console.log('📦 Extracting package data...');

    const packageData = {
        // IDs and Basic Info
        airtableRecordId: packageRecord.id,
        packageId: safeString(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.PACKAGE_ID)),
        createdAt: formatDateTime(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.CREATED_AT)),
        confirmationDate: formatDate(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.CONFIRMATION_DATE)),
        completionDate: formatDate(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.COMPLETION_DATE)),
        packageStatus: getSingleSelectName(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.PACKAGE_STATUS)),

        // Package Details
        mode: getMultipleSelectNames(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.MODE)),
        modeText: safeString(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.MODE_TEXT)),
        basePackageHours: safeNumber(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.BASE_PACKAGE_HOURS)),
        hourlyLessonRate: safeNumber(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.HOURLY_LESSON_RATE)),
        hourlyTutorIncome: safeNumber(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.HOURLY_TUTOR_INCOME)),

        // Hours Tracking
        hoursDelivered: safeNumber(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.HOURS_DELIVERED)),
        preMigrationHoursDelivered: safeNumber(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.PRE_MIGRATION_HOURS_DELIVERED)),
        totalHoursDelivered: safeNumber(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.TOTAL_HOURS_DELIVERED)),
        overDeliveredHours: safeNumber(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.OVER_DELIVERED_HOURS)),
        preMigrationPackage: safeBoolean(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.PRE_MIGRATION_PACKAGE)),

        // Additional Fees
        transportationReimbursement: safeNumber(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.ACCRUED_TRANSPORTATION_REIMBURSEMENT)),
        lateCancellationFees: safeNumber(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.ACCRUED_LATE_CANCELLATION_FEES)),
        additionalFeesAdjustment: safeNumber(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.ADDITIONAL_FEES_ADJUSTMENT)),
        additionalFeesAdjustmentNote: safeString(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.ADDITIONAL_FEES_ADJUSTMENT_NOTE)),
        totalAccruedAdditionalFees: safeNumber(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.TOTAL_ACCRUED_ADDITIONAL_FEES)),

        // Payout Adjustments
        payoutAdjustment: safeNumber(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.PAYOUT_ADJUSTMENT)),
        payoutAdjustmentNote: safeString(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.PAYOUT_ADJUSTMENT_NOTE)),
        totalAccruedPayoutAmount: safeNumber(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.TOTAL_ACCRUED_PAYOUT_AMOUNT)),

        // Invoice & Payment Status
        packageInvoiceStatus: getSingleSelectName(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.PACKAGE_INVOICE_STATUS)),
        basePackagePaid: safeNumber(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.BASE_PACKAGE_PAID)),
        additionalFeesPaid: safeNumber(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.ADDITIONAL_FEES_PAID)),

        // Xero IDs
        xeroInvoiceId: safeString(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.XERO_INVOICE_ID)),
        xeroBillId: safeString(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.XERO_BILL_ID)),

        // Lookup fields
        tutorName: safeString(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.TUTOR_NAME)),
        studentName: safeString(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.STUDENT_NAME)),
        subject: safeString(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.SUBJECT)),
        clientEmail: safeString(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.CLIENT_EMAIL)),
        clientFirstName: safeString(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.CLIENT_FIRST_NAME)),
        studentParentXeroContactId: safeString(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.STUDENT_PARENT_XERO_CONTACT_ID)),
        tutorXeroContactId: safeString(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.TUTOR_XERO_CONTACT_ID)),

        // Timestamps
        packageReportGeneratedAt: formatDateTime(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.PACKAGE_REPORT_GENERATED_AT)),
        invoiceUpdatedAt: formatDateTime(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.INVOICE_UPDATED_AT)),
        billUpdatedAt: formatDateTime(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.BILL_UPDATED_AT)),
        additionalFeesInvoiceCreatedAt: formatDateTime(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.ADDITIONAL_FEES_INVOICE_CREATED_AT)),
        clientCompletionEmailSentAt: formatDateTime(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.CLIENT_PACKAGE_COMPLETION_EMAIL_SENT_AT)),
        tutorCompletionEmailSentAt: formatDateTime(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.TUTOR_PACKAGE_COMPLETION_EMAIL_SENT_AT)),

        // PDFs
        packageReportPdfUrl: getFirstAttachmentUrl(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.PACKAGE_REPORT_PDF)),

        // Notes
        notes: safeString(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.NOTES)),
        adminNotes: safeString(packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.ADMIN_NOTES))
    };

    console.log('✅ Package data extracted');
    return packageData;
}

/**
 * Fetch all lessons data
 */
async function fetchLessonsData(packageRecord) {
    console.log('📚 Fetching lessons data...');

    const lessonsLinks = packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.LESSONS);
    const lessonsData = [];

    if (!lessonsLinks || lessonsLinks.length === 0) {
        console.log('⚠️  No lessons found for this package');
        return lessonsData;
    }

    console.log(`Found ${lessonsLinks.length} lessons`);

    const lessonsTbl = base.getTable(CONFIG.TABLES.LESSONS);
    const lessonsQuery = await lessonsTbl.selectRecordsAsync({
        fields: Object.values(CONFIG.LESSON_FIELDS)
    });

    for (const lessonLink of lessonsLinks) {
        const lessonRecord = lessonsQuery.getRecord(lessonLink.id);
        if (lessonRecord) {
            const lessonData = {
                airtableRecordId: lessonRecord.id,
                lessonId: safeString(lessonRecord.getCellValue(CONFIG.LESSON_FIELDS.LESSON_ID)),
                lessonDate: formatDate(lessonRecord.getCellValue(CONFIG.LESSON_FIELDS.LESSON_DATE)),
                lessonStartTime: safeString(lessonRecord.getCellValue(CONFIG.LESSON_FIELDS.LESSON_START_TIME)),
                lessonDuration: safeNumber(lessonRecord.getCellValue(CONFIG.LESSON_FIELDS.LESSON_DURATION)),
                hoursCounted: safeNumber(lessonRecord.getCellValue(CONFIG.LESSON_FIELDS.HOURS_COUNTED)),
                location: safeString(lessonRecord.getCellValue(CONFIG.LESSON_FIELDS.LOCATION)),
                tutorNotes: safeString(lessonRecord.getCellValue(CONFIG.LESSON_FIELDS.TUTOR_NOTES)),
                homework: safeString(lessonRecord.getCellValue(CONFIG.LESSON_FIELDS.HOMEWORK)),
                progressNotes: safeString(lessonRecord.getCellValue(CONFIG.LESSON_FIELDS.PROGRESS_NOTES)),
                lessonReportPdfUrl: getFirstAttachmentUrl(lessonRecord.getCellValue(CONFIG.LESSON_FIELDS.LESSON_REPORT_PDF)),
                transportationReimbursement: safeNumber(lessonRecord.getCellValue(CONFIG.LESSON_FIELDS.TRANSPORTATION_REIMBURSEMENT)),
                lateCancellationFee: safeNumber(lessonRecord.getCellValue(CONFIG.LESSON_FIELDS.LATE_CANCELLATION_FEE)),
                createdAt: formatDateTime(lessonRecord.getCellValue(CONFIG.LESSON_FIELDS.CREATED_AT)),
                lessonStatus: getSingleSelectName(lessonRecord.getCellValue(CONFIG.LESSON_FIELDS.LESSON_STATUS))
            };
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
    return lessonsData;
}

/**
 * Fetch payments data
 */
async function fetchPaymentsData(packageRecord) {
    console.log('💰 Fetching payments data...');

    const paymentsLinks = packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.PAYMENTS);
    const paymentsData = [];

    if (!paymentsLinks || paymentsLinks.length === 0) {
        console.log('⚠️  No payments found for this package');
        return paymentsData;
    }

    console.log(`Found ${paymentsLinks.length} payments`);

    const paymentsTbl = base.getTable(CONFIG.TABLES.PAYMENTS);
    const paymentsQuery = await paymentsTbl.selectRecordsAsync({
        fields: Object.values(CONFIG.PAYMENT_FIELDS)
    });

    for (const paymentLink of paymentsLinks) {
        const paymentRecord = paymentsQuery.getRecord(paymentLink.id);
        if (paymentRecord) {
            const paymentData = {
                airtableRecordId: paymentRecord.id,
                paymentId: safeString(paymentRecord.getCellValue(CONFIG.PAYMENT_FIELDS.PAYMENT_ID)),
                paymentType: getSingleSelectName(paymentRecord.getCellValue(CONFIG.PAYMENT_FIELDS.PAYMENT_TYPE)),
                xeroInvoiceId: safeString(paymentRecord.getCellValue(CONFIG.PAYMENT_FIELDS.XERO_INVOICE_ID)),
                invoicePdfUrl: getFirstAttachmentUrl(paymentRecord.getCellValue(CONFIG.PAYMENT_FIELDS.INVOICE_PDF)),
                paymentStatus: getSingleSelectName(paymentRecord.getCellValue(CONFIG.PAYMENT_FIELDS.PAYMENT_STATUS)),
                amount: safeNumber(paymentRecord.getCellValue(CONFIG.PAYMENT_FIELDS.AMOUNT)),
                createdAt: formatDateTime(paymentRecord.getCellValue(CONFIG.PAYMENT_FIELDS.CREATED_AT))
            };
            paymentsData.push(paymentData);
        }
    }

    console.log(`✅ Fetched ${paymentsData.length} payments`);
    return paymentsData;
}

/**
 * Fetch payout data
 */
async function fetchPayoutData(packageRecord) {
    console.log('💵 Fetching payout data...');

    const payoutLinks = packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.PAYOUT);

    if (!payoutLinks || payoutLinks.length === 0) {
        console.log('⚠️  No payout found for this package');
        return null;
    }

    const payoutsTbl = base.getTable(CONFIG.TABLES.PAYOUTS);
    const payoutsQuery = await payoutsTbl.selectRecordsAsync({
        fields: Object.values(CONFIG.PAYOUT_FIELDS)
    });

    const payoutRecord = payoutsQuery.getRecord(payoutLinks[0].id);
    if (!payoutRecord) {
        console.log('⚠️  Payout record not found');
        return null;
    }

    const payoutData = {
        airtableRecordId: payoutRecord.id,
        payoutId: safeString(payoutRecord.getCellValue(CONFIG.PAYOUT_FIELDS.PAYOUT_ID)),
        xeroBillId: safeString(payoutRecord.getCellValue(CONFIG.PAYOUT_FIELDS.XERO_BILL_ID)),
        xeroPoId: safeString(payoutRecord.getCellValue(CONFIG.PAYOUT_FIELDS.XERO_PO_ID)),
        poPdfUrl: getFirstAttachmentUrl(payoutRecord.getCellValue(CONFIG.PAYOUT_FIELDS.PO_PDF)),
        payoutStatus: getSingleSelectName(payoutRecord.getCellValue(CONFIG.PAYOUT_FIELDS.PAYOUT_STATUS)),
        amount: safeNumber(payoutRecord.getCellValue(CONFIG.PAYOUT_FIELDS.AMOUNT)),
        createdAt: formatDateTime(payoutRecord.getCellValue(CONFIG.PAYOUT_FIELDS.CREATED_AT))
    };

    console.log('✅ Payout data fetched');
    return payoutData;
}

/**
 * Fetch tutor data
 */
async function fetchTutorData(packageRecord) {
    console.log('👨‍🏫 Fetching tutor data...');

    const tutorLinks = packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.TUTOR);

    if (!tutorLinks || tutorLinks.length === 0) {
        console.log('⚠️  No tutor linked to this package');
        return null;
    }

    const tutorsTbl = base.getTable(CONFIG.TABLES.TUTORS);
    const tutorsQuery = await tutorsTbl.selectRecordsAsync({
        fields: Object.values(CONFIG.TUTOR_FIELDS)
    });

    const tutorRecord = tutorsQuery.getRecord(tutorLinks[0].id);
    if (!tutorRecord) {
        console.log('⚠️  Tutor record not found');
        return null;
    }

    const tutorData = {
        airtableRecordId: tutorRecord.id,
        fullName: safeString(tutorRecord.getCellValue(CONFIG.TUTOR_FIELDS.FULL_NAME)),
        email: safeString(tutorRecord.getCellValue(CONFIG.TUTOR_FIELDS.EMAIL)),
        phone: safeString(tutorRecord.getCellValue(CONFIG.TUTOR_FIELDS.PHONE)),
        bankName: safeString(tutorRecord.getCellValue(CONFIG.TUTOR_FIELDS.BANK_NAME)),
        bankAccountNumber: safeString(tutorRecord.getCellValue(CONFIG.TUTOR_FIELDS.BANK_ACCOUNT_NUMBER)),
        bankAccountName: safeString(tutorRecord.getCellValue(CONFIG.TUTOR_FIELDS.BANK_ACCOUNT_NAME)),
        fpsId: safeString(tutorRecord.getCellValue(CONFIG.TUTOR_FIELDS.FPS_ID))
    };

    console.log('✅ Tutor data fetched');
    return tutorData;
}

/**
 * Fetch student data
 */
async function fetchStudentData(packageRecord) {
    console.log('👨‍🎓 Fetching student data...');

    const studentLinks = packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.STUDENT);

    if (!studentLinks || studentLinks.length === 0) {
        console.log('⚠️  No student linked to this package');
        return null;
    }

    const studentsTbl = base.getTable(CONFIG.TABLES.STUDENTS);
    const studentsQuery = await studentsTbl.selectRecordsAsync({
        fields: Object.values(CONFIG.STUDENT_FIELDS)
    });

    const studentRecord = studentsQuery.getRecord(studentLinks[0].id);
    if (!studentRecord) {
        console.log('⚠️  Student record not found');
        return null;
    }

    const studentData = {
        airtableRecordId: studentRecord.id,
        fullName: safeString(studentRecord.getCellValue(CONFIG.STUDENT_FIELDS.FULL_NAME)),
        email: safeString(studentRecord.getCellValue(CONFIG.STUDENT_FIELDS.EMAIL)),
        phone: safeString(studentRecord.getCellValue(CONFIG.STUDENT_FIELDS.PHONE)),
        gradeYear: getSingleSelectName(studentRecord.getCellValue(CONFIG.STUDENT_FIELDS.GRADE_YEAR))
    };

    console.log('✅ Student data fetched');
    return studentData;
}

/**
 * Fetch parent data
 */
async function fetchParentData(packageRecord) {
    console.log('👨‍👩‍👧 Fetching parent data...');

    const parentLinks = packageRecord.getCellValue(CONFIG.PACKAGE_FIELDS.PARENTS);

    if (!parentLinks || parentLinks.length === 0) {
        console.log('⚠️  No parent linked to this package');
        return null;
    }

    const parentsTbl = base.getTable(CONFIG.TABLES.PARENTS);
    const parentsQuery = await parentsTbl.selectRecordsAsync({
        fields: Object.values(CONFIG.PARENT_FIELDS)
    });

    const parentRecord = parentsQuery.getRecord(parentLinks[0].id);
    if (!parentRecord) {
        console.log('⚠️  Parent record not found');
        return null;
    }

    const parentData = {
        airtableRecordId: parentRecord.id,
        fullName: safeString(parentRecord.getCellValue(CONFIG.PARENT_FIELDS.FULL_NAME)),
        email: safeString(parentRecord.getCellValue(CONFIG.PARENT_FIELDS.EMAIL)),
        phone: safeString(parentRecord.getCellValue(CONFIG.PARENT_FIELDS.PHONE)),
        billingAddress: safeString(parentRecord.getCellValue(CONFIG.PARENT_FIELDS.BILLING_ADDRESS))
    };

    console.log('✅ Parent data fetched');
    return parentData;
}


// ============================================================================
// BUSINESS LOGIC
// ============================================================================

/**
 * Determine which workflows need to run
 */
function determineWorkflowsToRun(packageData, paymentsData) {
    console.log('🔍 Determining workflows to run...');

    const workflows = {
        updateBaseInvoice: false,
        generatePackageReport: false,
        createAdditionalFeesInvoice: false,
        sendClientCompletionEmail: false,
        updateTutorBill: false,
        createSelfBilledInvoice: false,
        sendTutorCompletionEmail: false
    };

    // TP4: Update Base Invoice
    // Run if: Invoice Updated At is empty AND Xero Invoice ID exists
    if (!packageData.invoiceUpdatedAt && packageData.xeroInvoiceId) {
        workflows.updateBaseInvoice = true;
        console.log('  ✓ Update Base Invoice - Required');
    }

    // TP5: Generate Package Report
    // Run if: Package Report Generated At is empty
    if (!packageData.packageReportGeneratedAt) {
        workflows.generatePackageReport = true;
        console.log('  ✓ Generate Package Report - Required');
    }

    // TP6: Create Additional Fees Invoice
    // Run if: Additional Fees Invoice Created At is empty AND
    //         (Transportation Reimbursement > 0 OR Late Cancellation Fees > 0 OR Over-Delivered Hours > 0)
    const hasAdditionalFees = packageData.transportationReimbursement > 0 ||
                              packageData.lateCancellationFees > 0 ||
                              packageData.overDeliveredHours > 0;

    if (!packageData.additionalFeesInvoiceCreatedAt && hasAdditionalFees) {
        workflows.createAdditionalFeesInvoice = true;
        console.log('  ✓ Create Additional Fees Invoice - Required');
    }

    // TP7: Send Client Completion Email
    // Run if: Client Completion Email Sent At is empty AND
    //         Invoice Updated At exists AND Package Report Generated At exists
    if (!packageData.clientCompletionEmailSentAt &&
        packageData.invoiceUpdatedAt &&
        packageData.packageReportGeneratedAt) {
        workflows.sendClientCompletionEmail = true;
        console.log('  ✓ Send Client Completion Email - Required');
    }

    // TP8: Update Tutor Bill
    // Run if: Bill Updated At is empty AND Xero Bill ID exists
    if (!packageData.billUpdatedAt && packageData.xeroBillId) {
        workflows.updateTutorBill = true;
        console.log('  ✓ Update Tutor Bill - Required');
    }

    // TP9: Create Self-Billed Invoice (PO)
    // Run if: Bill Updated At exists (bill was just updated or already updated)
    if (packageData.billUpdatedAt) {
        workflows.createSelfBilledInvoice = true;
        console.log('  ✓ Create Self-Billed Invoice - Required');
    }

    // Send Tutor Completion Email (optional - can be added later)
    // Run if: Tutor Completion Email Sent At is empty AND Bill Updated At exists
    if (!packageData.tutorCompletionEmailSentAt && packageData.billUpdatedAt) {
        workflows.sendTutorCompletionEmail = true;
        console.log('  ✓ Send Tutor Completion Email - Required');
    }

    console.log('✅ Workflow determination complete');
    return workflows;
}

/**
 * Determine email template variant for client completion email
 */
function determineEmailTemplate(packageData, paymentsData) {
    const isPaid = packageData.packageInvoiceStatus === 'Paid';
    const hasAdditionalFees = packageData.transportationReimbursement > 0 ||
                              packageData.lateCancellationFees > 0 ||
                              packageData.overDeliveredHours > 0;

    if (isPaid && !hasAdditionalFees) {
        return 'TEMPLATE_A'; // Paid, No Fees
    } else if (isPaid && hasAdditionalFees) {
        return 'TEMPLATE_B'; // Paid, With Fees
    } else if (!isPaid && !hasAdditionalFees) {
        return 'TEMPLATE_C'; // Unpaid, No Fees
    } else {
        return 'TEMPLATE_D'; // Unpaid, With Fees
    }
}


// ============================================================================
// MAIN FUNCTION
// ============================================================================

async function processPackageCompletion(packageRecordId) {
    try {
        console.log('='.repeat(80));
        console.log('🚀 PACKAGE COMPLETION WORKFLOW - STARTING');
        console.log('='.repeat(80));
        console.log(`Package Record ID: ${packageRecordId}\n`);

        // ========================================================================
        // STEP 1: Fetch Package Record
        // ========================================================================
        console.log('STEP 1: Fetching package record...');
        const packagesTbl = base.getTable(CONFIG.TABLES.TUTORING_PACKAGES);
        const packageQuery = await packagesTbl.selectRecordsAsync({
            fields: Object.values(CONFIG.PACKAGE_FIELDS)
        });
        const packageRecord = packageQuery.getRecord(packageRecordId);

        if (!packageRecord) {
            throw new Error(`Package record not found: ${packageRecordId}`);
        }
        console.log('✅ Package record found\n');

        // ========================================================================
        // STEP 2: Extract Package Data
        // ========================================================================
        console.log('STEP 2: Extracting package data...');
        const packageData = await fetchPackageData(packageRecord);
        console.log(`Package ID: ${packageData.packageId}`);
        console.log(`Tutor: ${packageData.tutorName}`);
        console.log(`Student: ${packageData.studentName}`);
        console.log(`Status: ${packageData.packageStatus}\n`);

        // ========================================================================
        // STEP 3: Fetch All Related Data
        // ========================================================================
        console.log('STEP 3: Fetching all related data...');

        const lessonsData = await fetchLessonsData(packageRecord);
        const paymentsData = await fetchPaymentsData(packageRecord);
        const payoutData = await fetchPayoutData(packageRecord);
        const tutorData = await fetchTutorData(packageRecord);
        const studentData = await fetchStudentData(packageRecord);
        const parentData = await fetchParentData(packageRecord);

        console.log('✅ All related data fetched\n');

        // ========================================================================
        // STEP 4: Determine Workflows to Run
        // ========================================================================
        console.log('STEP 4: Determining workflows to run...');
        const workflows = determineWorkflowsToRun(packageData, paymentsData);
        console.log('');

        // ========================================================================
        // STEP 5: Determine Email Template
        // ========================================================================
        console.log('STEP 5: Determining email template...');
        const emailTemplate = determineEmailTemplate(packageData, paymentsData);
        console.log(`Email Template: ${emailTemplate}\n`);

        // ========================================================================
        // STEP 6: Build Comprehensive Payload
        // ========================================================================
        console.log('STEP 6: Building comprehensive payload...');

        const payload = {
            // Metadata
            metadata: {
                airtableRecordId: packageRecordId,
                processedAt: new Date().toISOString(),
                scriptVersion: '1.0.0'
            },

            // Workflows to execute
            workflows: workflows,

            // Package data
            package: packageData,

            // Related data
            lessons: lessonsData,
            payments: paymentsData,
            payout: payoutData,
            tutor: tutorData,
            student: studentData,
            parent: parentData,

            // Email template
            emailTemplate: emailTemplate
        };

        console.log('✅ Payload built successfully\n');

        // ========================================================================
        // STEP 7: Send to n8n Webhook
        // ========================================================================
        console.log('STEP 7: Sending payload to n8n webhook...');

        const webhookUrl = CONFIG.WEBHOOKS.USE_TEST ?
                          CONFIG.WEBHOOKS.TEST :
                          CONFIG.WEBHOOKS.PRODUCTION;

        console.log(`Webhook URL: ${webhookUrl}`);
        console.log(`Payload size: ${JSON.stringify(payload).length} characters`);

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Webhook call failed: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        console.log('✅ Webhook call successful');
        console.log(`Response: ${JSON.stringify(result, null, 2)}\n`);

        // ========================================================================
        // STEP 8: Create Success Notification
        // ========================================================================
        console.log('STEP 8: Creating success notification...');

        await createAdminNotification(
            `✅ Package Completion Workflow Triggered - ${packageData.packageId}`,
            `Package completion workflow successfully triggered for n8n processing.

Package: ${packageData.packageId}
Tutor: ${packageData.tutorName}
Student: ${packageData.studentName}
Completion Date: ${packageData.completionDate}

Workflows to Execute:
${workflows.updateBaseInvoice ? '✓ Update Base Invoice\n' : ''}${workflows.generatePackageReport ? '✓ Generate Package Report\n' : ''}${workflows.createAdditionalFeesInvoice ? '✓ Create Additional Fees Invoice\n' : ''}${workflows.sendClientCompletionEmail ? '✓ Send Client Completion Email\n' : ''}${workflows.updateTutorBill ? '✓ Update Tutor Bill\n' : ''}${workflows.createSelfBilledInvoice ? '✓ Create Self-Billed Invoice\n' : ''}${workflows.sendTutorCompletionEmail ? '✓ Send Tutor Completion Email\n' : ''}
Email Template: ${emailTemplate}

Data sent to n8n for processing.`,
            'Regular',
            'Packages',
            'Completed'
        );

        console.log('✅ Success notification created\n');

        console.log('='.repeat(80));
        console.log('✅ PACKAGE COMPLETION WORKFLOW - COMPLETE');
        console.log('='.repeat(80));

        return {
            success: true,
            packageId: packageData.packageId,
            workflows: workflows
        };

    } catch (error) {
        console.error('\n' + '='.repeat(80));
        console.error('❌ ERROR IN PACKAGE COMPLETION WORKFLOW');
        console.error('='.repeat(80));
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        console.error('='.repeat(80));

        // Create error notification
        await createAdminNotification(
            `🚨 ERROR: Package Completion Workflow Failed`,
            `Failed to process package completion workflow.

Package Record ID: ${packageRecordId}
Error: ${error.message}

Stack Trace:
${error.stack}

Action Required: Review error and manually process package completion if needed.`,
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
        // Get input
        const inputConfig = input.config();
        console.log('Input config:', JSON.stringify(inputConfig));

        const packageRecordId = inputConfig.packageRecordId ||
                                inputConfig['packageRecordId'] ||
                                inputConfig['Package ID'] ||
                                inputConfig.recordId;

        if (!packageRecordId) {
            throw new Error('Package Record ID not provided. Please configure the automation input variable.');
        }

        // Process package completion
        await processPackageCompletion(packageRecordId);

    } catch (error) {
        console.error('❌ SCRIPT FAILED');
        console.error('Error:', error.message);
        throw error;
    }
})();
