/* MEME VORTEX observatory — vanilla JS, reads ./data/*.json written by the engine exporter. */
(() => {
"use strict";
const FILES = ["status","portfolio","positions","trades","orders","tokens","activity","team","research"];
const D = {};
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const COLORS = {benchmark_cash:"#8b86a3", random_control:"#9b7bff", early_momentum:"#ff8a4c", post_migration:"#3ee0f0"};
const col = id => COLORS[id] || ["#ffd166","#4ef0b8","#ff6b8b","#c084fc"][Math.abs([...id].reduce((a,c)=>a+c.charCodeAt(0),0))%4];
const tz = {timeZone:"Europe/Paris"};
const fmtT = ts => ts ? new Date(ts*1000).toLocaleTimeString("fr-FR",{...tz,hour:"2-digit",minute:"2-digit"}) : "—";
const fmtDT = ts => ts ? new Date(ts*1000).toLocaleString("fr-FR",{...tz,day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}) : "—";
const ago = ts => { if(!ts) return "—"; const s = Date.now()/1000 - ts; if (s < 60) return "à l'instant"; if (s < 3600) return `il y a ${Math.floor(s/60)} min`; if (s < 86400) return `il y a ${Math.floor(s/3600)} h`; return `il y a ${Math.floor(s/86400)} j`; };
const sol = (x, d=4) => x == null ? "—" : `${(+x).toFixed(d)}`;
const sgn = (x, d=4) => x == null ? "—" : `${x>=0?"+":""}${(+x).toFixed(d)}`;
const pct = (x, d=1) => x == null ? "—" : `${x>=0?"+":""}${(x*100).toFixed(d)} %`;
const cls = x => x == null ? "" : x > 0 ? "pos" : x < 0 ? "neg" : "";
const px = p => p == null ? "—" : (+p).toExponential(3);
const short = m => m ? m.slice(0,4)+"…"+m.slice(-4) : "";
const dur = s => s == null ? "—" : s < 60 ? `${Math.round(s)} s` : s < 3600 ? `${Math.round(s/60)} min` : `${(s/3600).toFixed(1)} h`;
const empty = msg => `<div class="empty">${esc(msg)}</div>`;
const PAGE = 25;

// Data source: the Cloudflare Worker snapshot (window.VORTEX_API, see config.js) for live parts,
// bundled data/*.json as fallback (and always for team/research). D.source says which one is shown.
const LIVE_KEYS = ["status","portfolio","positions","trades","orders","tokens","activity"];
async function load() {
  const v = Date.now(); let live = false;
  const api = (window.VORTEX_API || "").replace(/\/+$/, "");
  if (api) {
    try {
      const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(`${api}/snapshot`, {cache:"no-store", signal: ctl.signal}); clearTimeout(tm);
      if (r.ok) { const j = await r.json(); for (const k of LIVE_KEYS) if (j[k]) D[k] = j[k]; live = !!j.status; }
    } catch (e) { console.warn("worker snapshot unavailable, falling back to bundled JSON", e); }
  }
  await Promise.all(FILES.filter(f => !(live && LIVE_KEYS.includes(f))).map(async f => {
    try { const r = await fetch(`data/${f}.json?v=${v}`, {cache:"no-store"}); if (r.ok) D[f] = await r.json(); } catch (e) {}
  }));
  D.source = live ? "worker" : "bundle";
  render();
}

function render() {
  try { renderStatus(); } catch(e){console.error(e)}
  for (const fn of [renderPulse, renderRadar, renderFlow, renderBook, renderCrew, renderCore]) { try { fn(); } catch (e) { console.error(e); } }
}

/* ---------------- header status */
function renderStatus() {
  const s = D.status; const pill = $("#livePill"); const t = $("#liveTxt");
  if (!s) { pill.className = "pill bad"; t.textContent = "aucune donnée"; return; }
  const age = Date.now()/1000 - (s.heartbeat_ts || s.generated_ts);
  const feed = s.engine && s.engine.feed_ok;
  if (age > 600) { pill.className = "pill bad"; t.textContent = `hors ligne · ${ago(s.heartbeat_ts)}`; }
  else if (s.kill_switch) { pill.className = "pill bad"; t.textContent = "KILL actif"; }
  else if (!feed) { pill.className = "pill warn"; t.textContent = "flux dégradé"; }
  else { pill.className = "pill ok"; t.textContent = `en marche · ${fmtT(s.generated_ts)}`; }
  $("#modePill").textContent = s.mode === "PAPER" ? "PAPER · simulation" : s.mode;
}

/* ---------------- PULSE */
let eqMode = "abs";
function renderPulse() {
  const p = D.portfolio;
  if (!p) { $("#strats").innerHTML = empty("En attente du premier export du moteur."); return; }
  const tot = p.total; const ss = p.strategies || [];
  $("#hEquity").innerHTML = `${sol(tot.equity,3)}<small>SOL</small>`;
  const pp = tot.start_capital ? tot.net_pnl / tot.start_capital : 0;
  $("#hPnl").innerHTML = `<span class="${cls(tot.net_pnl)}">${sgn(tot.net_pnl)} SOL · ${pct(pp,2)}</span>` + (p.sol_usd ? ` <span class="muted">≈ ${(tot.net_pnl*p.sol_usd).toFixed(2)} $</span>` : "");
  $("#hFees").textContent = `${sol(tot.fees)} SOL`;
  const mdd = Math.min(0, ...ss.map(s => s.max_drawdown || 0));
  $("#hDD").innerHTML = `<span class="${mdd<0?'neg':''}">${pct(mdd,2)}</span>`;
  $("#hTrades").textContent = ss.reduce((a,s)=>a+(s.stats_all.trades||0),0);
  $("#strats").innerHTML = ss.map(stratCard).join("") || empty("Aucune stratégie active.");
  drawEquity();
}
function stratCard(s) {
  const a = s.stats_all || {}, c = s.stats_clean || {};
  const tags = [];
  if (s.id === "benchmark_cash") tags.push(`<span class="tag">référence</span>`);
  if (s.halted) tags.push(`<span class="tag bad">stoppée · ${esc(s.halted_reason)}</span>`);
  if (a.tainted) tags.push(`<span class="tag warn">${a.tainted} trade(s) tainted</span>`);
  if (a.written_off) tags.push(`<span class="tag bad">${a.written_off} invendable(s) −100 %</span>`);
  if (a.trades && a.trades < 30) tags.push(`<span class="tag warn">échantillon trop petit</span>`);
  return `<div class="strat" style="--c:${col(s.id)}">
   <div class="row1"><h4>${esc(s.id)}<code>v${esc(s.version)} · ${esc(s.params_hash||"")}</code></h4><b class="${cls(s.net_pnl)}" style="font-family:var(--mono)">${sgn(s.net_pnl)} SOL</b></div>
   <p>${esc(s.description)}</p>
   <div class="grid4">
     <div><label>Équité</label><b>${sol(s.equity,3)}</b></div>
     <div><label>Frais</label><b>${sol(s.fees_paid)}</b></div>
     <div><label>Drawdown</label><b class="${s.max_drawdown<0?'neg':''}">${pct(s.max_drawdown,1)}</b></div>
     <div><label>Ouvertes</label><b>${s.open_positions}</b></div>
     <div><label>Trades</label><b>${a.trades||0}</b></div>
     <div><label>Gagnants</label><b>${a.trades?pct(a.win_rate,0).replace("+",""):"—"}</b></div>
     <div><label>Profit f.</label><b>${a.profit_factor!=null?(+a.profit_factor).toFixed(2):"—"}</b></div>
     <div><label>Espérance</label><b class="${cls(a.expectancy)}">${a.expectancy!=null?sgn(a.expectancy,4):"—"}</b></div>
   </div>
   ${a.tainted ? `<p class="note">Hors trades tainted : ${c.trades||0} trades, net ${sgn(c.net_pnl)} SOL</p>` : ""}
   <div>${tags.join("")}</div></div>`;
}
function setupCanvas(cv, h) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5); const w = cv.clientWidth || 320;
  cv.width = w * dpr; cv.height = h * dpr; cv.style.height = h + "px";
  const g = cv.getContext("2d"); g.setTransform(dpr,0,0,dpr,0,0); return [g, w, h];
}
function drawEquity() {
  const cv = $("#eqChart"); const ss = (D.portfolio && D.portfolio.strategies) || [];
  const series = ss.map(s => ({id:s.id, pts:(s.equity_curve||[]).map(([t,e]) => [t, eqMode==="pct" ? (e/s.start_capital-1)*100 : e - s.start_capital])})).filter(s => s.pts.length);
  const [g, w, h] = setupCanvas(cv, 220);
  $("#eqEmpty").hidden = series.some(s => s.pts.length > 1);
  if (!series.length) { $("#eqLegend").innerHTML = ""; return; }
  let t0 = Infinity, t1 = -Infinity, lo = 0, hi = 0;
  for (const s of series) for (const [t,v] of s.pts) { t0 = Math.min(t0,t); t1 = Math.max(t1,t); lo = Math.min(lo,v); hi = Math.max(hi,v); }
  if (hi - lo < 1e-6) { hi += eqMode==="pct" ? .5 : .01; lo -= eqMode==="pct" ? .5 : .01; }
  const pad = {l:8, r:46, t:10, b:22}; const X = t => pad.l + (t - t0) / Math.max(1, t1 - t0) * (w - pad.l - pad.r);
  const Y = v => pad.t + (hi - v) / (hi - lo) * (h - pad.t - pad.b);
  g.font = "10px ui-monospace,monospace"; g.fillStyle = "#625c7a"; g.strokeStyle = "rgba(255,255,255,.06)"; g.lineWidth = 1;
  for (let i = 0; i <= 4; i++) { const v = lo + (hi - lo) * i / 4; const y = Y(v); g.beginPath(); g.moveTo(pad.l, y); g.lineTo(w - pad.r, y); g.stroke(); g.fillText((eqMode==="pct" ? v.toFixed(2)+"%" : (v>=0?"+":"")+v.toFixed(3)), w - pad.r + 4, y + 3); }
  g.strokeStyle = "rgba(255,209,102,.35)"; g.setLineDash([3,4]); g.beginPath(); g.moveTo(pad.l, Y(0)); g.lineTo(w - pad.r, Y(0)); g.stroke(); g.setLineDash([]);
  g.fillStyle = "#625c7a"; g.fillText(fmtDT(t0), pad.l, h - 6); const lab = fmtDT(t1); g.fillText(lab, w - pad.r - g.measureText(lab).width, h - 6);
  for (const s of series) {
    const c = col(s.id); g.strokeStyle = c; g.lineWidth = s.id === "benchmark_cash" ? 1.2 : 2; if (s.id === "benchmark_cash") g.setLineDash([4,4]);
    g.beginPath(); s.pts.forEach(([t,v],i) => i ? g.lineTo(X(t),Y(v)) : g.moveTo(X(t),Y(v))); g.stroke(); g.setLineDash([]);
    const [lt, lv] = s.pts[s.pts.length-1]; g.fillStyle = c; g.beginPath(); g.arc(X(lt), Y(lv), 2.8, 0, 7); g.fill();
  }
  $("#eqLegend").innerHTML = series.map(s => `<span><i style="background:${col(s.id)}"></i>${esc(s.id)}</span>`).join("") + `<span class="muted">· variation vs capital initial, ${eqMode==="pct"?"%":"SOL"}, heure de Paris</span>`;
}

