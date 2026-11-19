"""Generate images with Sana Sprint 0.6B on Apple Silicon (MPS).

Usage:
    .venv/bin/python generate.py "a red fox in fresh snow, golden hour"
    .venv/bin/python generate.py "prompt one" "prompt two" --steps 2 --seed 42 --size 1024

Low-memory flow for 8 GB Macs: the Gemma-2 text encoder (~5 GB) encodes every
prompt first, is freed, and only then are the transformer and VAE moved to MPS.
"""

import argparse
import gc
import re
import time
from pathlib import Path

import torch
from diffusers import SanaSprintPipeline

MODEL_ID = "Efficient-Large-Model/Sana_Sprint_0.6B_1024px_diffusers"
OUT_DIR = Path(__file__).parent / "outputs"


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:50] or "image"


def free_memory():
    gc.collect()
    if torch.backends.mps.is_available():
        torch.mps.empty_cache()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("prompts", nargs="+")
    parser.add_argument("--steps", type=int, default=2, help="1-4; 2 is the recommended default")
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--size", type=int, default=1024, help="square output size in pixels")
    args = parser.parse_args()

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    dtype = torch.bfloat16
    OUT_DIR.mkdir(exist_ok=True)

    t0 = time.time()
    pipe = SanaSprintPipeline.from_pretrained(MODEL_ID, torch_dtype=dtype)

    # Phase 1: encode prompts, then drop the text encoder.
    pipe.text_encoder.to(device)
    encoded = []
    with torch.no_grad():
        for prompt in args.prompts:
            embeds, mask = pipe.encode_prompt(prompt, device=device)
            encoded.append((prompt, embeds, mask))
    pipe.text_encoder = None
    free_memory()

    # Phase 2: denoise and decode.
    pipe.transformer.to(device)
    pipe.vae.to(device)
    print(f"Loaded in {time.time() - t0:.1f}s on {device}")

    for prompt, embeds, mask in encoded:
        seed = args.seed if args.seed is not None else torch.seed() % 2**32
        generator = torch.Generator("cpu").manual_seed(seed)
        t1 = time.time()
        image = pipe(
            prompt_embeds=embeds,
            prompt_attention_mask=mask,
            num_inference_steps=args.steps,
            height=args.size,
            width=args.size,
            generator=generator,
        ).images[0]
        path = OUT_DIR / f"{slug(prompt)}-{seed}.png"
        image.save(path)
        print(f"[{time.time() - t1:.1f}s] {path}")
        free_memory()


if __name__ == "__main__":
    main()
