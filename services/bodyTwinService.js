const User = require('../models/User');
const FamilyMember = require('../models/FamilyMember');
const MedicalReport = require('../models/MedicalReport');
const HealthMeasurement = require('../models/HealthMeasurement');

// Keyword mapper to link OCR clinical data to 3D Body Regions
const regionKeywordMap = {
    'HEAD': ['brain', 'head', 'skull', 'eeg', 'mri brain', 'ct head', 'migraine', 'concussion'],
    'CHEST': ['chest', 'heart', 'lungs', 'ecg', 'ekg', 'echocardiogram', 'cardiology', 'pulmonary', 'thorax', 'rib'],
    'ABDOMEN': ['abdomen', 'stomach', 'liver', 'kidney', 'pelvis', 'ultrasound abdomen', 'digestive', 'appendix'],
    'LEFT_FOREARM': ['left arm', 'left forearm', 'left radius', 'left ulna', 'left wrist'],
    'RIGHT_FOREARM': ['right arm', 'right forearm', 'right radius', 'right ulna', 'right wrist'],
    'LEFT_KNEE': ['left knee', 'left patella', 'left leg', 'left acl'],
    'RIGHT_KNEE': ['right knee', 'right patella', 'right leg', 'right acl']
};

const mapTextToRegion = (text) => {
    if (!text) return null;
    const lowerText = text.toLowerCase();
    for (const [region, keywords] of Object.entries(regionKeywordMap)) {
        if (keywords.some(kw => lowerText.includes(kw))) {
            return region;
        }
    }
    return null; // No specific mapped region
};

exports.getBodyTwinPayload = async (userId) => {
    // 1. Resolve User and Family Members
    const currentUser = await User.findById(userId).lean();
    const familyDocs = await FamilyMember.find({ ownerUserId: userId }).populate('viewerUserId').lean();

    const members = [
        { 
            id: userId.toString(), 
            name: currentUser.fullName ? currentUser.fullName.split(' ')[0] : 'Me', 
            relationship: 'Self', 
            access: 'full', 
            model: (currentUser.age && currentUser.age < 18) ? 'child' : (currentUser.gender === 'Female' ? 'adult-female' : 'adult') 
        }
    ];

    familyDocs.forEach(fam => {
        const hasAccess = fam.permissions && fam.permissions.healthTimeline;
        members.push({
            id: fam._id.toString(),
            name: fam.name || 'Family Member',
            relationship: fam.relationship || 'Relative',
            access: hasAccess ? 'shared' : 'limited',
            model: 'adult' // Default, can be refined based on family member meta
        });
    });

    // 2. Fetch Medical Reports & Map to Markers (For the logged-in user)
    const reports = await MedicalReport.find({ userId, status: 'extracted' }).sort({ createdAt: 1 }).lean();
    const markers = { [userId.toString()]: [] };
    const timelines = { [userId.toString()]: [] };
    const progressHistory = {};

    reports.forEach(report => {
        const dateKey = new Date(report.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        
        // Add to timeline if not exists
        if (!timelines[userId.toString()].includes(dateKey)) {
            timelines[userId.toString()].push(dateKey);
        }

        // Determine Region based on Title or AI Explanation
        const searchString = `${report.originalFileName} ${report.aiExplanation || ''}`;
        const region = mapTextToRegion(searchString);

        if (region) {
            markers[userId.toString()].push({
                dateId: dateKey,
                region: region,
                state: "Current record",
                color: "coral", // Defaulting to coral for reports
                title: report.originalFileName || "Medical Record",
                date: new Date(report.createdAt).toLocaleDateString(),
                source: "Medical Report"
            });
        }
    });

    // 3. Fetch Weight/Progress Data
    const weights = await HealthMeasurement.find({ userId, metricKey: 'weight' }).sort({ recordedAt: 1 }).lean();
    weights.forEach(w => {
        const dateKey = new Date(w.recordedAt || w.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        progressHistory[dateKey] = w.value;
        if (!timelines[userId.toString()].includes(dateKey)) timelines[userId.toString()].push(dateKey);
    });

    // Sort timelines chronologically
    timelines[userId.toString()].sort((a, b) => new Date(a) - new Date(b));

    const progress = {
        [userId.toString()]: {
            type: "weight",
            target: currentUser.targetWeight || null,
            history: progressHistory
        }
    };

    return { members, markers, progress, timelines };
};