import os
import torch
import numpy as np
import folder_paths
from server import PromptServer
from aiohttp import web
from PIL import Image
import base64
import io
import json
import hashlib
import uuid
from pathlib import Path

EXTENSION_DIR = os.path.dirname(os.path.realpath(__file__))

# --- CONFIGURATION ---
if "yedp_anims" not in folder_paths.folder_names_and_paths:
    folder_paths.folder_names_and_paths["yedp_anims"] = ([os.path.join(folder_paths.get_input_directory(), "yedp_anims")], {".glb", ".fbx", ".bvh"})

# Camera presets directory
PRESETS_DIR = os.path.join(folder_paths.get_input_directory(), "yedp_camera_presets")
os.makedirs(PRESETS_DIR, exist_ok=True)

# Global Cache for massive payloads
YEDP_PAYLOAD_CACHE = {}

# --- Built-in presets ---
BUILTIN_PRESETS = {
    "Front": {
        "preset_name": "Front", "builtin": True,
        "camera": {"position": {"x": 0.0, "y": 1.0, "z": 4.0}, "rotation": {"x": 0.0, "y": 0.0, "z": 0.0},
                   "focal_length": 50.0, "projection": "perspective", "ortho_scale": 2.0}
    },
    "Front 45°": {
        "preset_name": "Front 45°", "builtin": True,
        "camera": {"position": {"x": 2.8, "y": 1.0, "z": 2.8}, "rotation": {"x": 0.0, "y": 45.0, "z": 0.0},
                   "focal_length": 50.0, "projection": "perspective", "ortho_scale": 2.0}
    },
    "Side": {
        "preset_name": "Side", "builtin": True,
        "camera": {"position": {"x": 4.0, "y": 1.0, "z": 0.0}, "rotation": {"x": 0.0, "y": 90.0, "z": 0.0},
                   "focal_length": 50.0, "projection": "perspective", "ortho_scale": 2.0}
    },
    "Top-Down": {
        "preset_name": "Top-Down", "builtin": True,
        "camera": {"position": {"x": 0.0, "y": 5.0, "z": 0.01}, "rotation": {"x": -90.0, "y": 0.0, "z": 0.0},
                   "focal_length": 50.0, "projection": "perspective", "ortho_scale": 3.0}
    },
    "3/4 RPG": {
        "preset_name": "3/4 RPG", "builtin": True,
        "camera": {"position": {"x": 2.0, "y": 3.0, "z": 2.0}, "rotation": {"x": -35.0, "y": 45.0, "z": 0.0},
                   "focal_length": 35.0, "projection": "perspective", "ortho_scale": 2.5}
    },
    "Front Ortho": {
        "preset_name": "Front Ortho", "builtin": True,
        "camera": {"position": {"x": 0.0, "y": 1.0, "z": 4.0}, "rotation": {"x": 0.0, "y": 0.0, "z": 0.0},
                   "focal_length": 50.0, "projection": "orthographic", "ortho_scale": 1.5}
    },
    "Side Ortho": {
        "preset_name": "Side Ortho", "builtin": True,
        "camera": {"position": {"x": 4.0, "y": 1.0, "z": 0.0}, "rotation": {"x": 0.0, "y": 90.0, "z": 0.0},
                   "focal_length": 50.0, "projection": "orthographic", "ortho_scale": 1.5}
    },
}


