---
date: 2026-07-14T20:59:30+0200
author: Jan Eltner
commit: 55946aa
branch: main
repository: Kapowarr
topic: "usenet_integration"
tags: [research, codebase, searchsource, externaldownloadclient, usenet, prowlarr, sabnzbd]
status: ready
last_updated: 2026-07-14T20:59:30+0200
last_updated_by: Jan Eltner
last_updated_note: "Added follow-up research for usenet integration"
---

# Research: Usenet-Integration (Prowlarr SearchSource + SABnzbd ExternalDownloadClient)

## Research Question

Integrate Usenet as an additional content source for Kapowarr: Prowlarr as SearchSource for comic search, SABnzbd as ExternalDownloadClient for NZB downloads, with automatic NZB download flow and status sync via SABnzbd API.

## Summary

The Kapowarr codebase uses a clean plugin architecture with two key patterns: `SearchSource` (in-memory, auto-discovered via `get_subclasses()`) for search, and `ExternalDownloadClient` (database-persistent, lazy-imported) for download clients. Adding Usenet requires changes across 6 layers: enum definitions, client registration, download handling, polling loop, post-processing, and frontend settings. The FRD decisions favor maximum modularity — new files over changes to existing code — to simplify future patching when Kapowarr releases updates.

Key decisions:
- `DownloadType.USUENET = 3` (new enum value)
- New `search_sources` DB table for Prowlarr configuration
- Separate `UsenetDownloadHandler` (not shared with `DownloadHandler`)
- Separate `PostProcessorUsenet` (reuses existing action functions)
- Separate `Constants.USENET_UPDATE_INTERVAL` for polling
- Separate `add_usenet_client()` in new module (no changes to `external_clients.py`)

## Detailed Findings

### SearchSource Architecture
- `backend/base/definitions.py:891-910` — `SearchSource` ABC with `__init__(query)` and abstract `async search(session) -> List[SearchResultData]`
- `backend/features/search.py:143-167` — `search_multiple_queries()` orchestrates via `get_subclasses(SearchSource)` + `asyncio.gather`
- `backend/features/search.py:154-162` — Deduplication by `result['link']` (uniqueness key)
- `backend/base/definitions.py:588-591` — `SearchResultData` extends `FilenameData` with `link`, `display_title`, `source` fields
- `backend/features/search.py:138-140` — `SearchGetComics` is the sole existing implementation (delegates to `search_getcomics()` in `implementations/getcomics.py:737`)
- **Prowlarr must**: inherit `SearchSource`, implement `async search()`, return `SearchResultData` conforming to schema, produce stable unique `link` values

### ExternalDownloadClient Architecture
- `backend/base/definitions.py:917-965` — `ExternalDownloadClient` ABC with `client_type`, `download_type`, `required_tokens` class attributes
- `backend/implementations/external_clients.py:164-173` — `get_client_types()` lazy imports from `torrent_clients` namespace package + `get_subclasses(BaseExternalClient)`
- `backend/implementations/external_clients.py:214-271` — `ExternalClients.add()` validates credentials via `test()`, INSERTs into `external_download_clients` table
- `backend/implementations/external_clients.py:387-417` — `get_least_used_client(download_type)` SQL filtering by `download_type.value`
- **SABnzbd must**: inherit `BaseExternalClient`, set `client_type='SABnzbd'`, `download_type=DownloadType.USUENET`, `required_tokens=('title', 'base_url', 'api_token')`, implement `test()`, `add_download()`, `get_download()`, `delete_download()`

### DownloadType Enum
- `backend/base/definitions.py:456-459` — Current: `DIRECT = 1`, `TORRENT = 2`. Comment at lines 493-495 explicitly anticipates usenet: "In the future, there'll be sources like 'torrent' and 'usenet'."
- `backend/implementations/external_clients.py:299` — INSERT of `download_type.value` into `external_download_clients.download_type`
- `backend/implementations/external_clients.py:397` — SQL WHERE `clients.download_type = ?` filters client selection
- `backend/base/definitions.py:466-476` — `DownloadState` enum: QUEUED, PAUSED, DOWNLOADING, SEEDING, IMPORTING, FAILED, CANCELED, SHUTDOWN
- **USUENET = 3** must be added; no DB migration needed (INTEGER column, no FK constraint)

