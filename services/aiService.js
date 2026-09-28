const fs = require('fs');
const { GoogleGenAI } = require('@google/genai');
const { extractTextFromFile } = require('./ocrService');

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const withTimeout = (promise, ms = 8500) => {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('AI Request Timeout')), ms))
    ]);
};

const sanitizeJson = (raw) => {
    if (!raw || typeof raw !== 'string') return null;
    try {
        const clean = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
        return JSON.parse(clean);
    } catch (e) {
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) {
            try { return JSON.parse(match[0]); } catch (_) {}
        }
        return null;
    }
};

const EXTRACTION_INSTRUCTION = `You are HealthOrbit's Universal Medical Document Intelligence Engine.
Extract all clinical test parameters, observed numerical/text values, measurement units, and printed reference ranges from the provided medical document.

CRITICAL FIELD MAPPING DIRECTIVE:
You must output a JSON object where "parameters" is an array of objects. EACH object MUST use these EXACT property names:
- "name": Clean name of the test (e.g. "SGOT (AST)", "SGPT (ALT)", "Total Bilirubin", "Hemoglobin")
- "category": Clinical category (e.g. "Liver Function Test", "Complete Blood Count", "Lipid Profile", "General")
- "value": The numerical or observation result as a STRING (e.g. "55.59", "75.34", "112.07", "Positive")
- "unit": The measurement unit (e.g. "U/L", "mg/dL", "g/dL", "%", ""). If not printed, output ""
- "referenceRange": The biological reference range as printed (e.g. "10-50", "0-115", "0.2-1", "N/A")
- "status": Evaluate against reference range: "High" if above, "Low" if below, "Standard" if within normal limits
- "statusClass": "warn" if High or Low; "good" if Standard

Also extract:
- "documentType": "lab_report"
- "documentTitle": Exact title of panel (e.g. "Liver Function Test (LFT)")
- "recordedAt": Observation/collection date in YYYY-MM-DD format if found
- "aiExplanation": A clear, friendly 40-70 word summary explaining what the tests measure and neutrally pointing out out-of-range values. Do NOT diagnose disease.

Return ONLY the JSON matching this exact structure:
{
  "documentType": "lab_report",
  "documentTitle": "Liver Function Test (LFT)",
  "recordedAt": "2026-09-09",
  "parameters": [
    {
      "name": "SGOT (AST)",
      "category": "Liver Function",
      "value": "55.59",
      "unit": "U/L",
      "referenceRange": "10-50",
      "status": "High",
      "statusClass": "warn"
    }
  ],
  "aiExplanation": "Summary text here..."
}`;

/**
 * Secondary Provider: Mesh API (High-precision text parsing via GPT-4o-mini)
 */
const extractStructuredWithMesh = async (rawText) => {
    const apiKey = process.env.MESH_API_KEY;
    const baseUrl = process.env.MESH_BASE_URL || 'https://api.meshapi.ai/v1/chat/completions';
    const model = process.env.FALLBACK_DOCUMENT_MODEL || 'openai/gpt-4o-mini';

    if (!apiKey) throw new Error('MESH_API_KEY is missing.');

    const prompt = `${EXTRACTION_INSTRUCTION}

<medical_record_text>
${rawText.substring(0, 32000)}
</medical_record_text>`;

    const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: model,
            messages: [
                { role: 'system', content: 'You extract clinical lab test findings and return only verified JSON matching the exact schema.' },
                { role: 'user', content: prompt }
            ],
            response_format: { type: 'json_object' }
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Mesh error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    return sanitizeJson(data.choices?.[0]?.message?.content);
};

/**
 * Primary Provider: Direct Gemini Vision API (gemini-3.8-flash)
 */
const extractStructuredWithGemini = async (filePath, mimeType) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is missing');

    const ai = new GoogleGenAI({ apiKey });
    const modelName = process.env.PRIMARY_DOCUMENT_MODEL || 'gemini-3.8-flash';
    const fileBuffer = fs.readFileSync(filePath);
    const base64Data = fileBuffer.toString('base64');

    const execution = ai.models.generateContent({
        model: modelName,
        contents: [
            EXTRACTION_INSTRUCTION,
            { inlineData: { mimeType, data: base64Data } }
        ],
        config: { responseMimeType: 'application/json' }
    });

    const response = await withTimeout(execution, 8500);
    return sanitizeJson(response.text);
};

/**
 * Universal Failover Orchestrator with Schema Normalization
 */
