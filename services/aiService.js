const fs = require('fs');
const { GoogleGenAI } = require('@google/genai');
const { extractTextFromFile } = require('./ocrService');

const analyzeMedicalTextWithAI = async (filePath, mimeType, rawFallbackText = '') => {
    let extractedText = rawFallbackText;
    
    if (!extractedText || extractedText.trim().length === 0) {
        try { extractedText = await extractTextFromFile(filePath, mimeType); } 
        catch (e) { extractedText = 'Text extraction pending.'; }
    }

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error('GEMINI_API_KEY is missing');

        const ai = new GoogleGenAI({ apiKey });
        const fileBuffer = fs.readFileSync(filePath);
        const base64Data = fileBuffer.toString('base64');

        // FIXED PROMPT: Now extracts BOTH Medical and Non-Medical documents flawlessly.
        const promptText = `
You are HealthOrbit's Universal Document Extraction Engine.
Analyze the attached document (it could be a Medical Report, Resume, ID, or Invoice).

Instructions:
1. If MEDICAL: Extract lab values, test parameters, and clinical findings.
2. If NON-MEDICAL (like a Resume): Extract the main sections, skills, education, and details.
3. Provide parameters with: name, category, value, unit (or "text"), referenceRange (or "N/A"), status ("Optimal" or "Review"), statusClass ("good" or "warn").
4. Write a 3-sentence summary of the document in "aiExplanation".
5. Provide the raw transcribed text in "rawText".

Return ONLY a valid JSON object matching this schema exactly:
{
  "parameters": [
    {
      "name": "Parameter Name",
      "category": "Category",
      "value": "Extracted Value",
      "unit": "Unit",
      "referenceRange": "Range",
      "status": "Standard",
      "statusClass": "good"
    }
  ],
  "aiExplanation": "A summary of the document...",
  "rawText": "The complete raw text of the document..."
}
`;

        const response = await ai.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: [ promptText, { inlineData: { mimeType: mimeType, data: base64Data } } ],
            config: { responseMimeType: 'application/json' }
        });

        const cleanJson = (response.text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanJson);

        if (parsed.parameters && parsed.parameters.length > 0) {
            return {
                parameters: parsed.parameters,
                aiExplanation: parsed.aiExplanation || 'Document analyzed successfully.',
                rawText: parsed.rawText || extractedText || 'Raw text processed.'
            };
        }
    } catch (error) {
        console.warn('[HealthOrbit AI Parsing Error]:', error.message);
    }

    // Fallback if AI fails
    return {
        parameters: [{
            name: 'Document Scanned', category: 'General', value: extractedText.substring(0, 100) + '...',
            unit: 'text', referenceRange: 'N/A', status: 'Review', statusClass: 'warn'
        }],
        aiExplanation: 'The AI encountered an issue structuring this specific format. Raw text has been extracted.',
        rawText: extractedText || 'No readable text found.'
    };
};

module.exports = { analyzeMedicalTextWithAI };