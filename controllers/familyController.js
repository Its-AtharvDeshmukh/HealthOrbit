const User = require('../models/User');
const FamilyMember = require('../models/FamilyMember');
const MedicalReport = require('../models/MedicalReport');
const HealthMeasurement = require('../models/HealthMeasurement');
const Medicine = require('../models/Medicine');
const SymptomEntry = require('../models/SymptomEntry');
const InsurancePolicy = require('../models/InsurancePolicy');

/**
 * 1. Fetch Authorized Family Member Health Data
 * Direction: targetUserId is the data OWNER, activeUserId is the authorized VIEWER.
 */
const getFamilyMemberHealth = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || (req.user && req.user._id);
        const targetUserId = req.params.targetId;

        if (!activeUserId) {
            return res.status(401).json({ error: 'Unauthorized: No active session found.' });
        }

        if (!targetUserId) {
            return res.status(400).json({ error: 'Target user ID is required.' });
        }

        // Enforce active, explicit relationship authorization
        const access = await FamilyMember.findOne({
            ownerUserId: targetUserId,
            viewerUserId: activeUserId,
            status: 'active'
        });

        if (!access) {
            return res.status(403).json({ error: 'Access Denied: You are not authorized to view this health profile.' });
        }

        const healthData = {};
        const perms = access.permissions || {};

        // Conditionally query ONLY permitted datasets
        if (perms.healthSummary) {
            healthData.summary = await User.findById(targetUserId)
                .select('fullName bloodGroup allergies medicalConditions gender age')
                .lean();
        }

        if (perms.emergencyInfo) {
            healthData.emergency = await User.findById(targetUserId)
                .select('emergencyContact fullName')
                .lean();
        }

        if (perms.medicalReports) {
            healthData.medicalReports = await MedicalReport.find({ userId: targetUserId })
                .select('_id originalFileName createdAt status extractedData aiExplanation')
                .sort({ createdAt: -1 })
                .lean();
        }

        if (perms.medicines) {
            healthData.medicines = await Medicine.find({ userId: targetUserId, active: true })
                .sort({ createdAt: -1 })
                .lean();
        }

        if (perms.symptoms) {
            healthData.symptoms = await SymptomEntry.find({ userId: targetUserId })
                .sort({ recordedAt: -1 })
                .limit(50)
                .lean();
        }

        if (perms.wearableData || perms.healthTimeline) {
            healthData.measurements = await HealthMeasurement.find({ userId: targetUserId })
                .sort({ recordedAt: -1 })
                .limit(100)
                .lean();
        }

        if (perms.insurance) {
            healthData.insurance = await InsurancePolicy.find({ userId: targetUserId })
                .sort({ createdAt: -1 })
                .lean();
        }

        return res.status(200).json({ 
            relationship: access.relationship,
            permissions: perms, 
            data: healthData 
        });
    } catch (error) {
        console.error('[HealthOrbit] Family Health Access Error:', error.message);
        return res.status(500).json({ error: 'Server error retrieving family health data.' });
    }
};

/**
 * 2. Send a Family Access Invitation
 * Active user (owner) invites an existing user (viewer) by verified email.
 */
/**
 * Send a Family Access Invitation
 */
