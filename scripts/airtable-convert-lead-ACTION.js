// ============================================================================
// AIRTABLE SCRIPT: Convert Lead to Client - ACTION SCRIPT (v2.0)
// ============================================================================
// Trigger: When "Convert to Client" checkbox is checked in Leads table
// Purpose: Create User, Parent/Student records and trigger Xero webhook
//
// NOTE: This is PART 1 of a 2-script system:
//   - ACTION SCRIPT (this file): Creates records, triggers webhook, creates notification
//   - POLLING SCRIPT (separate): Retrieves Xero ID and updates notification
//
// WORKFLOW:
// For Parent Leads:
//   1. Create Parent User → Create Parent record
//   2. Link Parent User ↔ Parent record (bidirectional)
//   3. Create Student User → Create Student record
//   4. Link Student User ↔ Student record (bidirectional)
//   5. Send Xero webhook for Parent User (fire and forget)
//   6. Create Admin Notification with User ID (no Xero ID yet)
//   7. Update Lead status to Converted
//
// For Independent Student Leads:
//   1. Create Student User → Create Student record
//   2. Link Student User ↔ Student record (bidirectional)
//   3. Send Xero webhook for Student User (fire and forget)
//   4. Create Admin Notification with User ID (no Xero ID yet)
//   5. Update Lead status to Converted
//
// IMPORTANT NOTES:
// - input.config() is called ONCE at the beginning (Airtable limitation)
// - Webhook is sent AFTER all records are created and linked
// - NO POLLING in this script (avoids 30 query limit)
// - Xero ID will be added later by the POLLING SCRIPT
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

    // Webhook URLs for Xero Contact Creation
    WEBHOOKS: {
        PRODUCTION: 'https://n8n.stryvacademics.com/webhook/9e598246-cea0-4829-ae01-a9723767e6b9',
        TEST: 'https://n8n.stryvacademics.com/webhook-test/9e598246-cea0-4829-ae01-a9723767e6b9',
        USE_TEST: false // Set to true for testing
    },

    // Webhook configuration
    WEBHOOK_CONFIG: {
        RETRY_ATTEMPTS: 3          // Number of times to retry webhook call
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
        CONVERT_TO_CLIENT: 'Convert to Client',
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
        SCHOOL: 'School',
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
        LINK_TO_STUDENTS: 'Link to Students',
        LINK_TO_USERS: 'Link to Users'  // Link to Users table
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
        XERO_CONTACT_ID: 'Xero Contact ID',
        LINK_TO_PARENT_RECORD: 'Link to Parent Record',
        LINK_TO_STUDENT_RECORD: 'Link to Student Record'
    },

    // Parents table field names
    PARENT_FIELDS: {
        USER_ID: 'User ID'
    },

    // Students table field names
    STUDENT_FIELDS: {
        USER_ID: 'User ID',
        PARENTS: 'Parents',
        GRADE_YEAR: 'Grade/Year',
        SCHOOL: 'School',
        LEARNING_PREFERENCES: 'Learning Preferences',
        ACADEMIC_GOALS: 'Academic Goals',
        SPECIAL_ACCOMMODATIONS: 'Special Accommodations',
        PREFERRED_DAYS_TIMES: 'Preferred Days and Times',
        PREFERRED_FREQUENCY: 'Preferred Frequency',
        PREFERRED_MODES: 'Preferred Modes',
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
        SUCCESS_TITLE: '✅ Lead Converted - Pending Xero ID - {name}',
        SUCCESS_DETAILS: `Lead successfully converted to client. Xero Contact ID will be added shortly.

Lead: {leadName}
Lead Type: {leadType}
Created Records:
{recordsSummary}

User ID for Xero Contact: {userId}

Converted At: {convertedAt}

NOTE: The Xero Contact ID will be retrieved and added to this notification by the polling script.`,

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
 * Trigger Xero webhook (fire and forget - no polling)
 */
async function triggerXeroWebhook(userId) {
    let webhookUrl = CONFIG.WEBHOOKS.USE_TEST ? CONFIG.WEBHOOKS.TEST : CONFIG.WEBHOOKS.PRODUCTION;

    console.log(`Triggering Xero webhook: ${webhookUrl}`);
    console.log(`User ID: ${userId}`);

    const MAX_ATTEMPTS = CONFIG.WEBHOOK_CONFIG.RETRY_ATTEMPTS;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        console.log(`Webhook attempt ${attempt}/${MAX_ATTEMPTS}...`);

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

                if (attempt < MAX_ATTEMPTS) {
                    console.log(`Retrying webhook...`);
                    continue;
                } else {
                    throw new Error(`Webhook call failed after ${MAX_ATTEMPTS} attempts`);
                }
            }

            let data = await response.json();
            console.log('✅ Webhook triggered successfully:', JSON.stringify(data));
            return {success: true};

        } catch (fetchError) {
            console.error('Webhook fetch error:', fetchError);

            if (attempt < MAX_ATTEMPTS) {
                console.log(`Retrying webhook...`);
                continue;
            } else {
                throw new Error(`Failed to call webhook after ${MAX_ATTEMPTS} attempts: ${fetchError.message}`);
            }
        }
    }

    throw new Error('Webhook call failed');
}


