// public/js/bodyTwin/bodyTwinDataService.js
const BodyTwinDataService = {
    getFamilyMembers: () => window.BodyTwinMockDB.members,
    getMemberById: (id) => window.BodyTwinMockDB.members.find(m => m.id === id),
    getTimeline: (memberId) => window.BodyTwinMockDB.timelines[memberId] || [],
    getMarkersForDate: (memberId, dateId) => {
        const markers = window.BodyTwinMockDB.markers[memberId] || [];
        return markers.filter(m => m.dateId === dateId);
    },
    getProgress: (memberId) => window.BodyTwinMockDB.progress[memberId] || null
};

window.BodyTwinDataService = BodyTwinDataService;