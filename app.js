const video = document.getElementById('webcam');
const debugCanvas = document.getElementById('debug-canvas');
const coordsTxt = document.getElementById('coords');
const addressTxt = document.getElementById('address');
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
let lastCleanPair = "";

async function init() {
    // 1. Initialize Map
    map = L.map('map', { zoomControl: false }).setView([0, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    marker = L.marker([0, 0]).addTo(map);

    // 2. Start Camera
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment", width: { ideal: 1280 } } 
        });
        video.srcObject = stream;
    } catch (e) {
        alert("Camera Access Denied");
    }

    // 3. Setup AI
    rawDebug.innerText = "INITIALIZING AI ENGINE...";
    worker = await Tesseract.createWorker();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    await worker.setParameters({ tessedit_char_whitelist: '0123456789.,- ' });
    
    rawDebug.innerText = "SYSTEM READY";
    scanLoop();
}

function cleanNumber(val) {
    let n = val.replace(',', '.');
    // Sanity Check: If AI misses the dot (e.g. "33856" -> "33.856")
    if (!n.includes('.') && n.length > 4) {
        n = n.slice(0, 2) + "." + n.slice(2);
    }
    return parseFloat(n);
}

function parseCoords(text) {
    const matches = text.match(/[-+]?\d+[\.\,]?\d*/g);
    if (!matches || matches.length < 2) return null;

    let lat = cleanNumber(matches[0]);
    let lng = cleanNumber(matches[1]);

    if (isSwapped) [lat, lng] = [lng, lat];

    // Check if coordinates are physically possible
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

    return [lat, lng];
}

async function getAddress(lat, lng) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`);
        const data = await response.json();
        if (data.address) {
            const suburb = data.address.suburb || data.address.town || data.address.village || data.address.city || "Unknown Suburb";
            const road = data.address.road || "";
            return { full: `${road}${road ? ', ' : ''}${suburb}`, suburb: suburb };
        }
    } catch (e) { console.error("Geocode Error", e); }
    return { full: "Address Unknown", suburb: "Unknown" };
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
        ctx.filter = 'contrast(200%) grayscale(100%) brightness(110%)';
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

        const { data: { text } } = await worker.recognize(debugCanvas);
        lastResultText = text.trim();
        rawDebug.innerText = "AI READ: " + (lastResultText || "...");

        const found = parseCoords(lastResultText);
        if (found) {
            const currentPair = `${found[0].toFixed(3)},${found[1].toFixed(3)}`;
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
        stabFill.style.width = stability + "%";
        isBusy = false;
    }
    setTimeout(scanLoop, 200);
}

async function triggerLock(lat, lng, source) {
    if (navigator.vibrate) navigator.vibrate(60);
    map.setView([lat, lng], 15);
    marker.setLatLng([lat, lng]);
    coordsTxt.innerText = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    
    addressTxt.innerText = "Fetching Suburb...";
    const info = await getAddress(lat, lng);
    addressTxt.innerText = info.full;

    log.push({ 
        time: new Date().toLocaleTimeString(), 
        lat, lng, 
        suburb: info.suburb, 
        address: info.full,
        source 
    });
    dlBtn.innerText = `SAVE CSV (${log.length})`;

    coordsTxt.style.color = "#fff";
    setTimeout(() => coordsTxt.style.color = "var(--accent)", 1000);
}

swapBtn.onclick = () => {
    isSwapped = !isSwapped;
    swapBtn.style.borderColor = isSwapped ? "var(--accent)" : "#555";
    swapBtn.innerText = isSwapped ? "ORDER: LNG / LAT" : "ORDER: LAT / LNG";
};

thumbButton.onclick = () => {
    const found = parseCoords(lastResultText);
    if (found) triggerLock(found[0], found[1], "MANUAL");
    else alert("Could not resolve numbers. AI sees: " + lastResultText);
};

dlBtn.onclick = () => {
    if (log.length === 0) return;
    let csv = "Time,Lat,Lng,Suburb,Address,Source\n" + 
              log.map(i => `${i.time},${i.lat},${i.lng},"${i.suburb}","${i.address}",${i.source}`).join("\n");
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gps_log_${Date.now()}.csv`;
    a.click();
};

init();
