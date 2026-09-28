const User = require('../models/User');
const FamilyMember = require('../models/FamilyMember');
const bcrypt = require('bcryptjs');
const { uploadToCloudinary } = require('../services/cloudinaryService');

// 1. Render Profile & Privacy View
const getProfile = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || (req.user && req.user._id);

        if (!activeUserId) {
            return res.redirect('/auth');
        }

        const user = await User.findById(activeUserId).lean();
        if (!user) {
            return res.redirect('/auth');
        }

        // Fetch related family links
        const familyMembers = await FamilyMember.find({
            $or: [
                { ownerUserId: activeUserId },
                { viewerUserId: activeUserId, status: 'active' }
            ]
        })
            .populate('viewerUserId', 'fullName email profileImage')
            .populate('ownerUserId', 'fullName email profileImage')
            .sort({ createdAt: -1 })
            .lean()
            .catch(() => []);

        // Fetch incoming invitations
        const incomingInvitations = await FamilyMember.find({
            viewerUserId: activeUserId,
            status: 'pending'
        })
            .populate('ownerUserId', 'fullName email profileImage')
            .sort({ createdAt: -1 })
            .lean()
            .catch(() => []);

        res.render('dashboard/profile', {
            user,
            familyMembers: familyMembers || [],
            incomingInvitations: incomingInvitations || [],
            csrfToken: req.csrfToken ? req.csrfToken() : (res.locals.csrfToken || ''),
            successMsg: req.query.success || null,
            errorMsg: req.query.error || null
        });
    } catch (error) {
        console.error('[HealthOrbit] Profile Load Error:', error.message);
        res.redirect('/dashboard');
    }
};

// 2. Update Personal Details
const updatePersonal = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || (req.user && req.user._id);
        const { fullName, phone, age, gender, address } = req.body;

        await User.findByIdAndUpdate(activeUserId, {
            fullName,
            phone,
            age,
            gender,
            address
        });

        res.redirect('/profile?success=Personal+details+updated');
    } catch (error) {
        console.error('[HealthOrbit] Update Personal Error:', error.message);
        res.redirect('/profile?error=Failed+to+update+personal+details');
    }
};

// 3. Update Health / Clinical Information
const updateHealth = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || (req.user && req.user._id);
        const { bloodGroup, medicalConditions, allergies, currentMedicines } = req.body;

        const conditionsArr = typeof medicalConditions === 'string'
            ? medicalConditions.split(',').map(s => s.trim()).filter(Boolean)
            : [];
        const allergiesArr = typeof allergies === 'string'
            ? allergies.split(',').map(s => s.trim()).filter(Boolean)
            : [];
        const medicinesArr = typeof currentMedicines === 'string'
            ? currentMedicines.split(',').map(s => s.trim()).filter(Boolean)
            : [];

        await User.findByIdAndUpdate(activeUserId, {
            bloodGroup,
            medicalConditions: conditionsArr,
            allergies: allergiesArr,
            currentMedicines: medicinesArr
        });

        res.redirect('/profile?success=Health+profile+updated');
    } catch (error) {
        console.error('[HealthOrbit] Update Health Error:', error.message);
        res.redirect('/profile?error=Failed+to+update+health+profile');
    }
};

// 4. Update Emergency Contacts
const updateEmergency = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || (req.user && req.user._id);
        const { emergencyName, emergencyRelation, emergencyPhone } = req.body;

        await User.findByIdAndUpdate(activeUserId, {
            emergencyContact: {
                name: emergencyName,
                relationship: emergencyRelation,
                phone: emergencyPhone
            }
        });

        res.redirect('/profile?success=Emergency+contact+updated');
    } catch (error) {
        console.error('[HealthOrbit] Update Emergency Error:', error.message);
        res.redirect('/profile?error=Failed+to+update+emergency+contact');
    }
};

// 5. Update Privacy & AI Settings
const updatePrivacy = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || (req.user && req.user._id);
        const { profile, medicalReports, healthMeasurements, medicines, familyMetadata, emergencyCardEnabled } = req.body;

        await User.findByIdAndUpdate(activeUserId, {
            'privacySettings.emergencyCardEnabled': emergencyCardEnabled === 'on' || emergencyCardEnabled === true || emergencyCardEnabled === 'true',
            'privacySettings.aiAccess': {
                profile: profile === 'on' || profile === true || profile === 'true',
                medicalReports: medicalReports === 'on' || medicalReports === true || medicalReports === 'true',
                healthMeasurements: healthMeasurements === 'on' || healthMeasurements === true || healthMeasurements === 'true',
                medicines: medicines === 'on' || medicines === true || medicines === 'true',
                familyMetadata: familyMetadata === 'on' || familyMetadata === true || familyMetadata === 'true'
            }
        });

        res.redirect('/profile?success=Privacy+settings+updated');
    } catch (error) {
        console.error('[HealthOrbit] Update Privacy Error:', error.message);
        res.redirect('/profile?error=Failed+to+update+privacy+settings');
    }
};

// 6. Update Password
const updatePassword = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || (req.user && req.user._id);
        const { currentPassword, newPassword, confirmPassword } = req.body;

        if (newPassword !== confirmPassword) {
            return res.redirect('/profile?error=New+passwords+do+not+match');
        }

        const user = await User.findById(activeUserId);
        if (!user || !user.password) {
            return res.redirect('/profile?error=Cannot+change+password+for+OAuth+accounts');
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.redirect('/profile?error=Current+password+is+incorrect');
        }

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();

        res.redirect('/profile?success=Password+updated+successfully');
    } catch (error) {
        console.error('[HealthOrbit] Update Password Error:', error.message);
        res.redirect('/profile?error=Failed+to+update+password');
    }
};

// 7. Profile Picture Upload via Cloudinary
const uploadProfileImage = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || (req.user && req.user._id);

        if (!req.file) {
            return res.redirect('/profile?error=No+file+selected');
        }

        const cloudUpload = await uploadToCloudinary(req.file.path, 'healthorbit_profiles');
        if (cloudUpload && cloudUpload.url) {
            await User.findByIdAndUpdate(activeUserId, { profileImage: cloudUpload.url });
        }

        res.redirect('/profile?success=Profile+photo+updated+successfully');
    } catch (error) {
        console.error('[HealthOrbit] Profile Image Upload Error:', error.message);
        res.redirect('/profile?error=Failed+to+upload+photo');
    }
};

module.exports = {
    getProfile,
    updatePersonal,
    updateHealth,
    updateEmergency,
    updatePrivacy,
    updatePassword,
    uploadProfileImage
};