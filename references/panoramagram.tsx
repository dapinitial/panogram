import { useState, useRef, useEffect } from "react";

const ICON_SRC = "data:image/png;base64,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";

const TYPES = [
  { id:"panoramic_photo", icon:"🖼", label:"Panoramic Photo" },
  { id:"360_photo",       icon:"🌐", label:"360° Photo" },
  { id:"360_video",       icon:"🎥", label:"360° Video" },
  { id:"180_photo",       icon:"◑",  label:"180° Photo" },
  { id:"180_video",       icon:"▶",  label:"180° Video" },
];
const BL = { panoramic_photo:"Panoramic", "360_photo":"360° Photo", "360_video":"360° Video", "180_photo":"180° Photo", "180_video":"180° Video" };
const BC = { panoramic_photo:"panoramic", "360_photo":"immersive", "360_video":"immersive", "180_photo":"immersive", "180_video":"immersive" };
const fmt = n => n >= 1000 ? (n/1000).toFixed(1)+"k" : String(n);
const isVid = t => t?.includes("video");

const USERS = [
  { id:1, handle:"aiko.vista",  initials:"A", grad:"linear-gradient(135deg,#FF6B35,#E040A0)" },
  { id:2, handle:"marcos.360",  initials:"M", grad:"linear-gradient(135deg,#FF4D6D,#7C3AED)" },
  { id:3, handle:"sol.panoram", initials:"S", grad:"linear-gradient(135deg,#E040A0,#FF6B35)" },
  { id:4, handle:"drift.lens",  initials:"D", grad:"linear-gradient(135deg,#7C3AED,#E040A0)" },
  { id:5, handle:"yuki.sphere", initials:"Y", grad:"linear-gradient(135deg,#FF6B35,#7C3AED)" },
];

const POSTS = [
  { id:1, user:USERS[0], title:"Shinjuku at 3am",        location:"Tokyo, Japan",            type:"panoramic_photo", aspect:"3/1",  bg:"linear-gradient(135deg,#0d0000,#3a0010 50%,#6b0030)", likes:842,  comments:31,  saves:119 },
  { id:2, user:USERS[1], title:"Lava Flow — Big Island",  location:"Hawaii, USA",             type:"180_video",       aspect:"16/9", bg:"linear-gradient(135deg,#1a0000,#7b1400 50%,#ff4400)", likes:2104, comments:87,  saves:340 },
  { id:3, user:USERS[2], title:"Patagonia Sky",           location:"Torres del Paine, Chile", type:"360_photo",       aspect:"2/1",  bg:"linear-gradient(180deg,#000d1f,#00224d 50%,#003880)", likes:1567, comments:54,  saves:288 },
  { id:4, user:USERS[3], title:"Sahara Dunes Sunset",     location:"Morocco",                 type:"panoramic_photo", aspect:"3/1",  bg:"linear-gradient(135deg,#2a0c00,#a84000 60%,#ffb020)", likes:3201, comments:142, saves:521 },
  { id:5, user:USERS[4], title:"Cherry Blossom Canopy",   location:"Kyoto, Japan",            type:"360_photo",       aspect:"2/1",  bg:"linear-gradient(135deg,#200010,#8b1050 55%,#ffb0c8)", likes:4802, comments:203, saves:874 },
  { id:6, user:USERS[0], title:"Coastal Fog — Big Sur",   location:"California, USA",         type:"panoramic_photo", aspect:"3/1",  bg:"linear-gradient(180deg,#060c14,#142032 55%,#3a6080)", likes:987,  comments:44,  saves:166 },
  { id:7, user:USERS[1], title:"Milky Way Core",          location:"Atacama Desert, Chile",   type:"360_photo",       aspect:"2/1",  bg:"linear-gradient(135deg,#000008,#040018 50%,#0c0030)", likes:6120, comments:301, saves:1204},
  { id:8, user:USERS[2], title:"Venice Canals at Dawn",   location:"Venice, Italy",           type:"180_video",       aspect:"16/9", bg:"linear-gradient(135deg,#04101c,#0c2040 50%,#d4903a)", likes:1843, comments:67,  saves:312 },
  { id:9, user:USERS[3], title:"Grand Canyon Rim",        location:"Arizona, USA",            type:"panoramic_photo", aspect:"3/1",  bg:"linear-gradient(135deg,#1a0800,#6b2000 50%,#c86020)", likes:2890, comments:98,  saves:445 },
  { id:10,user:USERS[4], title:"Northern Lights",         location:"Iceland",                 type:"360_video",       aspect:"2/1",  bg:"linear-gradient(135deg,#000810,#003020 50%,#00c060)", likes:5540, comments:231, saves:980 },
];

