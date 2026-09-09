"""
Thin wrapper around the google-genai SDK's `models.generate_content()` call
using an image-capable Gemini model (response_modalities=["Text", "Image"]),
with retry/backoff for transient errors — the asset manifest makes ~90+
calls in a batch run and a single flaky request shouldn't kill the whole
category.

Verified against the installed google-genai==1.47.0 SDK directly (its own
types.py / models.py), not just documentation — the API surface described in
some newer Gemini docs pages (an `interactions.create()` method) does not
exist in this SDK version, so this wrapper uses the SDK's actual, confirmed
API instead.
"""

from __future__ import annotations

import io
import time

from PIL import Image

# Verified by direct comparison against docs/ASSET_GENERATION_CHECKLIST.md's
# required flat top-down perspective: gemini-2.5-flash-image (and
# gemini-3.1-flash-image) both consistently render buildings in an
# isometric/3D-game style regardless of how explicit the prompt is, even with
# a structural reference image attached. gemini-3-pro-image got the flat
# top-down geometry right on the first real attempt. Costs more per call
# (it's the "premium/highest quality" tier) but is the only one of the four
# available image models that actually follows this project's perspective
# requirement.
DEFAULT_MODEL = "gemini-3-pro-image"

# ImageConfig.aspect_ratio accepts these exact preset strings (confirmed
# against google.genai.types.ImageConfig's docstring) — pick the closest
# preset to each asset's requested "generate at" ratio and let
# downscale_exact() do the exact final-size resize afterward.
_ASPECT_PRESETS = {
    "1:1": 1.0,
    "4:3": 4 / 3,
    "3:4": 3 / 4,
    "16:9": 16 / 9,
    "9:16": 9 / 16,
    "3:2": 3 / 2,
    "2:3": 2 / 3,
    "21:9": 21 / 9,
}


def closest_aspect_ratio(width: int, height: int) -> str:
    target = width / height
    return min(_ASPECT_PRESETS, key=lambda name: abs(_ASPECT_PRESETS[name] - target))


class GeminiImageClient:
    def __init__(self, api_key: str | None = None, model: str = DEFAULT_MODEL):
        # Imported lazily so `--dry-run` (which never touches the network)
        # doesn't require the google-genai package to be installed at all.
        from google import genai

        self._genai = genai
        self._client = genai.Client(api_key=api_key) if api_key else genai.Client()
        self.model = model

    def generate_image(
        self,
        prompt: str,
        gen_size: tuple[int, int],
        reference_images: list[bytes] | None = None,
        max_retries: int = 4,
        retry_delay_s: float = 8.0,
    ) -> Image.Image:
        """Generate one image from a text prompt (optionally alongside
        reference images for style consistency, per the checklist's §2.11
        tip) and return it as a PIL Image. Raises on repeated failure."""
        from google.genai import types

        width, height = gen_size
        aspect_ratio = closest_aspect_ratio(width, height)

        contents: list = []
        if reference_images:
            for ref_bytes in reference_images:
                contents.append(types.Part.from_bytes(data=ref_bytes, mime_type="image/png"))
        contents.append(prompt)

        config = types.GenerateContentConfig(
            response_modalities=["Text", "Image"],
            image_config=types.ImageConfig(aspect_ratio=aspect_ratio),
        )

        last_error: Exception | None = None
        for attempt in range(1, max_retries + 1):
            try:
                response = self._client.models.generate_content(
                    model=self.model,
                    contents=contents,
                    config=config,
                )
                return _extract_image(response)
            except Exception as exc:  # noqa: BLE001 - broad on purpose, retried
                last_error = exc
                if attempt < max_retries:
                    sleep_s = retry_delay_s * attempt
                    print(f"    [retry {attempt}/{max_retries}] {exc} — waiting {sleep_s:.0f}s")
                    time.sleep(sleep_s)

        raise RuntimeError(f"Image generation failed after {max_retries} attempts: {last_error}") from last_error


def _extract_image(response) -> Image.Image:
    """Pull the generated image out of a generate_content() response: walk
    candidates[0].content.parts looking for an inline_data (Blob) part and
    decode it as a PIL Image. Raises with the model's own text reply (if any)
    included, since a refused/blocked prompt often comes back as text-only,
    which is far more useful for debugging than a bare AttributeError."""
    candidates = getattr(response, "candidates", None)
    if not candidates:
        raise RuntimeError(f"No candidates in response: {response!r}")

    text_parts: list[str] = []
    parts = getattr(candidates[0].content, "parts", None) or []
    for part in parts:
        inline_data = getattr(part, "inline_data", None)
        if inline_data and inline_data.data:
            return Image.open(io.BytesIO(inline_data.data))
        if getattr(part, "text", None):
            text_parts.append(part.text)

    reply = " ".join(text_parts) if text_parts else "(no text either)"
    raise RuntimeError(f"Response contained no image part. Model said: {reply}")
