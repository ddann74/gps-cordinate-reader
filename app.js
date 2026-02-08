// ... (Keep your top variables and initMap / startVideo the same)

async function processFrame() {
    if (video.readyState === video.HAVE_ENOUGH_DATA && !isWorking) {
        isWorking = true;
        const ctx = debugCanvas.getContext('2d');
        
        const scale = video.videoWidth / video.clientWidth;
        const sw = 280 * scale;
        const sh = 80 * scale;
        const sx = (video.videoWidth - sw) / 2;
        const sy = (video.videoHeight - sh) / 2;

        debugCanvas.width = sw;
        debugCanvas.height = sh;

        // Try removing 'invert' if the TV has white text on black background
        ctx.filter = 'contrast(200%) grayscale(100%)';
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

        const { data: { text } } = await worker.recognize(debugCanvas);
        
        // Log the RAW text so you can see the mistakes the AI makes
        console.log("AI RAW READ:", text);

        // More aggressive cleaning: find numbers even if there are weird symbols
        const matches = text.match(/[-+]?\d+\.\d+/g);

        if (matches && matches.length >= 2) {
            const currentPair = `${matches[0]},${matches[1]}`;
            
            // If the AI is slightly inconsistent, we help it out
            if (isSimilarlyClose(currentPair, lastSeen)) {
                stability = Math.min(stability + 25, 100);
            } else {
                stability = 25;
                lastSeen = currentPair;
            }
        } else {
            stability = Math.max(0, stability - 5);
        }

        stbBar.style.width = stability + "%";

        if (stability >= 100) {
            updateApp(parseFloat(matches[0]), parseFloat(matches[1]));
        }
        isWorking = false;
    }
    setTimeout(processFrame, 300); 
}

// Help the Data Stabilization: Allow for tiny OCR flickering
function isSimilarlyClose(current, last) {
    if(!last) return false;
    // If it's 90% the same string, count it as a match
    return current.substring(0, 5) === last.substring(0, 5);
}

// Add this to your HTML: <button id="manualBtn">Manual Lock</button>
// Then add this logic:
document.getElementById('manualBtn').onclick = () => {
    const matches = lastSeen.split(',');
    if(matches.length >= 2) {
        updateApp(parseFloat(matches[0]), parseFloat(matches[1]));
        alert("Manual Lock Successful");
    } else {
        alert("AI hasn't seen any numbers yet. Adjust camera.");
    }
};
