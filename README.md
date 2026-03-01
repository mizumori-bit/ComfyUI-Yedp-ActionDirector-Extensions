# ComfyUI-Yedp-ActionDirector-Extensions

Camera control, lighting, and Rokoko retargeting extensions for [Yedp Action Director](https://github.com/yedp123/ComfyUI-Yedp-Action-Director).

## Features

### FEAT-01: Camera Numeric Control + Orthographic
- **Perspective / Orthographic** toggle with instant camera switching
- **Focal Length** (mm) → FOV conversion for perspective mode
- **Ortho Scale** for orthographic mode (ideal for 2D sprite generation)
- **Position XYZ** and **Target XYZ** numeric inputs with bidirectional OrbitControls sync
- All values update in real-time as you orbit the camera

### FEAT-02: Camera Presets
- **7 Built-in Presets**: Front, Front 45°, Side, Top-Down, 3/4 RPG, Front Ortho, Side Ortho
- **Save/Load/Delete** custom presets stored as JSON in `ComfyUI/input/yedp_camera_presets/`
- Presets persist across ComfyUI restarts

### FEAT-03: Lighting Control
- **DirectionalLight**: Direction XYZ + Intensity
- **AmbientLight**: Intensity control
- **HemisphereLight**: Intensity control (sky/ground colors)
- Defaults tuned for Normal map generation (dir=1.2, amb=0.4, hemi=0.3)

### FEAT-04: Native Bone Retargeting (JSON Maps) 🦴
- Select a retarget map directly from the Action Director UI dropdown.
- Maps are automatically loaded from `ComfyUI-Yedp-ActionDirector-Extensions/retarget_maps/`.
- ⚠️ **Important Limitation:** This retargeting feature performs **simple string replacement of bone names** (e.g., renaming `chest_fk` to `Spine1`). It does **not** perform IK recalculations, roll angle correction, or rest pose (T-Pose vs A-Pose) alignment.
- 💡 **Best Practice:** For pristine animation results, we strongly recommend using FBX/GLB files exported with a **Mixamo-based bone structure and standard T-Pose**. The built-in semantic normalizer will automatically map Mixamo bones correctly without needing a JSON file. If using non-Mixamo rigs (like Rigify), you will likely experience mangled skeletons due to differing axis orientations and rest poses.

### FEAT-05: 5th "Shaded" Render Pass 🎨
- Adds a `shaded` output pin to the node alongside Pose, Depth, Canny, and Normal passes.
- Renders the model using its original materials combined with the custom lighting setup (FEAT-03), perfect for ControlNet (e.g., recolor) or direct composite reference.

### FEAT-06: Direct Numeric Gizmo Manipulation
- Adds a direct "Gizmo Tools" UI allowing users to move, rotate, and scale characters precisely.
- Includes numerical input fields for Pos XYZ and Rot Y on the character card, which instantly sync with the 3D viewport.

### FEAT-07: Payload Memory Caching (Anti-Crash)
- Replaces standard ComfyUI frontend-to-backend base64 string passing with a robust Python-side dictionary cache (`YEDP_PAYLOAD_CACHE`).
- Prevents the browser from freezing or ComfyUI from crashing when baking long animations that generate hundreds of megabytes of image data.

### FEAT-08: Lossless PNG Output
- Upgrades all render passes from lossy JPEG compression to pristine, lossless PNG format directly in the Three.js extraction loop.
- Significantly improves the accuracy and edge-quality of Depth, Canny, and Normal maps fed into ControlNet.

## Installation

```bash
cd /workspace/ComfyUI/custom_nodes
git clone https://github.com/mizumori-bit/ComfyUI-Yedp-ActionDirector-Extensions.git
```

> **Note**: This replaces the original `ComfyUI-Yedp-Action-Director`. Remove or rename it before installing.

## Rokoko Retarget JSON Format

Export a retarget map from Rokoko Studio, or create a flat JSON dictionary. Drop it into the `retarget_maps/` folder.

**Supported Formats:**
- Flat Dictionary: `{"SourceBone": "TargetBone"}`
- Rokoko Format: `{"bones": {"Key": ["SourceBone", "TargetBone"]}}`

## Credits

Based on [ComfyUI-Yedp-Action-Director](https://github.com/yedp123/ComfyUI-Yedp-Action-Director) by yedp123.

## License

MIT (see LICENSE)
