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

// Initialize Map immediately
map = L.map('map', { zoomControl: false }).setView([0, 0], 2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
marker = L.marker([0, 0]).addTo(map);

// Settings UI Controls
gearBtn.onclick = () => settingsTab.classList.remove('hidden');
closeBtn.onclick = () => settingsTab.classList.add('hidden');

// Initialization Flow
initBtn.onclick = async () => {
    // 1. Check for HTTPS (Security Guard)
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
        alert("SECURITY: Camera requires HTTPS. Please host on a secure server.");
        return;
    }

    initBtn.disabled = true;
    initBtn.innerText = "OPENING CAMERA...";
    
    try {
        // 2. Request Camera
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } } 
        });
        video.srcObject = stream;
        document.getElementById('cam-status').innerText = "Camera: 🟢 Active";
        
        // 3. Request AI Engine
        initBtn.innerText = "LOADING AI ENGINE...";
        worker = await Tesseract.createWorker();
        await worker.loadLanguage('eng');
        await worker.initialize('eng');
        
        // Whitelist only coordinate characters for higher speed/accuracy
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
        console.error(err);
        alert("Permission Denied or Device Conflict. Check browser settings.");
        initBtn.disabled = false;
        initBtn.innerText = "RETRY ACCESS";
    }
};

async function scanLoop() {
    // Only run if video is playing and worker isn't currently processing a frame
    if (video.readyState === video.HAVE_ENOUGH_DATA && !isBusy && isStarted) {
        isBusy = true;
        const ctx = testCanvas.getContext('2d');
        
        // Calculate the crop area from the center focus box
        const vW = video.videoWidth;
        const vH = video.videoHeight;
        
        // Match the focus-box proportions
        const sw = vW * 0.6; 
        const sh = vH * 0.15;
        const sx = (vW - sw) / 2;
        const sy = (vH - sh) / 2;

        testCanvas.width = sw;
        testCanvas.height = sh;
        
        // Digital Image Processing: Grayscale + High Contrast
        ctx.filter = 'contrast(400%) grayscale(100%) brightness(110%)';
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

        // Send cropped image to Tesseract
        const { data: { text } } = await worker.recognize(testCanvas);
        const cleanText = text.replace(/[^0-9.\- ]/g, '').trim();
        
        testOutput.innerText = cleanText || "Scanning...";
        
        processCoordinates(cleanText);
        isBusy = false;
    }
    // High-frequency loop
    setTimeout(scanLoop, 150);
}

function processCoordinates(text) {
    // Split by spaces to find two distinct numbers
    const parts = text.split(/\s+/).filter(p => p.length > 4);
    
    if (parts.length >= 2) {
        const lat = parseFloat(parts[0]);
        const lng = parseFloat(parts[1]);
        
        // Basic GPS bounds check
        if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
            
            // DATA STABILIZATION: Only update map if reading is consistent
            if (text === lastResult) {
                stability = Math.min(100, stability + 25); // Needs 4 identical frames
            } else {
                stability = 10;
                lastResult = text;
            }
            
            if (stability >= 100) {
                updateMap(lat, lng);
                stability = 0; // Reset after lock
            }
        }
    } else {
        // Decay stability if no numbers are seen
        stability = Math.max(0, stability - 5);
    }
    
    // Update both progress bars
    testStab.style.width = stability + "%";
    mainStab.style.width = stability + "%";
}

function updateMap(lat, lng) {
    // Haptic feedback for user
    if (navigator.vibrate) navigator.vibrate(70);
    
    const pos = [lat, lng];
    map.setView(pos, 15);
    marker.setLatLng(pos);
    coordDisplay.innerText = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    document.getElementById('address').innerText = "Location Verified & Locked";
}