/* ---------------- RADAR */
let orbitNodes = [];
function renderRadar() {
  const t = D.tokens;
  if (!t) { $("#watched").innerHTML = empty("Pas encore de données."); return; }
  $("#rateTxt").textContent = `${(t.creations_per_min_10m||0).toFixed(1)} lancements / min`;
  const st = t.stages_24h || {};
  const order = [["new","détectés"],["watch","surveillés"],["candidate","candidats"],["graduated","gradués"],["rejected","rejetés"]];
  $("#stageBar").innerHTML = order.map(([k,l]) => `<div><b>${(st[k]||0) + (k==="new" ? (st.dropped||0) : 0)}</b><span>${l}</span></div>`).join("");
  const w = t.watched || [];
  $("#watched").innerHTML = w.length ? w.map(x => `<div class="item tap" data-mint="${esc(x.mint)}">
     <div class="t">${esc(x.symbol)} <span class="tag ${x.stage==='candidate'?'cy':x.stage==='graduated'?'warn':x.stage==='position'?'ok':''}">${esc(stageFr(x.stage))}</span></div>
     <div class="v">${x.mcap_sol!=null?(+x.mcap_sol).toFixed(0)+" SOL":"—"}</div>
     <div class="s">${esc(x.name||"")} · score ${x.score??"—"} · ${x.unique_buyers??0} acheteurs</div><div class="w">${ago(x.created_ts||x.stage_ts)}</div>
     <div class="s full">${esc(x.stage_reason||"")}${x.rug_risks && x.rug_risks!=="[]" ? " · RugCheck: "+esc(JSON.parse(x.rug_risks).join(", ")) : ""}</div></div>`).join("")
     : empty("Aucun token ne passe les premiers filtres en ce moment. C'est normal : la grande majorité des lancements meurent en quelques minutes.");
  $("#recent").innerHTML = (t.recent||[]).slice(0,25).map(x => `<div class="item"><div class="t">${esc(x.symbol)}${x.mayhem?' <span class="tag warn">mayhem</span>':''}</div><div class="w">${fmtT(x.ts)}</div><div class="s">${esc(x.name)} · dev buy ${sol(x.initial_buy_sol,2)} SOL</div><div class="w">${short(x.mint)}</div></div>`).join("") || empty("Aucun lancement enregistré.");
  orbitNodes = w.map((x,i) => ({...x, a: (i*2.399)%(Math.PI*2), sp: .0016 + Math.random()*.002}));
  (t.recent||[]).slice(0,30).forEach((x,i) => orbitNodes.push({symbol:x.symbol, stage:"new", a:(i*1.7)%6.28, sp:.0025+Math.random()*.002, score:0}));
  for (const p of (D.positions && D.positions.open) || []) orbitNodes.push({symbol:p.symbol, stage:"position", a:Math.random()*6.28, sp:.004});
}
const stageFr = s => ({new:"détecté",watch:"surveillé",candidate:"candidat",graduated:"gradué",position:"en position",dropped:"abandonné",rejected:"rejeté"}[s]||s);
const R = {new:.92, watch:.68, candidate:.44, graduated:.8, position:.22};
const C = {new:"#5b5675", watch:"#9b7bff", candidate:"#3ee0f0", graduated:"#ffd166", position:"#4ef0b8"};
let oT = 0;
function orbitFrame() {
  const cv = $("#orbit");
  if (cv && cv.offsetParent !== null) {
    const [g, w, h] = setupCanvas(cv, 320); const cx = w/2, cy = h/2, rm = Math.min(w, h)/2 - 14;
    oT += 1;
    const grd = g.createRadialGradient(cx,cy,0,cx,cy,rm*.35); grd.addColorStop(0,"rgba(255,209,102,.9)"); grd.addColorStop(.25,"rgba(255,138,76,.35)"); grd.addColorStop(1,"rgba(255,138,76,0)");
    g.fillStyle = grd; g.beginPath(); g.arc(cx,cy,rm*.35,0,7); g.fill();
    g.fillStyle = "#07060d"; g.beginPath(); g.arc(cx,cy,rm*.07,0,7); g.fill();
    for (let k = 0; k < 3; k++) { g.save(); g.translate(cx,cy); g.rotate(oT*.004 + k*2.09); g.strokeStyle = `rgba(155,123,255,${.12-.03*k})`; g.lineWidth = 1;
      g.beginPath(); for (let a = 0; a < 9; a += .05) { const r = rm*.08 + a/9*rm; g.lineTo(Math.cos(a)*r, Math.sin(a)*r*.9); } g.stroke(); g.restore(); }
    for (const [s,r] of Object.entries(R)) { if (s==="position") continue; g.strokeStyle = "rgba(255,255,255,.05)"; g.beginPath(); g.ellipse(cx,cy,rm*r,rm*r*.9,0,0,7); g.stroke(); }
    g.font = "600 10px ui-monospace,monospace";
    for (const n of orbitNodes) {
      n.a += n.sp * (1 + (n.score||0)/60); const r = rm * (R[n.stage] ?? .92);
      const x = cx + Math.cos(n.a)*r, y = cy + Math.sin(n.a)*r*.9; const c = C[n.stage] || "#5b5675";
      g.fillStyle = c; g.shadowColor = c; g.shadowBlur = n.stage==="new"?0:10; g.beginPath(); g.arc(x,y, n.stage==="new"?2:3.6, 0, 7); g.fill(); g.shadowBlur = 0;
      if (n.stage !== "new") { g.fillStyle = "rgba(239,234,249,.8)"; g.fillText(String(n.symbol||"").slice(0,10), x+6, y-5); }
    }
    if (!orbitNodes.length) { g.fillStyle = "#625c7a"; g.textAlign = "center"; g.fillText("le vortex est calme", cx, cy + rm*.5); g.textAlign = "start"; }
  }
  requestAnimationFrame(orbitFrame);
}

