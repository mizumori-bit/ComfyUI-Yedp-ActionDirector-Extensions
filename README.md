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

### FEAT-04: Rokoko Retarget (GLB only)
- New node: **🦴 Yedp Rokoko Retargeter**
- Reads a Rokoko Studio retarget map JSON
- Renames bones in source GLB to match Yedp_Rig.glb
- Output GLB can be loaded directly by Yedp Action Director
- Supports exact match and fuzzy bone name matching

## Installation

```bash
cd /workspace/ComfyUI/custom_nodes
git clone https://github.com/YOUR_USERNAME/ComfyUI-Yedp-ActionDirector-Extensions.git
pip install -r ComfyUI-Yedp-ActionDirector-Extensions/requirements.txt
```

> **Note**: This replaces the original `ComfyUI-Yedp-Action-Director`. Remove or rename it before installing.

## Dependencies

- `pygltflib` (for FEAT-04 Rokoko retargeting)

## Rokoko Retarget JSON Format

Export a retarget map from Rokoko Studio in this format:

```json
{
  "retarget": [
    { "source": "mixamorig:Hips",    "target": "Hips" },
    { "source": "mixamorig:Spine",   "target": "Spine" },
    { "source": "mixamorig:LeftArm", "target": "LeftArm" }
  ]
}
```

## Credits

Based on [ComfyUI-Yedp-Action-Director](https://github.com/yedp123/ComfyUI-Yedp-Action-Director) by yedp123.

## License

MIT (see LICENSE)
