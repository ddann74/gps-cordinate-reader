const video = document.getElementById('webcam');
const status = document.getElementById('status-bar');
const debugCanvas = document.getElementById('debug-canvas');
const coordsTxt = document.getElementById('coords');

let map, marker, worker;
let lastText = "";

// Report errors to the screen
function log(msg) {
    status.innerText = "System: " + msg;
    console.log(msg);
}

async function start() {
    log("Starting Map...");
    map = L.map('map').setView([0, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    marker = L.marker([0, 0]).addTo(map);

    log("Requesting Camera...");
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment" } 
        });
        video.srcObject = stream;
        log("Camera Active");
    } catch (e) {
        log("Camera Failed: " + e.message);
    }

    log("Loading AI (Tesseract)...");
    try {
        worker = await Tesseract.createWorker();
        await worker.loadLanguage('eng');
        await worker.initialize('eng');
        await worker.setParameters({ tessedit_char_whitelist: '0123456789.,- ' });
        log("AI Ready. Point at screen.");
        scan();
    } catch (e) {
        log("AI Load Error: " + e.message);
    }
}

async function scan() {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        const ctx = debugCanvas.getContext('2d');
        
        // Match the focus box crop
        const sw = video.videoWidth * 0.5;
        const sh = video.videoHeight * 0.2;
        const sx = (video.videoWidth - sw) / 2;
        const sy = (video.videoHeight - sh) / 2;

        debugCanvas.width = sw;
        debugCanvas.height = sh;

        ctx.filter = 'contrast(200%) grayscale(100%)';
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

        const { data: { text } } = await worker.recognize(debugCanvas);
        lastText = text; 
    }
    setTimeout(scan, 500);
}

document.getElementById('manualBtn').onclick = () => {
    const matches = lastText.match(/[-+]?\d+\.\d+/g);
    if (matches && matches.length >= 2) {
        const lat = parseFloat(matches[0]);
        const lng = parseFloat(matches[1]);
        map.setView([lat, lng], 13);
        marker.setLatLng([lat, lng]);
        coordsTxt.innerText = `LOCKED: ${lat}, ${lng}`;
        log("Manual Lock Success!");
    } else {
        alert("AI sees: " + lastText + "\n(Try moving closer)");
    }
};

start();
