const FamilyMember = require('../models/FamilyMember');

const addMember = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        const { name, relationship, contact, permissions } = req.body;
        
        let permObj = { emergencyInfo: false, medicalReports: false, healthSummary: false, medicines: false, symptoms: false, insurance: false, wearableData: false, healthTimeline: false };
        if (permissions) {
            const permArray = Array.isArray(permissions) ? permissions : [permissions];
            permArray.forEach(p => { if (permObj.hasOwnProperty(p)) permObj[p] = true; });
        }
        
        await FamilyMember.create({ userId: activeUserId, name: name.trim(), relationship, contact: contact.trim(), permissions: permObj });
        res.redirect('/profile?success=Family+member+added');
    } catch (error) {
        res.redirect('/profile');
    }
};

const updatePermissions = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        const { permissions } = req.body;
        
        let permObj = { emergencyInfo: false, medicalReports: false, healthSummary: false, medicines: false, symptoms: false, insurance: false, wearableData: false, healthTimeline: false };
        if (permissions) {
            const permArray = Array.isArray(permissions) ? permissions : [permissions];
            permArray.forEach(p => { if (permObj.hasOwnProperty(p)) permObj[p] = true; });
        }
        
        await FamilyMember.findOneAndUpdate({ _id: req.params.id, userId: activeUserId }, { permissions: permObj });
        res.redirect('/profile?success=Permissions+updated');
    } catch (error) {
        res.redirect('/profile');
    }
};

const removeMember = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        await FamilyMember.findOneAndDelete({ _id: req.params.id, userId: activeUserId });
        res.redirect('/profile?success=Family+member+removed');
    } catch (error) {
        res.redirect('/profile');
    }
};

module.exports = {
    addMember,
    updatePermissions,
    removeMember
};