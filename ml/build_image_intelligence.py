#!/usr/bin/env python3
"""
Build a local image-intelligence artifact for Archique.

This optional script reads artwork image URLs or local paths from an artworks
JSON export, derives lightweight PyTorch-based visual features, and writes
similarity / duplicate / tag suggestion metadata to JSON.
"""

from __future__ import annotations

import argparse
import io
import json
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import torch
import torch.nn.functional as F
from PIL import Image

DEFAULT_OUTPUT = Path("public/ml/artwork-intelligence.json")
RESIZE_TO = 224


@dataclass
class ArtworkImageRecord:
    artwork_id: int
    title: str
    image_url: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate local image intelligence for artworks.")
    parser.add_argument(
        "--artworks",
        required=True,
        help="Path to a JSON file containing artworks, typically an export of /api/artworks.",
    )
    parser.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT),
        help=f"Path to output JSON artifact. Defaults to {DEFAULT_OUTPUT}.",
    )
    parser.add_argument(
        "--similar-limit",
        type=int,
        default=6,
        help="How many similar artworks to retain per artwork.",
    )
    parser.add_argument(
        "--similarity-threshold",
        type=float,
        default=0.74,
        help="Minimum cosine similarity for a related artwork.",
    )
    parser.add_argument(
        "--duplicate-threshold",
        type=float,
        default=0.96,
        help="Cosine similarity threshold for duplicate detection.",
    )
    return parser.parse_args()


def load_artworks(path: Path) -> list[ArtworkImageRecord]:
    payload = json.loads(path.read_text(encoding="utf-8"))

    if isinstance(payload, dict) and isinstance(payload.get("data"), list):
        rows = payload["data"]
    elif isinstance(payload, list):
        rows = payload
    else:
        raise ValueError("Artwork JSON must be a list or an object with a 'data' list.")

    artworks: list[ArtworkImageRecord] = []
    for row in rows:
        if not isinstance(row, dict):
            continue

        try:
            artwork_id = int(row.get("id"))
        except (TypeError, ValueError):
            continue

        images = row.get("images") if isinstance(row.get("images"), list) else []
        primary_image = next(
            (str(image).strip() for image in images if isinstance(image, str) and image.strip()),
            "",
        )

        if not primary_image:
            continue

        artworks.append(
            ArtworkImageRecord(
                artwork_id=artwork_id,
                title=str(row.get("title") or "").strip(),
                image_url=primary_image,
            )
        )

    return artworks


def read_image_bytes(image_url: str) -> bytes:
    if image_url.startswith(("http://", "https://")):
        with urllib.request.urlopen(image_url, timeout=20) as response:
            return response.read()

    return Path(image_url).expanduser().read_bytes()


def load_image_tensor(image_url: str) -> tuple[torch.Tensor, tuple[int, int]]:
    image_bytes = read_image_bytes(image_url)
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    original_size = image.size
    resized = image.resize((RESIZE_TO, RESIZE_TO))
    tensor = torch.ByteTensor(torch.ByteStorage.from_buffer(resized.tobytes()))
    tensor = tensor.view(RESIZE_TO, RESIZE_TO, 3).permute(2, 0, 1).float() / 255.0
    return tensor, original_size


def compute_average_hash(image_tensor: torch.Tensor) -> str:
    grayscale = (
        0.299 * image_tensor[0] + 0.587 * image_tensor[1] + 0.114 * image_tensor[2]
    ).unsqueeze(0).unsqueeze(0)
    pooled = F.interpolate(grayscale, size=(8, 8), mode="bilinear", align_corners=False)
    bits = (pooled[0, 0] >= pooled.mean()).flatten().tolist()
    bit_string = "".join("1" if bit else "0" for bit in bits)
    return f"{int(bit_string, 2):016x}"


def hamming_distance(left_hash: str, right_hash: str) -> int:
    left_bits = bin(int(left_hash, 16))[2:].zfill(64)
    right_bits = bin(int(right_hash, 16))[2:].zfill(64)
    return sum(1 for left, right in zip(left_bits, right_bits) if left != right)


