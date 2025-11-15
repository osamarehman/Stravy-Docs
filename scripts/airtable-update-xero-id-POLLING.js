// ============================================================================
// AIRTABLE SCRIPT: Update Admin Notification with Xero Contact ID - POLLING SCRIPT (v2.0)
// ============================================================================
// Trigger: Run after ACTION script completes
// Purpose: Poll for Xero Contact ID and update Admin Notification
//
// NOTE: This is PART 2 of a 2-script system:
//   - ACTION SCRIPT: Creates records, triggers webhook, creates notification
//   - POLLING SCRIPT (this file): Retrieves Xero ID and updates notification
//
// WORKFLOW:
//   1. Receive User ID and Notification ID from ACTION script
//   2. Poll Users table for Xero Contact ID (10 attempts × 10s = 100s total)
//   3. Update Admin Notification with Xero Contact ID
//   4. Change notification status from "Pending" to "Completed"
//
// IMPORTANT NOTES:
// - Polls with 10 second delays to avoid 30 query limit
// - Updates notification title to remove "Pending Xero ID" message
// - Changes notification status to "Completed" when Xero ID is found
//
// SETUP INSTRUCTIONS:
// 1. In Airtable Automations, add this as a second action AFTER the ACTION script
// 2. Action: "Run a script"
//    - Paste this script
//    - In "Configure input variables":
//      - Variable name: userIdForXero
//      - Value: Select output from ACTION script → userIdForXero
//      - Variable name: notificationId
//      - Value: Select output from ACTION script → notificationId
// ============================================================================


// ============================================================================
// CONFIGURATION
// ============================================================================


const CONFIG = {
    // Table Names
    TABLES: {
        USERS: 'Users',
        ADMIN_NOTIFICATIONS: 'Admin Notifications'
    },

    // Users table field names
    USER_FIELDS: {
        XERO_CONTACT_ID: 'Xero Contact ID'
    },

    // Polling configuration
    POLLING_CONFIG: {
        MAX_ATTEMPTS: 10,              // Number of polling attempts
        DELAY_ITERATIONS: 1000000      // Busy-wait iterations (~10 seconds)
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
 * Poll for Xero Contact ID in Users table
 */
async function pollForXeroContactId(userId) {
    console.log(`Polling for Xero Contact ID for User: ${userId}`);
    console.log(`Max attempts: ${CONFIG.POLLING_CONFIG.MAX_ATTEMPTS}`);

    let usersTbl = base.getTable(CONFIG.TABLES.USERS);

    for (let attempt = 1; attempt <= CONFIG.POLLING_CONFIG.MAX_ATTEMPTS; attempt++) {
        console.log(`Poll attempt ${attempt}/${CONFIG.POLLING_CONFIG.MAX_ATTEMPTS}...`);

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
                console.log(`Xero Contact ID not yet populated (poll ${attempt}/${CONFIG.POLLING_CONFIG.MAX_ATTEMPTS})`);

                // Wait 10 seconds before next poll attempt (except on last attempt)
                if (attempt < CONFIG.POLLING_CONFIG.MAX_ATTEMPTS) {
                    console.log('Waiting 10 seconds before next poll...');
                    busyWait(CONFIG.POLLING_CONFIG.DELAY_ITERATIONS);
                }
            }
        } else {
            throw new Error(`User record ${userId} not found`);
        }
    }

    // If we've exhausted all polling attempts
    throw new Error(`Failed to get Xero Contact ID after ${CONFIG.POLLING_CONFIG.MAX_ATTEMPTS} polling attempts (${CONFIG.POLLING_CONFIG.MAX_ATTEMPTS * 10} seconds total)`);
}


/**
 * Update admin notification with Xero Contact ID
 */
