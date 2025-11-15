// ============================================================================
// AIRTABLE SCRIPT: Convert Lead to Client (FIXED VERSION)
// ============================================================================
// Trigger: When "Convert to Client" checkbox is checked in Leads table
// Purpose: Create User, Parent/Student records with Xero integration
//
// SETUP INSTRUCTIONS:
// 1. In Airtable Automations, create a new automation
// 2. Trigger: "When record matches conditions"
//    - Table: Leads
//    - Conditions: When "Convert to Client" is checked
// 3. Action: "Run a script"
//    - Paste this script
//    - In "Configure input variables":
//      - Variable name: leadRecordId
//      - Value: Select the Lead record ID from the trigger (use the record ID pill)
// ============================================================================


// ============================================================================
// CONFIGURATION - Update these values for your setup
// ============================================================================


const CONFIG = {
    // Admin User ID for notifications
    ADMIN_USER_ID: 'usrZy7b3Gx6C2hu6Z', // Replace with your actual Admin User ID

    // Webhook URLs for Xero Contact Creation (U1)
    WEBHOOKS: {
        PRODUCTION: 'https://n8n.stryvacademics.com/webhook/9e598246-cea0-4829-ae01-a9723767e6b9',
        TEST: 'https://n8n.stryvacademics.com/webhook-test/9e598246-cea0-4829-ae01-a9723767e6b9',
        USE_TEST: false // Set to true for testing
    },

    // Webhook configuration
    WEBHOOK_CONFIG: {
        RETRY_ATTEMPTS: 3,          // Number of times to retry webhook call
        POLLING_ATTEMPTS: 15,       // Number of times to poll for Xero ID
        POLLING_DELAY_ITERATIONS: 100000 // Busy-wait iterations (Airtable doesn't support setTimeout)
    },

    // Table Names
    TABLES: {
        LEADS: 'Leads',
        USERS: 'Users',
        PARENTS: 'Parents',
        STUDENTS: 'Students',
        ADMIN_NOTIFICATIONS: 'Admin Notifications'
    },

    // Lead field names
    LEAD_FIELDS: {
        CONVERT_TO_CLIENT: 'Convert to Client', // Checkbox field
        LEAD_TYPE: 'Lead Type',
        LEAD_STATUS: 'Lead Status',
        PARENT_FIRST_NAME: 'Parent First Name',
        PARENT_LAST_NAME: 'Parent Last Name',
        PARENT_EMAIL: 'Parent Email',
        PARENT_PHONE: 'Parent Phone',
        STUDENT_FIRST_NAME: 'Student First Name',
        STUDENT_LAST_NAME: 'Student Last Name',
        STUDENT_EMAIL: 'Student Email',
        STUDENT_PHONE: 'Student Phone',
        GRADE_YEAR: 'Grade/Year',
        SCHOOL: 'School', // Note: This is TEXT in Leads, but LINKED RECORD in Students
        SUBJECTS_WANTED: 'Subjects Wanted',
        LEARNING_PREFERENCES: 'Learning Preferences',
        ACADEMIC_GOALS: 'Academic Goals',
        SPECIAL_ACCOMMODATIONS: 'Special Accommodations',
        PREFERRED_DAYS_TIMES: 'Preferred Days and Times',
        PREFERRED_FREQUENCY: 'Preferred Frequency',
        PREFERRED_MODES: 'Preferred Modes',
        LOCATION: 'Location',
        OTHER_LOCATION: 'Other Location',
        CONVERTED_AT: 'Converted At',
        LINK_TO_PARENTS: 'Link to Parents',
        LINK_TO_STUDENTS: 'Link to Students'
    },

    // Users table field names
    USER_FIELDS: {
        FIRST_NAME: 'First Name',
        LAST_NAME: 'Last Name',
        EMAIL: 'Email',
        PHONE: 'Phone',
        ROLE: 'Role',
        STATUS: 'Status',
        PROFILE_COMPLETED_AT: 'Profile Completed At',
        XERO_CONTACT_ID: 'Xero Contact ID' // Assumed to be in Users table
    },

    // Parents table field names
    PARENT_FIELDS: {
        USER_ID: 'User ID', // Correct field name from schema
        // Note: Xero Contact ID is in Users table, not Parents table
    },

    // Students table field names
    STUDENT_FIELDS: {
        USER_ID: 'User ID', // Correct field name from schema
        PARENTS: 'Parents', // Correct field name from schema
        GRADE_YEAR: 'Grade/Year', // Single select field
        SCHOOL: 'School', // IMPORTANT: This is a LINKED RECORD field, not text
        LEARNING_PREFERENCES: 'Learning Preferences',
        ACADEMIC_GOALS: 'Academic Goals',
        SPECIAL_ACCOMMODATIONS: 'Special Accommodations',
        PREFERRED_DAYS_TIMES: 'Preferred Days and Times',
        PREFERRED_FREQUENCY: 'Preferred Frequency',
        PREFERRED_MODES: 'Preferred Modes', // Multiple select field
        NOTES: 'Notes'
    },

    // Role Types
    ROLES: {
        PARENT: 'Parent',
        STUDENT_DEPENDENT: 'Student (Dependent)',
        STUDENT_INDEPENDENT: 'Student (Independent)'
    },

    // Lead Types
    LEAD_TYPES: {
        PARENT: 'Parent',
        STUDENT: 'Student'
    },

    // Status Values
    STATUS: {
        ACTIVE: 'Active',
        INACTIVE: 'Inactive'
    },

    // Lead Status Values
    LEAD_STATUS: {
        NEW: 'New',
        CONTACTED: 'Contacted',
        CONVERTED: 'Converted',
        LOST: 'Lost'
    },

    // Notification templates
    NOTIFICATIONS: {
        SUCCESS_TITLE: '✅ Lead Converted Successfully - {name}',
        SUCCESS_DETAILS: `Lead successfully converted to client.

Lead: {leadName}
Lead Type: {leadType}
Created Records:
{recordsSummary}

Parent Xero Contact ID: {parentXeroId}
Student Xero Contact ID: {studentXeroId}

Converted At: {convertedAt}`,

        ERROR_TITLE: '🚨 ERROR: Lead Conversion Failed - {name}',
        ERROR_DETAILS: `Failed to convert lead to client.

Lead: {leadName}
Lead Type: {leadType}
Error: {error}

Action Required: Review error and manually convert if needed.`
    }
};