const analyzeMedicalTextWithAI = async (filePath, mimeType, rawFallbackText = '') => {
    let rawText = rawFallbackText;
    if (!rawText || rawText.trim().length === 0) {
        try {
            rawText = await extractTextFromFile(filePath, mimeType);
        } catch (_) {
            rawText = '';
        }
    }

    let parsedResult = null;
    let providerUsed = 'none';
    const startTime = Date.now();

    // 1. PRIMARY: Gemini direct
    try {
        parsedResult = await extractStructuredWithGemini(filePath, mimeType);
        if (parsedResult && Array.isArray(parsedResult.parameters) && parsedResult.parameters.length > 0) {
            providerUsed = 'gemini';
        } else {
            parsedResult = null;
        }
    } catch (primaryErr) {
        console.warn(`[DocIntel] Primary provider failed: ${primaryErr.message}. Switching to Mesh...`);
    }

    // 2. FALLBACK: Mesh API
    if (!parsedResult && rawText && rawText.trim().length > 10) {
        try {
            const meshStart = Date.now();
            parsedResult = await extractStructuredWithMesh(rawText);
            if (parsedResult && Array.isArray(parsedResult.parameters) && parsedResult.parameters.length > 0) {
                providerUsed = 'mesh';
                console.log(`[DocIntel] Mesh succeeded in ${Date.now() - meshStart}ms`);
            } else {
                parsedResult = null;
            }
        } catch (meshErr) {
            console.warn('[DocIntel] Mesh API error:', meshErr.message);
        }
    }

    const duration = Date.now() - startTime;

    // 3. DEFENSIVE PROPERTY NORMALIZATION
    // Normalizes alternative key names (testName, result, observation) to name and value
    if (parsedResult && typeof parsedResult === 'object') {
        const rawParams = Array.isArray(parsedResult.parameters) ? parsedResult.parameters : [];
        const normalizedParams = [];

        for (const item of rawParams) {
            if (!item || typeof item !== 'object') continue;

            const name = String(item.name || item.testName || item.test || item.parameter || '').trim();
            const value = String(item.value !== undefined ? item.value : (item.result || item.val || item.observation || '')).trim();
            const unit = String(item.unit || item.units || '').trim();
            const referenceRange = String(item.referenceRange || item.refRange || item.reference || 'N/A').trim();
            const status = String(item.status || 'Standard').trim();
            let statusClass = item.statusClass || (status.toLowerCase().includes('high') || status.toLowerCase().includes('low') ? 'warn' : 'good');

            // Skip empty rows and placeholder names
            if (name.length > 1 && value.length > 0 && !name.toLowerCase().includes('scan result')) {
                normalizedParams.push({
                    name,
                    category: item.category || 'Clinical',
                    value,
                    unit,
                    referenceRange,
                    status,
                    statusClass
                });
            }
        }

        console.log(`[DocIntel] Finished via ${providerUsed} in ${duration}ms. Populated ${normalizedParams.length} parameters.`);

        return {
            documentType: parsedResult.documentType || 'lab_report',
            documentTitle: parsedResult.documentTitle || 'Medical Report',
            recordedAt: parsedResult.recordedAt || null,
            parameters: normalizedParams,
            aiExplanation: parsedResult.aiExplanation || '',
            rawText: rawText || '',
            providerUsed
        };
    }

    return {
        documentType: 'lab_report',
        documentTitle: 'Medical Report',
        recordedAt: null,
        parameters: [],
        aiExplanation: rawText 
            ? 'Document text was extracted, but structured findings require manual review or retry.' 
            : 'Document text could not be extracted from this image.',
        rawText: rawText || '',
        providerUsed: 'none'
    };
};

/**
 * Conversational Assistant Gateway (Mesh API)
 */
const chatWithMeshAPI = async (userMessage, systemPromptContext = "", chatHistory = []) => {
    try {
        const apiKey = process.env.MESH_API_KEY;
        const baseUrl = process.env.MESH_BASE_URL || 'https://api.meshapi.ai/v1/chat/completions';
        const model = process.env.MESH_CHAT_MODEL || 'openai/gpt-4o-mini';

        if (!apiKey) throw new Error('MESH_API_KEY is missing');

        const systemPrompt = `You are HealthOrbit AI, a friendly, concise, and empathetic personal health assistant.

RESPONSE GUIDELINES:
1. Speak in a warm, conversational, helpful tone (like ChatGPT).
2. KEEP IT BRIEF: Maximum 2-3 short paragraphs or up to 5 clear bullet points. Avoid wall-of-text explanations.
3. Use Markdown bolding (**text**) for values and test names, and bullet points for lists.
4. Base your answers strictly on the user's verified health records.
5. NEVER provide a medical diagnosis or prescribe medicine dosages. Always advise reviewing clinical changes with their doctor.
${systemPromptContext}`;

        const messagesPayload = [
            { role: 'system', content: systemPrompt },
            ...chatHistory,
            { role: 'user', content: userMessage }
        ];

        const response = await fetch(baseUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model,
                messages: messagesPayload,
                temperature: 0.7,
                max_tokens: 450
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Mesh API error: ${response.status} - ${errText}`);
        }

        const data = await response.json();
        if (data.choices && data.choices.length > 0) {
            return data.choices[0].message.content;
        }
        throw new Error('Invalid response from Mesh API');
    } catch (error) {
        console.error('[HealthOrbit Mesh Chat Error]:', error.message);
        return "I'm having a brief issue reading that health record right now. Could you ask again in a moment?";
    }
};

module.exports = {
    analyzeMedicalTextWithAI,
    chatWithMeshAPI
};