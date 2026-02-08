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
    // Whitelist now includes commas and signs for better matching
    await worker.setParameters({ tessedit_char_whitelist: '0123456789.,- ' });
    status.innerText = "SYSTEM: SCANNER ACTIVE";
    
    scanLoop();
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
        ctx.filter = 'contrast(200%) grayscale(100%) brightness(120%)';
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

        const { data: { text } } = await worker.recognize(debugCanvas);
        lastResultText = text.trim();
        rawDebug.innerText = "AI SEEING: " + (lastResultText || "...");

        // AGGRESSIVE MATCHING: Finds numbers even with commas or weird spacing
        const matches = lastResultText.match(/[-+]?\d+[\.\,]\d+/g);

        if (matches && matches.length >= 2) {
            const lat = parseFloat(matches[0].replace(',', '.'));
            const lng = parseFloat(matches[1].replace(',', '.'));
            const currentPair = `${lat},${lng}`;

            if (currentPair === lastCleanPair) {
                stability += 34; 
            } else {
                stability = 34;
                lastCleanPair = currentPair;
            }

            if (stability >= 100) {
                triggerLock(lat, lng, "AUTO");
                stability = 0;
            }
        } else {
            stability = Math.max(0, stability - 5);
        }
        isBusy = false;
    }
    setTimeout(scanLoop, 200);
}

function triggerLock(lat, lng, source) {
    if (navigator.vibrate) navigator.vibrate(80);
    map.setView([lat, lng], 15);
    marker.setLatLng([lat, lng]);
    coordsTxt.innerText = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    
    // Add to Data Stabilization Indicator in Log
    log.push({ time: new Date().toLocaleTimeString(), lat, lng });
    dlBtn.innerText = `SAVE CSV (${log.length})`;

    coordsTxt.style.background = "#00ff00";
    coordsTxt.style.color = "#000";
    setTimeout(() => { 
        coordsTxt.style.background = "transparent";
        coordsTxt.style.color = "#00ff00";
    }, 1000);
}

thumbButton.addEventListener('click', (e) => {
    e.preventDefault();
    const matches = lastResultText.match(/[-+]?\d+[\.\,]\d+/g);
    if (matches && matches.length >= 2) {
        const lat = parseFloat(matches[0].replace(',', '.'));
        const lng = parseFloat(matches[1].replace(',', '.'));
        triggerLock(lat, lng, "MANUAL");
    } else {
        alert("STABILIZATION FAILED\nAI saw: " + lastResultText + "\n\nTry to keep the camera steadier or closer.");
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
