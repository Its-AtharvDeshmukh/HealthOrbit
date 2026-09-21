const User = require('../models/User');
const FamilyMember = require('../models/FamilyMember');
const MedicalReport = require('../models/MedicalReport');
const HealthMeasurement = require('../models/HealthMeasurement');
const InsurancePolicy = require('../models/InsurancePolicy');
const bcrypt = require('bcryptjs');

// Helper: Calculate Profile Completion Percentage
const calculateProfileCompletion = (user) => {
    const fields = ['fullName', 'email', 'phone', 'age', 'gender', 'bloodGroup', 'emergencyContactName'];
    let filled = 0;
    fields.forEach(f => { if (user[f] && user[f].toString().trim() !== '') filled++; });
    if (user.allergies && user.allergies.length > 0) filled++;
    if (user.medicalConditions && user.medicalConditions.length > 0) filled++;
    if (user.currentMedicines && user.currentMedicines.length > 0) filled++;
    return Math.round((filled / 10) * 100);
};

const getProfile = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        
        const [user, familyMembers] = await Promise.all([
            User.findById(activeUserId).lean(),
            FamilyMember.find({ userId: activeUserId }).sort({ createdAt: -1 }).lean()
        ]);
        
        const completionPct = calculateProfileCompletion(user);
        
        const [reportCount, measurementCount, policyCount] = await Promise.all([
            MedicalReport.countDocuments({ userId: activeUserId }),
            HealthMeasurement.countDocuments({ userId: activeUserId }),
            InsurancePolicy ? InsurancePolicy.countDocuments({ userId: activeUserId }) : 0
        ]);

        res.render('profile/profile.ejs', { 
            user, 
            familyMembers, 
            completionPct,
            counts: { reports: reportCount, measurements: measurementCount, policies: policyCount },
            hasPassword: !!user.passwordHash,
            successMsg: req.query.success,
            errorMsg: req.query.error
        });
    } catch (error) {
        console.error('[HealthOrbit] Profile Load Error:', error);
        res.redirect('/dashboard');
    }
};

const updatePersonal = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        const { fullName, age, gender, phone } = req.body;
        await User.findByIdAndUpdate(activeUserId, { 
            fullName: fullName.trim(), age: age ? parseInt(age) : null, gender, phone: phone.trim()
        });
        req.session.userName = fullName.trim();
        return res.redirect('/profile?success=Personal+Info+updated+successfully');
    } catch (error) {
        return res.redirect('/profile?error=Failed+to+update+Personal+Info');
    }
};

const updateHealth = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        const { bloodGroup, allergies, medicalConditions, currentMedicines } = req.body;
        const toArray = (str) => str ? str.split(',').map(s => s.trim()).filter(s => s) : [];
        await User.findByIdAndUpdate(activeUserId, { 
            bloodGroup, allergies: toArray(allergies), medicalConditions: toArray(medicalConditions), currentMedicines: toArray(currentMedicines)
        });
        return res.redirect('/profile?success=Health+Profile+updated+successfully');
    } catch (error) {
        return res.redirect('/profile?error=Failed+to+update+Health+Profile');
    }
};

const updateEmergency = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        const { emergencyContactName, emergencyContactRelation, emergencyContactPhone } = req.body;
        await User.findByIdAndUpdate(activeUserId, { 
            emergencyContactName: emergencyContactName.trim(), emergencyContactRelation: emergencyContactRelation.trim(), emergencyContactPhone: emergencyContactPhone.trim()
        });
        return res.redirect('/profile?success=Emergency+contact+updated');
    } catch (error) {
        return res.redirect('/profile?error=Failed+to+update+Emergency+Info');
    }
};

const updatePrivacy = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        const { emergencyCardEnabled, aiProfile, aiReports, aiMeasurements, aiMedicines, aiFamily } = req.body;
        
        const privacySettings = {
            emergencyCardEnabled: emergencyCardEnabled === 'on',
            aiAccess: {
                profile: aiProfile === 'on',
                medicalReports: aiReports === 'on',
                healthMeasurements: aiMeasurements === 'on',
                medicines: aiMedicines === 'on',
                familyMetadata: aiFamily === 'on'
            }
        };

        await User.findByIdAndUpdate(activeUserId, { privacySettings });
        res.redirect('/profile?success=Privacy+settings+updated+successfully');
    } catch (error) {
        res.redirect('/profile?error=Failed+to+update+privacy+settings');
    }
};

const updatePassword = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        const { currentPassword, newPassword, confirmPassword } = req.body;

        if (newPassword !== confirmPassword) return res.redirect('/profile?error=New+passwords+do+not+match');
        if (newPassword.length < 8) return res.redirect('/profile?error=Password+must+be+at+least+8+characters');

        const user = await User.findById(activeUserId);
        if (!user.passwordHash) return res.redirect('/profile?error=Google+accounts+cannot+change+passwords+here');

        const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!isMatch) return res.redirect('/profile?error=Current+password+is+incorrect');

        const salt = await bcrypt.genSalt(10);
        user.passwordHash = await bcrypt.hash(newPassword, salt);
        await user.save();

        res.redirect('/profile?success=Password+changed+successfully');
    } catch (error) {
        res.redirect('/profile?error=Failed+to+change+password');
    }
};

module.exports = {
    getProfile,
    updatePersonal,
    updateHealth,
    updateEmergency,
    updatePrivacy,
    updatePassword
};