// ============================================================================
// HELPER FUNCTIONS
// ============================================================================


/**
 * Busy-wait delay function (Airtable doesn't support setTimeout)
 * This creates a blocking delay by running a loop
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
 * Get single select name
 */
function getSingleSelectName(selectValue, defaultValue = null) {
    if (!selectValue || typeof selectValue !== 'object') {
        return defaultValue;
    }
    return selectValue.name || defaultValue;
}


/**
 * Get multiple select names as array
 */
function getMultipleSelectArray(selectValues) {
    if (!Array.isArray(selectValues) || selectValues.length === 0) {
        return [];
    }
    return selectValues.map(item => ({name: item.name}));
}


/**
 * Determine student email (use provided or generate plus-addressed)
 */
function determineStudentEmail(studentEmail, parentEmail, studentFirstName) {
    // If student email provided, use it
    if (studentEmail && studentEmail.trim()) {
        return studentEmail.trim();
    }

    // Generate plus-addressed email from parent
    if (!parentEmail || !studentFirstName) {
        return null;
    }

    let emailParts = parentEmail.split('@');
    if (emailParts.length !== 2) {
        return null;
    }

    let localPart = emailParts[0];
    let domain = emailParts[1];
    let studentFirstClean = studentFirstName.toLowerCase().replace(/\s+/g, '');

    return `${localPart}+${studentFirstClean}@${domain}`;
}


/**
 * Call webhook and poll for Xero Contact ID in Users table
 */
