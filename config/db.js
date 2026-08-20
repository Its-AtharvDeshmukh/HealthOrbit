
const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI);
        console.log(`[HealthOrbit] MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`[HealthOrbit] Database Connection Error: ${error.message}`);
        process.exit(1); // Exit process with failure
    }
};

module.exports = connectDB;