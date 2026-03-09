#!/usr/bin/env python3
"""Refresh README screenshot assets from the published Playwright report."""

from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Final
from urllib.parse import urljoin
from urllib.request import urlopen
from zipfile import ZipFile


DEFAULT_REPORT_URL: Final[str] = "https://robhanlon22.github.io/ableton-hud/"
SCREENSHOT_FILE: Final[str] = "hud/electron-hud-smoke.spec.ts"
SCREENSHOT_PATH: Final[tuple[str, ...]] = ("HUD screenshot smoke states",)
LEGACY_SCREENSHOTS: Final[tuple[str, ...]] = (
    "hud-connected-elapsed.png",
    "hud-connected-remaining.png",
    "hud-stopped.png",
    "hud-disconnected.png",
    "hud-compact.png",
)
TABLE_PATTERN: Final[re.Pattern[str]] = re.compile(
    r"<!-- README_SCREENSHOT_TABLE_START -->.*?<!-- README_SCREENSHOT_TABLE_END -->",
    re.DOTALL,
)
README_TABLE_START: Final[str] = "<!-- README_SCREENSHOT_TABLE_START -->"
README_TABLE_END: Final[str] = "<!-- README_SCREENSHOT_TABLE_END -->"


@dataclass(frozen=True)
class ScreenshotSpec:
    """Expected screenshot attachment metadata."""

    state_label: str
    title: str
    slug: str
    alt_prefix: str
    width: int


SCREENSHOT_SPECS: Final[tuple[ScreenshotSpec, ...]] = (
    ScreenshotSpec("Playing", "renders playing state", "playing", "Playing HUD", 370),
    ScreenshotSpec("Stopped", "renders stopped state", "stopped", "Stopped HUD", 370),
    ScreenshotSpec(
        "Disconnected",
        "renders disconnected state",
        "disconnected",
        "Disconnected HUD",
        370,
    ),
    ScreenshotSpec(
        "Remaining",
        "renders remaining mode state",
        "remaining",
        "Remaining-mode HUD",
        370,
    ),
    ScreenshotSpec(
        "Compact",
        "renders compact state",
        "compact",
        "Compact counter-only HUD",
        320,
    ),
)
PROJECT_LABELS: Final[dict[str, str]] = {
    "macos": "macOS",
    "windows": "Windows",
}


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""

    parser = argparse.ArgumentParser(
        description=(
            "Refresh README screenshot assets from the published GitHub Pages "
            "Playwright report."
        ),
    )
    parser.add_argument(
        "--report-url",
        default=DEFAULT_REPORT_URL,
        help="Published Playwright report root URL.",
    )
    parser.add_argument(
        "--repo-root",
        default=str(Path(__file__).resolve().parents[4]),
        help="Repo root containing README.md and docs/screenshots.",
    )
    return parser.parse_args()


def fetch_text(url: str) -> str:
    """Fetch a UTF-8 text resource."""

    with urlopen(url) as response:
        return response.read().decode("utf-8")


def fetch_bytes(url: str) -> bytes:
    """Fetch a binary resource."""

    with urlopen(url) as response:
        return response.read()


def extract_report_archive(html: str) -> bytes:
    """Extract the embedded zip archive containing report.json."""

    for match in re.finditer(r"[A-Za-z0-9+/=]{1000,}", html):
        try:
            data = base64.b64decode(match.group(0))
        except ValueError:
            continue
        if not data.startswith(b"PK"):
            continue
        with ZipFile(io.BytesIO(data)) as archive:
            if "report.json" in archive.namelist():
                return data
    raise RuntimeError("Could not find an embedded Playwright report archive.")


def load_report(html: str) -> dict[str, object]:
    """Load report.json from the embedded zip archive."""

    archive_bytes = extract_report_archive(html)
    with ZipFile(io.BytesIO(archive_bytes)) as archive:
        return json.loads(archive.read("report.json"))


def extract_attachment_paths(report: dict[str, object]) -> dict[tuple[str, str], str]:
    """Extract smoke screenshot attachment paths keyed by project and title."""

    attachment_paths: dict[tuple[str, str], str] = {}
    files = report.get("files")
    if not isinstance(files, list):
        raise RuntimeError("Playwright report is missing the files list.")

    for file_entry in files:
        if not isinstance(file_entry, dict):
            continue
        if file_entry.get("fileName") != SCREENSHOT_FILE:
            continue

        tests = file_entry.get("tests")
        if not isinstance(tests, list):
            continue

        for test in tests:
            if not isinstance(test, dict):
                continue
            path = test.get("path")
            if path != list(SCREENSHOT_PATH):
                continue

            project_name = test.get("projectName")
            title = test.get("title")
            if not isinstance(project_name, str) or not isinstance(title, str):
                continue

            results = test.get("results")
            if not isinstance(results, list):
                continue

            attachment_path: str | None = None
            for result in results:
                if not isinstance(result, dict):
                    continue
                attachments = result.get("attachments")
                if not isinstance(attachments, list):
                    continue
                for attachment in attachments:
                    if not isinstance(attachment, dict):
                        continue
                    content_type = attachment.get("contentType")
                    path_value = attachment.get("path")
                    if content_type == "image/png" and isinstance(path_value, str):
                        attachment_path = path_value
                        break
                if attachment_path is not None:
                    break

            if attachment_path is not None:
                attachment_paths[(project_name, title)] = attachment_path

    return attachment_paths


