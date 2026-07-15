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
