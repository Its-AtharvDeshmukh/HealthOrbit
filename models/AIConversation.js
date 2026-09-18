const mongoose = require('mongoose');

const aiConversationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true },
    // If the conversation was started from a specific report, we can store it here
    selectedRecordId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalReport' },
    lastMessageAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Index to quickly fetch a user's conversations sorted by recent activity
aiConversationSchema.index({ userId: 1, updatedAt: -1 });

module.exports = mongoose.model('AIConversation', aiConversationSchema);