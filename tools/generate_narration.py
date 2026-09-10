#!/usr/bin/env python3
"""Create a QwenTTS voice and synthesize the Wuling ride narration."""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
from pathlib import Path
import urllib.error
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
BASE_URL = "https://dashscope.aliyuncs.com/api/v1"
TARGET_MODEL = "qwen3-tts-vc-2026-01-22"


def post_json(path: str, payload: dict) -> dict:
    api_key = os.environ.get("DASHSCOPE_API_KEY")
    if not api_key:
        raise RuntimeError("DASHSCOPE_API_KEY is not set.")

    request = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"DashScope returned HTTP {error.code}: {detail}") from error


def enroll(args: argparse.Namespace) -> None:
    reference = Path(args.reference).resolve()
    if not reference.is_file():
        raise FileNotFoundError(f"Reference audio not found: {reference}")

    mime_type = mimetypes.guess_type(reference.name)[0] or "audio/wav"
    data_uri = (
        f"data:{mime_type};base64,"
        + base64.b64encode(reference.read_bytes()).decode("ascii")
    )
    response = post_json(
        "/services/audio/tts/customization",
        {
            "model": "qwen-voice-enrollment",
            "input": {
                "action": "create",
                "target_model": TARGET_MODEL,
                "preferred_name": args.name,
                "audio": {"data": data_uri},
            },
        },
    )
    voice = response.get("output", {}).get("voice")
    if not voice:
        raise RuntimeError(f"Enrollment response did not include a voice: {response}")

    voice_file = Path(args.voice_file)
    voice_file.parent.mkdir(parents=True, exist_ok=True)
    voice_file.write_text(f"{voice}\n", encoding="utf-8")
    print(voice)


def synthesize(args: argparse.Namespace) -> None:
    manifest_path = Path(args.manifest).resolve()
    voice_file = Path(args.voice_file).resolve()
    voice = args.voice or voice_file.read_text(encoding="utf-8").strip()
    if not voice:
        raise RuntimeError("No voice id supplied.")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    selected_ids = set(args.id or [])
    for item in manifest["segments"]:
        if selected_ids and item["id"] not in selected_ids:
            continue
        response = post_json(
            "/services/aigc/multimodal-generation/generation",
            {
                "model": TARGET_MODEL,
                "input": {
                    "text": item["text"],
                    "voice": voice,
                },
            },
        )
        audio_url = response.get("output", {}).get("audio", {}).get("url")
        if not audio_url:
            raise RuntimeError(
                f"Synthesis response for {item['id']} had no audio URL: {response}"
            )

        output = output_dir / f"{item['id']}.wav"
        with urllib.request.urlopen(audio_url, timeout=180) as response_stream:
            output.write_bytes(response_stream.read())
        print(f"{item['id']}: {output}")


def main() -> None:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    enroll_parser = subparsers.add_parser("enroll")
    enroll_parser.add_argument(
        "--reference",
        default=str(ROOT / ".cache/video/perlica-voice-reference.wav"),
    )
    enroll_parser.add_argument("--name", default="perlica-wuling")
    enroll_parser.add_argument(
        "--voice-file",
        default=str(ROOT / ".cache/video/perlica-voice.txt"),
    )
    enroll_parser.set_defaults(handler=enroll)

    synthesize_parser = subparsers.add_parser("synthesize")
    synthesize_parser.add_argument(
        "--manifest",
        default=str(ROOT / "video/narration.json"),
    )
    synthesize_parser.add_argument(
        "--voice-file",
        default=str(ROOT / ".cache/video/perlica-voice.txt"),
    )
    synthesize_parser.add_argument("--voice")
    synthesize_parser.add_argument(
        "--id",
        action="append",
        help="Only synthesize the selected segment id; may be repeated.",
    )
    synthesize_parser.add_argument(
        "--output-dir",
        default=str(ROOT / "video/audio"),
    )
    synthesize_parser.set_defaults(handler=synthesize)

    args = parser.parse_args()
    args.handler(args)


if __name__ == "__main__":
    main()
