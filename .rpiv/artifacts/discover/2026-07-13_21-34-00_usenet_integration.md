---
date: 2026-07-13T21:34:00+0200
author: Jan Eltner
commit: 55946aa
branch: main
repository: Kapowarr
topic: "usenet_integration"
tags: [intent, frd, relevant-component-names]
status: ready
last_updated: 2026-07-13T21:34:00+0200
last_updated_by: Jan Eltner
---

# FRD: Usenet-Integration für Kapowarr

## Summary

Kapowarr soll Usenet als zusätzliche Content-Quelle integrieren, indem Prowlarr als automatischer Usenet-Indexer (SearchSource) und SABnzbd als Download-Client (ExternalDownloadClient) angebunden werden. Nutzer können über die Prowlarr-API nach Comics suchen, Suchergebnisse auswählen, und das NZB wird automatisch an SABnzbd gesendet. Der Download-Status wird über die SABnzbd-API in Kapowarr angezeigt.

## Problem & Intent

"Endnutzer — Usenet als Quelle" — Usenet soll als zusätzliche Content-Quelle neben RSS/Downloads dienen, ähnlich wie Sonarr/Radarr es für Newznab/NzbDrone machen.

## Goals

- Prowlarr als SearchSource-Implementierung für automatische Usenet-Suche
- SABnzbd als ExternalDownloadClient (analog zu qBittorrent/Transmission)
- Automatischer NZB-Download-Flow: Suche → NZB über Prowlarr-API → SABnzbd
- Download-Status-Sync mit SABnzbd-API (Polling)
- Download-Verlauf für Usenet-Downloads
- Eigener Settings-Tab für Prowlarr-Konfiguration
- SABnzbd-Integration in Download-Client-Settings

## Non-Goals

- Kein NZB-Parser — das NZB wird unverändert an SABnzbd weitergeleitet
- Kein automatischer Import nach Download (Nutzer muss manuell importieren, wie bei Torrents)
- Kein Multi-Indexer-Fallback — nur eine Prowlarr-Instance wird unterstützt

## Functional Requirements

1. **FR-01**: Das System SHALL es dem Nutzer ermöglichen, SABnzbd in den Settings zu konfigurieren (Base-URL, API-Key) und die Verbindung mit einem Test zu verifizieren.
2. **FR-02**: Das System SHALL es dem Nutzer ermöglichen, Prowlarr in den Settings zu konfigurieren (Base-URL, API-Key) und die Verbindung mit einem Test zu verifizieren.
3. **FR-03**: Das System SHALL Prowlarr als SearchSource implementieren — Suchanfragen werden an die Prowlarr-API gesendet und Ergebnisse werden im Suchergebnis-UI angezeigt.
4. **FR-04**: Das System SHALL einen automatischen NZB-Download-Flow implementieren: Nutzer wählt Suchergebnis aus → Kapowarr holt NZB über Prowlarr-API → sendet NZB an SABnzbd → trackt Download-Status.
5. **FR-05**: Das System SHALL den Download-Status von SABnzbd über die SABnzbd-API abfragen und in Kapowarr anzeigen (analog zu Torrent-Status-Polling).
6. **FR-06**: Das System SHALL Usenet-Downloads im Download-Verlauf (History) protokollieren mit Status, Größe, Quelle (Prowlarr) und Download-Ordner.
7. **FR-07**: Das System SHALL einen neuen Settings-Tab "Usenet" für Prowlarr-Konfiguration bereitstellen.
8. **FR-08**: Das System SHALL SABnzbd in der Download-Client-Liste (neben qBittorrent/Transmission) anzeigen und verwalten.

## Non-Functional Requirements

