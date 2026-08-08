# Security Policy

## Supported version

Security fixes are applied to the latest baseline release only. The current supported baseline is `2.3.7`.

## Reporting a vulnerability

Do not post proof-of-concept files containing private data in a public issue.

Use GitHub's **Security** tab and private vulnerability reporting for this repository. If private reporting has not been enabled, open a minimal public issue requesting a private contact channel; include no exploit details, source files, or user data.

Reports should include the affected version, browser and operating system, a minimal non-sensitive reproduction, impact, and any mitigation already attempted.

## Data handling

The viewer processes user files in the browser. Recovery drafts store only changed cell values locally in the browser. Security reports should never attach real customer, employee, or production data.

SheetJS is a pinned build input (`0.18.5`) with a SHA-256 check in the release build. It is embedded in the dedicated Excel Worker and is not loaded from a CDN at runtime. The generated page includes a CSP that blocks network connections and only permits the generated application script and Blob Workers. Deployments should preserve that policy as described in [docs/deployment-security.md](docs/deployment-security.md).
