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
    map = L.map('map', { zoomControl: false }).setView([0, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    marker = L.marker([0, 0]).addTo(map);

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } } 
        });
        video.srcObject = stream;
    } catch (e) { alert("Camera Error"); }

    rawDebug.innerText = "STARTING PRECISION ENGINE...";
    worker = await Tesseract.createWorker();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    
    // Crucial: We only allow the characters that exist in a GPS coordinate
    await worker.setParameters({ 
        tessedit_char_whitelist: '0123456789.-', 
        tessedit_pageseg_mode: '7',
        user_defined_dpi: '300'
    });
    
    rawDebug.innerText = "STABILIZER ACTIVE";
    scanLoop();
}

async function scanLoop() {
    if (video.readyState === video.HAVE_ENOUGH_DATA && !isBusy) {
        isBusy = true;
        const ctx = debugCanvas.getContext('2d');
        
        // Dynamic Crop Math
        const vW = video.videoWidth, vH = video.videoHeight;
        const scaleX = vW / video.clientWidth, scaleY = vH / video.clientHeight;
        const sw = 300 * scaleX, sh = 100 * scaleY;
        const sx = (vW - sw) / 2, sy = (vH - sh) / 2;

        debugCanvas.width = sw; debugCanvas.height = sh;
        
        // ADAPTIVE FILTERING: Increases sharpness of the digits
        ctx.filter = 'contrast(500%) grayscale(100%) brightness(120%) blur(0px)';
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

        const { data: { text } } = await worker.recognize(debugCanvas);
        
        // REGEX: Find two numbers that have a decimal or are at least 4 digits long
        const cleanText = text.replace(/[^0-9.\- ]/g, ''); 
        rawDebug.innerText = "RAW: " + cleanText;

        const found = parsePrecisionCoords(cleanText);
        
        if (found) {
            // Data Stabilization check
            const currentPair = `${found[0].toFixed(2)},${found[1].toFixed(2)}`; 
            if (currentPair === lastCleanPair) {
                stability = Math.min(100, stability + 20); // Takes 5 frames of agreement
            } else {
                stability = 10;
                lastCleanPair = currentPair;
            }

            if (stability >= 100) {
                triggerLock(found[0], found[1], "AUTO");
                stability = 0;
            }
        } else {
            stability = Math.max(0, stability - 5);
        }
        
        stabFill.style.width = stability + "%";
        isBusy = false;
    }
    setTimeout(scanLoop, 100); 
}

function parsePrecisionCoords(text) {
    // Split by spaces or dashes to find potential number pairs
    const parts = text.trim().split(/\s+/).filter(p => p.length > 3);
    if (parts.length < 2) return null;

    let lat = parseFloat(parts[0]);
    let lng = parseFloat(parts[1]);

    // Manual decimal fix: if the AI missed a dot (e.g. "33856" instead of "33.856")
    if (Math.abs(lat) > 1000) lat = lat / 10000;
    if (Math.abs(lng) > 1000) lng = lng / 10000;

    if (isSwapped) [lat, lng] = [lng, lat];

    if (isNaN(lat) || isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return [lat, lng];
}

// ... Keep your triggerLock, getAddress, and download functions from the previous code ...
