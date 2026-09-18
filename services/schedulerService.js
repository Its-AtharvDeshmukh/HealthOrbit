const cron = require('node-cron');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const User = require('../models/User');
const Medicine = require('../models/Medicine');
const Notification = require('../models/Notification');
const MedicineLog = require('../models/MedicineLog');

// ==========================================
// 1. INITIALIZE FREE WHATSAPP CLIENT
// ==========================================
const whatsappClient = new Client({
    authStrategy: new LocalAuth(), // Saves the session so you only scan the QR code once!
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'] // Ensures it works on all OS environments
    }
});

// Generate QR Code in the Terminal for the developer to scan
whatsappClient.on('qr', (qr) => {
    console.log('\n======================================================');
    console.log('[HealthOrbit] WHATSAPP AUTHENTICATION REQUIRED');
    console.log('Scan this QR code with your WhatsApp to enable free messages:');
    qrcode.generate(qr, { small: true });
    console.log('======================================================\n');
});

whatsappClient.on('ready', () => {
    console.log('✅ [HealthOrbit] Free WhatsApp module is securely connected and ready!');
});

// Start the WhatsApp Client
whatsappClient.initialize();

// ==========================================
// 2. INITIALIZE BACKGROUND SCHEDULER
// ==========================================
const initScheduler = () => {
    // Run every minute, explicitly using IST
    cron.schedule('* * * * *', async () => {
        try {
            const now = new Date();
            
            // Format time to HH:mm strictly in IST
            const currentTimeStr = now.toLocaleTimeString('en-GB', { 
                timeZone: 'Asia/Kolkata', 
                hour: '2-digit', 
                minute: '2-digit' 
            });
            
            // Format date to YYYY-MM-DD strictly in IST
            const todayStr = now.toLocaleDateString('en-CA', { 
                timeZone: 'Asia/Kolkata' 
            });

            // Find active medicines scheduled for this exact minute
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
                    // 1. Create Log
                    await MedicineLog.create({
                        userId: med.userId,
                        medicineId: med._id,
                        scheduledTime: currentTimeStr,
                        date: todayStr,
                        status: 'pending'
                    });

                    const messageBody = `*HealthOrbit Reminder* 🚨\n\nIt's time to take your medicine:\n💊 *${med.name}*\n📏 Dosage: ${med.dosage}\n📝 Instructions: ${med.instructions || 'None'}\n\n_Please log this in your HealthOrbit dashboard._`;

                    // 2. Create Database Notification
                    await Notification.create({
                        userId: med.userId,
                        type: 'medicine',
                        title: 'Time for your Medicine',
                        message: `Take ${med.name} (${med.dosage}). ${med.instructions || ''}`,
                        relatedId: med._id,
                        read: false
                    });

                    // 3. SEND FREE WHATSAPP MESSAGE
                    const user = await User.findById(med.userId);
                    
                    if (user && user.phone) {
                        // Remove all +, spaces, and dashes
                        let cleanPhone = user.phone.replace(/[^0-9]/g, ''); 
                        
                        // BULLETPROOF FIX: If the user only entered a 10-digit Indian number, auto-add '91'
                        if (cleanPhone.length === 10) {
                            cleanPhone = '91' + cleanPhone;
                        }

                        // whatsapp-web.js requires CountryCode + Number + "@c.us"
                        const whatsappId = `${cleanPhone}@c.us`;

                        whatsappClient.sendMessage(whatsappId, messageBody).then(() => {
                            console.log(`[HealthOrbit] Free WhatsApp successfully sent to ${user.fullName} (${cleanPhone})`);
                        }).catch(err => {
                            console.error(`[HealthOrbit] WhatsApp failed to send to ${cleanPhone}. Is the number correct?`);
                        });
                    }
                }
            }
        } catch (error) {
            console.error('[HealthOrbit Scheduler Error]:', error.message);
        }
    }, {
        scheduled: true,
        timezone: "Asia/Kolkata"
    });
    
    console.log('[HealthOrbit] Timezone-Aware Scheduler initialized for Asia/Kolkata.');
};

module.exports = { initScheduler };