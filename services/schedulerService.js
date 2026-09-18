const cron = require('node-cron');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const User = require('../models/User');
const Medicine = require('../models/Medicine');
const Notification = require('../models/Notification');
const MedicineLog = require('../models/MedicineLog');

const initScheduler = () => {
    // 1. CLOUD CHECK: Completely bypass WhatsApp and Puppeteer if running on Render
    // Render automatically sets process.env.RENDER = 'true'
    if (process.env.RENDER) {
        console.log('⚠️ [HealthOrbit] Render Cloud detected. WhatsApp scheduler bypassed to prevent Chrome crash.');
        return; // Stops the function here. Chrome will not launch.
    }

    // ==========================================
    // 2. INITIALIZE FREE WHATSAPP CLIENT (Local Only)
    // ==========================================
    try {
        const whatsappClient = new Client({
            authStrategy: new LocalAuth(), 
            puppeteer: {
                args: ['--no-sandbox', '--disable-setuid-sandbox'] 
            }
        });

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

        // Start the WhatsApp Client safely
        whatsappClient.initialize();

        // ==========================================
        // 3. INITIALIZE BACKGROUND SCHEDULER
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