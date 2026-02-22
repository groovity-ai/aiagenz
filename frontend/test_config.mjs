import { execSync } from 'child_process';

try {
    const out = execSync(`OPENCLAW_GATEWAY_AUTH_MODE=trusted-proxy OPENCLAW_GATEWAY_TRUSTED_PROXIES='["0.0.0.0/0"]' OPENCLAW_GATEWAY_AUTH_TRUSTED_PROXY_USER_HEADER=x-openclaw-user OPENCLAW_GATEWAY_AUTH_TRUSTEDPROXY_USERHEADER=y-openclaw-user node ../openclaw.mjs config export`, { encoding: 'utf8' });
    console.log("Output:");
    console.log(out.substring(0, 1000)); // Just print the start to see if it exported

    // Actually, export outputs a full JSON. Let's parse it and get gateway
    const config = JSON.parse(out);
    console.log("Parsed Gateway Config:", JSON.stringify(config.gateway, null, 2));

} catch (err) {
    console.error("Exec failed", err.message);
}
