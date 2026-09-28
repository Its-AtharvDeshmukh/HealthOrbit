const InsurancePolicy = require('../models/InsurancePolicy');
const InsuranceClaim = require('../models/InsuranceClaim');
const DigitalHealthId = require('../models/DigitalHealthId');

const getInsuranceWorkspace = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        
        const policies = await InsurancePolicy.find({ userId: activeUserId }).sort({ isPrimary: -1, createdAt: -1 });
        const claims = await InsuranceClaim.find({ userId: activeUserId }).populate('policyId').sort({ claimDate: -1 });
        const digitalIds = await DigitalHealthId.find({ userId: activeUserId }).sort({ createdAt: -1 });

        const policiesWithStats = policies.map(policy => {
            const pClaims = claims.filter(c => 
                c.policyId && c.policyId._id.toString() === policy._id.toString() &&
                ['Approved', 'Settled'].includes(c.status)
            );
            const usedCoverage = pClaims.reduce((sum, claim) => sum + (claim.claimAmount || 0), 0);
            
            return {
                ...policy.toObject(),
                usedCoverage
            };
        });

        res.render('dashboard/insurance.ejs', {
            policies: policiesWithStats,
            claims,
            digitalIds,
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
        res.redirect('/insurance?success=Policy+added');
    } catch (error) {
        console.error('[HealthOrbit] Add Policy Error:', error);
        res.redirect('/insurance?error=Failed+to+add+policy');
    }
};

const deletePolicy = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        await InsurancePolicy.findOneAndDelete({ _id: req.params.id, userId: activeUserId });
        res.redirect('/insurance?success=Policy+deleted');
    } catch (error) {
        console.error('[HealthOrbit] Delete Policy Error:', error.message);
        res.redirect('/insurance?error=Failed+to+delete+policy');
    }
};

const addClaim = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        const policy = await InsurancePolicy.findOne({ _id: req.body.policyId, userId: activeUserId });
        if (!policy) throw new Error('Unauthorized policy selected');

        await InsuranceClaim.create({ ...req.body, userId: activeUserId });
        res.redirect('/insurance?success=Claim+filed');
    } catch (error) {
        console.error('[HealthOrbit] Add Claim Error:', error);
        res.redirect('/insurance?error=Failed+to+file+claim');
    }
};

const deleteClaim = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        await InsuranceClaim.findOneAndDelete({ _id: req.params.id, userId: activeUserId });
        res.redirect('/insurance?success=Claim+deleted');
    } catch (error) {
        console.error('[HealthOrbit] Delete Claim Error:', error);
        res.redirect('/insurance?error=Failed+to+delete+claim');
    }
};

const addDigitalId = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        await DigitalHealthId.create({ ...req.body, userId: activeUserId });
        res.redirect('/insurance?success=Digital+ID+added');
    } catch (error) {
        console.error('[HealthOrbit] Add Digital ID Error:', error.message);
        res.redirect('/insurance?error=Failed+to+add+Digital+ID');
    }
};

const getDigitalIdDetails = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        const digitalId = await DigitalHealthId.findOne({ _id: req.params.id, userId: activeUserId });
        if (!digitalId) return res.status(404).json({ error: 'Not found' });
        res.status(200).json(digitalId);
    } catch (error) {
        console.error('[HealthOrbit] Get Digital ID Details Error:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const deleteDigitalId = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        await DigitalHealthId.findOneAndDelete({ _id: req.params.id, userId: activeUserId });
        res.redirect('/insurance?success=Digital+ID+removed');
    } catch (error) {
        console.error('[HealthOrbit] Delete Digital ID Error:', error.message);
        res.redirect('/insurance?error=Failed+to+remove+Digital+ID');
    }
};

module.exports = {
    getInsuranceWorkspace,
    addPolicy,
    deletePolicy,
    addClaim,
    deleteClaim,
    addDigitalId,
    getDigitalIdDetails,
    deleteDigitalId
};