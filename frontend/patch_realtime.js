const fs = require('fs');
let code = fs.readFileSync('src/realtime-main.js', 'utf8');

if (!code.includes("splash-mode")) {
    const splashInit = `
  const splashMode = document.getElementById('splash-mode');
  if (splashMode) {
      const modeStr = (config?.gameMode || 'race').toUpperCase();
      const trackStr = (config?.trackId || 'COCOA TEMPLE').replace(/_/g, ' ').toUpperCase();
      splashMode.textContent = modeStr + " - " + trackStr;
  }
`;
    // Insert after 'setStatus(`Connected...'
    code = code.replace("setStatus(`Connected (${roomName}). Waiting for match start...`);", 
                        "setStatus(`Connected (${roomName}). Waiting for match start...`);\n" + splashInit);
    
    const uiUpdate = `
    // Poll players for splash screen
    if (!client.started && client.room && client.room.state && client.room.state.players) {
        const plDiv = document.getElementById('splash-players');
        if (plDiv) {
            let html = '';
            client.room.state.players.forEach(p => {
                const badge = '<div class="splash-player" style="--pcolor:' + (p.playerColor || p.color || '#fff') + '">' + (p.name || 'Player') + ' (' + (p.kartId || p.playerKart || 'Default') + ')</div>';
                html += badge;
            });
            if (plDiv.innerHTML !== html) {
                plDiv.innerHTML = html;
            }
        }
    }
`;
    code = code.replace("if (client.started) {", uiUpdate + "\n    if (client.started) {");
    fs.writeFileSync('src/realtime-main.js', code);
    console.log("Patched realtime-main.js");
} else {
    console.log("Already patched.");
}