async function callXeroWebhookAndWait(userId) {
    let webhookUrl = CONFIG.WEBHOOKS.USE_TEST ? CONFIG.WEBHOOKS.TEST : CONFIG.WEBHOOKS.PRODUCTION;

    console.log(`Calling Xero webhook: ${webhookUrl}`);
    console.log(`User ID: ${userId}`);

    const MAX_WEBHOOK_ATTEMPTS = CONFIG.WEBHOOK_CONFIG.RETRY_ATTEMPTS;
    const MAX_POLLING_ATTEMPTS = CONFIG.WEBHOOK_CONFIG.POLLING_ATTEMPTS;

    // STEP 1: Call the webhook with retries
    let webhookSuccess = false;

    for (let attempt = 1; attempt <= MAX_WEBHOOK_ATTEMPTS; attempt++) {
        console.log(`Webhook attempt ${attempt}/${MAX_WEBHOOK_ATTEMPTS}...`);

        try {
            let response = await fetch(webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId: userId
                })
            });

            if (!response.ok) {
                let errorText = await response.text();
                console.error(`Webhook call failed with status ${response.status}: ${errorText}`);

                if (attempt < MAX_WEBHOOK_ATTEMPTS) {
                    console.log(`Retrying webhook...`);
                    busyWait(CONFIG.WEBHOOK_CONFIG.POLLING_DELAY_ITERATIONS);
                    continue;
                } else {
                    throw new Error(`Webhook call failed after ${MAX_WEBHOOK_ATTEMPTS} attempts`);
                }
            }

            let data = await response.json();
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

    // STEP 2: Poll for Xero Contact ID
    console.log(`Polling for Xero Contact ID (max ${MAX_POLLING_ATTEMPTS} attempts)...`);

    let usersTbl = base.getTable(CONFIG.TABLES.USERS);

    for (let pollAttempt = 1; pollAttempt <= MAX_POLLING_ATTEMPTS; pollAttempt++) {
        console.log(`Poll attempt ${pollAttempt}/${MAX_POLLING_ATTEMPTS}...`);

        // Add delay between polls (except first attempt)
        if (pollAttempt > 1) {
            busyWait(CONFIG.WEBHOOK_CONFIG.POLLING_DELAY_ITERATIONS);
        }

        // Query Users table to check if Xero Contact ID is populated
        let usersQuery = await usersTbl.selectRecordsAsync({
            fields: [CONFIG.USER_FIELDS.XERO_CONTACT_ID]
        });

        let userRecord = usersQuery.getRecord(userId);

        if (userRecord) {
            let xeroContactId = userRecord.getCellValue(CONFIG.USER_FIELDS.XERO_CONTACT_ID);

            if (xeroContactId) {
                console.log(`✅ Xero Contact ID found: ${xeroContactId}`);
                return {
                    success: true,
                    xeroContactId: xeroContactId
                };
            } else {
                console.log(`Xero Contact ID not yet populated (poll ${pollAttempt}/${MAX_POLLING_ATTEMPTS})`);
            }
        } else {
            console.error(`User record ${userId} not found`);
            throw new Error(`User record ${userId} not found during polling`);
        }
    }

    // If we've exhausted all polling attempts
    throw new Error(`Failed to get Xero Contact ID after ${MAX_POLLING_ATTEMPTS} polling attempts. The webhook may still be processing.`);
}


/**
 * Create admin notification
 */
