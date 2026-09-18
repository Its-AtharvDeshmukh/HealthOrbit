const mongoose = require('mongoose');

const digitalHealthIdSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    idType: { type: String, required: true, trim: true }, // e.g. "ABHA Health ID", "Driving License"
    idNumber: { type: String, required: true, trim: true },
    icon: { type: String, default: '🪪' }
}, { timestamps: true });

module.exports = mongoose.model('DigitalHealthId', digitalHealthIdSchema);