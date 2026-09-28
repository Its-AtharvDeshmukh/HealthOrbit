let PDFDocument;
try {
    PDFDocument = require('pdfkit');
} catch (e) {
    PDFDocument = null;
}

const User = require('../models/User');
const Medicine = require('../models/Medicine');
const SymptomEntry = require('../models/SymptomEntry');
const HealthMeasurement = require('../models/HealthMeasurement');
const MedicalReport = require('../models/MedicalReport');
const InsurancePolicy = require('../models/InsurancePolicy');
const FamilyMember = require('../models/FamilyMember');

/**
 * GET /account/export
 * Generates and streams a clean, privacy-compliant PDF export of the authenticated user's health data.
 */
const exportData = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || (req.user && req.user._id);

        if (!activeUserId) {
            return res.status(401).send('Unauthorized. Please log in.');
        }

        const user = await User.findById(activeUserId).lean();
        if (!user) {
            return res.status(404).send('User not found.');
        }

        // Gather all user records in parallel
        const [medicines, symptoms, measurements, reports, policies, family] = await Promise.all([
            Medicine.find({ userId: activeUserId, active: true }).lean().catch(() => []),
            SymptomEntry.find({ userId: activeUserId }).sort({ recordedAt: -1 }).limit(20).lean().catch(() => []),
            HealthMeasurement.find({ userId: activeUserId }).sort({ recordedAt: -1 }).limit(20).lean().catch(() => []),
            MedicalReport.find({ userId: activeUserId }).sort({ createdAt: -1 }).lean().catch(() => []),
            InsurancePolicy.find({ userId: activeUserId }).lean().catch(() => []),
            FamilyMember.find({ ownerUserId: activeUserId }).populate('viewerUserId', 'fullName email').lean().catch(() => [])
        ]);

        const todayStr = new Date().toISOString().split('T')[0];
        const filename = `HealthOrbit_My_Data_${todayStr}.pdf`;

        // Fallback if pdfkit is not yet installed
        if (!PDFDocument) {
            res.setHeader('Content-Type', 'text/plain');
            res.setHeader('Content-Disposition', `attachment; filename="HealthOrbit_My_Data_${todayStr}.txt"`);
            return res.send(
                `HEALTHORBIT DATA EXPORT (${todayStr})\n` +
                `Name: ${user.fullName}\n` +
                `Email: ${user.email}\n` +
                `Age: ${user.age || 'N/A'} | Gender: ${user.gender || 'N/A'}\n` +
                `Blood Group: ${user.bloodGroup || 'N/A'}\n` +
                `Note: Please run 'npm install pdfkit' on the server to enable PDF binary exports.`
            );
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        const doc = new PDFDocument({ margin: 40 });
        doc.pipe(res);

        // Header & Branding
        doc.fillColor('#0b5e55').fontSize(22).text('HealthOrbit', { align: 'center' });
        doc.fillColor('#4e6b63').fontSize(11).text('Personal Health Intelligence Platform — Comprehensive Export', { align: 'center' });
        doc.moveDown(1.5);
        doc.strokeColor('#0d7a6e').lineWidth(1).moveTo(40, doc.y).lineTo(570, doc.y).stroke();
        doc.moveDown(1);

        // Profile Section
        doc.fillColor('#0b5e55').fontSize(14).text('1. Profile Information');
        doc.moveDown(0.3);
        doc.fillColor('#0f1c1a').fontSize(10);
        doc.text(`Full Name: ${user.fullName || 'N/A'}`);
        doc.text(`Email: ${user.email || 'N/A'}`);
        doc.text(`Phone: ${user.phone || 'N/A'}`);
        doc.text(`Age: ${user.age || 'N/A'} | Gender: ${user.gender || 'N/A'}`);
        doc.text(`Address: ${user.address || 'N/A'}`);
        doc.moveDown(1);

        // Clinical Attributes
        doc.fillColor('#0b5e55').fontSize(14).text('2. Clinical & Health Attributes');
        doc.moveDown(0.3);
        doc.fillColor('#0f1c1a').fontSize(10);
        doc.text(`Blood Group: ${user.bloodGroup || 'N/A'}`);
        doc.text(`Allergies: ${user.allergies && user.allergies.length ? user.allergies.join(', ') : 'None recorded'}`);
        doc.text(`Medical Conditions: ${user.medicalConditions && user.medicalConditions.length ? user.medicalConditions.join(', ') : 'None recorded'}`);
        doc.text(`Emergency Contact: ${user.emergencyContact ? `${user.emergencyContact.name} (${user.emergencyContact.relationship}) -${user.emergencyContact.phone}` : 'None configured'}`);
        doc.moveDown(1);

        // Active Medications
        doc.fillColor('#0b5e55').fontSize(14).text('3. Active Medications');
        doc.moveDown(0.3);
        doc.fillColor('#0f1c1a').fontSize(10);
        if (medicines.length > 0) {
            medicines.forEach(m => {
                doc.text(`• ${m.name} — Dosage: ${m.dosage || 'N/A'} | Schedule: ${Array.isArray(m.times) ? m.times.join(', ') : m.times || 'N/A'}`);
            });
        } else {
            doc.text('No active medications on file.');
        }
        doc.moveDown(1);

        // Health Measurements
        doc.fillColor('#0b5e55').fontSize(14).text('4. Recent Health Measurements');
        doc.moveDown(0.3);
        doc.fillColor('#0f1c1a').fontSize(10);
        if (measurements.length > 0) {
            measurements.slice(0, 10).forEach(ms => {
                const dateStr = ms.recordedAt ? new Date(ms.recordedAt).toLocaleDateString() : 'N/A';
                doc.text(`• ${ms.metricName || 'Metric'}: ${ms.value} ${ms.unit || ''} (Recorded: ${dateStr})`);
            });
        } else {
            doc.text('No recent measurements recorded.');
        }
        doc.moveDown(1);

        // Recent Symptoms
        doc.fillColor('#0b5e55').fontSize(14).text('5. Recent Symptoms Log');
        doc.moveDown(0.3);
        doc.fillColor('#0f1c1a').fontSize(10);
        if (symptoms.length > 0) {
            symptoms.slice(0, 10).forEach(s => {
                const dateStr = s.recordedAt ? new Date(s.recordedAt).toLocaleDateString() : 'N/A';
                doc.text(`• ${s.symptom || 'Symptom'} — Severity: ${s.severity || 'N/A'} (${dateStr})`);
            });
        } else {
            doc.text('No symptoms logged.');
        }
        doc.moveDown(1);

        // Insurance Coverage
        doc.fillColor('#0b5e55').fontSize(14).text('6. Insurance Policies');
        doc.moveDown(0.3);
        doc.fillColor('#0f1c1a').fontSize(10);
        if (policies.length > 0) {
            policies.forEach(p => {
                doc.text(`• ${p.providerName || 'Provider'} — Policy #: ${p.policyNumber} | Limit: ₹${Number(p.coverageAmount || 0).toLocaleString('en-IN')}`);
            });
        } else {
            doc.text('No insurance policies linked.');
        }
        doc.moveDown(1);

        // Authorized Family Sharing
        doc.fillColor('#0b5e55').fontSize(14).text('7. Authorized Family Access');
        doc.moveDown(0.3);
        doc.fillColor('#0f1c1a').fontSize(10);
        if (family.length > 0) {
            family.forEach(f => {
                const delegate = f.viewerUserId ? f.viewerUserId.fullName : 'Invited Member';
                doc.text(`• ${delegate} (${f.relationship || 'Relative'}) — Status: ${f.status}`);
            });
        } else {
            doc.text('No family access authorizations configured.');
        }
        doc.moveDown(1.5);

        // Footer Safety Notice
        doc.strokeColor('#0d7a6e').lineWidth(0.5).moveTo(40, doc.y).lineTo(570, doc.y).stroke();
        doc.moveDown(0.8);
        doc.fillColor('#4e6b63').fontSize(9).text(
            'CONFIDENTIAL MEDICAL RECORD: This export contains personal health information. ' +
            'Generated by HealthOrbit for individual user review. Not a replacement for professional clinical advice.',
            { align: 'center' }
        );

        doc.end();
    } catch (error) {
        console.error('[HealthOrbit] Export Data Error:', error.message);
        if (!res.headersSent) {
            res.status(500).send('An error occurred while generating your export.');
        }
    }
};

/**
 * POST /account/delete
 * Completely removes the authenticated user's account and associated data.
 */
const deleteAccount = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || (req.user && req.user._id);

        if (!activeUserId) {
            return res.status(401).redirect('/auth');
        }

        // Clean up user datasets
        await Promise.all([
            User.findByIdAndDelete(activeUserId),
            Medicine.deleteMany({ userId: activeUserId }),
            SymptomEntry.deleteMany({ userId: activeUserId }),
            HealthMeasurement.deleteMany({ userId: activeUserId }),
            MedicalReport.deleteMany({ userId: activeUserId }),
            InsurancePolicy.deleteMany({ userId: activeUserId }),
            FamilyMember.deleteMany({ $or: [{ ownerUserId: activeUserId }, { viewerUserId: activeUserId }] })
        ]);

        // Destroy session
        if (req.session) {
            req.session.destroy(() => {
                res.redirect('/auth?success=Account+successfully+deleted');
            });
        } else {
            res.redirect('/auth?success=Account+successfully+deleted');
        }
    } catch (error) {
        console.error('[HealthOrbit] Delete Account Error:', error.message);
        res.redirect('/profile?error=Failed+to+delete+account');
    }
};

module.exports = {
    exportData,
    deleteAccount
};