const inviteFamilyMember = async (req, res) => {
    // Helper to send either redirect or JSON depending on request type
    const sendResponse = (statusCode, success, message) => {
        if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.status(statusCode).json(success ? { success: true, message } : { error: message });
        }
        const param = success ? `success=${encodeURIComponent(message)}` : `error=${encodeURIComponent(message)}`;
        return res.redirect(`/profile?${param}`);
    };

    try {
        const activeUserId = req.userContextId || req.session.userId || (req.user && req.user._id);
        const email = req.body.email || req.body.contact;
        const relationship = req.body.relationship;

        if (!activeUserId) {
            return sendResponse(401, false, 'Please log in to send invitations.');
        }

        if (!email || !relationship) {
            return sendResponse(400, false, 'Registered user email and relationship are required.');
        }

        const normalizedEmail = email.toLowerCase().trim();
        const targetUser = await User.findOne({ email: normalizedEmail });

        if (!targetUser) {
            return sendResponse(404, false, 'No HealthOrbit account found with that email address.');
        }

        if (targetUser._id.toString() === activeUserId.toString()) {
            return sendResponse(400, false, 'You cannot invite yourself as a family member.');
        }

        // Check for existing pending or active relationship
        const existing = await FamilyMember.findOne({
            ownerUserId: activeUserId,
            viewerUserId: targetUser._id,
            status: { $in: ['pending', 'active'] }
        });

        if (existing) {
            return sendResponse(
                400, 
                false, 
                existing.status === 'active' 
                    ? 'This user is already an active family member.' 
                    : 'A pending invitation has already been sent to this user.'
            );
        }

        // Parse initial permissions if selected in the modal
        const initialPerms = {
            emergencyInfo: false,
            medicalReports: false,
            healthSummary: false,
            medicines: false,
            symptoms: false,
            insurance: false,
            wearableData: false,
            healthTimeline: false
        };

        if (req.body.permissions) {
            if (typeof req.body.permissions === 'object' && !Array.isArray(req.body.permissions)) {
                Object.keys(req.body.permissions).forEach(k => {
                    if (initialPerms.hasOwnProperty(k)) initialPerms[k] = true;
                });
            } else if (Array.isArray(req.body.permissions)) {
                req.body.permissions.forEach(k => {
                    if (initialPerms.hasOwnProperty(k)) initialPerms[k] = true;
                });
            }
        }

        await FamilyMember.create({
            ownerUserId: activeUserId,
            viewerUserId: targetUser._id,
            relationship: relationship.trim(),
            permissions: initialPerms,
            status: 'pending'
        });

        return sendResponse(200, true, 'Family invitation sent successfully.');
    } catch (error) {
        console.error('[HealthOrbit] Invite Error:', error.message);
        return sendResponse(500, false, 'Internal server error processing family invitation.');
    }
};

/**
 * 3. Respond to an Invitation (Accept or Reject)
 * Active user must be the VIEWER (recipient) of the invite.
 */

const respondToInvitation = async (req, res) => {
    const isJson = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));

    try {
        const activeUserId = req.userContextId || req.session.userId || (req.user && req.user._id);
        const { invitationId, action } = req.body;

        if (!activeUserId) {
            return isJson ? res.status(401).json({ error: 'Unauthorized.' }) : res.redirect('/auth');
        }

        const invitation = await FamilyMember.findOne({
            _id: invitationId,
            viewerUserId: activeUserId,
            status: 'pending'
        });

        if (!invitation) {
            const err = 'Invitation not found or already processed.';
            return isJson ? res.status(404).json({ error: err }) : res.redirect(`/profile?error=${encodeURIComponent(err)}`);
        }

        if (action === 'accept') {
            invitation.status = 'active';
            invitation.acceptedAt = new Date();
        } else {
            invitation.status = 'rejected';
        }

        await invitation.save();
        const msg = action === 'accept' ? 'Invitation accepted.' : 'Invitation declined.';
        return isJson ? res.status(200).json({ success: true, status: invitation.status }) : res.redirect(`/profile?success=${encodeURIComponent(msg)}`);
    } catch (error) {
        console.error('[HealthOrbit] Respond Error:', error.message);
        const err = 'Failed to process invitation.';
        return isJson ? res.status(500).json({ error: err }) : res.redirect(`/profile?error=${encodeURIComponent(err)}`);
    }
};

/**
 * 4. Update Permissions for an Authorized Family Member
 * Active user must be the OWNER of the data.
 */
/**
 * Update Permissions for an Authorized Family Member
 * Supports both standard HTML form POSTs (with redirects) and asynchronous JSON fetch requests.
 */
