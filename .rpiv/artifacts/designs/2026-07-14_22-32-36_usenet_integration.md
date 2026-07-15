---
date: 2026-07-14T22:32:36+0200
author: Jan Eltner
commit: 55946aa
branch: main
repository: Kapowarr
topic: "usenet_integration"
tags: [design, usenet, prowlarr, sabnzbd, searchsource, externaldownloadclient]
status: in-progress
parent: .rpiv/artifacts/research/2026-07-14_20-59-30_usenet_integration.md
last_updated: 2026-07-15T14:00:00+0200
last_updated_by: Jan Eltner
last_updated_note: "Complete rewrite based on original usenet branch code analysis. Prowlarr replaces Newznab. SABnzbd client identical to upstream. UsenetDownload replaces NewznabClient (ExternalDownload instead of BaseDirectDownload). Frontend uses existing download_clients settings page with Usenet section."
---

# Design: Usenet Integration (Prowlarr SearchSource + SABnzbd ExternalDownloadClient)

## Summary

Integrate Usenet as an additional content source for Kapowarr by adding Prowlarr as a `SearchSource` for comic search and SABnzbd as an `ExternalDownloadClient` for NZB downloads. The design faithfully transfers the original upstream `usenet` branch patterns, replacing Newznab with Prowlarr.

Original upstream patterns preserved:
- `SearchSource._subclasses` with `__init_subclass__` for dynamic discovery
- Inline `__run_usenet_download` in DownloadHandler (not separate handler)
- Extended `SearchResultData` with `title`, `size`, `seeders`, `details`
- SABnzbd client identical to upstream implementation
- Reuses `TORRENT_UPDATE_INTERVAL` and `delete_completed_torrents` settings
- Dynamic `register_*_search_source()` functions called at startup
- Usenet Clients section in existing download_clients settings page

Prowlarr replaces Newznab:
- Prowlarr's JSON API instead of Newznab's XML API
- Prowlarr results appear alongside GetComics results in manual search
- NZB download flow unchanged — Prowlarr provides the NZB URL, SABnzbd handles the download

## Requirements

- Add Prowlarr as a searchable source for comics (SearchSource pattern)
- Add SABnzbd as a download client for NZB files (ExternalDownloadClient pattern)
- NZB content submitted via SABnzbd addurl API (URL-based)
- Prowlarr results appear alongside GetComics results in manual search
- SABnzbd auto-appears in download client dropdown (data-driven)
- Automatic NZB download flow with status sync via SABnzbd API
- Dynamic SearchSource registration at startup based on Prowlarr config

## Current State Analysis

### Key Discoveries

- `backend/base/definitions.py:456-460` — DownloadType enum has DIRECT=1, TORRENT=2.
- `backend/base/definitions.py:891-909` — SearchSource ABC with `async search(session) -> List[SearchResultData]`. Only one implementation: SearchGetComics.
- `backend/base/definitions.py:588-591` — SearchResultData has `link`, `display_title`, `source` fields.
- `backend/implementations/external_clients.py:161-175` — `get_client_types()` lazy-imports from `torrent_clients/` namespace + `get_subclasses(BaseExternalClient)`.
- `backend/implementations/download_clients.py:772-941` — TorrentDownload uses dual inheritance: `class TorrentDownload(ExternalDownload, BaseDirectDownload)`.
- `backend/features/download_queue.py:109-179` — `__run_torrent_download` polling loop.
- `backend/features/download_queue.py:310-317` — Thread dispatch: `isinstance(download, TorrentDownload)` → `__run_torrent_download` thread.
- `backend/features/download_queue.py:349-360` — `__determine_link_type` detects GC links only.
- `backend/features/post_processing.py:286-329` — PostProcessor base class with `actions_success` lists.
- `frontend/static/js/settings_download_clients.js:221-235` — Frontend form generation is data-driven from `required_tokens`.
- `backend/internals/db.py:435-444` — external_download_clients table stores client config.
- Current DB version is 45 (migration handlers 40-44, latest = 44+1 = 45).

### Upstream Reference (usenet branch)

The upstream `usenet` branch (2 commits, 21 files, +3653/-117) provides the pattern template:
- `SearchSource._subclasses` set with `__init_subclass__` for dynamic discovery
- Inline `__run_usenet_download` in DownloadHandler (same as `__run_torrent_download`)
- Extended `SearchResultData` with `title`, `size`, `seeders`, `details`
- SABnzbd client with `_connect()` for connection testing, queue+history polling
- Reuses `TORRENT_UPDATE_INTERVAL` and `delete_completed_torrents` settings
- Dynamic registration functions: `register_newznab_search_source()` called at startup
- Usenet Clients section in existing download_clients settings page (not separate page)

## Scope

### Building
- `DownloadType.USENET = 3` enum value
- `search_sources` DB table for Prowlarr config (migration V45)
- SABnzbd ExternalDownloadClient in `usenet_clients/` namespace
- Prowlarr SearchSource with `_subclasses` dynamic registration
- UsenetDownload class (dual inheritance like TorrentDownload)
- Inline `__run_usenet_download` in DownloadHandler (like upstream)
- PostProcessorUsenet reusing existing action functions
- Usenet Clients section in existing download_clients settings page
- Prowlarr API endpoints for settings CRUD
- NZB submission via SABnzbd addurl API
- Frontend: SABnzbd in download client dropdown (data-driven, download_type=3)
- Frontend: Prowlarr results in existing manual search flow
- Extended SearchResultData: `title`, `size`, `seeders`, `details`

### Not Building
- NZB file parsing or creation
- Automated NZB indexer (Prowlarr provides search only)
- SABnzbd history management (completed downloads)
- Rate limiting detection (known follow-up, not in scope)
- Anonymous/unauthenticated flows (SABnzbd requires API key)

## Decisions

### DownloadType.USENET
**Decision**: Add `USENET = 3` to DownloadType enum.
**Evidence**: `backend/base/definitions.py:456-460` — INTEGER column, no FK constraint.
**Pattern**: Matches upstream usenet branch.

### SABnzbd Client Location
**Decision**: `backend/implementations/usenet_clients/SABnzbd.py` in a new namespace package.
**Evidence**: User chose "Moving off torrent_clients/" — new usenet_clients/ namespace.
**Pattern**: Namespace package like `torrent_clients/`, explicit import in `get_client_types()`.

### Prowlarr SearchSource
**Decision**: `backend/search_sources/prowlarr.py` as a SearchSource subclass with `_subclasses` dynamic registration.
**Evidence**: Upstream uses `SearchSource._subclasses` with `__init_subclass__` for dynamic registration. Prowlarr config in `search_sources` table.
**Pattern**: `register_prowlarr_search_source()` called at startup if config exists.

### UsenetDownload Class
**Decision**: `class UsenetDownload(ExternalDownload, BaseDirectDownload)` with `identifier='usenet'`.
**Evidence**: TorrentDownload pattern (`download_clients.py:772`). Dual inheritance.
**Pattern**: Matches upstream — UsenetDownload sends NZB to SABnzbd via `ExternalDownload` interface.

### Usenet Download Loop
**Decision**: Inline `__run_usenet_download` in DownloadHandler (not separate handler).
**Evidence**: Upstream uses inline method in DownloadHandler, same as `__run_torrent_download`.
**Pattern**: Mirrors `__run_torrent_download` — polling loop with state branching.

### PostProcessorUsenet
**Decision**: Separate `PostProcessorUsenet` class in `backend/features/post_processing.py`.
**Evidence**: Upstream pattern — PostProcessor subclasses override `actions_success` lists.
**Pattern**: Modeled after PostProcessorTorrentsComplete / PostProcessorTorrentsCopy.

### Polling Interval
**Decision**: Reuse `Constants.TORRENT_UPDATE_INTERVAL` (not separate constant).
**Evidence**: Upstream reuses TORRENT_UPDATE_INTERVAL for usenet.
**Pattern**: Same as upstream — avoids unnecessary constant proliferation.

### NZB Submission Flow
**Decision**: SABnzbd addurl API — submit NZB URL directly.
**Evidence**: Upstream uses `mode=addurl` with `name` param.
**Pattern**: Matches upstream SABnzbd client.

