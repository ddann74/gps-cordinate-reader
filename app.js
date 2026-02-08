const video = document.getElementById('webcam');
const status = document.getElementById('status-bar');
const debugCanvas = document.getElementById('debug-canvas');
const coordsTxt = document.getElementById('coords');
const dlBtn = document.getElementById('dlBtn');
const thumbButton = document.getElementById('manualBtn');
const rawDebug = document.getElementById('raw-debug');

let map, marker, worker;
let log = [];
let lastResultText = ""; 
let isBusy = false;

async function init() {
    map = L.map('map', { zoomControl: false }).setView([-25.27, 133.77], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    marker = L.marker([-25.27, 133.77]).addTo(map);

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment", width: { ideal: 1280 } } 
        });
        video.srcObject = stream;
    } catch (e) {
        status.innerText = "SYSTEM: CAMERA ERROR";
    }

    status.innerText = "SYSTEM: LOADING AI...";
    worker = await Tesseract.createWorker();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    // Removed char whitelist to let the AI "feel" the text better, then we filter manually
    status.innerText = "SYSTEM: HIGH-SENSITIVITY MODE";
    
    scanLoop();
}

// THE NEW FUZZY FINDER
function findCoordinates(text) {
    // 1. Clean the text: remove everything except numbers, dots, dashes, and spaces
    const clean = text.replace(/[^0-9.\-\s]/g, ' ');
    // 2. Split into chunks
    const parts = clean.split(/\s+/).filter(p => p.length > 3);
    
    if (parts.length >= 2) {
        let lat = parts[0];
        let lng = parts[1];

        // 3. FUZZY FIX: If the AI missed the dot (e.g., "338568" -> "33.8568")
        if (!lat.includes('.') && lat.length > 4) lat = lat.slice(0, 3) + "." + lat.slice(3);
        if (!lng.includes('.') && lng.length > 4) lng = lng.slice(0, 3) + "." + lng.slice(3);

        return [parseFloat(lat), parseFloat(lng)];
    }
    return null;
}

async function scanLoop() {
    if (video.readyState === video.HAVE_ENOUGH_DATA && !isBusy) {
        isBusy = true;
        const ctx = debugCanvas.getContext('2d');
        const scale = video.videoWidth / video.clientWidth;
        const sw = 280 * scale;
        const sh = 60 * scale;
        const sx = (video.videoWidth - sw) / 2;
        const sy = (video.videoHeight - sh) / 2;

        debugCanvas.width = sw;
        debugCanvas.height = sh;
        
        // Massive contrast boost for shaky/blurry video
        ctx.filter = 'contrast(250%) grayscale(100%) brightness(150%)';
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

        const { data: { text } } = await worker.recognize(debugCanvas);
        lastResultText = text.trim();
        rawDebug.innerText = "AI SEEING: " + lastResultText;

        // Auto-lock only if it's very clear
        const coords = findCoordinates(lastResultText);
        if (coords && lastResultText.includes('.')) { 
            // In auto-mode, we still want a decimal to be safe
            triggerLock(coords[0], coords[1], "AUTO");
        }
        
        isBusy = false;
    }
    setTimeout(scanLoop, 100); // Faster scan cycle
}

function triggerLock(lat, lng, source) {
    if (isNaN(lat) || isNaN(lng)) return;
    if (navigator.vibrate) navigator.vibrate(50);

    map.setView([lat, lng], 14);
    marker.setLatLng([lat, lng]);
    coordsTxt.innerText = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    
    log.push({ time: new Date().toLocaleTimeString(), lat, lng });
    dlBtn.innerText = `SAVE CSV (${log.length})`;

    coordsTxt.style.background = "#00ff00";
    coordsTxt.style.color = "#000";
    setTimeout(() => { 
        coordsTxt.style.background = "transparent";
        coordsTxt.style.color = "#00ff00";
    }, 500);
}

// MANUAL OVERRIDE (ZERO STABILITY REQUIRED)
thumbButton.addEventListener('click', (e) => {
    e.preventDefault();
    const coords = findCoordinates(lastResultText);
    if (coords) {
        triggerLock(coords[0], coords[1], "MANUAL");
    } else {
        alert("STABILIZATION FAILED\n\nAI saw: " + lastResultText + "\n\nTry to get the numbers inside the box.");
    }
});

dlBtn.onclick = () => {
    if (log.length === 0) return;
    let csv = "Time,Lat,Lng\n" + log.map(i => `${i.time},${i.lat},${i.lng}`).join("\n");
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = "gps_log.csv"; a.click();
};

init();
