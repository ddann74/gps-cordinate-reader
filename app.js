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
let lastMatch = "";
let isBusy = false;

function initMap() {
    map = L.map('map', { zoomControl: false }).setView([0, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    marker = L.marker([0, 0]).addTo(map);
}

async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment", width: { ideal: 1280 } } 
        });
        video.srcObject = stream;
    } catch (e) {
        statusMsg.innerText = "CAMERA ACCESS DENIED";
    }
}

async function initAI() {
    statusMsg.innerText = "Loading Tesseract AI...";
    worker = await Tesseract.createWorker();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    await worker.setParameters({ tessedit_char_whitelist: '0123456789.,- ' });
    statusMsg.innerText = "Align Coordinates in Green Box";
    runLoop();
}

async function runLoop() {
    if (video.readyState === video.HAVE_ENOUGH_DATA && !isBusy) {
        isBusy = true;
        const ctx = debugCanvas.getContext('2d');
        
        // Define crop area based on the focus-box size (300x100)
        const scale = video.videoWidth / video.clientWidth;
        const sw = 300 * scale;
        const sh = 100 * scale;
        const sx = (video.videoWidth - sw) / 2;
        const sy = (video.videoHeight - sh) / 2;

        debugCanvas.width = sw;
        debugCanvas.height = sh;

        // Image preprocessing for better OCR on screens
        ctx.filter = 'contrast(200%) grayscale(100%) brightness(120%)';
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

        const { data: { text } } = await worker.recognize(debugCanvas);
        
        // Clean text and try to find two decimal numbers
        const matches = text.match(/[-+]?\d+\.\d+/g);

        if (matches && matches.length >= 2) {
            const currentPair = `${matches[0]},${matches[1]}`;
            
            // If the AI sees the same thing twice, bar goes up
            if (currentPair === lastMatch) {
                stability = Math.min(stability + 20, 100);
            } else {
                stability = 20;
                lastMatch = currentPair;
            }
        } else {
            stability = Math.max(0, stability - 5);
        }

        stbBar.style.width = stability + "%";

        if (stability >= 100) {
            updateApp(parseFloat(matches[0]), parseFloat(matches[1]));
            statusMsg.innerText = "COORDINATES LOCKED";
        } else if (stability > 0) {
            statusMsg.innerText = `Stabilizing: ${stability}%`;
        }

        isBusy = false;
    }
    setTimeout(runLoop, 300); 
}

// Manual Capture Button
manualBtn.onclick = () => {
    const matches = lastMatch.split(',');
    if (matches.length >= 2) {
        updateApp(parseFloat(matches[0]), parseFloat(matches[1]));
        statusMsg.innerText = "MANUAL OVERRIDE SUCCESS";
    } else {
        alert("The AI can't read the numbers yet. Move closer to the screen.");
    }
};

function updateApp(lat, lng) {
    const pos = [lat, lng];
    map.setView(pos, 15);
    marker.setLatLng(pos);
    coordsTxt.innerText = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

    const isNew = log.length === 0 || log[log.length-1].lat !== lat;
    if (isNew) {
        log.push({ time: new Date().toLocaleTimeString(), lat, lng });
        dlBtn.innerText = `CSV (${log.length})`;
    }
}

dlBtn.onclick = () => {
    if (log.length === 0) return;
    let csv = "Time,Latitude,Longitude\n" + log.map(i => `${i.time},${i.lat},${i.lng}`).join("\n");
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "captured_gps.csv";
    a.click();
};

initMap();
startCamera();
initAI();