### Frontend Integration
**Decision**: Usenet Clients section in existing download_clients settings page (not separate page).
**Evidence**: Upstream adds "Usenet Clients" section to `settings_download_clients.html` with add/edit windows.
**Pattern**: Same as upstream — consistent with existing settings layout.

### SearchResultData Extension
**Decision**: Add `title`, `size`, `seeders`, `details` fields.
**Evidence**: Upstream extends SearchResultData for usenet-specific fields.
**Pattern**: Matches upstream — `title` for raw title, `size` for file size, `seeders` (0 for usenet), `details` for metadata URL.

### DB Migration
**Decision**: Single migration V45 for `search_sources` table.
**Evidence**: Current DB version is 45 (handlers 40-44, latest = 44+1 = 45). DownloadType enum change needs no migration.
**Table schema**: `id INTEGER PRIMARY KEY`, `client_type VARCHAR(255) NOT NULL`, `title VARCHAR(255) NOT NULL`, `base_url TEXT NOT NULL`, `api_key TEXT NOT NULL`.

## Architecture

### backend/base/definitions.py — MODIFY

#### DownloadType enum (line ~456-460)
Add `USENET = 3`:
```python
class DownloadType(BaseEnum):
    "The download protocol (download type)"

    DIRECT = 1
    TORRENT = 2
    USENET = 3
```

#### SearchResultData (line ~588-591)
Extend with additional fields:
```python
class SearchResultData(FilenameData):
    link: str
    title: str  # Raw title (can replace display_title)
    display_title: str  # Keep for backward compatibility
    source: str
    size: int  # File size in bytes
    seeders: int  # 0 for usenet, seeders for p2p
    details: str  # Details URL or metadata
```

#### SearchSource (line ~891)
Add `_subclasses` discovery mechanism:
```python
class SearchSource(ABC):
    _subclasses = set()

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        cls._subclasses.add(cls)

    def __init__(self, query: str) -> None:
        """Prepare the search source.

        Args:
            query (str): The query to search for.
        """
        self.query = query
        return

    @abstractmethod
    async def search(self, session: 'AsyncSession') -> List[SearchResultData]:
        ...

    def __repr__(self) -> str:
        return f'<{self.__class__.__name__}(query={self.query}); {id(self)}>'
```

### backend/internals/db.py — MODIFY

#### Add search_sources table (after external_download_clients, ~line 444)
```python
CREATE TABLE IF NOT EXISTS search_sources(
    id INTEGER PRIMARY KEY,
    client_type VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    base_url TEXT NOT NULL,
    api_key TEXT NOT NULL
);
```

### backend/internals/db_migration.py — MODIFY

#### Add migration V45 handler (after handler 44, ~line 1186)
```python
@DatabaseMigrationHandler.register_handler(45)
def _migrate_add_search_sources_table():
    """Add search_sources table for Prowlarr configuration."""
    get_db().execute("""
        CREATE TABLE IF NOT EXISTS search_sources(
            id INTEGER PRIMARY KEY,
            client_type VARCHAR(255) NOT NULL,
            title VARCHAR(255) NOT NULL,
            base_url TEXT NOT NULL,
            api_key TEXT NOT NULL
        );
    """)
    return
```

### backend/implementations/usenet_clients/__init__.py — NEW

Namespace package init:
```python
# -*- coding: utf-8 -*-
"""Usenet download clients namespace package."""
```

### backend/implementations/usenet_clients/SABnzbd.py — NEW

