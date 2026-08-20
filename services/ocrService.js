const fs = require('fs');
const Tesseract = require('tesseract.js');
const pdf = require('pdf-parse');

/**
 * Extracts raw digital text if available as a quick fallback.
 */
const extractTextFromFile = async (filePath, mimeType) => {
    try {
        if (mimeType === 'application/pdf') {
            const dataBuffer = fs.readFileSync(filePath);
            const pdfData = await pdf(dataBuffer);
            return pdfData.text || '';
        } else if (mimeType.startsWith('image/')) {
            const result = await Tesseract.recognize(filePath, 'eng');
            return result.data.text || '';
        }
        return '';
    } catch (error) {
        console.warn('[HealthOrbit OCR] Local text pass warning:', error.message);
        return '';
    }
};

module.exports = {
    extractTextFromFile
};