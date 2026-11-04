---
name: Signed QR image URLs
description: Supplier QR URLs can reject otherwise harmless image-sizing parameters.
---

Preserve supplier QR URLs unchanged in email, dashboard, and download links. Only adjust query parameters on explicitly supported unsigned QR renderers.

**Why:** A production Airalo image returned HTTP 200 as stored, but HTTP 403 after adding size and margin parameters. Both email and dashboard independently made this mistake; a broken image did not mean the eSIM purchase failed.

**How to apply:** Use HTML/CSS for supplier-image dimensions. Never reconstruct signed URLs or persist customer QR links in memory. Verify image access separately from eSIM activation.
