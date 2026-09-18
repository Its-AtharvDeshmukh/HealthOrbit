const mongoose = require('mongoose');

const aiMessageSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'AIConversation', required: true },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    // We can store exactly what context the AI was looking at when this message was sent
    currentPage: { type: String },
    selectedRecordId: { type: mongoose.Schema.Types.ObjectId, ref: 'MedicalReport' }
}, { timestamps: true });

// Index to quickly load all messages for a specific conversation in chronological order
aiMessageSchema.index({ conversationId: 1, createdAt: 1 });

module.exports = mongoose.model('AIMessage', aiMessageSchema);