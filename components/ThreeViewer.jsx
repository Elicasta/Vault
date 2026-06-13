"use client";
import { useEffect, useRef, useState } from "react";
import Icon from "./Icons";
import { getGDriveId } from "@/lib/utils";

export default function ThreeViewer({ item, onClose }) {
  const mountRef = useRef(null);
  const stateRef = useRef({});
  const [status, setStatus] = useState("Loading model...");
  const [wireframe, setWireframe] = useState(false);
  const [lightIntensity, setLightIntensity] = useState(1.5);
  const [autoRotate, setAutoRotate] = useState(true);
  const [bgDark, setBgDark] = useState(true);

  useEffect(() => {
    let disposed = false;

    const init = async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      const { OBJLoader } = await import("three/examples/jsm/loaders/OBJLoader.js");
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const { STLLoader } = await import("three/examples/jsm/loaders/STLLoader.js");

      if (disposed || !mountRef.current) return;

      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0d0d0d);

      const camera = new THREE.PerspectiveCamera(50, w / h, 0.01, 1000);
      camera.position.set(2, 1.5, 3);

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      mountRef.current.appendChild(renderer.domElement);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 1.2;

      // Lighting rig. Keep OBJ/STL readable even when the source file has
      // broken, missing, or black materials.
      const ambient = new THREE.AmbientLight(0xffffff, 1.1);
      const hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 1.2);
      const key = new THREE.DirectionalLight(0xffffff, 2.0);
      key.position.set(3, 4, 2);
      const fill = new THREE.DirectionalLight(0xffffff, 0.9);
      fill.position.set(-3, 1, -2);
      const rim = new THREE.DirectionalLight(0xffffff, 1.1);
      rim.position.set(0, 2, -4);
      scene.add(ambient, hemi, key, fill, rim);

      // Ground grid
      const grid = new THREE.GridHelper(10, 20, 0x222222, 0x161616);
      scene.add(grid);

      stateRef.current = { THREE, scene, camera, renderer, controls, key, ambient, grid, model: null };

      // ── Resolve file URL ──
      let fileUrl = item.url;
      const driveId = getGDriveId(item.url);
      if (driveId) fileUrl = `/api/file?id=${driveId}`;

      let ext = (
        item.format3d ||
        item.url.match(/\.(obj|glb|gltf|stl)(\?|$)/i)?.[1] ||
        item.title?.match(/\.(obj|glb|gltf|stl)$/i)?.[1] ||
        item.format?.match(/^(obj|glb|gltf|stl)$/i)?.[1] ||
        ""
      ).toLowerCase();

      const sniffModelFormat = async () => {
        if (ext) return ext;

        // Drive share links hide the file extension. Do a tiny ranged read so
        // OBJ files do not get sent into GLTFLoader and fail with
        // "Unexpected token '#', '# Blender...' is not valid JSON".
        try {
          const res = await fetch(fileUrl, { headers: { Range: "bytes=0-4095" } });
          const buf = await res.arrayBuffer();
          const bytes = new Uint8Array(buf);
          const ascii = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
          const trimmed = ascii.trimStart();

          if (ascii.slice(0, 4) === "glTF") return "glb";
          if (trimmed.startsWith("{") && trimmed.includes('"asset"') && trimmed.includes('"gltf"')) return "gltf";
          if (trimmed.startsWith("solid") && ascii.includes("facet normal")) return "stl";
          if (trimmed.startsWith("#") || /(^|\n)\s*v\s+[-0-9.eE]+\s+[-0-9.eE]+\s+[-0-9.eE]+/.test(ascii) || /(^|\n)\s*f\s+/.test(ascii)) return "obj";
        } catch {
          // Fall through to GLB as the safest modern default.
        }

        return "glb";
      };

      ext = await sniffModelFormat();

      const normalizeModel = (object, forceDefaultMaterial = false) => {
        const defaultMaterial = new THREE.MeshStandardMaterial({
          color: 0xb8b8b8,
          roughness: 0.62,
          metalness: 0.04,
          side: THREE.DoubleSide,
        });

        object.traverse((c) => {
          if (!c.isMesh) return;

          if (c.geometry && !c.geometry.attributes.normal) {
            c.geometry.computeVertexNormals();
          }

          const materials = Array.isArray(c.material) ? c.material : [c.material];
          const hasBadMaterial = !c.material || materials.some((m) => {
            if (!m) return true;
            const color = m.color;
            const isBlack = color && color.r < 0.02 && color.g < 0.02 && color.b < 0.02;
            return isBlack && !m.map && !m.emissiveMap;
          });

          if (forceDefaultMaterial || hasBadMaterial) {
            c.material = defaultMaterial.clone();
          } else {
            materials.forEach((m) => {
              if (!m) return;
              m.side = THREE.DoubleSide;
              m.needsUpdate = true;
            });
          }

          c.castShadow = true;
          c.receiveShadow = true;
        });
      };

      const fitAndAdd = (object, options = {}) => {
        normalizeModel(object, options.forceDefaultMaterial);

        // Center and scale to fit view. Recalculate after scaling so the
        // camera always looks at the model instead of empty space.
        const box = new THREE.Box3().setFromObject(object);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const scale = 2.4 / maxDim;

        object.position.sub(center);
        object.scale.setScalar(scale);

        const scaledBox = new THREE.Box3().setFromObject(object);
        const scaledSize = scaledBox.getSize(new THREE.Vector3());
        const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
        object.position.sub(scaledCenter);
        object.position.y += scaledSize.y / 2;

        const distance = Math.max(3.2, scaledSize.length() * 1.25);
        camera.position.set(distance, distance * 0.62, distance);
        camera.near = Math.max(0.001, distance / 1000);
        camera.far = Math.max(1000, distance * 100);
        camera.updateProjectionMatrix();
        controls.target.set(0, scaledSize.y * 0.45, 0);
        controls.update();

        scene.add(object);
        stateRef.current.model = object;
        setStatus("");
      };

      try {
        if (ext === "obj") {
          const loader = new OBJLoader();
          loader.load(fileUrl, (obj) => {
            fitAndAdd(obj, { forceDefaultMaterial: true });
          }, undefined, (e) => setStatus("Failed to load OBJ. " + (e.message || "")));
        } else if (ext === "stl") {
          const loader = new STLLoader();
          loader.load(fileUrl, (geo) => {
            const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xbbbbbb, roughness: 0.5 }));
            fitAndAdd(mesh);
          }, undefined, (e) => setStatus("Failed to load STL. " + (e.message || "")));
        } else {
          // glb / gltf
          const loader = new GLTFLoader();
          loader.load(fileUrl, (gltf) => {
            fitAndAdd(gltf.scene);
            // Play first animation if it exists (posable/animated models)
            if (gltf.animations?.length) {
              const mixer = new THREE.AnimationMixer(gltf.scene);
              mixer.clipAction(gltf.animations[0]).play();
              stateRef.current.mixer = mixer;
            }
          }, undefined, (e) => setStatus("Failed to load model. Make sure it is a public Drive file or direct URL. " + (e.message || "")));
        }
      } catch (e) {
        setStatus("Load error: " + e.message);
      }

      const clock = new THREE.Clock();
      const animate = () => {
        if (disposed) return;
        requestAnimationFrame(animate);
        controls.update();
        if (stateRef.current.mixer) stateRef.current.mixer.update(clock.getDelta());
        renderer.render(scene, camera);
      };
      animate();

      const onResize = () => {
        if (!mountRef.current) return;
        const w = mountRef.current.clientWidth;
        const h = mountRef.current.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener("resize", onResize);
      stateRef.current.cleanup = () => {
        window.removeEventListener("resize", onResize);
        renderer.dispose();
        if (mountRef.current?.contains(renderer.domElement)) {
          mountRef.current.removeChild(renderer.domElement);
        }
      };
    };

    init();

    const escHandler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", escHandler);

    return () => {
      disposed = true;
      window.removeEventListener("keydown", escHandler);
      stateRef.current.cleanup?.();
    };
  }, [item, onClose]);

  // Live control effects
  useEffect(() => {
    const s = stateRef.current;
    if (s.model) {
      s.model.traverse((c) => { if (c.isMesh) c.material.wireframe = wireframe; });
    }
  }, [wireframe]);

  useEffect(() => {
    const s = stateRef.current;
    if (s.key) s.key.intensity = lightIntensity;
  }, [lightIntensity]);

  useEffect(() => {
    const s = stateRef.current;
    if (s.controls) s.controls.autoRotate = autoRotate;
  }, [autoRotate]);

  useEffect(() => {
    const s = stateRef.current;
    if (s.scene && s.THREE) {
      s.scene.background = new s.THREE.Color(bgDark ? 0x0d0d0d : 0xe8e8e8);
      if (s.grid) s.grid.visible = bgDark;
    }
  }, [bgDark]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 999, background: "#000",
      display: "flex", flexDirection: "column"
    }}>
      {/* Toolbar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 16px", background: "#111",
        borderBottom: "1px solid rgba(255,255,255,0.08)"
      }}>
        <div style={{ color: "#fff", fontSize: 13, fontWeight: 600, fontFamily: "Inter, sans-serif", display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="box" size={16} /> {item.title}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={ctrlLabel}>
            <input type="checkbox" checked={autoRotate} onChange={(e) => setAutoRotate(e.target.checked)} />
            Rotate
          </label>
          <label style={ctrlLabel}>
            <input type="checkbox" checked={wireframe} onChange={(e) => setWireframe(e.target.checked)} />
            Wireframe
          </label>
          <label style={ctrlLabel}>
            <input type="checkbox" checked={bgDark} onChange={(e) => setBgDark(e.target.checked)} />
            Dark
          </label>
          <label style={{ ...ctrlLabel, gap: 6 }}>
            <Icon name="light" size={14} />
            <input
              type="range" min="0" max="4" step="0.1"
              value={lightIntensity}
              onChange={(e) => setLightIntensity(parseFloat(e.target.value))}
              style={{ width: 80 }}
            />
          </label>
          <button onClick={onClose} style={{
            background: "rgba(255,255,255,0.1)", border: "none",
            color: "#fff", cursor: "pointer", borderRadius: 7,
            padding: "7px 14px", fontSize: 12, fontWeight: 600
          }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="x" size={13} /> Close</span>
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div ref={mountRef} style={{ flex: 1, position: "relative" }}>
        {status && (
          <div style={{
            position: "absolute", inset: 0, display: "flex",
            alignItems: "center", justifyContent: "center",
            color: "#666", fontSize: 13, fontFamily: "Inter, sans-serif",
            pointerEvents: "none", zIndex: 10, textAlign: "center", padding: 20
          }}>
            {status}
          </div>
        )}
      </div>

      {/* Hint bar */}
      <div style={{
        padding: "8px 16px", background: "#111", color: "#444",
        fontSize: 11, fontFamily: "Inter, sans-serif",
        borderTop: "1px solid rgba(255,255,255,0.05)"
      }}>
        Drag to orbit · Scroll to zoom · Right-drag to pan · Esc to close
      </div>
    </div>
  );
}

const ctrlLabel = {
  display: "flex", alignItems: "center", gap: 4,
  color: "#888", fontSize: 11, fontFamily: "Inter, sans-serif",
  cursor: "pointer", userSelect: "none"
};
