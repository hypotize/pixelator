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
const rgbStr = ([r,g,b]) => `rgb(${r},${g},${b})`;

export default function App() {
  const [imageSrc, setImageSrc] = useState(null);
  const [processedSrc, setProcessedSrc] = useState(null);
  const [baseColors, setBaseColors] = useState([]);
  const [palette, setPalette] = useState([]);
  const [numColors, setNumColors] = useState(2);
  const [shadesPerColor, setShadesPerColor] = useState(5);
  const [outputSize, setOutputSize] = useState(750);
  const [pixelSize, setPixelSize] = useState(6);
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

  const getRandomColors = (ctx, width, height, count) => {
    function sample() {
      const x = Math.floor(Math.random() * width);
      const y = Math.floor(Math.random() * height);
      const d = ctx.getImageData(x, y, 1, 1).data;
      return [d[0], d[1], d[2]];
    }
    const colors = [];
    while (colors.length < count) {
      const c = sample();
      if (
        !colors.some(
          ([r,g,b]) => Math.hypot(r-c[0], g-c[1], b-c[2]) < 60
        )
      ) colors.push(c);
    }
    return colors;
  };

  const makeShades = (rgb, n) => {
    const [h, s, l0] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
    const minL = 0.18, maxL = 0.88, blend = 0.5;
    const arr = [];
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const targetL = minL + t * (maxL - minL);
      const L = targetL * (1 - blend) + l0 * blend;
      arr.push(hslToRgb(h, s, Math.max(0, Math.min(1, L))));
    }
    return arr;
  };

  const buildPalette = (baseCols, shades) => baseCols.flatMap(c => makeShades(c, shades).map(rgbStr));

  const processImage = async ({ rerollColors = false } = {}) => {
    if (!imageSrc || processing) return;
    setProcessing(true);
    await new Promise(r => requestAnimationFrame(() => r()));

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const img = new Image();
    img.onload = () => {
      const scale = outputSize / Math.max(img.width, img.height);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      canvas.width = w; canvas.height = h;

      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      let chosenBase = baseColors;
      if (rerollColors || baseColors.length !== numColors) {
        chosenBase = getRandomColors(ctx, w, h, numColors);
        setBaseColors(chosenBase);
      }

      const pal = buildPalette(chosenBase, shadesPerColor);
      setPalette(pal);

      const data = ctx.getImageData(0, 0, w, h).data;
      const d2 = (r1,g1,b1,r2,g2,b2)=>((r1-r2)**2+(g1-g2)**2+(b1-b2)**2);
      const lum = (r,g,b)=>0.2126*r+0.7152*g+0.0722*b;

      const px = pixelSize;
      for (let y = 0; y < h; y += px) {
        for (let x = 0; x < w; x += px) {
          const i = (y * w + x) * 4;
          const r = data[i], g = data[i+1], b = data[i+2];

          // Find nearest base color
          let nearest = 0, minDist = Infinity;
          chosenBase.forEach((c, idx) => {
            const d = d2(r,g,b, c[0], c[1], c[2]);
            if (d < minDist) { minDist = d; nearest = idx; }
          });

          const L = lum(r,g,b) / 255;
          const idxShade = Math.min(shadesPerColor - 1, Math.floor(L * shadesPerColor));
          ctx.fillStyle = pal[nearest * shadesPerColor + idxShade];
          ctx.fillRect(x, y, px, px);
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
    a.href = processedSrc; a.download = "pixelated.png"; a.click();
  };

  const canProcess = Boolean(imageSrc) && !processing;

  return (
    <div className="app">
      <h1 className="title">Pixelator</h1>

      <div className="controlsRow">
        <label className="control">
          <span className="controlLabel"># Colors <b>{numColors}</b></span>
          <input type="range" min="2" max="10" value={numColors}
                 onChange={e=>setNumColors(Number(e.target.value))}/>
        </label>

        <label className="control">
          <span className="controlLabel">Shades per color <b>{shadesPerColor}</b></span>
          <input type="range" min="1" max="5" value={shadesPerColor}
                 onChange={e=>setShadesPerColor(Number(e.target.value))}/>
        </label>

        <label className="control">
          <span className="controlLabel">Output size <b>{outputSize}px</b></span>
          <input type="range" min="300" max="1200" step="50" value={outputSize}
                 onChange={e=>setOutputSize(Number(e.target.value))}/>
        </label>

        <label className="control">
          <span className="controlLabel">Pixel size <b>{pixelSize}px</b></span>
          <input type="range" min="2" max="16" step="1" value={pixelSize}
                 onChange={e=>setPixelSize(Number(e.target.value))}/>
        </label>

        <div className="control">
          <span className="controlLabel">Upload</span>
          <label className="fileBtn">
            <input className="fileInput" type="file" accept="image/*" onChange={handleImageUpload}/>
            Choose Image
          </label>
        </div>
      </div>

      <div className="btnRow">
        <button className="btn" disabled={!canProcess}
                onClick={()=>processImage({rerollColors:false})}>
          {processing ? "Processing…" : "Pixelate"}
        </button>
        <button className="btn" disabled={!canProcess}
                onClick={()=>processImage({rerollColors:true})}>
          🎲 Re-Roll Colors
        </button>
        <button className="btn" disabled={!processedSrc} onClick={downloadPNG}>
          ⬇️ Download PNG
        </button>
      </div>

      {palette.length > 0 && (
        <div className="palette">
          <div className="paletteTitle">Palette ({numColors} × {shadesPerColor})</div>
          <div className="paletteRow">
            {palette.map((c,i)=>(
              <div key={i} className="swatch" style={{background:c}} title={c}/>
            ))}
          </div>
        </div>
      )}

      {processedSrc && (
        <div className="result">
          <img src={processedSrc} alt="Processed" />
          <p>{numColors} colors × {shadesPerColor} shades • {outputSize}px wide • pixel {pixelSize}px</p>
        </div>
      )}

      {processing && <div className="loading"><span className="loader"/> Crunching pixels…</div>}

      <canvas ref={canvasRef} hidden />
    </div>
  );
}