- **Performance**: Download-Status-Polling alle 5 Sekunden (analog zu `Constants.TORRENT_UPDATE_INTERVAL`).
- **Security**: API-Keys für Prowlarr und SABnzbd werden verschlüsselt in der SQLite-Datenbank gespeichert (analog zu bestehenden `external_download_clients`).
- **UX / Accessibility**: Konsistente UI-Integration — Prowlarr-Einstellungen im eigenen Tab, SABnzbd in der Download-Client-Liste. Keine neuen Browser-Abhängigkeiten.
- **Reliability**: Bei SABnzbd-Verbindungsfehler soll der Download mit `FAILED_STATE` markiert werden. Retry-Logik für temporäre Netzwerkfehler.

## Constraints & Assumptions

- Neue Python-Dependencies sind erlaubt (z.B. `sabnzbdapi` oder HTTP-Client für SABnzbd-API).
- Alle Änderungen müssen im bestehenden Docker-Build funktionieren.
- Kein NZB-Parser — das NZB wird unverändert an SABnzbd weitergeleitet.
- Nur eine Prowlarr-Instance wird unterstützt (kein Fallback).
- Die bestehende `SearchSource`- und `ExternalDownloadClient`-ABC-Architektur wird erweitert, nicht ersetzt.

## Acceptance Criteria

- [ ] SABnzbd kann in den Settings konfiguriert werden (Base-URL, API-Key), die Verbindung wird mit "Test" verifiziert.
- [ ] Prowlarr-API kann in den Settings konfiguriert werden (Base-URL, API-Key), die Verbindung wird mit "Test" verifiziert.
- [ ] Suchanfragen werden an Prowlarr gesendet und Ergebnisse werden im Suchergebnis-UI angezeigt.
- [ ] Ein Suchergebnis aus Prowlarr kann ausgewählt werden → NZB wird an SABnzbd gesendet → Download erscheint in SABnzbd.
- [ ] Download-Verlauf für Usenet-Downloads wird protokolliert (History-Tabelle enthält Einträge mit `download_type` = Usenet).

## Recommended Approach

Neue `SearchSource`-Implementierung (`SearchProwlarr`) in `backend/features/search.py` und neue `ExternalDownloadClient`-Implementierung (`SABnzbdClient`) in `backend/implementations/external_clients.py` (oder neuem Verzeichnis `backend/implementations/usenet_clients/`), mit automatischem NZB-Download-Flow über Prowlarr-API und Status-Sync über SABnzbd-API.

## Decisions

### Usenet-Client-Architektur
**Question**: Usenet-Client als Download-Client (SABnzbd/NZBGet als ExternalDownloadClient) oder direktes NZB-Download?
**Recommended**: Usenet-Integrationen (SABnzbd, NZBGet) sollen als ExternalDownloadClient implementiert werden — analog zu qBittorrent/Transmission. Das NZB wird an den Client gesendet, der Client lädt die Dateien von Usenet herunter.
**Chosen**: Usenet-Client als Download-Client (SABnzbd als ExternalDownloadClient).
**Rationale**: Entspricht dem bestehenden Torrent-Muster, maximiert Wiederverwendbarkeit der `ExternalDownloadClient`- und `DownloadHandler`-Architektur.

### Usenet-Client-Auswahl
**Question**: Welche Usenet-Clients sollen initial unterstützt werden?
**Recommended**: SABnzbd — de-facto Standard für Usenet-Downloads, breite Community-Unterstützung, reife API.
**Chosen**: SABnzbd (Recommended).
**Rationale**: SABnzbd ist der Standard in der Radarr/Sonarr-Community, beste API-Dokumentation, größte Nutzerbasis.

### Indexer-Integration
**Question**: Wie soll Kapowarr Usenet-Content finden? Newznab/ZendStudio API, manuelle NZB-Eingabe, oder beides?
**Recommended**: Newznab/ZendStudio API über Prowlarr — automatisches Suchen, analog zu GetComics-Suche.
**Chosen**: Prowlarr als SearchSource.
**Rationale**: Prowlarr ist der de-facto Indexer-Manager im Radarr/Sonarr-Ökosystem, bietet Newznab/ZendStudio-kompatible API, abstrahiert Indexer-Details.