SABnzbd ExternalDownloadClient (identical to upstream):
```python
# -*- coding: utf-8 -*-

import os

from time import time
from typing import Any, Dict, List, Union, Optional
from urllib.parse import urljoin

from requests.exceptions import RequestException

from backend.base.custom_exceptions import ExternalClientNotWorking
from backend.base.definitions import Constants, DownloadState, DownloadType, FileConstants
from backend.base.helpers import Session
from backend.base.logging import LOGGER
from backend.implementations.external_clients import BaseExternalClient
from backend.internals.settings import Settings


class SABnzbd(BaseExternalClient):
    client_type = 'SABnzbd'
    download_type = DownloadType.USENET

    required_tokens = ('title', 'base_url', 'api_token')

    state_mapping = {
        'Downloading': DownloadState.DOWNLOADING_STATE,
        'Queued': DownloadState.QUEUED_STATE,
        'Paused': DownloadState.PAUSED_STATE,
        'Checking': DownloadState.DOWNLOADING_STATE,
        'Verifying': DownloadState.DOWNLOADING_STATE,
        'Repairing': DownloadState.DOWNLOADING_STATE,
        'Extracting': DownloadState.IMPORTING_STATE,
        'Moving': DownloadState.IMPORTING_STATE,
        'Completed': DownloadState.DOWNLOADING_STATE,
        'Failed': DownloadState.FAILED_STATE,
    }

    def __init__(self, client_id: int) -> None:
        super().__init__(client_id)

        self.ssn: Union[Session, None] = None
        self.settings = Settings()
        return

    @staticmethod
    def _connect(
        base_url: str,
        api_token: Union[str, None]
    ) -> Union[Session, str]:
        """Test connection to SABnzbd instance.

        Args:
            base_url (str): Base URL of the SABnzbd instance
            api_token (Union[str, None]): API key for SABnzbd

        Returns:
            Union[Session, str]: Session object if successful, error message if failed
        """
        if not api_token:
            return "API key is required for SABnzbd"

        ssn = Session()

        try:
            response = ssn.get(
                f"{base_url}/api",
                params={
                    'output': 'json',
                    'mode': 'queue',
                    'apikey': api_token
                }
            )

            if response.status_code == 403:
                return "Invalid API key"

            if response.status_code != 200:
                return f"Connection failed with status code {response.status_code}"

            data = response.json()
            if 'error' in data:
                return f"SABnzbd error: {data['error']}"

            if 'queue' not in data:
                return "Invalid response from SABnzbd"

        except RequestException as e:
            LOGGER.exception("Can't connect to SABnzbd instance: ")
            return f"Can't connect; invalid base URL: {str(e)}"

        return ssn

    def add_download(self, download_link: str, target_folder: str, download_name: Union[str, None]) -> str:
        LOGGER.debug(f"SABnzbd.add_download called with: {download_link}")
        LOGGER.debug(f"Target folder: {target_folder}, download_name: {download_name}")

        if not self.ssn:
            result = self._connect(self.base_url, self.api_token)
            if isinstance(result, str):
                LOGGER.error(f"Failed to connect to SABnzbd: {result}")
                raise ExternalClientNotWorking(result)
            self.ssn = result

        is_direct_link = download_link.lower().startswith('http')
        LOGGER.debug(f"Is direct link: {is_direct_link}")

        if is_direct_link:
            if 'prowlarr' in download_link.lower() and 'download' in download_link:
                LOGGER.debug(f"Detected Prowlarr URL, sending complete URL to SABnzbd")

            params = {
                'output': 'json',
                'mode': 'addurl',
                'apikey': self.api_token,
                'name': download_link,
                'cat': Constants.USENET_TAG,
                'priority': 0,
            }

            if download_name:
                params['nzbname'] = download_name

            LOGGER.debug(f"Files will be downloaded to SABnzbd category '{Constants.USENET_TAG}' folder")

            response = self.ssn.get(f"{self.base_url}/api", params=params)
            LOGGER.debug(f"SABnzbd API response status: {response.status_code}")
            LOGGER.debug(f"SABnzbd API response: {response.text}")

        else:
            LOGGER.error("Non-URL NZB handling not implemented")
            raise ExternalClientNotWorking("Only direct NZB URLs are supported")

        if response.status_code != 200:
            raise ExternalClientNotWorking(f"Failed to add download: {response.text}")

        data = response.json()
        if not data or 'status' not in data or data['status'] is False:
            error_msg = data.get('error', 'Unknown error')
            raise ExternalClientNotWorking(f"Failed to add download: {error_msg}")

        nzo_id = data.get('nzo_ids', ['unknown_id'])[0]
        LOGGER.info(f"Successfully added to SABnzbd with ID: {nzo_id}")
        return nzo_id

    def get_download(self, download_id: str) -> Union[dict, None]:
        """Get download status from SABnzbd.

        Args:
            download_id (str): SABnzbd nzo_id

        Returns:
            Union[dict, None]: Download status info or None if not found
        """
        if not self.ssn:
            result = self._connect(self.base_url, self.api_token)
            if isinstance(result, str):
                raise ExternalClientNotWorking(result)
            self.ssn = result

        # Check if it's in the queue
        queue_response = self.ssn.get(
            f"{self.base_url}/api",
            params={
                'output': 'json',
                'mode': 'queue',
                'apikey': self.api_token
            }
        )

        if queue_response.status_code != 200:
            raise ExternalClientNotWorking(f"Failed to get queue: {queue_response.text}")

        queue_data = queue_response.json()

        if 'queue' in queue_data and 'slots' in queue_data['queue']:
            for item in queue_data['queue']['slots']:
                if item.get('nzo_id') == download_id:
                    status = item.get('status', 'Queued')
                    mb_left = float(item.get('mbleft', 0))
                    mb_total = float(item.get('mb', 0))

                    progress = 0
                    if mb_total > 0:
                        progress = round(((mb_total - mb_left) / mb_total) * 100, 2)

                    return {
                        'size': int(mb_total * 1024 * 1024),
                        'progress': progress,
                        'speed': int(item.get('speed', 0)),
                        'state': self.state_mapping.get(status, DownloadState.DOWNLOADING_STATE)
                    }

        # If not in queue, check history
        history_response = self.ssn.get(
            f"{self.base_url}/api",
            params={
                'output': 'json',
                'mode': 'history',
                'apikey': self.api_token
            }
        )

        if history_response.status_code != 200:
            raise ExternalClientNotWorking(f"Failed to get history: {history_response.text}")

        history_data = history_response.json()

        if 'history' in history_data and 'slots' in history_data['history']:
            for item in history_data['history']['slots']:
                if item.get('nzo_id') == download_id:
                    status = item.get('status', 'Completed')

                    if status == 'Completed':
                        state = DownloadState.DOWNLOADING_STATE
                    elif status == 'Failed':
                        state = DownloadState.FAILED_STATE
                    else:
                        state = DownloadState.IMPORTING_STATE

                    # Get the storage path from SABnzbd - this is the final destination
                    storage_path = item.get('storage', '')
                    LOGGER.debug(f"SABnzbd reported storage path: {storage_path}")

                    # Find the main comic file in the storage path
                    final_files = []
                    if storage_path and os.path.exists(storage_path):
                        # Look for comic files in the storage path
                        if os.path.isdir(storage_path):
                            # Scan for comic files in the directory
                            for root, _, files in os.walk(storage_path):
                                for file in files:
                                    if any(file.lower().endswith(ext) for ext in FileConstants.CONTAINER_EXTENSIONS):
                                        final_files.append(os.path.join(root, file))
                        else:
                            final_files.append(storage_path)

                        if final_files:
                            LOGGER.info(f"Found files at storage path: {final_files}")
                        else:
                            LOGGER.warning(f"No comic files found at storage path: {storage_path}")
                    else:
                        LOGGER.warning(f"Storage path not found: {storage_path}")

                    return {
                        'size': int(item.get('bytes', 0)),
                        'progress': 100,
                        'speed': 0,
                        'state': state,
                        'final_files': final_files
                    }

        return None

    def delete_download(self, download_id: str, delete_files: bool) -> None:
        """Delete a download from SABnzbd.

        Args:
            download_id (str): SABnzbd nzo_id
            delete_files (bool): Whether to delete files from disk
        """
        if not self.ssn:
            result = self._connect(self.base_url, self.api_token)
            if isinstance(result, str):
                raise ExternalClientNotWorking(result)
            self.ssn = result

        queue_delete_response = self.ssn.get(
            f"{self.base_url}/api",
            params={
                'output': 'json',
                'mode': 'queue',
                'name': 'delete',
                'apikey': self.api_token,
                'value': download_id,
                'del_files': int(delete_files)
            }
        )

        history_delete_response = self.ssn.get(
            f"{self.base_url}/api",
            params={
                'output': 'json',
                'mode': 'history',
                'name': 'delete',
                'apikey': self.api_token,
                'value': download_id,
                'del_files': int(delete_files)
            }
        )

        return

    @staticmethod
    def test(
        base_url: str,
        username: Union[str, None] = None,
        password: Union[str, None] = None,
        api_token: Union[str, None] = None
    ) -> Union[str, None]:
        """Test connection to SABnzbd.

        Args:
            base_url (str): Base URL of the SABnzbd instance
            username (Union[str, None]): Not used for SABnzbd
            password (Union[str, None]): Not used for SABnzbd
            api_token (Union[str, None]): API key for SABnzbd

        Returns:
            Union[str, None]: Error message if connection failed, None if successful
        """
        result = SABnzbd._connect(base_url, api_token)
        if isinstance(result, str):
            return result
        return None
```

### backend/search_sources/__init__.py — NEW

Namespace package init:
```python
# -*- coding: utf-8 -*-
"""Search sources namespace package."""
```

### backend/search_sources/prowlarr.py — NEW

Prowlarr SearchSource with dynamic registration:
```python
# -*- coding: utf-8 -*-

from __future__ import annotations

import re
from typing import TYPE_CHECKING, Any, Dict, List, Union
from urllib.parse import urljoin

from backend.base.definitions import SearchResultData, SearchSource
from backend.base.helpers import AsyncSession
from backend.base.logging import LOGGER
from backend.internals.db import get_db

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


class SearchProwlarr(SearchSource):
    """Search source for Prowlarr."""

    async def search(self, session: 'AsyncSession') -> List[SearchResultData]:
        """Search Prowlarr for the query.

        Args:
            session (AsyncSession): Async session for HTTP requests

        Returns:
            List[SearchResultData]: Search results
        """
        # Check if Prowlarr is configured
        db = get_db()
        prowlarr = db.execute(
            'SELECT base_url, api_key FROM search_sources WHERE client_type = ? LIMIT 1',
            ('Prowlarr',)
        ).fetchone()

        if not prowlarr:
            LOGGER.debug("Prowlarr is not configured, skipping search")
            return []

        api_url = prowlarr['base_url']
        api_key = prowlarr['api_key']

        try:
            response = await session.get_text(
                f'{api_url}/api/v1/search',
                params={
                    'apikey': api_key,
                    'query': self.query,
                    'limit': '100',
                },
                quiet_fail=True
            )
        except Exception:
            LOGGER.exception("Prowlarr search failed")
            return []

        if not response:
            return []

        import json
        try:
            results = json.loads(response)
        except json.JSONDecodeError:
            LOGGER.exception("Prowlarr search response not valid JSON")
            return []

        search_results: List[SearchResultData] = []

        for item in results:
            # Extract NZB URL from release
            nzb_url = item.get('downloadUrl') or item.get('nzbUrl') or item.get('magUrl')
            if not nzb_url:
                continue

            # Resolve relative URLs
            if nzb_url.startswith('/'):
                nzb_url = urljoin(api_url, nzb_url)

            # Extract metadata from title
            title = item.get('title', '')

            # Extract year
            year_match = re.search(r'\((\d{4})\)', title)
            year = int(year_match.group(1)) if year_match else None

            # Extract issue number
            issue_match = re.search(r'#(\d+(\.\d+)?)', title)
            if not issue_match:
                issue_match = re.search(r'(?:^|\s)(\d{1,3})(?:\s|$|\()', title)
            issue_number = float(issue_match.group(1)) if issue_match else None

            # Extract volume number
            volume_match = re.search(r'Vol(?:ume)?\.?\s*(\d+)', title, re.IGNORECASE)
            volume_number = int(volume_match.group(1)) if volume_match else None

            # Extract series name
            series = title
            if year_match:
                series = series[:year_match.start()].strip()
            if issue_match:
                series = series[:issue_match.start()].strip()

            # Get size if available
            size = item.get('size', 0)
            if isinstance(size, str):
                try:
                    size = int(size)
                except ValueError:
                    size = 0

            search_results.append({
                'title': title,
                'display_title': title,
                'series': series,
                'link': nzb_url,
                'size': size,
                'seeders': 0,  # Not applicable for usenet
                'source': 'Prowlarr',
                'details': '',
                'annual': False,
                'volume_number': volume_number,
                'issue_number': issue_number,
                'year': year,
                'special_version': None,
            })

        LOGGER.debug(f"Prowlarr found {len(search_results)} results")
        return search_results


def register_prowlarr_search_source() -> None:
    """Register Prowlarr as a search source if configured."""
    try:
        db = get_db()
        prowlarr = db.execute(
            'SELECT 1 FROM search_sources WHERE client_type = ? LIMIT 1',
            ('Prowlarr',)
        ).fetchone()

        if prowlarr:
            LOGGER.info("Prowlarr is configured, registering as search source")
            if SearchProwlarr not in SearchSource._subclasses:
                SearchSource._subclasses.add(SearchProwlarr)
        else:
            LOGGER.debug("Prowlarr is not configured, not registering as search source")
    except Exception as e:
        LOGGER.error(f"Error registering Prowlarr search source: {e}")
```

