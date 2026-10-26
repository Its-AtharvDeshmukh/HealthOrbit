// public/js/bodyTwin/bodyTwinUI.js
document.addEventListener("DOMContentLoaded", () => {
    // Core State
    const state = {
        memberId: "demo-self",
        mode: "map", // 'map', 'progress', 'growth'
        currentTimelineIndex: 0,
        timelineKeys: [],
        isPlaying: false
    };

    // DOM Elements
    const els = {
        familyRail: document.getElementById('bt-family-rail'),
        identitySubtitle: document.getElementById('bt-identity-subtitle'),
        canvasPlaceholder: document.getElementById('bt-canvas-text'),
        modeSwitch: document.getElementById('bt-mode-switch'),
        btnMapMode: document.getElementById('btnMapMode'),
        btnProgressMode: document.getElementById('btnProgressMode'),
        privacyOverlay: document.getElementById('bt-privacy-overlay'),
        timelineDock: document.getElementById('bt-timeline-dock'),
        timeSlider: document.getElementById('ho-time-slider'),
        dateDisplay: document.getElementById('ho-current-date-display'),
        detailsPanel: document.getElementById('bt-details-panel'),
        layersBtn: document.getElementById('btnToggleLayers'),
        layersMenu: document.getElementById('layersMenu')
    };

    // Initialize
    function init() {
        renderFamilyRail();
        loadMember(state.memberId);
        
        // Listeners
        els.btnMapMode.addEventListener('click', () => setMode('map'));
        els.btnProgressMode.addEventListener('click', () => {
            const member = BodyTwinDataService.getMemberById(state.memberId);
            setMode(member.model === 'child' ? 'growth' : 'progress');
        });
        
        els.timeSlider.addEventListener('input', (e) => {
            state.currentTimelineIndex = parseInt(e.target.value);
            updateTimelineView();
        });

        els.layersBtn.addEventListener('click', () => els.layersMenu.classList.toggle('show'));
    }

    // Render Family Rail
    function renderFamilyRail() {
        const members = BodyTwinDataService.getFamilyMembers();
        els.familyRail.innerHTML = members.map(m => `
            <div class="bt-fam-card ${m.id === state.memberId ? 'active' : ''}" data-id="${m.id}">
                <div class="bt-fam-av">${m.name.charAt(0)}</div>
                <div class="bt-fam-info">
                    <strong>${m.name}</strong>
                    <span>${m.relationship} ${m.access !== 'full' ? '· '+m.access : ''}</span>
                </div>
            </div>
        `).join('');

        els.familyRail.querySelectorAll('.bt-fam-card').forEach(card => {
            card.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                if(id !== state.memberId) loadMember(id);
            });
        });
    }

    // Load Member State
    function loadMember(id) {
        state.memberId = id;
        const member = BodyTwinDataService.getMemberById(id);
        
        // Update UI
        renderFamilyRail();
        els.identitySubtitle.textContent = `${member.name} • ${member.relationship === 'Self' ? 'My Body' : 'Shared with you'}`;
        els.detailsPanel.classList.remove('open'); // Close drawer

        // Handle Privacy
        if (member.access === 'limited') {
            els.privacyOverlay.style.display = 'flex';
            els.privacyOverlay.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                <h3>Limited Access</h3>
                <p>Body Twin health information has not been shared with you by this family member.</p>
                <button class="d-btn">View Permissions</button>
            `;
            els.modeSwitch.style.display = 'none';
            els.timelineDock.style.display = 'none';
            els.canvasPlaceholder.textContent = `[ SECURE STATE: MODEL HIDDEN ]`;
            return;
        }

        // Full Access Setup
        els.privacyOverlay.style.display = 'none';
        els.modeSwitch.style.display = 'flex';
        els.timelineDock.style.display = 'flex';
        
        // Mode Setup
        els.btnProgressMode.textContent = member.model === 'child' ? 'Growth Journey' : 'Body Progress';
        setMode('map');

        // Timeline Setup
        state.timelineKeys = BodyTwinDataService.getTimeline(id);
        if(state.timelineKeys.length > 0) {
            els.timeSlider.max = state.timelineKeys.length - 1;
            els.timeSlider.value = state.timelineKeys.length - 1; // Default to latest
            state.currentTimelineIndex = state.timelineKeys.length - 1;
            updateTimelineView();
        } else {
            els.dateDisplay.textContent = 'No Data';
            els.canvasPlaceholder.innerHTML = `<br>No body-linked health records yet.<br>HealthOrbit will build this view over time.`;
        }
    }

    function setMode(mode) {
        state.mode = mode;
        els.btnMapMode.classList.toggle('active', mode === 'map');
        els.btnProgressMode.classList.toggle('active', mode !== 'map');
        els.detailsPanel.classList.remove('open');
        updateTimelineView();
    }

    function updateTimelineView() {
        if(state.timelineKeys.length === 0) return;
        const currentDate = state.timelineKeys[state.currentTimelineIndex];
        els.dateDisplay.textContent = currentDate;

        if (state.mode === 'map') {
            const markers = BodyTwinDataService.getMarkersForDate(state.memberId, currentDate);
            const member = BodyTwinDataService.getMemberById(state.memberId);
            
            if(markers.length > 0) {
                els.canvasPlaceholder.innerHTML = `[ 3D ${member.model.toUpperCase()} MODEL RENDERED ]<br><br><span style="color:var(--d-${markers[0].color}); cursor:pointer; text-decoration:underline;" onclick="window.triggerMockDetail()">Simulate Marker Click -> ${markers[0].region}</span>`;
            } else {
                els.canvasPlaceholder.innerHTML = `[ 3D ${member.model.toUpperCase()} MODEL RENDERED ]<br>No markers for this period.`;
            }
        } else {
            const prog = BodyTwinDataService.getProgress(state.memberId);
            const val = prog.history[currentDate] || 'No reading';
            els.canvasPlaceholder.innerHTML = `[ 3D ${state.mode === 'growth' ? 'CHILD' : 'ADULT'} MORPH TARGET ACTIVE ]<br>Measurement: ${val}<br>Target: ${prog.target || 'N/A'}`;
        }
    }

    // Global mock trigger for Phase 1 demo
    window.triggerMockDetail = function() {
        const currentDate = state.timelineKeys[state.currentTimelineIndex];
        const marker = BodyTwinDataService.getMarkersForDate(state.memberId, currentDate)[0];
        if(!marker) return;

        els.detailsPanel.innerHTML = `
            <button class="close-btn" onclick="document.getElementById('bt-details-panel').classList.remove('open')">&times;</button>
            <h2 class="bt-region-title">${marker.region.replace('_', ' ')}</h2>
            <div class="bt-event-card ${marker.color}">
                <strong>${marker.title}</strong>
                <span class="bt-event-meta">${marker.date}</span>
                <span class="bt-event-source">${marker.source}</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:0.6rem; margin-top:1rem;">
                <button class="d-btn" style="justify-content:center;">View Record</button>
                <button class="d-btn" style="background:var(--d-card); color:var(--d-teal-950); border:1px solid var(--d-edge); justify-content:center;">Why highlighted?</button>
            </div>
        `;
        els.detailsPanel.classList.add('open');
    };

    init();
});