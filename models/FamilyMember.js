const mongoose = require('mongoose');

const familyMemberSchema = new mongoose.Schema({
    ownerUserId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    viewerUserId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    relationship: { 
        type: String, 
        required: true, 
        trim: true 
    },
    status: { 
        type: String, 
        enum: ['pending', 'active', 'rejected', 'revoked'], 
        default: 'pending' 
    },
    permissions: {
        emergencyInfo: { type: Boolean, default: false },
        medicalReports: { type: Boolean, default: false },
        healthSummary: { type: Boolean, default: false },
        medicines: { type: Boolean, default: false },
        symptoms: { type: Boolean, default: false },
        insurance: { type: Boolean, default: false },
        wearableData: { type: Boolean, default: false },
        healthTimeline: { type: Boolean, default: false }
    },
    invitedAt: { type: Date, default: Date.now },
    acceptedAt: { type: Date },
    revokedAt: { type: Date }
}, { timestamps: true });

// Prevent duplicate active or pending invitations between the same owner and viewer
familyMemberSchema.index(
    { ownerUserId: 1, viewerUserId: 1 }, 
    { unique: true, partialFilterExpression: { status: { $in: ['pending', 'active'] } } }
);

module.exports = mongoose.model('FamilyMember', familyMemberSchema);