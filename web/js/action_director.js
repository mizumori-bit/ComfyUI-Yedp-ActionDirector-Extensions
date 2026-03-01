import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

/** * YEDP ACTION DIRECTOR - V9.10 (Full PNG Export)
 * - Added: Support for up to 4 characters in the same scene.
 * - Added: TransformControls for moving and rotating characters individually.
 * - Added: Sidebar UI for independent character animation selection and looping.
 * - Added: Camera Keyframing (Start/End) with linear & ease interpolations.
 * - Updated: Optimized BVH offsets and clone instancing using SkeletonUtils.
 * - Fix (9.1): Resolved resolution gate collapse (blue line) and WebGL baking crash caused by null dimensions.
 * - Fix (9.1): Applied modulo time wrapping to ensure characters correctly loop when global frame count exceeds their animation duration.
 * - Fix (9.2): Eradicated QuotaExceededError and UI stutter by uploading payload to Python memory cache.
 * - Update (9.2): Removed strict character limitation (capped at 16 for WebGL safety).
 * - Update (9.2): Added progress indicator to Bake button.
 * - Update (9.3): Added dynamic Male/Female Mesh Toggle matching 'Geo_Depth_F' vs 'Geo_Depth' conventions.
 * - Update (9.4): Added Scale mode to Gizmo Tools for resizing individual characters.
 * - Fix (9.5): Unrecognized meshes (props) automatically attach to both genders' depth passes for future prop support.
 * - Fix (9.6): Made Mesh naming parser completely immune to GLTF exporter renaming.
 * - Fix (9.7): Implemented Full Ancestry String Parsing to solve Blender's "Object vs Mesh Data" naming conflict. 
 * - Update (9.7): Added tiny Mesh Counter [M:1 | F:1 | Pose:1] to UI for immediate parsing feedback.
 * - Fix (9.8): Added timestamp Cache-Buster to Rig/Animation loaders to prevent browser from loading stale GLB files.
 * - Update (9.8): Added verbose console logging for mesh categorization transparency.
 * - Fix (9.9): Removed destructive position overrides to restore full Root Motion (hips moving through space).
 * - Fix (9.9): Decoupled internal engine time from integer UI slider to fix playback freezing on non-30 FPS values.
 * - Update (9.10): Upgraded all rendering passes (Depth, Canny, Normal) to 100% lossless pure PNG now that payload size limits are removed.
 * - Fix (Camera): Added OrbitControls target to keyframes to fix panning and zooming translation issues.
 */

const loadThreeJS = async () => {
    if (window._YEDP_THREE_CACHE) return window._YEDP_THREE_CACHE;

    return window._YEDP_THREE_CACHE = new Promise(async (resolve, reject) => {
        const baseUrl = new URL(".", import.meta.url).href;
        try {
            console.log("[Yedp] Initializing Engine V9.10...");
            const THREE = await import("https://esm.sh/three@0.160.0");
            const { OrbitControls } = await import("https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js?deps=three@0.160.0");
            const { TransformControls } = await import("https://esm.sh/three@0.160.0/examples/jsm/controls/TransformControls.js?deps=three@0.160.0");
            const { GLTFLoader } = await import("https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader.js?deps=three@0.160.0");
            await import("https://esm.sh/fflate@0.8.0");
            const { FBXLoader } = await import("https://esm.sh/three@0.160.0/examples/jsm/loaders/FBXLoader.js?deps=three@0.160.0");
            const { BVHLoader } = await import("https://esm.sh/three@0.160.0/examples/jsm/loaders/BVHLoader.js?deps=three@0.160.0");
            const { clone } = await import("https://esm.sh/three@0.160.0/examples/jsm/utils/SkeletonUtils.js?deps=three@0.160.0");

            resolve({ THREE, OrbitControls, TransformControls, GLTFLoader, FBXLoader, BVHLoader, SkeletonUtils: { clone } });
        } catch (e) {
            console.error("[Yedp] Critical Engine Load Failure:", e);
            reject(e);
        }
    });
};

// --- UNIVERSAL BONE MAPPING DICTIONARY ---
const { BONE_MAP, BONE_KEYS_SORTED } = (() => {
    const map = {};
    const synonyms = {
        "hips": ["hips", "pelvis", "root", "cg", "center"],
        "spine": ["spine", "spine0", "spine00", "abdomen", "waist", "lowerback"],
        "spine1": ["spine1", "spine01", "spine001", "chest", "chest1", "torso1", "middleback"],
        "spine2": ["spine2", "spine02", "spine002", "upperchest", "chest2", "torso2", "upperback"],
        "spine3": ["spine3", "spine03", "spine003", "chest3", "torso3"],
        "neck": ["neck", "neck0", "neck00", "cervical"],
        "head": ["head"],
        "leftshoulder": ["leftshoulder", "lshoulder", "shoulderl", "lclavicle", "claviclel", "leftcollar", "lcollar", "collarl"],
        "leftarm": ["leftarm", "larm", "arml", "leftuparm", "luparm", "uparml", "leftupperarm", "lupperarm", "upperarml", "lshldr", "leftbicep"],
        "leftforearm": ["leftforearm", "lforearm", "forearml", "leftelbow", "lelbow", "elbowl", "leftlowerarm", "llowerarm", "lowerarml"],
        "lefthand": ["lefthand", "lhand", "handl", "leftwrist", "lwrist", "wristl"],
        "rightshoulder": ["rightshoulder", "rshoulder", "shoulderr", "rclavicle", "clavicler", "rightcollar", "rcollar", "collarr"],
        "rightarm": ["rightarm", "rarm", "armr", "rightuparm", "ruparm", "uparmr", "rightupperarm", "rupperarm", "upperarmr", "rshldr", "rightbicep"],
        "rightforearm": ["rightforearm", "rforearm", "forearmr", "rightelbow", "relbow", "elbowr", "rightlowerarm", "rlowerarm", "lowerarmr"],
        "righthand": ["righthand", "rhand", "handr", "rightwrist", "rwrist", "wristr"],
        "leftupleg": ["leftupleg", "lupleg", "uplegl", "leftthigh", "lthigh", "thighl", "leftupperleg", "lupperleg", "upperlegl", "lefthip", "lhip", "hip_l"],
        "leftleg": ["leftleg", "lleg", "legl", "leftcalf", "lcalf", "calfl", "leftknee", "lknee", "kneel", "leftlowerleg", "llowerleg", "lowerlegl", "lshin", "shinl"],
        "leftfoot": ["leftfoot", "lfoot", "footl", "leftankle", "lankle", "anklel"],
        "lefttoebase": ["lefttoebase", "ltoebase", "toebasel", "lefttoe", "ltoe", "toel", "lefttoes", "ltoes", "toesl", "leftfootball", "lfootball", "footballl"],
        "rightupleg": ["rightupleg", "rupleg", "uplegr", "rightthigh", "rthigh", "thighr", "rightupperleg", "rupperleg", "upperlegr", "righthip", "rhip", "hip_r"],
        "rightleg": ["rightleg", "rleg", "legr", "rightcalf", "rcalf", "calfr", "rightknee", "rknee", "kneer", "rightlowerleg", "rlowerleg", "lowerlegr", "rshin", "shinr"],
        "rightfoot": ["rightfoot", "rfoot", "footr", "rightankle", "rankle", "ankler"],
        "righttoebase": ["righttoebase", "rtoebase", "toebaser", "righttoe", "rtoe", "toer", "righttoes", "rtoes", "toesr", "rightfootball", "rfootball", "footballr"]
    };

    for (const [canonical, synList] of Object.entries(synonyms)) {
        map[canonical] = canonical;
        for (const syn of synList) map[syn] = canonical;
    }

    const fingers = ["thumb", "index", "middle", "ring", "pinky"];
    const sides = [{ canon: "lefthand", shorts: ["l", "left"] }, { canon: "righthand", shorts: ["r", "right"] }];

    sides.forEach(side => {
        fingers.forEach(finger => {
            for (let i = 1; i <= 4; i++) {
                const canonical = `${side.canon}${finger}${i}`;
                map[canonical] = canonical;
                side.shorts.forEach(s => {
                    map[`${s}${finger}${i}`] = canonical;
                    map[`${finger}${i}${s}`] = canonical;
                    map[`${s}${finger}0${i}`] = canonical;
                    if (finger === "pinky") {
                        map[`${s}little${i}`] = canonical;
                        map[`little${i}${s}`] = canonical;
                        map[`${s}pinkie${i}`] = canonical;
                    }
                });
            }
        });
    });
    return { BONE_MAP: map, BONE_KEYS_SORTED: Object.keys(map).sort((a, b) => b.length - a.length) };
})();

