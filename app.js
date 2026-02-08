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

// 1. Setup Map
map = L.map('map', { zoomControl: false }).setView([0, 0], 2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
marker = L.marker([0, 0]).addTo(map);

// 2. UI Actions
gearBtn.onclick = () => settingsTab.classList.remove('hidden');
closeBtn.onclick = () => settingsTab.classList.add('hidden');

// 3. Manual Lock Trigger
lockBtn.onclick = () => {
    if (currentLat !== 0 && currentLng !== 0) {
        updatePosition(currentLat, currentLng);
        lockBtn.style.background = "#fff";
        lockBtn.innerText = "LOCKED ✅";
        if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
        setTimeout(() => { 
            lockBtn.style.background = "var(--accent)"; 
            lockBtn.innerText = "Lock Coordinates"; 
        }, 2000);
    } else {
        alert("Scan coordinates first!");
    }
};

// 4. Initialize Camera & AI
initBtn.onclick = async () => {
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
        alert("Security: HTTPS is required for camera access.");
        return;
    }
    
    initBtn.innerText = "LOADING ENGINES...";
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment", width: { ideal: 1280 } } 
        });
        video.srcObject = stream;
        document.getElementById('cam-status').innerText = "Camera: 🟢 Active";

        worker = await Tesseract.createWorker();
        await worker.loadLanguage('eng');
        await worker.initialize('eng');
        await worker.setParameters({
            tessedit_char_whitelist: '0123456789.- ',
            tessedit_pageseg_mode: '7' // Treat as single line
        });

        document.getElementById('ai-status').innerText = "AI Engine: 🟢 Ready";
        initBtn.style.display = 'none';
        closeBtn.style.display = 'block';
        document.getElementById('test-zone').style.display = 'block';

        if (!isStarted) { isStarted = true; scanLoop(); }
    } catch (err) {
        console.error(err);
        alert("Camera Access Denied.");
        initBtn.innerText = "RETRY ACCESS";
    }
};

// 5. Main AI Vision Loop
async function scanLoop() {
    if (video.readyState === video.HAVE_ENOUGH_DATA && !isBusy) {
        isBusy = true;
        const ctx = testCanvas.getContext('2d');
        const vW = video.videoWidth, vH = video.videoHeight;
        
        // Dynamic Crop for Focus Box
        const sw = vW * 0.6, sh = vH * 0.15;
        const sx = (vW - sw) / 2, sy = (vH - sh) / 2;
        testCanvas.width = sw; testCanvas.height = sh;
        
        // High-Contrast Image Prep
        ctx.filter = 'contrast(400%) grayscale(100%) brightness(120%)';
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

        const { data: { text } } = await worker.recognize(testCanvas);
        const clean = text.replace(/[^0-9.\- ]/g, '').trim();
        
        testOutput.innerText = clean || "...";
        processData(clean);
        isBusy = false;
    }
    requestAnimationFrame(scanLoop);
}

// 6. Stability & Mapping Logic
function processData(text) {
    const parts = text.split(/\s+/).filter(p => p.length > 4);
    
    if (parts.length >= 2) {
        const lat = parseFloat(parts[0]);
        const lng = parseFloat(parts[1]);
        
        // Validate Lat/Lng ranges
        if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
            currentLat = lat;
            currentLng = lng;
            coordDisplay.innerText = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

            // DATA STABILIZATION CHECK
            if (text === lastResult) {
                stability = Math.min(100, stability + 25); // Faster lock (4 frames)
            } else {
                stability = 10;
                lastResult = text;
            }
            
            if (stability >= 100) {
                updatePosition(lat, lng);
                stability = 0; // Reset after auto-lock
            }
        }
    } else {
        stability = Math.max(0, stability - 10);
    }
    stabFill.style.width = stability + "%";
}

function updatePosition(lat, lng) {
    if (navigator.vibrate) navigator.vibrate(70);
    const pos = [lat, lng];
    map.setView(pos, 16);
    marker.setLatLng(pos);
}
