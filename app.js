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
let lastCleanPair = "";
let isBusy = false;
let isSwapped = false;

async function init() {
    // 1. Initialize Leaflet Map
    map = L.map('map', { zoomControl: false }).setView([0, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    marker = L.marker([0, 0]).addTo(map);

    // 2. Camera Access
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment", width: { ideal: 1280 } } 
        });
        video.srcObject = stream;
    } catch (e) {
        alert("Camera Error: Please enable permissions.");
    }

    // 3. Setup AI Engine
    rawDebug.innerText = "LOADING AI...";
    worker = await Tesseract.createWorker();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    
    // STRICT WHITELIST: Only look for numbers and symbols
    await worker.setParameters({ 
        tessedit_char_whitelist: '0123456789.,- ',
        tessedit_pageseg_mode: '7' // Treat as a single line
    });
    
    rawDebug.innerText = "READY TO SCAN";
    scanLoop();
}

function cleanNumber(val) {
    let n = val.replace(',', '.');
    // Sanity Check: If AI misses a dot in a long number (e.g., 33856 -> 33.856)
    if (!n.includes('.') && n.length > 4) {
        n = n.slice(0, 2) + "." + n.slice(2);
    }
    return parseFloat(n);
}

function parseCoords(text) {
    // Regex extracts groups of digits that look like coordinates
    const matches = text.match(/[-+]?\d+[\.\,]?\d*/g);
    if (!matches || matches.length < 2) return null;

    let lat = cleanNumber(matches[0]);
    let lng = cleanNumber(matches[1]);

    if (isSwapped) [lat, lng] = [lng, lat];

    // Latitude must be -90 to 90, Longitude -180 to 180
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

    return [lat, lng];
}

async function getAddress(lat, lng) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`);
        const data = await res.json();
        if (data.address) {
            const suburb = data.address.suburb || data.address.town || data.address.village || data.address.city || "Unknown";
            const road = data.address.road || "Unknown Road";
            return { full: `${road}, ${suburb}`, suburb: suburb };
        }
    } catch (e) { console.warn("Network offline, cannot fetch address."); }
    return { full: "Address Not Found", suburb: "Offline" };
}

async function scanLoop() {
    if (video.readyState === video.HAVE_ENOUGH_DATA && !isBusy) {
        isBusy = true;
        const ctx = debugCanvas.getContext('2d');
        
        // Calculate crop based on video resolution
        const vW = video.videoWidth, vH = video.videoHeight;
        const scaleX = vW / video.clientWidth, scaleY = vH / video.clientHeight;
        const sw = 300 * scaleX, sh = 100 * scaleY;
        const sx = (vW - sw) / 2, sy = (vH - sh) / 2;

        debugCanvas.width = sw; debugCanvas.height = sh;
        
        // HIGH CONTRAST FILTERING: Forces black text on white background
        ctx.filter = 'contrast(400%) grayscale(100%) brightness(120%)';
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

        const { data: { text } } = await worker.recognize(debugCanvas);
        const filteredText = text.replace(/[^0-9.,-\s]/g, '').trim();
        rawDebug.innerText = "AI READ: " + (filteredText || "...");

        const found = parseCoords(filteredText);
        
        if (found) {
            const currentPair = `${found[0].toFixed(3)},${found[1].toFixed(3)}`;
            
            // Data Stabilization: Requires 4 identical reads to auto-lock
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
    setTimeout(scanLoop, 150); // Scans ~6 times per second
}

async function triggerLock(lat, lng, source) {
    if (navigator.vibrate) navigator.vibrate(60);
    
    map.setView([lat, lng], 16);
    marker.setLatLng([lat, lng]);
    coordsTxt.innerText = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    
    addressTxt.innerText = "Finding Suburb...";
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

// Button Listeners
swapBtn.onclick = () => {
    isSwapped = !isSwapped;
    swapBtn.style.borderColor = isSwapped ? "var(--accent)" : "#555";
    swapBtn.innerText = isSwapped ? "ORDER: LNG / LAT" : "ORDER: LAT / LNG";
};

thumbButton.onclick = () => {
    const found = parseCoords(rawDebug.innerText.replace("AI READ: ", ""));
    if (found) triggerLock(found[0], found[1], "MANUAL");
    else alert("Check focus. AI sees: " + rawDebug.innerText);
};

dlBtn.onclick = () => {
    if (log.length === 0) return alert("No data logged yet!");
    let csv = "Time,Lat,Lng,Suburb,Address,Source\n" + 
              log.map(i => `${i.time},${i.lat},${i.lng},"${i.suburb}","${i.address}",${i.source}`).join("\n");
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `GPS_Data_Log.csv`;
    a.click();
};

init();