def download_screenshots(
    report_url: str,
    attachment_paths: dict[tuple[str, str], str],
    screenshot_dir: Path,
) -> None:
    """Download each expected screenshot to docs/screenshots."""

    missing: list[str] = []
    for spec in SCREENSHOT_SPECS:
        for project_name in PROJECT_LABELS:
            attachment_path = attachment_paths.get((project_name, spec.title))
            if attachment_path is None:
                missing.append(f"{project_name}:{spec.title}")
                continue
            target = screenshot_dir / f"hud-{spec.slug}-{project_name}.png"
            target.write_bytes(fetch_bytes(urljoin(report_url, attachment_path)))

    if missing:
        missing_list = ", ".join(missing)
        raise RuntimeError(f"Missing expected smoke screenshot attachments: {missing_list}")


def build_cache_tokens(screenshot_dir: Path) -> dict[tuple[str, str], str]:
    """Build stable cache-busting tokens from the screenshot file contents."""

    tokens: dict[tuple[str, str], str] = {}
    for spec in SCREENSHOT_SPECS:
        for project_name in PROJECT_LABELS:
            screenshot_path = screenshot_dir / f"hud-{spec.slug}-{project_name}.png"
            tokens[(spec.slug, project_name)] = hashlib.sha256(
                screenshot_path.read_bytes(),
            ).hexdigest()[:12]
    return tokens


def render_readme_table(cache_tokens: dict[tuple[str, str], str]) -> str:
    """Render the README screenshot table."""

    lines = [
        README_TABLE_START,
        "<table align=\"center\">",
        "  <tr>",
        "    <th>State</th>",
        "    <th>macOS</th>",
        "    <th>Windows</th>",
        "  </tr>",
    ]

    for spec in SCREENSHOT_SPECS:
        lines.extend(
            [
                "  <tr>",
                f"    <td>{spec.state_label}</td>",
            ],
        )
        for project_name, project_label in PROJECT_LABELS.items():
            cache_token = cache_tokens[(spec.slug, project_name)]
            lines.extend(
                [
                    "    <td>",
                    "      <img",
                    (
                        "        src=\"docs/screenshots/"
                        f"hud-{spec.slug}-{project_name}.png?v={cache_token}\""
                    ),
                    f"        alt=\"{spec.alt_prefix} on {project_label}\"",
                    f"        width=\"{spec.width}\"",
                    "      />",
                    "    </td>",
                ],
            )
        lines.append("  </tr>")

    lines.append("</table>")
    lines.append(README_TABLE_END)
    return "\n".join(lines)


def rewrite_readme(readme_path: Path, screenshot_dir: Path) -> None:
    """Rewrite the README screenshot table in place."""

    contents = readme_path.read_text(encoding="utf-8")
    matches = TABLE_PATTERN.findall(contents)
    if len(matches) != 1:
        raise RuntimeError(
            "Expected exactly one README screenshot block delimited by "
            "README_SCREENSHOT_TABLE_START and README_SCREENSHOT_TABLE_END.",
        )

    updated_contents = TABLE_PATTERN.sub(
        render_readme_table(build_cache_tokens(screenshot_dir)),
        contents,
        count=1,
    )
    readme_path.write_text(updated_contents, encoding="utf-8")


def remove_legacy_screenshots(screenshot_dir: Path) -> None:
    """Remove the legacy single-column screenshots if they still exist."""

    for legacy_name in LEGACY_SCREENSHOTS:
        legacy_path = screenshot_dir / legacy_name
        if legacy_path.exists():
            legacy_path.unlink()


def main() -> int:
    """Run the screenshot refresh workflow."""

    args = parse_args()
    repo_root = Path(args.repo_root).resolve()
    screenshot_dir = repo_root / "docs" / "screenshots"
    readme_path = repo_root / "README.md"

    html = fetch_text(args.report_url)
    report = load_report(html)
    attachment_paths = extract_attachment_paths(report)

    screenshot_dir.mkdir(parents=True, exist_ok=True)
    download_screenshots(args.report_url, attachment_paths, screenshot_dir)
    rewrite_readme(readme_path, screenshot_dir)
    remove_legacy_screenshots(screenshot_dir)

    print(f"Refreshed screenshots in {screenshot_dir}")
    print(f"Updated {readme_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
