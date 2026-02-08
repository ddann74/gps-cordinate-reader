const video = document.getElementById('webcam');
const status = document.getElementById('status-bar');
const debugCanvas = document.getElementById('debug-canvas');
const coordsTxt = document.getElementById('coords');
const dlBtn = document.getElementById('dlBtn');
const thumbButton = document.getElementById('manualBtn');
const rawDebug = document.getElementById('raw-debug');

let map, marker, worker;
let log = [];
let stability = 0; // Data Stabilization counter
let lastResultText = ""; 
let lastCleanPair = ""; 
let isBusy = false;

async function init() {
    // 1. Map Setup
    map = L.map('map', { zoomControl: false }).setView([-25.27, 133.77], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    marker = L.marker([-25.27, 133.77]).addTo(map);

    // 2. Camera Setup
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment", width: { ideal: 1280 } } 
        });
        video.srcObject = stream;
    } catch (e) {
        status.innerText = "CAMERA ERROR: CHECK PERMISSIONS";
    }

    // 3. AI Setup
    status.innerText = "LOADING AI ENGINE...";
    worker = await Tesseract.createWorker();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    // Allow more characters so the AI doesn't get confused, we filter later
    await worker.setParameters({ tessedit_char_whitelist: '0123456789.,- ' });
    status.innerText = "SCANNER READY";
    
    scanLoop();
}

// Function to find coordinates in messy text
function parseCoords(text) {
    // Looks for patterns like -33.123 or 151.123
    const matches = text.match(/[-+]?\d+[\.\,]\d+/g);
    if (matches && matches.length >= 2) {
        return [
            parseFloat(matches[0].replace(',', '.')),
            parseFloat(matches[1].replace(',', '.'))
        ];
    }
    return null;
}

async function scanLoop() {
    if (video.readyState === video.HAVE_ENOUGH_DATA && !isBusy) {
        isBusy = true;
        const ctx = debugCanvas.getContext('2d');
        
        // CROP MATH: Maps the focus-box to the raw video pixels
        const scaleX = video.videoWidth / video.clientWidth;
        const scaleY = video.videoHeight / video.clientHeight;
        const sw = 300 * scaleX;
        const sh = 100 * scaleY;
        const sx = (video.videoWidth - sw) / 2;
        const sy = (video.videoHeight - sh) / 2;

        debugCanvas.width = sw;
        debugCanvas.height = sh;

        // Image Enhancement
        ctx.filter = 'contrast(220%) grayscale(100%) brightness(110%)';
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

        const { data: { text } } = await worker.recognize(debugCanvas);
        lastResultText = text.trim();

        const found = parseCoords(lastResultText);
        
        if (found) {
            const currentPair = `${found[0].toFixed(3)},${found[1].toFixed(3)}`;
            
            // Data Stabilization Logic
            if (currentPair === lastCleanPair) {
                stability = Math.min(100, stability + 25);
            } else {
                stability = 25;
                lastCleanPair = currentPair;
            }

            if (stability >= 100) {
                triggerLock(found[0], found[1], "AUTO");
                stability = 0;
            }
        } else {
            stability = Math.max(0, stability - 10);
        }

        // Update raw debug line with Data Stabilization percentage
        rawDebug.innerText = `AI READ: ${lastResultText || "..."} | STABILITY: ${stability}%`;
        
        isBusy = false;
    }
    setTimeout(scanLoop, 150);
}

function triggerLock(lat, lng, source) {
    if (navigator.vibrate) navigator.vibrate(60);

    map.setView([lat, lng], 15);
    marker.setLatLng([lat, lng]);
    
    coordsTxt.innerText = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    
    // Add to log
    log.push({ time: new Date().toLocaleTimeString(), lat, lng, source });
    dlBtn.innerText = `SAVE CSV (${log.length})`;

    // Visual feedback
    coordsTxt.style.background = "#00ff00";
    coordsTxt.style.color = "#000";
    setTimeout(() => { 
        coordsTxt.style.background = "transparent";
        coordsTxt.style.color = "#00ff00";
    }, 800);
}

// Manual Button
thumbButton.addEventListener('click', (e) => {
    e.preventDefault();
    const found = parseCoords(lastResultText);
    if (found) {
        triggerLock(found[0], found[1], "MANUAL");
    } else {
        alert("STABILIZATION FAILED\nAI Sees: [" + lastResultText + "]\n\nTry to center the numbers in the box.");
    }
});

// CSV Download
dlBtn.onclick = () => {
    if (log.length === 0) return;
    let csv = "Time,Lat,Lng,Source\n" + log.map(i => `${i.time},${i.lat},${i.lng},${i.source}`).join("\n");
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = "gps_scan_log.csv"; a.click();
};

init();
