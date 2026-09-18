const mongoose = require('mongoose');

const hydrationLogSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amountMl: { type: Number, required: true },
    dateStr: { type: String, required: true } // "YYYY-MM-DD"
}, { timestamps: true });

module.exports = mongoose.model('HydrationLog', hydrationLogSchema);