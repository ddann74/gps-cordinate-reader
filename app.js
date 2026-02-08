const video = document.getElementById('webcam');
const debugCanvas = document.getElementById('debug-canvas');
const coordsTxt = document.getElementById('coords');
const dlBtn = document.getElementById('dlBtn');
const swapBtn = document.getElementById('swapBtn');
const thumbButton = document.getElementById('manualBtn');
const rawDebug = document.getElementById('raw-debug');
const stabFill = document.getElementById('stability-fill');

let map, marker, worker;
let log = [];
let stability = 0;
let lastResultText = ""; 
let isBusy = false;
let isSwapped = false;

async function init() {
    map = L.map('map', { zoomControl: false }).setView([0, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    marker = L.marker([0, 0]).addTo(map);

    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = stream;

    worker = await Tesseract.createWorker();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    await worker.setParameters({ tessedit_char_whitelist: '0123456789.,- ' });
    scanLoop();
}

function cleanNumber(val) {
    let n = val.replace(',', '.');
    // Sanity Filter: If AI missed the dot (e.g., 33856 -> 33.856)
    if (!n.includes('.') && n.length > 3) {
        n = n.slice(0, 2) + "." + n.slice(2);
    }
    return parseFloat(n);
}

function parseCoords(text) {
    // Finds any sequence of numbers with or without decimals
    const matches = text.match(/[-+]?\d+[\.\,]?\d*/g);
    if (!matches || matches.length < 2) return null;

    let lat = cleanNumber(matches[0]);
    let lng = cleanNumber(matches[1]);

    // Apply Swap if user toggled it
    if (isSwapped) [lat, lng] = [lng, lat];

    // Final GPS Sanity Check: Lat must be -90 to 90
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

    return [lat, lng];
}

async function scanLoop() {
    if (video.readyState === video.HAVE_ENOUGH_DATA && !isBusy) {
        isBusy = true;
        const ctx = debugCanvas.getContext('2d');
        const vW = video.videoWidth, vH = video.videoHeight;
        const scaleX = vW / video.clientWidth, scaleY = vH / video.clientHeight;
        const sw = 300 * scaleX, sh = 100 * scaleY;
        const sx = (vW - sw) / 2, sy = (vH - sh) / 2;

        debugCanvas.width = sw; debugCanvas.height = sh;
        ctx.filter = 'contrast(200%) grayscale(100%)';
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

        const { data: { text } } = await worker.recognize(debugCanvas);
        lastResultText = text.trim();
        rawDebug.innerText = "AI READ: " + lastResultText;

        const found = parseCoords(lastResultText);
        if (found) {
            stability = Math.min(100, stability + 20);
            if (stability >= 100) {
                triggerLock(found[0], found[1], "AUTO");
                stability = 0;
            }
        } else {
            stability = Math.max(0, stability - 10);
        }
        stabFill.style.width = stability + "%";
        isBusy = false;
    }
    setTimeout(scanLoop, 150);
}

function triggerLock(lat, lng, source) {
    if (navigator.vibrate) navigator.vibrate(50);
    map.setView([lat, lng], 15);
    marker.setLatLng([lat, lng]);
    coordsTxt.innerText = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    log.push({ time: new Date().toLocaleTimeString(), lat, lng, source });
    dlBtn.innerText = `SAVE CSV (${log.length})`;
}

swapBtn.onclick = () => {
    isSwapped = !isSwapped;
    swapBtn.style.background = isSwapped ? "#ff8800" : "#555";
};

thumbButton.onclick = () => {
    const found = parseCoords(lastResultText);
    if (found) triggerLock(found[0], found[1], "MANUAL");
    else alert("AI seeing messy numbers: " + lastResultText);
};

dlBtn.onclick = () => {
    let csv = "Time,Lat,Lng\n" + log.map(i => `${i.time},${i.lat},${i.lng}`).join("\n");
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = "gps_log.csv";
    a.click();
};

init();