/* ---------------- FLOW */
let ordF = "all";
function renderFlow() {
  const a = D.activity || {};
  const sig = a.signals || [];
  $("#signals").innerHTML = sig.length ? sig.slice(0,PAGE).map(s => `<div class="item"><div class="t" style="color:${col(s.strategy_id)}">${esc(s.symbol)} · ${esc(s.side)}</div><div class="w">${fmtT(s.ts)}</div>
    <div class="s">${esc(s.strategy_id)} · ${esc(s.reason)}</div><div class="w">${esc(outcomeFr(s.outcome))}</div></div>`).join("")
    : empty("Aucun signal émis. Les stratégies attendent des conditions qui valent le coût d'entrée.");
  const kd = a.key_decisions || [];
  $("#decisions").innerHTML = kd.length ? kd.slice(0,40).map(d => `<div class="ev" style="--c:${decCol(d.action)}"><div class="h">${fmtDT(d.ts)} · ${esc(d.strategy_id)}</div><div class="m"><b>${esc(actionFr(d.action))}</b> ${esc(d.symbol||"")}</div><div class="b">${esc(d.reason)}</div></div>`).join("")
    : empty("Pas encore de décision marquante.");
  const rs = a.no_trade_reasons_24h || []; const mx = Math.max(1, ...rs.map(r => r.n));
  $("#reasons").innerHTML = rs.length ? rs.slice(0,14).map(r => `<div class="bar"><span>${esc(r.strategy_id)} · ${esc(r.reason)}</span><b>${r.n}</b><div class="track"><div class="fill" style="width:${r.n/mx*100}%"></div></div></div>`).join("") : empty("Aucune décision de non-trade enregistrée.");
  const os = ((D.orders && D.orders.orders) || []).filter(o => ordF==="all" || (ordF==="pending" && o.status==="pending") || (ordF==="filled" && o.status==="filled") || (ordF==="rej" && !["pending","filled"].includes(o.status)));
  $("#orders").innerHTML = os.length ? os.slice(0,60).map(o => `<div class="item tap" data-order="${o.id}"><div class="t">${o.side==="buy"?"▲":"▼"} ${esc(o.symbol)} <span class="tag ${o.status==='filled'?'ok':o.status==='pending'?'cy':'bad'}">${esc(statusFr(o.status))}</span></div>
     <div class="v">${o.side==="buy"?sol(o.size_sol,3)+" SOL":sol(o.sol_amount,4)+" SOL"}</div>
     <div class="s">${esc(o.strategy_id)} · ${o.status==="filled" ? `slip ${(+o.slippage_bps).toFixed(0)} bps · ${esc(o.price_source)} · ${(+o.latency_s).toFixed(1)} s` : esc(o.reason||"")}</div><div class="w">${fmtT(o.ts)}</div></div>`).join("")
    : empty(ordF==="all" ? "Aucun ordre pour l'instant." : "Rien dans cette catégorie.");
}
const outcomeFr = o => !o ? "" : o.startsWith("filled") ? "exécuté" : o.startsWith("risk_blocked") ? "bloqué (risque)" : o.startsWith("rejected") ? "rejeté" : o.startsWith("failed") ? "échoué" : o;
const statusFr = s => ({pending:"en attente",filled:"exécuté",rejected:"rejeté",failed:"échoué",cancelled:"annulé"}[s]||s);
const actionFr = a => ({enter:"Entrée",exit:"Sortie",risk_block:"Bloqué par le risque",candidate:"Nouveau candidat",graduated:"Graduation",rejected:"Rejeté"}[a]||a);
const decCol = a => ({enter:"#4ef0b8",exit:"#ff8a4c",risk_block:"#ff6b8b",candidate:"#3ee0f0",graduated:"#ffd166",rejected:"#ff6b8b"}[a]||"#9b7bff");

