const path = require('path');
const fs = require('fs');
const User = require('../models/User');
const MedicalReport = require('../models/MedicalReport');
const HealthMeasurement = require('../models/HealthMeasurement');
const FamilyMember = require('../models/FamilyMember');
const InsurancePolicy = require('../models/InsurancePolicy');
const InsuranceClaim = require('../models/InsuranceClaim');
const DigitalHealthId = require('../models/DigitalHealthId');

const exportData = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        const [user, reports, measurements, family, policies, claims, digitalIds] = await Promise.all([
            User.findById(activeUserId).select('-passwordHash -__v').lean(),
            MedicalReport.find({ userId: activeUserId }).select('-__v').lean(),
            HealthMeasurement.find({ userId: activeUserId }).select('-__v').lean(),
            FamilyMember.find({ userId: activeUserId }).select('-__v').lean(),
            InsurancePolicy.find({ userId: activeUserId }).select('-__v').lean(),
            InsuranceClaim.find({ userId: activeUserId }).select('-__v').lean(),
            DigitalHealthId.find({ userId: activeUserId }).select('-__v').lean()
        ]);
        
        const exportData = { profile: user, familyMembers: family, medicalReports: reports, healthMeasurements: measurements, insurancePolicies: policies, insuranceClaims: claims, digitalHealthIds: digitalIds, exportDate: new Date() };
        
        res.setHeader('Content-disposition', 'attachment; filename=HealthOrbit_Data_Export.json');
        res.setHeader('Content-type', 'application/json');
        res.write(JSON.stringify(exportData, null, 2));
        res.end();
    } catch (error) {
        res.redirect('/profile');
    }
};

const deleteAccount = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        const uploadsDir = path.join(__dirname, '..', 'uploads');
        
        const reports = await MedicalReport.find({ userId: activeUserId });
        reports.forEach(report => {
            if (report.storedFileName && !report.storedFileName.startsWith('http')) {
                const filePath = path.join(uploadsDir, report.storedFileName);
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            }
        });

        await MedicalReport.deleteMany({ userId: activeUserId });
        await HealthMeasurement.deleteMany({ userId: activeUserId });
        await FamilyMember.deleteMany({ userId: activeUserId });
        await InsurancePolicy.deleteMany({ userId: activeUserId });
        await InsuranceClaim.deleteMany({ userId: activeUserId });
        await DigitalHealthId.deleteMany({ userId: activeUserId });
        await User.findByIdAndDelete(activeUserId);
        
        req.logout((err) => {
            req.session.destroy(() => {
                res.clearCookie('connect.sid');
                res.redirect('/auth');
            });
        });
    } catch (error) {
        res.redirect('/profile');
    }
};

module.exports = { exportData, deleteAccount };