async function createAdminNotification(title, details, priority, category, status) {
    try {
        let adminNotificationsTbl = base.getTable(CONFIG.TABLES.ADMIN_NOTIFICATIONS);

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
 * Format date/time for display
 */
function formatDateTime(dateValue) {
    if (!dateValue) {
        return 'N/A';
    }

    try {
        let date = new Date(dateValue);
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


// ============================================================================
// MAIN CONVERSION LOGIC
// ============================================================================

// ============================================================================
// FIX #1: Convert Parent Lead - Create User FIRST, then link to Parent/Student
// ============================================================================

async function convertParentLead(leadRecord, leadId) {
    let createdRecords = {
        parentUserId: null,
        parentRecordId: null,
        studentUserId: null,
        studentRecordId: null
    };

    try {
        // Extract parent data
        let parentFirstName = safeString(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.PARENT_FIRST_NAME));
        let parentLastName = safeString(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.PARENT_LAST_NAME));
        let parentEmail = safeString(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.PARENT_EMAIL));
        let parentPhone = safeString(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.PARENT_PHONE));

        // Extract student data
        let studentFirstName = safeString(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.STUDENT_FIRST_NAME));
        let studentLastName = safeString(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.STUDENT_LAST_NAME));
        let studentEmailRaw = safeString(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.STUDENT_EMAIL));
        let studentPhone = safeString(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.STUDENT_PHONE));

        // Validate required fields
        if (!parentFirstName || !parentLastName || !parentEmail) {
            throw new Error('Missing required parent information (First Name, Last Name, Email)');
        }

        if (!studentFirstName || !studentLastName) {
            throw new Error('Missing required student information (First Name, Last Name)');
        }

        // Determine student email
        let studentEmail = determineStudentEmail(studentEmailRaw, parentEmail, studentFirstName);
        if (!studentEmail) {
            throw new Error('Could not determine student email');
        }

        // Use student phone if provided, otherwise use parent phone
        if (!studentPhone) {
            studentPhone = parentPhone;
        }

        console.log('Creating Parent User record...');

        // STEP 1: Create Parent User record FIRST (WITHOUT self-reference)
        let usersTbl = base.getTable(CONFIG.TABLES.USERS);
        let parentUserId = await usersTbl.createRecordAsync({
            [CONFIG.USER_FIELDS.FIRST_NAME]: parentFirstName,
            [CONFIG.USER_FIELDS.LAST_NAME]: parentLastName,
            [CONFIG.USER_FIELDS.EMAIL]: parentEmail,
            [CONFIG.USER_FIELDS.PHONE]: parentPhone,
            [CONFIG.USER_FIELDS.ROLE]: {name: CONFIG.ROLES.PARENT},
            [CONFIG.USER_FIELDS.STATUS]: {name: CONFIG.STATUS.ACTIVE}
            // DO NOT include USER_ID field here - it's a linked record field
        });

        createdRecords.parentUserId = parentUserId;
        console.log(`✅ Parent User created: ${parentUserId}`);

        // STEP 2: Call webhook and poll for Xero ID
        console.log('Triggering Xero contact creation and waiting for ID...');
        let xeroResponse = await callXeroWebhookAndWait(parentUserId);
        let parentXeroId = xeroResponse.xeroContactId;
        console.log(`✅ Parent Xero Contact ID retrieved: ${parentXeroId}`);

        // STEP 3: Create Parent record and link to User record
        console.log('Creating Parent record...');
        let parentsTbl = base.getTable(CONFIG.TABLES.PARENTS);
        let parentRecordId = await parentsTbl.createRecordAsync({
            [CONFIG.PARENT_FIELDS.USER_ID]: [{id: parentUserId}]
        });

        createdRecords.parentRecordId = parentRecordId;
        console.log(`✅ Parent record created: ${parentRecordId}`);

        // STEP 4: Create Student User record (WITHOUT self-reference)
        console.log('Creating Student User record...');
        let studentUserId = await usersTbl.createRecordAsync({
            [CONFIG.USER_FIELDS.FIRST_NAME]: studentFirstName,
            [CONFIG.USER_FIELDS.LAST_NAME]: studentLastName,
            [CONFIG.USER_FIELDS.EMAIL]: studentEmail,
            [CONFIG.USER_FIELDS.PHONE]: studentPhone,
            [CONFIG.USER_FIELDS.ROLE]: {name: CONFIG.ROLES.STUDENT_DEPENDENT},
            [CONFIG.USER_FIELDS.STATUS]: {name: CONFIG.STATUS.ACTIVE}
            // DO NOT include USER_ID field here - it's a linked record field
        });

        createdRecords.studentUserId = studentUserId;
        console.log(`✅ Student User created: ${studentUserId}`);

        // STEP 5: Create Student record and link to both User and Parent
        console.log('Creating Student record...');
        let studentsTbl = base.getTable(CONFIG.TABLES.STUDENTS);

        let gradeYear = getSingleSelectName(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.GRADE_YEAR));
        let preferredModes = getMultipleSelectArray(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.PREFERRED_MODES));

        // Build student record fields - link to User and Parent
        let studentRecordFields = {
            [CONFIG.STUDENT_FIELDS.USER_ID]: [{id: studentUserId}],
            [CONFIG.STUDENT_FIELDS.PARENTS]: [{id: parentRecordId}],
            [CONFIG.STUDENT_FIELDS.LEARNING_PREFERENCES]: safeString(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.LEARNING_PREFERENCES)),
            [CONFIG.STUDENT_FIELDS.ACADEMIC_GOALS]: safeString(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.ACADEMIC_GOALS)),
            [CONFIG.STUDENT_FIELDS.SPECIAL_ACCOMMODATIONS]: safeString(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.SPECIAL_ACCOMMODATIONS)),
            [CONFIG.STUDENT_FIELDS.PREFERRED_DAYS_TIMES]: safeString(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.PREFERRED_DAYS_TIMES)),
            [CONFIG.STUDENT_FIELDS.PREFERRED_FREQUENCY]: safeString(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.PREFERRED_FREQUENCY))
        };

        // Add optional single select field only if it has a value
        if (gradeYear) {
            studentRecordFields[CONFIG.STUDENT_FIELDS.GRADE_YEAR] = {name: gradeYear};
        }

        // Add optional multi-select field only if it has values
        if (preferredModes.length > 0) {
            studentRecordFields[CONFIG.STUDENT_FIELDS.PREFERRED_MODES] = preferredModes;
        }

        let studentRecordId = await studentsTbl.createRecordAsync(studentRecordFields);

        createdRecords.studentRecordId = studentRecordId;
        console.log(`✅ Student record created: ${studentRecordId}`);

        return {
            success: true,
            parentUserId,
            parentRecordId,
            studentUserId,
            studentRecordId,
            parentXeroId,
            studentXeroId: parentXeroId // Student inherits parent's Xero ID
        };

    } catch (error) {
        console.error('Error in convertParentLead:', error);
        await rollbackRecords(createdRecords);
        throw error;
    }
}