/* ---------------- BOOK */
function renderBook() {
  const op = (D.positions && D.positions.open) || [];
  $("#positions").innerHTML = op.length ? op.map(p => { const u = (p.mark_value ?? 0) - p.cost_sol; return `<div class="item"><div class="t" style="color:${col(p.strategy_id)}">${esc(p.symbol)} ${p.tainted?'<span class="tag warn">tainted</span>':''}${p.graduated?'<span class="tag cy">AMM</span>':''}</div>
    <div class="v ${cls(u)}">${sgn(u)} SOL</div><div class="s">${esc(p.strategy_id)} · coût ${sol(p.cost_sol)} · valeur liq. ${sol(p.mark_value)} · ${dur(Date.now()/1000-p.opened_ts)}</div><div class="w">${pct(p.cost_sol? u/p.cost_sol : null)}</div>
    <div class="s full">entrée ${px(p.entry_price)} · pic ${px(p.peak_price)} · ${esc(p.mark_source||"")}</div></div>`; }).join("")
    : empty("Aucune position ouverte.");
  const tr = (D.trades && D.trades.closed) || [];
  $("#trades").innerHTML = tr.length ? tr.slice(0,200).map(p => `<div class="item"><div class="t">${esc(p.symbol)} ${p.status==='written_off'?'<span class="tag bad">invendable −100 %</span>':''}${p.tainted?'<span class="tag warn">tainted</span>':''}</div>
    <div class="v ${cls(p.realized_pnl)}">${sgn(p.realized_pnl)} SOL</div><div class="s">${esc(p.strategy_id)} · ${esc(p.exit_reason||"")} · tenu ${dur((p.closed_ts||0)-(p.opened_ts||0))}</div><div class="w">${pct(p.cost_sol? p.realized_pnl/p.cost_sol : null)}</div>
    <div class="s full">${fmtDT(p.opened_ts)} → ${fmtDT(p.closed_ts)} · coût ${sol(p.cost_sol)} → ${sol(p.proceeds_sol)} · frais ${sol(p.fees_sol)}</div></div>`).join("")
    : empty("Aucun trade clôturé. Le benchmark « ne rien faire » reste à 0 : c'est la barre à battre.");
}

