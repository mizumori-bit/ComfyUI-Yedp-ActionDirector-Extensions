"""
FEAT-04: Rokoko Retarget JSON Relay Node (GLB only)

Reads a Rokoko Studio retarget map JSON and renames bones in a source GLB
to match Yedp_Rig.glb bone names, enabling animation retargeting through
Yedp Action Director's existing semanticNormalize pipeline.

Dependencies: pygltflib
"""

import json
import os
import copy
from pathlib import Path

try:
    import pygltflib
except ImportError:
    pygltflib = None
    print("[Yedp] WARNING: pygltflib not installed. FEAT-04 (Rokoko Retargeter) disabled.")
    print("[Yedp]   Install with: pip install pygltflib")

import folder_paths


class YedpRokokoRetargeter:
    """
    Reads a Rokoko retarget map JSON and renames bones in a GLB file
    to match the target rig (Yedp_Rig.glb).

    Input:  source GLB + retarget JSON
    Output: retargeted GLB path (STRING) ready for Yedp Action Director
    """

    @classmethod
    def INPUT_TYPES(cls):
        # List available GLB/FBX files in yedp_anims
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
                    "placeholder": "Path to Rokoko retarget JSON"
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
        "Renames bones in a GLB animation file using a Rokoko retarget map JSON. "
        "The output GLB can be loaded directly by Yedp Action Director."
    )

    def retarget(self, animation_file, retarget_json_path,
                 frame_start=0, frame_end=-1, frame_step=1):
        if pygltflib is None:
            raise ImportError(
                "pygltflib is required for Rokoko retargeting. "
                "Install with: pip install pygltflib"
            )

        # --- 1. Resolve animation file path ---
        if not animation_file or animation_file == "none":
            raise ValueError("No animation file selected.")

        anim_dir = folder_paths.get_folder_paths("yedp_anims")[0]
        anim_path = os.path.join(anim_dir, animation_file)

        if not os.path.isfile(anim_path):
            raise FileNotFoundError(f"Animation file not found: {anim_path}")

        if not anim_path.lower().endswith(".glb"):
            raise ValueError(
                f"Only GLB files are supported for retargeting. Got: {animation_file}\n"
                "Convert FBX to GLB in Blender first."
            )

        # --- 2. Load retarget map ---
        if not retarget_json_path or not os.path.isfile(retarget_json_path):
            raise FileNotFoundError(
                f"Retarget JSON not found: {retarget_json_path}\n"
                "Export a retarget map from Rokoko Studio and provide its path."
            )

        with open(retarget_json_path, "r", encoding="utf-8") as f:
            retarget_data = json.load(f)

        # Build bone rename map: source_name -> target_name
        bone_map = {}
        retarget_list = retarget_data.get("retarget", [])
        if not retarget_list:
            # Try alternate format: direct dict mapping
            if isinstance(retarget_data, dict) and "retarget" not in retarget_data:
                bone_map = {str(k): str(v) for k, v in retarget_data.items()}
            else:
                print("[Yedp] WARNING: Retarget JSON has no 'retarget' array. "
                      "Attempting to use as direct key-value mapping.")
                bone_map = {str(k): str(v) for k, v in retarget_data.items()
                            if k != "retarget"}
        else:
            for entry in retarget_list:
                src = entry.get("source", "")
                tgt = entry.get("target", "")
                if src and tgt:
                    bone_map[src] = tgt

        if not bone_map:
            raise ValueError("No valid bone mappings found in retarget JSON.")

        print(f"[Yedp] Retarget map loaded: {len(bone_map)} bone mappings")

        # --- 3. Load and modify GLB ---
        glb = pygltflib.GLTF2().load(anim_path)

        renamed_count = 0
        unmatched = []

        for node in glb.nodes:
            if node.name in bone_map:
                old_name = node.name
                node.name = bone_map[old_name]
                renamed_count += 1
                print(f"[Yedp]   Renamed: {old_name} -> {node.name}")
            elif node.name:
                # Check if any bone map key is a substring (for prefix matching)
                matched = False
                for src, tgt in bone_map.items():
                    if src in node.name or node.name in src:
                        old_name = node.name
                        node.name = tgt
                        renamed_count += 1
                        matched = True
                        print(f"[Yedp]   Renamed (fuzzy): {old_name} -> {node.name}")
                        break
                if not matched:
                    unmatched.append(node.name)

        if unmatched:
            print(f"[Yedp] WARNING: {len(unmatched)} bones not in retarget map "
                  f"(kept original names): {unmatched[:10]}...")

        print(f"[Yedp] Total bones renamed: {renamed_count}")

        # --- 4. Save retargeted GLB ---
        out_dir = os.path.join(anim_dir, "retargeted")
        os.makedirs(out_dir, exist_ok=True)

        stem = Path(animation_file).stem
        out_filename = f"retargeted_{stem}.glb"
        out_path = os.path.join(out_dir, out_filename)

        glb.save(out_path)
        print(f"[Yedp] Retargeted GLB saved: {out_path}")

        # Return relative path that yedp_anims folder_paths can resolve
        relative_path = f"retargeted/{out_filename}"
        return (relative_path,)


# Export for __init__.py
NODE_CLASS_MAPPINGS = {
    "YedpRokokoRetargeter": YedpRokokoRetargeter,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "YedpRokokoRetargeter": "Yedp Rokoko Retargeter",
}
