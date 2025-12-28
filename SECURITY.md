# Security Implementation Guide

## Overview

This document outlines **comprehensive security measures** implemented across the entire Connect Me If U Can platform to prevent malicious code execution, XSS attacks, injection attacks, CSRF, and other vulnerabilities.

---

## 🛡️ Input Validation & Sanitization

### Backend (Node.js & Cloudflare Worker)

#### Comprehensive Sanitization Function
```javascript
function sanitizeInput(input, maxLength = 100) {
  if (typeof input !== 'string') return '';
  return input
    .trim()
    .slice(0, maxLength)
    .replace(/[<>"'`]/g, '')      // Remove XSS dangerous characters
    .replace(/javascript:/gi, '')  // Remove javascript: protocol
    .replace(/on\w+=/gi, '')       // Remove event handlers (onclick, onerror, etc)
    .replace(/\0/g, '');           // Remove null bytes
}
```

#### Enhanced Validation Functions
```javascript
// Username: 3-20 alphanumeric, underscore, dash only
function isValidUsername(username) {
  return typeof username === 'string' && 
         /^[a-zA-Z0-9_-]{3,20}$/.test(username);
}

// Room ID: Exactly 4 uppercase letters A-Z
function isValidRoomId(roomId) {
  return typeof roomId === 'string' && /^[A-Z]{4}$/.test(roomId);
}

// Access Code: 4-20 uppercase alphanumeric
function isValidAccessCode(code) {
  return typeof code === 'string' && 
         /^[A-Z0-9]{4,20}$/.test(code);
}
```

#### Applied To All Endpoints
- ✅ `/auth/check` - Username sanitization & validation
- ✅ `/auth/verify` - Username & code sanitization + format validation
- ✅ `/auth/create` - Username & optional code validation
- ✅ `/auth/login` - Token-based authentication
- ✅ `/rooms/create` - Room ID & username strict validation
- ✅ `/rooms/join` - Room ID & username sanitization
- ✅ `/rooms/:id/status` - Room ID format validation
- ✅ `/rooms/:id` (DELETE) - Host verification + room ID validation
- ✅ `/settings/:username` - Username validation

---

## 🚫 Rate Limiting

### Node.js Implementation
```javascript
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 100; // max requests per IP per window

app.use((req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const requestData = requestCounts.get(ip) || { 
    count: 0, 
    resetTime: now + RATE_LIMIT_WINDOW 
  };
  
  if (now > requestData.resetTime) {
    requestData.count = 0;
    requestData.resetTime = now + RATE_LIMIT_WINDOW;
  }
  
  requestData.count++;
  requestCounts.set(ip, requestData);
  
  if (requestData.count > RATE_LIMIT_MAX) {
    return res.status(429).json({ 
      error: 'Too many requests. Please try again later.' 
    });
  }
  
  next();
});
```

**Protection Limits:**
- **100 requests per minute** per IP address
- Applies to **all endpoints**
- Returns **HTTP 429** (Too Many Requests) when exceeded
- Automatic reset after time window

---

## 🔐 Security Headers

### HTTP Security Headers (All Responses)
```javascript
res.setHeader('X-Content-Type-Options', 'nosniff');
res.setHeader('X-Frame-Options', 'DENY');
res.setHeader('X-XSS-Protection', '1; mode=block');
res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
```

### Header Explanations:
- **X-Content-Type-Options: nosniff** - Prevents MIME-type sniffing attacks
- **X-Frame-Options: DENY** - Prevents clickjacking (blocks iframe embedding)
- **X-XSS-Protection: 1; mode=block** - Enables browser's built-in XSS filter
- **Strict-Transport-Security** - Forces HTTPS connections for 1 year
```

**Rules:**
- Exactly 4 characters
- Uppercase letters A-Z only
- No numbers, symbols, or special characters

### Rate Limiting

Prevents abuse and brute-force attacks:

```javascript
// Room creation: 5 attempts per minute per token
checkRateLimit(`room_create_${token}`, 5, 60000)

// Room joining: 20 attempts per minute per token
checkRateLimit(`room_join_${token}`, 20, 60000)
```

**Limits:**
- Room creation: **5/minute**
- Room joining: **20/minute**
- Based on authentication token

**Production Recommendation:** Use Redis or Cloudflare KV for distributed rate limiting.

