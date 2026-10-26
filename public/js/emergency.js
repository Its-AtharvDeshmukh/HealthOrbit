let map;
let userMarker;
let markers = [];
let userLat = 19.0760; // Fallback Latitude (Mumbai)
let userLng = 72.8777; // Fallback Longitude

function initEmergencyMap() {
    // Initialize map on element with ID 'map-container'
    map = L.map('map-container').setView([userLat, userLng], 14);

    // Load free OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    // Acquire live geolocation
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                userLat = position.coords.latitude;
                userLng = position.coords.longitude;

                map.setView([userLat, userLng], 14);

                if (userMarker) map.removeLayer(userMarker);
                userMarker = L.marker([userLat, userLng])
                    .addTo(map)
                    .bindPopup('<b>Your Live Location</b>')
                    .openPopup();

                fetchNearbyEmergencyPlaces('all');
            },
            (error) => {
                console.warn('Geolocation blocked or unavailable. Falling back to default coordinates.');
                fetchNearbyEmergencyPlaces('all');
            },
            { timeout: 5000 }
        );
    } else {
        fetchNearbyEmergencyPlaces('all');
    }
}

function clearMapAndList() {
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
    const listContainer = document.getElementById('emergency-list');
    if (listContainer) listContainer.innerHTML = '';
}

function fetchNearbyEmergencyPlaces(type) {
    clearMapAndList();

    let queryFilter = '';

    if (type === 'hospital') {
        queryFilter = `node["amenity"="hospital"](around:5000, ${userLat}, ${userLng});`;
    } else if (type === 'blood_bank') {
        queryFilter = `
            node["amenity"="blood_bank"](around:5000, ${userLat}, ${userLng});
            node["healthcare"="blood_bank"](around:5000, ${userLat}, ${userLng});
        `;
    } else {
        queryFilter = `
            node["amenity"="hospital"](around:5000, ${userLat}, ${userLng});
            node["amenity"="blood_bank"](around:5000, ${userLat}, ${userLng});
            node["healthcare"="blood_bank"](around:5000, ${userLat}, ${userLng});
            node["amenity"="clinic"](around:5000, ${userLat}, ${userLng});
        `;
    }

    const overpassUrl = 'https://overpass-api.de/api/interpreter?data=' + 
        encodeURIComponent(`[out:json];(${queryFilter});out body;`);

    fetch(overpassUrl)
        .then(response => response.json())
        .then(data => {
            const listContainer = document.getElementById('emergency-list');

            if (!data.elements || data.elements.length === 0) {
                if (listContainer) {
                    listContainer.innerHTML = '<p class="no-results">No facilities found within 5 km.</p>';
                }
                return;
            }

            data.elements.forEach(place => {
                const lat = place.lat;
                const lon = place.lon;

                const isBloodBank = place.tags.amenity === 'blood_bank' || place.tags.healthcare === 'blood_bank';
                const category = isBloodBank ? 'Blood Bank' : (place.tags.amenity === 'hospital' ? 'Hospital' : 'Clinic');
                const placeName = place.tags.name || category;

                // Pinpoint marker
                const marker = L.marker([lat, lon]).addTo(map);
                marker.bindPopup(`
                    <b>${placeName}</b><br>
                    Type: ${category}<br>
                    <a href="https://www.google.com/maps/search/?api=1&query=${lat},${lon}" target="_blank">View on Google Maps</a>
                `);
                markers.push(marker);

                // Scrollable link card below map
                if (listContainer) {
                    const itemCard = document.createElement('div');
                    itemCard.className = 'emergency-card';
                    itemCard.innerHTML = `
                        <div class="card-info">
                            <h3>${placeName}</h3>
                            <span class="category-tag ${isBloodBank ? 'tag-blood' : 'tag-hospital'}">${category}</span>
                        </div>
                        <div class="card-actions">
                            <a href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}" 
                               target="_blank" 
                               class="btn-directions">
                                Get Directions 📍
                            </a>
                        </div>
                    `;

                    itemCard.addEventListener('click', (e) => {
                        if (e.target.tagName !== 'A') {
                            map.setView([lat, lon], 16);
                            marker.openPopup();
                        }
                    });

                    listContainer.appendChild(itemCard);
                }
            });
        })
        .catch(err => console.error('Error loading locations:', err));
}

window.filterPlaces = function(type) {
    fetchNearbyEmergencyPlaces(type);
};

window.addEventListener('DOMContentLoaded', initEmergencyMap);