def compute_feature_vector(image_tensor: torch.Tensor) -> tuple[torch.Tensor, dict[str, float]]:
    channels = image_tensor.view(3, -1)
    means = channels.mean(dim=1)
    stds = channels.std(dim=1)

    histogram_bins = []
    for channel_index in range(3):
        histogram = torch.histc(image_tensor[channel_index], bins=8, min=0.0, max=1.0)
        histogram_bins.append(histogram / histogram.sum().clamp_min(1e-6))

    brightness = (0.299 * image_tensor[0] + 0.587 * image_tensor[1] + 0.114 * image_tensor[2]).flatten()
    saturation = (
        image_tensor.max(dim=0).values - image_tensor.min(dim=0).values
    ).flatten()

    grayscale = brightness.view(1, 1, RESIZE_TO, RESIZE_TO)
    sobel_x = torch.tensor([[-1.0, 0.0, 1.0], [-2.0, 0.0, 2.0], [-1.0, 0.0, 1.0]]).view(1, 1, 3, 3)
    sobel_y = torch.tensor([[-1.0, -2.0, -1.0], [0.0, 0.0, 0.0], [1.0, 2.0, 1.0]]).view(1, 1, 3, 3)
    grad_x = F.conv2d(grayscale, sobel_x, padding=1)
    grad_y = F.conv2d(grayscale, sobel_y, padding=1)
    edge_strength = torch.sqrt(grad_x.pow(2) + grad_y.pow(2)).flatten()

    feature_vector = torch.cat(
        [
            means,
            stds,
            torch.cat(histogram_bins),
            torch.tensor(
                [
                    brightness.mean(),
                    brightness.std(),
                    saturation.mean(),
                    saturation.std(),
                    edge_strength.mean(),
                    edge_strength.std(),
                ]
            ),
        ]
    ).float()
    feature_vector = F.normalize(feature_vector, dim=0)

    stats = {
        "red_mean": float(means[0]),
        "green_mean": float(means[1]),
        "blue_mean": float(means[2]),
        "brightness_mean": float(brightness.mean()),
        "brightness_std": float(brightness.std()),
        "saturation_mean": float(saturation.mean()),
        "edge_mean": float(edge_strength.mean()),
    }
    return feature_vector, stats


def infer_color_tag(stats: dict[str, float]) -> str:
    red = stats["red_mean"]
    green = stats["green_mean"]
    blue = stats["blue_mean"]

    if max(red, green, blue) - min(red, green, blue) < 0.04:
        return "neutral"
    if red >= green and red >= blue:
        return "warm"
    if blue >= red and blue >= green:
        return "cool"
    return "earthy"


def build_style_hints(stats: dict[str, float], original_size: tuple[int, int]) -> list[str]:
    width, height = original_size
    hints: list[str] = []

    if stats["brightness_mean"] >= 0.72:
        hints.append("bright")
    elif stats["brightness_mean"] <= 0.32:
        hints.append("moody")

    if stats["saturation_mean"] <= 0.12:
        hints.extend(["minimal", "muted"])
    elif stats["saturation_mean"] >= 0.28:
        hints.append("vibrant")

    if stats["brightness_std"] >= 0.22:
        hints.append("high-contrast")
    else:
        hints.append("soft-contrast")

    if stats["edge_mean"] >= 0.42:
        hints.append("textured")
    elif stats["edge_mean"] <= 0.18:
        hints.append("smooth")

    if width > height * 1.1:
        hints.append("landscape-orientation")
    elif height > width * 1.1:
        hints.append("portrait-orientation")
    else:
        hints.append("square-orientation")

    hints.append(infer_color_tag(stats))
    return list(dict.fromkeys(hints))