const TAGS = ["Nature","Architecture","Urban","Nightscape","Underwater","Aerial","Wildlife","Astrophotography","Documentary","Abstract"];

const IHeart = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="13" height="13"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>;
const IChat = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="13" height="13"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
const IBook = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="13" height="13"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>;
const IMoon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>;
const ISun  = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>;

function Styles({ dark }) {
  const d = dark;
  return <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@300;400;500;600;700;800;900&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --brand-orange: #FF6B35; --brand-coral: #FF4D6D; --brand-pink: #E040A0; --brand-purple: #7C3AED;
      --brand-grad: linear-gradient(135deg, #FF6B35 0%, #FF4D6D 35%, #E040A0 65%, #7C3AED 100%);
      --bg:       ${d ? "#0d0d0f"             : "#f5f4f2"};
      --surface:  ${d ? "#161619"             : "#ffffff"};
      --surface2: ${d ? "#1e1e23"             : "#f0eeeb"};
      --surface3: ${d ? "#26262c"             : "#e4e2de"};
      --border:   ${d ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)"};
      --border2:  ${d ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"};
      --text:     ${d ? "#f0f0f5"             : "#18181b"};
      --text2:    ${d ? "#9090a0"             : "#6b6b78"};
      --text3:    ${d ? "#58586a"             : "#a0a0b0"};
      --nav-bg:   ${d ? "rgba(13,13,15,0.88)" : "rgba(245,244,242,0.88)"};
      --radius-sm: 10px; --radius: 16px; --radius-lg: 22px; --nav-h: 72px;
      --font: 'Nunito', sans-serif;
    }
    html { scroll-behavior: smooth; }
    body { background: var(--bg); color: var(--text); font-family: var(--font); -webkit-font-smoothing: antialiased; transition: background 0.25s, color 0.25s; }
    ::-webkit-scrollbar { width: 3px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: var(--surface3); border-radius: 2px; }

    .nav { position: fixed; top: 0; left: 0; right: 0; z-index: 100; height: var(--nav-h); background: var(--nav-bg); backdrop-filter: blur(20px) saturate(180%); border-bottom: 1px solid var(--border); display: flex; align-items: center; padding: 0 20px; transition: background 0.25s; }
    .nav-logo { display: flex; align-items: center; gap: 10px; cursor: pointer; flex-shrink: 0; line-height: 0; }
    .nav-logo img { height: 40px; width: auto; display: block; }
    .nav-logo-wordmark { font-family: var(--font); font-size: 20px; font-weight: 700; letter-spacing: -0.03em; color: var(--text); line-height: 1; display: block; }
    .nav-tabs { display: flex; gap: 2px; margin: 0 auto; }
    .nav-tab { padding: 7px 18px; border-radius: 10px; font-family: var(--font); font-size: 13px; font-weight: 600; color: var(--text2); border: none; background: none; cursor: pointer; transition: all 0.18s; }
    .nav-tab:hover { color: var(--text); background: var(--surface2); }
    .nav-tab.active { color: var(--text); background: var(--surface2); }
    .nav-tab.active span { background: var(--brand-grad); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .nav-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
    .btn-upload { display: flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 10px; background: var(--brand-grad); border: none; font-family: var(--font); font-size: 13px; font-weight: 700; color: #fff; cursor: pointer; transition: opacity 0.18s, transform 0.18s; }
    .btn-upload:hover { opacity: 0.88; transform: translateY(-1px); }
    .btn-mode { width: 34px; height: 34px; border-radius: 50%; border: 1px solid var(--border2); background: var(--surface2); color: var(--text2); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.18s; }
    .btn-mode:hover { border-color: var(--brand-pink); color: var(--brand-pink); }
    .nav-avatar { width: 34px; height: 34px; border-radius: 50%; background: var(--brand-grad); display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 800; color: #fff; cursor: pointer; border: 2px solid transparent; transition: border-color 0.18s; }
    .nav-avatar:hover { border-color: var(--brand-pink); }

    .main { padding-top: var(--nav-h); min-height: 100vh; }

    .feed { max-width: 1140px; margin: 0 auto; padding: 36px 20px; }
    .feed-hero { margin-bottom: 32px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 32px 36px; position: relative; overflow: hidden; }
    .feed-hero::after { content: ''; position: absolute; top: -60px; right: -60px; width: 280px; height: 280px; border-radius: 50%; background: radial-gradient(circle, rgba(224,64,160,0.10) 0%, transparent 70%); pointer-events: none; }
    .feed-hero-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--brand-coral); margin-bottom: 8px; }
    .feed-hero-title { font-size: 28px; font-weight: 800; color: var(--text); letter-spacing: -0.03em; line-height: 1.2; margin-bottom: 6px; }
    .feed-hero-sub { font-size: 13px; color: var(--text2); }

    .filters { display: flex; gap: 8px; margin-bottom: 28px; flex-wrap: wrap; }
    .filter { padding: 6px 15px; border-radius: 20px; border: 1px solid var(--border2); font-family: var(--font); font-size: 12px; font-weight: 600; color: var(--text2); background: none; cursor: pointer; transition: all 0.18s; }
    .filter:hover { border-color: rgba(224,64,160,0.5); color: var(--text); }
    .filter.active { background: var(--brand-grad); border-color: transparent; color: #fff; }

    .grid { columns: 3; column-gap: 14px; }
    @media (max-width: 860px) { .grid { columns: 2; } }
    @media (max-width: 520px) { .grid { columns: 1; } }

    .card { break-inside: avoid; margin-bottom: 14px; border-radius: var(--radius); overflow: hidden; background: var(--surface); border: 1px solid var(--border); cursor: pointer; transition: transform 0.22s cubic-bezier(.34,1.56,.64,1), box-shadow 0.22s, border-color 0.22s; }
    .card:hover { transform: translateY(-4px) scale(1.005); box-shadow: 0 20px 50px rgba(0,0,0,0.15), 0 0 0 1px rgba(255,77,109,0.2); border-color: rgba(255,77,109,0.3); }
    .card-thumb { width: 100%; position: relative; overflow: hidden; }
    .card-thumb-bg { width: 100%; height: 100%; display: block; transition: transform 0.4s ease; }
    .card:hover .card-thumb-bg { transform: scale(1.04); }
    .card-badge { position: absolute; top: 10px; left: 10px; padding: 3px 9px; border-radius: 6px; background: rgba(0,0,0,0.55); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.15); font-size: 9.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #fff; }
    .card-badge.panoramic { color: #FFD580; }
    .card-badge.immersive { color: #FF9EC4; }
    .card-body { padding: 13px 15px 15px; }
    .card-top { display: flex; align-items: center; gap: 8px; margin-bottom: 9px; }
    .card-av { width: 27px; height: 27px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; color: #fff; flex-shrink: 0; }
    .card-handle { font-size: 11.5px; font-weight: 600; color: var(--text2); }
    .card-title { font-size: 15px; font-weight: 700; color: var(--text); letter-spacing: -0.02em; line-height: 1.3; margin-bottom: 5px; }
    .card-loc { font-size: 11px; color: var(--text3); font-weight: 500; }
    .card-actions { display: flex; margin-top: 12px; padding-top: 11px; border-top: 1px solid var(--border); }
    .card-action { flex: 1; display: flex; align-items: center; justify-content: center; gap: 5px; font-family: var(--font); font-size: 11.5px; font-weight: 600; color: var(--text3); border: none; background: none; cursor: pointer; padding: 4px 0; border-radius: 7px; transition: color 0.15s, background 0.15s; }
    .card-action:hover { color: var(--text); background: var(--surface2); }
    .card-action.on-heart { color: #FF4D6D; } .card-action.on-save { color: var(--brand-purple); }
    .card-action svg { width: 13px; height: 13px; }

    .viewer { position: fixed; inset: 0; z-index: 200; background: ${d ? "rgba(8,8,10,0.98)" : "rgba(245,244,242,0.98)"}; display: flex; flex-direction: column; animation: vIn 0.2s ease; }
    @keyframes vIn { from { opacity:0; transform:scale(0.98); } to { opacity:1; transform:scale(1); } }
    .viewer-bar { display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; border-bottom: 1px solid var(--border); }
    .viewer-bar-left { display: flex; align-items: center; gap: 12px; }
    .viewer-bar-left img { height: 30px; width: auto; }
    .viewer-info-title { font-size: 16px; font-weight: 700; color: var(--text); letter-spacing: -0.02em; }
    .viewer-info-sub { font-size: 11px; color: var(--text2); font-weight: 500; margin-top: 1px; }
    .viewer-close { width: 34px; height: 34px; border-radius: 50%; border: 1px solid var(--border2); background: var(--surface2); color: var(--text2); font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s; }
    .viewer-close:hover { background: rgba(255,77,109,0.1); border-color: #FF4D6D; color: #FF4D6D; }
    .viewer-stage { flex: 1; position: relative; overflow: hidden; cursor: grab; display: flex; align-items: center; justify-content: center; }
    .viewer-stage:active { cursor: grabbing; }
    .viewer-scene { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
    .viewer-placeholder { text-align: center; pointer-events: none; user-select: none; }
    .viewer-placeholder-title { font-size: clamp(28px,5vw,64px); font-weight: 800; letter-spacing: -0.04em; background: var(--brand-grad); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 8px; }
    .viewer-placeholder-sub { font-size: 13px; color: var(--text3); font-weight: 500; }
    .viewer-hint { position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%); padding: 7px 18px; border-radius: 20px; background: rgba(0,0,0,0.6); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.15); font-size: 11px; color: #fff; font-weight: 600; white-space: nowrap; animation: hFade 3.5s ease forwards; pointer-events: none; }
    @keyframes hFade { 0%,60%{opacity:1} 100%{opacity:0} }
    .viewer-footer { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 14px 20px; border-top: 1px solid var(--border); }
    .v-ctrl { padding: 7px 16px; border-radius: 9px; border: 1px solid var(--border2); background: var(--surface2); font-family: var(--font); font-size: 12px; font-weight: 600; color: var(--text2); cursor: pointer; transition: all 0.15s; }
    .v-ctrl:hover { border-color: rgba(224,64,160,0.5); color: var(--text); }
    .v-ctrl.active { background: var(--brand-grad); border-color: transparent; color: #fff; }
    .v-ctrl-play { padding: 7px 20px; background: var(--brand-grad); border: none; border-radius: 9px; font-family: var(--font); font-size: 12px; font-weight: 700; color: #fff; cursor: pointer; transition: opacity 0.15s; }
    .v-ctrl-play:hover { opacity: 0.85; }

    .overlay { position: fixed; inset: 0; z-index: 150; background: ${d ? "rgba(8,8,10,0.92)" : "rgba(245,244,242,0.92)"}; display: flex; align-items: center; justify-content: center; padding: 20px; animation: vIn 0.2s ease; }
    .modal { background: var(--surface); border: 1px solid var(--border2); border-radius: var(--radius-lg); width: 100%; max-width: 520px; max-height: 92vh; overflow-y: auto; }
    .modal-head { padding: 22px 24px 18px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 12px; }
    .modal-head img { height: 30px; width: auto; }
    .modal-head-right { flex: 1; }
    .modal-head-title { font-size: 17px; font-weight: 800; color: var(--text); letter-spacing: -0.02em; }
    .modal-head-sub { font-size: 12px; color: var(--text2); font-weight: 500; }
    .modal-head-close { margin-left: auto; width: 30px; height: 30px; border-radius: 50%; border: 1px solid var(--border2); background: none; color: var(--text2); cursor: pointer; font-size: 15px; display: flex; align-items: center; justify-content: center; transition: all 0.15s; }
    .modal-head-close:hover { border-color: #FF4D6D; color: #FF4D6D; }
    .modal-body { padding: 22px 24px; display: flex; flex-direction: column; gap: 18px; }
    .dropzone { border: 2px dashed var(--border2); border-radius: var(--radius); padding: 36px 20px; text-align: center; cursor: pointer; transition: all 0.2s; background: var(--surface2); }
    .dropzone:hover, .dropzone.over { border-color: var(--brand-pink); background: rgba(224,64,160,0.04); }
    .dropzone-icon { font-size: 36px; margin-bottom: 10px; }
    .dropzone-title { font-size: 15px; font-weight: 700; color: var(--text); margin-bottom: 5px; }
    .dropzone-sub { font-size: 11.5px; color: var(--text2); line-height: 1.7; }
    .dropzone-tags { display: flex; justify-content: center; gap: 6px; margin-top: 12px; flex-wrap: wrap; }
    .dtag { padding: 3px 9px; border-radius: 5px; font-size: 9.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
    .dtag.img { background: rgba(255,179,71,0.15); color: #c87800; border: 1px solid rgba(255,179,71,0.3); }
    .dtag.vid { background: rgba(255,77,109,0.15); color: #FF4D6D; border: 1px solid rgba(255,77,109,0.3); }
    .type-grid { display: grid; grid-template-columns: repeat(5,1fr); gap: 8px; }
    .type-opt { padding: 10px 4px; border-radius: 10px; border: 1.5px solid var(--border2); background: var(--surface2); text-align: center; cursor: pointer; transition: all 0.15s; }
    .type-opt:hover { border-color: rgba(224,64,160,0.4); }
    .type-opt.sel { border-color: var(--brand-pink); background: rgba(224,64,160,0.08); }
    .type-icon { font-size: 18px; margin-bottom: 5px; }
    .type-label { font-size: 9px; font-weight: 700; color: var(--text2); line-height: 1.3; }
    .type-opt.sel .type-label { color: var(--brand-pink); }
    .fld { display: flex; flex-direction: column; gap: 6px; }
    .fld-label { font-size: 11px; font-weight: 700; color: var(--text3); letter-spacing: 0.04em; text-transform: uppercase; }
    .fld input, .fld textarea { background: var(--surface2); border: 1.5px solid var(--border2); border-radius: 10px; padding: 10px 13px; font-family: var(--font); font-size: 13px; font-weight: 500; color: var(--text); outline: none; width: 100%; transition: border-color 0.15s; }
    .fld input:focus, .fld textarea:focus { border-color: var(--brand-pink); }
    .fld textarea { resize: vertical; min-height: 68px; }
    .modal-foot { padding: 0 24px 22px; display: flex; gap: 10px; justify-content: flex-end; }
    .btn-sec { padding: 10px 18px; border-radius: 10px; border: 1.5px solid var(--border2); background: none; font-family: var(--font); font-size: 13px; font-weight: 600; color: var(--text2); cursor: pointer; transition: all 0.15s; }
    .btn-sec:hover { border-color: rgba(255,255,255,0.2); color: var(--text); }
    .btn-pri { padding: 10px 22px; border-radius: 10px; background: var(--brand-grad); border: none; font-family: var(--font); font-size: 13px; font-weight: 700; color: #fff; cursor: pointer; transition: opacity 0.15s; }
    .btn-pri:hover { opacity: 0.88; }

    .explore { max-width: 1140px; margin: 0 auto; padding: 36px 20px; }
    .explore-banner { border-radius: var(--radius-lg); background: var(--surface); border: 1px solid var(--border); padding: 44px 40px; margin-bottom: 36px; position: relative; overflow: hidden; }
    .explore-banner::before { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse at 80% 50%, rgba(224,64,160,0.10) 0%, rgba(124,58,237,0.07) 40%, transparent 70%); pointer-events: none; }
    .explore-banner::after { content: '◎'; position: absolute; right: 36px; top: 50%; transform: translateY(-50%); font-size: 110px; line-height: 1; background: var(--brand-grad); -webkit-background-clip: text; -webkit-text-fill-color: transparent; opacity: 0.15; pointer-events: none; }
    .explore-label { font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--brand-coral); margin-bottom: 10px; }
    .explore-title { font-size: 36px; font-weight: 800; color: var(--text); letter-spacing: -0.04em; line-height: 1.15; margin-bottom: 8px; }
    .explore-sub { font-size: 13px; color: var(--text2); max-width: 360px; line-height: 1.7; margin-bottom: 22px; }
    .search-row { display: flex; max-width: 380px; }
    .search-input { flex: 1; padding: 10px 14px; background: var(--surface2); border: 1.5px solid var(--border2); border-right: none; border-radius: 10px 0 0 10px; font-family: var(--font); font-size: 13px; font-weight: 500; color: var(--text); outline: none; transition: border-color 0.15s; }
    .search-input:focus { border-color: var(--brand-pink); }
    .search-btn { padding: 10px 18px; border-radius: 0 10px 10px 0; background: var(--brand-grad); border: none; font-family: var(--font); font-size: 13px; font-weight: 700; color: #fff; cursor: pointer; }
    .section-head { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text3); margin-bottom: 14px; }
    .tags { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 30px; }
    .tag { padding: 6px 14px; border-radius: 20px; border: 1px solid var(--border2); background: var(--surface); font-family: var(--font); font-size: 12px; font-weight: 600; color: var(--text2); cursor: pointer; transition: all 0.15s; }
    .tag:hover { border-color: var(--brand-pink); color: var(--brand-pink); background: rgba(224,64,160,0.06); }

    .profile { max-width: 840px; margin: 0 auto; padding: 40px 20px; }
    .prof-hero { display: flex; gap: 28px; align-items: flex-start; padding-bottom: 36px; margin-bottom: 36px; border-bottom: 1px solid var(--border); }
    .prof-av { width: 86px; height: 86px; border-radius: 50%; background: var(--brand-grad); display: flex; align-items: center; justify-content: center; font-size: 30px; font-weight: 800; color: #fff; flex-shrink: 0; }
    .prof-name { font-size: 24px; font-weight: 800; color: var(--text); letter-spacing: -0.03em; margin-bottom: 3px; }
    .prof-handle { font-size: 13px; color: var(--text3); font-weight: 500; margin-bottom: 10px; }
    .prof-bio { font-size: 13px; color: var(--text2); line-height: 1.7; margin-bottom: 18px; max-width: 400px; }
    .prof-stats { display: flex; gap: 24px; }
    .pstat-n { font-size: 20px; font-weight: 800; color: var(--text); letter-spacing: -0.03em; }
    .pstat-l { font-size: 10.5px; color: var(--text3); font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; }
    .prof-follow { padding: 9px 22px; border-radius: 10px; border: 1.5px solid var(--border2); background: none; font-family: var(--font); font-size: 13px; font-weight: 700; color: var(--text); cursor: pointer; transition: all 0.15s; align-self: flex-start; flex-shrink: 0; }
    .prof-follow:hover { background: var(--brand-grad); border-color: transparent; color: #fff; }
    .prof-grid { columns: 3; column-gap: 12px; }
    @media (max-width: 640px) { .prof-grid { columns: 2; } .prof-hero { flex-wrap: wrap; } }
    .empty { text-align: center; padding: 72px 20px; }
    .empty-icon { font-size: 44px; margin-bottom: 14px; opacity: 0.35; }
    .empty-title { font-size: 20px; font-weight: 800; color: var(--text); letter-spacing: -0.02em; margin-bottom: 6px; }
    .empty-sub { font-size: 13px; color: var(--text2); font-weight: 500; }
  `}</style>;
}

function Viewer({ post, dark, onClose }) {
  const [off,setOff]=useState({x:0,y:0}); const [drag,setDrag]=useState(false);
  const [s,setS]=useState({x:0,y:0}); const [zoom,setZoom]=useState(1); const [hint,setHint]=useState(true);
  useEffect(()=>{ const t=setTimeout(()=>setHint(false),3500); return ()=>clearTimeout(t); },[]);
  const px=e=>e.touches?e.touches[0].clientX:e.clientX;
  const py=e=>e.touches?e.touches[0].clientY:e.clientY;
  const maxX=post.type?.includes("360")?640:280;
  const dn=e=>{setDrag(true);setS({x:px(e)-off.x,y:py(e)-off.y});};
  const mv=e=>{if(!drag)return;setOff({x:Math.max(-maxX,Math.min(maxX,px(e)-s.x)),y:Math.max(-160,Math.min(160,py(e)-s.y))});};
  const up=()=>setDrag(false);
  return (
    <div className="viewer">
      <div className="viewer-bar">
        <div className="viewer-bar-left">
          <img src={ICON_SRC} alt="Panoramagram" />
          <div>
            <div className="viewer-info-title">{post.title}</div>
            <div className="viewer-info-sub">{BL[post.type]} · {post.location} · @{post.user.handle}</div>
          </div>
        </div>
        <button className="viewer-close" onClick={onClose}>✕</button>
      </div>
      <div className="viewer-stage" onMouseDown={dn} onMouseMove={mv} onMouseUp={up} onMouseLeave={up} onTouchStart={dn} onTouchMove={mv} onTouchEnd={up}>
        <div className="viewer-scene" style={{background:post.bg,transform:`translate(${off.x*0.38}px,${off.y*0.18}px) scale(${zoom})`,transition:drag?"none":"transform 0.1s ease-out"}}>
          <div className="viewer-placeholder">
            <div className="viewer-placeholder-title">{post.title}</div>
            <div className="viewer-placeholder-sub">📍 {post.location}</div>
          </div>
        </div>
        {hint&&<div className="viewer-hint">{post.type?.includes("360")?"⟵ Drag to explore 360° ⟶":post.type==="panoramic_photo"?"⟵ Drag to pan panorama ⟶":"⟵ Drag to pan 180° ⟶"}</div>}
      </div>
      <div className="viewer-footer">
        <button className="v-ctrl" onClick={()=>{setOff({x:0,y:0});setZoom(1);}}>Reset</button>
        {[1,1.5,2].map(z=><button key={z} className={`v-ctrl ${zoom===z?"active":""}`} onClick={()=>setZoom(z)}>{z}×</button>)}
        {isVid(post.type)&&<button className="v-ctrl-play">▶ Play Video</button>}
      </div>
    </div>
  );
}

function Card({ post, onOpen }) {
  const [liked,setLiked]=useState(false); const [saved,setSaved]=useState(false); const [likes,setLikes]=useState(post.likes);
  return (
    <div className="card" onClick={()=>onOpen(post)}>
      <div className="card-thumb" style={{aspectRatio:post.aspect}}>
        <div className="card-thumb-bg" style={{background:post.bg,height:"100%"}}/>
        <div className={`card-badge ${BC[post.type]}`}>{BL[post.type]}</div>
      </div>
      <div className="card-body">
        <div className="card-top">
          <div className="card-av" style={{background:post.user.grad}}>{post.user.initials}</div>
          <span className="card-handle">@{post.user.handle}</span>
        </div>
        <div className="card-title">{post.title}</div>
        <div className="card-loc">📍 {post.location}</div>
        <div className="card-actions">
          <button className={`card-action ${liked?"on-heart":""}`} onClick={e=>{e.stopPropagation();setLiked(l=>!l);setLikes(n=>liked?n-1:n+1);}}>
            <IHeart/> {fmt(likes)}
          </button>
          <button className="card-action" onClick={e=>e.stopPropagation()}><IChat/> {fmt(post.comments)}</button>
          <button className={`card-action ${saved?"on-save":""}`} onClick={e=>{e.stopPropagation();setSaved(s=>!s);}}>
            <IBook/> {fmt(post.saves+(saved?1:0))}
          </button>
        </div>
      </div>
    </div>
  );
}

function Upload({ onClose, onPost }) {
  const [over,setOver]=useState(false); const [file,setFile]=useState(null);
  const [mt,setMt]=useState("panoramic_photo"); const [title,setTitle]=useState("");
  const [loc,setLoc]=useState(""); const [desc,setDesc]=useState("");
  const ref=useRef();
  const BGs=["linear-gradient(135deg,#1a0030,#6b0050 50%,#ff4080)","linear-gradient(135deg,#000818,#002040 50%,#0060c0)","linear-gradient(135deg,#0d0800,#3d2000 50%,#c07000)"];
  const submit=()=>{ if(!title.trim())return; onPost({id:Date.now(),user:USERS[0],title:title.trim(),location:loc||"Unknown",type:mt,aspect:isVid(mt)?"16/9":mt==="panoramic_photo"?"3/1":mt.includes("360")?"2/1":"16/9",bg:BGs[Math.floor(Math.random()*BGs.length)],likes:0,comments:0,saves:0}); onClose(); };
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-head">
          <img src={ICON_SRC} alt="Panoramagram"/>
          <div className="modal-head-right">
            <div className="modal-head-title">Share a Panorama</div>
            <div className="modal-head-sub">Upload your immersive media</div>
          </div>
          <button className="modal-head-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className={`dropzone ${over?"over":""}`} onClick={()=>ref.current?.click()} onDragOver={e=>{e.preventDefault();setOver(true);}} onDragLeave={()=>setOver(false)} onDrop={e=>{e.preventDefault();setOver(false);setFile(e.dataTransfer.files[0]);}}>
            <input ref={ref} type="file" accept="image/*,video/*" style={{display:"none"}} onChange={e=>setFile(e.target.files[0])}/>
            <div className="dropzone-icon">{file?"✅":"⬆️"}</div>
            <div className="dropzone-title">{file?file.name:"Drop your file here"}</div>
            <div className="dropzone-sub">Click to browse · Equirectangular &amp; fisheye supported</div>
            <div className="dropzone-tags">
              <span className="dtag img">JPG</span><span className="dtag img">PNG</span><span className="dtag img">TIFF</span>
              <span className="dtag vid">MP4</span><span className="dtag vid">MOV</span><span className="dtag vid">360 VR</span>
            </div>
          </div>
          <div>
            <div className="fld-label" style={{marginBottom:8}}>Media Type</div>
            <div className="type-grid">
              {TYPES.map(t=><div key={t.id} className={`type-opt ${mt===t.id?"sel":""}`} onClick={()=>setMt(t.id)}><div className="type-icon">{t.icon}</div><div className="type-label">{t.label}</div></div>)}
            </div>
          </div>
          <div className="fld"><label className="fld-label">Title</label><input placeholder="What did you capture?" value={title} onChange={e=>setTitle(e.target.value)}/></div>
          <div className="fld"><label className="fld-label">Location</label><input placeholder="Where was this taken?" value={loc} onChange={e=>setLoc(e.target.value)}/></div>
          <div className="fld"><label className="fld-label">Description</label><textarea placeholder="Tell the story behind this panorama…" value={desc} onChange={e=>setDesc(e.target.value)}/></div>
        </div>
        <div className="modal-foot">
          <button className="btn-sec" onClick={onClose}>Cancel</button>
          <button className="btn-pri" onClick={submit}>Publish</button>
        </div>
      </div>
    </div>
  );
}

function Feed({ posts, onOpen }) {
  const [filter,setFilter]=useState("all");
  const shown=filter==="all"?posts:posts.filter(p=>p.type===filter);
  return (
    <div className="feed">
      <div className="feed-hero">
        <div className="feed-hero-eyebrow">Discover · Explore · Share</div>
        <div className="feed-hero-title">Immersive media from everywhere</div>
        <div className="feed-hero-sub">Panoramic photos, 360° &amp; 180° — all in one place.</div>
      </div>
      <div className="filters">
        {[{id:"all",label:"All"},...TYPES.map(t=>({id:t.id,label:t.label}))].map(f=>(
          <button key={f.id} className={`filter ${filter===f.id?"active":""}`} onClick={()=>setFilter(f.id)}>{f.label}</button>
        ))}
      </div>
      {shown.length===0
        ?<div className="empty"><div className="empty-icon">🌐</div><div className="empty-title">Nothing here yet</div><div className="empty-sub">Be the first to upload</div></div>
        :<div className="grid">{shown.map(p=><Card key={p.id} post={p} onOpen={onOpen}/>)}</div>}
    </div>
  );
}

function Explore({ posts, onOpen }) {
  const [q,setQ]=useState("");
  const res=q?posts.filter(p=>p.title.toLowerCase().includes(q.toLowerCase())||p.location.toLowerCase().includes(q.toLowerCase())):posts;
  return (
    <div className="explore">
      <div className="explore-banner">
        <div className="explore-label">Discover</div>
        <div className="explore-title">Find your next horizon</div>
        <div className="explore-sub">Search by destination, scene type, or creator.</div>
        <div className="search-row">
          <input className="search-input" placeholder="Tokyo, canyon, milky way…" value={q} onChange={e=>setQ(e.target.value)}/>
          <button className="search-btn">Search</button>
        </div>
      </div>
      <div className="section-head">Popular tags</div>
      <div className="tags">{TAGS.map(t=><button key={t} className="tag" onClick={()=>setQ(t)}>{t}</button>)}</div>
      <div className="section-head">{q?`Results for "${q}"`:"Trending now"}</div>
      <div className="grid">{res.map(p=><Card key={p.id} post={p} onOpen={onOpen}/>)}</div>
    </div>
  );
}

function Profile({ posts, onOpen }) {
  const mine=posts.filter(p=>p.user.id===1);
  const [following,setFollowing]=useState(false);
  return (
    <div className="profile">
      <div className="prof-hero">
        <div className="prof-av">A</div>
        <div style={{flex:1}}>
          <div className="prof-name">Aiko Vista</div>
          <div className="prof-handle">@aiko.vista</div>
          <div className="prof-bio">Shooting the world in panoramic and 360°.<br/>Based in Tokyo · Traveling endlessly.</div>
          <div className="prof-stats">
            <div><div className="pstat-n">{mine.length}</div><div className="pstat-l">Posts</div></div>
            <div><div className="pstat-n">12.4k</div><div className="pstat-l">Followers</div></div>
            <div><div className="pstat-n">340</div><div className="pstat-l">Following</div></div>
          </div>
        </div>
        <button className="prof-follow" onClick={()=>setFollowing(f=>!f)}>{following?"Following ✓":"Follow"}</button>
      </div>
      {mine.length===0
        ?<div className="empty"><div className="empty-icon">📷</div><div className="empty-title">No posts yet</div><div className="empty-sub">Upload your first panorama</div></div>
        :<div className="prof-grid">{mine.map(p=><Card key={p.id} post={p} onOpen={onOpen}/>)}</div>}
    </div>
  );
}

export default function Panoramagram() {
  const [tab,setTab]=useState("feed");
  const [posts,setPosts]=useState(POSTS);
  const [viewing,setViewing]=useState(null);
  const [uploading,setUploading]=useState(false);
  const [dark,setDark]=useState(true);

  return (
    <div style={{minHeight:"100vh",background:dark?"#0d0d0f":"#f5f4f2",transition:"background 0.25s"}}>
      <Styles dark={dark}/>
      <nav className="nav">
        <div className="nav-logo" onClick={()=>setTab("feed")}>
          <img src={ICON_SRC} alt="Panoramagram" style={{height:40,width:"auto",display:"block"}}/>
          <span className="nav-logo-wordmark">panoramagram</span>
        </div>
        <div className="nav-tabs">
          {[{id:"feed",label:"Feed"},{id:"explore",label:"Explore"},{id:"profile",label:"Profile"}].map(t=>(
            <button key={t.id} className={`nav-tab ${tab===t.id?"active":""}`} onClick={()=>setTab(t.id)}>
              {tab===t.id?<span>{t.label}</span>:t.label}
            </button>
          ))}
        </div>
        <div className="nav-right">
          <button className="btn-upload" onClick={()=>setUploading(true)}>
            <span style={{fontSize:15,lineHeight:1}}>+</span> Upload
          </button>
          <button className="btn-mode" onClick={()=>setDark(d=>!d)} title={dark?"Switch to light mode":"Switch to dark mode"}>
            {dark?<ISun/>:<IMoon/>}
          </button>
          <div className="nav-avatar" onClick={()=>setTab("profile")}>A</div>
        </div>
      </nav>
      <main className="main">
        {tab==="feed"    &&<Feed    posts={posts} onOpen={setViewing}/>}
        {tab==="explore" &&<Explore posts={posts} onOpen={setViewing}/>}
        {tab==="profile" &&<Profile posts={posts} onOpen={setViewing}/>}
      </main>
      {viewing   &&<Viewer post={viewing} dark={dark} onClose={()=>setViewing(null)}/>}
      {uploading &&<Upload onClose={()=>setUploading(false)} onPost={p=>setPosts(prev=>[p,...prev])}/>}
    </div>
  );
}