const semanticNormalize = (name) => {
    if (!name) return "";
    let clean = name.split(/[:/|]/).pop();
    const lower = clean.toLowerCase();

    if (lower === "l_foot" || lower === "left_foot") return BONE_MAP["lefttoebase"];
    if (lower === "r_foot" || lower === "right_foot") return BONE_MAP["righttoebase"];
    if (lower === "l_ankle" || lower === "left_ankle") return BONE_MAP["leftfoot"];
    if (lower === "r_ankle" || lower === "right_ankle") return BONE_MAP["rightfoot"];
    if (lower === "l_hip" || lower === "left_hip") return BONE_MAP["leftupleg"];
    if (lower === "r_hip" || lower === "right_hip") return BONE_MAP["rightupleg"];
    if (lower === "l_collar" || lower === "left_collar") return BONE_MAP["leftshoulder"];
    if (lower === "r_collar" || lower === "right_collar") return BONE_MAP["rightshoulder"];
    if (lower === "l_shoulder" || lower === "left_shoulder") return BONE_MAP["leftarm"];
    if (lower === "r_shoulder" || lower === "right_shoulder") return BONE_MAP["rightarm"];

    clean = clean.replace(/^(b_|j_bip_|bip_|cc_base_|def_|org_|mch_|mixamorig\d*_?|mixamo_?)/i, "")
        .replace(/(ik|fk|nub|end|twist\d*)$/i, "")
        .replace(/[\s\-_.[\]]+/g, "")
        .toLowerCase();

    if (BONE_MAP[clean]) return BONE_MAP[clean];
    for (const key of BONE_KEYS_SORTED) {
        if (clean.endsWith(key)) return BONE_MAP[key];
    }
    return clean;
};

// Extracted Character Class
class CharacterInstance {
    constructor(id, baseRig, THREE) {
        this.id = id;
        this.scene = window._YEDP_SKEL_UTILS.clone(baseRig);
        this.mixer = new THREE.AnimationMixer(this.scene);
        this.action = null;
        this.duration = 0; // in seconds
        this.loop = true;
        this.gender = 'M'; // Default
        this.hasFemaleMesh = false; // Track if a female mesh was successfully parsed

        this.poseMeshes = [];
        this.depthMeshesM = [];
        this.depthMeshesF = [];

        this.skeletonHelper = new THREE.SkeletonHelper(this.scene);
        this.skeletonHelper.visible = true;
        this.animFile = "none";

        // Spread them out slightly upon spawn
        this.scene.position.set((id - 1) * 1.0, 0, 0);

        this.scene.traverse((child) => {
            if (child.isMesh) {
                child.visible = true;
                child.frustumCulled = false;

                // V9.7 FIX: Ancestry String Builder
                // This solves Blender's 'Object vs Mesh Data' naming conflict 
                // by flattening the entire parent chain into a single string.
                let fullPath = "";
                let curr = child;
                while (curr && curr !== this.scene && curr !== null) {
                    if (curr.name) fullPath += curr.name.toLowerCase() + "|";
                    curr = curr.parent;
                }

                // Strip spaces and underscores, leaving pipes for node boundaries
                const n = fullPath.replace(/[\s_]/g, '');
                let category = "";

                if (n.includes("openpose") || n.includes("pose")) {
                    this.poseMeshes.push(child);
                    category = "Pose";
                } else if (n.includes("depthf") || n.includes("female") || n.includes("woman") || n.includes("|f|") || n.endsWith("f|")) {
                    this.hasFemaleMesh = true;
                    this.depthMeshesF.push(child);
                    child.visible = false;
                    category = "Female Depth";
                } else if (n.includes("depth") || n.includes("male") || n.includes("man")) {
                    this.depthMeshesM.push(child);
                    child.visible = false;
                    category = "Male Depth";
                } else {
                    // Prop Fallback: Any unclassified mesh (like a sword/hat) gets added to BOTH genders automatically
                    this.depthMeshesM.push(child);
                    this.depthMeshesF.push(child);
                    child.visible = false;
                    category = "Prop (Fallback)";
                }

                // Verbose logging for transparent debugging of the exporter output
                if (this.id === 1) {
                    console.log(`[Yedp] Parsed Mesh: "${child.name}" -> categorized as [${category}]`);
                }
            }
        });
    }

    get activeDepthMeshes() {
        return (this.gender === 'F' && this.hasFemaleMesh) ? this.depthMeshesF : this.depthMeshesM;
    }

    get inactiveDepthMeshes() {
        return (this.gender === 'F' && this.hasFemaleMesh) ? this.depthMeshesM : this.depthMeshesF;
    }

    destroy(scene) {
        scene.remove(this.scene);
        scene.remove(this.skeletonHelper);
        this.mixer.stopAllAction();
    }
}

class YedpViewport {
    constructor(node, container) {
        this.node = node;
        this.container = container;
        this.baseUrl = new URL(".", import.meta.url).href;

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.transformControls = null;
        this.clock = null;

        this.baseRig = null;
        this.characters = []; // Array of CharacterInstance
        this.activeCharId = null;
        this.charCounter = 0;

        this.gridHelper = null;
        this.axesHelper = null;
        this.semanticMap = new Map();

        // Camera Keys
        this.camKeys = { start: null, end: null, ease: 'linear' };

        // FEAT-01: Projection state
        this.projectionMode = 'perspective'; // 'perspective' | 'orthographic'
        this.focalLength = 50.0;
        this.orthoScale = 2.0;
        this.orthoCamera = null; // will hold OrthographicCamera when needed
        this.perspCamera = null; // will hold PerspectiveCamera

        // FEAT-03: Lighting references
        this.dirLight = null;
        this.ambLight = null;
        this.hemiLight = null;

        // Materials
        this.depthMat = null;
        this.cannyMat = null;
        this.normalMat = null;
        this.originalMaterials = new Map();

        // Control States
        this.isDepthMode = false;
        this.userNear = 0.1;
        this.userFar = 10.0;
        this.defaultNear = 0.1;
        this.defaultFar = 100.0;

        this.isPlaying = false;
        this.isBaking = false;

        // V9.9 FIX
        this.globalTime = 0;

        this.renderWidth = 512;
        this.renderHeight = 512;
        this.availableAnimations = ["none"];

        // UI references
        this.uiSidebar = null;
        this.uiCharList = null;
        this._camInputs = {}; // FEAT-01: numeric input refs
        this._suppressOrbitSync = false; // prevent feedback loops

        this.init();
    }