async function updateAdminNotification(notificationId, xeroContactId) {
    console.log(`Updating Admin Notification: ${notificationId}`);
    console.log(`With Xero Contact ID: ${xeroContactId}`);

    try {
        let notificationsTbl = base.getTable(CONFIG.TABLES.ADMIN_NOTIFICATIONS);

        // First, get the current notification to update the details
        let notificationQuery = await notificationsTbl.selectRecordsAsync({
            fields: ['Title', 'Details']
        });

        let notificationRecord = notificationQuery.getRecord(notificationId);

        if (!notificationRecord) {
            throw new Error(`Admin Notification ${notificationId} not found`);
        }

        let currentTitle = notificationRecord.getCellValue('Title') || '';
        let currentDetails = notificationRecord.getCellValue('Details') || '';

        // Update title - remove "Pending Xero ID" message
        let newTitle = currentTitle.replace('Pending Xero ID - ', '');
        newTitle = newTitle.replace('✅ Lead Converted', `✅ Lead Converted - Xero ID: ${xeroContactId}`);

        // Update details - add Xero Contact ID
        let newDetails = currentDetails.replace(
            'NOTE: The Xero Contact ID will be retrieved and added to this notification by the polling script.',
            `Xero Contact ID: ${xeroContactId}\n\nXero Contact ID retrieved and added successfully.`
        );

        // Update the notification
        await notificationsTbl.updateRecordAsync(notificationId, {
            'Title': newTitle,
            'Details': newDetails,
            'Action Status': {name: 'Completed'}  // Change status from Pending to Completed
        });

        console.log('✅ Admin notification updated successfully');

        return {success: true};

    } catch (error) {
        console.error('Failed to update admin notification:', error);
        throw error;
    }
}


// ============================================================================
// MAIN SCRIPT EXECUTION
// ============================================================================


(async function main() {
    // Get input config ONCE at the beginning
    let inputConfig = input.config();
    console.log('Input config received:', JSON.stringify(inputConfig));

    // Get userIdForXero and notificationId from input
    let userIdForXero = inputConfig.userIdForXero || inputConfig['userIdForXero'];
    let notificationId = inputConfig.notificationId || inputConfig['notificationId'];

    if (!userIdForXero) {
        console.error('❌ User ID for Xero not provided in input config');
        console.error('Available input fields:', Object.keys(inputConfig));
        throw new Error('User ID for Xero not provided. Please configure the automation to pass userIdForXero from the ACTION script.');
    }

    if (!notificationId) {
        console.error('❌ Notification ID not provided in input config');
        console.error('Available input fields:', Object.keys(inputConfig));
        throw new Error('Notification ID not provided. Please configure the automation to pass notificationId from the ACTION script.');
    }

    try {
        console.log('='.repeat(60));
        console.log('XERO CONTACT ID POLLING SCRIPT STARTED');
        console.log('='.repeat(60));
        console.log(`User ID for Xero: ${userIdForXero}`);
        console.log(`Notification ID: ${notificationId}`);
        console.log('='.repeat(60) + '\n');

        // Poll for Xero Contact ID
        let result = await pollForXeroContactId(userIdForXero);

        if (result.success) {
            // Update admin notification with Xero Contact ID
            await updateAdminNotification(notificationId, result.xeroContactId);

            console.log('\n' + '='.repeat(60));
            console.log('✅ XERO CONTACT ID POLLING COMPLETE');
            console.log(`Xero Contact ID: ${result.xeroContactId}`);
            console.log('Admin Notification updated successfully');
            console.log('='.repeat(60) + '\n');
        }

    } catch (error) {
        console.error('\n' + '='.repeat(60));
        console.error('❌ XERO CONTACT ID POLLING FAILED');
        console.error('='.repeat(60));
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        console.error('='.repeat(60) + '\n');

        // Try to update notification with error
        try {
            let notificationsTbl = base.getTable(CONFIG.TABLES.ADMIN_NOTIFICATIONS);

            // Get current notification details
            let notificationQuery = await notificationsTbl.selectRecordsAsync({
                fields: ['Details']
            });

            let notificationRecord = notificationQuery.getRecord(notificationId);

            if (notificationRecord) {
                let currentDetails = notificationRecord.getCellValue('Details') || '';

                let errorMessage = `\n\n⚠️ POLLING ERROR:\n${error.message}\n\nThe Xero Contact ID may need to be added manually. Please check the n8n webhook logs and the Users table for User ID: ${userIdForXero}`;

                await notificationsTbl.updateRecordAsync(notificationId, {
                    'Details': currentDetails + errorMessage,
                    'Action Status': {name: 'Pending'},
                    'Priority': {name: 'Urgent'}  // Escalate priority
                });

                console.log('✅ Admin notification updated with error details');
            }
        } catch (updateError) {
            console.error('❌ Failed to update notification with error:', updateError.message);
        }

        throw error;
    }
})();
