// ... (Keep the top variables and init code the same) ...

// IMPROVED: Manual Lock Trigger with Debugging
lockBtn.onclick = () => {
    const rawText = testOutput.innerText;
    console.log("Attempting lock on:", rawText);
    
    // We attempt to extract numbers even if the spacing is messy
    const numbers = rawText.match(/-?\d+\.\d+/g); 

    if (numbers && numbers.length >= 2) {
        const lat = parseFloat(numbers[0]);
        const lng = parseFloat(numbers[1]);
        
        if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
            updatePosition(lat, lng);
            lockBtn.style.background = "#fff";
            lockBtn.innerText = "LOCKED ✅";
            setTimeout(() => { 
                lockBtn.style.background = "var(--accent)"; 
                lockBtn.innerText = "Lock Coordinates"; 
            }, 2000);
        } else {
            alert("Invalid GPS Range: " + lat + ", " + lng);
        }
    } else {
        alert("AI hasn't detected a full Lat/Lng pair yet. Keep steady!");
    }
};

// IMPROVED: Data Processing (Regex "Hunter" mode)
function processData(text) {
    // This regex looks for any sequence of numbers/decimals/dashes
    const matches = text.match(/-?\d+\.\d+/g); 
    
    if (matches && matches.length >= 2) {
        const lat = parseFloat(matches[0]);
        const lng = parseFloat(matches[1]);
        
        // Basic GPS validation
        if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
            currentLat = lat;
            currentLng = lng;
            coordDisplay.innerText = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
            coordDisplay.style.color = "var(--accent)";

            // Stabilization logic
            if (text === lastResult) {
                stability = Math.min(100, stability + 25);
            } else {
                stability = 15;
                lastResult = text;
            }
            
            if (stability >= 100) {
                updatePosition(lat, lng);
                stability = 0;
            }
        }
    } else {
        // Fade out coordinates if nothing is found to show it's searching
        coordDisplay.style.color = "#444";
        stability = Math.max(0, stability - 5);
    }
    stabFill.style.width = stability + "%";
}

// ... (Keep updatePosition the same) ...