### backend/implementations/download_clients.py — MODIFY

Add UsenetDownload class (after TorrentDownload, ~line 941):
```python
# region Usenet
@final
class UsenetDownload(ExternalDownload, BaseDirectDownload):
    identifier: str = 'usenet'

    @property
    def external_client(self) -> ExternalDownloadClient:
        return self._external_client

    @external_client.setter
    def external_client(self, value: ExternalDownloadClient) -> None:
        self._external_client = value
        return

    @property
    def external_id(self) -> Union[str, None]:
        return self._external_id

    @property
    def sleep_event(self) -> Event:
        return self._sleep_event

    def __init__(
        self,
        download_link: str,

        volume_id: int,
        covered_issues: Union[float, Tuple[float, float], None],

        source_type: DownloadSource,
        source_name: str,

        web_link: Union[str, None],
        web_title: Union[str, None],
        web_sub_title: Union[str, None],

        forced_match: bool = False,
        external_client: Union[ExternalDownloadClient, None] = None
    ) -> None:
        LOGGER.debug(
            'Creating Usenet download: %s',
            download_link
        )

        settings = Settings().sv
        volume = Volume(volume_id)

        self._download_link = self._pure_link = download_link
        self._volume_id = volume_id
        self._issue_id = None
        self._covered_issues = covered_issues
        self._source_type = source_type
        self._source_name = source_name
        self._web_link = web_link
        self._web_title = web_title
        self._web_sub_title = web_sub_title

        self._id = None
        self._state = DownloadState.QUEUED_STATE
        self._progress = 0.0
        self._speed = 0.0
        self._size = -1
        self._download_thread = None
        self._download_folder = settings.download_folder
        self._sleep_event = Event()

        self._original_files: List[str] = []
        self._external_id: Union[str, None] = None
        if external_client:
            self._external_client = external_client
        else:
            self._external_client = ExternalClients.get_least_used_client(
                DownloadType.USENET
            )

        try:
            if isinstance(covered_issues, float):
                self._issue_id = volume.get_issue_from_number(covered_issues).id

        except IssueNotFound as e:
            if not forced_match:
                raise e

        # Use the link filename as fallback for NZB name
        self._filename_body = ''
        if settings.rename_downloaded_files:
            try:
                self._filename_body = generate_issue_name(
                    volume.get_data(),
                    covered_issues
                )

            except IssueNotFound as e:
                if not forced_match:
                    raise e

        if not self._filename_body:
            # Use the link filename as fallback
            self._filename_body = basename(
                unquote_plus(download_link).split('/')[-1].split('?')[0]
            )

        self._title = basename(self._filename_body)
        self._files = [join(self._download_folder, self._title)]
        return

    def run(self) -> None:
        LOGGER.debug(f"Starting UsenetDownload.run() for {self.download_link}")
        self._external_id = self.external_client.add_download(
            self.download_link,
            self._download_folder,
            self.title
        )
        LOGGER.debug(f"Usenet download started with external_id: {self._external_id}")
        return

    def update_status(self) -> None:
        if not self.external_id:
            return

        usenet_status = self.external_client.get_download(self.external_id)
        if not usenet_status:
            if usenet_status is None:
                self._state = DownloadState.CANCELED_STATE
            return

        self._progress = usenet_status['progress']
        self._speed = usenet_status['speed']
        self._size = usenet_status['size']
        if self.state not in (
            DownloadState.CANCELED_STATE,
            DownloadState.SHUTDOWN_STATE
        ):
            self._state = usenet_status['state']

        return

    def remove_from_client(self, delete_files: bool) -> None:
        if not self.external_id:
            return

        self.external_client.delete_download(self.external_id, delete_files)
        return

    def stop(self,
        state: DownloadState = DownloadState.CANCELED_STATE
    ) -> None:
        self._state = state
        self._sleep_event.set()
        return

    def as_dict(self) -> Dict[str, Any]:
        return {
            **super().as_dict(),
            'client': self.external_client.id if self._external_client else None
        }
```

### backend/features/download_queue.py — MODIFY

#### Imports (line ~30)
```python
from backend.implementations.download_clients import (BaseDirectDownload,
                                                      MegaDownload,
                                                      TorrentDownload,
                                                      UsenetDownload)
```

#### `__run_usenet_download` (after `__run_torrent_download`, ~line 179)
Inline usenet download loop (mirrors torrent pattern):
```python
def __run_usenet_download(self, download: UsenetDownload) -> None:
    """Start a usenet download. Intended to be run in a thread.

    Args:
        download (UsenetDownload): The usenet download to run.
            One of the entries in self.queue.
    """
    LOGGER.info(f'Starting usenet download: {download.id}')
    download.run()

    ws = WebSocket()

    # When the download is sent to SABnzbd, we need to periodically check its status
    while True:
        download.update_status()
        ws.emit(QueueStatusEvent(download))

        if download.state == DownloadState.CANCELED_STATE:
            download.remove_from_client(delete_files=True)
            PostProcessor.canceled(download)
            self.queue.remove(download)
            break

        elif download.state == DownloadState.FAILED_STATE:
            download.remove_from_client(delete_files=True)
            PostProcessor.failed(download)
            self.queue.remove(download)
            break

        elif download.state == DownloadState.SHUTDOWN_STATE:
            break

        elif download.state == DownloadState.IMPORTING_STATE:
            if self.settings.sv.delete_completed_torrents:  # Reuse setting for usenet
                download.remove_from_client(delete_files=False)
            PostProcessor.success(download)
            self.queue.remove(download)
            break

        else:
            # Queued or downloading
            download.sleep_event.wait(
                timeout=Constants.TORRENT_UPDATE_INTERVAL  # Reuse torrent interval
            )

    ws.emit(RemovedFromQueueEvent(download))
    return
```

#### `__prepare_downloads_for_queue` (after TorrentDownload block, ~line 317)
Add UsenetDownload thread dispatch:
```python
elif isinstance(download, UsenetDownload):
    thread = Server().get_db_thread(
        target=self.__run_usenet_download,
        args=(download,),
        name=f'UsenetDownloadThread-{download.id}'
    )
    download.download_thread = thread
    thread.start()
```

#### `__determine_link_type` (line ~349)
Add Prowlarr detection:
```python
def __determine_link_type(self, link: str) -> Union[str, None]:
    """Determine the service type of the link (e.g. getcomics, torrent, etc.).

    Args:
        link (str): The link to check.

    Returns:
        Union[str, None]: The service type of the link or `None` if unknown.
    """
    if link.startswith(Constants.GC_SITE_URL):
        return 'gc'
    elif 'prowlarr' in link.lower():
        return 'prowlarr'
    return None
```

