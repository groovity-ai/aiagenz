const fs = require('fs');
const file = '/Users/muhmirza/Workspace/aiagenz/openclaw.mjs';

const content = fs.readFileSync(file, 'utf8');

// The connect schema should define "minProtocol", "maxProtocol", "client", and possibly "token" / "password".
// Let's search for "ConnectParams" or "minProtocol" definition.
const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('minProtocol') && lines[i].includes('maxProtocol')) {
        console.log(`--- MATCH on line ${i} ---`);
        console.log(lines[i].substring(0, 500) + '...');
        console.log('-----------------------------');
    }
}
