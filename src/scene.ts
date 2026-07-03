/**
 * The on-screen scene, as a self-contained HTML page. Two hand-built SVG
 * characters (CARL the robot, JOHN the caveman) on a split lab/cave stage,
 * shot like an edited Short: an intro title card, hard cuts between close-ups,
 * push-ins, reaction cutaways, a big "slam" keyword on the reveal, drifting
 * particles, and kinetic karaoke captions.
 *
 * Everything is a pure function of time: window.__seek(t) sets the DOM state for
 * time t (camera transform, per-character mouth/blink/brightness, the caption,
 * the intro card and the slam). Headless per-frame screenshots stay perfectly
 * deterministic.
 */

export const W = 1080;
export const H = 1920;
export const FPS = 30;

export interface CueWord {
  text: string;
  start: number; // absolute seconds
  end: number;
}
export interface ScriptCue {
  speaker: "robot" | "caveman";
  start: number;
  end: number;
  words: CueWord[];
}
export interface Shot {
  start: number;
  end: number;
  cam: "wide" | "left" | "right";
  z0: number;
  z1: number;
}
export interface Emphasis {
  text: string;
  start: number;
  end: number;
}

export interface ScenePayload {
  topic: string;
  title: string;
  duration: number;
  frames: number;
  introEnd: number;
  cues: ScriptCue[];
  shots: Shot[];
  emphasis: Emphasis[];
}

const ROBOT_SVG = `
<svg viewBox="0 0 240 380" class="rig" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="rbody" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#cfe9ff"/><stop offset="0.5" stop-color="#8fb8dd"/><stop offset="1" stop-color="#5a7f9e"/>
    </linearGradient>
    <linearGradient id="rhead" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#eaf6ff"/><stop offset="1" stop-color="#9cc2df"/>
    </linearGradient>
    <radialGradient id="reye" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#eafffb"/><stop offset="0.4" stop-color="#3ff0d8"/><stop offset="1" stop-color="#0aa892"/>
    </radialGradient>
  </defs>
  <rect x="116" y="18" width="8" height="34" rx="4" fill="#6f93b0"/>
  <circle id="r-ant" cx="120" cy="16" r="12" fill="#3ff0d8"/>
  <rect x="14" y="196" width="34" height="120" rx="17" fill="url(#rbody)" stroke="#41607a" stroke-width="3"/>
  <rect x="192" y="196" width="34" height="120" rx="17" fill="url(#rbody)" stroke="#41607a" stroke-width="3"/>
  <rect x="46" y="200" width="148" height="150" rx="26" fill="url(#rbody)" stroke="#41607a" stroke-width="4"/>
  <circle cx="120" cy="262" r="20" fill="#0b2a3a" stroke="#41607a" stroke-width="3"/>
  <circle id="r-core" cx="120" cy="262" r="11" fill="#3ff0d8"/>
  <rect x="44" y="58" width="152" height="140" rx="34" fill="url(#rhead)" stroke="#41607a" stroke-width="5"/>
  <circle cx="90" cy="112" r="20" fill="url(#reye)"/>
  <circle cx="150" cy="112" r="20" fill="url(#reye)"/>
  <rect id="r-lid-l" x="68" y="90" width="44" height="44" rx="8" fill="#9cc2df"/>
  <rect id="r-lid-r" x="128" y="90" width="44" height="44" rx="8" fill="#9cc2df"/>
  <g id="r-mouth">
    <rect class="rbar" x="82"  y="150" width="10" height="20" rx="5" fill="#0b2a3a"/>
    <rect class="rbar" x="98"  y="150" width="10" height="20" rx="5" fill="#0b2a3a"/>
    <rect class="rbar" x="114" y="150" width="10" height="20" rx="5" fill="#0b2a3a"/>
    <rect class="rbar" x="130" y="150" width="10" height="20" rx="5" fill="#0b2a3a"/>
    <rect class="rbar" x="146" y="150" width="10" height="20" rx="5" fill="#0b2a3a"/>
  </g>
</svg>`;