    async init() {
        try {
            const libs = await loadThreeJS();
            this.THREE = libs.THREE;
            this.OrbitControls = libs.OrbitControls;
            this.TransformControls = libs.TransformControls;
            this.GLTFLoaderClass = libs.GLTFLoader;
            this.FBXLoader = libs.FBXLoader;
            this.BVHLoader = libs.BVHLoader;
            window._YEDP_SKEL_UTILS = libs.SkeletonUtils;

            this.depthMat = new this.THREE.MeshDepthMaterial({ depthPacking: this.THREE.BasicDepthPacking, skinning: true });
            this.cannyMat = new this.THREE.MeshMatcapMaterial({ matcap: this.createRimTexture(), skinning: true });
            this.normalMat = new this.THREE.MeshNormalMaterial({ skinning: true });

            // --- LAYOUT ---
            this.container.innerHTML = "";
            Object.assign(this.container.style, {
                display: "flex", flexDirection: "row", background: "#111",
                width: "100%", height: "100%", overflow: "hidden",
                border: "1px solid #333", borderRadius: "4px"
            });

            // MAIN VIEW AREA
            const mainCol = document.createElement("div");
            Object.assign(mainCol.style, { display: "flex", flexDirection: "column", flex: "1", minWidth: 0, minHeight: 0, overflow: "hidden" });
            this.container.appendChild(mainCol);

            // SIDEBAR
            this.uiSidebar = document.createElement("div");
            Object.assign(this.uiSidebar.style, {
                width: "240px", flex: "0 0 240px", background: "#1a1a1a", borderLeft: "1px solid #333",
                display: "flex", flexDirection: "column", overflowY: "auto", padding: "8px", boxSizing: "border-box",
                gap: "10px", fontSize: "11px", color: "#ccc"
            });
            this.container.appendChild(this.uiSidebar);

            // INSIDE MAIN COL: Header, Viewport, Timeline
            const headerDiv = document.createElement("div");
            Object.assign(headerDiv.style, {
                height: "36px", flex: "0 0 36px", background: "#222", borderBottom: "1px solid #333",
                display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px"
            });
            mainCol.appendChild(headerDiv);

            const viewportDiv = document.createElement("div");
            viewportDiv.className = "yedp-vp-area";
            Object.assign(viewportDiv.style, { flex: "1 1 0", position: "relative", overflow: "hidden", background: "#000" });
            mainCol.appendChild(viewportDiv);

            const timelineDiv = document.createElement("div");
            Object.assign(timelineDiv.style, {
                height: "30px", flex: "0 0 30px", background: "#1a1a1a", borderTop: "1px solid #333",
                display: "flex", alignItems: "center", padding: "0 8px", gap: "8px"
            });
            mainCol.appendChild(timelineDiv);

            // --- 3D ENGINE SETUP ---
            this.clock = new this.THREE.Clock();
            this.scene = new this.THREE.Scene();
            this.scene.background = new this.THREE.Color(0x1a1a1a);

            // FEAT-03: Controllable lighting
            this.ambLight = new this.THREE.AmbientLight(0xffffff, 0.4);
            this.scene.add(this.ambLight);
            this.dirLight = new this.THREE.DirectionalLight(0xffffff, 1.2);
            this.dirLight.position.set(1.0, 2.0, 1.0);
            this.scene.add(this.dirLight);
            this.hemiLight = new this.THREE.HemisphereLight(0x87CEEB, 0x8B4513, 0.3);
            this.scene.add(this.hemiLight);

            this.gridHelper = new this.THREE.GridHelper(10, 10, 0x444444, 0x222222);
            this.scene.add(this.gridHelper);
            this.axesHelper = new this.THREE.AxesHelper(1);
            this.scene.add(this.axesHelper);

            // FEAT-01: Both camera types ready
            const fov = 2 * Math.atan(24 / (2 * this.focalLength)) * (180 / Math.PI);
            this.perspCamera = new this.THREE.PerspectiveCamera(fov, 1, 0.01, 2000);
            this.perspCamera.position.set(0, 1.5, 3.0);
            this.orthoCamera = new this.THREE.OrthographicCamera(-2, 2, 2, -2, 0.01, 1000);
            this.orthoCamera.position.set(0, 1.5, 3.0);
            this.camera = this.perspCamera;

            this.renderer = new this.THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
            if (this.renderer.outputColorSpace) this.renderer.outputColorSpace = this.THREE.SRGBColorSpace;
            else this.renderer.outputEncoding = this.THREE.sRGBEncoding;

            viewportDiv.appendChild(this.renderer.domElement);
            Object.assign(this.renderer.domElement.style, { width: "100%", height: "100%", display: "block" });

            this.gate = document.createElement("div");
            this.gate.className = "yedp-resolution-gate";
            Object.assign(this.gate.style, {
                position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
                border: "2px solid #00d2ff", boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.65)", pointerEvents: "none", zIndex: "10",
                boxSizing: "content-box"
            });
            viewportDiv.appendChild(this.gate);

            // Controls
            this.controls = new this.OrbitControls(this.camera, this.renderer.domElement);
            this.controls.target.set(0, 1, 0);
            this.controls.enableDamping = true;

            // FEAT-01: Bidirectional sync — update numeric inputs when user orbits
            this.controls.addEventListener('change', () => {
                if (!this._suppressOrbitSync) this.syncCameraToInputs();
            });

            this.transformControls = new this.TransformControls(this.camera, this.renderer.domElement);
            this.transformControls.addEventListener('dragging-changed', (event) => {
                this.controls.enabled = !event.value;
            });
            this.scene.add(this.transformControls);

            this.setupHeader(headerDiv);
            this.setupTimeline(timelineDiv);
            this.buildSidebar();

            await this.fetchAnimations();
            await this.loadBaseRig();

            this.hookNodeWidgets();

            const resizeObserver = new ResizeObserver(() => this.onResize(viewportDiv));
            resizeObserver.observe(viewportDiv);

            // Start loop
            this.animate();

        } catch (e) {
            this.container.innerHTML = `<div style="color:red; padding:20px;">Init Error: ${e.message}</div>`;
        }
    }

    createRimTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, 256, 256);
        const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
        grad.addColorStop(0.0, '#000000'); grad.addColorStop(0.75, '#000000');
        grad.addColorStop(0.85, '#666666'); grad.addColorStop(1.0, '#ffffff');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(128, 128, 128, 0, Math.PI * 2); ctx.fill();
        const tex = new this.THREE.CanvasTexture(canvas);
        tex.colorSpace = this.THREE.SRGBColorSpace;
        return tex;
    }

    // --- UI SETUP ---
    setupHeader(div) {
        div.innerHTML = `
            <div style="display:flex; align-items:center; gap:6px;">
                <select id="sel-viewmode" style="background:#111; color:#fff; border:1px solid #444; font-size:10px; padding:2px; height:18px;">
                    <option value="pose">View: Pose</option>
                    <option value="mesh">View: Mesh (Shaded)</option>
                    <option value="depth">View: Depth</option>
                </select>
                <div id="depth-ctrls" style="display:flex; align-items:center; gap:2px; opacity:0.5; transition:opacity 0.2s;">
                    <span style="color:#666; font-size:10px;">N:</span>
                    <input id="inp-near" type="number" step="0.1" value="0.1" style="width:36px; background:#333; color:#fff; border:1px solid #444; font-size:10px; padding:1px;">
                    <span style="color:#666; font-size:10px;">F:</span>
                    <input id="inp-far" type="number" step="0.5" value="10.0" style="width:36px; background:#333; color:#fff; border:1px solid #444; font-size:10px; padding:1px;">
                </div>
                <label style="color:#666; font-size:11px; cursor:pointer;"><input type="checkbox" id="chk-skel" checked> Skel</label>
            </div>
            <div style="display:flex; gap:4px;">
                <span id="lbl-res" style="color:#00d2ff; font-family:monospace; font-size:10px; margin-right:5px; align-self:center;">512x512</span>
                <button id="btn-bake" style="border:1px solid #ff0055; color:#ff0055; background:transparent; padding:0px 6px; font-size:10px; cursor:pointer; border-radius:3px;">BAKE V9.10</button>
            </div>
        `;

        div.querySelector("#inp-near").onchange = (e) => { this.userNear = parseFloat(e.target.value); if (this.isDepthMode) this.updateCameraBounds(); };
        div.querySelector("#inp-far").onchange = (e) => { this.userFar = parseFloat(e.target.value); if (this.isDepthMode) this.updateCameraBounds(); };
        div.querySelector("#sel-viewmode").onchange = (e) => {
            this.setViewMode(e.target.value);
        };
        div.querySelector("#chk-skel").onchange = (e) => {
            this.characters.forEach(c => { if (c.skeletonHelper) c.skeletonHelper.visible = e.target.checked; });
        };
        div.querySelector("#btn-bake").onclick = () => this.performBatchRender();
    }

    setupTimeline(div) {
        div.innerHTML = `
            <div style="display:flex; width:100%; align-items:center; gap:5px;">
                <button id="btn-play" style="background:none;border:none;color:#fff;cursor:pointer;width:20px;">▶</button>
                <input type="range" id="t-slider" min="0" max="100" value="0" step="1" style="flex:1;cursor:pointer;">
                <span id="t-time" style="font-family:monospace;font-size:10px;color:#888;min-width:70px;text-align:right;">0 / 0</span>
            </div>`;

        const btn = div.querySelector("#btn-play");
        const slider = div.querySelector("#t-slider");
        const lbl = div.querySelector("#t-time");

        btn.onclick = () => { this.isPlaying = !this.isPlaying; btn.innerText = this.isPlaying ? "⏸" : "▶"; };
        slider.onmousedown = () => { this.isDraggingSlider = true; this.isPlaying = false; btn.innerText = "▶"; };
        slider.onmouseup = () => { this.isDraggingSlider = false; };

        slider.oninput = (e) => {
            const frame = parseInt(e.target.value);
            const totalFrames = this.getWidgetValue("frame_count", 48);
            const fps = this.getWidgetValue("fps", 24);

            // V9.9 FIX: Set the exact float time from the scrubber
            this.globalTime = frame / fps;

            this.characters.forEach(c => {
                if (c.action && c.duration > 0) {
                    c.action.time = c.loop ? (this.globalTime % c.duration) : Math.min(this.globalTime, c.duration);
                    c.mixer.update(0);
                }
            });
            lbl.innerText = `${frame} / ${totalFrames}`;

            // Preview camera if scrubbing
            this.applyCameraKeyframes(frame / Math.max(1, totalFrames - 1));
        };
    }

    buildSidebar() {
        const createBtn = (text, color = "#444", hover = "#555") => {
            const b = document.createElement("button");
            b.innerText = text;
            Object.assign(b.style, { background: color, color: "#fff", border: "1px solid #555", borderRadius: "3px", cursor: "pointer", padding: "4px", fontSize: "10px", flex: "1" });
            b.onmouseover = () => b.style.background = hover;
            b.onmouseout = () => b.style.background = color;
            return b;
        };
        const numInput = (val, step = "0.1", w = "48px") => {
            const inp = document.createElement("input");
            inp.type = "number"; inp.step = step; inp.value = val;
            Object.assign(inp.style, { width: w, background: "#111", color: "#fff", border: "1px solid #444", fontSize: "10px", padding: "1px 2px", borderRadius: "2px" });
            return inp;
        };
        const labelSpan = (txt) => { const s = document.createElement("span"); s.innerText = txt; s.style.color = "#888"; s.style.fontSize = "9px"; s.style.minWidth = "12px"; return s; };
        const makeRow = (...els) => { const r = document.createElement("div"); r.style.display = "flex"; r.style.gap = "3px"; r.style.alignItems = "center"; r.style.marginBottom = "3px"; els.forEach(e => r.appendChild(e)); return r; };
        const panelTitle = (text) => { const d = document.createElement("div"); d.style.marginBottom = "4px"; d.style.fontWeight = "bold"; d.style.color = "#aaa"; d.innerText = text; return d; };
        const makePanel = () => { const p = document.createElement("div"); p.style.background = "#222"; p.style.padding = "6px"; p.style.borderRadius = "4px"; return p; };

        // ==================== FEAT-01: CAMERA CONTROL ====================
        const camCtrlPanel = makePanel();
        camCtrlPanel.appendChild(panelTitle("📷 Camera Control"));

        // Projection toggle
        const btnPersp = createBtn("Perspective", "#335", "#447");
        const btnOrtho = createBtn("Orthographic", "#444", "#555");
        btnPersp.onclick = () => this.switchProjection("perspective");
        btnOrtho.onclick = () => this.switchProjection("orthographic");
        this._camInputs.btnPersp = btnPersp;
        this._camInputs.btnOrtho = btnOrtho;
        camCtrlPanel.appendChild(makeRow(btnPersp, btnOrtho));

        // FOV / Ortho Scale
        const inpFocal = numInput(50, "1", "44px");
        const inpOrthoS = numInput(2.0, "0.1", "44px");
        inpFocal.onchange = () => { this.focalLength = parseFloat(inpFocal.value); this.applyFocalLength(); };
        inpOrthoS.onchange = () => { this.orthoScale = parseFloat(inpOrthoS.value); this.applyOrthoScale(); };
        this._camInputs.focal = inpFocal;
        this._camInputs.orthoScale = inpOrthoS;
        camCtrlPanel.appendChild(makeRow(labelSpan("FL"), inpFocal, labelSpan("OrtS"), inpOrthoS));

        // Position X Y Z
        const inpPX = numInput(0, "0.1", "44px"), inpPY = numInput(1.5, "0.1", "44px"), inpPZ = numInput(3, "0.1", "44px");
        const applyPos = () => { this._suppressOrbitSync = true; this.camera.position.set(parseFloat(inpPX.value), parseFloat(inpPY.value), parseFloat(inpPZ.value)); this.controls.update(); this._suppressOrbitSync = false; };
        inpPX.onchange = inpPY.onchange = inpPZ.onchange = applyPos;
        this._camInputs.px = inpPX; this._camInputs.py = inpPY; this._camInputs.pz = inpPZ;
        camCtrlPanel.appendChild(makeRow(labelSpan("Pos"), inpPX, inpPY, inpPZ));

        // Target X Y Z
        const inpTX = numInput(0, "0.1", "44px"), inpTY = numInput(1, "0.1", "44px"), inpTZ = numInput(0, "0.1", "44px");
        const applyTarget = () => { this._suppressOrbitSync = true; this.controls.target.set(parseFloat(inpTX.value), parseFloat(inpTY.value), parseFloat(inpTZ.value)); this.controls.update(); this._suppressOrbitSync = false; };
        inpTX.onchange = inpTY.onchange = inpTZ.onchange = applyTarget;
        this._camInputs.tx = inpTX; this._camInputs.ty = inpTY; this._camInputs.tz = inpTZ;
        camCtrlPanel.appendChild(makeRow(labelSpan("Tgt"), inpTX, inpTY, inpTZ));

        this.uiSidebar.appendChild(camCtrlPanel);

        // ==================== FEAT-02: CAMERA PRESETS ====================
        const presetPanel = makePanel();
        presetPanel.appendChild(panelTitle("🎯 Camera Presets"));

        const selPreset = document.createElement("select");
        Object.assign(selPreset.style, { width: "100%", background: "#111", color: "#fff", border: "1px solid #444", borderRadius: "3px", fontSize: "10px", padding: "2px", marginBottom: "4px" });
        this._presetSelect = selPreset;

        const btnLoadPreset = createBtn("Load", "#335", "#447");
        btnLoadPreset.onclick = () => this.loadPreset(selPreset.value);
        const btnSavePreset = createBtn("Save As...", "#253", "#374");
        btnSavePreset.onclick = () => this.savePresetPrompt();
        const btnDelPreset = createBtn("Del", "#522", "#733");
        btnDelPreset.onclick = () => this.deletePreset(selPreset.value);

        presetPanel.appendChild(selPreset);
        presetPanel.appendChild(makeRow(btnLoadPreset, btnSavePreset, btnDelPreset));
        this.uiSidebar.appendChild(presetPanel);
        this.refreshPresetList();

        // ==================== FEAT-03: LIGHTING CONTROL ====================
        const lightPanel = makePanel();
        lightPanel.appendChild(panelTitle("💡 Lighting"));

        // Directional light
        const inpDX = numInput(1, "0.1", "36px"), inpDY = numInput(2, "0.1", "36px"), inpDZ = numInput(1, "0.1", "36px");
        const inpDI = numInput(1.2, "0.1", "36px");
        const applyDir = () => { this.dirLight.position.set(parseFloat(inpDX.value), parseFloat(inpDY.value), parseFloat(inpDZ.value)); this.dirLight.intensity = parseFloat(inpDI.value); };
        inpDX.onchange = inpDY.onchange = inpDZ.onchange = inpDI.onchange = applyDir;
        lightPanel.appendChild(makeRow(labelSpan("Dir"), inpDX, inpDY, inpDZ, inpDI));

        // Ambient light
        const inpAI = numInput(0.4, "0.1", "40px");
        inpAI.onchange = () => { this.ambLight.intensity = parseFloat(inpAI.value); };
        lightPanel.appendChild(makeRow(labelSpan("Amb Int"), inpAI));

        // Hemisphere light
        const inpHI = numInput(0.3, "0.1", "40px");
        inpHI.onchange = () => { this.hemiLight.intensity = parseFloat(inpHI.value); };
        lightPanel.appendChild(makeRow(labelSpan("Hemi Int"), inpHI));

        this.uiSidebar.appendChild(lightPanel);

        // ==================== NEW: NATIVE RETARGETING ====================
        const retargetPanel = makePanel();
        retargetPanel.appendChild(panelTitle("🦴 Retarget Map"));
        this._retargetSelect = document.createElement("select");
        Object.assign(this._retargetSelect.style, { width: "100%", background: "#111", color: "#fff", border: "1px solid #444", borderRadius: "3px", fontSize: "10px", padding: "2px", marginBottom: "4px" });
        retargetPanel.appendChild(this._retargetSelect);
        this.refreshRetargetMaps();
        this.uiSidebar.appendChild(retargetPanel);

        // --- GIZMO TOOLS ---
        const gizmoPanel = makePanel();
        gizmoPanel.appendChild(panelTitle("Gizmo Tools"));
        const gizmoRow = document.createElement("div");
        gizmoRow.style.display = "flex"; gizmoRow.style.gap = "4px";
        const btnMove = createBtn("Move"), btnRot = createBtn("Rotate"), btnScale = createBtn("Scale");
        const btnDeselect = createBtn("Deselect", "#522", "#733");
        btnMove.onclick = () => this.transformControls.setMode("translate");
        btnRot.onclick = () => this.transformControls.setMode("rotate");
        btnScale.onclick = () => this.transformControls.setMode("scale");
        btnDeselect.onclick = () => { this.transformControls.detach(); this.activeCharId = null; this.refreshSidebarHighlights(); };
        gizmoRow.append(btnMove, btnRot, btnScale, btnDeselect);
        gizmoPanel.appendChild(gizmoRow);
        this.uiSidebar.appendChild(gizmoPanel);

        // --- CAMERA SEQUENCE (existing keyframe system) ---
        const camSeqPanel = makePanel();
        camSeqPanel.appendChild(panelTitle("Camera Sequence"));
        const camRow1 = document.createElement("div"); camRow1.style.display = "flex"; camRow1.style.gap = "4px"; camRow1.style.marginBottom = "4px";
        const btnSetStart = createBtn("Set Start"), btnSetEnd = createBtn("Set End");
        btnSetStart.onclick = () => {
            this.camKeys.start = { pos: this.camera.position.clone(), quat: this.camera.quaternion.clone(), target: this.controls.target.clone() };
            btnSetStart.innerText = "Start Set ✓"; btnSetStart.style.borderColor = "#0f0";
        };
        btnSetEnd.onclick = () => {
            this.camKeys.end = { pos: this.camera.position.clone(), quat: this.camera.quaternion.clone(), target: this.controls.target.clone() };
            btnSetEnd.innerText = "End Set ✓"; btnSetEnd.style.borderColor = "#0f0";
        };
        const camRow2 = document.createElement("div"); camRow2.style.display = "flex"; camRow2.style.gap = "4px";
        const selEase = document.createElement("select");
        Object.assign(selEase.style, { flex: "1", background: "#111", color: "#fff", border: "1px solid #444", borderRadius: "3px", fontSize: "10px", padding: "2px" });
        ['linear', 'easeIn', 'easeOut', 'easeInOut'].forEach(e => selEase.add(new Option(e, e)));
        selEase.onchange = (e) => this.camKeys.ease = e.target.value;
        const btnClearCam = createBtn("Clear", "#522", "#733");
        btnClearCam.onclick = () => { this.camKeys.start = null; this.camKeys.end = null; btnSetStart.innerText = "Set Start"; btnSetStart.style.borderColor = "#555"; btnSetEnd.innerText = "Set End"; btnSetEnd.style.borderColor = "#555"; };
        camRow1.append(btnSetStart, btnSetEnd);
        camRow2.append(selEase, btnClearCam);
        camSeqPanel.append(camRow1, camRow2);
        this.uiSidebar.appendChild(camSeqPanel);

        // --- CHARACTERS HEADER ---
        const charHeader = document.createElement("div");
        charHeader.style.display = "flex"; charHeader.style.justifyContent = "space-between"; charHeader.style.alignItems = "center";
        charHeader.innerHTML = `<span style="font-weight:bold;color:#aaa;">Characters</span>`;
        const btnAddChar = createBtn("+ Add Char", "#252", "#373");
        btnAddChar.style.flex = "none"; btnAddChar.style.padding = "2px 6px";
        btnAddChar.onclick = () => this.addCharacter();
        charHeader.appendChild(btnAddChar);
        this.uiSidebar.appendChild(charHeader);

        // --- CHARACTER LIST CONTAINER ---
        this.uiCharList = document.createElement("div");
        this.uiCharList.style.display = "flex"; this.uiCharList.style.flexDirection = "column"; this.uiCharList.style.gap = "6px";
        this.uiSidebar.appendChild(this.uiCharList);
    }

    // ==================== FEAT-01: Camera Methods ====================
    switchProjection(mode) {
        this.projectionMode = mode;
        const pos = this.camera.position.clone();
        const target = this.controls.target.clone();

        if (mode === 'orthographic') {
            this.orthoCamera.position.copy(pos);
            this.orthoCamera.quaternion.copy(this.camera.quaternion);
            this.camera = this.orthoCamera;
            this.applyOrthoScale();
            if (this._camInputs.btnPersp) { this._camInputs.btnPersp.style.background = "#444"; this._camInputs.btnOrtho.style.background = "#335"; }
        } else {
            this.perspCamera.position.copy(pos);
            this.perspCamera.quaternion.copy(this.camera.quaternion);
            this.camera = this.perspCamera;
            this.applyFocalLength();
            if (this._camInputs.btnPersp) { this._camInputs.btnPersp.style.background = "#335"; this._camInputs.btnOrtho.style.background = "#444"; }
        }

        // Rebind controls to new camera
        this.controls.object = this.camera;
        this.controls.target.copy(target);
        this.controls.update();
        // Rebind transform controls
        if (this.transformControls) this.transformControls.camera = this.camera;
        this.onResize(this.container.querySelector(".yedp-vp-area"));
    }

    applyFocalLength() {
        if (!this.perspCamera) return;
        const fov = 2 * Math.atan(24 / (2 * this.focalLength)) * (180 / Math.PI);
        this.perspCamera.fov = fov;
        this.perspCamera.updateProjectionMatrix();
    }

    applyOrthoScale() {
        if (!this.orthoCamera) return;
        const aspect = this.renderWidth / this.renderHeight;
        this.orthoCamera.left = -this.orthoScale * aspect;
        this.orthoCamera.right = this.orthoScale * aspect;
        this.orthoCamera.top = this.orthoScale;
        this.orthoCamera.bottom = -this.orthoScale;
        this.orthoCamera.updateProjectionMatrix();
    }

    syncCameraToInputs() {
        const ci = this._camInputs;
        if (!ci.px) return;
        ci.px.value = this.camera.position.x.toFixed(2);
        ci.py.value = this.camera.position.y.toFixed(2);
        ci.pz.value = this.camera.position.z.toFixed(2);
        ci.tx.value = this.controls.target.x.toFixed(2);
        ci.ty.value = this.controls.target.y.toFixed(2);
        ci.tz.value = this.controls.target.z.toFixed(2);
    }

    // ==================== FEAT-02: Preset Methods ====================
    async refreshPresetList() {
        try {
            const res = await api.fetchApi("/yedp/camera_presets/list");
            const data = await res.json();
            if (this._presetSelect && data.presets) {
                this._presetSelect.innerHTML = "";
                data.presets.forEach(name => this._presetSelect.add(new Option(name, name)));
            }
        } catch (e) { console.warn("[Yedp] Failed to fetch presets:", e); }
    }

    async loadPreset(name) {
        if (!name) return;
        try {
            const res = await api.fetchApi(`/yedp/camera_presets/load/${encodeURIComponent(name)}`);
            const data = await res.json();
            if (data.error) { console.warn(data.error); return; }
            const cam = data.camera;
            if (!cam) return;

            // Apply projection
            if (cam.projection) this.switchProjection(cam.projection);
            if (cam.focal_length) { this.focalLength = cam.focal_length; if (this._camInputs.focal) this._camInputs.focal.value = cam.focal_length; this.applyFocalLength(); }
            if (cam.ortho_scale) { this.orthoScale = cam.ortho_scale; if (this._camInputs.orthoScale) this._camInputs.orthoScale.value = cam.ortho_scale; this.applyOrthoScale(); }

            // Apply position
            if (cam.position) {
                this.camera.position.set(cam.position.x, cam.position.y, cam.position.z);
            }
            // We look towards target for presets instead of using rotation directly
            if (cam.position) this.controls.target.set(0, 1, 0); // default target
            this.controls.update();
            this.syncCameraToInputs();
            console.log(`[Yedp] Loaded preset: ${name}`);
        } catch (e) { console.error("[Yedp] Preset load error:", e); }
    }

    async savePresetPrompt() {
        const name = prompt("Preset name:");
        if (!name || !name.trim()) return;
        const data = {
            preset_name: name.trim(),
            camera: {
                position: { x: +this.camera.position.x.toFixed(3), y: +this.camera.position.y.toFixed(3), z: +this.camera.position.z.toFixed(3) },
                rotation: { x: 0, y: 0, z: 0 },
                focal_length: this.focalLength,
                projection: this.projectionMode,
                ortho_scale: this.orthoScale
            }
        };
        try {
            await api.fetchApi("/yedp/camera_presets/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
            this.refreshPresetList();
        } catch (e) { console.error("[Yedp] Save error:", e); }
    }

    async deletePreset(name) {
        if (!name || !confirm(`Delete preset "${name}"?`)) return;
        try {
            await api.fetchApi(`/yedp/camera_presets/delete/${encodeURIComponent(name)}`, { method: "DELETE" });
            this.refreshPresetList();
        } catch (e) { console.error("[Yedp] Delete error:", e); }
    }

    refreshSidebarHighlights() {
        Array.from(this.uiCharList.children).forEach(card => {
            const isActive = card.dataset.id == this.activeCharId;
            card.style.borderColor = isActive ? "#00d2ff" : "#444";
        });
    }

    renderCharacterCards() {
        this.uiCharList.innerHTML = "";
        this.characters.forEach(c => {
            const card = document.createElement("div");
            card.dataset.id = c.id;
            Object.assign(card.style, { background: "#222", border: "1px solid #444", borderRadius: "4px", padding: "6px" });

            const head = document.createElement("div");
            head.style.display = "flex"; head.style.justifyContent = "space-between"; head.style.marginBottom = "2px";
            head.innerHTML = `<span style="font-weight:bold; font-size:12px;">Char ${c.id}</span>`;

            const actBox = document.createElement("div"); actBox.style.display = "flex"; actBox.style.gap = "4px";
            const btnSel = document.createElement("button"); btnSel.innerText = "Select";
            Object.assign(btnSel.style, { background: "#444", color: "#fff", border: "1px solid #555", borderRadius: "2px", cursor: "pointer", fontSize: "9px" });
            btnSel.onclick = () => { this.activeCharId = c.id; this.transformControls.attach(c.scene); this.refreshSidebarHighlights(); };

            const btnDel = document.createElement("button"); btnDel.innerText = "X";
            Object.assign(btnDel.style, { background: "#622", color: "#fff", border: "1px solid #555", borderRadius: "2px", cursor: "pointer", fontSize: "9px" });
            btnDel.onclick = () => this.removeCharacter(c.id);

            actBox.append(btnSel, btnDel);
            head.appendChild(actBox);

            // V9.7 Debug Info to show exactly what meshes got parsed successfully
            const meshInfo = document.createElement("div");
            meshInfo.style.fontSize = "9px";
            meshInfo.style.color = "#888";
            meshInfo.style.marginBottom = "4px";
            meshInfo.innerText = `[M:${c.depthMeshesM.length} | F:${c.depthMeshesF.length} | Pose:${c.poseMeshes.length}]`;

            const selAnim = document.createElement("select");
            Object.assign(selAnim.style, { width: "100%", background: "#111", color: "#fff", border: "1px solid #444", borderRadius: "3px", fontSize: "10px", padding: "2px", marginBottom: "4px" });
            this.availableAnimations.forEach(anim => selAnim.add(new Option(anim, anim)));
            selAnim.value = c.animFile;
            selAnim.onchange = (e) => {
                c.activeClipIndex = 0; // Reset clip on file change
                this.loadAnimationForChar(c, e.target.value);
            };

            const animControls = document.createElement("div");
            animControls.appendChild(selAnim);

            if (c.loadedAnimations && c.loadedAnimations.length > 0) {
                const selClip = document.createElement("select");
                Object.assign(selClip.style, { width: "100%", background: "#222", color: "#aaa", border: "1px solid #444", borderRadius: "3px", fontSize: "9px", padding: "1px", marginBottom: "4px" });
                c.loadedAnimations.forEach((clip, i) => selClip.add(new Option(`[${i}] ${clip.name || 'Unnamed'}`, i)));
                selClip.value = c.activeClipIndex || 0;
                selClip.onchange = (e) => {
                    c.activeClipIndex = parseInt(e.target.value);
                    this.loadAnimationForChar(c, c.animFile);
                };
                animControls.appendChild(selClip);
            }

            const foot = document.createElement("div"); foot.style.display = "flex"; foot.style.justifyContent = "space-between"; foot.style.alignItems = "center";

            // Loop & Gender Box
            const loopBox = document.createElement("div");
            loopBox.style.display = "flex"; loopBox.style.alignItems = "center"; loopBox.style.gap = "6px";

            const btnGender = document.createElement("button");
            btnGender.innerText = c.gender;
            Object.assign(btnGender.style, {
                background: "#111", border: "1px solid #444", borderRadius: "3px",
                cursor: "pointer", fontSize: "10px", padding: "1px 6px", fontWeight: "bold",
                color: c.gender === 'F' ? '#ff66b2' : '#66b2ff'
            });
            btnGender.onclick = () => {
                c.gender = c.gender === 'M' ? 'F' : 'M';
                btnGender.innerText = c.gender;
                btnGender.style.color = c.gender === 'F' ? '#ff66b2' : '#66b2ff';
                const selView = this.container.querySelector("#sel-viewmode");
                if (selView) this.setViewMode(selView.value);
            };

            const lblLoop = document.createElement("label"); lblLoop.style.cursor = "pointer"; lblLoop.style.display = "flex"; lblLoop.style.gap = "2px";
            const chkLoop = document.createElement("input"); chkLoop.type = "checkbox"; chkLoop.checked = c.loop;
            chkLoop.onchange = (e) => { c.loop = e.target.checked; if (c.action) { c.action.setLoop(c.loop ? this.THREE.LoopRepeat : this.THREE.LoopOnce); c.action.clampWhenFinished = !c.loop; } };
            lblLoop.append(chkLoop, "Loop");

            loopBox.append(btnGender, lblLoop);

            const lblDur = document.createElement("span");
            const fps = this.getWidgetValue("fps", 24);
            lblDur.innerText = c.duration > 0 ? `${Math.floor(c.duration * fps)}f` : "--";
            lblDur.id = `dur-${c.id}`;
            lblDur.style.color = "#888"; lblDur.style.fontFamily = "monospace";

            foot.append(loopBox, lblDur);

            // --- GIZMO NUMERIC INPUTS (Pos XYZ, Rot Y) ---
            const numRow = (label, fields) => {
                const row = document.createElement("div");
                row.style.display = "flex"; row.style.gap = "2px"; row.style.alignItems = "center"; row.style.marginTop = "3px";
                const lbl = document.createElement("span");
                lbl.innerText = label; lbl.style.color = "#666"; lbl.style.fontSize = "9px"; lbl.style.minWidth = "18px";
                row.appendChild(lbl);
                fields.forEach(inp => row.appendChild(inp));
                return row;
            };
            const nInp = (val) => {
                const inp = document.createElement("input"); inp.type = "number"; inp.step = "0.1"; inp.value = val;
                Object.assign(inp.style, { width: "42px", background: "#111", color: "#fff", border: "1px solid #444", fontSize: "9px", padding: "1px 2px", borderRadius: "2px" });
                return inp;
            };
            const cpx = nInp(c.scene.position.x.toFixed(2));
            const cpy = nInp(c.scene.position.y.toFixed(2));
            const cpz = nInp(c.scene.position.z.toFixed(2));
            const applyCharPos = () => {
                c.scene.position.set(parseFloat(cpx.value), parseFloat(cpy.value), parseFloat(cpz.value));
            };
            cpx.onchange = cpy.onchange = cpz.onchange = applyCharPos;

            const cry = nInp((c.scene.rotation.y * 180 / Math.PI).toFixed(1));
            cry.step = "15";
            cry.onchange = () => { c.scene.rotation.y = parseFloat(cry.value) * Math.PI / 180; };

            card.appendChild(numRow("Pos", [cpx, cpy, cpz]));
            card.appendChild(numRow("RotY", [cry]));

            card.append(head, meshInfo, animControls, foot);
            this.uiCharList.appendChild(card);
        });
        this.refreshSidebarHighlights();
    }

    // --- CORE LOGIC ---
    async fetchAnimations() {
        try {
            const res = await api.fetchApi("/yedp/get_animations");
            const data = await res.json();
            if (data.files && data.files.length > 0) this.availableAnimations = data.files;
        } catch (e) { console.error("Failed to fetch animations."); }
    }

    async loadBaseRig() {
        const loader = new this.GLTFLoaderClass();
        // V9.8 FIX: Cache Buster. Appending the current timestamp forces the browser 
        // to bypass the local cache and download the absolute newest version of your GLB.
        const rigUrl = new URL(`../Yedp_Rig.glb?t=${Date.now()}`, this.baseUrl).href;
        console.log("[Yedp] Loading Base Rig from:", rigUrl);
        const gltf = await loader.loadAsync(rigUrl);
        this.baseRig = gltf.scene;

        this.baseRig.traverse((child) => {
            if (child.isBone || child.type === "Bone" || child.isObject3D) {
                const normalized = semanticNormalize(child.name);
                if (normalized) this.semanticMap.set(normalized, child.name);
            }
        });

        // Spawn first character automatically
        this.addCharacter();
    }

    addCharacter() {
        if (this.characters.length >= 16) { alert("Maximum 16 characters recommended for WebGL performance."); return; }
        this.charCounter++;
        const newChar = new CharacterInstance(this.charCounter, this.baseRig, this.THREE);
        this.scene.add(newChar.scene);
        this.scene.add(newChar.skeletonHelper);
        this.characters.push(newChar);
        this.renderCharacterCards();
    }

    removeCharacter(id) {
        const idx = this.characters.findIndex(c => c.id === id);
        if (idx === -1) return;
        const c = this.characters[idx];
        if (this.activeCharId === id) { this.transformControls.detach(); this.activeCharId = null; }
        c.destroy(this.scene);
        this.characters.splice(idx, 1);
        this.renderCharacterCards();
    }

    async refreshRetargetMaps() {
        try {
            const resp = await api.fetchApi("/yedp/retarget_maps/list");
            const data = await resp.json();
            this._retargetSelect.innerHTML = "";
            data.maps.forEach(m => {
                const opt = document.createElement("option");
                opt.value = opt.innerText = m;
                this._retargetSelect.appendChild(opt);
            });
            // Try to select BoneConvert by default if it exists
            const defaultOpt = Array.from(this._retargetSelect.options).find(o => o.value.includes("BoneConvert"));
            if (defaultOpt) this._retargetSelect.value = defaultOpt.value;
        } catch (e) { console.error("Failed to load retarget maps list", e); }
    }

    async loadAnimationForChar(charObj, filename) {
        if (!filename || filename === "none") return;
        charObj.animFile = filename;
        const isFBX = filename.toLowerCase().endsWith(".fbx");
        const isBVH = filename.toLowerCase().endsWith(".bvh");
        const url = `/view?filename=${filename}&type=input&subfolder=yedp_anims&t=${Date.now()}`;

        // Fetch retarget bone map from UI selection
        let retargetMap = {};
        try {
            const selectedMap = this._retargetSelect ? this._retargetSelect.value : "None";
            if (selectedMap !== "None") {
                const mapRes = await api.fetchApi(`/yedp/retarget_maps/load/${encodeURIComponent(selectedMap)}`);
                const mapData = await mapRes.json();
                if (mapData.bone_map && Object.keys(mapData.bone_map).length > 0) {
                    retargetMap = mapData.bone_map;
                    console.log(`[Yedp] Using retarget map '${selectedMap}' (${Object.keys(retargetMap).length} mappings)`);
                }
            }
        } catch (e) { console.error("[Yedp] Failed to load retarget map", e); }

        try {
            let model;
            if (isFBX) model = await new this.FBXLoader().loadAsync(url);
            else if (isBVH) model = await new this.BVHLoader().loadAsync(url);
            else model = await new this.GLTFLoaderClass().loadAsync(url);

            let animations = isBVH ? (model.clip ? [model.clip] : []) : (model.animations || model.scene?.animations || model.asset?.animations || []);

            charObj.loadedAnimations = animations;
            charObj.activeClipIndex = charObj.activeClipIndex || 0;
            if (charObj.activeClipIndex >= animations.length) charObj.activeClipIndex = 0;

            let clip = animations[charObj.activeClipIndex];

            // Trigger UI refresh to render the clip selector if there are multiple animations
            setTimeout(() => this.renderCharacterCards(), 0);

            if (clip) {
                const tracks = [];
                clip.tracks.forEach(t => {
                    const lastDot = t.name.lastIndexOf(".");
                    const prop = t.name.substring(lastDot + 1);
                    const fullBonePath = t.name.substring(0, lastDot);

                    if (prop === "scale") return;

                    // Step 1: Try retarget bone map first (exact match on bone name)
                    let targetRealName = null;
                    const boneName = fullBonePath.split('/').pop().split(':').pop();
                    if (retargetMap[boneName]) {
                        // retargetMap maps source->target, need to find target in semanticMap
                        const mappedTarget = retargetMap[boneName];
                        const normMapped = semanticNormalize(mappedTarget);
                        if (this.semanticMap.has(normMapped)) {
                            targetRealName = this.semanticMap.get(normMapped);
                        }
                    }

                    // Step 2: Fall back to semanticNormalize
                    if (!targetRealName) {
                        const normalizedTrackBone = semanticNormalize(fullBonePath);
                        if (this.semanticMap.has(normalizedTrackBone)) {
                            targetRealName = this.semanticMap.get(normalizedTrackBone);
                        }
                    }

                    if (targetRealName) {
                        const tc = t.clone();
                        tc.name = `${targetRealName}.${prop}`;
                        tracks.push(tc);
                    }
                });

                const cleanClip = new this.THREE.AnimationClip(clip.name, clip.duration, tracks);
                charObj.mixer.stopAllAction();
                charObj.mixer.uncacheRoot(charObj.scene);

                charObj.action = charObj.mixer.clipAction(cleanClip);
                charObj.action.setLoop(charObj.loop ? this.THREE.LoopRepeat : this.THREE.LoopOnce);
                charObj.action.clampWhenFinished = !charObj.loop;
                charObj.action.reset().setEffectiveWeight(1).play();
                charObj.mixer.update(0);

                charObj.duration = cleanClip.duration;

                const lbl = document.getElementById(`dur-${charObj.id}`);
                if (lbl) {
                    const fps = this.getWidgetValue("fps", 24);
                    lbl.innerText = `${Math.floor(charObj.duration * fps)}f`;
                }

                this.isPlaying = true;
                const btn = this.container.querySelector("#btn-play");
                if (btn) btn.innerText = "⏸";
            }
        } catch (e) { console.error("Anim Load Error:", e); }
    }

    applyCameraKeyframes(timeRatio) {
        if (!this.camKeys.start || !this.camKeys.end) return;
        let t = timeRatio;
        // Easing functions
        if (this.camKeys.ease === 'easeIn') t = t * t;
        else if (this.camKeys.ease === 'easeOut') t = t * (2 - t);
        else if (this.camKeys.ease === 'easeInOut') t = t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

        this.camera.position.lerpVectors(this.camKeys.start.pos, this.camKeys.end.pos, t);
        this.camera.quaternion.slerpQuaternions(this.camKeys.start.quat, this.camKeys.end.quat, t);

        // Fixed: Lerp OrbitControls target for panning and zooming support
        if (this.controls && this.camKeys.start.target && this.camKeys.end.target) {
            this.controls.target.lerpVectors(this.camKeys.start.target, this.camKeys.end.target, t);
        }
    }

    animate() {
        if (!this.renderer) return;
        requestAnimationFrame(() => this.animate());
        if (this.isBaking) return;

        const delta = this.clock.getDelta();
        const totalFrames = this.getWidgetValue("frame_count", 48);
        const fps = this.getWidgetValue("fps", 24);

        if (this.isPlaying) {
            // V9.9 FIX: Use decoupled internal time to prevent slider truncation logic.
            // This allows the animation to play perfectly smoothly regardless of fractional FPS steps.
            this.globalTime += delta;
            const totalDuration = totalFrames / fps;

            // Global Loop
            if (this.globalTime >= totalDuration) {
                this.globalTime = this.globalTime % totalDuration;
            }

            const currentFrame = Math.floor(this.globalTime * fps);

            // Only update the slider visuals without triggering a fractional math error
            const slider = this.container.querySelector("#t-slider");
            if (slider && !this.isDraggingSlider) {
                slider.value = currentFrame;
            }

            const timeLabel = this.container.querySelector("#t-time");
            if (timeLabel) {
                timeLabel.innerText = `${currentFrame} / ${totalFrames}`;
            }

            const t = this.globalTime;

            this.characters.forEach(c => {
                if (c.action && c.duration > 0) {
                    c.action.time = c.loop ? (t % c.duration) : Math.min(t, c.duration);
                    c.mixer.update(0); // strict evaluate
                }
            });

            this.applyCameraKeyframes(currentFrame / Math.max(1, totalFrames - 1));
        }

        if (this.controls) this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    setViewMode(mode) {
        this.isDepthMode = (mode === 'depth');
        this.characters.forEach(c => {
            // Keep inactive meshes hidden at all times
            c.inactiveDepthMeshes.forEach(m => m.visible = false);

            c.activeDepthMeshes.forEach(m => {
                m.visible = (mode === 'mesh' || mode === 'depth');
                if (mode === 'depth') {
                    if (m.isMesh && !this.originalMaterials.has(m)) this.originalMaterials.set(m, m.material);
                    m.material = this.depthMat;
                } else {
                    if (this.originalMaterials.has(m)) m.material = this.originalMaterials.get(m);
                }
            });
            c.poseMeshes.forEach(m => m.visible = (mode === 'pose'));
        });

        const depthCtrls = this.container.querySelector("#depth-ctrls");
        if (depthCtrls) depthCtrls.style.opacity = this.isDepthMode ? "1.0" : "0.5";

        if (this.isDepthMode) this.updateCameraBounds();
        else this.resetCamera();
    }

    updateCameraBounds() {
        if (!this.camera) return;
        this.camera.near = Math.max(0.01, this.userNear);
        this.camera.far = Math.max(0.1, this.userFar);
        this.camera.updateProjectionMatrix();
    }
    resetCamera() {
        if (!this.camera) return;
        this.camera.near = this.defaultNear;
        this.camera.far = this.defaultFar;
        this.camera.updateProjectionMatrix();
    }

    hookNodeWidgets() {
        const updateDim = (w, val) => {
            if (w && w.name === "width") this.renderWidth = val;
            else if (w && w.name === "height") this.renderHeight = val;

            const lbl = this.container.querySelector("#lbl-res");
            if (lbl) lbl.innerText = `${this.renderWidth}x${this.renderHeight}`;
            this.onResize(this.container.querySelector(".yedp-vp-area"));
        };

        const wWidget = this.node.widgets?.find(w => w.name === "width");
        const hWidget = this.node.widgets?.find(w => w.name === "height");

        if (wWidget) {
            this.renderWidth = wWidget.value;
            const orig = wWidget.callback;
            wWidget.callback = v => { updateDim(wWidget, v); if (orig) orig(v); };
        }

        if (hWidget) {
            this.renderHeight = hWidget.value;
            const orig = hWidget.callback;
            hWidget.callback = v => { updateDim(hWidget, v); if (orig) orig(v); };
        }

        updateDim();

        // Frame count & FPS updates max slider
        const slider = this.container.querySelector("#t-slider");
        const fWidget = this.node.widgets?.find(w => w.name === "frame_count");
        if (fWidget && slider) {
            slider.max = fWidget.value;
            const orig = fWidget.callback;
            fWidget.callback = v => { slider.max = v; if (orig) orig(v); };
        }
    }

    onResize(vpDiv) {
        if (this.isBaking || !this.renderer || !vpDiv || !this.camera) return;
        const w = vpDiv.clientWidth;
        const h = vpDiv.clientHeight;
        if (w && h) {
            this.renderer.setSize(w, h);
            if (this.camera.isOrthographicCamera) {
                this.applyOrthoScale();
            } else {
                this.camera.aspect = w / h;
                this.camera.updateProjectionMatrix();
            }

            const aspectContainer = w / h;
            const aspectTarget = this.renderWidth / this.renderHeight;
            let gw, gh;
            if (aspectContainer > aspectTarget) { gh = h - 20; gw = gh * aspectTarget; }
            else { gw = w - 20; gh = gw / aspectTarget; }
            if (this.gate) { this.gate.style.width = `${gw}px`; this.gate.style.height = `${gh}px`; }
        }
    }

    getWidgetValue(name, defaultVal) {
        const w = this.node.widgets?.find(x => x.name === name);
        return w ? w.value : defaultVal;
    }

    async performBatchRender() {
        if (this.characters.length === 0) { alert("No characters added!"); return; }
        const THREE = this.THREE;
        const btn = this.container.querySelector('#btn-bake');
        btn.innerText = "PREPARING...";

        this.isBaking = true;
        this.isPlaying = false;

        // Hide gizmo
        this.transformControls.detach();
        this.activeCharId = null;
        this.refreshSidebarHighlights();

        const originalSize = new this.THREE.Vector2();
        this.renderer.getSize(originalSize);
        const isOrtho = this.camera.isOrthographicCamera;
        const originalAspect = isOrtho ? 1 : this.camera.aspect;
        const originalZoom = this.camera.zoom;
        const originalBg = this.scene.background;

        const vpArea = this.container.querySelector(".yedp-vp-area");
        if (vpArea && !isOrtho) {
            const vpW = vpArea.clientWidth; const vpH = vpArea.clientHeight;
            const vpAspect = vpW / vpH; const targetAspect = this.renderWidth / this.renderHeight;
            if (vpAspect < targetAspect) this.camera.zoom = originalZoom * (targetAspect / vpAspect);
            else this.camera.zoom = originalZoom;
        }

        this.renderer.setSize(this.renderWidth, this.renderHeight);
        if (isOrtho) {
            this.applyOrthoScale();
        } else {
            this.camera.aspect = this.renderWidth / this.renderHeight;
        }
        this.camera.updateProjectionMatrix();

        const frames = this.getWidgetValue("frame_count", 48);
        const fps = this.getWidgetValue("fps", 24);
        const step = 1.0 / fps;

        const results = { pose: [], depth: [], canny: [], normal: [], shaded: [] };

        // Determine current visibility intent
        const visSkel = this.container.querySelector("#chk-skel").checked;
        const toggleHelpers = (vis) => {
            if (this.gridHelper) this.gridHelper.visible = vis;
            if (this.axesHelper) this.axesHelper.visible = vis;
        };
        toggleHelpers(false);

        const setVisibility = (mode) => {
            const showPose = mode === 'pose';
            const showDepth = mode === 'depth' || mode === 'canny' || mode === 'normal' || mode === 'shaded';
            this.characters.forEach(c => {
                c.poseMeshes.forEach(m => m.visible = showPose);
                c.inactiveDepthMeshes.forEach(m => m.visible = false); // Force inactive meshes to stay hidden
                c.activeDepthMeshes.forEach(m => m.visible = showDepth);
                c.skeletonHelper.visible = visSkel && showPose;
            });
        };

        const swapPoseToUnlit = () => {
            const originalMats = new Map();
            this.characters.forEach(c => {
                c.poseMeshes.forEach(child => {
                    if (child.isMesh && child.material) {
                        originalMats.set(child, child.material);
                        const oldColor = child.material.color || new THREE.Color(0xffffff);
                        const newMat = new THREE.MeshBasicMaterial({ color: oldColor, skinning: true });
                        if (child.material.map) { newMat.map = child.material.map; newMat.color.setHex(0xffffff); }
                        child.material = newMat;
                    }
                });
            });
            return () => {
                this.characters.forEach(c => {
                    c.poseMeshes.forEach(child => { if (originalMats.has(child)) child.material = originalMats.get(child); });
                });
            };
        };

        const compressCanvas = document.createElement("canvas");
        compressCanvas.width = this.renderWidth; compressCanvas.height = this.renderHeight;
        const compressCtx = compressCanvas.getContext("2d");

        const captureFrame = (array, mimeType = "image/png", quality = undefined) => {
            this.renderer.render(this.scene, this.camera);
            this.renderer.getContext().finish();
            if (mimeType === "image/jpeg") {
                compressCtx.fillStyle = "#000000";
                compressCtx.fillRect(0, 0, this.renderWidth, this.renderHeight);
                compressCtx.drawImage(this.renderer.domElement, 0, 0);
                array.push(compressCanvas.toDataURL(mimeType, quality));
            } else {
                array.push(this.renderer.domElement.toDataURL(mimeType));
            }
        };

        // RENDER LOOP
        for (let i = 0; i < frames; i++) {
            const time = i * step;
            const timeRatio = frames > 1 ? i / (frames - 1) : 0;

            // UI Progress Feedback
            btn.innerText = `BAKING ${i + 1}/${frames}`;

            this.applyCameraKeyframes(timeRatio);

            this.characters.forEach(c => {
                if (c.action && c.duration > 0) {
                    c.action.time = c.loop ? (time % c.duration) : Math.min(time, c.duration);
                    c.mixer.update(0);
                }
                c.scene.updateMatrixWorld(true);
            });

            // PASS 1: OPENPOSE
            this.scene.background = new THREE.Color(0x000000);
            setVisibility('pose');
            this.resetCamera();
            const restoreMaterials = swapPoseToUnlit();
            captureFrame(results.pose, "image/png");
            restoreMaterials();

            // PASS 2: DEPTH
            this.scene.background = new THREE.Color(0x000000);
            setVisibility('depth');
            this.camera.near = Math.max(0.01, this.userNear);
            this.camera.far = Math.max(0.1, this.userFar);
            this.camera.updateProjectionMatrix();

            const depthRestores = [];
            this.characters.forEach(c => {
                c.activeDepthMeshes.forEach(m => { depthRestores.push({ mesh: m, mat: m.material }); m.material = this.depthMat; });
            });
            captureFrame(results.depth, "image/png");
            depthRestores.forEach(o => o.mesh.material = o.mat);

            // PASS 3: CANNY
            this.scene.background = new THREE.Color(0x000000);
            setVisibility('canny');
            this.resetCamera();
            const cannyRestores = [];
            this.characters.forEach(c => {
                c.activeDepthMeshes.forEach(m => { cannyRestores.push({ mesh: m, mat: m.material }); m.material = this.cannyMat; });
            });
            captureFrame(results.canny, "image/png");
            cannyRestores.forEach(o => o.mesh.material = o.mat);

            // PASS 4: NORMAL
            this.scene.background = new THREE.Color(0x000000);
            setVisibility('normal');
            this.resetCamera();
            const normalRestores = [];
            this.characters.forEach(c => {
                c.activeDepthMeshes.forEach(m => { normalRestores.push({ mesh: m, mat: m.material }); m.material = this.normalMat; });
            });
            captureFrame(results.normal, "image/png");
            normalRestores.forEach(o => o.mesh.material = o.mat);

            // PASS 5: SHADED (Lighting & Original Materials)
            this.scene.background = new THREE.Color(0x000000);
            setVisibility('shaded');
            this.resetCamera();
            // We do NOT call swapPoseToUnlit() here, so the original shaded materials are preserved!
            captureFrame(results.shaded, "image/png");

            await new Promise(r => setTimeout(r, 10)); // tiny yield
        }

        // Restoration
        this.renderer.setSize(originalSize.width, originalSize.height);
        if (!isOrtho) this.camera.aspect = originalAspect;
        this.camera.zoom = originalZoom;

        if (this.isDepthMode) { this.camera.near = this.userNear; this.camera.far = this.userFar; }
        else this.resetCamera();
        this.camera.updateProjectionMatrix();

        toggleHelpers(true);
        this.scene.background = originalBg;
        this.isBaking = false;

        // Restore standard view
        const selViewMode = this.container.querySelector("#sel-viewmode").value;
        this.setViewMode(selViewMode);
        this.characters.forEach(c => { c.skeletonHelper.visible = visSkel; });

        // ---- CRITICAL NEW UPLOAD LOGIC TO PREVENT QUOTA CRASHES ----
        btn.innerText = "UPLOADING TO CACHE...";
        const clientDataWidget = this.node.widgets.find(w => w.name === "client_data");
        if (clientDataWidget) {
            try {
                // Upload massive payload to python memory to avoid localStorage serialization crash
                const response = await api.fetchApi("/yedp/upload_payload", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(results)
                });

                if (!response.ok) throw new Error("Upload failed");
                const resData = await response.json();

                // Store only the tiny ID string inside the widget (safe for localStorage!)
                clientDataWidget.value = resData.payload_id;
                console.log(`[Yedp] Batch Render Complete. Cached payload ID: ${resData.payload_id}`);
            } catch (err) {
                console.error("[Yedp] Memory cache upload failed, falling back to local string:", err);
                clientDataWidget.value = JSON.stringify(results);
            }
        }

        btn.innerText = "BAKE (DONE)";
        setTimeout(() => { btn.innerText = "BAKE V9.10"; }, 2000);
    }
}

