const fs = require('fs');
const file = '/Users/muhmirza/Workspace/aiagenz/openclaw.mjs';

const content = fs.readFileSync(file, 'utf8');

// The connect schema should define "minProtocol", "maxProtocol", "client", and possibly "token" / "password".
// Let's search for "ConnectParams" or "minProtocol" definition.
const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('operator.write') || lines[i].includes('missing scope:')) {
        console.log(`--- MATCH on line ${i} ---`);
        const start = Math.max(0, i - 5);
        const end = Math.min(lines.length, i + 10);
        for (let j = start; j < end; j++) {
            console.log(`${j}: ${lines[j].substring(0, 150)}`);
        }
        console.log('-----------------------------');
    }
}
