const video = document.getElementById('webcam');
const status = document.getElementById('status-bar');
const debugCanvas = document.getElementById('debug-canvas');
const coordsTxt = document.getElementById('coords');
const dlBtn = document.getElementById('dlBtn');

let map, marker, worker;
let log = [];
let stability = 0;
let lastResult = "";
let isBusy = false;

async function start() {
    // 1. Initialize Map
    map = L.map('map').setView([0, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    marker = L.marker([0, 0]).addTo(map);

    // 2. Start Camera
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment", width: { ideal: 1280 } } 
        });
        video.srcObject = stream;
    } catch (e) {
        status.innerText = "System: Camera Error";
    }

    // 3. Start AI
    status.innerText = "System: Loading AI...";
    worker = await Tesseract.createWorker();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    await worker.setParameters({ tessedit_char_whitelist: '0123456789.,- ' });
    status.innerText = "System: AI Active - Point at Coordinates";
    scan();
}

async function scan() {
    if (video.readyState === video.HAVE_ENOUGH_DATA && !isBusy) {
        isBusy = true;
        const ctx = debugCanvas.getContext('2d');
        
        // Crop logic (matches the green focus box)
        const scale = video.videoWidth / video.clientWidth;
        const sw = 280 * scale;
        const sh = 50 * scale;
        const sx = (video.videoWidth - sw) / 2;
        const sy = (video.videoHeight - sh) / 2;

        debugCanvas.width = sw;
        debugCanvas.height = sh;

        // Visual enhancement for the AI
        ctx.filter = 'contrast(200%) grayscale(100%) brightness(110%)';
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

        const { data: { text } } = await worker.recognize(debugCanvas);
        
        // The QR-Reader Logic: Find 2 decimal numbers
        const matches = text.match(/[-+]?\d+\.\d+/g);

        if (matches && matches.length >= 2) {
            const currentStr = `${matches[0]},${matches[1]}`;
            
            // If the AI is seeing the same numbers consistently...
            if (currentStr === lastResult) {
                stability += 34; // Takes ~3 consistent frames to lock
            } else {
                stability = 34;
                lastResult = currentStr;
            }
        } else {
            stability = Math.max(0, stability - 10); // Fade stability if view is lost
        }

        // Visual Feedback
        if (stability >= 100) {
            autoLock(parseFloat(matches[0]), parseFloat(matches[1]));
            stability = 0; // Reset for next scan
        } else if (stability > 0) {
            status.innerText = `System: Stabilizing... ${stability}%`;
            status.style.color = "#ffff00"; // Yellow while thinking
        } else {
            status.innerText = "System: Searching for Signal...";
            status.style.color = "#00ff00";
        }

        isBusy = false;
    }
    setTimeout(scan, 200); // Fast scanning (5 times per second)
}

function autoLock(lat, lng) {
    // Update Map
    const pos = [lat, lng];
    map.setView(pos, 14);
    marker.setLatLng(pos);
    
    // UI Feedback
    coordsTxt.innerText = `LOCKED: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    coordsTxt.style.background = "#00ff00";
    coordsTxt.style.color = "#000";
    status.innerText = "System: SUCCESSFUL LOCK";
    
    // Reset background after a second
    setTimeout(() => {
        coordsTxt.style.background = "transparent";
        coordsTxt.style.color = "#00ff00";
    }, 1000);

    // Log the data if it's a new location
    const isNew = log.length === 0 || log[log.length-1].lat !== lat;
    if (isNew) {
        log.push({ time: new Date().toLocaleTimeString(), lat, lng });
        dlBtn.innerText = `SAVE CSV (${log.length})`;
    }
}

// Download function stays the same
dlBtn.onclick = () => {
    if (log.length === 0) return;
    let csv = "Time,Lat,Lng\n" + log.map(i => `${i.time},${i.lat},${i.lng}`).join("\n");
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "gps_trip.csv";
    a.click();
};

start();
