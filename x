<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>HealthOrbit — OCR Intelligence Engine</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root {
  /* Original HealthOrbit Palette */
  --void: #084039;       /* Deep Teal */
  --void-soft: #0d7a6e;  /* Primary Teal */
  --paper: #f2f8f6;      /* Airy Background */
  --card: #ffffff;
  
  --ink: #0f1c1a; 
  --ink-soft: #5e736f;
  
  --coral: #ef6f5b;      /* Orbit Orange */
  --coral-soft: #fbe4de;
  
  --sage: #109485;       /* Secondary Teal */
  --sage-soft: #dff1ec;
  --mist: #42b89d;       /* Bright accent */
  
  --line: rgba(13, 122, 110, 0.15); 
  --radius: 24px;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: 'Inter', sans-serif;
  background: var(--paper);
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden;
}

.mono { font-family: 'JetBrains Mono', monospace; }

/* ---------- AMBIENT ORBS ---------- */
.ambient { position: fixed; inset: 0; pointer-events: none; z-index: 0; }
.orb { position: absolute; border-radius: 50%; filter: blur(90px); opacity: 0.35; animation: float 22s infinite alternate; }
.orb1 { width: 420px; height: 420px; background: #a3e4d7; top: -120px; left: -100px; }
.orb2 { width: 460px; height: 460px; background: #fcefc9; bottom: -140px; right: -100px; animation-delay: -6s; }
@keyframes float { 100% { transform: translate(40px, 40px) scale(1.1); } }

/* ---------- APP LAYOUT ---------- */
.shell { display: flex; width: 100vw; min-height: 100vh; position: relative; z-index: 1; }

/* ---------- TRANSPARENT SLIM SIDEBAR ---------- */
.nav {
  width: 260px; position: sticky; top: 0; height: 100vh;
  background: transparent; display: flex; flex-direction: column;
  border-right: 1px solid var(--line);
  transition: width 0.4s cubic-bezier(0.25, 1, 0.5, 1);
  overflow: hidden; z-index: 20; flex-shrink: 0;
}
.nav.collapsed { width: 78px; }
.nav.collapsed .brand-text, .nav.collapsed .link-text, .nav.collapsed .profile-info { opacity: 0; visibility: hidden; display: none; }
.nav.collapsed .navlinks a { justify-content: center; padding: 0.85rem 0; }
.nav.collapsed .profile { justify-content: center; padding: 1.5rem 0; }
.nav.collapsed .nav-header { padding: 1.8rem 0; flex-direction: column; gap: 1.5rem; justify-content: center;}
.nav.collapsed .sidebar-toggle { margin: 0 auto; }

.nav-header { display: flex; justify-content: space-between; align-items: center; padding: 1.8rem 1.4rem; }
.brand { display: flex; align-items: center; gap: 0.8rem; font-family: 'Fraunces', serif; font-weight: 700; font-size: 1.4rem; white-space: nowrap; }

.orbit-mark { position: relative; width: 28px; height: 28px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;}
.orbit-mark .ring { position: absolute; inset: 0; border-radius: 50%; border: 2px dashed var(--void-soft); animation: spin 10s linear infinite; }
.orbit-mark .ring2 { inset: 4px; border-color: var(--coral); animation: spin 8s linear infinite reverse; }
.orbit-mark .ring3 { width: 8px; height: 8px; border-radius: 50%; background: var(--void); box-shadow: 0 0 8px var(--mist); }
@keyframes spin { to { transform: rotate(360deg); } }
.txt-h { color: var(--void); } .txt-o { color: var(--coral); }

.sidebar-toggle { background: none; border: none; color: var(--ink-soft); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s; }
.sidebar-toggle:hover { color: var(--void); transform: scale(1.1); }

/* Sidebar Navigation (Scrollable for 10 items) */
.navlinks { 
    display: flex; flex-direction: column; gap: 0.2rem; 
    padding: 0 0.8rem 1rem; flex: 1; margin-top: 1rem;
    overflow-y: auto; overflow-x: hidden;
    scrollbar-width: none; -ms-overflow-style: none;
}
.navlinks::-webkit-scrollbar { width: 0px; background: transparent; }

.navlinks a { 
    text-decoration: none; color: var(--ink-soft); font-size: 0.9rem; font-weight: 600; 
    padding: 0.7rem 1rem; border-radius: 12px; display: flex; align-items: center; gap: 0.8rem; 
    transition: 0.2s; white-space: nowrap; 
}
.navlinks a .icon { font-size: 1.2rem; flex-shrink: 0; }
.navlinks a.active { background: var(--void-soft); color: #fff; box-shadow: 0 4px 12px rgba(13, 122, 110, 0.2);}
.navlinks a:hover:not(.active) { background: rgba(255,255,255,0.5); color: var(--void-soft); transform: translateX(4px);}

/* Anchored Profile */
.sidebar-footer { margin-top: auto; background: transparent; }
.profile { display: flex; align-items: center; gap: 0.8rem; padding: 1.2rem 1rem; border-top: 1px solid var(--line); white-space: nowrap; }
.profile .av { width: 38px; height: 38px; border-radius: 50%; background: var(--void); color: #fff; display: flex; align-items: center; justify-content: center; font-family: 'Fraunces', serif; font-weight: 600; font-size: 0.9rem; flex-shrink: 0; }
.profile-info strong { display: block; font-size: 0.9rem; color: var(--void); }
.profile-info span { font-size: 0.75rem; color: var(--ink-soft); }

/* ---------- MAIN CONTENT AREA ---------- */
.main { flex: 1; min-width: 0; padding: 0; display: flex; flex-direction: column; transition: 0.4s cubic-bezier(0.25, 1, 0.5, 1); }

.topbar { 
    display: flex; justify-content: space-between; align-items: center; 
    padding: 2.5rem 3.5rem 1rem; background: transparent; border-bottom: none; z-index: 10; 
}
.topbar h1 { font-family: 'Fraunces', serif; font-weight: 600; font-size: 1.8rem; color: var(--void);}
.topbar .sub { font-size: 0.85rem; color: var(--ink-soft); margin-top: 0.4rem; font-weight: 500;}
.actions { display: flex; gap: 0.8rem; }

.btn { border: none; border-radius: 999px; padding: 0.75rem 1.4rem; font-weight: 700; font-size: 0.85rem; cursor: pointer; transition: 0.2s; font-family: inherit; }
.btn.primary { background: var(--coral); color: #fff; box-shadow: 0 4px 15px rgba(239, 111, 91, 0.2);}
.btn.primary:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(239, 111, 91, 0.35); background: #d95a46;}
.btn.ghost { background: var(--card); color: var(--void); border: 1px solid var(--line); }
.btn.ghost:hover { background: var(--sage-soft); }

/* ---------- FUTURISTIC BENTO GRID ---------- */
.bento-wrapper { padding: 1rem 3.5rem 4rem; flex: 1;}
.bento { display: grid; grid-template-columns: 4fr 6fr; gap: 1.5rem; height: calc(100vh - 140px); min-height: 600px;}

/* Card Base & Mirror Shine Animation */
.card {
  background: rgba(255, 255, 255, 0.75); backdrop-filter: blur(25px) saturate(180%);
  -webkit-backdrop-filter: blur(25px) saturate(180%);
  border: 1px solid rgba(255,255,255,1); border-radius: var(--radius); padding: 2rem;
  overflow: hidden; position: relative; box-shadow: 0 10px 30px rgba(8, 64, 57, 0.05);
  transition: transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.35s;
  display: flex; flex-direction: column;
}
.card::before {
  content: ""; position: absolute; top: 0; left: -150%; width: 60%; height: 100%;
  background: linear-gradient(115deg, transparent 0%, rgba(255,255,255,0.7) 45%, transparent 90%);
  transform: skewX(-18deg); transition: left 0.7s ease; pointer-events: none; z-index: 20;
}
.card:hover { transform: translateY(-4px); box-shadow: 0 20px 40px rgba(8, 64, 57, 0.1); border-color: var(--sage-soft);}
.card:hover::before { left: 150%; }

.card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-shrink: 0;}
.card h3 { font-family: 'Fraunces', serif; font-weight: 600; font-size: 1.3rem; color: var(--void);}

/* --- LEFT PANE: HOLOGRAPHIC SCANNER --- */
.scanner-zone {
  flex: 1; border: 2px dashed var(--mist); background: rgba(223, 241, 236, 0.3);
  border-radius: 16px; padding: 2rem; display: flex; flex-direction: column; align-items: center; justify-content: center;
  position: relative; overflow: hidden; transition: 0.3s;
}

/* The Glowing Document Visualization */
.doc-mockup {
    width: 140px; height: 180px; background: #fff; border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.1);
    position: relative; padding: 15px; display: flex; flex-direction: column; gap: 8px; overflow: hidden; margin-bottom: 1.5rem;
}
.doc-line { height: 6px; background: var(--line); border-radius: 4px; }
.doc-line.title { width: 60%; height: 10px; background: var(--sage-soft); margin-bottom: 10px; }
.doc-line.short { width: 40%; }
.doc-line.med { width: 80%; }
.doc-line.highlight { background: var(--coral-soft); width: 50%; }

/* Scanning Laser Animation */
.laser-beam {
    position: absolute; left: 0; right: 0; height: 3px; background: var(--mist);
    box-shadow: 0 0 15px 5px rgba(66, 184, 157, 0.5);
    animation: scanLaser 2.5s ease-in-out infinite alternate;
}
@keyframes scanLaser { 0% { top: 0; } 100% { top: 100%; } }

.scanner-zone strong { color: var(--void); font-size: 1.15rem; z-index: 2;}
.scanner-zone span { font-size: 0.85rem; color: var(--ink-soft); max-width: 250px; text-align: center; margin-top: 0.5rem; z-index: 2;}

/* --- RIGHT PANE: EXTRACTION HUD --- */
.doc-status-bar { display: flex; align-items: center; justify-content: space-between; background: var(--void); color: #fff; padding: 1.2rem 1.5rem; border-radius: 16px; margin-bottom: 1.5rem; box-shadow: 0 8px 20px rgba(8, 64, 57, 0.15);}
.doc-title { display: flex; align-items: center; gap: 0.8rem; font-weight: 600; font-family: 'Fraunces', serif; font-size: 1.1rem;}
.pulse-badge { display: flex; align-items: center; gap: 0.5rem; background: rgba(255,255,255,0.15); padding: 0.4rem 1rem; border-radius: 999px; font-size: 0.8rem; font-weight: 700; border: 1px solid rgba(255,255,255,0.2);}
.pulse-dot-green { width: 8px; height: 8px; background: #2dd4bf; border-radius: 50%; box-shadow: 0 0 8px #2dd4bf; animation: pulseDot 2s infinite; }
@keyframes pulseDot { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; transform: scale(1.2); } }

/* Futuristic Data Rows */
.data-table { display: flex; flex-direction: column; gap: 0.8rem; flex: 1; overflow-y: auto; padding-right: 0.5rem;}
.data-table::-webkit-scrollbar { width: 4px; }
.data-table::-webkit-scrollbar-thumb { background: var(--line); border-radius: 4px; }

.data-row { display: flex; align-items: center; justify-content: space-between; padding: 1.2rem 1.5rem; background: rgba(255,255,255,0.8); border: 1px solid var(--line); border-radius: 16px; transition: 0.2s; }
.data-row:hover { background: #fff; border-color: var(--void-soft); transform: scale(1.01); box-shadow: 0 5px 15px rgba(0,0,0,0.03);}

.col-param { display: flex; flex-direction: column; gap: 0.2rem; width: 35%; }
.col-param strong { font-weight: 700; color: var(--void); font-size: 1rem;}
.col-param span { font-size: 0.75rem; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.05em;}

.col-val { width: 25%; font-family: 'JetBrains Mono', monospace; font-weight: 800; font-size: 1.4rem; color: var(--ink); display: flex; align-items: baseline; gap: 0.3rem;}
.col-val small { font-size: 0.8rem; color: var(--ink-soft); font-weight: 600; font-family: 'Inter', sans-serif;}

.col-range { width: 20%; font-size: 0.85rem; color: var(--ink-soft); font-weight: 500;}
.col-status { width: 20%; text-align: right; }

.pill { display: inline-block; padding: 0.4rem 1rem; border-radius: 999px; font-size: 0.8rem; font-weight: 700; }
.pill.good { background: var(--sage-soft); color: var(--void-soft); }
.pill.warn { background: var(--coral-soft); color: #d35400; box-shadow: 0 4px 10px rgba(243, 156, 18, 0.15);}

/* Holographic AI Insight Box */
.ai-insight { background: linear-gradient(135deg, var(--sage-soft), #ffffff); border: 1px solid var(--mist); padding: 1.5rem; border-radius: 16px; margin-top: 1.5rem; display: flex; gap: 1.2rem; align-items: flex-start; position: relative; overflow: hidden;}
.ai-insight::before { content: ''; position: absolute; top: 0; left: 0; width: 4px; height: 100%; background: var(--mist); }
.ai-icon { width: 44px; height: 44px; background: var(--void); color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; flex-shrink: 0; box-shadow: 0 0 20px rgba(66, 184, 157, 0.4); animation: float 3s ease-in-out infinite; }
.ai-text h4 { font-family: 'Fraunces', serif; color: var(--void); margin-bottom: 0.5rem; font-size: 1.15rem;}
.ai-text p { font-size: 0.95rem; color: var(--ink-soft); line-height: 1.6; }
.ai-text strong { color: var(--coral); }

/* ---------- RESPONSIVE ---------- */
@media (max-width: 1200px) {
  .bento { grid-template-columns: 1fr; height: auto; }
}
@media (max-width: 768px) {
  .shell { flex-direction: column; }
  .nav { position: relative; height: auto; width: 100%; border-right: none; border-bottom: 1px solid var(--line); padding: 1rem; background: rgba(255,255,255,0.85); backdrop-filter: blur(20px);}
  .nav.collapsed { width: 100%; } 
  .navlinks, .sidebar-footer { display: none; }
  .nav-header { padding: 0.5rem; }
  .topbar { padding: 1.2rem 1.5rem; flex-direction: column; align-items: flex-start; gap: 1rem; background: rgba(255,255,255,0.85); backdrop-filter: blur(20px);}
  .bento-wrapper { padding: 1.5rem; }
  .doc-status-bar { flex-direction: column; align-items: flex-start; gap: 1rem; }
  .data-row { flex-wrap: wrap; gap: 0.5rem; padding: 1rem;}
  .col-param { width: 100%; }
  .col-val, .col-range { width: 45%; }
  .col-status { width: 100%; text-align: left; margin-top: 0.5rem;}
}
</style>
</head>
<body>

<div class="ambient"><div class="orb orb1"></div><div class="orb orb2"></div></div>

<div class="shell">
  
  <!-- UNIVERSAL SIDEBAR WITH 10 MODULES -->
  <nav class="nav" id="sidebar">
    <div class="nav-header">
      <div class="brand">
        <div class="orbit-mark"><span class="ring"></span><span class="ring ring2"></span><span class="ring3"></span></div>
        <span class="brand-text"><span class="txt-h">Health</span><span class="txt-o">Orbit</span></span>
      </div>
      <button class="sidebar-toggle" onclick="document.getElementById('sidebar').classList.toggle('collapsed')" title="Toggle sidebar">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
      </button>
    </div>

    <!-- 10 Core Modules Mapped -->
    <div class="navlinks scroll-nav">
      <a href="/dashboard"><span class="icon">⊞</span><span class="link-text">Dashboard View</span></a>
      <a href="#"><span class="icon">👪</span><span class="link-text">Profile & Family</span></a>
      <a href="#" class="active"><span class="icon">📄</span><span class="link-text">OCR Reports</span></a>
      <a href="#"><span class="icon">🧠</span><span class="link-text">AI Analysis</span></a>
      <a href="#"><span class="icon">⌚</span><span class="link-text">Wearable Data</span></a>
      <a href="#"><span class="icon">⏱️</span><span class="link-text">Health Timeline</span></a>
      <a href="#"><span class="icon">📈</span><span class="link-text">Trends & Alerts</span></a>
      <a href="#"><span class="icon">💊</span><span class="link-text">Meds & Symptoms</span></a>
      <a href="#"><span class="icon">🪪</span><span class="link-text">Insurance & ID</span></a>
      <a href="#"><span class="icon">🤖</span><span class="link-text">AI Assistant</span></a>
      <a href="#"><span class="icon">🥗</span><span class="link-text">Nutrition & Life</span></a>
    </div>

    <div class="sidebar-footer">
      <div class="profile">
        <div class="av">AT</div>
        <div class="profile-info"><strong>Atharv D.</strong><span>Health ID Active</span></div>
      </div>
    </div>
  </nav>

  
  <!-- MAIN CONTENT -->
  <main class="main">
    
    <div class="topbar">
      <div>
        <h1>Medical Document Engine</h1>
        <div class="sub">Upload, extract, and let AI analyze your medical reports instantly.</div>
      </div>
      <div class="actions">
        <button class="btn ghost">Export Data</button>
        <button class="btn primary">View Full History</button>
      </div>
    </div>

    <div class="bento-wrapper">
      <div class="bento">

        <!-- LEFT PANE: HOLOGRAPHIC SCANNER -->
        <div class="card c-upload shine-effect">
          <div class="card-head"><h3>Document Scanner</h3></div>
          
          <div class="scanner-zone">
            <!-- Animated Document Visualization -->
            <div class="doc-mockup">
                <div class="laser-beam"></div>
                <div class="doc-line title"></div>
                <div class="doc-line med"></div>
                <div class="doc-line short"></div>
                <div style="margin-top: 10px;"></div>
                <div class="doc-line highlight"></div>
                <div class="doc-line med"></div>
                <div class="doc-line short"></div>
            </div>
            
            <strong>Drag & Drop Medical Report</strong>
            <span>Drop your PDF, JPG, or PNG here. Our OCR model will automatically extract test parameters and values.</span>
            <button class="btn primary" style="margin-top: 1.5rem; width: 100%;">Browse Files</button>
          </div>
        </div>

        <!-- RIGHT PANE: EXTRACTION HUD -->
        <div class="card c-results shine-effect">
          <div class="card-head">
              <h3>Extraction Engine</h3>
              <span style="font-size: 0.8rem; color: var(--ink-soft); font-weight: 600;">Accuracy: 99.4%</span>
          </div>

          <!-- Document Header -->
          <div class="doc-status-bar">
              <div class="doc-title">
                  <span class="icon">📄</span> Complete_Blood_Count.pdf
              </div>
              <div class="pulse-badge">
                  <span class="pulse-dot-green"></span> OCR Extraction Complete
              </div>
          </div>

          <!-- Parsed Data HUD -->
          <div class="data-table">
              
              <!-- Data Row 1 -->
              <div class="data-row">
                  <div class="col-param"><strong>Hemoglobin</strong><span>Blood Metric</span></div>
                  <div class="col-val">13.2 <small>g/dL</small></div>
                  <div class="col-range">Ref: 13.8 - 17.2</div>
                  <div class="col-status"><span class="pill warn">Low Range</span></div>
              </div>
              
              <!-- Data Row 2 -->
              <div class="data-row">
                  <div class="col-param"><strong>WBC Count</strong><span>Immune Metric</span></div>
                  <div class="col-val">7,200 <small>/µL</small></div>
                  <div class="col-range">Ref: 4,500 - 11k</div>
                  <div class="col-status"><span class="pill good">Optimal</span></div>
              </div>
              
              <!-- Data Row 3 -->
              <div class="data-row">
                  <div class="col-param"><strong>Platelets</strong><span>Clotting Metric</span></div>
                  <div class="col-val">2.4 <small>lakh</small></div>
                  <div class="col-range">Ref: 1.5 - 4.5</div>
                  <div class="col-status"><span class="pill good">Optimal</span></div>
              </div>

              <!-- Data Row 4 -->
              <div class="data-row">
                  <div class="col-param"><strong>Vitamin D (25-OH)</strong><span>Deficiency Scan</span></div>
                  <div class="col-val">18 <small>ng/mL</small></div>
                  <div class="col-range">Ref: 20 - 50</div>
                  <div class="col-status"><span class="pill warn">Deficient</span></div>
              </div>
          </div>

          <!-- AI Summary Insight (Module 3 Integration) -->
          <div class="ai-insight">
              <div class="ai-icon">✨</div>
              <div class="ai-text">
                  <h4>AI Medical Analyst Insight</h4>
                  <p>I have processed the uploaded document. Your <strong>Hemoglobin (13.2 g/dL)</strong> and <strong>Vitamin D (18 ng/mL)</strong> are falling below the standard reference ranges. This data has been synchronized to your Health Timeline. I recommend discussing these specific metrics with your healthcare provider.</p>
              </div>
          </div>

        </div>

      </div>
    </div>
  </main>
</div>

<!-- Physics-based Sidebar Shrink Logic -->
<script>
    function toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        sidebar.classList.toggle('collapsed');
    }
</script>
</body>
</html>