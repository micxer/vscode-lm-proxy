# Security Guide for VSCode LM Proxy

## Overview

This extension has been hardened with multiple security layers to protect your Language Model API access. This document explains the security features and how to use them properly.

## Critical Security Features

### 1. Localhost-Only Binding 🔒

**What it does:** The server only accepts connections from `127.0.0.1` (localhost), not from the network.

**Why it matters:** Other computers on your network cannot access your server.

**How to verify:**
```bash
# This should work (from the same machine):
curl http://localhost:4000/

# This should NOT work (from another machine):
curl http://YOUR_IP:4000/
```

### 2. API Key Authentication 🔑

**What it does:** Requires an API key for all requests (except the status endpoint).

**Why it matters:** Even local applications cannot access your API without the correct key.

**How to enable:**

1. Generate a secure random key:
   ```bash
   # On macOS/Linux:
   openssl rand -hex 32

   # On Windows (PowerShell):
   -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | % {[char]$_})
   ```

2. Add to VSCode settings (`settings.json`):
   ```json
   {
     "vscode-lm-proxy.apiKey": "your-secure-random-key-here"
   }
   ```

3. Use in requests:
   ```bash
   # Using X-API-Key header (recommended):
   curl http://localhost:4000/openai/v1/chat/completions \
     -H "Content-Type: application/json" \
     -H "X-API-Key: your-secure-random-key-here" \
     -d '{"model":"vscode-lm-proxy","messages":[{"role":"user","content":"Hello"}]}'

   # Or using Bearer token:
   curl http://localhost:4000/openai/v1/chat/completions \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer your-secure-random-key-here" \
     -d '{"model":"vscode-lm-proxy","messages":[{"role":"user","content":"Hello"}]}'
   ```

**⚠️ WARNING:** If you don't set an API key, the server will run WITHOUT authentication. This is only acceptable if:
- You're the only user on your computer
- You trust all applications on your computer
- You understand the security risks

### 3. CORS Protection 🛡️

**What it does:** Blocks browser-based requests by default.

**Why it matters:** Prevents malicious websites from making requests to your local server.

**Default behavior:** CORS is **DISABLED** (secure). Browsers cannot make requests.

**When to enable:**
Only enable CORS if you're building a web application that needs to access the API from the browser AND you understand the security risks.

**How to enable (not recommended):**
```json
{
  "vscode-lm-proxy.enableCORS": true
}
```

When enabled:
- Browser requests are allowed
- API key is still required
- Only use for development/testing

### 4. Request Size Limits

**What it does:** Limits JSON payloads to 10MB.

**Why it matters:** Prevents memory exhaustion attacks.

**Impact:** Most legitimate requests are well under 10MB.

## Security Best Practices

### ✅ DO

1. **Always set an API key** in production use
2. **Use strong, random keys** (at least 32 characters)
3. **Keep your API key secret** - don't commit it to version control
4. **Rotate keys periodically** if you suspect compromise
5. **Monitor the output panel** for unauthorized access attempts
6. **Keep CORS disabled** unless absolutely necessary

### ❌ DON'T

1. **Don't share your API key** with others
2. **Don't commit API keys** to Git repositories
3. **Don't enable CORS** unless you specifically need browser access
4. **Don't use weak or predictable keys** (e.g., "password123")
5. **Don't expose the port** through port forwarding or proxies

## Security Configuration Examples

### Maximum Security (Recommended)
```json
{
  "vscode-lm-proxy.port": 4000,
  "vscode-lm-proxy.apiKey": "abc123...long-random-string",
  "vscode-lm-proxy.enableCORS": false,
  "vscode-lm-proxy.logLevel": 1
}
```

### Development/Testing Only
```json
{
  "vscode-lm-proxy.port": 4000,
  "vscode-lm-proxy.apiKey": "",
  "vscode-lm-proxy.enableCORS": false,
  "vscode-lm-proxy.logLevel": 0
}
```
**⚠️ WARNING:** This configuration has NO authentication!

### Browser Development (Use with caution)
```json
{
  "vscode-lm-proxy.port": 4000,
  "vscode-lm-proxy.apiKey": "abc123...long-random-string",
  "vscode-lm-proxy.enableCORS": true,
  "vscode-lm-proxy.logLevel": 0
}
```

## Monitoring Security

### Check for Unauthorized Access Attempts

Look for these in the output panel:
```
[WARN] Unauthorized access attempt { path: '/openai/v1/chat/completions', ... }
```

### Enable Debug Logging

For security auditing:
```json
{
  "vscode-lm-proxy.logLevel": 0
}
```

This logs all requests/responses (but be aware it may log sensitive data).

## Threat Model

### What This Extension Protects Against

✅ **Network-based attacks** - Server only listens on localhost
✅ **Unauthorized local access** - API key required
✅ **Cross-site attacks** - CORS disabled by default
✅ **Memory exhaustion** - Request size limits
✅ **Browser-based attacks** - CORS protection

### What This Extension Does NOT Protect Against

❌ **Malicious local applications** with your API key
❌ **Physical access** to your computer
❌ **VSCode extension vulnerabilities**
❌ **Keyloggers or screen recorders**
❌ **Compromised VSCode workspace**

## Security Updates

When updating this extension:
1. Review the changelog for security-related changes
2. Test in a development environment first
3. Regenerate API keys if advised in release notes

## Reporting Security Issues

If you discover a security vulnerability, please:
1. **Do NOT** open a public GitHub issue
2. Email the maintainer directly (see repository)
3. Provide detailed steps to reproduce
4. Allow time for a patch before public disclosure

## Additional Resources

- [VSCode Extension Security](https://code.visualstudio.com/api/references/extension-guidelines#security)
- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)

## Version History

- **1.0.6** (2025-03-13): Security hardening
  - Added localhost-only binding
  - Added API key authentication
  - Added CORS protection
  - Reduced JSON size limit to 10MB
  - Removed debug console.log statements

---

**Remember:** Security is a shared responsibility. Configure these settings appropriately for your use case and environment.
