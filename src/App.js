import { useState, useRef } from "react";
import "./App.css";

// --- Color helpers ---
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h, s, l];
}
function hslToRgb(h, s, l) {
  function hue2rgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  }
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}
const hex = ([r,g,b]) => `rgb(${r},${g},${b})`;

export default function App() {
  const [imageSrc, setImageSrc] = useState(null);
  const [processedSrc, setProcessedSrc] = useState(null);
  const [baseColors, setBaseColors] = useState([]);     // [[r,g,b],[r,g,b]]
  const [palette, setPalette] = useState([]);           // rgb() strings
  const [shadesPerColor, setShadesPerColor] = useState(5);
  const [outputSize, setOutputSize] = useState(750);    // slider: 300..1200
  const [pixelSize, setPixelSize] = useState(6);        // small slider for chunkiness
  const [processing, setProcessing] = useState(false);

  const canvasRef = useRef();

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImageSrc(reader.result);
    reader.readAsDataURL(file);
    setProcessedSrc(null);
    setPalette([]);
    setBaseColors([]);
  };

  const getRandomColors = (ctx, width, height) => {
    function sampleOne() {
      const x = Math.floor(Math.random() * width);
      const y = Math.floor(Math.random() * height);
      const d = ctx.getImageData(x, y, 1, 1).data;
      return [d[0], d[1], d[2]];
    }
    let c1 = sampleOne();
    let c2 = sampleOne();
    let tries = 0;
    while (tries < 20) {
      const dist = Math.hypot(c1[0]-c2[0], c1[1]-c2[1], c1[2]-c2[2]);
      if (dist > 80) break;
      c2 = sampleOne();
      tries++;
    }
    return [c1, c2];
  };

  const makeShades = (rgb, n) => {
    const [h, s, l0] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
    const minL = 0.18, maxL = 0.88;
    const arr = [];
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const blend = 0.5;
      const targetL = minL + t * (maxL - minL);
      const L = targetL * (1 - blend) + l0 * blend;
      arr.push(hslToRgb(h, s, Math.max(0, Math.min(1, L))));
    }
    return arr;
  };

  const buildPalette = (c1, c2, n) => {
    const s1 = makeShades(c1, n).map(hex);
    const s2 = makeShades(c2, n).map(hex);
    return [...s1, ...s2];
  };

  const processImage = async ({ rerollColors = false } = {}) => {
    if (!imageSrc || processing) return;
    setProcessing(true);
    // allow UI to paint disabled/loading state
    await new Promise((r) => requestAnimationFrame(() => r()));

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const img = new Image();
    img.onload = () => {
      const scale = outputSize / Math.max(img.width, img.height);
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      canvas.width = w;
      canvas.height = h;

      ctx.imageSmoothingEnabled = false; // crisp pixels
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      let chosenBase = baseColors;
      if (rerollColors || baseColors.length !== 2) {
        chosenBase = getRandomColors(ctx, w, h);
        setBaseColors(chosenBase);
      }

      const pal = buildPalette(chosenBase[0], chosenBase[1], shadesPerColor);
      setPalette(pal);

      const shades1 = pal.slice(0, shadesPerColor);
      const shades2 = pal.slice(shadesPerColor);

      const data = ctx.getImageData(0, 0, w, h).data;
      const dist2 = (r1,g1,b1,r2,g2,b2) => {
        const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
        return dr*dr + dg*dg + db*db;
      };
      const lum = (r,g,b) => 0.2126*r + 0.7152*g + 0.0722*b;

      for (let y = 0; y < h; y += pixelSize) {
        for (let x = 0; x < w; x += pixelSize) {
          const i = (y * w + x) * 4;
          const r = data[i], g = data[i+1], b = data[i+2];

          const d1 = dist2(r,g,b, chosenBase[0][0], chosenBase[0][1], chosenBase[0][2]);
          const d2 = dist2(r,g,b, chosenBase[1][0], chosenBase[1][1], chosenBase[1][2]);
          const useFirst = d1 <= d2;

          const L = lum(r,g,b) / 255;
          const idx = Math.min(shadesPerColor - 1, Math.max(0, Math.floor(L * shadesPerColor)));
          ctx.fillStyle = useFirst ? shades1[idx] : shades2[idx];
          ctx.fillRect(x, y, pixelSize, pixelSize);
        }
      }

      setProcessedSrc(canvas.toDataURL("image/png"));
      setProcessing(false);
    };
    img.onerror = () => setProcessing(false);
    img.src = imageSrc;
  };

  const downloadPNG = () => {
    if (!processedSrc) return;
    const a = document.createElement("a");
    a.href = processedSrc;
    a.download = "pixelated.png";
    a.click();
  };

  const canProcess = Boolean(imageSrc) && !processing;

  return (
    <div className="min-h-screen bg-neutral-900 text-white flex flex-col items-center p-6 gap-4">
      <h1 className="text-2xl font-bold tracking-tight">🎨 Two-Color Pixelator (Shades + Slider)</h1>

      {/* Controls */}
      <div className="w-full max-w-3xl grid sm:grid-cols-2 gap-4">
        <div className="flex items-center justify-between gap-3 bg-neutral-800/60 rounded-xl p-4">
          <div className="text-sm opacity-80">
            <div className="font-semibold">Upload</div>
            <div className="opacity-70">Pick a photo to pixelate</div>
          </div>
          <label className="cursor-pointer bg-neutral-700 hover:bg-neutral-600 active:scale-[0.98] px-3 py-2 rounded-lg transition">
            <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
            Choose Image
          </label>
        </div>

        <div className="bg-neutral-800/60 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Shades per color</span>
            <span className="text-sm opacity-80">{shadesPerColor}</span>
          </div>
          <input
            type="range"
            min="1"
            max="5"
            value={shadesPerColor}
            onChange={(e) => setShadesPerColor(Number(e.target.value))}
            className="w-full mt-2 accent-white"
          />
        </div>

        <div className="bg-neutral-800/60 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Output size (long edge)</span>
            <span className="text-sm opacity-80">{outputSize}px</span>
          </div>
          <input
            type="range"
            min="300"
            max="1200"
            step="50"
            value={outputSize}
            onChange={(e) => setOutputSize(Number(e.target.value))}
            className="w-full mt-2 accent-white"
          />
        </div>

        <div className="bg-neutral-800/60 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Pixel size (chunkiness)</span>
            <span className="text-sm opacity-80">{pixelSize}px</span>
          </div>
          <input
            type="range"
            min="2"
            max="16"
            step="1"
            value={pixelSize}
            onChange={(e) => setPixelSize(Number(e.target.value))}
            className="w-full mt-2 accent-white"
          />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          disabled={!canProcess}
          onClick={() => processImage({ rerollColors: false })}
          className={`px-4 py-2 rounded-lg transition ${
            canProcess
              ? "bg-blue-500 hover:bg-blue-600 active:scale-[0.98]"
              : "bg-blue-500/40 cursor-not-allowed"
          }`}
        >
          {processing ? "Processing…" : "Pixelate"}
        </button>
        <button
          disabled={!canProcess}
          onClick={() => processImage({ rerollColors: true })}
          className={`px-4 py-2 rounded-lg transition ${
            canProcess
              ? "bg-amber-500 hover:bg-amber-600 active:scale-[0.98]"
              : "bg-amber-500/40 cursor-not-allowed"
          }`}
        >
          🎲 Re-Roll Colors
        </button>
        <button
          disabled={!processedSrc}
          onClick={downloadPNG}
          className={`px-4 py-2 rounded-lg transition ${
            processedSrc
              ? "bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98]"
              : "bg-emerald-500/40 cursor-not-allowed"
          }`}
        >
          ⬇️ Download PNG
        </button>
      </div>

      {/* Palette preview */}
      {palette.length > 0 && (
        <div className="w-full max-w-3xl bg-neutral-800/60 rounded-xl p-4">
          <div className="text-sm mb-2 opacity-80">Palette (2 × {shadesPerColor} shades)</div>
          <div className="flex gap-2">
            <div className="flex gap-1">{palette.slice(0, shadesPerColor).map((c, i) => (
              <div key={`c1-${i}`} className="w-6 h-6 rounded border border-white/20" style={{ background: c }} title={c} />
            ))}</div>
            <div className="flex gap-1">{palette.slice(shadesPerColor).map((c, i) => (
              <div key={`c2-${i}`} className="w-6 h-6 rounded border border-white/20" style={{ background: c }} title={c} />
            ))}</div>
          </div>
        </div>
      )}

      {/* Result */}
      {processedSrc && (
        <div className="mt-2">
          <img
            src={processedSrc}
            alt="Processed"
            className="max-w-full border-2 border-white/30 rounded-lg shadow-lg transition"
          />
          <p className="mt-2 text-sm opacity-80 text-center">
            Long edge ≈ {outputSize}px · {shadesPerColor} shades/color · pixel size {pixelSize}px
          </p>
        </div>
      )}

      {/* Loading indicator */}
      {processing && (
        <div className="text-sm opacity-80 flex items-center gap-2">
          <span className="loader" /> Crunching pixels…
        </div>
      )}

      <canvas ref={canvasRef} hidden />
    </div>
  );
}