/* ---------------- CREW */
function renderCrew() {
  const t = D.team || {};
  $("#members").innerHTML = (t.members||[]).map(m => `<a class="member" ${m.link?`href="${esc(m.link)}"`:""}><div class="e">${esc(m.emoji)}</div><b>${esc(m.name)}</b><span>${esc(m.role)}</span></a>`).join("");
  const lg = t.log || [];
  $("#teamlog").innerHTML = lg.length ? lg.slice(0,50).map(l => `<div class="ev" style="--c:${({Prism:"#3ee0f0",Sentinel:"#ff6b8b",Vortex:"#ffd166"})[l.agent]||"#9b7bff"}"><div class="h">${fmtDT(l.ts)} · ${esc(l.agent)} · ${esc(l.kind)}</div><div class="m">${esc(l.title)}</div>${l.body?`<div class="b">${esc(l.body)}</div>`:""}</div>`).join("")
    : empty("L'équipe n'a encore rien consigné ici.");
  const r = D.research || {}; let h = "";
  for (const x of (r.replays||[]).slice(0,6)) h += `<div class="rs"><div class="h"><b>Replay ${esc(x.name)}</b><span class="muted">${esc(x.part||"")} · ${(+x.hours||0).toFixed(1)} h</span></div><div class="b">${(x.strategies||[]).map(s=>`${esc(s.id)}: ${s.stats_all.trades||0} trades, net ${sgn(s.net_pnl)} SOL`).join(" · ")}${x.warning?` — <b>${esc(x.warning)}</b>`:""}</div></div>`;
  for (const x of (r.experiments||[]).slice(0,10)) h += `<div class="rs"><div class="h"><b>Expérience #${x.id} · ${esc(x.strategy_id||"")}</b><span class="tag">${esc(x.status)}</span></div><div class="b">${esc(x.hypothesis)}${x.result?" → "+esc(x.result):""}</div></div>`;
  for (const x of (r.calibration||[]).slice(0,3)) h += `<div class="rs"><div class="h"><b>Calibration · ${esc(x.key)}</b><span class="muted">${fmtDT(x.ts)}</span></div><div class="b">${(+x.value).toFixed(1)} bps sur ${x.n} trades on-chain</div></div>`;
  for (const x of (r.strategy_versions||[]).slice(0,10)) h += `<div class="rs"><div class="h"><b>${esc(x.strategy_id)} v${esc(x.version)}</b><span class="muted">${fmtDT(x.first_seen_ts)} · ${esc(x.params_hash)}</span></div><div class="b">${esc(x.note||"")}</div></div>`;
  $("#research").innerHTML = h || empty("Aucune expérience enregistrée.");
  const ev = (D.activity && D.activity.events) || [];
  $("#events").innerHTML = ev.slice(0,60).map(e => `<div class="ev" style="--c:${({error:"#ff6b8b",warn:"#ffd166"})[e.severity]||"#9b7bff"}"><div class="h">${fmtDT(e.ts)} · ${esc(e.kind)}</div><div class="m">${esc(e.message)}</div></div>`).join("") || empty("Journal vide.");
}

