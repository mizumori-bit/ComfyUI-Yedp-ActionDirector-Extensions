"""
FEAT-04: Rokoko Retarget Node

Reads a retarget map JSON (Rokoko format) and registers the bone mapping
with the Action Director API. The JS animation loader then uses this mapping
when loading animations, enabling bone name translation.

Supports both GLB and FBX animation files.
"""

import json
import os
from pathlib import Path

import folder_paths

# Try to import for HTTP POST to self
try:
    import urllib.request
except ImportError:
    urllib = None


class YedpRokokoRetargeter:
    """
    Reads a Rokoko retarget map JSON and registers the bone mapping.
    The Action Director's JS will use this mapping when loading animations.

    Supports: GLB, FBX, BVH animation files.
    """

    @classmethod
    def INPUT_TYPES(cls):
        anim_files = []
        try:
            anim_files = folder_paths.get_filename_list("yedp_anims")
        except Exception:
            pass

        return {
            "required": {
                "animation_file": (anim_files if anim_files else ["none"],),
                "retarget_json_path": ("STRING", {
                    "default": "",
                    "multiline": False,
                    "placeholder": "Path to retarget JSON"
                }),
                "frame_start": ("INT", {"default": 0, "min": 0, "max": 99999}),
                "frame_end": ("INT", {"default": -1, "min": -1, "max": 99999}),
                "frame_step": ("INT", {"default": 1, "min": 1, "max": 100}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("retargeted_animation_path",)
    FUNCTION = "retarget"
    CATEGORY = "Yedp/Animation"

    DESCRIPTION = (
        "Reads a Rokoko retarget map JSON and registers bone mappings "
        "for use by Yedp Action Director when loading animations."
    )

    def retarget(self, animation_file, retarget_json_path,
                 frame_start=0, frame_end=-1, frame_step=1):

        # --- 1. Validate animation file ---
        if not animation_file or animation_file == "none":
            raise ValueError("No animation file selected.")

        anim_dir = folder_paths.get_folder_paths("yedp_anims")[0]
        anim_path = os.path.join(anim_dir, animation_file)

        if not os.path.isfile(anim_path):
            raise FileNotFoundError(f"Animation file not found: {anim_path}")

        # --- 2. Load retarget map ---
        # Strip surrounding quotes and whitespace
        retarget_json_path = retarget_json_path.strip().strip('"').strip("'")

        # If it's just a filename (no path separators), look in bundled retarget_maps/
        if retarget_json_path and os.sep not in retarget_json_path and '/' not in retarget_json_path and '\\' not in retarget_json_path:
            bundled_dir = os.path.join(os.path.dirname(__file__), "retarget_maps")
            candidate = os.path.join(bundled_dir, retarget_json_path)
            if os.path.isfile(candidate):
                retarget_json_path = candidate
                print(f"[Yedp] Using bundled retarget map: {candidate}")

        if not retarget_json_path or not os.path.isfile(retarget_json_path):
            # List available bundled maps for the error message
            bundled_dir = os.path.join(os.path.dirname(__file__), "retarget_maps")
            available = []
            if os.path.isdir(bundled_dir):
                available = [f for f in os.listdir(bundled_dir) if f.endswith(".json")]
            raise FileNotFoundError(
                f"Retarget JSON not found: {retarget_json_path}\n"
                f"Available bundled maps: {available}\n"
                "Enter just the filename (e.g. 'BoneConvert_rigify2Yedp.json') or a full Linux path."
            )

        with open(retarget_json_path, "r", encoding="utf-8") as f:
            retarget_data = json.load(f)

        # --- 3. Parse bone map (multiple formats supported) ---
        bone_map = {}

        # Format A: Rokoko custom format {"bones": {"key": ["source", "target"], ...}}
        if "bones" in retarget_data and isinstance(retarget_data["bones"], dict):
            for key, value in retarget_data["bones"].items():
                if isinstance(value, list) and len(value) >= 2:
                    source_name = value[0]  # e.g., "torso"
                    target_name = value[1]  # e.g., "Hips"
                    bone_map[source_name] = target_name

        # Format B: {"retarget": [{"source": "...", "target": "..."}, ...]}
        elif "retarget" in retarget_data:
            for entry in retarget_data["retarget"]:
                src = entry.get("source", "")
                tgt = entry.get("target", "")
                if src and tgt:
                    bone_map[src] = tgt

        # Format C: Direct {"source": "target", ...}
        else:
            bone_map = {str(k): str(v) for k, v in retarget_data.items()
                        if isinstance(v, str)}

        if not bone_map:
            raise ValueError("No valid bone mappings found in retarget JSON.")

        print(f"[Yedp] Retarget map loaded: {len(bone_map)} bone mappings")
        for src, tgt in list(bone_map.items())[:5]:
            print(f"[Yedp]   {src} -> {tgt}")
        if len(bone_map) > 5:
            print(f"[Yedp]   ... and {len(bone_map) - 5} more")

        # --- 4. POST bone map to the Action Director API ---
        try:
            import urllib.request
            payload = json.dumps({"bone_map": bone_map}).encode("utf-8")
            req = urllib.request.Request(
                "http://127.0.0.1:8188/yedp/retarget_bone_map",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                result = json.loads(resp.read())
                print(f"[Yedp] Bone map registered: {result}")
        except Exception as e:
            print(f"[Yedp] WARNING: Could not POST bone map to API: {e}")
            print("[Yedp]   The bone map will not be used for animation retargeting.")

        # Return the animation file path (unchanged - JS loads and applies mapping)
        return (animation_file,)


NODE_CLASS_MAPPINGS = {
    "YedpRokokoRetargeter": YedpRokokoRetargeter,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "YedpRokokoRetargeter": "Yedp Rokoko Retargeter",
}