const CAVEMAN_SVG = `
<svg viewBox="0 0 240 380" class="rig" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="cskin" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e8b183"/><stop offset="1" stop-color="#c88a56"/>
    </linearGradient>
    <linearGradient id="chair" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5b3a24"/><stop offset="1" stop-color="#3c2415"/>
    </linearGradient>
    <linearGradient id="cfur" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9c6b3f"/><stop offset="1" stop-color="#6e4426"/>
    </linearGradient>
  </defs>
  <g transform="rotate(18 210 250)">
    <rect x="196" y="150" width="26" height="150" rx="13" fill="#7c5230"/>
    <ellipse cx="209" cy="150" rx="34" ry="30" fill="#8a5c37"/>
    <circle cx="196" cy="146" r="5" fill="#5e3c22"/><circle cx="220" cy="158" r="5" fill="#5e3c22"/>
  </g>
  <path d="M52 356 L58 236 Q120 210 182 236 L188 356 Z" fill="url(#cfur)" stroke="#4d2f19" stroke-width="4"/>
  <path d="M58 236 Q120 268 182 236 L176 214 Q120 244 64 214 Z" fill="#7a5030"/>
  <rect x="96" y="196" width="48" height="40" fill="url(#cskin)"/>
  <path d="M44 150 Q40 58 120 50 Q200 58 196 150 Q196 176 178 186 Q120 150 62 186 Q44 176 44 150 Z" fill="url(#chair)"/>
  <path d="M62 130 Q60 96 120 92 Q180 96 178 130 L176 168 Q168 208 120 210 Q72 208 64 168 Z" fill="url(#cskin)"/>
  <path id="c-brow" d="M78 128 Q120 112 162 128 L160 140 Q120 126 80 140 Z" fill="#3c2415"/>
  <ellipse cx="98" cy="150" rx="13" ry="14" fill="#fff"/>
  <ellipse cx="146" cy="150" rx="13" ry="14" fill="#fff"/>
  <circle cx="100" cy="152" r="6" fill="#2a1a0e"/>
  <circle cx="144" cy="152" r="6" fill="#2a1a0e"/>
  <rect id="c-lid-l" x="83" y="134" width="30" height="32" rx="6" fill="#e0a878"/>
  <rect id="c-lid-r" x="131" y="134" width="30" height="32" rx="6" fill="#e0a878"/>
  <path d="M118 150 Q112 176 108 182 Q120 190 132 182 Q128 176 122 150 Z" fill="#c88a56"/>
  <ellipse id="c-mouth" cx="120" cy="192" rx="26" ry="8" fill="#4a2318"/>
  <rect id="c-tooth" x="112" y="186" width="12" height="12" rx="2" fill="#fff"/>
  <path d="M64 168 Q68 236 120 246 Q172 236 176 168 Q150 208 120 206 Q90 208 64 168 Z" fill="url(#chair)" opacity="0.96"/>
</svg>`;

