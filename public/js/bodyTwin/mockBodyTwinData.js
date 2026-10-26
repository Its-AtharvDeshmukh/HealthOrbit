// public/js/bodyTwin/mockBodyTwinData.js
const mockBodyTwinData = {
    members: [
        { id: "demo-self", name: "Atharv", relationship: "Self", access: "full", model: "adult" },
        { id: "demo-mother", name: "Demo Mother", relationship: "Mother", access: "shared", model: "adult-female" },
        { id: "demo-child", name: "Demo Child", relationship: "Child", access: "shared", model: "child" },
        { id: "demo-father", name: "Demo Father", relationship: "Father", access: "limited", model: "adult" }
    ],
    markers: {
        "demo-self": [
            { 
                dateId: "2026-06", region: "LEFT_FOREARM", state: "current", color: "coral",
                title: "Distal radius fracture", date: "12 Jun 2026", source: "X-Ray Report"
            },
            { 
                dateId: "2026-07", region: "LEFT_FOREARM", state: "follow-up", color: "amber",
                title: "Orthopedic Follow-up", date: "08 Jul 2026", source: "Clinical Visit"
            },
            { 
                dateId: "2026-09", region: "LEFT_FOREARM", state: "historical", color: "blue",
                title: "Physical Therapy Assessment", date: "15 Sep 2026", source: "Measurement"
            }
        ],
        "demo-mother": [
            {
                dateId: "2026-08", region: "CHEST", state: "measurement", color: "cyan",
                title: "Echocardiogram Routine", date: "10 Aug 2026", source: "Medical Report"
            }
        ],
        "demo-child": [
            {
                dateId: "2026-09", region: "RIGHT_LOWER_LEG", state: "current", color: "coral",
                title: "Sports Injury Assessment", date: "02 Sep 2026", source: "Clinical Visit"
            }
        ]
    },
    progress: {
        "demo-self": { type: "weight", target: 72, history: { "2026-01": 82, "2026-03": 79, "2026-06": 76, "2026-09": 74 } },
        "demo-child": { type: "growth", history: { "2024": "110cm", "2025": "115cm", "2026-09": "122cm" } }
    },
    timelines: {
        "demo-self": ["2026-01", "2026-03", "2026-05", "2026-06", "2026-07", "2026-09"],
        "demo-mother": ["2026-01", "2026-05", "2026-08", "2026-09"],
        "demo-child": ["2024", "2025", "2026-01", "2026-09"]
    }
};

window.BodyTwinMockDB = mockBodyTwinData;