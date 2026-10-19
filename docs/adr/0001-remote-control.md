# Remote control on Cloudflare with local processing

Status: accepted architecture; deployment and end-to-end validation pending.

Use one repository for the React control page, Cloudflare Worker API, D1 job state, Windows worker and existing CapCut MCP scripts. Use the user's Cloudflare account and supplied workers.dev hostname; no purchased domain is required. Use Google through Cloudflare Access for user login, allowing the two addresses specified by the user. Authenticate machine endpoints separately with a scoped Access service token and application worker secret.

Keep footage in Google Drive and on the PC through Drive for desktop. The PC worker polls outbound HTTPS, so there is no inbound local server or tunnel. D1 stores job metadata and atomic, expiring leases. One processor runs at a time. Native project writes use CapCut MCP and wait for CapCut to close. Jobs create new review drafts, never automatically export or publish.

For the first implementation, cut selection is chronological timed speech with near-duplicate removal and a soft duration target. Review notes are preserved but not interpreted. Semantic story selection, visual take ranking, chat-to-job integration and installation as a background task remain separate follow-up work.
