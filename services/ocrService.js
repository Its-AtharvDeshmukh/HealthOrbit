const fs = require('fs');
const Tesseract = require('tesseract.js');
let PDFParse;
try {
    PDFParse = require('pdf-parse').PDFParse; // V2 syntax
} catch (e) {
    PDFParse = require('pdf-parse'); // V1 fallback
}

const extractTextFromFile = async (filePath, mimeType) => {
    try {
        if (mimeType === 'application/pdf') {
            const dataBuffer = fs.readFileSync(filePath);
            if (typeof PDFParse === 'function' && !PDFParse.prototype) {
                const data = await PDFParse(dataBuffer);
                return data.text || '';
            } else {
                const parser = new PDFParse({ data: dataBuffer });
                const result = await parser.getText();
                return result.text || '';
            }
        } else if (mimeType.startsWith('image/')) {
            const result = await Tesseract.recognize(filePath, 'eng');
            return result.data.text || '';
        }
        return '';
    } catch (error) {
        console.warn('[HealthOrbit OCR] Text pass failed:', error.message);
        return '';
    }
};

module.exports = { extractTextFromFile };