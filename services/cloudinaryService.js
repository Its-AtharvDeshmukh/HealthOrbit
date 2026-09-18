const cloudinary = require('cloudinary').v2;
const fs = require('fs');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadToCloudinary = async (localFilePath, folderName = 'healthorbit_reports') => {
    try {
        // Use 'auto' and specify public upload type to prevent 401 ACL deny errors
        const result = await cloudinary.uploader.upload(localFilePath, {
            folder: folderName,
            resource_type: 'auto',
            type: 'upload'
        });

        return {
            url: result.secure_url,
            publicId: result.public_id
        };
    } catch (error) {
        console.error('[Cloudinary Upload Error Details]:', error);
        throw new Error('Failed to upload file to cloud storage: ' + error.message);
    }
};

const deleteFromCloudinary = async (publicId) => {
    try {
        if (!publicId) return;
        await cloudinary.uploader.destroy(publicId);
    } catch (error) {
        console.error('[Cloudinary Deletion Error]:', error.message);
    }
};

module.exports = { uploadToCloudinary, deleteFromCloudinary };