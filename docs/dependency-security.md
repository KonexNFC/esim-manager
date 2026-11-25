# Dependency security remediation

The November 2026 findings were checked against the current dependency audit,
including production and development dependencies. Direct parents were upgraded
first; the existing Vite 7 and Tailwind 3 major versions were retained.

| Affected package | Patched version now locked |
| --- | --- |
| proxy-addr | 2.0.8 (already patched before this change) |
| body-parser | 2.4.0 |
| axios | 1.21.1 |
| follow-redirects | 1.16.3 |
| vite | 7.3.8 |
| source-map-js | 1.2.4 |
| browserslist | 4.29.6 |
| zod | 4.6.7 |
| nanoid | 3.3.20 |
| qs | 6.17.1 |
| postcss-selector-parser | 6.1.6 (both previously affected copies) |

## Compatibility and overrides

Zod's fix requires version 4. The Drizzle schema adapter, React Hook Form resolver,
and validation-error adapter were upgraded together to support it. Regression
tests cover generated insert schemas, invalid form fields, cross-field
refinements, strict supplier terms, raw webhook bytes, JSON and form bodies.

The latest Express and SendGrid parents still permit older body-parser, Axios
and follow-redirects versions. Overrides enforce patched minimums throughout the
tree. The latest Tailwind typography plugin still pins selector-parser 6.0.10,
so a same-major override replaces all selector-parser 6 copies.
Keep the overrides until the parent dependency requirements enforce safe
versions; do not remove them just because the current lockfile is patched.

## Withdrawn deepmerge finding

`GHSA-gcqx-w48m-w2h4` was withdrawn on 2026-11-16 and is not an active
vulnerability. The maintained SendGrid helpers package still uses deepmerge
4.3.1, its latest release. No artificial version override or email-provider
replacement was made for a withdrawn advisory.

Source: <https://osv.dev/vulnerability/GHSA-gcqx-w48m-w2h4>

This accounts for all 34 original findings: 32 active findings remediated, one
already-patched proxy-addr finding, and one withdrawn deepmerge finding.
