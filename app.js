const video = document.getElementById('webcam');
const statusMsg = document.getElementById('status-msg');
const stbBar = document.getElementById('stb-bar');
const coordsTxt = document.getElementById('coords');
const dlBtn = document.getElementById('dlBtn');
const manualBtn = document.getElementById('manualBtn');
const debugCanvas = document.getElementById('debug-canvas');

let map, marker, worker;
let log = [];
let stability = 0;
let lastMatch = null;
let isBusy = false;

// 1. Setup Map
function initMap() {
    map = L.map('map', { zoomControl: false }).setView([0, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    marker = L.marker([0, 0]).addTo(map);
}

// 2. Setup Camera
async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment", width: { ideal: 1280 } } 
        });
        video.srcObject = stream;
    } catch (e) {
        statusMsg.innerText = "Camera Error! Check Settings.";
    }
}

// 3. Setup AI
async function initAI() {
    statusMsg.innerText = "Loading AI Brain...";
    worker = await Tesseract.createWorker();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    // Only look for numbers and punctuation
    await worker.setParameters({ tessedit_char_whitelist: '0123456789.,- ' });
    statusMsg.innerText = "Scanner Ready";
    runLoop();
}

// 4. The Vision Loop
async function runLoop() {
    if (video.readyState === video.HAVE_ENOUGH_DATA && !isBusy) {
        isBusy = true;
        const ctx = debugCanvas.getContext('2d');
        
        // Crop logic
        const scale = video.videoWidth / video.clientWidth;
        const sw = 280 * scale;
        const sh = 80 * scale;
        const sx = (video.videoWidth - sw) / 2;
        const sy = (video.videoHeight - sh) / 2;

        debugCanvas.width = sw;
        debugCanvas.height = sh;

        // Enhance image for TV screens (Contrast & Grayscale)
        ctx.filter = 'contrast(200%) grayscale(100%)';
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

        const { data: { text } } = await worker.recognize(debugCanvas);
        console.log("Raw Text Seen:", text); // Check F12 to see this

        // Clean and find coordinates
        const matches = text.match(/[-+]?\d+\.\d+/g);

        if (matches && matches.length >= 2) {
            const current = [matches[0], matches[1]];
            
            if (lastMatch && current[0] === lastMatch[0]) {
                stability = Math.min(stability + 25, 100);
            } else {
                stability = 25;
                lastMatch = current;
            }
            statusMsg.innerText = `Data Stabilization: ${stability}%`;
        } else {
            stability = Math.max(0, stability - 5);
        }

        stbBar.style.width = stability + "%";

        if (stability >= 100) {
            updateApp(parseFloat(lastMatch[0]), parseFloat(lastMatch[1]));
        }
        isBusy = false;
    }
    setTimeout(runLoop, 200); 
}

// 5. Manual Capture
manualBtn.onclick = () => {
    if (lastMatch) {
        updateApp(parseFloat(lastMatch[0]), parseFloat(lastMatch[1]));
        statusMsg.innerText = "MANUAL LOCK OK";
    } else {
        alert("The AI hasn't recognized any numbers yet. Check the debug window!");
    }
};

function updateApp(lat, lng) {
    const pos = [lat, lng];
    map.setView(pos, 15);
    marker.setLatLng(pos);
    coordsTxt.innerText = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

    const isDuplicate = log.length > 0 && log[log.length-1].lat === lat;
    if (!isDuplicate) {
        log.push({ time: new Date().toLocaleTimeString(), lat, lng });
        dlBtn.innerText = `SAVE CSV (${log.length})`;
    }
}

dlBtn.onclick = () => {
    if (log.length === 0) return alert("Nothing to save yet!");
    let csv = "Time,Lat,Lng\n" + log.map(i => `${i.time},${i.lat},${i.lng}`).join("\n");
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "gps_trip_data.csv";
    a.click();
};

initMap();
startCamera();
initAI();