#### `add()` method (after GetComics block, ~line 474)
Add Prowlarr link handling:
```python
elif link_type == 'prowlarr':
    # Usenet download from Prowlarr
    from backend.base.definitions import DownloadType

    issue_number = None
    if issue_id is not None:
        try:
            issue_number = float(issue_id)
        except (ValueError, TypeError):
            pass

    downloads = [UsenetDownload(
        download_link=link,
        volume_id=volume_id,
        covered_issues=issue_number,
        source_type=DownloadType.USENET,
        source_name='Prowlarr',
        web_link=link,
        web_title=None,
        web_sub_title=None,
        forced_match=force_match,
    )]
```

### backend/features/post_processing.py — MODIFY

Add PostProcessorUsenet (after PostProcessorTorrentsCopy, ~line 370):
```python
class PostProcessorUsenet(PostProcessor):
    """Post-processing for usenet (NZB) downloads."""

    actions_success = [
        remove_from_queue,
        add_to_history,
        move_to_dest,
        rename_with_proper_extension,
        add_file_to_database,
        convert_file,
        set_file_properties
    ]

    actions_canceled = [
        delete_file,
        remove_from_queue
    ]

    actions_failed = [
        remove_from_queue,
        add_to_history,
        delete_file
    ]
```

### backend/features/search.py — MODIFY

Add Prowlarr import and registration (at module level):
```python
from backend.search_sources.prowlarr import SearchProwlarr, register_prowlarr_search_source
```

Add registration call at startup (in `search_multiple_queries` or at module level):
```python
# Register Prowlarr search source at startup
register_prowlarr_search_source()
```

### backend/implementations/external_clients.py — MODIFY

Add SABnzbd import in `get_client_types()` (~line 167):
```python
from backend.implementations.torrent_clients import (Transmission,
                                                     qBittorrent)
from backend.implementations.usenet_clients.sabnzbd import SABnzbd  # NEW
```

### frontend/templates/settings_download_clients.html — MODIFY

Add Usenet Clients section (after Torrent Clients section):
```html
<h2>Usenet Clients</h2>
<div id="usenet-client-list" class="client-list">
    <button id="add-usenet-client" class="add-button icon-text-color" title="Add usenet client">
        <img src="{{url_base}}/static/img/cancel.svg" alt="">
    </button>
</div>
```

Add Usenet add/edit windows (after torrent windows):
```html
{% set add_usenet_content %}
    <p class="error hidden" id="add-usenet-error"></p>
    <form id="add-usenet-form">
        <table>
            <tr>
                <th><label for="add-usenet-title-input">Title</label></th>
                <td>
                    <input type="text" id="add-usenet-title-input" required>
                </td>
            </tr>
            <tr>
                <th><label for="add-usenet-baseurl-input">Base URL</label></th>
                <td>
                    <input type="text" id="add-usenet-baseurl-input" required>
                    <p>E.g. 'http://192.168.2.15:8080'</p>
                </td>
            </tr>
        </table>
    </form>
{% endset %}

{% set add_usenet_submit %}
    <button id="test-usenet-add" class="test-button" type="button">
        <div>Failed</div>
        <div>Test</div>
        <div>Success</div>
    </button>
    <button id="submit-usenet-add" type="submit" form="add-usenet-form">Add</button>
{% endset %}

{{ window(False, "add-usenet-window", "Add Usenet Client", add_usenet_content, add_usenet_submit) }}

{% set edit_usenet_content %}
    <p class="error hidden" id="edit-usenet-error"></p>
    <form id="edit-usenet-form">
        <table>
            <tr>
                <th><label for="edit-usenet-title-input">Title</label></th>
                <td>
                    <input type="text" id="edit-usenet-title-input" required>
                </td>
            </tr>
            <tr>
                <th><label for="edit-usenet-baseurl-input">Base URL</label></th>
                <td>
                    <input type="text" id="edit-usenet-baseurl-input" required>
                    <p>E.g. 'http://192.168.2.15:8080'</p>
                </td>
            </tr>
        </table>
    </form>
{% endset %}

{% set edit_usenet_submit %}
    <button id="delete-usenet-edit" type="button">Delete</button>
    <button id="test-usenet-edit" class="test-button" type="button">
        <div>Failed</div>
        <div>Test</div>
        <div>Success</div>
    </button>
    <button id="submit-usenet-edit" type="submit" form="edit-usenet-form">Save</button>
{% endset %}

{{ window(False, "edit-usenet-window", "Edit Usenet Client", edit_usenet_content, edit_usenet_submit) }}

{% set choose_usenet_content %}
    <div id="choose-usenet-list"></div>
{% endset %}

{{ window(False, "choose-usenet-window", "Choose Usenet Client", choose_usenet_content) }}
```

### frontend/static/js/settings_download_clients.js — MODIFY

