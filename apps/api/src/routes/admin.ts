import { timingSafeEqual } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler";
import { AppError, AppErrors } from "../lib/errors";
import { dailyCsv, getAnalytics } from "../lib/analytics";
import { SUPPORT_STATUSES, adminGet, adminList, adminReply, adminSetStatus, replySchema } from "../lib/support";

// Staff side of support. Guarded by one shared key (ADMIN_API_KEY); the whole
// thing is switched off (404) until that's set. A fuller admin dashboard can
// reuse these same endpoints later.
const router: Router = Router();

function keyMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const expected = process.env.ADMIN_API_KEY?.trim();
  if (!expected) return next(AppErrors.notFound());
  const header = req.headers.authorization;
  const given =
    (typeof req.headers["x-admin-key"] === "string" ? req.headers["x-admin-key"] : undefined) ??
    (header?.startsWith("Bearer ") ? header.slice(7) : "");
  if (!given || !keyMatches(given, expected)) {
    return next(new AppError(401, "unauthorized", "Wrong admin key"));
  }
  next();
}

// The page itself is just a shell; it holds no data and needs no key to load.
router.get(["/", "/support"], (_req, res) => {
  if (!process.env.ADMIN_API_KEY?.trim()) {
    res.status(404).send("Not found");
    return;
  }
  res.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'");
  res.type("html").send(ADMIN_PAGE);
});

router.get(
  "/api/support/tickets",
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json({ tickets: await adminList(typeof req.query.status === "string" ? req.query.status : undefined) });
  })
);

router.get(
  "/api/support/tickets/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await adminGet(req.params.id));
  })
);

router.post(
  "/api/support/tickets/:id/messages",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { body } = replySchema.parse(req.body);
    res.status(201).json({ message: await adminReply(req.params.id, body) });
  })
);

router.patch(
  "/api/support/tickets/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { status } = z.object({ status: z.enum(SUPPORT_STATUSES) }).parse(req.body);
    res.json({ ticket: await adminSetStatus(req.params.id, status) });
  })
);

router.get(
  "/api/analytics",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const days = Number(typeof req.query.days === "string" ? req.query.days : 30);
    res.json(await getAnalytics(days));
  })
);

router.get(
  "/api/analytics/daily.csv",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const days = Number(typeof req.query.days === "string" ? req.query.days : 30);
    res.type("text/csv").setHeader("Content-Disposition", 'attachment; filename="gracerandly-daily.csv"');
    res.send(dailyCsv(await getAnalytics(days)));
  })
);