const updatePermissions = async (req, res) => {
    const isJson = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));

    const sendResponse = (statusCode, success, message, data = null) => {
        if (isJson) {
            return res.status(statusCode).json(success ? { success: true, message, permissions: data } : { error: message });
        }
        const queryParam = success ? `success=${encodeURIComponent(message)}` : `error=${encodeURIComponent(message)}`;
        return res.redirect(`/profile?${queryParam}`);
    };

    try {
        const activeUserId = req.userContextId || req.session.userId || (req.user && req.user._id);
        const memberId = req.params.id || req.body.memberId;

        if (!activeUserId) {
            return sendResponse(401, false, 'Unauthorized: Please log in.');
        }

        if (!memberId) {
            return sendResponse(400, false, 'Invalid relationship ID.');
        }

        // Find the relationship. Either the active user is the owner, or they are managing their directional connection.
        // We also allow updating if status is 'active' or 'pending'.
        const relationship = await FamilyMember.findOne({
            _id: memberId,
            $or: [
                { ownerUserId: activeUserId },
                { viewerUserId: activeUserId }
            ]
        });

        if (!relationship) {
            return sendResponse(403, false, 'Unauthorized or family relationship not found.');
        }

        const allowedKeys = [
            'emergencyInfo',
            'medicalReports',
            'healthSummary',
            'medicines',
            'symptoms',
            'insurance',
            'wearableData',
            'healthTimeline'
        ];

        // Standard HTML forms submit checked checkboxes as "on" or "true", and omit unchecked checkboxes.
        // If the request comes from an HTML form, we evaluate all allowed keys: present = true, absent = false.
        const submitted = req.body.permissions || req.body;

        allowedKeys.forEach(key => {
            if (typeof submitted === 'object' && submitted !== null) {
                // If it's an explicit boolean from JSON
                if (typeof submitted[key] === 'boolean') {
                    relationship.permissions[key] = submitted[key];
                } 
                // If it's from a form POST ('on', 'true', etc.)
                else if (submitted[key] === 'on' || submitted[key] === 'true' || submitted[key] === '1') {
                    relationship.permissions[key] = true;
                } 
                // If unchecked in a standard form submission
                else if (!isJson) {
                    relationship.permissions[key] = false;
                }
            }
        });

        // Mark modified for nested Mongoose subdocument
        relationship.markModified('permissions');
        await relationship.save();

        return sendResponse(200, true, 'Access permissions updated successfully.', relationship.permissions);
    } catch (error) {
        console.error('[HealthOrbit] Update Permissions Error:', error.message);
        return sendResponse(500, false, 'Server error updating permissions.');
    }
};


/**
 * 5. Revoke Family Relationship
 * Either the data OWNER or the VIEWER can sever the relationship.
 */
const revokeAccess = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || (req.user && req.user._id);
        const relationshipId = req.params.id;

        if (!activeUserId) {
            return res.status(401).json({ error: 'Unauthorized.' });
        }

        const relationship = await FamilyMember.findOne({
            _id: relationshipId,
            $or: [{ ownerUserId: activeUserId }, { viewerUserId: activeUserId }],
            status: { $in: ['pending', 'active'] }
        });

        if (!relationship) {
            return res.status(404).json({ error: 'Active or pending relationship not found.' });
        }

        relationship.status = 'revoked';
        relationship.revokedAt = new Date();
        await relationship.save();

        return res.status(200).json({ success: true, message: 'Access revoked successfully.' });
    } catch (error) {
        console.error('[HealthOrbit] Revoke Access Error:', error.message);
        return res.status(500).json({ error: 'Failed to revoke family access.' });
    }
};

/**
 * 6. Fetch Overview Lists for Profile & Privacy Settings UI
 * Returns members who can view your data, and profiles you are authorized to view.
 */
const getFamilyOverview = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || (req.user && req.user._id);

        if (!activeUserId) {
            return res.status(401).json({ error: 'Unauthorized.' });
        }

        // People authorized to view my data
        const myDelegates = await FamilyMember.find({ ownerUserId: activeUserId })
            .populate('viewerUserId', 'fullName email profileImage')
            .sort({ createdAt: -1 })
            .lean();

        // People whose data I am authorized to view
        const accessibleProfiles = await FamilyMember.find({ 
            viewerUserId: activeUserId, 
            status: 'active' 
        })
            .populate('ownerUserId', 'fullName email profileImage bloodGroup')
            .sort({ createdAt: -1 })
            .lean();

        // Incoming pending requests awaiting my decision
        const incomingInvites = await FamilyMember.find({ 
            viewerUserId: activeUserId, 
            status: 'pending' 
        })
            .populate('ownerUserId', 'fullName email profileImage')
            .sort({ createdAt: -1 })
            .lean();

        return res.status(200).json({
            myDelegates,
            accessibleProfiles,
            incomingInvites
        });
    } catch (error) {
        console.error('[HealthOrbit] Family Overview Error:', error.message);
        return res.status(500).json({ error: 'Failed to load family overview data.' });
    }
};

module.exports = {
    getFamilyMemberHealth,
    inviteFamilyMember,
    respondToInvitation,
    updatePermissions,
    revokeAccess,
    getFamilyOverview
};