/* ---------------- CORE */
function renderCore() {
  const s = D.status; if (!s) { $("#sys").innerHTML = empty("Pas de statut."); return; }
  const e = s.engine || {}; const c = s.counts || {};
  const kv = o => Object.entries(o).map(([k,v]) => `<span>${esc(k)}</span><b>${v}</b>`).join("");
  $("#sys").innerHTML = kv({
    "Mode": esc(s.mode) + " · réel désactivé", "Dernier battement": `${fmtT(s.heartbeat_ts)} (${ago(s.heartbeat_ts)})`, "Export": fmtDT(s.generated_ts),
    "WebSocket PumpPortal": e.ws_connected ? "connecté" : "déconnecté", "Flux": e.feed_ok ? "sain" : esc(e.feed_reason||"dégradé"),
    "Couverture 24 h": s.coverage_24h!=null ? (s.coverage_24h*100).toFixed(1)+" %" : "—", "Démarré": fmtDT(e.started_ts),
    "Tokens détectés": c.tokens_detected, "Trades bruts stockés": c.raw_trades, "Graduations vues": c.migrations,
    "Candidats": c.candidates, "Signaux": c.signals, "Ordres": c.orders, "Cotations Jupiter": c.quotes, "Décisions": c.decisions,
    "Tokens suivis": e.tracked_tokens ?? "—", "Kill switch": s.kill_switch ? "ACTIF" : "inactif", "SOL/USD": e.sol_usd ? (+e.sol_usd).toFixed(2) : "—"});
  const dt = s.downtime || [];
  $("#downtime").innerHTML = dt.length ? dt.map(d => `<div class="item"><div class="t">${d.kind==="engine_down"?"Moteur arrêté":"Coupure du flux"}</div><div class="v">${dur(d.end_ts-d.start_ts)}</div><div class="s">${fmtDT(d.start_ts)} → ${fmtDT(d.end_ts)}</div><div class="w"></div><div class="s full">${esc(d.note||"")}</div></div>`).join("") : empty("Aucune interruption enregistrée.");
  $("#apis").innerHTML = (s.api||[]).map(a => `<div class="item"><div class="t">${esc(a.host)}</div><div class="v">${a.requests} req</div><div class="s">ok ${a.ok} · erreurs ${a.errors} · 429 ${a.rate_limited}</div><div class="w">${ago(a.updated_ts)}</div></div>`).join("") || empty("—");
  const co = s.costs || {}, rk = s.risk || {};
  $("#costs").innerHTML = kv({"Frais courbe": `${co.curve_fee_bps} bps`, "Frais base + priorité": `${co.base_fee_sol} + ${co.priority_fee_sol} SOL / tx`,
    "Rent ATA": `${co.ata_rent_sol} SOL (remboursé à la sortie)`, "Latence simulée": `${(co.latency_s||[]).join("–")} s`, "Jupiter": esc(co.jupiter_rate),
    "Taille max / trade": `${rk.max_trade_sol} SOL ou ${(rk.max_trade_frac*100).toFixed(1)} %`, "Exposition max": `${(rk.max_exposure_frac*100).toFixed(0)} %`,
    "Positions max": `${rk.max_open_positions} / stratégie · ${rk.global_max_open_positions} au total`, "Perte jour max": `${(rk.daily_loss_limit_frac*100).toFixed(0)} %`,
    "Coupe-circuit drawdown": `${(rk.max_drawdown_frac*100).toFixed(0)} %`});
}

