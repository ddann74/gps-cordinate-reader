const video = document.getElementById('webcam');
const settingsTab = document.getElementById('settings-tab');
const initBtn = document.getElementById('init-btn');
const closeBtn = document.getElementById('close-settings');
const gearBtn = document.getElementById('gear-btn');
const testCanvas = document.getElementById('test-canvas');
const testOutput = document.getElementById('test-output');
const stabFill = document.getElementById('stab-bar-fill');
const coordDisplay = document.getElementById('coords');

let map, marker, worker;
let isStarted = false;
let stability = 0;
let lastResult = "";
let isBusy = false;

// 1. Initialize Map
map = L.map('map', { zoomControl: false }).setView([0, 0], 2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
marker = L.marker([0, 0]).addTo(map);

// 2. Settings Toggle
gearBtn.onclick = () => settingsTab.classList.remove('hidden');
closeBtn.onclick = () => settingsTab.classList.add('hidden');

// 3. Permission & AI Bootup
initBtn.onclick = async () => {
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
        alert("Camera requires HTTPS.");
        return;
    }

    initBtn.innerText = "INITIALIZING...";
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
            tessedit_pageseg_mode: '7'
        });

        document.getElementById('ai-status').innerText = "AI Engine: 🟢 Ready";
        initBtn.style.display = 'none';
        closeBtn.style.display = 'block';
        document.getElementById('test-zone').style.display = 'block';

        if (!isStarted) {
            isStarted = true;
            scanLoop();
        }
    } catch (err) {
        alert("Check camera permissions.");
        initBtn.innerText = "RETRY";
    }
};

// 4. The Scan Loop
async function scanLoop() {
    if (video.readyState === video.HAVE_ENOUGH_DATA && !isBusy) {
        isBusy = true;
        const ctx = testCanvas.getContext('2d');
        
        // Dynamic Crop Logic
        const vW = video.videoWidth;
        const vH = video.videoHeight;
        const sw = vW * 0.6;
        const sh = vH * 0.15;
        const sx = (vW - sw) / 2;
        const sy = (vH - sh) / 2;

        testCanvas.width = sw;
        testCanvas.height = sh;
        
        // Image Pre-processing for AI
        ctx.filter = 'contrast(400%) grayscale(100%)';
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

        const { data: { text } } = await worker.recognize(testCanvas);
        const clean = text.replace(/[^0-9.\- ]/g, '').trim();
        
        testOutput.innerText = clean || "Searching...";
        processData(clean);
        
        isBusy = false;
    }
    requestAnimationFrame(scanLoop);
}

// 5. Data Stabilization Logic
function processData(text) {
    const parts = text.split(/\s+/).filter(p => p.length > 4);
    
    if (parts.length >= 2) {
        const lat = parseFloat(parts[0]);
        const lng = parseFloat(parts[1]);
        
        if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
            if (text === lastResult) {
                stability = Math.min(100, stability + 20);
            } else {
                stability = 20;
                lastResult = text;
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
    const pos = [lat, lng];
    map.setView(pos, 16);
    marker.setLatLng(pos);
    coordDisplay.innerText = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}
