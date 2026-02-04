const video = document.getElementById('webcam');
const overlay = document.getElementById('overlay');
let map, marker;

// 1. Initialize the Map
function initMap() {
    map = L.map('map').setView([0, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    marker = L.marker([0, 0]).addTo(map);
}

// 2. Start Camera
async function setupCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "environment" }, // Uses back camera
        audio: false 
    });
    video.srcObject = stream;
}

// 3. OCR Processing
async function scanCoordinates() {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);

    // Recognize text from the current frame
    const result = await Tesseract.recognize(canvas, 'eng');
    const text = result.data.text;

    // Regex to find: Lat, Long (e.g., 34.0522, -118.2437)
    const gpsMatch = text.match(/([-+]?\d{1,3}\.\d+)\s*,\s*([-+]?\d{1,3}\.\d+)/);

    if (gpsMatch) {
        const lat = parseFloat(gpsMatch[1]);
        const lng = parseFloat(gpsMatch[2]);
        
        overlay.innerText = `Found: ${lat}, ${lng}`;
        map.setView([lat, lng], 13);
        marker.setLatLng([lat, lng]);
    }
    
    // Repeat scanning every 2 seconds to save battery
    setTimeout(scanCoordinates, 2000);
}

initMap();
setupCamera().then(() => {
    video.onloadedmetadata = () => scanCoordinates();
});
