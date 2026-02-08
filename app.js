const video = document.getElementById('webcam');
const settingsTab = document.getElementById('settings-tab');
const initBtn = document.getElementById('init-btn');
const closeBtn = document.getElementById('close-settings');
const gearBtn = document.getElementById('gear-btn');
const testZone = document.getElementById('test-zone');
const testCanvas = document.getElementById('test-canvas');
const testOutput = document.getElementById('test-output');
const testStab = document.getElementById('test-stab-fill');
const mainStab = document.getElementById('stab-bar-fill');
const coordDisplay = document.getElementById('coords');

let map, marker, worker;
let isStarted = false;
let stability = 0;
let lastResult = "";
let isBusy = false;

// Initialize Map
map = L.map('map', { zoomControl: false }).setView([0, 0], 2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
marker = L.marker([0, 0]).addTo(map);

// Open Settings
gearBtn.onclick = () => settingsTab.classList.remove('hidden');
closeBtn.onclick = () => settingsTab.classList.add('hidden');

// Initialization Flow
initBtn.onclick = async () => {
    initBtn.innerText = "REQUESTING CAMERA...";
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment", width: { ideal: 1280 } } 
        });
        video.srcObject = stream;
        document.getElementById('cam-status').innerText = "Camera: 🟢 Active";
        
        initBtn.innerText = "LOADING AI ENGINE...";
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
        testZone.style.display = 'block';
        
        if (!isStarted) {
            isStarted = true;
            scanLoop();
        }
    } catch (err) {
        alert("Camera error. Please ensure you are on HTTPS and allow camera access.");
        initBtn.innerText = "RETRY ACCESS";
    }
};

async function scanLoop() {
    if (video.readyState === video.HAVE_ENOUGH_DATA && !isBusy) {
        isBusy = true;
        const ctx = testCanvas.getContext('2d');
        
        // Dynamic Cropping
        const vW = video.videoWidth, vH = video.videoHeight;
        const scaleX = vW / video.clientWidth, scaleY = vH / video.clientHeight;
        const sw = 280 * scaleX, sh = 80 * scaleY;
        const sx = (vW - sw) / 2, sy = (vH - sh) / 2;

        testCanvas.width = sw; testCanvas.height = sh;
        
        // High Contrast Filter for better OCR
        ctx.filter = 'contrast(400%) grayscale(100%) brightness(120%)';
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

        const { data: { text } } = await worker.recognize(testCanvas);
        const clean = text.replace(/[^0-9.\- ]/g, '').trim();
        
        testOutput.innerText = clean || "Scanning...";
        processResult(clean);
        
        isBusy = false;
    }
    requestAnimationFrame(scanLoop);
}

function processResult(text) {
    const parts = text.split(/\s+/).filter(p => p.length > 3);
    if (parts.length >= 2) {
        const lat = parseFloat(parts[0]);
        const lng = parseFloat(parts[1]);
        
        if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
            // Data Stabilization Logic
            if (text === lastResult) {
                stability = Math.min(100, stability + 20);
            } else {
                stability = 20;
                lastResult = text;
            }
            
            if (stability >= 100) {
                lockCoordinate(lat, lng);
                stability = 0;
            }
        }
    } else {
        stability = Math.max(0, stability - 5);
    }
    
    testStab.style.width = stability + "%";
    mainStab.style.width = stability + "%";
}

function lockCoordinate(lat, lng) {
    if (navigator.vibrate) navigator.vibrate(50);
    map.setView([lat, lng], 16);
    marker.setLatLng([lat, lng]);
    coordDisplay.innerText = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    document.getElementById('address').innerText = "Coordinate Locked";
}
