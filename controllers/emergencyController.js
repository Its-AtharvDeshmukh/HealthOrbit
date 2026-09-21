const User = require('../models/User');
const EmergencyAlert = require('../models/EmergencyAlert');
const EmergencyRequest = require('../models/EmergencyRequest');

const getEmergencyWorkspace = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        const user = await User.findById(activeUserId).lean();
        const activeAlert = await EmergencyAlert.findOne({ userId: activeUserId, status: 'active' }).sort({ createdAt: -1 });
        
        const communityRequests = await EmergencyRequest.find({ 
            status: 'active', 
            expiresAt: { $gt: new Date() } 
        }).populate('userId', 'fullName phone donorProfile').sort({ createdAt: -1 }).limit(20).lean();

        res.render('dashboard/emergency.ejs', { 
            userName: req.session.userName || user.fullName,
            userEmail: req.session.userEmail || user.email,
            user,
            activeAlert,
            communityRequests,
            csrfToken: req.session.csrfToken,
            successMsg: req.query.success,
            errorMsg: req.query.error
        });
    } catch (error) {
        console.error('[HealthOrbit] Emergency Load Error:', error);
        res.redirect('/dashboard');
    }
};

const triggerSos = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        const { latitude, longitude, accuracy } = req.body;
        const user = await User.findById(activeUserId);

        const recentAlert = await EmergencyAlert.findOne({ 
            userId: activeUserId, 
            status: 'active',
            createdAt: { $gt: new Date(Date.now() - 2 * 60 * 1000) }
        });

        if (!recentAlert) {
            await EmergencyAlert.create({
                userId: activeUserId,
                latitude: latitude || null,
                longitude: longitude || null,
                accuracy: accuracy || null,
                locationCapturedAt: latitude ? new Date() : null,
                emergencyContactName: user.emergencyContactName || 'None',
                emergencyContactPhone: user.emergencyContactPhone || '',
                bloodGroup: user.bloodGroup || 'Unknown'
            });
        }
        res.json({ success: true, message: "Emergency alert saved in HealthOrbit." });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create SOS alert' });
    }
};

const resolveSos = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        await EmergencyAlert.updateMany({ userId: activeUserId, status: 'active' }, { status: 'resolved' });
        res.redirect('/emergency?success=Emergency+alert+resolved');
    } catch (error) {
        res.redirect('/emergency?error=Failed+to+resolve+alert');
    }
};

const updateDonorProfile = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        const { bloodDonorEnabled, organDonorPreference, contactSharingEnabled } = req.body;
        
        await User.findByIdAndUpdate(activeUserId, {
            donorProfile: {
                bloodDonorEnabled: bloodDonorEnabled === 'on',
                organDonorPreference: organDonorPreference,
                contactSharingEnabled: contactSharingEnabled === 'on'
            }
        });
        res.redirect('/emergency?success=Donor+profile+updated');
    } catch (error) {
        res.redirect('/emergency?error=Failed+to+update+donor+profile');
    }
};

const createCommunityRequest = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        const { requestType, title, description, bloodGroup, hospitalName, urgency } = req.body;

        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 48);

        await EmergencyRequest.create({
            userId: activeUserId,
            requestType,
            title: title.trim().substring(0, 100),
            description: description.trim().substring(0, 500),
            bloodGroup: requestType === 'Blood' ? bloodGroup : null,
            hospitalName: hospitalName.trim(),
            urgency,
            expiresAt
        });

        res.redirect('/emergency?success=Community+request+broadcasted');
    } catch (error) {
        res.redirect('/emergency?error=Failed+to+broadcast+request');
    }
};

const deleteCommunityRequest = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        await EmergencyRequest.findOneAndDelete({ _id: req.params.id, userId: activeUserId });
        res.redirect('/emergency?success=Request+removed');
    } catch (error) {
        res.redirect('/emergency?error=Failed+to+remove+request');
    }
};

module.exports = {
    getEmergencyWorkspace,
    triggerSos,
    resolveSos,
    updateDonorProfile,
    createCommunityRequest,
    deleteCommunityRequest
};