Add Usenet client management functions (after torrent functions):
```javascript
// Usenet Clients
function loadUsenetList(api_key) {
    const table = document.querySelector('#choose-usenet-list');
    table.innerHTML = '';

    fetchAPI('/externalclients/options', api_key, { download_type: '3' })
    .then(json => {
        Object.keys(json.result).forEach(c => {
            const entry = document.createElement('button');
            entry.innerText = c;
            entry.onclick = e => loadAddUsenet(api_key, c);
            table.appendChild(entry);
        });
        showWindow('choose-usenet-window');
    });
};

function loadAddUsenet(api_key, client_type) {
    const form = document.querySelector('#add-usenet-form tbody');
    form.dataset.type = client_type;
    form.querySelectorAll(
        'tr:not(:has(input#add-usenet-title-input, input#add-usenet-baseurl-input))'
    ).forEach(el => el.remove());
    document.querySelector('#test-usenet-add').classList.remove(
        'show-success', 'show-fail'
    )
    form.querySelectorAll(
        '#add-usenet-title-input, #add-usenet-baseurl-input'
    ).forEach(el => el.value = '');

    fetchAPI('/externalclients/options', api_key)
    .then(json => {
        const client_options = json.result[client_type];

        if (client_options.includes('username'))
            form.appendChild(createUsernameInput('add-usenet-username-input'));

        if (client_options.includes('password'))
            form.appendChild(createPasswordInput('add-usenet-password-input'));

        if (client_options.includes('api_token'))
            form.appendChild(createApiTokenInput('add-usenet-token-input'));

        showWindow('add-usenet-window');
    });
};

function loadUsenetClients(api_key) {
    fetchAPI('/externalclients', api_key, { download_type: '3' })
    .then(json => {
        const table = document.querySelector('#usenet-client-list');
        document.querySelectorAll('#usenet-client-list > :not(:first-child)')
            .forEach(el => el.remove());

        json.result.forEach(client => {
            const entry = document.createElement('button');
            entry.onclick = (e) => loadEditUsenet(api_key, client.id);
            entry.innerText = client.title;
            table.appendChild(entry);
        });
    });
};

function loadEditUsenet(api_key, id) {
    const form = document.querySelector('#edit-usenet-form tbody');
    form.dataset.id = id;
    form.querySelectorAll(
        'tr:not(:has(input#edit-usenet-title-input, input#edit-usenet-baseurl-input))'
    ).forEach(el => el.remove());
    document.querySelector('#test-usenet-edit').classList.remove(
        'show-success', 'show-fail'
    )
    hide([document.querySelector('#edit-usenet-error')]);

    fetchAPI(`/externalclients/${id}`, api_key)
    .then(client_data => {
        const client_type = client_data.result.client_type;
        form.dataset.type = client_type;
        fetchAPI('/externalclients/options', api_key)
        .then(options => {
            const client_options = options.result[client_type];

            form.querySelector('#edit-usenet-title-input').value =
                client_data.result.title || '';

            form.querySelector('#edit-usenet-baseurl-input').value =
                client_data.result.base_url;

            if (client_options.includes('username')) {
                const username_input = createUsernameInput('edit-usenet-username-input');
                username_input.querySelector('input').value =
                    client_data.result.username || '';
                form.appendChild(username_input);
            };

            if (client_options.includes('password')) {
                const password_input = createPasswordInput('edit-usenet-password-input');
                password_input.querySelector('input').value =
                    client_data.result.password || '';
                form.appendChild(password_input);
            };

            if (client_options.includes('api_token')) {
                const token_input = createApiTokenInput('edit-usenet-token-input');
                token_input.querySelector('input').value =
                    client_data.result.api_token || '';
                form.appendChild(token_input);
            };

            showWindow('edit-usenet-window');
        });
    });
}

function saveEditUsenet() {
    usingApiKey()
    .then(api_key => {
        testEditUsenet(api_key).then(result => {
            if (!result)
                return;

            const form = document.querySelector('#edit-usenet-form tbody');
            const id = form.dataset.id;
            const data = {
                title: form.querySelector('#edit-usenet-title-input').value,
                base_url: form.querySelector('#edit-usenet-baseurl-input').value,
                username: form.querySelector('#edit-usenet-username-input')?.value || null,
                password: form.querySelector('#edit-usenet-password-input')?.value || null,
                api_token: form.querySelector('#edit-usenet-token-input')?.value || null
            };
            sendAPI('PUT', `/externalclients/${id}`, api_key, {}, data)
            .then(response => {
                loadUsenetClients(api_key);
                closeWindow();
            })
            .catch(e => {
                if (e.status === 400) {
                    // Client is downloading
                    const error = document.querySelector('#edit-usenet-error');
                    error.innerText = '*Client is downloading';
                    hide([], [error]);
                }
            });
        });
    });
}

async function testEditUsenet(api_key) {
    const error = document.querySelector('#edit-usenet-error');
    hide([error]);
    const form = document.querySelector('#edit-usenet-form tbody');
    const test_button = document.querySelector('#test-usenet-edit');
    test_button.classList.remove('show-success', 'show-fail');
    const data = {
        client_type: form.dataset.type,
        base_url: form.querySelector('#edit-usenet-baseurl-input').value,
        username: form.querySelector('#edit-usenet-username-input')?.value || null,
        password: form.querySelector('#edit-usenet-password-input')?.value || null,
        api_token: form.querySelector('#edit-usenet-token-input')?.value || null,
    };
    return await sendAPI('POST', '/externalclients/test', api_key, {}, data)
    .then(response => response.json())
    .then(json => {
        if (json.result.success)
            test_button.classList.add('show-success');
        else {
            test_button.classList.add('show-fail');
            error.innerText = json.result.description;
            hide([], [error]);
        }
        return json.result.success;
    });
}

function deleteUsenet(api_key) {
    const id = document.querySelector('#edit-usenet-form tbody').dataset.id;
    sendAPI('DELETE', `/externalclients/${id}`, api_key)
    .then(response => {
        loadUsenetClients(api_key);
        closeWindow();
    })
    .catch(e => {
        if (e.status === 400) {
            const error = document.querySelector('#edit-usenet-error');
            error.innerText = '*Client is downloading';
            hide([], [error]);
        }
    });
}

function saveAddUsenet() {
    usingApiKey()
    .then(api_key => {
        testAddUsenet(api_key).then(result => {
            if (!result)
                return;

            const form = document.querySelector('#add-usenet-form tbody');
            const data = {
                client_type: form.dataset.type,
                title: form.querySelector('#add-usenet-title-input').value,
                base_url: form.querySelector('#add-usenet-baseurl-input').value,
                username: form.querySelector('#add-usenet-username-input')?.value || null,
                password: form.querySelector('#add-usenet-password-input')?.value || null,
                api_token: form.querySelector('#add-usenet-token-input')?.value || null
            };
            sendAPI('POST', '/externalclients', api_key, {}, data)
            .then(response => {
                loadUsenetClients(api_key);
                closeWindow();
            });
        });
    });
}

async function testAddUsenet(api_key) {
    const error = document.querySelector('#add-usenet-error');
    hide([error]);
    const form = document.querySelector('#add-usenet-form tbody');
    const test_button = document.querySelector('#test-usenet-add');
    test_button.classList.remove('show-success', 'show-fail');
    const data = {
        client_type: form.dataset.type,
        base_url: form.querySelector('#add-usenet-baseurl-input').value,
        username: form.querySelector('#add-usenet-username-input')?.value || null,
        password: form.querySelector('#add-usenet-password-input')?.value || null,
        api_token: form.querySelector('#add-usenet-token-input')?.value || null,
    };
    return await sendAPI('POST', '/externalclients/test', api_key, {}, data)
    .then(response => response.json())
    .then(json => {
        if (json.result.success)
            test_button.classList.add('show-success');
        else
            test_button.classList.add('show-fail');
            error.innerText = json.result.description;
            hide([], [error]);
        return json.result.success;
    });
}
```

Update main initialization:
```javascript
// Main initialization - only call this once
usingApiKey()
.then(api_key => {
    fillCredentials(api_key);
    loadTorrentClients(api_key);
    loadUsenetClients(api_key);

    // Event handlers for usenet clients
    document.querySelector('#delete-usenet-edit').onclick = e => deleteUsenet(api_key);
    document.querySelector('#test-usenet-edit').onclick = e => testEditUsenet(api_key);
    document.querySelector('#test-usenet-add').onclick = e => testAddUsenet(api_key);
    document.querySelector('#add-usenet-client').onclick = e => loadUsenetList(api_key);
});
```

### frontend/api.py — MODIFY

Add Prowlarr settings API endpoints (after external_clients routes, ~line 1380):
```python
# =====================
# Search Sources API
# =====================

@api.route('/searchsources', methods=['GET', 'POST'])
@error_handler
@auth
def api_search_sources():
    if request.method == 'GET':
        result = get_db().execute("""
            SELECT id, client_type, title, base_url, api_key
            FROM search_sources
            ORDER BY title, id;
        """).fetchalldict()
        return return_api(result)

    elif request.method == 'POST':
        data = request.get_json(silent=True) or {}
        title = extract_key(data, 'title')
        base_url = extract_key(data, 'base_url')
        api_key = extract_key(data, 'api_key')

        if title is None or base_url is None or api_key is None:
            raise InvalidKeyValue('missing required fields', None)

        # Test connection to Prowlarr
        test_result = test_prowlarr(base_url, api_key)
        if not test_result['success']:
            return return_api(test_result, code=400)

        # Insert
        get_db().execute("""
            INSERT INTO search_sources(client_type, title, base_url, api_key)
            VALUES ('Prowlarr', :title, :base_url, :api_key);
        """, {
            'title': title,
            'base_url': normalise_base_url(base_url),
            'api_key': api_key,
        })

        return return_api({'success': True}, code=201)


@api.route('/searchsources/test', methods=['POST'])
@error_handler
@auth
def api_search_sources_test():
    data = request.get_json(silent=True) or {}
    base_url = extract_key(data, 'base_url')
    api_key = extract_key(data, 'api_key')

    result = test_prowlarr(base_url, api_key)
    return return_api(result)


@api.route('/searchsources/<int:id>', methods=['GET', 'PUT', 'DELETE'])
@error_handler
@auth
def api_search_source(id: int):
    if request.method == 'GET':
        result = get_db().execute("""
            SELECT id, client_type, title, base_url, api_key
            FROM search_sources
            WHERE id = ?
            LIMIT 1;
        """, (id,)).fetchonedict()
        if not result:
            raise InvalidKeyValue('id', id)
        return return_api(result)

    elif request.method == 'PUT':
        data = request.get_json(silent=True) or {}
        title = extract_key(data, 'title')
        base_url = extract_key(data, 'base_url')
        api_key = extract_key(data, 'api_key')

        if title is None or base_url is None or api_key is None:
            raise InvalidKeyValue('missing required fields', None)

        # Test connection to Prowlarr
        test_result = test_prowlarr(base_url, api_key)
        if not test_result['success']:
            return return_api(test_result, code=400)

        get_db().execute("""
            UPDATE search_sources
            SET title = :title, base_url = :base_url, api_key = :api_key
            WHERE id = :id;
        """, {
            'title': title,
            'base_url': normalise_base_url(base_url),
            'api_key': api_key,
            'id': id,
        })

        return return_api({'success': True})

    elif request.method == 'DELETE':
        get_db().execute("DELETE FROM search_sources WHERE id = ?;", (id,))
        return return_api({'success': True})


def test_prowlarr(base_url: str, api_key: str) -> Dict[str, Any]:
    """Test connection to Prowlarr."""
    from backend.base.helpers import Session, normalise_base_url
    url = f'{normalise_base_url(base_url)}/api/v1'
    params = {'apikey': api_key, 'cmd': 'version'}
    try:
        response = Session().get(url, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()
        if data.get('success'):
            return {'success': True, 'description': None}
        return {'success': False, 'description': data.get('error', 'Unknown error')}
    except Exception as e:
        LOGGER.exception(f"Can't connect to Prowlarr at {base_url}")
        return {'success': False, 'description': str(e)}
```