const ADMIN_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Gracerandly admin</title>
<style>
body{font:15px system-ui,sans-serif;margin:0;background:#f5f5f4;color:#1c1917}
header{background:#1c1917;color:#fff;padding:12px 16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
header h1{font-size:17px;margin:0;flex:1}
main{max-width:980px;margin:0 auto;padding:16px}
select,input,textarea,button{font:inherit;padding:8px 10px;border-radius:8px;border:1px solid #d6d3d1}
button{background:#166534;color:#fff;border:0;cursor:pointer} button.alt{background:#e7e5e4;color:#1c1917}
button.tab{background:transparent;color:#d6d3d1;padding:6px 10px} button.tab.on{background:#44403c;color:#fff}
.card{background:#fff;border-radius:12px;padding:12px 14px;margin:10px 0;cursor:pointer}
.meta{color:#78716c;font-size:13px}.pill{font-size:12px;background:#e7e5e4;border-radius:99px;padding:2px 8px}
.msg{padding:8px 12px;border-radius:12px;margin:8px 0;max-width:85%;white-space:pre-wrap}
.staff{background:#dcfce7;margin-left:auto}.user{background:#fff}
.row{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0} textarea{width:100%;box-sizing:border-box;min-height:90px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px;margin:10px 0}
.tile{background:#fff;border-radius:12px;padding:12px 14px}.tile b{display:block;font-size:22px;margin-top:2px}
h3{margin:22px 0 4px;font-size:15px} svg{width:100%;height:120px;background:#fff;border-radius:12px}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden}td,th{padding:8px 12px;text-align:left;border-bottom:1px solid #f5f5f4}
#err{color:#b91c1c}
</style></head><body>
<header><h1>Gracerandly admin</h1>
<button class="tab" id="t-ov">Overview</button><button class="tab" id="t-su">Support</button>
<select id="filter" hidden><option value="">Needs attention</option><option>open</option><option>awaiting_user</option><option>resolved</option><option>closed</option></select>
<select id="days" hidden><option value="7">7 days</option><option value="30" selected>30 days</option><option value="90">90 days</option></select>
<button class="alt" id="out">Sign out</button></header>
<main><p id="err"></p><div id="view"></div></main>
<script>
const $=s=>document.querySelector(s);let key=sessionStorage.getItem("gr_admin_key")||"";let tab=sessionStorage.getItem("gr_admin_tab")||"overview";
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const N=n=>"₦"+Math.round(n).toLocaleString("en-NG"),I=n=>Math.round(n).toLocaleString("en-NG");
async function api(path,opt={}){
  const r=await fetch("/admin/api"+path,{...opt,headers:{"content-type":"application/json","x-admin-key":key}});
  const j=await r.json().catch(()=>({}));
  if(r.status===401){sessionStorage.removeItem("gr_admin_key");key="";login("Wrong key");throw new Error("auth")}
  if(!r.ok)throw new Error((j.error&&j.error.message)||j.message||"Something went wrong");return j}
function login(msg){$("#err").textContent=msg||"";$("#view").innerHTML='<div class="row"><input id="k" type="password" placeholder="Admin key"><button id="go">Sign in</button></div>';
  $("#go").onclick=()=>{key=$("#k").value.trim();sessionStorage.setItem("gr_admin_key",key);show()}}
function show(){
  if(!key)return login();
  $("#t-ov").className="tab"+(tab==="overview"?" on":"");$("#t-su").className="tab"+(tab==="support"?" on":"");
  $("#filter").hidden=tab!=="support";$("#days").hidden=tab!=="overview";
  sessionStorage.setItem("gr_admin_tab",tab);tab==="overview"?overview():list()}
function bars(vals,color){const max=Math.max(1,...vals),w=100/vals.length;
  return '<svg viewBox="0 0 100 40" preserveAspectRatio="none">'+vals.map((v,i)=>'<rect x="'+(i*w+w*0.1)+'" y="'+(40-v/max*38)+'" width="'+w*0.8+'" height="'+(v/max*38)+'" fill="'+color+'"/>').join("")+'</svg>'}
const tile=(l,v,sub)=>'<div class="tile"><span class="meta">'+l+'</span><b>'+v+'</b>'+(sub?'<span class="meta">'+sub+'</span>':'')+'</div>';
async function overview(){
  $("#err").textContent="";$("#view").innerHTML="Loading…";
  try{const d=await api("/analytics?days="+$("#days").value),e=d.errands,m=d.money,u=d.users,r=d.referrals,s=d.support;
  const pct=x=>x===null?"—":Math.round(x*100)+"%";
  $("#view").innerHTML=
  '<h3>Errands (last '+d.days+' days)</h3><div class="grid">'+tile("Posted",I(e.posted))+tile("Delivered",I(e.delivered))+tile("Cancelled",I(e.cancelled))+tile("Completion rate",pct(e.completionRate))+tile("Avg time to deliver",e.avgMinutesToDeliver===null?"—":e.avgMinutesToDeliver+" min")+tile("Waiting for a runner now",I(e.openNow))+tile("In progress now",I(e.inProgressNow))+tile("Posted with AI help",I(e.aiParsed))+tile("From repeating errands",I(e.recurring))+'</div>'+
  '<h3>Errands per day (posted)</h3>'+bars(d.daily.map(x=>x.posted),"#a8a29e")+'<h3>Delivered per day</h3>'+bars(d.daily.map(x=>x.delivered),"#166534")+
  '<h3>Money</h3><div class="grid">'+tile("Paid in",N(m.paidIn),"fees + items budgets")+tile("Delivery fees",N(m.feeVolume))+tile("Commission earned",N(m.commission),"on delivered errands")+tile("Average fee",m.avgFee===null?"—":N(m.avgFee))+tile("Referral credit given",N(m.referralCreditGiven))+tile("Paid out to runners",N(m.runnerPayoutsSent))+tile("Payouts in flight",N(m.runnerPayoutsPending))+'</div>'+
  '<h3>Paid in per day</h3>'+bars(d.daily.map(x=>x.paidIn),"#0f766e")+
  '<h3>People</h3><div class="grid">'+tile("Requesters",I(u.requesters),"+"+I(u.newRequesters)+" new")+tile("Runners",I(u.runners),"+"+I(u.newRunners)+" new")+tile("Verified runners",I(u.verifiedRunners))+'</div><h3>New sign-ups per day</h3>'+bars(d.daily.map(x=>x.newUsers),"#7c3aed")+
  '<h3>Referrals</h3><div class="grid">'+tile("Joined with a code",I(r.invited))+tile("Completed first errand",I(r.qualified))+tile("Rewards issued",N(r.rewardsIssued))+tile("Rewards used",N(r.rewardsUsedNaira))+tile("Rewards waiting",N(r.rewardsOutstandingNaira),"still owed as credit/bonus")+'</div>'+
  '<h3>Support</h3><div class="grid">'+tile("Open",I(s.open))+tile("Waiting on user",I(s.awaitingUser))+tile("New tickets",I(s.newInPeriod))+tile("Resolved",I(s.resolvedInPeriod))+'</div>'+
  '<h3>By category</h3><table>'+(e.byCategory.length?e.byCategory.map(c=>'<tr><td>'+esc(c.category)+'</td><td>'+I(c.count)+'</td></tr>').join(""):'<tr><td>No errands yet</td></tr>')+'</table>'+
  '<h3>Top runners</h3><table>'+(d.topRunners.length?d.topRunners.map(t=>'<tr><td>'+esc(t.name)+'</td><td>'+esc(t.tier)+'</td><td>'+I(t.delivered)+' delivered</td></tr>').join(""):'<tr><td>No deliveries yet</td></tr>')+'</table>'+
  '<div class="row"><button class="alt" id="csv">Download daily numbers (CSV)</button></div>';
  $("#csv").onclick=async()=>{const r=await fetch("/admin/api/analytics/daily.csv?days="+$("#days").value,{headers:{"x-admin-key":key}});const b=await r.blob();const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download="gracerandly-daily.csv";a.click()}
  }catch(e){if(e.message!=="auth")$("#err").textContent=e.message}}
async function list(){
  $("#err").textContent="";
  try{const {tickets}=await api("/support/tickets"+($("#filter").value?"?status="+$("#filter").value:""));
  $("#view").innerHTML=tickets.length?tickets.map(t=>'<div class="card" data-id="'+t.id+'"><b>'+esc(t.subject)+'</b> <span class="pill">'+t.status+'</span><div class="meta">'+t.userRole+' · '+t.category+' · '+new Date(t.updatedAt).toLocaleString()+'</div></div>').join(""):"<p>Nothing here.</p>";
  document.querySelectorAll(".card").forEach(c=>c.onclick=()=>open(c.dataset.id))}catch(e){if(e.message!=="auth")$("#err").textContent=e.message}}
async function open(id){
  try{const {ticket,messages}=await api("/support/tickets/"+id);
  $("#view").innerHTML='<button class="alt" id="back">← Back</button><h2>'+esc(ticket.subject)+'</h2><div class="meta">'+ticket.userRole+' '+ticket.userId+' · '+ticket.category+' · '+ticket.status+(ticket.errandId?' · errand '+ticket.errandId:'')+'</div>'+
  messages.map(m=>'<div class="msg '+(m.sender==="staff"?"staff":"user")+'"><div class="meta">'+m.sender+' · '+new Date(m.createdAt).toLocaleString()+'</div>'+esc(m.body)+'</div>').join("")+
  '<textarea id="body" placeholder="Reply to the user"></textarea><div class="row"><button id="send">Send reply</button><button class="alt" id="res">Mark resolved</button><button class="alt" id="cls">Close</button></div>';
  $("#back").onclick=list;
  $("#send").onclick=async()=>{const b=$("#body").value.trim();if(!b)return;try{await api("/support/tickets/"+id+"/messages",{method:"POST",body:JSON.stringify({body:b})});open(id)}catch(e){$("#err").textContent=e.message}};
  const st=s=>async()=>{try{await api("/support/tickets/"+id,{method:"PATCH",body:JSON.stringify({status:s})});list()}catch(e){$("#err").textContent=e.message}};
  $("#res").onclick=st("resolved");$("#cls").onclick=st("closed")}catch(e){if(e.message!=="auth")$("#err").textContent=e.message}}
$("#t-ov").onclick=()=>{tab="overview";show()};$("#t-su").onclick=()=>{tab="support";show()};
$("#filter").onchange=list;$("#days").onchange=overview;
$("#out").onclick=()=>{sessionStorage.removeItem("gr_admin_key");key="";login()};show();
</script></body></html>`;

export default router;
