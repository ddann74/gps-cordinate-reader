const video = document.getElementById('webcam');
const settingsTab = document.getElementById('settings-tab');
const initBtn = document.getElementById('init-btn');
const closeBtn = document.getElementById('close-settings');
const gearBtn = document.getElementById('gear-btn');
const testCanvas = document.getElementById('test-canvas');
const testOutput = document.getElementById('test-output');
const stabFill = document.getElementById('stab-bar-fill');
const coordDisplay = document.getElementById('coords');
const lockBtn = document.getElementById('lock-btn');

let map, marker, worker;
let isStarted = false;
let stability = 0;
let lastResult = "";
let isBusy = false;
let currentLat = 0, currentLng = 0;

// Initialize Map
map = L.map('map', { zoomControl: false }).setView([0, 0], 2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
marker = L.marker([0, 0]).addTo(map);

// UI Logic
gearBtn.onclick = () => settingsTab.classList.remove('hidden');
closeBtn.onclick = () => settingsTab.classList.add('hidden');

// --- THE FIX FOR THE INITIALIZE BUTTON ---
initBtn.onclick = async () => {
    // Security check for Camera API
    const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
    if (!isSecure) {
        initBtn.innerText = "ERROR: USE HTTPS";
        initBtn.style.background = "red";
        alert("Camera requires an HTTPS connection.");
        return;
    }

    try {
        initBtn.innerText = "OPENING CAMERA...";
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment", width: { ideal: 1280 } } 
        });
        video.srcObject = stream;
        document.getElementById('cam-status').innerText = "Camera: 🟢 Active";

        initBtn.innerText = "LOADING AI...";
        worker = await Tesseract.createWorker();
        await worker.loadLanguage('eng');
        await worker.initialize('eng');
        await worker.setParameters({
            tessedit_char_whitelist: '0123456789.- ',
            tessedit_pageseg_mode: '7'
        });

        document.getElementById('ai-status').innerText = "AI Engine: 🟢 Ready";
        initBtn.style.display = 'none';
        closeBtn.style.display = 'block';
        document.getElementById('test-zone').style.display = 'block';

        if (!isStarted) { isStarted = true; scanLoop(); }
    } catch (err) {
        initBtn.innerText = "FAIL: " + err.name;
        console.error(err);
    }
};

// --- MANUAL LOCK LOGIC ---
lockBtn.onclick = () => {
    if (currentLat !== 0 && currentLng !== 0) {
        updatePosition(currentLat, currentLng);
        lockBtn.innerText = "LOCKED!";
        setTimeout(() => lockBtn.innerText = "Lock Coordinates", 2000);
    } else {
        alert("Keep camera steady until numbers appear!");
    }
};

async function scanLoop() {
    if (video.readyState === video.HAVE_ENOUGH_DATA && !isBusy) {
        isBusy = true;
        const ctx = testCanvas.getContext('2d');
        const vW = video.videoWidth, vH = video.videoHeight;
        const sw = vW * 0.6, sh = vH * 0.15;
        const sx = (vW - sw) / 2, sy = (vH - sh) / 2;
        testCanvas.width = sw; testCanvas.height = sh;
        
        ctx.filter = 'contrast(400%) grayscale(100%)';
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

        const { data: { text } } = await worker.recognize(testCanvas);
        testOutput.innerText = text.trim() || "...";
        processData(text);
        isBusy = false;
    }
    requestAnimationFrame(scanLoop);
}

function processData(text) {
    // Regex hunts for any two sets of decimals
    const matches = text.match(/-?\d+\.\d+/g); 
    
    if (matches && matches.length >= 2) {
        const lat = parseFloat(matches[0]);
        const lng = parseFloat(matches[1]);
        
        if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
            currentLat = lat;
            currentLng = lng;
            coordDisplay.innerText = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

            // Data Stabilization logic
            if (text.trim() === lastResult) {
                stability = Math.min(100, stability + 25);
            } else {
                stability = 10;
                lastResult = text.trim();
            }
            
            if (stability >= 100) {
                updatePosition(lat, lng);
                stability = 0;
            }
        }
    } else {
        stability = Math.max(0, stability - 5);
    }
    stabFill.style.width = stability + "%";
}

function updatePosition(lat, lng) {
    if (navigator.vibrate) navigator.vibrate(50);
    map.setView([lat, lng], 16);
    marker.setLatLng([lat, lng]);
}
