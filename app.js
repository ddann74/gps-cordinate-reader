// ... [Keep top variables same as v1.6.3] ...

initBtn.onclick = async () => {
    initBtn.innerText = "LOADING AI...";
    initBtn.disabled = true;

    // Check for Secure Context
    if (!window.isSecureContext) {
        initBtn.innerText = "ERROR: HTTPS REQ";
        initBtn.style.background = "#ff4444";
        return;
    }

    if (worker) try { await worker.terminate(); } catch(e){}
    
    try {
        initBtn.innerText = "STARTING CAM...";
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment", width: { ideal: 1280 } } 
        });
        video.srcObject = stream;
        
        initBtn.innerText = "CONFIGURING AI...";
        worker = await Tesseract.createWorker();
        await worker.loadLanguage('eng');
        await worker.initialize('eng');
        await worker.setParameters({ 
            tessedit_char_whitelist: '0123456789.- NSEW', 
            tessedit_pageseg_mode: '7' 
        });
        
        document.getElementById('ai-status').innerText = "AI: ONLINE";
        document.getElementById('cam-status').innerText = "CAM: ACTIVE";
        initBtn.style.display = 'none'; 
        closeBtn.style.display = 'block';
        document.getElementById('test-zone').style.display = 'block';
        
        if (!isStarted) { isStarted = true; scanLoop(); }
    } catch (err) { 
        console.error(err);
        initBtn.disabled = false;
        if (err.name === "NotAllowedError") {
            initBtn.innerText = "ERROR: CAM BLOCKED";
        } else {
            initBtn.innerText = "RETRY INITIALIZE";
        }
        initBtn.style.background = "#ff4444";
    }
};

// ... [Keep remaining scanLoop and processData logic same as v1.6.3] ...