// ============================================================================
// FIX #2: Convert Independent Student Lead - Create User FIRST, then link
// ============================================================================

async function convertIndependentStudentLead(leadRecord, leadId) {
    let createdRecords = {
        studentUserId: null,
        studentRecordId: null
    };

    try {
        // Extract student data
        let studentFirstName = safeString(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.STUDENT_FIRST_NAME));
        let studentLastName = safeString(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.STUDENT_LAST_NAME));
        let studentEmail = safeString(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.STUDENT_EMAIL));
        let studentPhone = safeString(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.STUDENT_PHONE));

        // Validate required fields
        if (!studentFirstName || !studentLastName || !studentEmail) {
            throw new Error('Missing required student information (First Name, Last Name, Email)');
        }

        console.log('Creating Student User record...');

        // STEP 1: Create Student User record FIRST (WITHOUT self-reference)
        let usersTbl = base.getTable(CONFIG.TABLES.USERS);
        let studentUserId = await usersTbl.createRecordAsync({
            [CONFIG.USER_FIELDS.FIRST_NAME]: studentFirstName,
            [CONFIG.USER_FIELDS.LAST_NAME]: studentLastName,
            [CONFIG.USER_FIELDS.EMAIL]: studentEmail,
            [CONFIG.USER_FIELDS.PHONE]: studentPhone,
            [CONFIG.USER_FIELDS.ROLE]: {name: CONFIG.ROLES.STUDENT_INDEPENDENT},
            [CONFIG.USER_FIELDS.STATUS]: {name: CONFIG.STATUS.ACTIVE}
            // DO NOT include USER_ID field here - it's a linked record field
        });

        createdRecords.studentUserId = studentUserId;
        console.log(`✅ Student User created: ${studentUserId}`);

        // STEP 2: Call webhook and poll for Xero ID (for independent students)
        console.log('Triggering Xero contact creation and waiting for ID...');
        let xeroResponse = await callXeroWebhookAndWait(studentUserId);
        let studentXeroId = xeroResponse.xeroContactId;
        console.log(`✅ Student Xero Contact ID retrieved: ${studentXeroId}`);

        // STEP 3: Create Student record and link to User
        console.log('Creating Student record...');
        let studentsTbl = base.getTable(CONFIG.TABLES.STUDENTS);

        let gradeYear = getSingleSelectName(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.GRADE_YEAR));
        let preferredModes = getMultipleSelectArray(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.PREFERRED_MODES));

        // Build student record fields - link to User (no parent for independent students)
        let studentRecordFields = {
            [CONFIG.STUDENT_FIELDS.USER_ID]: [{id: studentUserId}],
            // No PARENTS field for independent students
            [CONFIG.STUDENT_FIELDS.LEARNING_PREFERENCES]: safeString(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.LEARNING_PREFERENCES)),
            [CONFIG.STUDENT_FIELDS.ACADEMIC_GOALS]: safeString(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.ACADEMIC_GOALS)),
            [CONFIG.STUDENT_FIELDS.SPECIAL_ACCOMMODATIONS]: safeString(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.SPECIAL_ACCOMMODATIONS)),
            [CONFIG.STUDENT_FIELDS.PREFERRED_DAYS_TIMES]: safeString(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.PREFERRED_DAYS_TIMES)),
            [CONFIG.STUDENT_FIELDS.PREFERRED_FREQUENCY]: safeString(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.PREFERRED_FREQUENCY))
        };

        // Add optional single select field only if it has a value
        if (gradeYear) {
            studentRecordFields[CONFIG.STUDENT_FIELDS.GRADE_YEAR] = {name: gradeYear};
        }

        // Add optional multi-select field only if it has values
        if (preferredModes.length > 0) {
            studentRecordFields[CONFIG.STUDENT_FIELDS.PREFERRED_MODES] = preferredModes;
        }

        let studentRecordId = await studentsTbl.createRecordAsync(studentRecordFields);

        createdRecords.studentRecordId = studentRecordId;
        console.log(`✅ Student record created: ${studentRecordId}`);

        return {
            success: true,
            studentUserId,
            studentRecordId,
            parentXeroId: null,
            studentXeroId: studentXeroId
        };

    } catch (error) {
        console.error('Error in convertIndependentStudentLead:', error);
        await rollbackRecords(createdRecords);
        throw error;
    }
}



