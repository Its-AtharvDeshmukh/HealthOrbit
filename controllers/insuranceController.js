const InsurancePolicy = require('../models/InsurancePolicy');
const InsuranceClaim = require('../models/InsuranceClaim');
const DigitalHealthId = require('../models/DigitalHealthId');

const getInsuranceWorkspace = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        
        const policies = await InsurancePolicy.find({ userId: activeUserId }).sort({ isPrimary: -1, createdAt: -1 });
        const claims = await InsuranceClaim.find({ userId: activeUserId }).populate('policyId').sort({ claimDate: -1 });
        const digitalIds = await DigitalHealthId.find({ userId: activeUserId });

        let primaryPolicy = policies.find(p => p.isPrimary) || policies[0] || null;
        let totalCoverage = primaryPolicy ? primaryPolicy.coverageAmount : 0;
        let usedCoverage = 0;

        if (primaryPolicy) {
            const primaryClaims = claims.filter(c => 
                c.policyId && c.policyId._id.toString() === primaryPolicy._id.toString() &&
                ['Approved', 'Settled'].includes(c.status)
            );
            usedCoverage = primaryClaims.reduce((sum, claim) => sum + (claim.claimAmount || 0), 0);
        }

        res.render('dashboard/insurance.ejs', {
            policies,
            claims,
            digitalIds,
            primaryPolicy,
            totalCoverage,
            usedCoverage,
            successMsg: req.query.success,
            errorMsg: req.query.error
        });
    } catch (error) {
        console.error('[HealthOrbit] Insurance Load Error:', error);
        res.redirect('/dashboard');
    }
};

const addPolicy = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        const existingCount = await InsurancePolicy.countDocuments({ userId: activeUserId });
        
        await InsurancePolicy.create({
            ...req.body,
            userId: activeUserId,
            isPrimary: existingCount === 0 
        });
        res.redirect('/insurance');
    } catch (error) {
        res.redirect('/insurance');
    }
};

const addClaim = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        const policy = await InsurancePolicy.findOne({ _id: req.body.policyId, userId: activeUserId });
        if (!policy) throw new Error('Unauthorized policy selected');

        await InsuranceClaim.create({ ...req.body, userId: activeUserId });
        res.redirect('/insurance');
    } catch (error) {
        res.redirect('/insurance');
    }
};

const deleteClaim = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        await InsuranceClaim.findOneAndDelete({ _id: req.params.id, userId: activeUserId });
        res.redirect('/insurance');
    } catch (error) {
        res.redirect('/insurance');
    }
};

const addDigitalId = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        await DigitalHealthId.create({ ...req.body, userId: activeUserId });
        res.redirect('/insurance');
    } catch (error) {
        res.redirect('/insurance');
    }
};

const deleteDigitalId = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        await DigitalHealthId.findOneAndDelete({ _id: req.params.id, userId: activeUserId });
        res.redirect('/insurance');
    } catch (error) {
        res.redirect('/insurance');
    }
};

module.exports = {
    getInsuranceWorkspace,
    addPolicy,
    addClaim,
    deleteClaim,
    addDigitalId,
    deleteDigitalId
};