app.registerExtension({
    name: "Yedp.ActionDirector",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "YedpActionDirector") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                if (onNodeCreated) onNodeCreated.apply(this, arguments);

                const container = document.createElement("div");
                container.classList.add("yedp-container");
                container.style.width = "100%";
                container.style.height = "100%";
                // Prevent viewport bleeding out of the node's rounded corners
                container.style.overflow = "hidden";
                container.style.borderRadius = "0 0 6px 6px";

                const widget = this.addDOMWidget("3d_viewport", "vp", container, { serialize: false, hideOnZoom: false });
                // Return a minimum height so ComfyUI's layout engine allocates space
                // immediately on load instead of collapsing the node to 0 height.
                widget.computeSize = (w) => [w, 500];

                setTimeout(() => {
                    const vp = new YedpViewport(this, container);
                    const onResizeOrig = this.onResize;
                    this.onResize = function (size) {
                        if (onResizeOrig) onResizeOrig.call(this, size);
                        let usedHeight = 30;
                        if (this.widgets) {
                            for (const w of this.widgets) {
                                if (w === widget) break;
                                usedHeight += w.last_h || 26;
                            }
                        }
                        const safeHeight = Math.max(10, size[1] - usedHeight - 45);
                        container.style.height = safeHeight + "px";
                        container.style.width = Math.max(10, size[0] - 20) + "px"; // EXPLICIT WIDTH
                        container.style.maxHeight = "none";
                        vp.onResize(container.querySelector(".yedp-vp-area"));
                    };

                    // Force an immediate resize calculation on initialization
                    if (this.size) {
                        this.onResize(this.size);
                    }

                    // V9.10 FIX: Self-healing layout loop for off-screen loads
                    // ComfyUI will cull off-screen nodes causing their DOM to have 0x0 dimensions.
                    // When scrolled into view, the DOM recovers its size automatically, but Three.js
                    // renderer needs to be explicitly synchronized.
                    const observer = new ResizeObserver(() => {
                        const vpArea = container.querySelector(".yedp-vp-area");
                        if (vpArea && vpArea.clientWidth > 0 && vpArea.clientHeight > 0) {
                            vp.onResize(vpArea);
                        }
                    });
                    observer.observe(container);

                }, 100);

                // Made the default UI slightly wider to comfortably fit the viewport + sidebar
                this.setSize([820, 700]);
            };
        }
    }
});