export function pageHTML(payload: ScenePayload): string {
  const data = JSON.stringify(payload);
  return `<!doctype html><html><head><meta charset="utf-8"/>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:${W}px; height:${H}px; overflow:hidden; background:#05070d; }
  #stage {
    position:relative; width:${W}px; height:${H}px; overflow:hidden;
    font-family: "Arial Black", Arial, sans-serif;
  }
  /* #world holds everything the camera moves over (bg + characters) */
  #world {
    position:absolute; inset:0; transform-origin:0 0; will-change:transform;
    background:
      radial-gradient(120% 80% at 78% 32%, rgba(26,90,140,0.55), transparent 60%),
      radial-gradient(120% 80% at 22% 32%, rgba(150,70,20,0.55), transparent 60%),
      linear-gradient(180deg, #0e1524 0%, #131a2b 55%, #0a0f1a 100%);
  }
  #floor { position:absolute; left:0; right:0; bottom:0; height:520px;
    background: radial-gradient(90% 140% at 50% 100%, rgba(255,255,255,0.06), transparent 70%); }
  .particle { position:absolute; border-radius:50%; }

  #chars { position:absolute; top:520px; left:0; right:0; height:780px; will-change:transform; }
  .char { position:absolute; top:0; width:440px; height:700px; will-change:transform, filter; }
  .char .rig { width:100%; height:100%; display:block; filter: drop-shadow(0 26px 30px rgba(0,0,0,0.55)); }
  #caveman { left:36px; }
  #robot   { right:36px; }
  .nameplate {
    position:absolute; bottom:-6px; left:50%; transform:translateX(-50%);
    font-size:40px; font-weight:900; letter-spacing:3px; padding:8px 28px;
    border-radius:999px; color:#0a0f16; white-space:nowrap; box-shadow:0 8px 20px rgba(0,0,0,0.5);
  }
  #caveman .nameplate { background:linear-gradient(180deg,#ffbe6b,#f08a2a); }
  #robot   .nameplate { background:linear-gradient(180deg,#8ff6e6,#2fd0bb); }
  .spot { position:absolute; top:120px; left:50%; transform:translateX(-50%);
    width:520px; height:520px; border-radius:50%; opacity:0; z-index:-1; filter:blur(40px); }
  #caveman .spot { background:radial-gradient(circle, rgba(255,150,60,0.55), transparent 65%); }
  #robot   .spot { background:radial-gradient(circle, rgba(70,220,200,0.55), transparent 65%); }

  /* ---- screen-space overlays (not moved by the camera) ---- */
  #vignette { position:absolute; inset:0; box-shadow: inset 0 0 340px 90px rgba(0,0,0,0.72); pointer-events:none; }
  #topic {
    position:absolute; top:150px; left:50%; transform:translateX(-50%);
    background:linear-gradient(180deg,#ffd45a,#f4a821); color:#241a05;
    font-size:44px; font-weight:900; letter-spacing:3px; padding:16px 40px; border-radius:999px;
    box-shadow:0 10px 30px rgba(0,0,0,0.5); border:4px solid rgba(255,255,255,0.35);
  }
  #cap { position:absolute; bottom:250px; left:60px; right:60px; text-align:center; line-height:1.16; will-change:transform, opacity; }
  #speaker { font-size:44px; font-weight:900; letter-spacing:6px; margin-bottom:20px; }
  #words { font-size:74px; font-weight:900; color:#f2f6ff; text-shadow:0 4px 0 rgba(0,0,0,0.55), 0 0 26px rgba(0,0,0,0.7); }
  #words .w { display:inline-block; padding:2px 12px; border-radius:16px; }
  #handle { position:absolute; bottom:104px; left:0; right:0; text-align:center; color:#cfe0ff; opacity:0.7; font-size:32px; font-weight:900; letter-spacing:4px; }

  /* intro title card */
  #intro { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;
    text-align:center; will-change:transform, opacity; background:radial-gradient(60% 40% at 50% 44%, rgba(0,0,0,0.55), rgba(0,0,0,0.82)); }
  #intro .kick { color:#ffd45a; font-size:48px; font-weight:900; letter-spacing:12px; margin-bottom:28px; }
  #intro .big { color:#fff; font-size:104px; font-weight:900; line-height:1.02; padding:0 60px; text-shadow:0 6px 0 rgba(0,0,0,0.5), 0 0 40px rgba(60,160,255,0.35); }

  /* slam keyword */
  #slam { position:absolute; top:0; left:0; right:0; height:${H}px; display:flex; align-items:center; justify-content:center;
    pointer-events:none; opacity:0; will-change:transform, opacity; }
  #slam .box { transform:rotate(-4deg); background:linear-gradient(180deg,#ffe07a,#f5a623); color:#1a1205;
    font-size:118px; font-weight:900; letter-spacing:2px; padding:24px 48px; border-radius:28px;
    border:8px solid #fff; box-shadow:0 24px 60px rgba(0,0,0,0.6); max-width:960px; text-align:center; line-height:1; }
</style></head>
<body>
  <div id="stage">
    <div id="world">
      <div id="floor"></div>
      <div id="particles"></div>
      <div id="chars">
        <div class="char" id="caveman"><div class="spot"></div>${CAVEMAN_SVG}<div class="nameplate">JOHN</div></div>
        <div class="char" id="robot"><div class="spot"></div>${ROBOT_SVG}<div class="nameplate">CARL</div></div>
      </div>
    </div>
    <div id="topic"></div>
    <div id="cap"><div id="speaker"></div><div id="words"></div></div>
    <div id="handle">@FactBots</div>
    <div id="slam"><div class="box"></div></div>
    <div id="intro"><div class="kick">DID YOU KNOW?</div><div class="big"></div></div>
    <div id="vignette"></div>
  </div>
<script>
const DATA = ${data};
const W = ${W}, H = ${H};
const NAME = { robot: "CARL", caveman: "JOHN" };
const COLOR = { robot: "#3ff0d8", caveman: "#ff9b3d" };
document.getElementById("topic").textContent = DATA.topic;
document.querySelector("#intro .big").textContent = DATA.title;

// camera focus points (world coords). transform-origin of #world is 0,0.
const FOCUS = { wide: [540, 900], left: [256, 780], right: [824, 780] };

const el = {
  world: document.getElementById("world"),
  robot: document.getElementById("robot"),
  caveman: document.getElementById("caveman"),
  chars: document.getElementById("chars"),
  rMouth: [...document.querySelectorAll("#r-mouth .rbar")],
  cMouth: document.getElementById("c-mouth"), cTooth: document.getElementById("c-tooth"),
  rLidL: document.getElementById("r-lid-l"), rLidR: document.getElementById("r-lid-r"),
  cLidL: document.getElementById("c-lid-l"), cLidR: document.getElementById("c-lid-r"),
  rAnt: document.getElementById("r-ant"), rCore: document.getElementById("r-core"),
  rSpot: document.querySelector("#robot .spot"), cSpot: document.querySelector("#caveman .spot"),
  rPlate: document.querySelector("#robot .nameplate"), cPlate: document.querySelector("#caveman .nameplate"),
  speaker: document.getElementById("speaker"), words: document.getElementById("words"),
  topic: document.getElementById("topic"), handle: document.getElementById("handle"),
  intro: document.getElementById("intro"), slam: document.getElementById("slam"),
  slamBox: document.querySelector("#slam .box"),
};

// drifting particles (built once; positions set in __seek)
const PN = 14;
const parts = [];
const pc = document.getElementById("particles");
for (let i = 0; i < PN; i++) {
  const d = document.createElement("div");
  d.className = "particle";
  const size = 6 + (i % 4) * 5;
  d.style.width = d.style.height = size + "px";
  d.style.background = i % 2 ? "rgba(90,220,200,0.5)" : "rgba(255,160,70,0.45)";
  pc.appendChild(d);
  parts.push({ el: d, x: (i * 137) % W, base: (i * 223) % H, spd: 26 + (i % 5) * 10, size });
}

function lerp(a, b, p) { return a + (b - a) * p; }
function ease(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }
function clamp01(p) { return p < 0 ? 0 : p > 1 ? 1 : p; }
function activeCue(t) { for (const c of DATA.cues) if (t >= c.start && t < c.end) return c; return null; }
function activeShot(t) { let s = DATA.shots[0]; for (const sh of DATA.shots) if (t >= sh.start) s = sh; return s; }
function activeEmph(t) { for (const e of DATA.emphasis) if (t >= e.start && t < e.end) return e; return null; }
function envelope(t) { return 0.5 + 0.5 * Math.abs(Math.sin(t * 17) * 0.7 + Math.sin(t * 6.3) * 0.3); }
function blink(t, phase) { return ((t + phase) % 3.4) < 0.13 ? 1 : 0; }
function setLids(l, r, closed, openH) { const h = closed ? openH : 0; l.setAttribute("height", h); r.setAttribute("height", h); }

window.__seek = function (t) {
  const introT = DATA.introEnd;
  const cue = activeCue(t);
  const speaking = cue ? cue.speaker : null;

  // ---- CAMERA ----
  const shot = activeShot(t);
  const sp = clamp01((t - shot.start) / Math.max(0.001, shot.end - shot.start));
  let z = lerp(shot.z0, shot.z1, ease(sp));
  const dt = t - shot.start;
  if (dt < 0.16) z *= 1 + 0.05 * (1 - dt / 0.16); // snap "punch" on each cut
  const [fx, fy] = FOCUS[shot.cam];
  const swayX = Math.sin(t * 1.3) * 4, swayY = Math.cos(t * 1.05) * 4;
  const tx = 540 - z * fx + swayX, ty = 960 - z * fy + swayY;
  el.world.style.transform = "translate(" + tx.toFixed(2) + "px," + ty.toFixed(2) + "px) scale(" + z.toFixed(4) + ")";
  const focusChar = shot.cam === "left" ? "caveman" : shot.cam === "right" ? "robot" : null;
  // nameplates only read in the wide two-shot; in close-ups the camera would
  // drag them into the caption zone, so hide them there.
  const plateOp = shot.cam === "wide" ? "1" : "0";
  el.rPlate.style.opacity = plateOp; el.cPlate.style.opacity = plateOp;

  // character entrance during intro (slide up + settle)
  const entry = t < introT ? lerp(150, 0, ease(clamp01(t / Math.max(0.001, introT - 0.2)))) : 0;
  el.chars.style.transform = "translateY(" + entry.toFixed(1) + "px)";

  // ---- CHARACTERS ----
  function rig(key, node, bob, talkBob) {
    const talk = speaking === key;
    const inFrame = focusChar === null || focusChar === key;
    const b = talk ? Math.sin(t * talkBob) * 6 : Math.sin(t * bob) * 3;
    node.style.transform = "translateY(" + b.toFixed(1) + "px) scale(" + (talk ? 1.03 : 1) + ")";
    node.style.filter = inFrame ? "none" : "grayscale(0.35) brightness(0.55)";
    node.style.opacity = inFrame ? "1" : "0.9";
    return talk;
  }
  const rTalk = rig("robot", el.robot, 1.7, 9);
  const cTalk = rig("caveman", el.caveman, 1.5, 8.5);
  el.rSpot.style.opacity = rTalk ? (0.7 + 0.3 * Math.sin(t * 8)) : 0;
  el.cSpot.style.opacity = cTalk ? (0.7 + 0.3 * Math.sin(t * 8)) : 0;

  const rEnv = rTalk ? envelope(t) : 0;
  el.rMouth.forEach((bar, i) => {
    const h = 6 + rEnv * (10 + (i % 2 === 0 ? 22 : 12)) * (0.6 + 0.4 * Math.abs(Math.sin(t * 20 + i)));
    bar.setAttribute("height", h); bar.setAttribute("y", 160 - h / 2);
  });
  const antPulse = 0.6 + 0.4 * Math.abs(Math.sin(t * (rTalk ? 10 : 3)));
  el.rAnt.setAttribute("opacity", antPulse); el.rCore.setAttribute("opacity", antPulse);
  setLids(el.rLidL, el.rLidR, blink(t, 0.0), 44);

  const cEnv = cTalk ? envelope(t) : 0;
  el.cMouth.setAttribute("ry", 5 + cEnv * 20);
  el.cTooth.setAttribute("opacity", cEnv > 0.35 ? 1 : 0.15);
  setLids(el.cLidL, el.cLidR, blink(t, 1.7), 32);

  // ---- PARTICLES ----
  for (const p of parts) {
    const y = ((p.base - t * p.spd) % H + H) % H;
    p.el.style.left = (p.x + Math.sin((t + p.base) * 0.6) * 18).toFixed(1) + "px";
    p.el.style.top = y.toFixed(1) + "px";
    p.el.style.opacity = (0.25 + 0.25 * Math.sin(t + p.x)).toFixed(2);
  }

  // ---- INTRO CARD ----
  if (t < introT) {
    const inP = ease(clamp01(t / 0.4));
    const outP = introT - t < 0.35 ? clamp01((introT - t) / 0.35) : 1;
    el.intro.style.opacity = outP.toFixed(3);
    el.intro.style.transform = "scale(" + lerp(1.12, 1, inP).toFixed(3) + ")";
    el.intro.style.display = "flex";
    el.topic.style.opacity = "0";
  } else {
    el.intro.style.display = "none";
    el.topic.style.opacity = clamp01((t - introT) / 0.3).toFixed(3);
  }

  // ---- SLAM KEYWORD ----
  const emph = activeEmph(t);
  if (emph) {
    el.slamBox.textContent = emph.text;
    const a = t - emph.start, len = emph.end - emph.start;
    const inS = a < 0.26 ? a / 0.26 : 1;
    const pop = inS < 1 ? lerp(0.55, 1.08, ease(inS)) : (a < 0.42 ? lerp(1.08, 1, (a - 0.26) / 0.16) : 1);
    const outS = len - a < 0.25 ? clamp01((len - a) / 0.25) : 1;
    el.slam.style.opacity = outS.toFixed(3);
    el.slamBox.style.transform = "rotate(-4deg) scale(" + pop.toFixed(3) + ")";
  } else {
    el.slam.style.opacity = "0";
  }

  // ---- CAPTION (karaoke, kinetic) ----
  if (!cue) { el.speaker.textContent = ""; el.words.innerHTML = ""; el.cap && (document.getElementById("cap").style.opacity = "0"); return; }
  const capEl = document.getElementById("cap");
  const cueAge = t - cue.start;
  capEl.style.opacity = "1";
  capEl.style.transform = "scale(" + lerp(0.92, 1, ease(clamp01(cueAge / 0.16))).toFixed(3) + ")";
  const color = COLOR[cue.speaker];
  el.speaker.textContent = NAME[cue.speaker];
  el.speaker.style.color = color;
  let html = "";
  for (const w of cue.words) {
    const on = t >= w.start && t < w.end;
    html += '<span class="w" style="' +
      (on ? ("color:#0a0f16;background:" + color + ";transform:scale(1.08);") : "") + '">' +
      w.text.replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</span>";
  }
  el.words.innerHTML = html;
};

window.__seek(0);
window.__ready = true;
</script>
</body></html>`;
}