/* ---------------- sheet (tap details) */
function sheet(html) { $("#sheetBody").innerHTML = html; $("#sheet").hidden = false; }
$("#sheetX").onclick = () => $("#sheet").hidden = true;
$("#sheet").onclick = e => { if (e.target.id === "sheet") $("#sheet").hidden = true; };
document.addEventListener("click", e => {
  const it = e.target.closest("[data-mint]");
  if (it) { const m = it.dataset.mint; const x = ((D.tokens||{}).watched||[]).find(t => t.mint === m) || {};
    sheet(`<h3>${esc(x.symbol)} <span class="tag">${esc(stageFr(x.stage))}</span></h3><p class="muted">${esc(x.name)}</p><pre>mint ${esc(m)}\nmcap ${x.mcap_sol!=null?(+x.mcap_sol).toFixed(1):"—"} SOL · prix ${px(x.last_price_sol)} SOL\nscore ${x.score} · trades ${x.n_trades} · acheteurs ${x.unique_buyers}\nRugCheck ${x.rug_score ?? "—"} ${esc(x.rug_risks||"")}\n${esc(x.stage_reason||"")}</pre><p><a href="https://pump.fun/coin/${encodeURIComponent(m)}" target="_blank" rel="noopener">pump.fun ↗</a> · <a href="https://dexscreener.com/solana/${encodeURIComponent(m)}" target="_blank" rel="noopener">DexScreener ↗</a></p><p class="note">Lien informatif uniquement. Aucun conseil, aucune exécution réelle.</p>`); return; }
  const o = e.target.closest("[data-order]");
  if (o) { const x = ((D.orders||{}).orders||[]).find(r => String(r.id) === o.dataset.order) || {};
    sheet(`<h3>Ordre #${x.id} · ${esc(x.side)} ${esc(x.symbol)}</h3><pre>${esc(JSON.stringify(x, null, 1))}</pre>`); }
});