## Slices

### Slice 1: Foundation — Enum, SearchResultData, Migration, SABnzbd Client

**Files**: `backend/base/definitions.py` (MODIFY), `backend/internals/db.py` (MODIFY), `backend/internals/db_migration.py` (MODIFY), `backend/implementations/usenet_clients/__init__.py` (NEW), `backend/implementations/usenet_clients/SABnzbd.py` (NEW)

#### Automated Verification:
- [ ] Type checking passes: `python -m py_compile backend/base/definitions.py backend/implementations/usenet_clients/SABnzbd.py`
- [ ] SABnzbd client has correct class attributes: `grep -r "client_type = 'SABnzbd'" backend/implementations/usenet_clients/`
- [ ] DownloadType.USENET = 3 exists: `grep -r "USENET = 3" backend/base/definitions.py`
- [ ] Migration V45 registered: `grep -r "@register_handler(45)" backend/internals/db_migration.py`
- [ ] SearchResultData has new fields: `grep -r "size: int" backend/base/definitions.py`

#### Manual Verification:
- [ ] SABnzbd `_connect()` validates connection correctly
- [ ] SABnzbd state_mapping covers all SABnzbd status values
- [ ] SABnzbd `get_download()` checks both queue and history

### Slice 2: Prowlarr SearchSource + _subclasses Pattern

**Files**: `backend/base/definitions.py` (MODIFY — SearchSource._subclasses), `backend/search_sources/__init__.py` (NEW), `backend/search_sources/prowlarr.py` (NEW), `backend/features/search.py` (MODIFY)

#### Automated Verification:
- [ ] Type checking passes: `python -m py_compile backend/search_sources/prowlarr.py`
- [ ] SearchSource has _subclasses: `grep -r "_subclasses = set()" backend/base/definitions.py`
- [ ] SearchProwlarr inherits SearchSource: `grep -r "class SearchProwlarr(SearchSource)" backend/search_sources/prowlarr.py`
- [ ] register_prowlarr_search_source exists: `grep -r "register_prowlarr_search_source" backend/search_sources/prowlarr.py`

#### Manual Verification:
- [ ] Prowlarr search returns valid SearchResultData dicts
- [ ] Prowlarr search handles missing configuration gracefully
- [ ] Dynamic registration adds SearchProwlarr to _subclasses when configured

### Slice 3: UsenetDownload Class

**Files**: `backend/implementations/download_clients.py` (MODIFY)

#### Automated Verification:
- [ ] Type checking passes: `python -m py_compile backend/implementations/download_clients.py`
- [ ] UsenetDownload has identifier='usenet': `grep -r "identifier: str = 'usenet'" backend/implementations/download_clients.py`
- [ ] UsenetDownload inherits from ExternalDownload and BaseDirectDownload: `grep -r "class UsenetDownload(ExternalDownload, BaseDirectDownload)" backend/implementations/download_clients.py`

#### Manual Verification:
- [ ] UsenetDownload.__init__ selects SABnzbd client via get_least_used_client(DownloadType.USENET)
- [ ] UsenetDownload.run() calls external_client.add_download()

### Slice 4: Inline Usenet Download Loop + Link Detection

**Files**: `backend/features/download_queue.py` (MODIFY)

#### Automated Verification:
- [ ] Type checking passes: `python -m py_compile backend/features/download_queue.py`
- [ ] UsenetDownload imported: `grep -r "UsenetDownload" backend/features/download_queue.py`
- [ ] __run_usenet_download exists: `grep -r "__run_usenet_download" backend/features/download_queue.py`
- [ ] Prowlarr link detection: `grep -r "prowlarr" backend/features/download_queue.py`

#### Manual Verification:
- [ ] `__run_usenet_download` reuses TORRENT_UPDATE_INTERVAL
- [ ] `__run_usenet_download` reuses delete_completed_torrents setting
- [ ] `__determine_link_type` detects 'prowlarr' links
- [ ] `add()` creates UsenetDownload for prowlarr links

### Slice 5: PostProcessorUsenet

**Files**: `backend/features/post_processing.py` (MODIFY)

#### Automated Verification:
- [ ] Type checking passes: `python -m py_compile backend/features/post_processing.py`
- [ ] PostProcessorUsenet inherits PostProcessor: `grep -r "class PostProcessorUsenet(PostProcessor)" backend/features/post_processing.py`

#### Manual Verification:
- [ ] PostProcessorUsenet.actions_success matches existing post-processing actions

### Slice 6: Frontend — Usenet Clients Section

**Files**: `frontend/templates/settings_download_clients.html` (MODIFY), `frontend/static/js/settings_download_clients.js` (MODIFY)

#### Automated Verification:
- [ ] Template renders without errors
- [ ] JS file has no syntax errors

#### Manual Verification:
- [ ] Usenet Clients section appears in download_clients settings page
- [ ] Add/Edit/Delete operations work for SABnzbd
- [ ] Test button validates SABnzbd connection
- [ ] SABnzbd appears in download client dropdown (download_type=3)

### Slice 7: API Endpoints

**Files**: `frontend/api.py` (MODIFY)

#### Automated Verification:
- [ ] Type checking passes: `python -m py_compile frontend/api.py`
- [ ] Search sources routes registered: `grep -r "searchsources" frontend/api.py`

#### Manual Verification:
- [ ] GET /searchsources returns list
- [ ] POST /searchsources creates and tests
- [ ] PUT /searchsources/<id> updates and tests
- [ ] DELETE /searchsources/<id> removes
- [ ] POST /searchsources/test validates

### Slice 8: Integration — Search + Download Flow

**Files**: `backend/features/search.py` (MODIFY)

#### Automated Verification:
- [ ] Type checking passes: `python -m py_compile backend/features/search.py`
- [ ] Prowlarr import registered: `grep -r "register_prowlarr_search_source" backend/features/search.py`

#### Manual Verification:
- [ ] Prowlarr search runs alongside GetComics in manual search
- [ ] Prowlarr results integrated into existing search flow
- [ ] NZB URL from Prowlarr triggers usenet download flow

## Desired End State

```python
# 1. Developer adds Prowlarr config via API (or settings page — to be built)
#    → Prowlarr config saved to search_sources table
#    → SearchProwlarr registered in SearchSource._subclasses

# 2. Developer adds SABnzbd config in Settings → Download Clients → Usenet Clients
#    → SABnzbd config saved to external_download_clients table
#    → SABnzbd appears in dropdown automatically (data-driven, download_type=3)

# 3. Developer clicks "Manual Search" on an issue
#    → GetComics search runs (existing)
#    → Prowlarr search runs (new, if configured) — results integrated
#    → Results from both sources shown together

# 4. Developer clicks an NZB result from Prowlarr
#    → UsenetDownload created and added to queue
#    → SABnzbd addurl API submits NZB
#    → Status polling via SABnzbd API (TORRENT_UPDATE_INTERVAL)
#    → On import: PostProcessor.success(download)

# 5. Download queue shows usenet downloads with progress
#    → WebSocket updates in real-time
#    → Can cancel/remove usenet downloads
```

## File Map