/**
 * Rollback created records on error
 */
async function rollbackRecords(createdRecords) {
    console.log('⚠️ Rolling back created records...');

    try {
        // Delete in reverse order of creation
        if (createdRecords.studentRecordId) {
            let studentsTbl = base.getTable(CONFIG.TABLES.STUDENTS);
            await studentsTbl.deleteRecordAsync(createdRecords.studentRecordId);
            console.log('Rolled back Student record');
        }

        if (createdRecords.studentUserId) {
            let usersTbl = base.getTable(CONFIG.TABLES.USERS);
            await usersTbl.deleteRecordAsync(createdRecords.studentUserId);
            console.log('Rolled back Student User');
        }

        if (createdRecords.parentRecordId) {
            let parentsTbl = base.getTable(CONFIG.TABLES.PARENTS);
            await parentsTbl.deleteRecordAsync(createdRecords.parentRecordId);
            console.log('Rolled back Parent record');
        }

        if (createdRecords.parentUserId) {
            let usersTbl = base.getTable(CONFIG.TABLES.USERS);
            await usersTbl.deleteRecordAsync(createdRecords.parentUserId);
            console.log('Rolled back Parent User');
        }

        console.log('✅ Rollback complete');
    } catch (rollbackError) {
        console.error('❌ Error during rollback:', rollbackError);
    }
}


// ============================================================================
// MAIN SCRIPT EXECUTION
// ============================================================================


