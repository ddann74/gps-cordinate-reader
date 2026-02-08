let consistencyCount = 0; // New variable to track identical reads

function processData(text) {
    // 1. Extract only valid-looking GPS segments (digits, dots, dashes)
    const matches = text.match(/-?\d+\.\d+/g); 
    
    if (matches && matches.length >= 2) {
        const lat = parseFloat(matches[0]);
        const lng = parseFloat(matches[1]);
        
        // 2. Strict Range Validation
        const isValidRange = Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
        
        if (isValidRange) {
            // 3. CONSISTENCY CHECK: Does this match the previous frame?
            // This prevents "jumpy" numbers from 8s looking like 0s.
            if (text.trim() === lastResult) {
                consistencyCount++;
            } else {
                consistencyCount = 0;
                lastResult = text.trim();
            }

            // Only update the display if the AI is "sure" (seen it 3 times)
            if (consistencyCount >= 3) {
                currentLat = lat;
                currentLng = lng;
                coordDisplay.innerText = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
                coordDisplay.style.color = "var(--accent)";
                
                // Advance the Stabilization Bar based on your requested feature
                stability = Math.min(100, stability + 10);
            }
            
            // Auto-lock if stabilization hits 100
            if (stability >= 100) {
                updatePosition(lat, lng);
                stability = 0;
            }
        }
    } else {
        // Slowly decay stability and fade text if data is lost
        stability = Math.max(0, stability - 2);
        coordDisplay.style.color = "#444";
        consistencyCount = 0;
    }
    stabFill.style.width = stability + "%";
}
