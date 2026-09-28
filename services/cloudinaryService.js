const cloudinary = require('cloudinary').v2;
const fs = require('fs');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    timeout: 120000 // 2 minutes
});

const uploadToCloudinary = async (localFilePath, folderName = 'healthorbit_medical_vault') => {
    try {
        if (!fs.existsSync(localFilePath)) {
            return null;
        }

        const stats = fs.statSync(localFilePath);
        const isPdf = localFilePath.toLowerCase().endsWith('.pdf');
        
        // Files > 9.5MB or PDFs MUST be 'raw' to avoid Cloudinary's 10MB image limit
        const resourceType = (stats.size > 9500000 || isPdf) ? 'raw' : 'auto';

        const result = await cloudinary.uploader.upload(localFilePath, {
            folder: folderName,
            resource_type: resourceType,
            type: 'upload',
            timeout: 90000
        });

        return {
            url: result.secure_url,
            publicId: result.public_id,
            resourceType: resourceType
        };
    } catch (error) {
        console.warn('[Cloudinary Upload Warning]:', error.message || error);
        return null;
    }
};

const deleteFromCloudinary = async (publicId, resourceType = 'auto') => {
    try {
        if (!publicId) return;
        await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    } catch (error) {
        console.warn('[Cloudinary Deletion Warning]:', error.message);
    }
};

module.exports = { uploadToCloudinary, deleteFromCloudinary };