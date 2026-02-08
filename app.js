const video = document.getElementById('webcam');
const status = document.getElementById('status-bar');
const debugCanvas = document.getElementById('debug-canvas');
const coordsTxt = document.getElementById('coords');
const dlBtn = document.getElementById('dlBtn');
const thumbButton = document.getElementById('manualBtn');

let map, marker, worker;
let log = [];
let stability = 0;
let lastResultText = ""; // Full text for manual lock
let lastCleanPair = ""; // Pair for auto-lock logic
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
    } catch (e) {
        status.innerText = "SYSTEM: CAMERA ACCESS DENIED";
    }

    // 3. Init AI
    status.innerText = "SYSTEM: LOADING AI ENGINE...";
    worker = await Tesseract.createWorker();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    await worker.setParameters({ tessedit_char_whitelist: '0123456789.,- ' });
    status.innerText = "SYSTEM: READY - QR MODE ACTIVE";
    
    requestAnimationFrame(scanLoop);
}

async function scanLoop() {
    if (video.readyState === video.HAVE_ENOUGH_DATA && !isBusy) {
        isBusy = true;
        const ctx = debugCanvas.getContext('2d');
        
        // Match the focus-box crop
        const scale = video.videoWidth / video.clientWidth;
        const sw = 280 * scale;
        const sh = 60 * scale;
        const sx = (video.videoWidth - sw) / 2;
        const sy = (video.videoHeight - sh) / 2;

        debugCanvas.width = sw;
        debugCanvas.height = sh;

        // Enhance for OCR
        ctx.filter = 'contrast(200%) grayscale(100%) brightness(110%)';
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

        const { data: { text } } = await worker.recognize(debugCanvas);
        lastResultText = text; // Save for the Manual Thumb Button

        const matches = text.match(/[-+]?\d+\.\d+/g);

        if (matches && matches.length >= 2) {
            const currentPair = `${matches[0]},${matches[1]}`;
            
            // Auto-Lock Logic (Stability)
            if (currentPair === lastCleanPair) {
                stability += 34; // 3 frames to 100%
            } else {
                stability = 34;
                lastCleanPair = currentPair;
            }
        } else {
            stability = Math.max(0, stability - 10);
        }

        // Update UI
        if (stability >= 100) {
            triggerLock(parseFloat(matches[0]), parseFloat(matches[1]), "AUTO");
            stability = 0;
        } else {
            status.innerText = stability > 0 ? `STABILIZING: ${stability}%` : "SYSTEM: SEARCHING...";
            status.style.color = stability > 0 ? "#ffff00" : "#00ff00";
        }

        isBusy = false;
    }
    setTimeout(scanLoop, 200);
}

// THE LOCK FUNCTION (Used by Auto and Manual)
function triggerLock(lat, lng, source) {
    const pos = [lat, lng];
    map.setView(pos, 15);
    marker.setLatLng(pos);
    
    coordsTxt.innerText = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    status.innerText = `SYSTEM: ${source} LOCK SUCCESS`;
    
    // Log if not a duplicate
    const isNew = log.length === 0 || log[log.length-1].lat !== lat;
    if (isNew) {
        log.push({ time: new Date().toLocaleTimeString(), lat, lng });
        dlBtn.innerText = `SAVE DATA TO CSV (${log.length})`;
    }

    // Flash the coords green
    coordsTxt.style.color = "#fff";
    coordsTxt.style.background = "#00ff00";
    setTimeout(() => { 
        coordsTxt.style.color = "#00ff00"; 
        coordsTxt.style.background = "transparent";
    }, 800);
}

// MANUAL THUMB BUTTON HANDLER
thumbButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation(); // Stop the map from moving
    
    const matches = lastResultText.match(/[-+]?\d+\.\d+/g);
    if (matches && matches.length >= 2) {
        triggerLock(parseFloat(matches[0]), parseFloat(matches[1]), "MANUAL");
    } else {
        status.innerText = "SYSTEM: NO NUMBERS IN VIEW";
        status.style.color = "#ff0000";
    }
});

// CSV Download
dlBtn.onclick = () => {
    if (log.length === 0) return;
    let csv = "Time,Lat,Lng\n" + log.map(i => `${i.time},${i.lat},${i.lng}`).join("\n");
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "gps_scan_log.csv";
    a.click();
};

init();
