const User = require('../models/User');
const EmergencyRequest = require('../models/EmergencyRequest');

const getEmergencyCard = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session?.userId || (req.user && req.user._id);
        if (!activeUserId) return res.redirect('/auth');
        
        const user = await User.findById(activeUserId).lean();

        // Fetch active community broadcasts
        const communityRequests = await EmergencyRequest.find({ status: 'active' })
            .populate('userId', 'fullName phone donorProfile')
            .sort({ createdAt: -1 })
            .limit(20)
            .lean();

        res.render('dashboard/emergency', {
            user: user || {},
            emergencyContact: user?.emergencyContact || {},
            communityRequests: communityRequests || [],
            activeAlert: user?.activeSOS || false,
            isPublicView: false,
            successMsg: req.query.success || null,
            errorMsg: req.query.error || null,
            csrfToken: req.csrfToken ? req.csrfToken() : ''
        });
    } catch (err) {
        console.error('[HealthOrbit] Emergency view error:', err.message);
        res.redirect('/dashboard');
    }
};

const broadcastRequest = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session?.userId || (req.user && req.user._id);
        if (!activeUserId) return res.redirect('/auth');

        const { requestType, title, description, bloodGroup, hospitalName, location, donorIdentity, urgency } = req.body;
        const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

        await EmergencyRequest.create({
            userId: activeUserId,
            requestType,
            title,
            description,
            bloodGroup,
            hospitalName,
            location,
            donorIdentity,
            urgency,
            expiresAt
        });

        res.redirect('/emergency?success=Request+Broadcasted+Successfully');
    } catch (err) {
        console.error('[HealthOrbit] Broadcast error:', err.message);
        res.redirect('/emergency?error=Failed+to+Broadcast+Request');
    }
};

const deleteBroadcast = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session?.userId || (req.user && req.user._id);
        await EmergencyRequest.findOneAndDelete({ _id: req.params.id, userId: activeUserId });
        res.redirect('/emergency?success=Request+Removed');
    } catch (err) {
        res.redirect('/emergency?error=Failed+to+Remove+Request');
    }
};

const saveDonorProfile = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session?.userId || (req.user && req.user._id);
        const { bloodDonorEnabled, contactSharingEnabled, organDonorPreference } = req.body;
        
        await User.findByIdAndUpdate(activeUserId, {
            'donorProfile.bloodDonorEnabled': bloodDonorEnabled === 'on',
            'donorProfile.contactSharingEnabled': contactSharingEnabled === 'on',
            'donorProfile.organDonorPreference': organDonorPreference
        });
        res.redirect('/emergency?success=Donor+Preferences+Saved');
    } catch (err) {
        res.redirect('/emergency?error=Failed+to+Save+Preferences');
    }
};

const triggerSOS = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session?.userId || (req.user && req.user._id);
        await User.findByIdAndUpdate(activeUserId, { activeSOS: true });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

const resolveSOS = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session?.userId || (req.user && req.user._id);
        await User.findByIdAndUpdate(activeUserId, { activeSOS: false });
        res.redirect('/emergency?success=SOS+Resolved');
    } catch (err) {
        res.redirect('/emergency?error=Failed+to+Resolve+SOS');
    }
};

const getSharedEmergencyCard = async (req, res) => {
    try {
        const { shareToken } = req.params;
        const user = await User.findOne({ 'emergencyCard.shareToken': shareToken }).lean();
        if (!user) return res.status(404).send('Emergency card not found or disabled.');

        res.render('dashboard/emergency', {
            user,
            emergencyContact: user.emergencyContact || {},
            isPublicView: true
        });
    } catch (err) {
        res.status(500).send('Error loading emergency card');
    }
};

const toggleEmergencyAccess = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session?.userId || (req.user && req.user._id);
        const { enabled } = req.body;

        await User.findByIdAndUpdate(activeUserId, {
            'emergencyCard.enabled': enabled === 'true' || enabled === true || enabled === 'on'
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

module.exports = {
    getEmergencyCard,
    broadcastRequest,
    deleteBroadcast,
    saveDonorProfile,
    triggerSOS,
    resolveSOS,
    getSharedEmergencyCard,
    toggleEmergencyAccess
};