/**
 * Create admin notification
 */
async function createAdminNotification(title, details, priority, category, status) {
    try {
        let adminNotificationsTbl = base.getTable(CONFIG.TABLES.ADMIN_NOTIFICATIONS);

        let notificationId = await adminNotificationsTbl.createRecordAsync({
            "Assigned To": [{id: CONFIG.ADMIN_USER_ID}],
            "Priority": {name: priority},
            "Notification Category": {name: category},
            "Title": String(title).substring(0, 500),
            "Details": String(details).substring(0, 10000),
            "Action Status": {name: status}
        });

        console.log(`✅ Admin notification created: ${notificationId}`);
        return notificationId;
    } catch (error) {
        console.error('Failed to create admin notification:', error);
        return null;
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

        // STEP 1: Create Parent User record
        let usersTbl = base.getTable(CONFIG.TABLES.USERS);
        let parentUserId = await usersTbl.createRecordAsync({
            [CONFIG.USER_FIELDS.FIRST_NAME]: parentFirstName,
            [CONFIG.USER_FIELDS.LAST_NAME]: parentLastName,
            [CONFIG.USER_FIELDS.EMAIL]: parentEmail,
            [CONFIG.USER_FIELDS.PHONE]: parentPhone,
            [CONFIG.USER_FIELDS.ROLE]: {name: CONFIG.ROLES.PARENT},
            [CONFIG.USER_FIELDS.STATUS]: {name: CONFIG.STATUS.ACTIVE}
        });

        createdRecords.parentUserId = parentUserId;
        console.log(`✅ Parent User created: ${parentUserId}`);

        // STEP 2: Create Parent record and link to User record
        console.log('Creating Parent record...');
        let parentsTbl = base.getTable(CONFIG.TABLES.PARENTS);
        let parentRecordId = await parentsTbl.createRecordAsync({
            [CONFIG.PARENT_FIELDS.USER_ID]: [{id: parentUserId}]
        });

        createdRecords.parentRecordId = parentRecordId;
        console.log(`✅ Parent record created: ${parentRecordId}`);

        // STEP 3: Update Parent User to link back to Parent record (bidirectional link)
        console.log('Linking Parent User to Parent record...');
        await usersTbl.updateRecordAsync(parentUserId, {
            [CONFIG.USER_FIELDS.LINK_TO_PARENT_RECORD]: [{id: parentRecordId}]
        });
        console.log(`✅ Parent User linked to Parent record`);

        // STEP 4: Create Student User record
        console.log('Creating Student User record...');
        let studentUserId = await usersTbl.createRecordAsync({
            [CONFIG.USER_FIELDS.FIRST_NAME]: studentFirstName,
            [CONFIG.USER_FIELDS.LAST_NAME]: studentLastName,
            [CONFIG.USER_FIELDS.EMAIL]: studentEmail,
            [CONFIG.USER_FIELDS.PHONE]: studentPhone,
            [CONFIG.USER_FIELDS.ROLE]: {name: CONFIG.ROLES.STUDENT_DEPENDENT},
            [CONFIG.USER_FIELDS.STATUS]: {name: CONFIG.STATUS.ACTIVE}
        });

        createdRecords.studentUserId = studentUserId;
        console.log(`✅ Student User created: ${studentUserId}`);

        // STEP 5: Create Student record and link to both User and Parent
        console.log('Creating Student record...');
        let studentsTbl = base.getTable(CONFIG.TABLES.STUDENTS);

        let gradeYear = getSingleSelectName(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.GRADE_YEAR));
        let preferredModes = getMultipleSelectArray(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.PREFERRED_MODES));

        // Build student record fields
        let studentRecordFields = {
            [CONFIG.STUDENT_FIELDS.USER_ID]: [{id: studentUserId}],
            [CONFIG.STUDENT_FIELDS.PARENTS]: [{id: parentRecordId}],
            [CONFIG.STUDENT_FIELDS.LEARNING_PREFERENCES]: safeString(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.LEARNING_PREFERENCES)),
            [CONFIG.STUDENT_FIELDS.ACADEMIC_GOALS]: safeString(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.ACADEMIC_GOALS)),
            [CONFIG.STUDENT_FIELDS.SPECIAL_ACCOMMODATIONS]: safeString(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.SPECIAL_ACCOMMODATIONS)),
            [CONFIG.STUDENT_FIELDS.PREFERRED_DAYS_TIMES]: safeString(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.PREFERRED_DAYS_TIMES)),
            [CONFIG.STUDENT_FIELDS.PREFERRED_FREQUENCY]: safeString(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.PREFERRED_FREQUENCY))
        };

        if (gradeYear) {
            studentRecordFields[CONFIG.STUDENT_FIELDS.GRADE_YEAR] = {name: gradeYear};
        }

        if (preferredModes.length > 0) {
            studentRecordFields[CONFIG.STUDENT_FIELDS.PREFERRED_MODES] = preferredModes;
        }

        let studentRecordId = await studentsTbl.createRecordAsync(studentRecordFields);

        createdRecords.studentRecordId = studentRecordId;
        console.log(`✅ Student record created: ${studentRecordId}`);

        // STEP 6: Update Student User to link back to Student record (bidirectional link)
        console.log('Linking Student User to Student record...');
        await usersTbl.updateRecordAsync(studentUserId, {
            [CONFIG.USER_FIELDS.LINK_TO_STUDENT_RECORD]: [{id: studentRecordId}]
        });
        console.log(`✅ Student User linked to Student record`);

        // STEP 7: All records created and linked - Now trigger Xero webhook (no polling)
        console.log('All records created and linked. Triggering Xero contact creation...');
        await triggerXeroWebhook(parentUserId);

        return {
            success: true,
            parentUserId,
            parentRecordId,
            studentUserId,
            studentRecordId,
            userIdForXero: parentUserId // Store the user ID that needs Xero Contact ID
        };

    } catch (error) {
        console.error('Error in convertParentLead:', error);
        await rollbackRecords(createdRecords);
        throw error;
    }
}


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

        // STEP 1: Create Student User record
        let usersTbl = base.getTable(CONFIG.TABLES.USERS);
        let studentUserId = await usersTbl.createRecordAsync({
            [CONFIG.USER_FIELDS.FIRST_NAME]: studentFirstName,
            [CONFIG.USER_FIELDS.LAST_NAME]: studentLastName,
            [CONFIG.USER_FIELDS.EMAIL]: studentEmail,
            [CONFIG.USER_FIELDS.PHONE]: studentPhone,
            [CONFIG.USER_FIELDS.ROLE]: {name: CONFIG.ROLES.STUDENT_INDEPENDENT},
            [CONFIG.USER_FIELDS.STATUS]: {name: CONFIG.STATUS.ACTIVE}
        });

        createdRecords.studentUserId = studentUserId;
        console.log(`✅ Student User created: ${studentUserId}`);

        // STEP 2: Create Student record and link to User
        console.log('Creating Student record...');
        let studentsTbl = base.getTable(CONFIG.TABLES.STUDENTS);

        let gradeYear = getSingleSelectName(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.GRADE_YEAR));
        let preferredModes = getMultipleSelectArray(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.PREFERRED_MODES));

        // Build student record fields
        let studentRecordFields = {
            [CONFIG.STUDENT_FIELDS.USER_ID]: [{id: studentUserId}],
            [CONFIG.STUDENT_FIELDS.LEARNING_PREFERENCES]: safeString(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.LEARNING_PREFERENCES)),
            [CONFIG.STUDENT_FIELDS.ACADEMIC_GOALS]: safeString(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.ACADEMIC_GOALS)),
            [CONFIG.STUDENT_FIELDS.SPECIAL_ACCOMMODATIONS]: safeString(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.SPECIAL_ACCOMMODATIONS)),
            [CONFIG.STUDENT_FIELDS.PREFERRED_DAYS_TIMES]: safeString(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.PREFERRED_DAYS_TIMES)),
            [CONFIG.STUDENT_FIELDS.PREFERRED_FREQUENCY]: safeString(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.PREFERRED_FREQUENCY))
        };

        if (gradeYear) {
            studentRecordFields[CONFIG.STUDENT_FIELDS.GRADE_YEAR] = {name: gradeYear};
        }

        if (preferredModes.length > 0) {
            studentRecordFields[CONFIG.STUDENT_FIELDS.PREFERRED_MODES] = preferredModes;
        }

        let studentRecordId = await studentsTbl.createRecordAsync(studentRecordFields);

        createdRecords.studentRecordId = studentRecordId;
        console.log(`✅ Student record created: ${studentRecordId}`);

        // STEP 3: Update Student User to link back to Student record (bidirectional link)
        console.log('Linking Student User to Student record...');
        await usersTbl.updateRecordAsync(studentUserId, {
            [CONFIG.USER_FIELDS.LINK_TO_STUDENT_RECORD]: [{id: studentRecordId}]
        });
        console.log(`✅ Student User linked to Student record`);

        // STEP 4: Trigger Xero webhook (no polling)
        console.log('Triggering Xero contact creation...');
        await triggerXeroWebhook(studentUserId);

        return {
            success: true,
            studentUserId,
            studentRecordId,
            userIdForXero: studentUserId // Store the user ID that needs Xero Contact ID
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
    // Get input config ONCE at the beginning
    let inputConfig = input.config();
    console.log('Input config received:', JSON.stringify(inputConfig));

    let leadId = inputConfig.leadRecordId || inputConfig['leadRecordId'] ||
                 inputConfig['Lead ID'] || inputConfig.leadId ||
                 inputConfig.recordId || inputConfig['Record ID'];

    if (!leadId) {
        console.error('❌ Lead ID not provided in input config');
        console.error('Available input fields:', Object.keys(inputConfig));
        throw new Error('Lead ID not provided. Please configure the automation to pass the record ID.');
    }

    try {
        console.log('='.repeat(60));
        console.log('LEAD CONVERSION ACTION SCRIPT STARTED');
        console.log('='.repeat(60));

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

        // Check if "Convert to Client" checkbox is checked (if field exists)
        try {
            let convertToClient = leadRecord.getCellValue(CONFIG.LEAD_FIELDS.CONVERT_TO_CLIENT);

            if (!convertToClient) {
                console.log('⚠️ "Convert to Client" checkbox is not checked. Aborting conversion.');
                return;
            }

            console.log('✅ "Convert to Client" checkbox is checked. Proceeding...\n');
        } catch (fieldError) {
            console.log('⚠️ "Convert to Client" field not found - assuming automation handles this condition');
        }

        // Check if already converted
        let leadStatus = getSingleSelectName(leadRecord.getCellValue(CONFIG.LEAD_FIELDS.LEAD_STATUS));

        if (leadStatus === CONFIG.LEAD_STATUS.CONVERTED) {
            console.log('⚠️ Lead is already converted. Aborting to prevent duplicate records.');

            try {
                await leadsTbl.updateRecordAsync(leadId, {
                    [CONFIG.LEAD_FIELDS.CONVERT_TO_CLIENT]: false
                });
                console.log('✅ "Convert to Client" checkbox unchecked');
            } catch (uncheckError) {
                console.log('⚠️ Could not uncheck "Convert to Client" checkbox');
            }

            return;
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

        try {
            leadUpdateFields[CONFIG.LEAD_FIELDS.CONVERT_TO_CLIENT] = false;
        } catch (e) {
            // Field may not exist
        }

        // Add links to created records
        if (leadType === CONFIG.LEAD_TYPES.PARENT && result.parentRecordId) {
            leadUpdateFields[CONFIG.LEAD_FIELDS.LINK_TO_PARENTS] = [{id: result.parentRecordId}];
            // Link the Parent User (primary contact)
            leadUpdateFields[CONFIG.LEAD_FIELDS.LINK_TO_USERS] = [{id: result.parentUserId}];
        }

        if (result.studentRecordId) {
            leadUpdateFields[CONFIG.LEAD_FIELDS.LINK_TO_STUDENTS] = [{id: result.studentRecordId}];
        }

        // For independent student leads, link the Student User
        if (leadType === CONFIG.LEAD_TYPES.STUDENT && result.studentUserId) {
            leadUpdateFields[CONFIG.LEAD_FIELDS.LINK_TO_USERS] = [{id: result.studentUserId}];
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
            .replace('{userId}', result.userIdForXero)
            .replace('{convertedAt}', formatDateTime(new Date()));

        let notificationId = await createAdminNotification(
            notificationTitle,
            notificationDetails,
            'Regular',
            'Leads',
            'Pending'  // Status is "Pending" until Xero ID is added
        );

        console.log('\n' + '='.repeat(60));
        console.log('✅ LEAD CONVERSION ACTION COMPLETE');
        console.log('NOTE: Xero Contact ID will be added by the polling script');
        console.log('='.repeat(60));
        console.log(`\nOUTPUT FOR NEXT SCRIPT:`);
        console.log(`- User ID for Xero: ${result.userIdForXero}`);
        console.log(`- Admin Notification ID: ${notificationId}`);
        console.log('='.repeat(60) + '\n');

        // Output for next automation step
        output.set('userIdForXero', result.userIdForXero);
        output.set('notificationId', notificationId);

    } catch (error) {
        console.error('\n' + '='.repeat(60));
        console.error('❌ LEAD CONVERSION ACTION FAILED');
        console.error('='.repeat(60));
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        console.error('='.repeat(60) + '\n');

        // Try to uncheck the "Convert to Client" checkbox on error
        try {
            let leadsTbl = base.getTable(CONFIG.TABLES.LEADS);
            await leadsTbl.updateRecordAsync(leadId, {
                [CONFIG.LEAD_FIELDS.CONVERT_TO_CLIENT]: false
            });
            console.log('✅ "Convert to Client" checkbox unchecked after error');
        } catch (uncheckError) {
            console.error('⚠️ Failed to uncheck checkbox:', uncheckError.message);
        }

        // Create error notification
        try {
            let leadName = 'Unknown';
            let leadType = 'Unknown';

            try {
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
            } catch (detailError) {
                // Ignore
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
