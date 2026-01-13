# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in ParaApp, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please use GitHub's private vulnerability reporting:

**Settings > Security > Advisories > New draft**

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (optional)

### Response Timeline

- **Initial response**: Within 48 hours
- **Status update**: Within 7 days
- **Fix timeline**: Depends on severity, typically 30-90 days

## Scope

This policy applies to:

- ParaApp mobile application (this repository)
- ParaApp notification server (`/server` directory)

## Out of Scope

- Parasite Pool API (report to Parasite Pool directly)
- Third-party dependencies (report to upstream maintainers)

## Security Considerations

ParaApp handles:

- Bitcoin addresses (public, for pool lookups)
- Push notification tokens (device-specific, stored server-side)
- Local network miner discovery (IP addresses stay on-device)

We do not store or transmit:

- Private keys
- Passwords
- Personal identification information