- `backend/base/definitions.py` — MODIFY — USUENET enum, SearchResultData extension, SearchSource._subclasses
- `backend/internals/db.py` — MODIFY — Add search_sources table schema
- `backend/internals/db_migration.py` — MODIFY — Add V45 migration
- `backend/implementations/usenet_clients/__init__.py` — NEW — Namespace package
- `backend/implementations/usenet_clients/SABnzbd.py` — NEW — SABnzbd ExternalDownloadClient
- `backend/search_sources/__init__.py` — NEW — Namespace package
- `backend/search_sources/prowlarr.py` — NEW — Prowlarr SearchSource + register function
- `backend/implementations/download_clients.py` — MODIFY — Add UsenetDownload class
- `backend/features/download_queue.py` — MODIFY — UsenetDownload import, __run_usenet_download, link detection
- `backend/features/post_processing.py` — MODIFY — Add PostProcessorUsenet
- `backend/features/search.py` — MODIFY — Import ProwlarrSearchSource + registration
- `backend/implementations/external_clients.py` — MODIFY — Import SABnzbd in get_client_types()
- `frontend/templates/settings_download_clients.html` — MODIFY — Add Usenet Clients section + windows
- `frontend/static/js/settings_download_clients.js` — MODIFY — Add Usenet client management functions
- `frontend/api.py` — MODIFY — Add search sources API endpoints

## Ordering Constraints

1. **Slice 1 must precede all others** — enum + migration + SABnzbd client are foundational
2. **Slice 2 must precede Slice 8** — Prowlarr SearchSource must exist before search integration
3. **Slice 3 must precede Slice 4** — UsenetDownload class must exist before download loop
4. **Slice 5 can run in parallel with Slice 3-4** — PostProcessorUsenet is independent
5. **Slice 6 can run in parallel with Slice 1-5** — Frontend settings are independent
6. **Slice 7 must precede Slice 8** — API endpoints must exist before download flow integration
7. **Slice 8 is last** — ties everything together

## Verification Notes

- **SABnzbd API rate limits**: SABnzbd has API rate limits. Test with rapid polling.
- **Anonymous auth**: SABnzbd requires API key (no anonymous flow). Test with blank/invalid keys.
- **NZB URL format**: Prowlarr returns NZB URLs. Handle relative URLs.
- **State mapping**: SABnzbd states differ from torrent states. Verify all mappings.
- **DB migration V45**: Must be additive (CREATE TABLE IF NOT EXISTS). Safe to re-run.
- **Build check**: `python -m py_compile` on all modified/new files before committing.
- **Precedent lesson**: Auth edge cases always surface later — test with blank/invalid keys and network timeouts.
- **Precedent lesson**: Rate limiting is a fast-following bug — implement early.
- **Upstream lesson**: SearchSource._subclasses pattern requires import before get_subclasses() call.

## Performance Considerations

- **Polling interval**: Reuses TORRENT_UPDATE_INTERVAL (5s). SABnzbd can handle concurrent status polls.
- **Search pagination**: Prowlarr search limits to 100 results.
- **Memory**: UsenetDownload instances stored in queue like TorrentDownload. No special considerations.
- **Network**: NZB URL submission is a single HTTP GET call to SABnzbd API.

## Migration Notes

- **V45 migration**: Adds `search_sources` table. Uses `CREATE TABLE IF NOT EXISTS` — safe to re-run.
- **DownloadType.USENET = 3**: No DB migration needed. INTEGER column, no FK constraint.
- **Backwards compatibility**: Existing downloads unaffected. Usenet downloads use `client_type='usenet'`.
- **Rollback**: Drop `search_sources` table if needed. No data loss risk.

## Pattern References

- `backend/implementations/usenet_clients/SABnzbd.py` — SABnzbd client (identical to upstream usenet branch)
- `backend/implementations/download_clients.py:772-941` — TorrentDownload (pattern template)
- `backend/features/download_queue.py:109-179` — __run_torrent_download (pattern template for __run_usenet_download)
- `backend/features/post_processing.py:286-329` — PostProcessor class (pattern template)
- `frontend/static/js/settings_download_clients.js:221-235` — Frontend settings (pattern template)
- Upstream: https://github.com/Casvt/Kapowarr/compare/main...usenet — Original usenet branch (2 commits, 21 files)

## Developer Context

**Q (`backend/implementations/external_clients.py:242`): Should username/password validation be required_tokens-aware or use a separate Usenet add path?**
A: Uses existing ExternalClients.add() with `download_type=3` — data-driven from `required_tokens`.

**Q (`backend/base/definitions.py:456`): DownloadType enum — add USENET=3 or reuse TORRENT=2?**
A: Add `USENET = 3` — semantically correct, no DB migration needed.

**Q (`backend/features/search.py:143`): Prowlarr settings — in-memory SearchSource or persistent DB table?**
A: New `search_sources` DB table + dynamic registration — consistent with external download client pattern.

**Q (`backend/features/download_queue.py:349`): NZB download flow — extend DownloadHandler or separate endpoint?**
A: Inline `__run_usenet_download` in DownloadHandler (matches upstream pattern) — same as `__run_torrent_download`.

**Q (`backend/implementations/download_clients.py:772`): NZB flow location — in UsenetDownload.run() or separate handler?**
A: Inline in DownloadHandler (matches upstream) — not a separate handler.

**Q (`backend/features/post_processing.py:201`): Post-processing — reuse PostProcessor or separate class?**
A: Separate `PostProcessorUsenet` reusing existing action functions (matches upstream) — maximizes code reuse.

**Q (`backend/base/definitions.py:130`): Polling interval — reuse TORRENT_UPDATE_INTERVAL or separate constant?**
A: Reuse `Constants.TORRENT_UPDATE_INTERVAL` (matches upstream) — avoids unnecessary constant proliferation.

**Q (`backend/internals/db.py:435`): DB migration — one or two migrations?**
A: One migration V45 for `search_sources` table. DownloadType enum change needs no migration.

**Q (Frontend): Usenet settings — separate page or existing download_clients page?**
A: Existing download_clients page with Usenet Clients section (matches upstream) — consistent with existing layout.

**Q (Frontend): NZB download flow — special handling in view_volume.js?**
A: No special handling needed — Prowlarr NZB URLs go through DownloadHandler().add() which detects 'prowlarr' link type.

## Design History

- Slice 1: Foundation — Enum, SearchResultData, Migration, SABnzbd Client — pending
- Slice 2: Prowlarr SearchSource + _subclasses Pattern — pending
- Slice 3: UsenetDownload Class — pending
- Slice 4: Inline Usenet Download Loop + Link Detection — pending
- Slice 5: PostProcessorUsenet — pending
- Slice 6: Frontend — Usenet Clients Section — pending
- Slice 7: API Endpoints — pending
- Slice 8: Integration — Search + Download Flow — pending

## References

- `.rpiv/artifacts/research/2026-07-14_20-59-30_usenet_integration.md` — Research artifact
- `.rpiv/artifacts/discover/2026-07-13_21-34-00_usenet_integration.md` — FRD
- `backend/implementations/usenet_clients/SABnzbd.py` — SABnzbd client (identical to upstream)
- `backend/implementations/download_clients.py:772` — TorrentDownload (pattern template)
- Upstream usenet branch: https://github.com/Casvt/Kapowarr/compare/main...usenet (2 commits, 21 files, +3653/-117)
- Upstream SABnzbd.py: https://raw.githubusercontent.com/Casvt/Kapowarr/usenet/backend/implementations/usenet_clients/sabnzbd.py
- Upstream newznab.py: https://raw.githubusercontent.com/Casvt/Kapowarr/usenet/backend/implementations/direct_clients/newznab.py
- Upstream search.py: https://raw.githubusercontent.com/Casvt/Kapowarr/usenet/backend/features/search.py
- Upstream download_queue.py: https://raw.githubusercontent.com/Casvt/Kapowarr/usenet/backend/features/download_queue.py
- Upstream download_clients.py: https://raw.githubusercontent.com/Casvt/Kapowarr/usenet/backend/implementations/download_clients.py
- Upstream post_processing.py: https://raw.githubusercontent.com/Casvt/Kapowarr/usenet/backend/features/post_processing.py
- Upstream external_clients.py: https://raw.githubusercontent.com/Casvt/Kapowarr/usenet/backend/implementations/external_clients.py
- Upstream settings_download_clients.html: https://raw.githubusercontent.com/Casvt/Kapowarr/usenet/frontend/templates/settings_download_clients.html
- Upstream settings_download_clients.js: https://raw.githubusercontent.com/Casvt/Kapowarr/usenet/frontend/static/js/settings_download_clients.js