### Prowlarr-Integrationstiefe
**Question**: Prowlarr-Integration — wie tief soll die Anbindung sein?
**Recommended**: Prowlarr als SearchSource — Suchanfragen gehen an Prowlarr, Ergebnisse werden wie normale Suchergebnisse gerankt.
**Chosen**: Prowlarr als SearchSource (Recommended).
**Rationale**: Maximiert Automatisierung und Prowlarr-Ökosystem-Integration, minimiert Implementierungsaufwand im Vergleich zu vollständiger Synchronisation.

### NZB-Download-Flow
**Question**: Wie soll der NZB-Download-Flow funktionieren?
**Recommended**: Automatischer Flow: Nutzer wählt Suchergebnis aus → Kapowarr holt NZB über Prowlarr-API → sendet es direkt an SABnzbd → trackt Download-Status über SABnzbd-API.
**Chosen**: Automatisch: Suche → NZB → SABnzbd (Recommended).
**Rationale**: Entspricht dem bestehenden Torrent-Flow, optimale User-Experience ohne manuelle Zwischenschritte.

### Kein NZB-Parser
**Question**: Soll Kapowarr NZB-Dateien selbst parsen?
**Recommended**: Nein — NZB wird unverändert an SABnzbd weitergeleitet. SABnzbd übernimmt Parsing und Download-Management.
**Chosen**: Kein NZB-Parser (NZB direkt an SABnzbd).
**Rationale**: Vermeidet redundante NZB-Parsing-Logik, SABnzbd ist spezialisierter, reduziert Wartungsaufwand.

### Kein Multi-Indexer-Fallback
**Question**: Soll Multi-Indexer-Fallback unterstützt werden?
**Recommended**: Nein — nur eine Prowlarr-Instance wird unterstützt.
**Chosen**: Kein Multi-Indexer-Fallback.
**Rationale**: Reduziert Komplexität, Prowlarr kann intern mehrere Indexer verwalten.

### UI-Integration
**Question**: Wie soll die Usenet-Integration im UI integriert werden?
**Recommended**: Eigener Tab + Download-Client-Integration — Prowlarr im eigenen Settings-Tab, SABnzbd in der Download-Client-Liste.
**Chosen**: Eigener Tab + Download-Client-Integration.
**Rationale**: Klare Trennung der Konfigurationsebenen (Prowlarr = Indexer-Settings, SABnzbd = Download-Client), konsistent mit bestehender UI-Struktur.

### Dependencies
**Question**: Welche Python-Dependencies dürfen verwendet werden?
**Recommended**: Neue Python-Packages sind erlaubt (z.B. `sabnzbdapi`, `nzbget`).
**Chosen**: Neue Dependencies erlaubt.
**Rationale**: Maximiert Funktionalität, SABnzbd-API-Client vereinfacht die Implementierung.

## Open Questions

{Keine — alle relevanten Fragen wurden im Interview beantwortet.}

## Suggested Follow-ups

- NZBGet-Unterstützung als zweiter Usenet-Client — könnte später als Erweiterung hinzugefügt werden (`backend/implementations/usenet_clients/nzbget.py`).
- Webhook-Integration für SABnzbd (statt Polling) — könnte Status-Updates in Echtzeit ermöglichen statt alle 5 Sekunden zu pollen.
- Blocklist-Sync mit Prowlarr — könnte automatisch gefundene blockierte Releases in Prowlarr markieren.
- Post-Processing für Usenet-Downloads — aktuell kein automatischer Import nach Download (Non-Goal), aber post-processing hooks könnten später hinzugefügt werden.

## References

- Prowlarr API-Dokumentation: https://github.com/Prowlarr/Prowlarr/blob/develop/src/NzbDrone.Core/Http/ProwlarrRestModule.cs
- SABnzbd API-Dokumentation: https://sabnzbd.org/wiki/external/api.html
- Kapowarr GitHub: https://github.com/Casvt/Kapowarr
- Usenet-Branch der Urquelle: https://github.com/Casvt/Kapowarr/tree/usenet (273 Commits hinter main)
