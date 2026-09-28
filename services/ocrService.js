const fs = require('fs');
const Tesseract = require('tesseract.js');
let PDFParse;
try {
    PDFParse = require('pdf-parse').PDFParse;
} catch (e) {
    try {
        PDFParse = require('pdf-parse');
    } catch (_) {
        PDFParse = null;
    }
}

/**
 * Normalizes raw OCR text lines, collapsing multi-space columns and fixing broken line breaks
 */
const cleanRawText = (text) => {
    if (!text || typeof text !== 'string') return '';
    return text
        .replace(/\r\n/g, '\n')
        .replace(/\t/g, '   ') // Normalize tabs into distinct column spaces
        .replace(/[^\x20-\x7E\n]/g, ' ') // Strip unreadable binary/OCR artifacts
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n');
};

const extractTextFromFile = async (filePath, mimeType) => {
    try {
        if (!fs.existsSync(filePath)) {
            console.warn('[HealthOrbit OCR] File not found:', filePath);
            return '';
        }

        let extractedText = '';

        // 1. Digital PDF extraction pass
        if (mimeType === 'application/pdf' || filePath.toLowerCase().endsWith('.pdf')) {
            if (PDFParse) {
                try {
                    const dataBuffer = fs.readFileSync(filePath);
                    if (typeof PDFParse === 'function' && !PDFParse.prototype) {
                        const data = await PDFParse(dataBuffer);
                        extractedText = data.text || '';
                    } else {
                        const parser = new PDFParse({ data: dataBuffer });
                        const result = await parser.getText();
                        extractedText = result.text || '';
                    }
                } catch (pdfErr) {
                    console.warn('[HealthOrbit OCR] PDF parse error:', pdfErr.message);
                }
            }

            // 2. Scanned PDF fallback: If text stream is weak or empty, run Tesseract image pass
            if (!extractedText || extractedText.trim().length < 150) {
                console.log('[HealthOrbit OCR] Low text stream detected. Running Tesseract visual pass...');
                try {
                    const { data } = await Tesseract.recognize(filePath, 'eng', {
                        logger: () => {}
                    });
                    if (data && data.text) {
                        extractedText = data.text;
                    }
                } catch (tessErr) {
                    console.warn('[HealthOrbit OCR] Tesseract fallback pass warning:', tessErr.message);
                }
            }

            return cleanRawText(extractedText);
        }

        // 3. Image formats (PNG, JPG, JPEG, WEBP)
        if (mimeType.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(filePath)) {
            const { data } = await Tesseract.recognize(filePath, 'eng', {
                logger: () => {}
            });
            return cleanRawText(data?.text || '');
        }

        return '';
    } catch (error) {
        console.warn('[HealthOrbit OCR] Extraction pass error:', error.message);
        return '';
    }
};

module.exports = { extractTextFromFile, cleanRawText };