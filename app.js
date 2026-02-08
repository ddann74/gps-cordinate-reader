const video = document.getElementById('webcam');
const statusText = document.getElementById('status');
const stabilityBar = document.getElementById('stability-bar');
const downloadBtn = document.getElementById('downloadBtn');
const coordDisplay = document.getElementById('current-coord');

let map, marker;
let coordHistory = [];
let stabilityCounter = 0;
let lastDetectedRaw = "";

// 1. Initialize Map
function initMap() {
    map = L.map('map', { zoomControl: false }).setView([0, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    marker = L.marker([0, 0]).addTo(map);
}

// 2. Camera Setup
async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } } 
        });
        video.srcObject = stream;
    } catch (err) {
        statusText.innerText = "Camera Error: " + err.message;
    }
}

// 3. Process Frames (Cropped for TV Screens)
async function scan() {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Define crop area (The Focus Box)
        // We crop the middle 40% width and 20% height
        const sw = video.videoWidth * 0.4;
        const sh = video.videoHeight * 0.2;
        const sx = (video.videoWidth - sw) / 2;
        const sy = (video.videoHeight - sh) / 2;

        canvas.width = sw;
        canvas.height = sh;
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

        // OCR Recognition
        const { data: { text } } = await Tesseract.recognize(canvas, 'eng');
        processText(text);
    }
    setTimeout(scan, 1000); // Scan once per second
}

// 4. Data Stabilization Logic
function processText(rawText) {
    // Regex for Lat, Long: e.g. 45.1234, -122.5678
    const match = rawText.match(/([-+]?\d{1,3}\.\d+)\s*,\s*([-+]?\d{1,3}\.\d+)/);

    if (match) {
        const currentRaw = match[0];
        
        if (currentRaw === lastDetectedRaw) {
            stabilityCounter = Math.min(stabilityCounter + 34, 100); // Fills bar in 3 matching frames
        } else {
            stabilityCounter = 0;
            lastDetectedRaw = currentRaw;
        }

        stabilityBar.style.width = stabilityCounter + "%";

        if (stabilityCounter >= 100) {
            const lat = parseFloat(match[1]);
            const lng = parseFloat(match[2]);
            updateRecord(lat, lng);
        }
    } else {
        stabilityCounter = Math.max(0, stabilityCounter - 10);
        stabilityBar.style.width = stabilityCounter + "%";
    }
}

function updateRecord(lat, lng) {
    const latLng = [lat, lng];
    map.setView(latLng, 15);
    marker.setLatLng(latLng);
    coordDisplay.innerText = `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`;

    // Save unique coordinates to history
    const exists = coordHistory.some(c => c.lat === lat && c.lng === lng);
    if (!exists) {
        coordHistory.push({ time: new Date().toLocaleTimeString(), lat, lng });
        downloadBtn.innerText = `Export CSV (${coordHistory.length})`;
    }
}

// 5. CSV Export
downloadBtn.onclick = () => {
    if (coordHistory.length === 0) return;
    const csvContent = "data:text/csv;charset=utf-8,Time,Latitude,Longitude\n" 
        + coordHistory.map(e => `${e.time},${e.lat},${e.lng}`).join("\n");
    const link = document.createElement("a");
    link.href = encodeURI(csvContent);
    link.download = "dashcam_trip_data.csv";
    link.click();
};

// Start App
initMap();
startCamera().then(() => scan());
