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
- Local miner IP addresses and settings (stored on-device)
- Miner passwords and API keys when a supported device requires them. These are
  kept in the platform's secure credential storage and sent only to the local
  miner selected by the user; they are never sent to ParaApp servers.

ParaApp does not handle or transmit Bitcoin private keys.

Many supported miners expose only local HTTP or raw TCP management protocols,
without TLS. ParaApp retains those protocols for hardware compatibility. Use
miner management on a trusted private LAN or VLAN, do not expose miner ports to
the public Internet, and be aware that an untrusted device on the same network
may be able to observe, modify, or replay cleartext miner traffic.
