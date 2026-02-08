const video = document.getElementById('webcam');
const status = document.getElementById('status-bar');
const debugCanvas = document.getElementById('debug-canvas');
const coordsTxt = document.getElementById('coords');
const dlBtn = document.getElementById('dlBtn');
const thumbButton = document.getElementById('manualBtn');
const rawDebug = document.getElementById('raw-debug');

let map, marker, worker;
let log = [];
let stability = 0;
let lastResultText = ""; 
let lastCleanPair = ""; 
let isBusy = false;

async function init() {
    // 1. Setup Map
    map = L.map('map', { zoomControl: false }).setView([-25.27, 133.77], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    marker = L.marker([-25.27, 133.77]).addTo(map);

    // 2. Start Camera
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment", width: { ideal: 1280 } } 
        });
        video.srcObject = stream;
        status.innerText = "SYSTEM: CAMERA READY";
    } catch (e) {
        status.innerText = "SYSTEM: CAMERA ERROR";
    }

    // 3. Init Tesseract
    worker = await Tesseract.createWorker();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    await worker.setParameters({ tessedit_char_whitelist: '0123456789.,- ' });
    status.innerText = "SYSTEM: QR MODE ACTIVE";
    
    scanLoop();
}

async function scanLoop() {
    if (video.readyState === video.HAVE_ENOUGH_DATA && !isBusy) {
        isBusy = true;
        const ctx = debugCanvas.getContext('2d');
        
        // Dynamic Crop Logic
        const scale = video.videoWidth / video.clientWidth;
        const sw = 280 * scale;
        const sh = 60 * scale;
        const sx = (video.videoWidth - sw) / 2;
        const sy = (video.videoHeight - sh) / 2;

        debugCanvas.width = sw;
        debugCanvas.height = sh;

        ctx.filter = 'contrast(180%) grayscale(100%)';
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

        const { data: { text } } = await worker.recognize(debugCanvas);
        lastResultText = text.trim();
        
        // Show raw data in the HUD
        rawDebug.innerText = "AI SEEING: " + (lastResultText || "...");

        const matches = lastResultText.match(/[-+]?\d+\.\d+/g);

        if (matches && matches.length >= 2) {
            const currentPair = `${matches[0]},${matches[1]}`;
            if (currentPair === lastCleanPair) {
                stability += 34; 
            } else {
                stability = 34;
                lastCleanPair = currentPair;
            }
        } else {
            stability = Math.max(0, stability - 10);
        }

        // Automatic Lock
        if (stability >= 100) {
            triggerLock(parseFloat(matches[0]), parseFloat(matches[1]), "AUTO");
            stability = 0;
        }

        isBusy = false;
    }
    setTimeout(scanLoop, 250);
}

function triggerLock(lat, lng, source) {
    // Vibrate phone for physical feedback
    if (navigator.vibrate) navigator.vibrate(70);

    map.setView([lat, lng], 15);
    marker.setLatLng([lat, lng]);
    
    coordsTxt.innerText = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    coordsTxt.style.color = "#fff";
    coordsTxt.style.background = "#00ff00";
    
    setTimeout(() => { 
        coordsTxt.style.color = "#00ff00"; 
        coordsTxt.style.background = "transparent";
    }, 1000);

    // Save to log
    log.push({ time: new Date().toLocaleTimeString(), lat, lng });
    dlBtn.innerText = `SAVE CSV (${log.length})`;
}

// Manual Thumb Button Logic
thumbButton.addEventListener('click', (e) => {
    e.preventDefault();
    
    const matches = lastResultText.match(/[-+]?\d+\.\d+/g);
    if (matches && matches.length >= 2) {
        triggerLock(parseFloat(matches[0]), parseFloat(matches[1]), "MANUAL");
    } else {
        // ERROR LOGGING: Tells you why it's not updating
        alert("AI sees: [" + lastResultText + "]\n\nNeed two numbers (e.g. -33.123 151.456)");
    }
});

dlBtn.onclick = () => {
    if (log.length === 0) return;
    let csv = "Time,Lat,Lng\n" + log.map(i => `${i.time},${i.lat},${i.lng}`).join("\n");
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "gps_log.csv";
    a.click();
};

init();
