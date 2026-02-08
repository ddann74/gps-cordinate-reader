const video = document.getElementById('webcam');
const settingsTab = document.getElementById('settings-tab');
const initBtn = document.getElementById('init-system');
const gearBtn = document.getElementById('gear-btn');
const camStatusTxt = document.getElementById('camera-status');
const aiStatusTxt = document.getElementById('ai-status');
const stabFill = document.getElementById('stability-fill');

let map, marker, worker;
let isStarted = false;

// Initialize Map immediately
map = L.map('map', { zoomControl: false }).setView([0, 0], 2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
marker = L.marker([0, 0]).addTo(map);

// Open/Close Settings
gearBtn.onclick = () => settingsTab.classList.remove('hidden');

// MAIN INITIALIZATION (Triggered by user click)
initBtn.onclick = async () => {
    initBtn.innerText = "STARTING...";
    initBtn.disabled = true;

    // 1. Request Camera
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment", width: { ideal: 1280 } } 
        });
        video.srcObject = stream;
        camStatusTxt.innerText = "Camera: 🟢 Active";
    } catch (err) {
        camStatusTxt.innerText = "Camera: ❌ Access Denied";
        initBtn.disabled = false;
        initBtn.innerText = "RETRY PERMISSIONS";
        return;
    }

    // 2. Start AI
    try {
        aiStatusTxt.innerText = "AI Engine: 🟡 Loading...";
        worker = await Tesseract.createWorker();
        await worker.loadLanguage('eng');
        await worker.initialize('eng');
        await worker.setParameters({
            tessedit_char_whitelist: '0123456789.- ',
            tessedit_pageseg_mode: '7'
        });
        aiStatusTxt.innerText = "AI Engine: 🟢 Ready";
    } catch (e) {
        aiStatusTxt.innerText = "AI Engine: ❌ Error";
    }

    // 3. Close Tab and Start Loop
    setTimeout(() => {
        settingsTab.classList.add('hidden');
        if (!isStarted) {
            isStarted = true;
            scanLoop();
        }
    }, 1000);
};

// ... include your scanLoop, parseCoords, and lockPoint functions here ...
