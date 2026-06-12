"use client";
import { useEffect, useRef, useState } from "react";
import { getGDriveId } from "@/lib/utils";

// Supported formats:
// 360      — full equirectangular mono
// 180      — half equirectangular mono
// sbs      — side-by-side 3D, flat screen
// sbs360   — side-by-side 3D, 360 equirect
// sbs180   — side-by-side 3D, 180 equirect
// tb       — top-bottom 3D, flat screen
// anaglyph — red/cyan 3D on a flat screen (works without headset)

export default function VRViewer({ item, onClose }) {
  const mountRef = useRef(null);
  const stateRef = useRef({});
  const [status, setStatus] = useState("Loading video...");
  const [xrSupported, setXrSupported] = useState(false);
  const [inXR, setInXR] = useState(false);
  const [muted, setMuted] = useState(false);
  const [playing, setPlaying] = useState(true);
  const format = (item.format || "360").toLowerCase();

  useEffect(() => {
    let disposed = false;

    const init = async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      let AnaglyphEffect = null;
      if (format === "anaglyph") {
        ({ AnaglyphEffect } = await import("three/examples/jsm/effects/AnaglyphEffect.js"));
      }

      if (disposed || !mountRef.current) return;

      // ── Video element ──
      let videoUrl = item.url;
      const driveId = getGDriveId(item.url);
      if (driveId) videoUrl = `/api/file?id=${driveId}`;

      const video = document.createElement("video");
      video.src = videoUrl;
      video.crossOrigin = "anonymous";
      video.loop = true;
      video.playsInline = true;
      video.muted = false;
      video.addEventListener("canplay", () => setStatus(""));
      video.addEventListener("error", () => setStatus("Could not load video. Drive files must be shared publicly; direct URLs must allow CORS."));
      video.play().catch(() => {
        // Autoplay blocked — needs user gesture, show play state
        setPlaying(false);
        setStatus("Tap play to start");
      });

      const texture = new THREE.VideoTexture(video);
      texture.colorSpace = THREE.SRGBColorSpace;

      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x000000);
      const camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 200);
      camera.position.set(0, 0, 0.01);

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.xr.enabled = true;
      mountRef.current.appendChild(renderer.domElement);

      let effect = null;
      if (format === "anaglyph" && AnaglyphEffect) {
        effect = new AnaglyphEffect(renderer);
        effect.setSize(w, h);
      }

      // ── Build geometry per format ──
      const buildMesh = (eye) => {
        // eye: 0 = mono/left, 1 = right
        let geometry, material;
        const isSBS = format.startsWith("sbs");
        const isTB = format === "tb";
        const is360 = format === "360" || format === "sbs360";
        const is180 = format === "180" || format === "sbs180";

        if (is360 || is180) {
          const phiLength = is180 ? Math.PI : Math.PI * 2;
          geometry = new THREE.SphereGeometry(50, 64, 48, is180 ? Math.PI / 2 : 0, phiLength);
          geometry.scale(-1, 1, 1); // view from inside
        } else {
          // Flat screen floating in space
          const aspect = 16 / 9;
          geometry = new THREE.PlaneGeometry(4 * aspect, 4);
        }

        const tex = texture.clone();
        tex.colorSpace = THREE.SRGBColorSpace;

        if (isSBS) {
          tex.repeat.set(0.5, 1);
          tex.offset.set(eye === 1 ? 0.5 : 0, 0);
        } else if (isTB) {
          tex.repeat.set(1, 0.5);
          tex.offset.set(0, eye === 1 ? 0 : 0.5);
        }
        tex.needsUpdate = true;

        material = new THREE.MeshBasicMaterial({ map: tex });
        const mesh = new THREE.Mesh(geometry, material);

        if (!(is360 || is180)) mesh.position.set(0, 0, -5);

        // Eye layers for stereo: layer 1 = left eye, layer 2 = right eye in WebXR
        if (isSBS || isTB) {
          mesh.layers.set(eye === 0 ? 1 : 2);
        }
        return mesh;
      };

      const isStereo = format.startsWith("sbs") || format === "tb";
      if (isStereo && format !== "anaglyph") {
        scene.add(buildMesh(0));
        scene.add(buildMesh(1));
        // Desktop preview shows left eye only
        camera.layers.enable(1);
      } else {
        scene.add(buildMesh(0));
      }

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableZoom = false;
      controls.enablePan = false;
      controls.rotateSpeed = -0.4; // natural drag direction for inside-sphere

      stateRef.current = { THREE, scene, camera, renderer, controls, video, effect };

      // ── WebXR session support check ──
      if (navigator.xr) {
        navigator.xr.isSessionSupported("immersive-vr").then((ok) => {
          if (!disposed) setXrSupported(ok);
        });
      }

      // ── Render loop ──
      renderer.setAnimationLoop(() => {
        if (disposed) return;
        controls.update();
        if (effect && !renderer.xr.isPresenting) {
          effect.render(scene, camera);
        } else {
          renderer.render(scene, camera);
        }
      });

      const onResize = () => {
        if (!mountRef.current) return;
        const w = mountRef.current.clientWidth;
        const h = mountRef.current.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        if (effect) effect.setSize(w, h);
      };
      window.addEventListener("resize", onResize);

      stateRef.current.cleanup = () => {
        window.removeEventListener("resize", onResize);
        renderer.setAnimationLoop(null);
        video.pause();
        video.src = "";
        renderer.dispose();
        if (mountRef.current?.contains(renderer.domElement)) {
          mountRef.current.removeChild(renderer.domElement);
        }
      };
    };

    init();

    const escHandler = (e) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", escHandler);

    return () => {
      disposed = true;
      window.removeEventListener("keydown", escHandler);
      stateRef.current.cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClose = () => {
    const s = stateRef.current;
    if (s.renderer?.xr?.isPresenting) {
      s.renderer.xr.getSession()?.end();
    }
    onClose();
  };

  const enterVR = async () => {
    const s = stateRef.current;
    if (!s.renderer || !navigator.xr) return;
    try {
      const session = await navigator.xr.requestSession("immersive-vr", {
        optionalFeatures: ["local-floor", "bounded-floor", "hand-tracking"],
      });
      s.renderer.xr.setSession(session);
      setInXR(true);

      // Controller: any squeeze (grip) ends the session = exit button
      const ctrl0 = s.renderer.xr.getController(0);
      const ctrl1 = s.renderer.xr.getController(1);
      const exitVR = () => session.end();
      ctrl0.addEventListener("squeezestart", exitVR);
      ctrl1.addEventListener("squeezestart", exitVR);
      // Select (trigger) toggles play/pause
      const togglePlay = () => {
        if (s.video.paused) { s.video.play(); setPlaying(true); }
        else { s.video.pause(); setPlaying(false); }
      };
      ctrl0.addEventListener("selectstart", togglePlay);
      ctrl1.addEventListener("selectstart", togglePlay);

      session.addEventListener("end", () => setInXR(false));

      s.video.play().catch(() => {});
    } catch (e) {
      setStatus("Could not enter VR: " + e.message);
    }
  };

  const togglePlay = () => {
    const v = stateRef.current.video;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); setStatus(""); }
    else { v.pause(); setPlaying(false); }
  };

  const toggleMute = () => {
    const v = stateRef.current.video;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const formatLabels = {
    "360": "360°", "180": "180°", "sbs": "3D SBS",
    "sbs360": "3D 360°", "sbs180": "3D 180°",
    "tb": "3D Top-Bottom", "anaglyph": "Anaglyph 3D"
  };

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
          🥽 {item.title}
          <span style={{
            fontSize: 9, background: "#06B6D4", color: "#000",
            padding: "2px 8px", borderRadius: 4, fontWeight: 800, letterSpacing: 0.5
          }}>
            {formatLabels[format] || format.toUpperCase()}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={togglePlay} style={toolBtn}>
            {playing ? "⏸ Pause" : "▶ Play"}
          </button>
          <button onClick={toggleMute} style={toolBtn}>
            {muted ? "🔇 Unmute" : "🔊 Mute"}
          </button>
          {xrSupported && (
            <button onClick={enterVR} style={{
              ...toolBtn, background: "#06B6D4", color: "#000", fontWeight: 700
            }}>
              🥽 Enter VR
            </button>
          )}
          <button onClick={handleClose} style={{
            ...toolBtn, background: "rgba(255,60,60,0.2)", color: "#ff6b6b"
          }}>
            ✕ Exit
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div ref={mountRef} style={{ flex: 1, position: "relative" }}>
        {status && (
          <div style={{
            position: "absolute", inset: 0, display: "flex",
            alignItems: "center", justifyContent: "center",
            color: "#888", fontSize: 14, fontFamily: "Inter, sans-serif",
            zIndex: 10, textAlign: "center", padding: 20, pointerEvents: "none"
          }}>
            {status}
          </div>
        )}
      </div>

      {/* Hints */}
      <div style={{
        padding: "8px 16px", background: "#111", color: "#444",
        fontSize: 11, fontFamily: "Inter, sans-serif",
        borderTop: "1px solid rgba(255,255,255,0.05)",
        display: "flex", justifyContent: "space-between"
      }}>
        <span>Drag to look around · Esc to exit</span>
        {xrSupported && <span>In headset: Trigger = play/pause · Grip squeeze = exit VR</span>}
      </div>
    </div>
  );
}

const toolBtn = {
  background: "rgba(255,255,255,0.1)", border: "none",
  color: "#fff", cursor: "pointer", borderRadius: 7,
  padding: "7px 14px", fontSize: 12, fontWeight: 600,
  fontFamily: "Inter, sans-serif"
};
