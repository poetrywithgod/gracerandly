import { timingSafeEqual } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler";
import { AppError, AppErrors } from "../lib/errors";
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
router.get("/support", (_req, res) => {
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

const ADMIN_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Gracerandly support</title>
<style>
body{font:15px system-ui,sans-serif;margin:0;background:#f5f5f4;color:#1c1917}
header{background:#1c1917;color:#fff;padding:12px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
header h1{font-size:17px;margin:0;flex:1}
main{max-width:860px;margin:0 auto;padding:16px}
select,input,textarea,button{font:inherit;padding:8px 10px;border-radius:8px;border:1px solid #d6d3d1}
button{background:#166534;color:#fff;border:0;cursor:pointer} button.alt{background:#e7e5e4;color:#1c1917}
.card{background:#fff;border-radius:12px;padding:12px 14px;margin:10px 0;cursor:pointer}
.meta{color:#78716c;font-size:13px}.pill{font-size:12px;background:#e7e5e4;border-radius:99px;padding:2px 8px}
.msg{padding:8px 12px;border-radius:12px;margin:8px 0;max-width:85%;white-space:pre-wrap}
.staff{background:#dcfce7;margin-left:auto}.user{background:#fff}
.row{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0} textarea{width:100%;box-sizing:border-box;min-height:90px}
#err{color:#b91c1c}
</style></head><body>
<header><h1>Gracerandly support</h1>
<select id="filter"><option value="">Needs attention</option><option>open</option><option>awaiting_user</option><option>resolved</option><option>closed</option></select>
<button class="alt" id="out">Sign out</button></header>
<main><p id="err"></p><div id="view"></div></main>
<script>
const $=s=>document.querySelector(s);let key=sessionStorage.getItem("gr_admin_key")||"";
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
async function api(path,opt={}){
  const r=await fetch("/admin/api/support"+path,{...opt,headers:{"content-type":"application/json","x-admin-key":key}});
  const j=await r.json().catch(()=>({}));
  if(r.status===401){sessionStorage.removeItem("gr_admin_key");key="";login("Wrong key");throw new Error("auth")}
  if(!r.ok)throw new Error(j.message||"Something went wrong");return j}
function login(msg){$("#err").textContent=msg||"";$("#view").innerHTML='<div class="row"><input id="k" type="password" placeholder="Admin key"><button id="go">Sign in</button></div>';
  $("#go").onclick=()=>{key=$("#k").value.trim();sessionStorage.setItem("gr_admin_key",key);list()}}
async function list(){
  if(!key)return login();$("#err").textContent="";
  try{const {tickets}=await api("/tickets"+($("#filter").value?"?status="+$("#filter").value:""));
  $("#view").innerHTML=tickets.length?tickets.map(t=>'<div class="card" data-id="'+t.id+'"><b>'+esc(t.subject)+'</b> <span class="pill">'+t.status+'</span><div class="meta">'+t.userRole+' · '+t.category+' · '+new Date(t.updatedAt).toLocaleString()+'</div></div>').join(""):"<p>Nothing here.</p>";
  document.querySelectorAll(".card").forEach(c=>c.onclick=()=>open(c.dataset.id))}catch(e){if(e.message!=="auth")$("#err").textContent=e.message}}
async function open(id){
  try{const {ticket,messages}=await api("/tickets/"+id);
  $("#view").innerHTML='<button class="alt" id="back">← Back</button><h2>'+esc(ticket.subject)+'</h2><div class="meta">'+ticket.userRole+' '+ticket.userId+' · '+ticket.category+' · '+ticket.status+(ticket.errandId?' · errand '+ticket.errandId:'')+'</div>'+
  messages.map(m=>'<div class="msg '+(m.sender==="staff"?"staff":"user")+'"><div class="meta">'+m.sender+' · '+new Date(m.createdAt).toLocaleString()+'</div>'+esc(m.body)+'</div>').join("")+
  '<textarea id="body" placeholder="Reply to the user"></textarea><div class="row"><button id="send">Send reply</button><button class="alt" id="res">Mark resolved</button><button class="alt" id="cls">Close</button></div>';
  $("#back").onclick=list;
  $("#send").onclick=async()=>{const b=$("#body").value.trim();if(!b)return;try{await api("/tickets/"+id+"/messages",{method:"POST",body:JSON.stringify({body:b})});open(id)}catch(e){$("#err").textContent=e.message}};
  const st=s=>async()=>{try{await api("/tickets/"+id,{method:"PATCH",body:JSON.stringify({status:s})});list()}catch(e){$("#err").textContent=e.message}};
  $("#res").onclick=st("resolved");$("#cls").onclick=st("closed")}catch(e){if(e.message!=="auth")$("#err").textContent=e.message}}
$("#filter").onchange=list;$("#out").onclick=()=>{sessionStorage.removeItem("gr_admin_key");key="";login()};list();
</script></body></html>`;

export default router;