class YedpActionDirector:
    """
    ComfyUI-Yedp-Action-Director Extended (Camera Control + Lighting + Presets)
    Based on V9.10 by yedp123
    """

    def __init__(self):
        self.output_dir = folder_paths.get_output_directory()
        self.type = "output"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "width": ("INT", {"default": 512, "min": 64, "max": 4096, "step": 8}),
                "height": ("INT", {"default": 512, "min": 64, "max": 4096, "step": 8}),
                "frame_count": ("INT", {"default": 48, "min": 1, "max": 3000}),
                "fps": ("INT", {"default": 24, "min": 1, "max": 60}),
                "client_data": ("STRING", {"default": "", "multiline": False}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            }
        }

    RETURN_TYPES = ("IMAGE", "IMAGE", "IMAGE", "IMAGE")
    RETURN_NAMES = ("POSE_BATCH", "DEPTH_BATCH", "CANNY_BATCH", "NORMAL_BATCH")
    FUNCTION = "render"
    CATEGORY = "Yedp/MoCap"

    DESCRIPTION = "Controls multiple 3D characters, animations, camera (with numeric control & presets), and lighting in a web-based viewport."

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        client_data = kwargs.get("client_data", "")
        if client_data:
            return hashlib.md5(client_data.encode()).hexdigest()
        return float("NaN")

    def decode_batch(self, b64_list, width, height, debug_name="batch"):
        tensor_list = []

        for i, b64_str in enumerate(b64_list):
            if "," in b64_str:
                b64_str = b64_str.split(",")[1]

            try:
                image_data = base64.b64decode(b64_str)
                image = Image.open(io.BytesIO(image_data)).convert("RGB")

                if image.size != (width, height):
                    image = image.resize((width, height), Image.LANCZOS)

                img_np = np.array(image).astype(np.float32) / 255.0
                tensor_list.append(torch.from_numpy(img_np))
            except Exception as e:
                print(f"[Yedp] Frame {i} error: {e}")
                tensor_list.append(torch.zeros((height, width, 3)))

        if not tensor_list:
            return torch.zeros((1, height, width, 3))

        return torch.stack(tensor_list)

    def render(self, width, height, frame_count, fps,
               client_data=None, unique_id=None):
        # 1. Check if Data Exists
        if not client_data or len(client_data) < 10:
            print("[Yedp] ERROR: No image data received from frontend.")
            red_frame = torch.zeros((1, height, width, 3))
            red_frame[:,:,:,0] = 1.0
            return (red_frame, red_frame, red_frame, red_frame)

        # 2. Check if it's a Memory Cache ID instead of raw JSON
        global YEDP_PAYLOAD_CACHE
        if client_data.startswith("yedp_payload_"):
            if client_data in YEDP_PAYLOAD_CACHE:
                client_data = YEDP_PAYLOAD_CACHE[client_data]
            else:
                print(f"[Yedp] ERROR: Payload ID {client_data} not found in memory cache! Please click BAKE in the node again.")
                red_frame = torch.zeros((1, height, width, 3))
                red_frame[:,:,:,0] = 1.0
                return (red_frame, red_frame, red_frame, red_frame)

        # 3. Parse JSON
        try:
            data = json.loads(client_data)
        except json.JSONDecodeError as e:
            print(f"[Yedp] JSON Decode Error.")
            raise ValueError("Failed to parse JSON from client.")

        # 4. Decode Batches
        pose_batch = self.decode_batch(data.get("pose", []), width, height, "pose")
        depth_batch = self.decode_batch(data.get("depth", []), width, height, "depth")
        canny_batch = self.decode_batch(data.get("canny", []), width, height, "canny")
        normal_batch = self.decode_batch(data.get("normal", []), width, height, "normal")

        print(f"[Yedp] Successfully rendered {len(pose_batch)} frames (4 batches).")
        return (pose_batch, depth_batch, canny_batch, normal_batch)


# --- API ROUTES ---
@PromptServer.instance.routes.get("/yedp/get_animations")
async def get_animations(request):
    files = folder_paths.get_filename_list("yedp_anims")
    if not files:
        files = []
    return web.json_response({"files": files})

@PromptServer.instance.routes.post("/yedp/upload_payload")
async def upload_payload(request):
    """
    Stores the massive base64 JSON payload in python memory to prevent
    ComfyUI from crashing the browser's localStorage.
    """
    raw_text = await request.text()
    payload_id = f"yedp_payload_{uuid.uuid4().hex}"

    global YEDP_PAYLOAD_CACHE
    YEDP_PAYLOAD_CACHE[payload_id] = raw_text

    # Keep cache clean (only retain the last 3 bakes to prevent RAM bloat)
    if len(YEDP_PAYLOAD_CACHE) > 3:
        oldest_key = list(YEDP_PAYLOAD_CACHE.keys())[0]
        del YEDP_PAYLOAD_CACHE[oldest_key]

    return web.json_response({"payload_id": payload_id})


