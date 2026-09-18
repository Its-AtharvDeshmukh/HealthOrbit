const cron = require('node-cron');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const User = require('../models/User');
const Medicine = require('../models/Medicine');
const Notification = require('../models/Notification');
const MedicineLog = require('../models/MedicineLog');

const initScheduler = () => {

    if (process.env.RENDER) {
        console.log('⚠️ Render Cloud detected. WhatsApp bypassed to prevent memory crash.');
        return; 
    }

    
    try {
        const whatsappClient = new Client({
            authStrategy: new LocalAuth(), 
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox', 
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--single-process',
                    '--disable-gpu'
                ] 
            }
        });

        // 1. ADDED: Timestamps and Expiration Warnings
        whatsappClient.on('qr', (qr) => {
            const time = new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata' });
            console.log('\n======================================================');
            console.log(`📱 [${time}] NEW QR CODE GENERATED!`);
            console.log('⚠️ THIS CODE EXPIRES IN 20 SECONDS. SCAN IT IMMEDIATELY!');
            qrcode.generate(qr, { small: true });
            console.log('======================================================\n');
        });

        // 2. ADDED: Success Alert
        whatsappClient.on('authenticated', () => {
            console.log('\n🔐 [HealthOrbit] SUCCESS! WhatsApp is Authenticated!\n');
        });

        // 3. ADDED: Failure Alert
        whatsappClient.on('auth_failure', (msg) => {
            console.log('\n❌ [HealthOrbit] WhatsApp Authentication Failed:', msg, '\n');
        });

        whatsappClient.on('ready', () => {
            console.log('✅ [HealthOrbit] Free WhatsApp module is securely connected and ready!');
        });

        // Start the WhatsApp Client safely
        whatsappClient.initialize();

        // ==========================================
        // BACKGROUND SCHEDULER
        // ==========================================
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

                        const messageBody = `*HealthOrbit Reminder* 💊\n\nIt's time to take your medicine:\n  *${med.name}*\n  Dosage: ${med.dosage}\n  Instructions: ${med.instructions || 'None'}\n\n_Please log this in your HealthOrbit dashboard._`;

                        await Notification.create({
                            userId: med.userId,
                            type: 'medicine',
                            title: 'Time for your Medicine',
                            message: `Take ${med.name} (${med.dosage}). ${med.instructions || ''}`,
                            relatedId: med._id,
                            read: false
                        });

                        const user = await User.findById(med.userId);
                        
                        if (user && user.phone) {
                            let cleanPhone = user.phone.replace(/[^0-9]/g, ''); 
                            if (cleanPhone.length === 10) {
                                cleanPhone = '91' + cleanPhone;
                            }
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
    } catch (err) {
        console.error("Failed to initialize WhatsApp:", err);
    }
};

module.exports = { initScheduler };