(async function main() {
    try {
        // ============================================================================
        // FIX: Improved input handling with better error messages
        // ============================================================================

        console.log('='.repeat(60));
        console.log('LEAD CONVERSION SCRIPT STARTED');
        console.log('='.repeat(60));

        // Get input configuration
        let inputConfig = input.config();
        console.log('Input config received:', JSON.stringify(inputConfig));

        // Try multiple possible input field names
        let leadId = inputConfig.leadRecordId || inputConfig['leadRecordId'] ||
                     inputConfig['Lead ID'] || inputConfig.leadId ||
                     inputConfig.recordId || inputConfig['Record ID'];

        if (!leadId) {
            console.error('❌ Lead ID not provided in input config');
            console.error('Available input fields:', Object.keys(inputConfig));
            console.error('');
            console.error('AUTOMATION SETUP INSTRUCTIONS:');
            console.error('1. In your Airtable automation, go to the "Run a script" action');
            console.error('2. Click "Configure input variables"');
            console.error('3. Add a new input variable:');
            console.error('   - Variable name: leadRecordId');
            console.error('   - Value: Select the record ID from the trigger step');
            console.error('4. Save and test the automation');
            console.error('');
            throw new Error('Lead ID not provided. Please configure the automation to pass the record ID. See console for setup instructions.');
        }

        console.log(`\n${'='.repeat(60)}`);
        console.log(`CONVERTING LEAD: ${leadId}`);
        console.log(`${'='.repeat(60)}\n`);

        // Fetch lead record
        let leadsTbl = base.getTable(CONFIG.TABLES.LEADS);
        let leadFields = Object.values(CONFIG.LEAD_FIELDS);
        let leadQuery = await leadsTbl.selectRecordsAsync({fields: leadFields});
        let leadRecord = leadQuery.getRecord(leadId);

        if (!leadRecord) {
            throw new Error(`Lead record not found: ${leadId}`);
        }

        console.log('✅ Lead record found');

        // ============================================================================
        // VALIDATION: Check if "Convert to Client" checkbox is checked (if field exists)
        // ============================================================================

        // Note: The "Convert to Client" field may not exist in the schema yet
        // If it doesn't exist, we assume the automation trigger handles this condition
        try {
            let convertToClient = leadRecord.getCellValue(CONFIG.LEAD_FIELDS.CONVERT_TO_CLIENT);

            if (!convertToClient) {
                console.log('⚠️ "Convert to Client" checkbox is not checked. Aborting conversion.');
                return; // Exit silently
            }

            console.log('✅ "Convert to Client" checkbox is checked. Proceeding...\n');
        } catch (fieldError) {
            console.log('⚠️ "Convert to Client" field not found - assuming automation handles this condition');
        }

        // ============================================================================
        // VALIDATION: Check if already converted
        // ============================================================================

        let leadStatus = getSingleSelectName(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.LEAD_STATUS));

        if (leadStatus === CONFIG.LEAD_STATUS.CONVERTED) {
            console.log('⚠️ Lead is already converted. Aborting to prevent duplicate records.');

            // Try to uncheck the "Convert to Client" checkbox if it exists
            try {
                await leadsTbl.updateRecordAsync(leadId, {
                    [CONFIG.LEAD_FIELDS.CONVERT_TO_CLIENT]: false
                });
                console.log('✅ "Convert to Client" checkbox unchecked');
            } catch (uncheckError) {
                console.log('⚠️ Could not uncheck "Convert to Client" checkbox (field may not exist)');
            }

            return; // Exit silently
        }

        // Get lead type
        let leadType = getSingleSelectName(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.LEAD_TYPE));

        if (!leadType) {
            throw new Error('Lead Type not specified');
        }

        console.log(`Lead Type: ${leadType}`);
        console.log(`Lead Status: ${leadStatus}\n`);

        // Convert based on lead type
        let result;

        if (leadType === CONFIG.LEAD_TYPES.PARENT) {
            console.log('Converting Parent Lead...\n');
            result = await convertParentLead(leadRecord, leadId);
        } else if (leadType === CONFIG.LEAD_TYPES.STUDENT) {
            console.log('Converting Independent Student Lead...\n');
            result = await convertIndependentStudentLead(leadRecord, leadId);
        } else {
            throw new Error(`Invalid Lead Type: ${leadType}`);
        }

        // Update lead record
        console.log('\nUpdating Lead record...');

        let leadUpdateFields = {
            [CONFIG.LEAD_FIELDS.LEAD_STATUS]: {name: CONFIG.LEAD_STATUS.CONVERTED},
            [CONFIG.LEAD_FIELDS.CONVERTED_AT]: new Date().toISOString()
        };

        // Try to uncheck the checkbox if it exists
        try {
            leadUpdateFields[CONFIG.LEAD_FIELDS.CONVERT_TO_CLIENT] = false;
        } catch (e) {
            // Field may not exist
        }

        // Add links to created records
        if (leadType === CONFIG.LEAD_TYPES.PARENT && result.parentRecordId) {
            leadUpdateFields[CONFIG.LEAD_FIELDS.LINK_TO_PARENTS] = [{id: result.parentRecordId}];
        }

        if (result.studentRecordId) {
            leadUpdateFields[CONFIG.LEAD_FIELDS.LINK_TO_STUDENTS] = [{id: result.studentRecordId}];
        }

        await leadsTbl.updateRecordAsync(leadId, leadUpdateFields);

        console.log('✅ Lead record updated to Converted');

        // Build success notification
        let leadName = leadType === CONFIG.LEAD_TYPES.PARENT
            ? `${safeString(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.PARENT_FIRST_NAME))} ${safeString(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.PARENT_LAST_NAME))}`
            : `${safeString(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.STUDENT_FIRST_NAME))} ${safeString(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.STUDENT_LAST_NAME))}`;

        let recordsSummary = leadType === CONFIG.LEAD_TYPES.PARENT
            ? `- Parent User: ${result.parentUserId}\n- Parent Record: ${result.parentRecordId}\n- Student User: ${result.studentUserId}\n- Student Record: ${result.studentRecordId}`
            : `- Student User: ${result.studentUserId}\n- Student Record: ${result.studentRecordId}`;

        let notificationTitle = CONFIG.NOTIFICATIONS.SUCCESS_TITLE.replace('{name}', leadName);
        let notificationDetails = CONFIG.NOTIFICATIONS.SUCCESS_DETAILS
            .replace('{leadName}', leadName)
            .replace('{leadType}', leadType)
            .replace('{recordsSummary}', recordsSummary)
            .replace('{parentXeroId}', result.parentXeroId || 'N/A')
            .replace('{studentXeroId}', result.studentXeroId || 'Pending')
            .replace('{convertedAt}', formatDateTime(new Date()));

        await createAdminNotification(
            notificationTitle,
            notificationDetails,
            'Regular',
            'Leads',
            'Completed'
        );

        console.log('\n' + '='.repeat(60));
        console.log('✅ LEAD CONVERSION COMPLETE');
        console.log('='.repeat(60) + '\n');

    } catch (error) {
        console.error('\n' + '='.repeat(60));
        console.error('❌ LEAD CONVERSION FAILED');
        console.error('='.repeat(60));
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        console.error('='.repeat(60) + '\n');

        // Try to uncheck the "Convert to Client" checkbox on error
        try {
            let inputConfig = input.config();
            let leadId = inputConfig.leadRecordId || inputConfig['leadRecordId'] ||
                         inputConfig['Lead ID'] || inputConfig.leadId ||
                         inputConfig.recordId || inputConfig['Record ID'];
            if (leadId) {
                let leadsTbl = base.getTable(CONFIG.TABLES.LEADS);
                await leadsTbl.updateRecordAsync(leadId, {
                    [CONFIG.LEAD_FIELDS.CONVERT_TO_CLIENT]: false
                });
                console.log('✅ "Convert to Client" checkbox unchecked after error');
            }
        } catch (uncheckError) {
            console.error('⚠️ Failed to uncheck checkbox:', uncheckError.message);
        }

        // Create error notification
        try {
            let leadName = 'Unknown';
            let leadType = 'Unknown';

            // Try to get lead details for better error notification
            try {
                let inputConfig = input.config();
                let leadId = inputConfig.leadRecordId || inputConfig['leadRecordId'] ||
                             inputConfig['Lead ID'] || inputConfig.leadId ||
                             inputConfig.recordId || inputConfig['Record ID'];
                if (leadId) {
                    let leadsTbl = base.getTable(CONFIG.TABLES.LEADS);
                    let leadQuery = await leadsTbl.selectRecordsAsync({
                        fields: [CONFIG.LEAD_FIELDS.LEAD_TYPE, CONFIG.LEAD_FIELDS.PARENT_FIRST_NAME,
                                CONFIG.LEAD_FIELDS.PARENT_LAST_NAME, CONFIG.LEAD_FIELDS.STUDENT_FIRST_NAME,
                                CONFIG.LEAD_FIELDS.STUDENT_LAST_NAME]
                    });
                    let leadRecord = leadQuery.getRecord(leadId);

                    if (leadRecord) {
                        leadType = getSingleSelectName(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.LEAD_TYPE)) || 'Unknown';
                        leadName = leadType === CONFIG.LEAD_TYPES.PARENT
                            ? `${safeString(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.PARENT_FIRST_NAME))} ${safeString(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.PARENT_LAST_NAME))}`
                            : `${safeString(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.STUDENT_FIRST_NAME))} ${safeString(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.STUDENT_LAST_NAME))}`;
                    }
                }
            } catch (detailError) {
                // Ignore - we'll use 'Unknown'
            }

            let errorTitle = CONFIG.NOTIFICATIONS.ERROR_TITLE.replace('{name}', leadName);
            let errorDetails = CONFIG.NOTIFICATIONS.ERROR_DETAILS
                .replace('{leadName}', leadName)
                .replace('{leadType}', leadType)
                .replace('{error}', error.message);

            await createAdminNotification(
                errorTitle,
                errorDetails,
                'Urgent',
                'System Error',
                'Pending'
            );

            console.log('✅ Error notification created');
        } catch (notifError) {
            console.error('❌ Failed to create error notification:', notifError.message);
        }

        throw error;
    }
})();