def build_suggested_tags(style_hints: list[str]) -> list[str]:
    replacements = {
        "minimal": "minimal",
        "muted": "muted",
        "vibrant": "bold",
        "high-contrast": "contrast",
        "soft-contrast": "soft",
        "textured": "textured",
        "smooth": "clean",
        "warm": "warm-tones",
        "cool": "cool-tones",
        "earthy": "earthy",
        "bright": "bright",
        "moody": "moody",
    }
    tags = [replacements[hint] for hint in style_hints if hint in replacements]
    return list(dict.fromkeys(tags))[:6]


def round_list(values: torch.Tensor, digits: int = 6) -> list[float]:
    return [round(float(value), digits) for value in values.tolist()]


def main() -> None:
    args = parse_args()
    artwork_rows = load_artworks(Path(args.artworks))
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    analyzed: list[dict[str, Any]] = []
    feature_rows: list[torch.Tensor] = []
    failures: list[dict[str, Any]] = []

    for row in artwork_rows:
        try:
            image_tensor, original_size = load_image_tensor(row.image_url)
            feature_vector, stats = compute_feature_vector(image_tensor)
            average_hash = compute_average_hash(image_tensor)
            style_hints = build_style_hints(stats, original_size)
            suggested_tags = build_suggested_tags(style_hints)

            analyzed.append(
                {
                    "artwork_id": row.artwork_id,
                    "title": row.title,
                    "image_url": row.image_url,
                    "original_size": {"width": original_size[0], "height": original_size[1]},
                    "perceptual_hash": average_hash,
                    "style_hints": style_hints,
                    "suggested_tags": suggested_tags,
                    "feature_vector": round_list(feature_vector),
                }
            )
            feature_rows.append(feature_vector)
        except Exception as error:  # noqa: BLE001
            failures.append(
                {
                    "artwork_id": row.artwork_id,
                    "image_url": row.image_url,
                    "error": str(error),
                }
            )

    similar_by_artwork_id: dict[str, list[dict[str, Any]]] = {}
    duplicate_candidates_by_artwork_id: dict[str, list[dict[str, Any]]] = {}

    if feature_rows:
        feature_matrix = torch.stack(feature_rows)
        similarity_matrix = feature_matrix @ feature_matrix.T

        for index, entry in enumerate(analyzed):
            artwork_id = str(entry["artwork_id"])
            similar_matches = []
            duplicate_matches = []

            for compare_index, candidate in enumerate(analyzed):
                if compare_index == index:
                    continue

                score = float(similarity_matrix[index, compare_index])
                hash_distance = hamming_distance(
                    entry["perceptual_hash"], candidate["perceptual_hash"]
                )

                if score >= args.duplicate_threshold or hash_distance <= 6:
                    duplicate_matches.append(
                        {
                            "artwork_id": candidate["artwork_id"],
                            "score": round(score, 4),
                            "hash_distance": hash_distance,
                        }
                    )
                    continue

                if score >= args.similarity_threshold:
                    similar_matches.append(
                        {
                            "artwork_id": candidate["artwork_id"],
                            "score": round(score, 4),
                        }
                    )

            similar_by_artwork_id[artwork_id] = sorted(
                similar_matches,
                key=lambda match: (-match["score"], match["artwork_id"]),
            )[: max(0, args.similar_limit)]
            duplicate_candidates_by_artwork_id[artwork_id] = sorted(
                duplicate_matches,
                key=lambda match: (-match["score"], match["hash_distance"], match["artwork_id"]),
            )

    payload = {
        "version": 1,
        "generated_at": None,
        "generator": "ml/build_image_intelligence.py",
        "framework": "pytorch",
        "artworks": analyzed,
        "similar_by_artwork_id": similar_by_artwork_id,
        "duplicate_candidates_by_artwork_id": duplicate_candidates_by_artwork_id,
        "failures": failures,
    }

    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(
        f"Wrote {len(analyzed)} analyzed artworks to {output_path} "
        f"({len(failures)} failures)."
    )


if __name__ == "__main__":
    main()