### Download Class Hierarchy
- `backend/base/definitions.py:1089` — `Download` base class (ABC)
- `backend/base/definitions.py:1331` — `ExternalDownload` (extends `Download`, abstract external-client protocol)
- `backend/implementations/download_clients.py:56` — `BaseDirectDownload` (extends `Download`, concrete infrastructure)
- `backend/implementations/download_clients.py:772` — `TorrentDownload(ExternalDownload, BaseDirectDownload)` with `identifier='torrent'`
- `backend/features/download_queue.py:48` — `download_type_to_class` dict auto-registers via `get_subclasses(BaseDirectDownload)`
- **UsenetDownload must**: inherit `(ExternalDownload, BaseDirectDownload)`, set `identifier='usenet'`, implement `run()` (submit NZB to SABnzbd), `update_status()` (poll SABnzbd API), `remove_from_client()`

### Download Handler & Queue
- `backend/features/download_queue.py:325-400` — `DownloadHandler.add()` dispatches via `__determine_link_type()` (currently only checks `getcomics.org`)
- `backend/features/download_queue.py:241-320` — `__prepare_downloads_for_queue()` INSERTs into `download_queue`, creates threads
- `backend/features/download_queue.py:306-312` — `isinstance(download, TorrentDownload)` → starts `__run_torrent_download` thread
- `backend/features/download_queue.py:495-560` — `__load_downloads()` reconstructs instances via `download_type_to_class[identifier]`
- **Usenet must**: use separate API endpoint + separate `UsenetDownloadHandler` (developer decision), `__run_usenet_download()` thread

### Polling Loop & Post-Processing
- `backend/features/download_queue.py:74-128` — `__run_torrent_download()`: `while True` loop, `download.update_status()`, `Constants.TORRENT_UPDATE_INTERVAL` (5s) sleep, state branching
- `backend/implementations/download_clients.py:442-457` — `update_status()` calls `external_client.get_download()`, maps state via `state_mapping`
- `backend/implementations/torrent_clients/qBittorrent.py:26-44` — qBittorrent state mapping (12 states → DownloadState)
- `backend/features/post_processing.py:201-233` — `PostProcessor` chain: `remove_from_queue` → `add_to_history` → `move_to_dest` → `rename` → `scan` → `convert` → `set_properties`
- `backend/features/post_processing.py:164-166` — `PostProcessor.success()` runs `actions_success` list
- **Usenet must**: separate `__run_usenet_download()` loop, SABnzbd state mapping, separate `PostProcessorUsenet` (reusing existing action functions)

### Frontend Download Submission
- `frontend/static/js/view_volume.js:389-412` — `addManualSearch()` sends `POST /issues/{id}/download` with `{link, force_match}`
- `frontend/api.py:1057-1068` — `api_issue_download()` bridges Flask sync → async via `asyncio.run()`
- **Usenet must**: separate API endpoint (developer decision), not share `DownloadHandler.add()`

### Frontend Settings
- `frontend/ui.py:114` — `ui_download_clients()` renders `settings_download_clients.html`
- `frontend/static/js/settings_download_clients.js:238-230` — Dynamic form from `/externalclients/options` + `required_tokens`
- `frontend/api.py:1342-1350` — `api_external_clients_keys()` returns `{client_type: required_tokens}`
- **Prowlarr must**: new `search_sources` DB table, new settings route, new JS file (analogous to download clients pattern)
- **SABnzbd must**: auto-appear in download client dropdown via `get_client_types()` + `required_tokens`

### Database Schema
- `backend/internals/db.py:435-444` — `external_download_clients`: `download_type INTEGER`, `client_type VARCHAR`, `title`, `base_url`, `username`, `password`, `api_token`
- `backend/internals/db.py:445-465` — `download_queue`: `client_type VARCHAR(255)`, `external_client_id INTEGER`, `source_type`, `source_name`
- **New**: `search_sources` table needed for Prowlarr config (migration V46)

## Code References

- `backend/base/definitions.py:891-910` — SearchSource ABC definition
- `backend/base/definitions.py:917-965` — ExternalDownloadClient ABC definition
- `backend/base/definitions.py:456-459` — DownloadType enum (DIRECT=1, TORRENT=2)
- `backend/base/definitions.py:466-476` — DownloadState enum
- `backend/base/definitions.py:588-591` — SearchResultData TypedDict
- `backend/base/definitions.py:130` — Constants.TORRENT_UPDATE_INTERVAL
- `backend/base/definitions.py:1331` — ExternalDownload abstract class
- `backend/base/helpers.py:160-191` — get_subclasses() BFS discovery
- `backend/features/search.py:143-167` — search_multiple_queries() orchestration
- `backend/features/search.py:138-140` — SearchGetComics implementation
- `backend/features/download_queue.py:325-400` — DownloadHandler.add()
- `backend/features/download_queue.py:74-128` — __run_torrent_download() polling loop
- `backend/features/download_queue.py:48` — download_type_to_class registry
- `backend/features/post_processing.py:201-233` — PostProcessor chain
- `backend/implementations/external_clients.py:164-173` — get_client_types() registration
- `backend/implementations/external_clients.py:214-271` — ExternalClients.add() lifecycle
- `backend/implementations/external_clients.py:387-417` — get_least_used_client() SQL
- `backend/implementations/download_clients.py:772` — TorrentDownload class
- `backend/implementations/download_clients.py:56` — BaseDirectDownload class
- `backend/implementations/torrent_clients/qBittorrent.py:26-44` — qBittorrent state mapping
- `backend/internals/db.py:435-444` — external_download_clients schema
- `backend/internals/db.py:445-465` — download_queue schema
- `frontend/api.py:1057-1068` — api_issue_download() endpoint
- `frontend/api.py:1342-1350` — api_external_clients_keys() endpoint
- `frontend/static/js/settings_download_clients.js:238-230` — Dynamic form generation
- `frontend/static/js/view_volume.js:389-412` — addManualSearch() frontend entry

