const cron = require('node-cron');
const User = require('../models/User');
const Medicine = require('../models/Medicine');
const Notification = require('../models/Notification');
const MedicineLog = require('../models/MedicineLog');

/**
 * Dispatches instant notifications via Telegram Bot HTTP API (HTML Mode)
 */
const sendTelegramAlert = async (messageText, chatId = null) => {
    // Clean the variables to ensure no invisible spaces cause errors
    const token = process.env.TELEGRAM_BOT_TOKEN ? process.env.TELEGRAM_BOT_TOKEN.trim() : null;
    const targetChatId = chatId || (process.env.TELEGRAM_CHAT_ID ? process.env.TELEGRAM_CHAT_ID.trim() : null);

    if (!token || !targetChatId) {
        console.warn('⚠️ [Telegram Alert] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID.');
        return false;
    }

    try {
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: targetChatId,
                text: messageText,
                parse_mode: 'HTML' // HTML is much more stable than Markdown
            })
        });

        const data = await response.json();
        
        if (!data.ok) {
            console.error(`❌ [Telegram API Error]: ${data.description}`);
            return false;
        }

        console.log(`📡 [Telegram] Successfully delivered to Chat ID: ${targetChatId}`);
        return true;

    } catch (err) {
        console.error('❌ [Telegram Network Error]:', err.message);
        return false;
    }
};

const initScheduler = () => {
    cron.schedule('* * * * *', async () => {
        try {
            const now = new Date();
            
            const currentTimeStr = now.toLocaleTimeString('en-GB', { 
                timeZone: 'Asia/Kolkata', 
                hour: '2-digit', 
                minute: '2-digit' 
            });
            
            const todayStr = now.toLocaleDateString('en-CA', { 
                timeZone: 'Asia/Kolkata' 
            });

            const dueMedicines = await Medicine.find({ 
                active: true, 
                reminderEnabled: true,
                times: currentTimeStr 
            });

            for (const med of dueMedicines) {
                const existingLog = await MedicineLog.findOne({
                    medicineId: med._id,
                    date: todayStr,
                    scheduledTime: currentTimeStr
                });

                if (!existingLog) {
                    await MedicineLog.create({
                        userId: med.userId,
                        medicineId: med._id,
                        scheduledTime: currentTimeStr,
                        date: todayStr,
                        status: 'pending'
                    });

                    await Notification.create({
                        userId: med.userId,
                        type: 'medicine',
                        title: 'Time for your Medicine',
                        message: `Take ${med.name} (${med.dosage}). ${med.instructions || ''}`,
                        relatedId: med._id,
                        read: false
                    });

                    const user = await User.findById(med.userId);
                    const recipientName = user ? user.fullName : 'HealthOrbit User';

                    // Using HTML formatting instead of Markdown
                    const messageBody = `<b>HealthOrbit Reminder</b> 💊\n\nHello <b>${recipientName}</b>,\nIt is time to take your scheduled dose:\n\n• <b>Medicine:</b> ${med.name}\n• <b>Dosage:</b> ${med.dosage}\n• <b>Instructions:</b> ${med.instructions || 'As directed'}\n\n<i>Please log this in your HealthOrbit dashboard.</i>`;

                    const sent = await sendTelegramAlert(messageBody);
                    if (sent) {
                        console.log(`✅ [HealthOrbit] Medication reminder processed for: ${med.name}`);
                    }
                }
            }
        } catch (error) {
            console.error('[HealthOrbit Scheduler Error]:', error.message);
        }
    }, {
        scheduled: true,
        timezone: 'Asia/Kolkata'
    });

    console.log('✅ [HealthOrbit] Fast HTTP Reminder Engine active for Asia/Kolkata.');
};

module.exports = { initScheduler, sendTelegramAlert };