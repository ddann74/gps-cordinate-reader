// REPLACE the matching logic inside scanLoop() and the Button listener with this:

// This new Regex is "greasier" - it grabs numbers even if they are broken up
const matches = lastResultText.match(/[-+]?\d+[\.\,]\d+/g); 

if (matches && matches.length >= 2) {
    // Clean up commas into dots just in case the AI misreads a "." as a ","
    const lat = parseFloat(matches[0].replace(',', '.'));
    const lng = parseFloat(matches[1].replace(',', '.'));
    
    const currentPair = `${lat},${lng}`;
    
    if (currentPair === lastCleanPair) {
        stability += 34; 
    } else {
        stability = 34;
        lastCleanPair = currentPair;
    }

    if (stability >= 100) {
        triggerLock(lat, lng, "AUTO");
        stability = 0;
    }
}