## Integration Points

### Inbound References
- `frontend/api.py:1057` — `api_issue_download()` calls `DownloadHandler.add()` → search result link dispatch
- `frontend/static/js/view_volume.js:389` — `addManualSearch()` sends link to backend
- `frontend/ui.py:114` — `ui_download_clients()` renders settings template

### Outbound Dependencies
- `backend/internals/db.py:435` — `external_download_clients` table stores client config
- `backend/internals/db.py:445` — `download_queue` table stores download state
- `backend/base/helpers.py:160` — `get_subclasses()` drives auto-discovery

### Infrastructure Wiring
- `frontend/api.py:1342` — `/externalclients/options` serves `required_tokens` for dynamic forms
- `backend/features/download_queue.py:306` — `isinstance(download, TorrentDownload)` gates thread creation
- `backend/features/post_processing.py:164` — `PostProcessor.success()` runs post-download chain

## Architecture Insights

1. **Two parallel auto-discovery patterns**: SearchSource (in-memory, import-time) vs ExternalDownloadClient (persistent, lazy-import). Both use `get_subclasses()` but with different storage models.

2. **Dual-inheritance for protocol + infrastructure**: `TorrentDownload(ExternalDownload, BaseDirectDownload)` combines abstract external-client protocol with concrete download infrastructure. Python MRO: `TorrentDownload → ExternalDownload → BaseDirectDownload → Download`.

3. **Value-based client routing**: `DownloadType` enum values act as routing keys in SQL WHERE clauses. Adding a new type requires no schema migration (INTEGER column).

4. **Template method for post-processing**: `PostProcessor` subclasses override `actions_success` lists. Action functions (`remove_from_queue`, `add_to_history`, etc.) are shared across all download types.

5. **Event-driven polling**: `threading.Event.wait()` instead of `time.sleep()` allows immediate interrupt on cancel/stop.

6. **Frontend form generation is data-driven**: `required_tokens` attribute on client classes drives which form fields are rendered. No hardcoded UI per client type.

## Precedents & Lessons

7 similar past changes analyzed.

### Precedent: Transmission ExternalDownloadClient
**Commit(s)**: `a12c91d` — "Add support for the Transmission client (#295)" (2025-11-16)
**Blast radius**: 2 files, 2 layers
  - `backend/implementations/external_clients.py` — registered Transmission in subclass factory
  - `backend/implementations/torrent_clients/Transmission.py` — new 286-line client

**Follow-up fixes**:
- `8370594` — "allow anonymous qbittorrent to work" (2025-12-24) — anonymous auth broke when username/password were both empty

**Takeaway**: Adding a client to the factory is trivially small, but auth edge cases surface later — test anonymous/unauthenticated flows.

### Precedent: ExternalClients Refactor (TorrentClients → ExternalClients)
**Commit(s)**: `f562c5a` — "Refactored ExternalClients (prev. TorrentClients)" (2024-12-16)
**Blast radius**: 17 files across 8 layers

**Follow-up fixes**:
- `650ab47` — "Refactored download_clients.py (Fixes #216)" (2025-02-10) — 11 files, 944 insertions. Download ABC changed from `source` to `source_type` + `source_name`.

**Takeaway**: The ExternalDownloadClient pattern was NOT designed for this from the start — it was a rename from TorrentClients. Every new client type has required follow-up refactors.

### Precedent: Enum Migration — Source Strings → Enums
**Commit(s)**: `5b1e938` — "Changed source strings to Enum values" (2024-06-24)
**Blast radius**: 9 files across 5 layers

**Takeaway**: Usenet was explicitly anticipated in the enum design. The `DownloadSource` enum comment says "future proofing... usenet sources coming."

