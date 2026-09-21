const Medicine = require('../models/Medicine');
const MedicineLog = require('../models/MedicineLog');
const SymptomEntry = require('../models/SymptomEntry');

const getMedicinesWorkspace = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        
        const activeMeds = await Medicine.find({ userId: activeUserId, active: true });
        const recentSymptoms = await SymptomEntry.find({ userId: activeUserId }).sort({ recordedAt: -1 }).limit(10);
            
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        
        const todayLogs = await MedicineLog.find({ userId: activeUserId, date: todayStr });
        let scheduleToday = [];
        
        activeMeds.forEach(med => {
            if(med.times && med.times.length > 0) {
                med.times.forEach(time => {
                    const log = todayLogs.find(l => l.medicineId.equals(med._id) && l.scheduledTime === time);
                    let status = 'Upcoming';
                    if (log) {
                        status = log.status.charAt(0).toUpperCase() + log.status.slice(1);
                    } else if (time < currentTimeStr) {
                        status = 'Missed';
                    }
                    
                    scheduleToday.push({
                        medicine: med,
                        time: time,
                        status: status,
                        logId: log ? log._id : null
                    });
                });
            }
        });
        
        scheduleToday.sort((a, b) => a.time.localeCompare(b.time));

        res.render('dashboard/medicines.ejs', { 
            userName: req.session.userName || req.user.fullName,
            userEmail: req.session.userEmail || req.user.email,
            medicines: activeMeds,
            scheduleToday: scheduleToday,
            symptoms: recentSymptoms
        });
    } catch (error) {
        console.error('[HealthOrbit] Medicines Load Error:', error);
        res.redirect('/dashboard');
    }
};

const addMedicine = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        const { name, dosage, frequency, duration, times } = req.body;
        let timesArray = [];
        if (times) {
            timesArray = Array.isArray(times) ? times : [times];
        }

        await Medicine.create({
            userId: activeUserId,
            name: String(name).trim(),
            dosage: String(dosage).trim(),
            frequency: String(frequency || 'Daily').trim(),
            instructions: String(duration || '').trim(),
            times: timesArray
        });
        res.redirect('/medicines');
    } catch (err) {
        res.redirect('/medicines');
    }
};

const logDose = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        const { medId } = req.params;
        const { time, status } = req.body;
        const todayStr = new Date().toISOString().split('T')[0];
        
        let log = await MedicineLog.findOne({ 
            userId: activeUserId, 
            medicineId: medId, 
            date: todayStr, 
            scheduledTime: time 
        });

        if (!log) {
            log = new MedicineLog({
                userId: activeUserId,
                medicineId: medId,
                date: todayStr,
                scheduledTime: time
            });
        }
        
        log.status = status === 'taken' ? 'taken' : 'skipped';
        log.takenAt = new Date();
        await log.save();
        
        res.redirect('/medicines');
    } catch (err) {
        res.redirect('/medicines');
    }
};

const deleteMedicine = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        const deletedMed = await Medicine.findOneAndDelete({ _id: req.params.id, userId: activeUserId });
        if (deletedMed) {
            await MedicineLog.deleteMany({ medicineId: req.params.id, userId: activeUserId });
        }
        res.redirect('/medicines');
    } catch (err) {
        res.redirect('/medicines');
    }
};

const addSymptom = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        const { symptomType, severity, notes } = req.body;
        await SymptomEntry.create({
            userId: activeUserId,
            symptom: String(symptomType).trim(),
            severity: String(severity).trim(),
            notes: String(notes || '').trim()
        });
        res.redirect('/medicines');
    } catch (err) {
        res.redirect('/medicines');
    }
};

const quickLogSymptom = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        const { symptomName } = req.body;
        await SymptomEntry.create({
            userId: activeUserId,
            symptom: String(symptomName).trim(),
            severity: 'Mild',
            notes: 'Quick logged from dashboard.'
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
};

const deleteSymptom = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        await SymptomEntry.findOneAndDelete({ _id: req.params.id, userId: activeUserId });
        res.redirect('/medicines');
    } catch (err) {
        res.redirect('/medicines');
    }
};

module.exports = {
    getMedicinesWorkspace, addMedicine, logDose, deleteMedicine,
    addSymptom, quickLogSymptom, deleteSymptom
};