### Room Capacity Limits

Prevents resource exhaustion:

```javascript
maxPlayers: 8  // Maximum 8 players per room
```

### Authentication Token Security

- 64-character random tokens (256-bit entropy)
- Bearer token authentication
- Tokens validated on every request
- No predictable patterns

### CORS Configuration

**Current:** Permissive for development
```javascript
'Access-Control-Allow-Origin': '*'
```

**Production Recommendation:**
```javascript
'Access-Control-Allow-Origin': 'https://connectmeifucan.com'
'Access-Control-Allow-Credentials': 'true'
```

---

## Android App Security

### WebView Hardening

Prevents file access and malicious JavaScript execution:

```java
// Disable file system access
settings.setAllowFileAccess(false);
settings.setAllowFileAccessFromFileURLs(false);
settings.setAllowUniversalAccessFromFileURLs(false);
settings.setAllowContentAccess(false);

// Disable location and database
settings.setGeolocationEnabled(false);
settings.setDatabaseEnabled(false);

// Enable Safe Browsing (Android 8.0+)
settings.setSafeBrowsingEnabled(true);
```

### URL Whitelist

Only trusted domains are allowed:

```java
public boolean shouldOverrideUrlLoading(WebView view, String url) {
    // Only allow navigation to:
    // - https://connectmeifucan.com/*
    // - http://localhost:* (development)
    if (url.startsWith("https://connectmeifucan.com/") || 
        url.startsWith("http://localhost:")) {
        return false; // Allow
    }
    return true; // Block
}
```

### JavaScript Bridge Security

Values are escaped before injection:

```java
// Sanitize before injecting into JavaScript
String escapedRoomId = roomId.replaceAll("[^A-Z]", "");
String escapedUsername = username.replaceAll("[^a-zA-Z0-9_-]", "");
String escapedToken = token.replaceAll("[^a-zA-Z0-9]", "");
```

### Input Validation

Android app validates all inputs before sending to backend:

```java
// Room ID: Only A-Z uppercase
roomId = roomId.replaceAll("[^A-Z]", "");

// Strict format check
if (!roomId.matches("^[A-Z]{4}$")) {
    showError("Invalid room ID");
}
```

---

## Frontend Security

### Content Security Policy (CSP)

**Recommended for production:**

```html
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self'; 
               script-src 'self' 'unsafe-inline'; 
               connect-src 'self' https://api.connectmeifucan.com;
               style-src 'self' 'unsafe-inline';
               img-src 'self' data: https:;">
```

### XSS Prevention

- All user inputs displayed through `textContent` not `innerHTML`
- No `eval()` or `Function()` constructor usage
- Template literals used safely
- LocalStorage data validated before use

### Token Storage

```javascript
// Tokens stored in localStorage (HTTP-only cookies preferred for production)
localStorage.setItem('cmuc_auth_v1', JSON.stringify({ username, token }));
```

**Production Recommendation:** Use HTTP-only, Secure cookies instead of localStorage.

---

## Network Security

### HTTPS Enforcement

**Production Requirements:**
- All traffic over HTTPS
- HSTS headers enabled
- SSL/TLS 1.3 minimum

### Recommended Headers

Add to all responses:

```javascript
headers: {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=()'
}
```

---

## Data Protection

### Password/Token Management

- Tokens generated with cryptographically secure random number generator
- No passwords stored (authentication via access codes)
- Access codes hashed in production (recommended)

### Data Retention

Room data cleanup:

```javascript
// Recommended: Auto-expire inactive rooms after 24 hours
if (Date.now() - new Date(room.createdAt).getTime() > 86400000) {
  await env.ROOMS.delete(roomId);
}
```

### User Data

- Minimal data collection
- No sensitive personal information stored
- Username and settings only
- No email, phone, or payment data

---

## Vulnerability Prevention

### SQL Injection

**Status:** ✅ Not Applicable  
Using JSON file storage and KV (no SQL database).

### XSS (Cross-Site Scripting)

**Status:** ✅ Protected  
- Input sanitization on backend
- Output escaping in JavaScript bridge
- CSP headers (recommended for production)

### CSRF (Cross-Site Request Forgery)

**Status:** ⚠️ Partially Protected  
- Bearer token authentication
- **Recommendation:** Add CSRF tokens for state-changing operations

### Injection Attacks

