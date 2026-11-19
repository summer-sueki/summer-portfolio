"""Local SD-Turbo image-to-image server for IlluMagic.

Usage:
    .venv/bin/python turbo_server.py            # serves http://localhost:7860

POST /generate  {"image": "<data URL>", "animal": "fox", "strength": 0.6, "seed": 42}
    -> image/png

Photos are processed in memory on this machine and never written to disk.
"""

import base64
import io
import json
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock

import torch
from diffusers import AutoPipelineForImage2Image
from PIL import Image

MODEL_ID = "stabilityai/sd-turbo"
PORT = 7860
SIZE = 512
STEPS = 4  # actual denoising steps = int(STEPS * strength)

ANIMALS = {
    "zebra": "a goofy zebra",
    "bulldog": "a soulful bulldog",
    "hamster": "a cheeky hamster",
    "fox": "a sly red fox",
    "otter": "a delighted otter",
    "owl": "a wide-eyed owl",
}

device = "mps" if torch.backends.mps.is_available() else "cpu"
print(f"Loading {MODEL_ID} on {device}…")
pipe = AutoPipelineForImage2Image.from_pretrained(
    MODEL_ID, torch_dtype=torch.float16 if device == "mps" else torch.float32, variant="fp16"
).to(device)
pipe.set_progress_bar_config(disable=True)
lock = Lock()  # one generation at a time; MPS doesn't like concurrent work


def prompt_for(animal: str) -> str:
    who = ANIMALS.get(animal, "a friendly animal")
    return (
        f"storybook illustration portrait of a person as {who}, anthropomorphic, "
        "same face shape and expression, whimsical children's book art, soft painted texture, "
        "warm lighting, cute, highly detailed fur"
    )


def generate(data_url: str, animal: str, strength: float, seed: int) -> bytes:
    raw = base64.b64decode(data_url.split(",", 1)[-1])
    image = Image.open(io.BytesIO(raw)).convert("RGB").resize((SIZE, SIZE))
    strength = min(0.9, max(0.3, strength))
    with lock:
        out = pipe(
            prompt_for(animal),
            image=image,
            num_inference_steps=STEPS,
            strength=strength,
            guidance_scale=0.0,
            generator=torch.Generator("cpu").manual_seed(seed),
        ).images[0]
    buf = io.BytesIO()
    out.save(buf, format="PNG")
    return buf.getvalue()


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):  # health check
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"ok": True, "model": MODEL_ID, "device": device}).encode())

    def do_POST(self):
        if self.path != "/generate":
            self.send_error(404)
            return
        try:
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            start = time.perf_counter()
            png = generate(body["image"], body.get("animal", ""), float(body.get("strength", 0.6)), int(body.get("seed", 0)))
            print(f"{body.get('animal')}: {time.perf_counter() - start:.2f}s")
        except Exception as err:  # report back to the page instead of hanging
            self.send_response(500)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(err)}).encode())
            return
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "image/png")
        self.send_header("Content-Length", str(len(png)))
        self.end_headers()
        self.wfile.write(png)

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    # Warm-up so the first real request is fast.
    warm = io.BytesIO()
    Image.new("RGB", (SIZE, SIZE), (180, 150, 210)).save(warm, format="PNG")
    generate(base64.b64encode(warm.getvalue()).decode(), "fox", 0.6, 0)
    print(f"IlluMagic turbo server on http://localhost:{PORT}")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