# =============================================================================
# FEAT-02: Camera Presets API
# =============================================================================
@PromptServer.instance.routes.get("/yedp/camera_presets/list")
async def list_presets(request):
    """Returns list of all presets (built-in + user-saved)."""
    presets = list(BUILTIN_PRESETS.keys())
    # Add user presets from disk
    if os.path.isdir(PRESETS_DIR):
        for f in sorted(os.listdir(PRESETS_DIR)):
            if f.endswith(".json"):
                name = f[:-5]
                if name not in BUILTIN_PRESETS:
                    presets.append(name)
    return web.json_response({"presets": presets})

@PromptServer.instance.routes.get("/yedp/camera_presets/load/{name}")
async def load_preset(request):
    """Load a specific preset by name."""
    name = request.match_info["name"]

    # Check built-in first
    if name in BUILTIN_PRESETS:
        return web.json_response(BUILTIN_PRESETS[name])

    # Check user presets
    filepath = os.path.join(PRESETS_DIR, f"{name}.json")
    if os.path.isfile(filepath):
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
        return web.json_response(data)

    return web.json_response({"error": f"Preset '{name}' not found"}, status=404)

@PromptServer.instance.routes.post("/yedp/camera_presets/save")
async def save_preset(request):
    """Save a camera preset to disk."""
    try:
        data = await request.json()
        name = data.get("preset_name", "").strip()
        if not name:
            return web.json_response({"error": "preset_name is required"}, status=400)

        # Don't allow overwriting built-in presets
        if name in BUILTIN_PRESETS:
            return web.json_response({"error": f"Cannot overwrite built-in preset '{name}'"}, status=400)

        # Sanitize filename
        safe_name = "".join(c for c in name if c.isalnum() or c in " _-").strip()
        if not safe_name:
            return web.json_response({"error": "Invalid preset name"}, status=400)

        from datetime import datetime
        data["created_at"] = datetime.now().isoformat()

        filepath = os.path.join(PRESETS_DIR, f"{safe_name}.json")
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        print(f"[Yedp] Camera preset saved: {safe_name}")
        return web.json_response({"status": "saved", "name": safe_name})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

@PromptServer.instance.routes.delete("/yedp/camera_presets/delete/{name}")
async def delete_preset(request):
    """Delete a user-saved preset."""
    name = request.match_info["name"]
    if name in BUILTIN_PRESETS:
        return web.json_response({"error": "Cannot delete built-in presets"}, status=400)

    filepath = os.path.join(PRESETS_DIR, f"{name}.json")
    if os.path.isfile(filepath):
        os.remove(filepath)
        return web.json_response({"status": "deleted", "name": name})
    return web.json_response({"error": f"Preset '{name}' not found"}, status=404)


# =============================================================================
# Retarget Bone Map API
# =============================================================================
RETARGET_DIR = os.path.join(EXTENSION_DIR, "retarget_maps")

@PromptServer.instance.routes.get("/yedp/retarget_maps/list")
async def list_retarget_maps(request):
    """Returns list of all retargeting JSON files."""
    maps = ["None"] # Default option to skip retargeting
    if os.path.isdir(RETARGET_DIR):
        for f in sorted(os.listdir(RETARGET_DIR)):
            if f.endswith(".json"):
                maps.append(f)
    return web.json_response({"maps": maps})

@PromptServer.instance.routes.get("/yedp/retarget_maps/load/{name}")
async def load_retarget_map(request):
    """Load a specific retarget map by filename."""
    name = request.match_info["name"]
    if name == "None":
        return web.json_response({"bones": {}})

    filepath = os.path.join(RETARGET_DIR, name)
    if os.path.isfile(filepath):
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            # Extract Rokoko format `{"bones": {"BoneName": ["Source", "Target"]}}`
            # and flat format `{"Source": "Target"}`
            mapping = {}
            if "bones" in data:
                for k, v in data["bones"].items():
                    if isinstance(v, list) and len(v) >= 2:
                        mapping[v[0]] = v[1]
            else:
                mapping = data
                
            return web.json_response({"bone_map": mapping})
        except Exception as e:
            return web.json_response({"error": str(e)}, status=500)

    return web.json_response({"error": f"Map '{name}' not found"}, status=404)