**Status:** ✅ Protected  
- Strict input validation (regex patterns)
- Sanitization of all user inputs
- No `eval()` or dynamic code execution

### Brute Force

**Status:** ✅ Protected  
- Rate limiting on room creation/joining
- Token-based authentication
- **Recommendation:** Add progressive delays after failed attempts

### DoS (Denial of Service)

**Status:** ⚠️ Partially Protected  
- Rate limiting implemented
- Room capacity limits (8 players)
- **Recommendation:** Add Cloudflare DDoS protection

### Man-in-the-Middle

**Status:** ✅ Protected (Production)  
- HTTPS enforced
- Certificate pinning (optional for Android)

---

## Security Testing Checklist

### Backend Tests

- [ ] Test room creation with malicious room IDs (`<script>`, `'; DROP TABLE--`)
- [ ] Test username injection attempts
- [ ] Verify rate limiting works (exceed 5 room creations/minute)
- [ ] Test oversized payloads (>1MB JSON)
- [ ] Verify CORS headers
- [ ] Test token validation (expired, invalid, missing)
- [ ] Test room capacity limit (try joining 9th player)

### Android Tests

- [ ] Test WebView with malicious URLs
- [ ] Verify file:// URLs are blocked
- [ ] Test JavaScript bridge with XSS payloads
- [ ] Verify external domains are blocked
- [ ] Test with malformed room IDs
- [ ] Test with extremely long usernames (>100 chars)

### Frontend Tests

- [ ] Test localStorage tampering
- [ ] Verify CSP headers (if implemented)
- [ ] Test API calls with invalid tokens
- [ ] Test XSS in username display
- [ ] Verify HTTPS enforcement

---

## Incident Response

### If Vulnerability Discovered

1. **Document**: Record the vulnerability details
2. **Assess**: Determine severity and impact
3. **Patch**: Implement fix immediately
4. **Test**: Verify fix doesn't break functionality
5. **Deploy**: Push update to production
6. **Notify**: Inform affected users if necessary
7. **Review**: Analyze root cause and prevent recurrence

### Security Contact

Report security issues to: **[Your Security Contact Email]**

**Do NOT publicly disclose vulnerabilities** until patched.

---

## Compliance

### GDPR Considerations

- **Right to Access**: Users can request their data
- **Right to Deletion**: Implement user data deletion
- **Data Minimization**: Only collect necessary data
- **Consent**: Get explicit consent for data collection

### COPPA (Children's Privacy)

If app is for children under 13:
- Parental consent required
- No behavioral advertising
- Data collection restrictions

---

## Future Security Enhancements

### Planned Improvements

1. **Two-Factor Authentication (2FA)**
   - Optional 2FA for accounts
   - TOTP or SMS-based

2. **Room Passwords**
   - Optional password protection for private rooms
   - Hashed with bcrypt/scrypt

3. **Account Recovery**
   - Email verification for account recovery
   - Security questions (optional)

4. **Audit Logging**
   - Log all authentication attempts
   - Track room creation/joining events
   - Alert on suspicious patterns

5. **IP-Based Rate Limiting**
   - Limit requests per IP address
   - Block known malicious IPs

6. **Certificate Pinning**
   - Pin SSL certificates in Android app
   - Prevent MITM attacks

7. **Encrypted Storage**
   - Encrypt sensitive data at rest
   - Use Android Keystore for tokens

---

## Security Best Practices Summary

### ✅ Implemented

- Input sanitization and validation
- Rate limiting
- WebView security hardening
- URL whitelisting
- Token-based authentication
- Room capacity limits
- XSS prevention
- Strict regex validation

### ⚠️ Recommended for Production

- CORS whitelist (specific origin)
- CSRF tokens
- HTTP-only cookies for tokens
- Security headers (CSP, HSTS, etc.)
- Certificate pinning
- Distributed rate limiting (Redis/KV)
- Room auto-expiration (24h TTL)
- DDoS protection (Cloudflare)
- Audit logging

### 📝 Pending

- 2FA support
- Room passwords
- Email verification
- IP-based blocking
- Progressive delays on failed auth

---

**Last Updated:** December 28, 2025  
**Version:** 1.0.0  
**Security Level:** Medium (suitable for beta/development)

**Production Deployment:** Implement ⚠️ recommendations before public launch.