### Precedent: WeTransfer Download Client
**Commit(s)**: `c979b08` — "Added WeTransfer download client (Resolves #160)" (2024-05-04)
**Blast radius**: 7 files across 5 layers
**Follow-up fixes**: None found within 30 days.

**Takeaway**: Simple direct-download clients had minimal follow-up.

### Precedent: Pixeldrain Download Client
**Commit(s)**: `dc4fc3f` — "Added Pixeldrain download client" (2024-05-14)
**Blast radius**: 8 files across 6 layers
**Follow-up fixes**: Rate limiting bugs fixed within weeks (dc4fc3f → 022d682 → 9aacee5)

**Takeaway**: Rate limiting surfaces quickly. SABnzbd may have similar rate-limit edge cases.

### Precedent: Mega Folder Download (High-Failure Client)
**Commit(s)**: `a454a17` — "Added support for Mega Folder download (#213)" (2025-02-18)
**Blast radius**: 4 files across 3 layers
**Follow-up fixes**: 6 fixes in ~3 months (login challenges, rate limits, missing properties)

**Takeaway**: Complex clients with external auth have high bug surface. SABnzbd API-key auth is simpler, but connection state management may have similar issues.

### Precedent: Download ABC Refactor
**Commit(s)**: `650ab47` — "Refactored download_clients.py (Fixes #216)" (2025-02-10)
**Blast radius**: 11 files across 6 layers, 944 insertions/406 deletions
**Key change**: `Download.__init__` signature changed from `source: DownloadSource` to `source_type: DownloadSource, source_name: str`.

**Takeaway**: For Usenet, use `source_type=DownloadType.USENET` and `source_name="SABnzbd"`. DB migration for this is already done (V35→V36).

### Composite Lessons
1. **The ExternalDownloadClient ABC was designed for torrents, not generic clients** — Adding SABnzbd will likely surface gaps. Expect at least one follow-up refactor.
2. **Usenet was explicitly anticipated in the enum design** — The `DownloadSource` enum comment (5b1e938) says "future proofing... usenet sources coming."
3. **Download ABC changed twice already** — Consider whether current pattern is sufficient or needs a `protocol` field.
4. **Auth edge cases always surface later** — Test with blank/invalid keys and network timeouts.
5. **Rate limiting is a fast-following bug** — SABnzbd has API rate limits and queue limits.
6. **DB migrations are version-gated and additive** — Current DB version is 45. Each migration adds a `@register_handler(N)` decorator.
7. **Frontend changes are non-trivial for every client** — Every new client required changes to settings UI.
8. **SearchSource is a clean pattern** — No follow-up refactors seen for search sources.

## Historical Context (from `.rpiv/artifacts/`)
- `.rpiv/artifacts/discover/2026-07-13_21-34-00_usenet_integration.md` — FRD: Usenet-Integration für Kapowarr (intent, goals, functional requirements, decisions)

## Developer Context
**Q (`backend/implementations/external_clients.py:242`): Should username/password validation be required_tokens-aware or use a separate Usenet add path?**
A: Separate `add_usenet_client()` in new module (Option B) — keeps `external_clients.py` untouched for patching.

**Q (`backend/base/definitions.py:456`): DownloadType enum — add USUENET=3 or reuse TORRENT=2?**
A: Add `USUENET = 3` (Option A) — semantically correct, no DB migration needed.

**Q (`backend/features/search.py:143`): Prowlarr settings — in-memory SearchSource or persistent DB table?**
A: New `search_sources` DB table + Settings route (Option A) — consistent with ExternalDownloadClient pattern.

**Q (`backend/features/download_queue.py:349`): NZB download flow — extend DownloadHandler or separate endpoint?**
A: Separate API endpoint + separate download handler (Option B) — maximizes modularity.

**Q (`backend/implementations/download_clients.py:772`): NZB flow location — in UsenetDownload.run() or separate handler?**
A: Separate `UsenetDownloadHandler` (Option B) — isolates Usenet logic.

**Q (`backend/features/post_processing.py:201`): Post-processing — reuse PostProcessor or separate class?**
A: Separate `PostProcessorUsenet` reusing existing action functions (Option B) — maximizes code reuse.

**Q (`backend/base/definitions.py:130`): Polling interval — reuse TORRENT_UPDATE_INTERVAL or separate constant?**
A: Separate `Constants.USENET_UPDATE_INTERVAL` (Option B) — clear separation.

**Q (`backend/internals/db.py:435`): DB migration — one or two migrations?**
A: One migration V46 for `search_sources` table. DownloadType enum change needs no migration.

## Related Research
- None yet

## Open Questions
- None (all relevant questions resolved during checkpoint)