/* ---------------- tabs & toggles */
document.querySelectorAll("#tabs button").forEach(b => b.onclick = () => {
  document.querySelectorAll("#tabs button").forEach(x => x.classList.toggle("on", x === b));
  document.querySelectorAll(".tab").forEach(s => s.classList.toggle("active", s.dataset.tab === b.dataset.t));
  history.replaceState(null, "", "#" + b.dataset.t); window.scrollTo({top:0, behavior:"smooth"});
  if (b.dataset.t === "pulse") drawEquity();
});
document.querySelectorAll("#eqMode button").forEach(b => b.onclick = () => { eqMode = b.dataset.m; document.querySelectorAll("#eqMode button").forEach(x => x.classList.toggle("on", x === b)); drawEquity(); });
document.querySelectorAll("#ordFilter button").forEach(b => b.onclick = () => { ordF = b.dataset.f; document.querySelectorAll("#ordFilter button").forEach(x => x.classList.toggle("on", x === b)); renderFlow(); });
const h0 = location.hash.slice(1); if (h0) { const b = document.querySelector(`#tabs button[data-t="${h0}"]`); if (b) b.click(); }
window.addEventListener("resize", () => { clearTimeout(window.__rz); window.__rz = setTimeout(drawEquity, 150); });

/* ---------------- background: slow starfield + header accretion disk */
function sky() {
  const cv = $("#sky"); const g = cv.getContext("2d"); let W, H, stars;
  const rs = () => { const d = Math.min(devicePixelRatio||1, 2); W = cv.width = innerWidth*d; H = cv.height = innerHeight*d; stars = Array.from({length: 90}, () => ({x:Math.random()*W, y:Math.random()*H, r:Math.random()*1.3*d+.2, t:Math.random()*6})); };
  rs(); addEventListener("resize", rs);
  const disk = $("#disk").getContext("2d"); let a = 0;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  (function f() {
    g.clearRect(0,0,W,H);
    const neb = g.createRadialGradient(W*.85, H*.05, 0, W*.85, H*.05, W*.9); neb.addColorStop(0,"rgba(255,138,76,.10)"); neb.addColorStop(.4,"rgba(155,123,255,.06)"); neb.addColorStop(1,"rgba(7,6,13,0)");
    g.fillStyle = neb; g.fillRect(0,0,W,H);
    for (const s of stars) { s.t += .01; g.fillStyle = `rgba(239,234,249,${.25+.25*Math.sin(s.t)})`; g.fillRect(s.x, s.y, s.r, s.r); }
    a += .02; disk.clearRect(0,0,88,88);
    for (let i = 0; i < 26; i++) { const ang = a + i*.24, r = 12 + i*1.15; disk.strokeStyle = `hsla(${22 + i*6},100%,${62 - i}%,${.85 - i*.028})`; disk.lineWidth = 2.2;
      disk.beginPath(); disk.ellipse(44,44,r,r*.92,0,ang,ang+1.1); disk.stroke(); }
    disk.fillStyle = "#07060d"; disk.beginPath(); disk.arc(44,44,9,0,7); disk.fill();
    disk.strokeStyle = "rgba(255,209,102,.9)"; disk.lineWidth = 1.2; disk.beginPath(); disk.arc(44,44,10,0,7); disk.stroke();
    if (!still) requestAnimationFrame(f);
  })();
}
sky(); orbitFrame(); load(); setInterval(load, 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
})();
