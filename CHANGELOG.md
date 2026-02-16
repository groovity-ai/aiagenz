# AiAgenz Changelog

## [Unreleased] - 2026-02-16

### Added
- **Backend:** `GET /api/projects/:id/config` endpoint to read `openclaw.json` from running container.
- **Backend:** `PUT /api/projects/:id/config` endpoint to update `openclaw.json` and restart container.
- **Frontend:** New `ConfigTab` component for visual configuration.
- **Frontend:** Refactored Project Detail page to use Tabs (Overview, Configuration, Console).

### Changed
- **Backend Service:** Implemented `ExecCommand` in `ContainerService` to capture command output.
- **Backend Service:** Upgraded config management to support dual-file storage (`openclaw.json` and `auth-profiles.json`).
- **Security:** Used `base64` encoding for safe config injection into containers.
- **Security:** Credentials are now stored in the standard OpenClaw Agent Store (`auth-profiles.json`).

### Fixed
- **UI:** Better organization of project controls and logs.
