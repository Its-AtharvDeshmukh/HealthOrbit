const cron = require('node-cron');
const User = require('../models/User');
const Medicine = require('../models/Medicine');
const Notification = require('../models/Notification');
const MedicineLog = require('../models/MedicineLog');

/**
 * Sends notifications via Telegram Bot HTTP API
 */
const sendTelegramAlert = async (messageText, chatId = null) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const targetChatId = chatId || process.env.TELEGRAM_CHAT_ID;

    if (!token || !targetChatId) {
        console.warn('[Telegram Alert] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID.');
        return false;
    }

    try {
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: targetChatId,
                text: messageText,
                parse_mode: 'Markdown'
            })
        });

        const data = await response.json();
        return data.ok;
    } catch (err) {
        console.error('[Telegram Alert Error]:', err.message);
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

                    const messageBody = `*HealthOrbit Reminder* 💊\n\nHello *${recipientName}*,\nIt is time to take your scheduled dose:\n\n• *Medicine:* ${med.name}\n• *Dosage:* ${med.dosage}\n• *Instructions:* ${med.instructions || 'As directed'}\n\n_Please log this in your HealthOrbit dashboard._`;

                    const sent = await sendTelegramAlert(messageBody);
                    if (sent) {
                        console.log(`[HealthOrbit] Telegram reminder sent for ${med.name} at ${currentTimeStr}`);
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