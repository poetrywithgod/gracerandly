/**
 * The staff dashboard page (served by routes/admin.ts). One self-contained
 * HTML document: no build step, no libraries, charts drawn as inline SVG.
 *
 * Colours are the app's "Violet Dusk" palette (packages/theme). The chart
 * colours (--s1..--s5) are brand-tinted, checked for colour-blind separation.
 *
 * It is a String.raw template, so the client code below must not contain
 * backticks or a dollar-brace sequence; it builds strings with + instead.
 */

const CSS = String.raw`
:root{
  --cream:#F8F4E9;--paper:#FFFFFF;--panel:#F7F1E6;--line:#EADFCF;--line2:#F1E8DA;
  --deep:#502D55;--rose:#935073;--peach:#F6DBC0;
  --ink:#2E1A33;--muted:#76607C;--faint:#A08FA5;
  --s1:#9c4a78;--s2:#2f7fb3;--s3:#cf8410;--s4:#2e9b72;--s5:#6a55c9;
  --good:#1F6B3E;--goodbg:#E3F3E8;--warn:#7A5300;--warnbg:#FBEFD2;--bad:#9B2A1F;--badbg:#F8E1DD;--info:#502D55;--infobg:#F1E4EE;
  --font:"Poppins",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:#EBE1D1;color:var(--ink);font:14px/1.45 var(--font);}
button,input,select,textarea{font:inherit;color:inherit}
button{cursor:pointer}
:focus-visible{outline:2px solid var(--rose);outline-offset:2px}
.shell{display:grid;grid-template-columns:248px minmax(0,1fr);gap:14px;max-width:1520px;margin:18px auto;padding:14px;background:#FFFEFB;border-radius:30px;box-shadow:0 1px 0 #fff inset,0 18px 50px rgba(80,45,85,.10)}
.side{background:var(--panel);border-radius:22px;padding:22px 0 16px;display:flex;flex-direction:column;position:sticky;top:32px;align-self:start;height:calc(100vh - 64px);min-height:560px}
.brand{display:flex;align-items:center;gap:10px;padding:0 22px 22px;font-weight:600;font-size:19px;letter-spacing:-.01em}
.brand small{font-size:11px;font-weight:500;background:var(--infobg);color:var(--deep);padding:2px 8px;border-radius:99px;margin-left:2px}
.navh{padding:0 22px;margin:10px 0 8px;font-size:12px;color:var(--faint);font-weight:500}
.nav{display:flex;flex-direction:column;gap:2px;margin:0;padding:0;list-style:none}
.nav button{all:unset;box-sizing:border-box;width:100%;display:flex;align-items:center;gap:12px;padding:11px 22px;color:var(--muted);font-weight:500;cursor:pointer;position:relative}
.nav button:hover{color:var(--deep)}
.nav button:focus-visible{outline:2px solid var(--rose);outline-offset:-2px;border-radius:10px}
.nav button.on{color:var(--ink);font-weight:600}
.nav button.on:before{content:"";position:absolute;left:0;top:6px;bottom:6px;width:4px;border-radius:0 4px 4px 0;background:var(--deep)}
.nav button.on svg{color:var(--deep)}
.nav svg,.ico{width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none}
.badge{margin-left:auto;font-size:11px;font-weight:600;background:var(--deep);color:#fff;border-radius:99px;padding:1px 8px;min-width:22px;text-align:center}
.badge.red{background:var(--bad)}
.sidecard{margin:auto 14px 0;border-radius:18px;padding:16px;color:#fff;background:radial-gradient(circle at 85% 10%,rgba(246,219,192,.30),transparent 45%),linear-gradient(150deg,#3A1F3F,#502D55 60%,#6b3b70);position:relative;overflow:hidden}
.sidecard:after{content:"";position:absolute;inset:auto -30px -40px auto;width:150px;height:150px;border-radius:50%;border:18px solid rgba(255,255,255,.06)}
.sidecard h4{margin:0 0 2px;font-size:15px;font-weight:600}.sidecard p{margin:0 0 12px;font-size:12px;opacity:.8}
.sidecard button{width:100%;border:0;border-radius:99px;background:var(--peach);color:var(--deep);font-weight:600;padding:9px 12px;display:flex;align-items:center;justify-content:center;gap:8px;position:relative;z-index:1}
.main{display:flex;flex-direction:column;gap:14px;min-width:0}
.top{background:var(--panel);border-radius:22px;padding:14px 18px;display:flex;align-items:center;gap:14px}
.search{position:relative;flex:1;max-width:440px}
.search input{width:100%;border:0;background:#fff;border-radius:99px;padding:11px 70px 11px 44px;box-shadow:0 0 0 1px var(--line2)}
.search>span:first-child{position:absolute;left:16px;top:50%;transform:translateY(-50%);color:var(--muted);display:flex}
.kbd{position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:11px;background:var(--panel);color:var(--muted);border-radius:6px;padding:2px 7px}
.results{position:absolute;z-index:30;left:0;right:0;top:calc(100% + 8px);background:#fff;border-radius:16px;box-shadow:0 12px 40px rgba(46,26,51,.18);padding:8px;max-height:60vh;overflow:auto}
.results h5{margin:8px 10px 4px;font-size:12px;color:var(--faint);font-weight:500}
.results button{all:unset;box-sizing:border-box;display:flex;gap:10px;width:100%;padding:8px 10px;border-radius:10px;cursor:pointer;align-items:center}
.results button:hover,.results button:focus-visible{background:var(--panel)}
.results .nothing{padding:12px;color:var(--muted)}
.topr{margin-left:auto;display:flex;align-items:center;gap:10px;position:relative}
.circ{width:42px;height:42px;border-radius:50%;background:#fff;border:0;box-shadow:0 0 0 1px var(--line2);display:grid;place-items:center;color:var(--ink);position:relative}
.circ:hover{background:var(--cream)}
.dot{position:absolute;top:-3px;right:-3px;background:var(--bad);color:#fff;border-radius:99px;font-size:10px;font-weight:600;min-width:18px;padding:0 5px;line-height:18px;text-align:center}
.me{display:flex;align-items:center;gap:10px;padding-left:6px}
.avatar{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;color:#fff;font-weight:600;font-size:14px;background:linear-gradient(140deg,var(--deep),var(--rose));flex:none}
.me b{display:block;font-weight:600;line-height:1.2}.me span{font-size:12px;color:var(--muted)}
.pop{position:absolute;right:0;top:calc(100% + 10px);width:300px;background:#fff;border-radius:16px;box-shadow:0 12px 40px rgba(46,26,51,.18);padding:14px;z-index:30}
.pop h4{margin:0 0 8px;font-size:14px}
.content{background:var(--panel);border-radius:22px;padding:22px;min-height:70vh;transition:opacity .2s}
.content.busy{opacity:.55}
.head{display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap;margin-bottom:18px}
.head h1{margin:0;font-size:34px;line-height:1.1;font-weight:600;letter-spacing:-.02em}
.head p{margin:6px 0 0;color:var(--muted);max-width:60ch}
.head .acts{margin-left:auto;display:flex;gap:10px;flex-wrap:wrap}
.btn{border:0;border-radius:99px;padding:11px 22px;font-weight:500;display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,#3F2344,var(--deep) 55%,#6b3b70);color:#fff}
.btn:hover{filter:brightness(1.12)}
.btn.ghost{background:transparent;color:var(--deep);box-shadow:inset 0 0 0 1.5px var(--deep)}
.btn.ghost:hover{background:var(--infobg);filter:none}
.btn.small{padding:7px 14px;font-size:13px}
.btn[disabled]{opacity:.5;cursor:default}
select.btn{appearance:none;padding-right:34px;background:transparent url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' fill='none' stroke='%23502D55' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M1 1l5 5 5-5'/%3E%3C/svg%3E") no-repeat right 14px center;color:var(--deep);box-shadow:inset 0 0 0 1.5px var(--deep)}
.grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:14px}
.c3{grid-column:span 3}.c4{grid-column:span 4}.c5{grid-column:span 5}.c6{grid-column:span 6}.c8{grid-column:span 8}.c12{grid-column:span 12}
.card{background:var(--paper);border-radius:20px;padding:18px 20px;min-width:0;position:relative}
.card h3{margin:0;font-size:16px;font-weight:600;letter-spacing:-.005em}
.card .sub{margin:2px 0 12px;color:var(--muted);font-size:12.5px}
.cardh{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:4px}
.stat{display:flex;flex-direction:column;gap:2px;min-height:150px}
.stat .lbl{font-weight:500;font-size:15px;padding-right:44px}
.stat .val{font-size:44px;font-weight:600;line-height:1.1;letter-spacing:-.02em;margin-top:8px}
.stat .delta{font-size:12px;color:var(--muted);display:flex;align-items:center;gap:6px;margin-top:auto}
.stat .delta i{font-style:normal;font-size:10px;border-radius:6px;padding:1px 5px;font-weight:600}
.stat .delta .up{background:var(--goodbg);color:var(--good)}.stat .delta .dn{background:var(--badbg);color:var(--bad)}.stat .delta .flat{background:var(--panel);color:var(--muted)}
.stat .go{position:absolute;right:16px;top:16px;width:34px;height:34px;border-radius:50%;border:1.5px solid var(--ink);background:transparent;display:grid;place-items:center;color:var(--ink)}
.stat .go:hover{background:var(--panel)}
.stat .spark{position:absolute;right:18px;bottom:16px;width:90px;height:30px}
.stat.hero{color:#fff;background:radial-gradient(circle at 18% 0,rgba(246,219,192,.30),transparent 52%),linear-gradient(135deg,#3A1F3F,var(--deep) 45%,var(--rose))}
.stat.hero .go{background:#fff;border-color:#fff;color:var(--deep)}
.stat.hero .delta{color:rgba(255,255,255,.85)}
.stat.hero .delta .up,.stat.hero .delta .dn,.stat.hero .delta .flat{background:rgba(255,255,255,.18);color:#fff}
.wk{display:flex;gap:10px;align-items:flex-end;height:176px;margin-top:34px}
.wk .col{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:8px;height:100%;min-width:0}
.wk .pill{width:100%;max-width:46px;border-radius:99px;position:relative;transform-origin:bottom;animation:rise .7s cubic-bezier(.2,.8,.2,1) both}
.wk .pill.t1{background:linear-gradient(180deg,#6b3b70,var(--deep))}
.wk .pill.t2{background:linear-gradient(180deg,#b0708f,var(--rose))}
.wk .pill.t3{background:repeating-linear-gradient(45deg,rgba(147,80,115,.55) 0 2px,transparent 2px 7px),#F6EEF3}
.wk .col:hover .pill{filter:brightness(1.1)}
.wk .col span{font-size:12px;color:var(--muted)}
.wk .bub{position:absolute;top:-24px;left:50%;transform:translateX(-50%);background:var(--ink);color:#fff;font-size:11px;font-weight:600;border-radius:99px;padding:1px 8px;white-space:nowrap}
@keyframes rise{from{transform:scaleY(.15);opacity:.4}to{transform:none;opacity:1}}
@media (prefers-reduced-motion:reduce){.wk .pill{animation:none}.content{transition:none}}
.att .top1{font-size:21px;font-weight:600;line-height:1.2;margin:6px 0 2px}
.att .desc{color:var(--muted);font-size:13px;margin:0 0 10px}
.att ul{list-style:none;margin:0 0 12px;padding:0;display:flex;flex-direction:column;gap:6px}
.att li{display:flex;gap:8px;align-items:center;font-size:13px}
.att .btn{width:100%;justify-content:center;padding:13px}
.tone{width:8px;height:8px;border-radius:50%;background:var(--faint);flex:none}.tone.red{background:var(--bad)}.tone.amber{background:var(--s3)}.tone.violet{background:var(--rose)}.tone.green{background:var(--s4)}.linkb{background:none;border:0;padding:0;font:inherit;font-weight:600;color:var(--deep);cursor:pointer;text-decoration:underline}tr.clk{cursor:pointer}tr.clk:hover td{background:var(--panel)}
.clear{display:flex;align-items:center;gap:10px;color:var(--good);font-weight:600;margin-top:10px}
.list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
.list li{display:flex;gap:12px;align-items:center;padding:9px 0;border-bottom:1px solid var(--line2)}
.list li:last-child{border:0}
.list .t{font-weight:500;line-height:1.25}.list .m{font-size:12px;color:var(--muted)}
.list .grow{flex:1;min-width:0}.list .grow>*{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gl{width:34px;height:34px;border-radius:12px;display:grid;place-items:center;background:var(--infobg);color:var(--deep);flex:none}
.gl svg{width:17px;height:17px}
.av{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;font-weight:600;font-size:13px;color:#fff;flex:none}
.pillx{font-size:11px;font-weight:500;border-radius:7px;padding:2px 8px;white-space:nowrap;display:inline-block}
.p-good{background:var(--goodbg);color:var(--good)}.p-warn{background:var(--warnbg);color:var(--warn)}.p-bad{background:var(--badbg);color:var(--bad)}.p-info{background:var(--infobg);color:var(--info)}.p-mute{background:#EFE9EC;color:#5d4c61}
.p-bronze{background:#F6E1CF;color:#7A3F14}.p-silver{background:#E4E9EE;color:#3B4651}.p-gold{background:var(--warnbg);color:var(--warn)}
.donutw{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.donut{width:170px;height:170px;flex:none}
.donut circle{fill:none;transition:stroke-width .15s}.donut circle:hover{stroke-width:24}
.legend{display:flex;flex-direction:column;gap:7px;font-size:13px;flex:1;min-width:130px}
.legend div{display:flex;align-items:center;gap:8px}.legend b{margin-left:auto;font-weight:600}
.sw{width:10px;height:10px;border-radius:3px;flex:none}.sw.line{height:3px;width:14px;border-radius:2px}
.sw.hatch{background:repeating-linear-gradient(45deg,var(--rose) 0 2px,#F1E4EE 2px 5px)}
.lgd{display:flex;gap:16px;flex-wrap:wrap;font-size:12.5px;color:var(--muted);margin:0 0 6px}.lgd span{display:flex;align-items:center;gap:6px}
.half{width:100%;max-width:300px;margin:0 auto;display:block}
.hb{display:flex;flex-direction:column;gap:11px}
.hbr{display:grid;grid-template-columns:minmax(0,46%) 1fr auto;gap:10px;align-items:center;font-size:13px}
.hbl{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ink)}
.hbt{height:12px;border-radius:4px;background:var(--line2);position:relative}
.hbt i{display:block;height:100%;border-radius:0 4px 4px 0;min-width:0}
.hbt i.hatch{background:repeating-linear-gradient(45deg,var(--rose) 0 2px,#EBDDE6 2px 6px)!important}
.hbv{font-weight:600;font-variant-numeric:tabular-nums;min-width:34px;text-align:right}
.hbr:hover .hbt i{filter:brightness(1.12)}
.hbr:hover{background:linear-gradient(90deg,transparent,rgba(147,80,115,.05))}
svg.chart{width:100%;height:auto;display:block;overflow:visible}
svg.chart .grid{stroke:var(--line2);stroke-width:1}
svg.chart .ax{fill:var(--muted);font-size:10.5px;font-family:var(--font)}
svg.chart .ln{fill:none;stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
svg.chart .xh{stroke:var(--faint);stroke-width:1;opacity:0}
svg.chart .bh{fill:transparent}svg.chart .bh:hover{fill:rgba(147,80,115,.09)}
svg.chart.hm{max-width:860px}svg.chart .cell:hover{stroke:var(--ink);stroke-width:1.5}
.tip{position:fixed;z-index:100;pointer-events:none;background:var(--ink);color:#fff;border-radius:10px;padding:7px 10px;font-size:12px;box-shadow:0 8px 24px rgba(0,0,0,.25);display:none;max-width:260px}
.tip b{font-weight:600;font-size:13px;display:block}.tip span{opacity:.78}
.tip .r{display:flex;align-items:center;gap:8px;margin-top:3px}.tip .r i{width:12px;height:3px;border-radius:2px;display:inline-block}
.trk{color:#fff;background:radial-gradient(circle at 90% 0,rgba(246,219,192,.22),transparent 50%),linear-gradient(150deg,#341B3A,var(--deep) 60%,#6b3b70);overflow:hidden}
.trk h3{font-weight:500;font-size:15px}
.trk .big{font-size:40px;font-weight:600;letter-spacing:-.01em;margin:8px 0 6px;line-height:1.1}
.trk .chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.trk .chips span{background:rgba(255,255,255,.14);border-radius:99px;padding:4px 12px;font-size:12px}
.trk svg.swirl{position:absolute;right:-60px;top:-40px;width:260px;opacity:.14;pointer-events:none}
.trk .spk{width:100%;height:44px;display:block;margin-top:6px}
.meter{height:10px;background:var(--line2);border-radius:99px;overflow:hidden;margin:6px 0 4px}.meter i{display:block;height:100%;background:var(--s2);border-radius:99px}
.rate{display:flex;align-items:baseline;gap:8px;margin-bottom:6px}.rate b{font-size:38px;font-weight:600;line-height:1}.rate span{color:var(--muted);font-size:12.5px}
.kv{display:grid;grid-template-columns:1fr auto;gap:6px 12px;font-size:13px;margin-top:10px}.kv b{font-weight:600;text-align:right}
.muted{color:var(--muted)}
details.tbl{margin-top:14px}details.tbl summary{cursor:pointer;font-weight:500;color:var(--deep);padding:6px 0}
.twrap{overflow:auto;max-height:420px;border-radius:12px;box-shadow:inset 0 0 0 1px var(--line2)}
table{width:100%;border-collapse:collapse;font-size:13px;background:#fff}
th,td{padding:9px 14px;text-align:left;border-bottom:1px solid var(--line2);white-space:nowrap}
th{font-weight:500;color:var(--muted);background:var(--panel);position:sticky;top:0}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
.err{background:var(--badbg);color:var(--bad);border-radius:12px;padding:10px 14px;margin:0 0 14px}
.tk{display:flex;gap:12px;align-items:center;padding:14px 18px;background:#fff;border-radius:16px;margin-bottom:10px;cursor:pointer;border:0;width:100%;text-align:left}
.tk:hover{box-shadow:0 0 0 1.5px var(--rose)}
.msg{padding:10px 14px;border-radius:16px;margin:8px 0;max-width:80%;white-space:pre-wrap;background:#fff}
.msg.staff{background:var(--infobg);margin-left:auto}.msg .m{font-size:12px;color:var(--muted);margin-bottom:2px}
.fld{display:flex;gap:10px;flex-wrap:wrap;margin:10px 0}
.fld input,textarea.in{border:0;background:#fff;border-radius:14px;padding:11px 14px;box-shadow:inset 0 0 0 1px var(--line);min-width:0}
.fld input{flex:1 1 180px}textarea.in{width:100%;min-height:96px}
.login{max-width:380px;margin:12vh auto;background:#fff;border-radius:24px;padding:30px;text-align:center;box-shadow:0 18px 50px rgba(80,45,85,.14)}
.login h1{font-size:24px;margin:10px 0 4px}.login p{color:var(--muted);margin:0 0 18px}
.login input{width:100%;border:0;box-shadow:inset 0 0 0 1px var(--line);border-radius:14px;padding:12px 14px;margin-bottom:12px;background:var(--cream)}
.login .btn{width:100%;justify-content:center}
@media (max-width:1180px){.c3{grid-column:span 6}.c4{grid-column:span 6}.c5{grid-column:span 6}.c6{grid-column:span 12}.c8{grid-column:span 12}}
@media (max-width:860px){
  .shell{grid-template-columns:1fr;margin:0;border-radius:0;padding:10px}
  .side{position:static;height:auto;min-height:0;flex-direction:row;flex-wrap:wrap;align-items:center;padding:10px 6px;border-radius:18px}
  .brand{padding:0 12px}.navh,.sidecard{display:none}
  .nav{flex-direction:row;flex-wrap:wrap;flex:1}.nav button{padding:8px 12px;width:auto}.nav button.on:before{display:none}.nav button.on{background:#fff;border-radius:99px}
  .top{flex-wrap:wrap}.me div{display:none}
  .head h1{font-size:28px}.head .acts{margin-left:0}
  .content{padding:14px}
}
@media (max-width:620px){.c3,.c4,.c5{grid-column:span 12}.stat .val{font-size:38px}.donut{width:140px;height:140px}}
`;

const BODY = String.raw`
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<pattern id="hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><rect width="6" height="6" fill="#F1E4EE"/><line x1="0" y1="0" x2="0" y2="6" stroke="#935073" stroke-width="2"/></pattern>
</defs></svg>
<div id="app"></div>
<div class="tip" id="tip" role="tooltip"></div>
`;

const SCRIPT = String.raw`
(function(){
"use strict";
var $=function(s,r){return (r||document).querySelector(s)};
var $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
var esc=function(s){return String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})};
var I=function(n){return Math.round(n).toLocaleString("en-NG")};
var N=function(n){return "₦"+I(n)};
var compact=function(n){var a=Math.abs(n);if(a>=1e6)return (n/1e6).toFixed(2).replace(/0$/,"").replace(/\.0$/,"")+"M";if(a>=1e3)return (n/1e3).toFixed(1).replace(/\.0$/,"")+"K";return String(Math.round(n))};
var Nc=function(n){return "₦"+compact(n)};
var MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
var DOW=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
var fmtDay=function(d){var p=d.split("-");return parseInt(p[2],10)+" "+MON[parseInt(p[1],10)-1]};
var mins=function(m){if(m===null||m===undefined)return "—";return m<60?m+" min":Math.floor(m/60)+"h "+(m%60)+"m"};
var ago=function(iso){var m=Math.max(0,Math.round((Date.now()-new Date(iso).getTime())/60000));if(m<1)return "just now";if(m<60)return m+" min ago";var h=Math.round(m/60);if(h<24)return h+" h ago";return Math.round(h/24)+" d ago"};
var CAT=["grocery","pharmacy","food","parcel","miscellaneous"];
var CATNAME={grocery:"Grocery",pharmacy:"Pharmacy",food:"Food",parcel:"Parcel",miscellaneous:"Other"};
var CATCOL=["var(--s1)","var(--s2)","var(--s3)","var(--s4)","var(--s5)"];
var STATUS={pending_match:"Waiting for a runner",accepted:"Accepted",en_route_to_pickup:"Heading to pickup",in_progress:"Shopping",en_route_to_delivery:"On the way",delivered:"Delivered",cancelled:"Cancelled"};
var STAGE_RAMP=["#EAD7E4","#D9B5CB","#C58FAD","#AE6890","#8E4A74","#502D55"];
var TIERS=["probationary","bronze","silver","gold"];
var TIERCLS={probationary:"p-mute",bronze:"p-bronze",silver:"p-silver",gold:"p-gold"};
var AVCOL=["#502D55","#935073","#2f7fb3","#2e9b72","#6a55c9","#b0708f"];

var IC={
 grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
 chart:'<path d="M6 20V10M12 20V4M18 20v-6"/>',
 msg:'<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 20l1.2-4.7A8.4 8.4 0 1 1 21 11.5z"/>',
 undo:'<path d="M1 4v6h6"/><path d="M3.5 15a9 9 0 1 0 2.1-9.4L1 10"/>',
 out:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
 search:'<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
 mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
 bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
 ne:'<path d="M7 17L17 7M8 7h9v9"/>',
 down:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
 refresh:'<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/>',
 users:'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
 shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
 alert:'<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
 wallet:'<path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>',
 ok:'<path d="M22 11.1V12a10 10 0 1 1-5.9-9.1"/><path d="M22 4L12 14l-3-3"/>',
 grocery:'<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
 pharmacy:'<path d="M12 5v14M5 12h14"/>',
 food:'<path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z"/><path d="M6 1v3M10 1v3M14 1v3"/>',
 parcel:'<path d="M16.5 9.4l-9-5.2M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7z"/><path d="M3.3 7L12 12l8.7-5M12 22V12"/>',
 miscellaneous:'<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>'
};
var icon=function(n,cls){return '<svg class="'+(cls||"ico")+'" viewBox="0 0 24 24" aria-hidden="true">'+IC[n]+'</svg>'};
var LOGO='<svg width="34" height="34" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12" fill="none" stroke="#502D55" stroke-width="4" stroke-dasharray="58 18" stroke-linecap="round" transform="rotate(-60 16 16)"/><circle cx="16" cy="16" r="4.5" fill="#935073"/></svg>';

var key=sessionStorage.getItem("gr_admin_key")||"";
var page=sessionStorage.getItem("gr_admin_page")||"dashboard";
var days=Number(sessionStorage.getItem("gr_admin_days")||30);
var cache=null, prefillErrand="", supportFilter="";

function api(path,opt){
  opt=opt||{};
  return fetch("/admin/api"+path,{method:opt.method||"GET",body:opt.body,headers:{"content-type":"application/json","x-admin-key":key}}).then(function(r){
    return r.json().catch(function(){return {}}).then(function(j){
      if(r.status===401){sessionStorage.removeItem("gr_admin_key");key="";renderLogin("Wrong key");throw new Error("auth")}
      if(!r.ok)throw new Error((j.error&&j.error.message)||j.message||"Something went wrong");
      return j});
  });
}
function fail(e){if(e&&e.message!=="auth"){var b=$("#err");if(b){b.textContent=e.message;b.hidden=false}}}

/* ---------- tooltip ---------- */
var tip=$("#tip");
function showTip(x,y,title,val,rows){
  tip.textContent="";
  if(rows){var t=document.createElement("span");t.textContent=title;tip.appendChild(t);
    rows.forEach(function(r){var d=document.createElement("div");d.className="r";var k=document.createElement("i");k.style.background=r.color;d.appendChild(k);var b=document.createElement("b");b.textContent=r.value;var s=document.createElement("span");s.textContent=r.name;d.appendChild(b);d.appendChild(s);tip.appendChild(d)})}
  else{var b2=document.createElement("b");b2.textContent=val;var s2=document.createElement("span");s2.textContent=title;tip.appendChild(b2);tip.appendChild(s2)}
  tip.style.display="block";
  var w=tip.offsetWidth,h=tip.offsetHeight,nx=x+14,ny=y-h-12;
  if(nx+w>window.innerWidth-8)nx=x-w-14;if(ny<8)ny=y+16;
  tip.style.left=nx+"px";tip.style.top=ny+"px";
}
function hideTip(){tip.style.display="none"}
document.addEventListener("pointermove",function(e){
  var el=e.target.closest&&e.target.closest("[data-t]");
  if(el&&!el.closest(".lc"))showTip(e.clientX,e.clientY,el.getAttribute("data-t"),el.getAttribute("data-v"));
  else if(!(e.target.closest&&e.target.closest(".lc")))hideTip();
});
document.addEventListener("focusin",function(e){var el=e.target.closest&&e.target.closest("[data-t]");if(el){var r=el.getBoundingClientRect();showTip(r.left+r.width/2,r.top,el.getAttribute("data-t"),el.getAttribute("data-v"))}});
document.addEventListener("focusout",hideTip);

/* ---------- chart kit ---------- */
function niceMax(v){if(v<=0)return 1;var p=Math.pow(10,Math.floor(Math.log10(v))),f=v/p;var n=f<=1?1:f<=2?2:f<=5?5:10;return n*p}
function ticksIdx(n){if(n<=1)return [0];if(n<=4)return [0,n-1];var a=[0,Math.round((n-1)/3),Math.round(2*(n-1)/3),n-1];return a.filter(function(v,i){return a.indexOf(v)===i})}
var LC={};
function lineChart(id,dayList,series,opt){
  opt=opt||{};var W=640,H=opt.h||200,L=42,R=14,T=12,B=26,pw=W-L-R,ph=H-T-B,n=dayList.length;
  var all=[1];series.forEach(function(s){all=all.concat(s.vals)});var max=niceMax(Math.max.apply(null,all));
  var yf=opt.yfmt||compact;
  var x=function(i){return L+(n<2?pw/2:i*pw/(n-1))},y=function(v){return T+ph-(v/max)*ph};
  var g="";
  for(var k=0;k<=4;k++){var v=max*k/4,yy=y(v);g+='<line class="grid" x1="'+L+'" x2="'+(W-R)+'" y1="'+yy+'" y2="'+yy+'"/><text class="ax" x="'+(L-8)+'" y="'+(yy+3.5)+'" text-anchor="end">'+yf(v)+'</text>'}
  ticksIdx(n).forEach(function(i,j,a){g+='<text class="ax" x="'+x(i)+'" y="'+(H-6)+'" text-anchor="'+(j===0?"start":j===a.length-1?"end":"middle")+'">'+fmtDay(dayList[i])+'</text>'});
  var body="";
  series.forEach(function(s,si){
    var d=s.vals.map(function(v,i){return (i?"L":"M")+x(i).toFixed(1)+" "+y(v).toFixed(1)}).join(" ");
    if(s.area){body+='<path d="'+d+" L"+x(n-1).toFixed(1)+" "+(T+ph)+" L"+x(0).toFixed(1)+" "+(T+ph)+' Z" fill="'+s.color+'" opacity=".10"/>'}
    body+='<path class="ln" d="'+d+'" stroke="'+s.color+'"/>';
  });
  series.forEach(function(s,si){body+='<circle class="xd" data-s="'+si+'" r="4.5" fill="'+s.color+'" stroke="#fff" stroke-width="2" cx="'+x(n-1)+'" cy="'+y(s.vals[n-1]||0)+'"/>'});
  body+='<line class="xh" y1="'+T+'" y2="'+(T+ph)+'" x1="0" x2="0"/>';
  LC[id]={days:dayList,series:series,W:W,L:L,pw:pw,n:n,x:x,y:y,fmt:opt.vfmt||I,T:T,ph:ph};
  return '<svg class="chart lc" id="'+id+'" viewBox="0 0 '+W+" "+H+'" role="img" aria-label="'+esc(opt.label||"Line chart")+'">'+g+body+'<rect x="'+L+'" y="'+T+'" width="'+pw+'" height="'+ph+'" fill="transparent" class="hit" tabindex="0"/></svg>';
}
function wireLines(){
  $$("svg.lc").forEach(function(svg){
    var c=LC[svg.id];if(!c)return;var xh=$(".xh",svg),dots=$$(".xd",svg),hit=$(".hit",svg);
    var end=function(){xh.style.opacity=0;dots.forEach(function(d,si){d.setAttribute("cx",c.x(c.n-1));d.setAttribute("cy",c.y(c.series[si].vals[c.n-1]||0))});hideTip()};
    var move=function(e){
      var r=svg.getBoundingClientRect(),px=(e.clientX-r.left)*c.W/r.width;
      var i=c.n<2?0:Math.max(0,Math.min(c.n-1,Math.round((px-c.L)/c.pw*(c.n-1))));
      xh.setAttribute("x1",c.x(i));xh.setAttribute("x2",c.x(i));xh.style.opacity=1;
      dots.forEach(function(d,si){d.setAttribute("cx",c.x(i));d.setAttribute("cy",c.y(c.series[si].vals[i]||0))});
      showTip(e.clientX,e.clientY,fmtDay(c.days[i]),null,c.series.map(function(s){return {name:s.name,color:s.color,value:c.fmt(s.vals[i]||0)}}));
    };
    hit.addEventListener("pointermove",move);hit.addEventListener("pointerleave",end);
  });
}
function barChart(dayList,vals,color,opt){
  opt=opt||{};var W=640,H=opt.h||200,L=42,R=14,T=12,B=26,pw=W-L-R,ph=H-T-B,n=dayList.length;
  var max=niceMax(Math.max.apply(null,vals.concat([1])));var yf=opt.yfmt||compact,vf=opt.vfmt||I;
  var slot=pw/n,bw=Math.min(24,Math.max(2,slot*0.7)),g="",bars="",hits="";
  for(var k=0;k<=4;k++){var v=max*k/4,yy=T+ph-(v/max)*ph;g+='<line class="grid" x1="'+L+'" x2="'+(W-R)+'" y1="'+yy+'" y2="'+yy+'"/><text class="ax" x="'+(L-8)+'" y="'+(yy+3.5)+'" text-anchor="end">'+yf(v)+'</text>'}
  ticksIdx(n).forEach(function(i,j,a){g+='<text class="ax" x="'+(L+i*slot+slot/2)+'" y="'+(H-6)+'" text-anchor="'+(j===0?"start":j===a.length-1?"end":"middle")+'">'+fmtDay(dayList[i])+'</text>'});
  vals.forEach(function(v,i){
    var cx=L+i*slot+slot/2,h=Math.max(v>0?2:0,v/max*ph),x0=cx-bw/2,y0=T+ph-h,r=Math.min(4,bw/2,h);
    if(h>0)bars+='<path d="M'+x0+" "+(T+ph)+"V"+(y0+r)+"Q"+x0+" "+y0+" "+(x0+r)+" "+y0+"H"+(x0+bw-r)+"Q"+(x0+bw)+" "+y0+" "+(x0+bw)+" "+(y0+r)+"V"+(T+ph)+'Z" fill="'+color+'"/>';
    hits+='<rect class="bh" x="'+(L+i*slot)+'" y="'+T+'" width="'+slot+'" height="'+ph+'" data-t="'+esc(fmtDay(dayList[i]))+'" data-v="'+esc(vf(v))+'" tabindex="0"/>';
  });
  return '<svg class="chart" viewBox="0 0 '+W+" "+H+'" role="img" aria-label="'+esc(opt.label||"Bar chart")+'">'+g+bars+hits+'</svg>';
}
function hbars(items,fmt,color){
  var max=Math.max.apply(null,items.map(function(i){return i.val}).concat([1]));
  return '<div class="hb">'+items.map(function(i){
    var w=i.val?Math.max(2,i.val/max*100):0;
    return '<div class="hbr" tabindex="0" data-t="'+esc(i.label)+'" data-v="'+esc(fmt(i.val))+'"><span class="hbl">'+esc(i.label)+'</span><span class="hbt"><i class="'+(i.hatch?"hatch":"")+'" style="width:'+w+'%;background:'+(i.color||color||"var(--s1)")+'"></i></span><span class="hbv">'+fmt(i.val)+'</span></div>'}).join("")+'</div>';
}
function donut(items,centerV,centerL,label){
  var R=62,C=2*Math.PI*R,tot=items.reduce(function(a,b){return a+b.val},0),off=0,segs="",live=items.filter(function(x){return x.val>0}).length;
  if(!tot)segs='<circle r="'+R+'" stroke="#F1E8DA" stroke-width="20"/>';
  items.forEach(function(it){if(!it.val)return;var len=it.val/tot*C,gap=live>1?2:0,dash=Math.max(0,len-gap);
    segs+='<circle r="'+R+'" stroke="'+it.color+'" stroke-width="20" stroke-dasharray="'+dash+" "+(C-dash)+'" stroke-dashoffset="'+(-off)+'" data-t="'+esc(it.label)+'" data-v="'+esc(I(it.val)+" ("+Math.round(it.val/tot*100)+"%)")+'"/>';off+=len});
  return '<svg class="donut" viewBox="-80 -80 160 160" role="img" aria-label="'+esc(label||"Donut chart")+'"><g transform="rotate(-90)">'+segs+'</g><text text-anchor="middle" y="4" style="font-size:24px;font-weight:600;fill:var(--ink)">'+centerV+'</text><text text-anchor="middle" y="22" style="font-size:10.5px;fill:var(--muted)">'+centerL+'</text></svg>';
}
function spark(vals,color,cls){
  var n=vals.length,max=Math.max.apply(null,vals.concat([1])),d=vals.map(function(v,i){return (i?"L":"M")+(n<2?50:i*100/(n-1)).toFixed(1)+" "+(26-v/max*24).toFixed(1)}).join(" ");
  return '<svg class="'+(cls||"spark")+'" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true"><path d="'+d+'" fill="none" stroke="'+color+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>';
}
function lerp(a,b,t){return Math.round(a+(b-a)*t)}
function heatColor(t){var c0=[240,229,238],c1=[80,45,85];return "rgb("+lerp(c0[0],c1[0],t)+","+lerp(c0[1],c1[1],t)+","+lerp(c1[2]>0?c0[2]:0,c1[2],t)+")"}
function heatmap(cells){
  var grid={},max=1;cells.forEach(function(c){grid[c.dow+"-"+c.hour]=c.count;if(c.count>max)max=c.count});
  var cw=22,ch=22,L=38,T=4,W=L+24*cw,H=T+7*ch+22,out="";
  var order=[1,2,3,4,5,6,0];
  order.forEach(function(d,r){
    out+='<text class="ax" x="'+(L-8)+'" y="'+(T+r*ch+ch/2+3.5)+'" text-anchor="end">'+DOW[d].slice(0,3)+'</text>';
    for(var h=0;h<24;h++){var v=grid[d+"-"+h]||0;
      out+='<rect class="cell" x="'+(L+h*cw+1)+'" y="'+(T+r*ch+1)+'" width="'+(cw-2)+'" height="'+(ch-2)+'" rx="4" fill="'+(v?heatColor(Math.sqrt(v/max)):"#F6F1EA")+'" data-t="'+DOW[d]+" "+(h<10?"0":"")+h+':00" data-v="'+v+(v===1?" errand":" errands")+'" tabindex="0"/>'}
  });
  [0,3,6,9,12,15,18,21].forEach(function(h){out+='<text class="ax" x="'+(L+h*cw+cw/2)+'" y="'+(H-6)+'" text-anchor="middle">'+(h<10?"0":"")+h+'</text>'});
  return '<svg class="chart hm" viewBox="0 0 '+W+" "+H+'" role="img" aria-label="Errands posted by weekday and hour">'+out+'</svg>';
}
function pctChange(cur,prev){if(!prev)return cur?null:0;return (cur-prev)/prev}
function deltaHtml(cur,prev,goodUp,label,fmt){
  // Tiny numbers make percentages jump around (1 -> 2 is "+100%"), so for
  // small counts (or money that was zero before) say what actually changed.
  var small=(fmt?prev===0:prev<10)||(prev>0&&cur/prev>6);
  if(small){
    var diff=cur-prev,f=fmt||I;
    if(diff===0)return '<i class="flat">0</i><span>same as '+label+'</span>';
    if(fmt&&prev===0)return '<span>New this period</span>';
    var up=diff>0,good=goodUp?up:!up;
    return '<i class="'+(good?"up":"dn")+'">'+(up?"\u25B2 +":"\u25BC \u2212")+f(Math.abs(diff))+'</i><span>vs '+label+'</span>';
  }
  var p=pctChange(cur,prev);
  if(p===null)return '<span>New this period</span>';
  if(Math.abs(p)<0.005)return '<i class="flat">0%</i><span>same as '+label+'</span>';
  var up2=p>0,good2=goodUp?up2:!up2;
  return '<i class="'+(good2?"up":"dn")+'">'+(up2?"\u25B2":"\u25BC")+" "+(Math.abs(p)>5?">500":Math.round(Math.abs(p)*100))+'%</i><span>'+(up2?"up":"down")+' from '+label+'</span>';
}

/* ---------- data ---------- */
function load(force){
  if(!force&&cache&&cache.days===days&&Date.now()-cache.at<60000)return Promise.resolve(cache);
  return Promise.all([api("/analytics?days="+days),api("/insights?days="+days)]).then(function(r){cache={days:days,at:Date.now(),a:r[0],i:r[1]};return cache});
}
function attentionItems(i){
  var a=i.attention,out=[];
  if(a.activeSos)out.push({n:a.activeSos,text:a.activeSos===1?"SOS alert is active":"SOS alerts are active",tone:"red",hint:"Call the person now and check where they are.",go:"safety"});
  if(a.failedRefunds)out.push({n:a.failedRefunds,text:a.failedRefunds===1?"refund failed":"refunds failed",tone:"red",hint:"Paystack rejected them. Retry from the Refunds page.",go:"refunds"});
  if(a.failedPayouts)out.push({n:a.failedPayouts,text:a.failedPayouts===1?"runner payout failed":"runner payouts failed",tone:"red",hint:"Retry from the Payouts page once the bank details are fixed.",go:"payouts"});
  if(a.pendingIncidents)out.push({n:a.pendingIncidents,text:a.pendingIncidents===1?"runner report needs review":"runner reports need review",tone:"amber",hint:"Confirm or dismiss them on the Safety page.",go:"safety"});
  if(a.pendingVerifications)out.push({n:a.pendingVerifications,text:a.pendingVerifications===1?"runner is waiting for identity review":"runners are waiting for identity review",tone:"violet",hint:"They can\u2019t go online until you approve them.",go:"verification"});
  if(a.longWaitingErrands)out.push({n:a.longWaitingErrands,text:a.longWaitingErrands===1?"errand has waited over "+a.longWaitMinutes+" min":"errands have waited over "+a.longWaitMinutes+" min",tone:"amber",hint:"No runner has accepted yet.",go:null});
  if(a.ticketsNeedingReply)out.push({n:a.ticketsNeedingReply,text:a.ticketsNeedingReply===1?"support ticket is open":"support tickets are open",tone:"violet",hint:"Reply or mark them resolved on the Support page.",go:"support"});
  return out;
}
function badges(i){
  var a=i.attention;
  var s=$("#b-support"),r=$("#b-refunds"),v=$("#b-verification"),sf=$("#b-safety"),po=$("#b-payouts"),bell=$("#bell-n");
  if(sf){var sn=a.activeSos+a.pendingIncidents;sf.textContent=sn;sf.hidden=!sn}
  if(po){po.textContent=a.failedPayouts;po.hidden=!a.failedPayouts}
  if(v){v.textContent=a.pendingVerifications;v.hidden=!a.pendingVerifications}
  if(s){s.textContent=a.ticketsNeedingReply;s.hidden=!a.ticketsNeedingReply}
  if(r){r.textContent=a.failedRefunds;r.hidden=!a.failedRefunds}
  var total=attentionItems(i).reduce(function(t,x){return t+x.n},0);
  if(bell){bell.textContent=total;bell.hidden=!total}
}

/* ---------- shell ---------- */
var GOLABEL={refunds:"refunds",support:"support",verification:"verification",safety:"safety",payouts:"payouts"};
var NAV=[["dashboard","Dashboard","grid"],["analytics","Analytics","chart"],["people","People","users"],["verification","Verification","shield"],["safety","Safety","alert"],["payouts","Payouts","wallet"],["support","Support","msg"],["refunds","Refunds","undo"]];
function renderLogin(msg){
  $("#app").innerHTML='<div class="login">'+LOGO+'<h1>Gracerandly admin</h1><p>Enter the admin key to continue.</p>'+(msg?'<div class="err">'+esc(msg)+'</div>':'')+'<input id="k" type="password" placeholder="Admin key" autocomplete="current-password" aria-label="Admin key"><button class="btn" id="go">Sign in</button></div>';
  var go=function(){key=$("#k").value.trim();if(!key)return;sessionStorage.setItem("gr_admin_key",key);start()};
  $("#go").onclick=go;$("#k").onkeydown=function(e){if(e.key==="Enter")go()};$("#k").focus();
}
function renderShell(){
  $("#app").innerHTML='<div class="shell"><aside class="side"><div class="brand">'+LOGO+'Gracerandly<small>admin</small></div>'+
  '<div class="navh">Menu</div><ul class="nav">'+NAV.map(function(n){return '<li><button data-page="'+n[0]+'">'+icon(n[2])+n[1]+(n[0]==="verification"?'<span class="badge" id="b-verification" hidden></span>':n[0]==="safety"?'<span class="badge red" id="b-safety" hidden></span>':n[0]==="payouts"?'<span class="badge red" id="b-payouts" hidden></span>':n[0]==="support"?'<span class="badge" id="b-support" hidden></span>':n[0]==="refunds"?'<span class="badge red" id="b-refunds" hidden></span>':'')+'</button></li>'}).join("")+'</ul>'+
  '<div class="navh" style="margin-top:22px">General</div><ul class="nav"><li><button id="refresh">'+icon("refresh")+'Refresh data</button></li><li><button id="out">'+icon("out")+'Sign out</button></li></ul>'+
  '<div class="sidecard"><h4>Daily numbers</h4><p>Errands, money and sign-ups for every day, ready for a spreadsheet.</p><button id="csv">'+icon("down")+'Download CSV</button></div></aside>'+
  '<div class="main"><header class="top"><div class="search"><span>'+icon("search")+'</span><input id="q" type="search" placeholder="Search errands, tickets, people" aria-label="Search" autocomplete="off"><span class="kbd">Ctrl K</span><div class="results" id="sr" hidden></div></div>'+
  '<div class="topr"><button class="circ" id="mailb" aria-label="Open support">'+icon("mail")+'</button><button class="circ" id="bellb" aria-label="Things that need attention">'+icon("bell")+'<span class="dot" id="bell-n" hidden></span></button><div class="me"><div class="avatar" aria-hidden="true">GR</div><div><b>Staff</b><span>Admin key session</span></div></div><div class="pop" id="pop" hidden></div></div></header>'+
  '<main class="content" id="content"></main></div></div>';
  $$("[data-page]").forEach(function(b){b.onclick=function(){go(b.getAttribute("data-page"))}});
  $("#out").onclick=function(){sessionStorage.removeItem("gr_admin_key");key="";cache=null;renderLogin()};
  $("#refresh").onclick=function(){cache=null;route(true)};
  $("#csv").onclick=downloadCsv;
  $("#mailb").onclick=function(){go("support")};
  $("#bellb").onclick=function(e){e.stopPropagation();togglePop()};
  document.addEventListener("click",function(e){var p=$("#pop");if(p&&!p.hidden&&!e.target.closest(".topr"))p.hidden=true;var s=$("#sr");if(s&&!e.target.closest(".search"))s.hidden=true});
  wireSearch();
}
function togglePop(){
  var p=$("#pop");if(!p.hidden){p.hidden=true;return}
  p.hidden=false;p.innerHTML='<h4>Needs attention</h4><div class="muted">Loading…</div>';
  load(false).then(function(c){var items=attentionItems(c.i);
    p.innerHTML='<h4>Needs attention</h4>'+(items.length?'<ul class="list att">'+items.map(function(x){return '<li><span class="tone '+x.tone+'"></span><div class="grow"><div class="t">'+x.n+" "+esc(x.text)+'</div></div>'+(x.go?'<button class="btn ghost small" data-go="'+x.go+'">Open</button>':'')+'</li>'}).join("")+'</ul>':'<div class="clear">'+icon("ok")+'All clear</div>');
    $$("[data-go]",p).forEach(function(b){b.onclick=function(){p.hidden=true;go(b.getAttribute("data-go"))}});
  }).catch(fail);
}
function downloadCsv(){
  fetch("/admin/api/analytics/daily.csv?days="+days,{headers:{"x-admin-key":key}}).then(function(r){return r.blob()}).then(function(b){var a=document.createElement("a");a.href=URL.createObjectURL(b);a.download="gracerandly-daily.csv";a.click()});
}
function go(p){page=p;sessionStorage.setItem("gr_admin_page",p);route(false)}
function head(title,sub,acts){return '<div class="head"><div><h1>'+title+'</h1><p>'+sub+'</p></div><div class="acts">'+(acts||"")+'</div></div><div class="err" id="err" hidden></div>'}
function periodSelect(){return '<select class="btn" id="days" aria-label="Period">'+[7,30,90].map(function(d){return '<option value="'+d+'"'+(d===days?" selected":"")+'>Last '+d+' days</option>'}).join("")+'</select>'}
function wirePeriod(){var s=$("#days");if(s)s.onchange=function(){days=Number(s.value);sessionStorage.setItem("gr_admin_days",days);route(false)}}
function route(force){
  $$("[data-page]").forEach(function(b){b.classList.toggle("on",b.getAttribute("data-page")===page);if(b.getAttribute("data-page")===page)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current")});
  var c=$("#content");
  if(page==="dashboard")dashboardPage(force);else if(page==="analytics")analyticsPage(force);else if(page==="people")peoplePage();else if(page==="verification")verificationPage();else if(page==="safety")safetyPage();else if(page==="payouts")payoutsPage();else if(page==="support")supportPage();else refundsPage();
  window.scrollTo(0,0);
}
function withData(force,render){
  var c=$("#content");c.classList.add("busy");
  load(force).then(function(d){c.classList.remove("busy");render(d);badges(d.i);wirePeriod();wireLines()}).catch(function(e){c.classList.remove("busy");fail(e)});
}
function skeletonHead(title,sub,acts){var c=$("#content");if(!c.firstChild||c.getAttribute("data-page")!==page){c.setAttribute("data-page",page);c.innerHTML=head(title,sub,acts)+'<div class="muted">Loading…</div>'}}

/* ---------- dashboard ---------- */
function statCard(o){
  return '<section class="card stat'+(o.hero?" hero":"")+'"><div class="lbl">'+o.label+'</div><button class="go" data-page-go="analytics" aria-label="See more in Analytics">'+icon("ne")+'</button><div class="val">'+o.value+'</div><div class="delta">'+o.delta+'</div></section>';
}
function weekdayPills(wk){
  var max=Math.max.apply(null,wk.concat([1])),letters=["S","M","T","W","T","F","S"],top=wk.indexOf(Math.max.apply(null,wk));
  var order=[1,2,3,4,5,6,0];
  return '<div class="wk" role="img" aria-label="Errands posted by weekday">'+order.map(function(d,idx){
    var v=wk[d],r=v/max,h=Math.max(16,Math.round(r*100)),cls=(v===Math.max.apply(null,wk)&&v>0)?"t1":r>=0.6?"t2":"t3";
    return '<div class="col" tabindex="0" data-t="'+DOW[d]+'" data-v="'+v+(v===1?" errand":" errands")+'"><div class="pill '+cls+'" style="height:'+h+'%;animation-delay:'+(idx*60)+'ms">'+((v===Math.max.apply(null,wk)&&v>0)?'<span class="bub">'+v+'</span>':'')+'</div><span>'+letters[d]+'</span></div>'}).join("")+'</div>';
}
function halfDonut(items,centerV,centerL){
  var tot=items.reduce(function(a,b){return a+b.val},0),off=0,segs="",live=items.filter(function(x){return x.val>0}).length;
  var d="M 20 112 A 90 90 0 0 1 200 112";
  segs+='<path d="'+d+'" pathLength="100" fill="none" stroke="#F1E8DA" stroke-width="26"/>';
  items.forEach(function(it){if(!it.val)return;var len=it.val/tot*100,gap=live>1?1.2:0,dash=Math.max(0.5,len-gap);
    segs+='<path d="'+d+'" pathLength="100" fill="none" stroke="'+it.color+'" stroke-width="26" stroke-dasharray="'+dash+" "+(100-dash)+'" stroke-dashoffset="'+(-off)+'" data-t="'+esc(it.label)+'" data-v="'+esc(I(it.val)+" ("+Math.round(it.val/tot*100)+"%)")+'"/>';off+=len});
  return '<svg class="half" viewBox="0 0 220 130" role="img" aria-label="Share of errands by outcome">'+segs+'<text x="110" y="100" text-anchor="middle" style="font-size:36px;font-weight:600;fill:var(--ink)">'+centerV+'</text><text x="110" y="120" text-anchor="middle" style="font-size:11px;fill:var(--muted)">'+centerL+'</text></svg>';
}
function groupOutcome(mix){
  var g={delivered:0,progress:0,waiting:0,cancelled:0};
  mix.forEach(function(s){if(s.status==="delivered")g.delivered+=s.count;else if(s.status==="cancelled")g.cancelled+=s.count;else if(s.status==="pending_match")g.waiting+=s.count;else g.progress+=s.count});
  return g;
}
function statusPill(s){var cls=s==="delivered"?"p-good":s==="cancelled"?"p-bad":s==="pending_match"?"p-warn":"p-info";return '<span class="pillx '+cls+'">'+esc(STATUS[s]||s)+'</span>'}
function initials(name){return String(name).split(/\s+/).slice(0,2).map(function(p){return p.charAt(0)}).join("").toUpperCase()}
function avColor(name){var h=0;for(var k=0;k<name.length;k++)h=(h*31+name.charCodeAt(k))%AVCOL.length;return AVCOL[h]}
function dashboardPage(force){
  var c=$("#content");
  skeletonHead("Dashboard","See how errands, money and people are doing across Gracerandly.",periodSelect());
  withData(force,function(d){
    var a=d.a,i=d.i,prevLabel="previous "+d.days+" days",e=a.errands,m=a.money,out=groupOutcome(i.statusMix),att=attentionItems(i);
    var total=out.delivered+out.progress+out.waiting+out.cancelled,rate=total?Math.round(out.delivered/total*100):null;
    var avgSeries=i.daily.map(function(x){return x.avgMinutesToDeliver===null?0:x.avgMinutesToDeliver});
    var top1=att[0];
    var attHtml='<section class="card att"><h3>Needs attention</h3>'+(top1?
      '<div class="top1">'+top1.n+" "+esc(top1.text)+'</div><p class="desc">'+esc(top1.hint)+'</p>'+(att.length>1?'<ul>'+att.slice(1,4).map(function(x){return '<li><span class="tone '+x.tone+'"></span>'+x.n+" "+esc(x.text)+'</li>'}).join("")+'</ul>':'')+
      (top1.go?'<button class="btn" data-go="'+top1.go+'">Open '+GOLABEL[top1.go]+'</button>':(att.some(function(x){return x.go})?'<button class="btn ghost" data-go="'+att.filter(function(x){return x.go})[0].go+'">Open '+GOLABEL[att.filter(function(x){return x.go})[0].go]+'</button>':'')):
      '<div class="clear">'+icon("ok")+'All clear</div><p class="desc">Nothing is waiting on staff right now.</p>')+'</section>';
    var latest='<section class="card"><div class="cardh"><h3>Latest errands</h3></div><ul class="list">'+(i.recentErrands.length?i.recentErrands.slice(0,5).map(function(x){return '<li class="clk" data-erow="'+x.id+'" tabindex="0" style="cursor:pointer"><span class="gl">'+icon(x.category)+'</span><div class="grow"><div class="t">'+esc(CATNAME[x.category]||x.category)+" · "+N(x.fee)+'</div><div class="m">'+esc(x.requester)+" · "+ago(x.createdAt)+'</div></div>'+statusPill(x.status)+'</li>'}).join(""):'<li class="muted">No errands yet.</li>')+'</ul></section>';
    var runners='<section class="card"><div class="cardh"><h3>Top runners</h3></div><p class="sub">Most deliveries in the last '+d.days+' days</p><ul class="list">'+(i.topRunners.length?i.topRunners.slice(0,4).map(function(r){return '<li><span class="av" style="background:'+avColor(r.name)+'">'+esc(initials(r.name))+'</span><div class="grow"><div class="t">'+esc(r.name)+'</div><div class="m">'+r.delivered+(r.delivered===1?" delivery":" deliveries")+" · "+N(r.earned)+(r.rating?" · "+r.rating+" stars":"")+'</div></div><span class="pillx '+(TIERCLS[r.tier]||"p-mute")+'">'+esc(r.tier.charAt(0).toUpperCase()+r.tier.slice(1))+'</span></li>'}).join(""):'<li class="muted">No deliveries yet.</li>')+'</ul></section>';
    var comp='<section class="card"><h3>Errand outcomes</h3><p class="sub">Where the '+I(total)+' errands posted in this period stand</p>'+halfDonut([{label:"Delivered",val:out.delivered,color:"#502D55"},{label:"In progress",val:out.progress,color:"#935073"},{label:"Waiting for a runner",val:out.waiting,color:"#E2B58C"},{label:"Cancelled",val:out.cancelled,color:"url(#hatch)"}],rate===null?"—":rate+"%",rate===null?"no errands yet":"delivered")+
      '<div class="lgd" style="justify-content:center;margin-top:8px"><span><i class="sw" style="background:#502D55"></i>Delivered</span><span><i class="sw" style="background:#935073"></i>In progress</span><span><i class="sw" style="background:#E2B58C"></i>Waiting</span><span><i class="sw hatch"></i>Cancelled</span></div></section>';
    var trk='<section class="card trk"><svg class="swirl" viewBox="0 0 200 200" aria-hidden="true"><g fill="none" stroke="#fff" stroke-width="1.5"><circle cx="100" cy="100" r="30"/><circle cx="100" cy="100" r="50"/><circle cx="100" cy="100" r="70"/><circle cx="100" cy="100" r="90"/></g></svg><h3>Average time to deliver</h3><div class="big">'+mins(e.avgMinutesToDeliver)+'</div>'+spark(avgSeries,"#F6DBC0","spk")+'<div class="chips"><span>'+I(e.inProgressNow)+' in progress now</span><span>'+I(e.openNow)+' waiting for a runner</span></div></section>';
    c.setAttribute("data-page","dashboard");
    c.innerHTML=head("Dashboard","See how errands, money and people are doing across Gracerandly.",periodSelect()+'<button class="btn" id="csv2">'+icon("down")+'Export CSV</button>')+
    '<div class="grid">'+
      '<div class="c3">'+statCard({hero:true,label:"Errands posted",value:I(e.posted),delta:deltaHtml(e.posted,i.previous.posted,true,prevLabel)})+'</div>'+
      '<div class="c3">'+statCard({label:"Errands delivered",value:I(e.delivered),delta:deltaHtml(e.delivered,i.previous.delivered,true,prevLabel)})+'</div>'+
      '<div class="c3">'+statCard({label:"Paid in",value:Nc(m.paidIn),delta:deltaHtml(m.paidIn,i.previous.paidIn,true,prevLabel,Nc)})+'</div>'+
      '<div class="c3">'+statCard({label:"New people",value:I(a.users.newRequesters+a.users.newRunners),delta:deltaHtml(a.users.newRequesters+a.users.newRunners,i.previous.newUsers,true,prevLabel)})+'</div>'+
      '<section class="card c5"><div class="cardh"><h3>Busiest days</h3></div><p class="sub">Errands posted per weekday, last '+d.days+' days</p>'+weekdayPills(i.weekday)+'</section>'+
      '<div class="c3">'+attHtml+'</div><div class="c4">'+latest+'</div>'+
      '<div class="c5">'+runners+'</div><div class="c4">'+comp+'</div><div class="c3">'+trk+'</div>'+
    '</div>';
    $$("[data-page-go]").forEach(function(b){b.onclick=function(){go(b.getAttribute("data-page-go"))}});
    wireErrandRows(c,function(){go("dashboard")});
    $$("[data-go]",c).forEach(function(b){b.onclick=function(){go(b.getAttribute("data-go"))}});
    $("#csv2").onclick=downloadCsv;
  });
}

/* ---------- analytics ---------- */
function miniStat(label,value,delta,sparkVals,color){
  return '<section class="card stat" style="min-height:132px"><div class="lbl" style="font-size:14px;padding-right:0">'+label+'</div><div class="val" style="font-size:34px">'+value+'</div><div class="delta"'+(sparkVals?' style="max-width:62%"':"")+'>'+delta+'</div>'+(sparkVals?spark(sparkVals,color,"spark"):'')+'</section>';
}
function analyticsPage(force){
  var c=$("#content");
  skeletonHead("Analytics","Charts for every part of the system: errands, money, people, support and safety.",periodSelect());
  withData(force,function(d){
    var a=d.a,i=d.i,e=a.errands,m=a.money,u=a.users,r=a.referrals,s=a.support,prev="previous "+d.days+" days";
    var dayList=a.daily.map(function(x){return x.day});
    var posted=a.daily.map(function(x){return x.posted}),deliv=a.daily.map(function(x){return x.delivered}),canc=i.daily.map(function(x){return x.cancelled});
    var paid=a.daily.map(function(x){return x.paidIn}),comm=i.daily.map(function(x){return x.commission});
    var reqCum=[],runCum=[],rq=i.usersBefore.requesters,rn=i.usersBefore.runners;
    i.daily.forEach(function(x){rq+=x.newRequesters;rn+=x.newRunners;reqCum.push(rq);runCum.push(rn)});
    var cats=CAT.map(function(k,idx){var f=e.byCategory.filter(function(x){return x.category===k})[0];return {label:CATNAME[k],val:f?f.count:0,color:CATCOL[idx]}});
    var catTotal=cats.reduce(function(t,x){return t+x.val},0);
    var stages=["pending_match","accepted","en_route_to_pickup","in_progress","en_route_to_delivery","delivered","cancelled"].map(function(k,idx){var f=i.statusMix.filter(function(x){return x.status===k})[0];return {label:STATUS[k],val:f?f.count:0,color:k==="cancelled"?"#935073":STAGE_RAMP[Math.min(idx,5)],hatch:k==="cancelled"}});
    var PAYL={pending:"Started, not paid",escrowed:"Paid, held in escrow",released:"Released to runner",disbursed:"Paid out to runner",refunded:"Refunded",failed:"Failed"};
    var pays=Object.keys(PAYL).map(function(k){var f=i.payments.filter(function(x){return x.status===k})[0];return {label:PAYL[k],val:f?f.count:0}});
    var flow=[{label:"Paid in",val:m.paidIn},{label:"Delivery fees",val:m.feeVolume},{label:"Commission earned",val:m.commission},{label:"Paid to runners",val:m.runnerPayoutsSent},{label:"Refunded",val:m.refunded},{label:"Referral credit",val:m.referralCreditGiven}];
    var tiers=TIERS.map(function(k,idx){var f=i.tiers.filter(function(x){return x.tier===k})[0];return {label:k.charAt(0).toUpperCase()+k.slice(1),val:f?f.count:0,color:["#EAD7E4","#C58FAD","#8E4A74","#502D55"][idx]}});
    var runnersTotal=tiers.reduce(function(t,x){return t+x.val},0);
    var RR={cancelled:"Cancelled errands",items_leftover:"Unspent items money",admin:"Staff refunds"};
    var refR=Object.keys(RR).map(function(k){var f=i.refunds.byReason.filter(function(x){return x.reason===k})[0];return {label:RR[k],val:f?f.count:0,amt:f?f.amount:0}});
    var SC={payment:"Payment",errand_problem:"Errand problem",other_person:"Other person",account:"Account",safety:"Safety",other:"Other"};
    var supp=Object.keys(SC).map(function(k){var f=i.support.byCategory.filter(function(x){return x.category===k})[0];return {label:SC[k],val:f?f.count:0}});
    var ratingMax=Math.max.apply(null,i.ratings.distribution.concat([1]));
    var ratingCols='<div class="wk" style="height:96px;gap:8px">'+i.ratings.distribution.map(function(v,idx){return '<div class="col" tabindex="0" data-t="'+(idx+1)+(idx?" stars":" star")+'" data-v="'+v+(v===1?" review":" reviews")+'"><div class="pill t2" style="height:'+Math.max(8,Math.round(v/ratingMax*100))+'%;max-width:30px;animation:none;background:var(--s1)"></div><span>'+(idx+1)+'</span></div>'}).join("")+'</div>';
    var verifiedPct=u.runners?Math.round(u.verifiedRunners/u.runners*100):0;
    var rows=a.daily.map(function(x,idx){var y=i.daily[idx];return '<tr><td>'+fmtDay(x.day)+'</td><td class="n">'+x.posted+'</td><td class="n">'+x.delivered+'</td><td class="n">'+y.cancelled+'</td><td class="n">'+N(x.paidIn)+'</td><td class="n">'+N(y.commission)+'</td><td class="n">'+N(y.refunded)+'</td><td class="n">'+(y.newRequesters+y.newRunners)+'</td></tr>'}).reverse().join("");
    c.setAttribute("data-page","analytics");
    c.innerHTML=head("Analytics","Charts for every part of the system: errands, money, people, support and safety.",periodSelect()+'<button class="btn" id="csv2">'+icon("down")+'Export CSV</button>')+
    '<div class="grid">'+
      '<div class="c3">'+miniStat("Paid in",N(m.paidIn),deltaHtml(m.paidIn,i.previous.paidIn,true,prev,Nc),paid,"var(--s1)")+'</div>'+
      '<div class="c3">'+miniStat("Commission earned",N(m.commission),deltaHtml(m.commission,i.previous.commission,true,prev,Nc),comm,"var(--s1)")+'</div>'+
      '<div class="c3">'+miniStat("Average delivery fee",m.avgFee===null?"—":N(m.avgFee),'<span>Across paid errands</span>',null)+'</div>'+
      '<div class="c3">'+miniStat("Completion rate",e.completionRate===null?"—":Math.round(e.completionRate*100)+"%",deltaHtml(e.cancelled,i.previous.cancelled,false,prev).replace("<span>up from","<span>cancellations up from").replace("<span>down from","<span>cancellations down from").replace("<span>vs ","<span>cancelled vs "),null)+'</div>'+
      '<section class="card c8"><h3>Errands per day</h3><p class="sub">Posted, delivered and cancelled, last '+d.days+' days</p><div class="lgd"><span><i class="sw line" style="background:var(--s1)"></i>Posted</span><span><i class="sw line" style="background:var(--s2)"></i>Delivered</span><span><i class="sw line" style="background:var(--s3)"></i>Cancelled</span></div>'+lineChart("lc-errands",dayList,[{name:"Posted",color:"#9c4a78",vals:posted,area:true},{name:"Delivered",color:"#2f7fb3",vals:deliv},{name:"Cancelled",color:"#cf8410",vals:canc}],{label:"Errands posted, delivered and cancelled per day"})+'</section>'+
      '<section class="card c4"><h3>By category</h3><p class="sub">Errands posted in the period</p><div class="donutw">'+donut(cats,I(catTotal),"errands","Errands by category")+'<div class="legend">'+cats.map(function(x){return '<div><i class="sw" style="background:'+x.color+'"></i>'+esc(x.label)+'<b>'+I(x.val)+'</b></div>'}).join("")+'</div></div></section>'+
      '<section class="card c6"><h3>Money paid in per day</h3><p class="sub">What requesters paid: fee plus items budget, after credit</p>'+barChart(dayList,paid,"#9c4a78",{yfmt:Nc,vfmt:N,label:"Money paid in per day"})+'</section>'+
      '<section class="card c6"><h3>Commission earned per day</h3><p class="sub">Gracerandly’s cut of delivered errands</p>'+lineChart("lc-comm",dayList,[{name:"Commission",color:"#9c4a78",vals:comm,area:true}],{yfmt:Nc,vfmt:N,label:"Commission earned per day"})+'</section>'+
      '<section class="card c12"><h3>When errands are posted</h3><p class="sub">Weekday by hour of day (Lagos time). Darker means more errands.</p>'+heatmap(i.heatmap)+'<div class="lgd" style="margin-top:8px"><span>Fewer<i class="sw" style="background:'+heatColor(0.05)+'"></i><i class="sw" style="background:'+heatColor(0.4)+'"></i><i class="sw" style="background:'+heatColor(0.7)+'"></i><i class="sw" style="background:'+heatColor(1)+'"></i>More</span></div></section>'+
      '<section class="card c4"><h3>Errand pipeline</h3><p class="sub">Where posted errands are now</p>'+hbars(stages,I)+'</section>'+
      '<section class="card c4"><h3>Payments</h3><p class="sub">Payment attempts by outcome</p>'+hbars(pays,I,"var(--s1)")+'</section>'+
      '<section class="card c4"><h3>Money flow</h3><p class="sub">Totals for the period</p>'+hbars(flow,Nc,"var(--s1)")+'</section>'+
      '<section class="card c6"><h3>People over time</h3><p class="sub">Everyone signed up so far</p><div class="lgd"><span><i class="sw line" style="background:var(--s1)"></i>Requesters</span><span><i class="sw line" style="background:var(--s2)"></i>Runners</span></div>'+lineChart("lc-people",dayList,[{name:"Requesters",color:"#9c4a78",vals:reqCum},{name:"Runners",color:"#2f7fb3",vals:runCum}],{label:"Total requesters and runners over time"})+'</section>'+
      '<section class="card c3"><h3>Runner tiers</h3><p class="sub">'+I(runnersTotal)+' runners</p>'+hbars(tiers,I)+'<div class="kv"><span>Identity verified</span><b>'+I(u.verifiedRunners)+" of "+I(u.runners)+'</b></div><div class="meter" role="img" aria-label="'+verifiedPct+'% of runners verified"><i style="width:'+verifiedPct+'%"></i></div></section>'+
      '<section class="card c3"><h3>Ratings</h3><p class="sub">Requesters rating runners</p><div class="rate"><b>'+(i.ratings.average===null?"—":i.ratings.average)+'</b><span>'+I(i.ratings.count)+(i.ratings.count===1?" review":" reviews")+'</span></div>'+ratingCols+'<div class="muted" style="font-size:12px;margin-top:6px">Stars, 1 to 5</div></section>'+
      '<section class="card c4"><h3>Refunds</h3><p class="sub">Money sent back to requesters</p>'+hbars(refR.map(function(x){return {label:x.label,val:x.val}}),I,"var(--s1)")+'<div class="kv"><span>Total refunded</span><b>'+N(m.refunded)+'</b><span>Failed, need a retry</span><b>'+I(m.refundsNeedingAttention)+'</b></div></section>'+
      '<section class="card c4"><h3>Support</h3><p class="sub">New tickets by topic</p>'+hbars(supp,I,"var(--s1)")+'<div class="kv"><span>Open now</span><b>'+I(s.open)+'</b><span>Waiting on the user</span><b>'+I(s.awaitingUser)+'</b><span>Resolved this period</span><b>'+I(s.resolvedInPeriod)+'</b></div></section>'+
      '<section class="card c4"><h3>Referrals and safety</h3><p class="sub">Growth and SOS</p>'+hbars([{label:"Joined with a code",val:r.invited},{label:"Completed first errand",val:r.qualified}],I,"var(--s1)")+'<div class="kv"><span>Rewards waiting</span><b>'+N(r.rewardsOutstandingNaira)+'</b><span>Rewards used</span><b>'+N(r.rewardsUsedNaira)+'</b><span>SOS alerts this period</span><b>'+I(i.sos.triggered)+'</b><span>SOS active now</span><b>'+I(i.sos.activeNow)+'</b></div></section>'+
    '</div>'+
    '<details class="tbl"><summary>Show the daily numbers as a table</summary><div class="twrap"><table><thead><tr><th>Day</th><th class="n">Posted</th><th class="n">Delivered</th><th class="n">Cancelled</th><th class="n">Paid in</th><th class="n">Commission</th><th class="n">Refunded</th><th class="n">New people</th></tr></thead><tbody>'+rows+'</tbody></table></div></details>';
    $("#csv2").onclick=downloadCsv;
  });
}

/* ---------- verification ---------- */
var vFilter="pending";
function verificationPage(){
  var c=$("#content");c.setAttribute("data-page","verification");
  c.innerHTML=head("Verification","Review the ID details runners submit. Runners can’t go online until you approve them.",'<select class="btn" id="vf" aria-label="Show runners"><option value="pending">Waiting for review</option><option value="rejected">Sent back</option><option value="approved">Approved</option><option value="unsubmitted">Not submitted</option></select>')+'<div id="view">Loading…</div>';
  var f=$("#vf");f.value=vFilter;f.onchange=function(){vFilter=f.value;verificationList()};
  load(false).then(function(d){badges(d.i)}).catch(function(){});
  verificationList();
}
function vLabel(s){return s==="pending"?"Waiting":s==="rejected"?"Sent back":s==="approved"?"Approved":"Not submitted"}
function verificationList(){
  api("/verifications?status="+vFilter).then(function(r){
    $("#view").innerHTML=r.runners.length?r.runners.map(function(x){
      return '<button class="tk" data-id="'+x.id+'"><span class="av" style="background:'+avColor(x.fullName)+'">'+esc(initials(x.fullName))+'</span><div class="grow" style="flex:1;min-width:0"><div class="t" style="font-weight:600">'+esc(x.fullName)+'</div><div class="m muted" style="font-size:12px">'+esc(x.phone)+(x.ninMasked?" · NIN "+esc(x.ninMasked):"")+(x.submittedAt?" · submitted "+ago(x.submittedAt):"")+'</div></div><span class="pillx '+(x.status==="pending"?"p-warn":x.status==="approved"?"p-good":x.status==="rejected"?"p-bad":"p-mute")+'">'+vLabel(x.status)+'</span></button>'}).join(""):'<div class="card"><div class="clear">'+icon("ok")+'Nothing here</div><p class="desc muted">No runners in this list.</p></div>';
    $$(".tk").forEach(function(b){b.onclick=function(){verificationOpen(b.getAttribute("data-id"))}});
  }).catch(fail);
}
function maskId(v){return v?v.slice(0,3)+" •••• "+v.slice(-3):"—"}
function verificationOpen(id){
  page="verification";sessionStorage.setItem("gr_admin_page",page);
  api("/verifications/"+id).then(function(r){
    var x=r.runner,g=x.guarantor,fl=r.flags,c=$("#content"),st=x.status;c.setAttribute("data-page","verification");
    $$("[data-page]").forEach(function(b){b.classList.toggle("on",b.getAttribute("data-page")==="verification")});
    var flags=[];
    if(fl.otherAccountsWithSameId)flags.push(fl.otherAccountsWithSameId+(fl.otherAccountsWithSameId===1?" other account uses":" other accounts use")+" the same NIN or BVN");
    if(fl.otherRunnersWithSameGuarantor)flags.push(fl.otherRunnersWithSameGuarantor+(fl.otherRunnersWithSameGuarantor===1?" other runner lists":" other runners list")+" the same guarantor phone");
    c.innerHTML=head(esc(x.fullName),esc(x.phone)+(x.email?" · "+esc(x.email):"")+" · joined "+new Date(x.joinedAt).toLocaleDateString()+" · "+x.deliveredErrands+" deliveries",'<button class="btn ghost" id="back">Back to list</button>')+
    (flags.length?'<div class="err" style="background:var(--warnbg);color:var(--warn)"><b>Check before approving</b><ul style="margin:6px 0 0 18px;padding:0">'+flags.map(function(t){return '<li>'+esc(t)+'</li>'}).join("")+'</ul></div>':'')+
    '<div class="grid"><section class="card c6"><h3>Identity</h3><div class="kv"><span>NIN</span><b id="nin">'+esc(maskId(x.nin))+'</b><span>BVN</span><b id="bvn">'+esc(maskId(x.bvn))+'</b></div>'+(x.nin||x.bvn?'<p style="margin:12px 0 0"><button class="btn ghost small" id="show">Show full numbers</button></p>':'')+
    '<p class="sub" style="margin-top:14px">These are only checked for format. Compare them with what you know about the runner before approving.</p></section>'+
    '<section class="card c6"><h3>Guarantor</h3>'+(g?'<div class="kv"><span>Name</span><b>'+esc(g.fullName)+'</b><span>Phone</span><b>'+esc(g.phone)+'</b><span>Relationship</span><b>'+esc(g.relationship)+'</b></div>':'<p class="muted">No guarantor submitted.</p>')+'</section>'+
    '<section class="card c12"><h3>Decision</h3><p class="sub">Status: <b>'+esc(vLabel(st))+'</b>'+(x.submittedAt?" · submitted "+new Date(x.submittedAt).toLocaleString():"")+(x.reviewedAt&&st!=="pending"?" · reviewed "+new Date(x.reviewedAt).toLocaleString():"")+'</p>'+(x.note&&st==="rejected"?'<p class="muted">Reason sent to the runner: '+esc(x.note)+'</p>':'')+
    (st==="unsubmitted"?'<p class="muted">This runner hasn’t submitted their details yet.</p>':'<textarea class="in" id="why" placeholder="'+(st==="approved"?"Why you are removing this runner’s verification (the runner sees this)":"If you send this back, tell the runner what to fix (the runner sees this)")+'" aria-label="Reason"></textarea><div class="fld">'+(st!=="approved"?'<button class="btn" id="ok">Approve runner</button>':'')+'<button class="btn ghost" id="no">'+(st==="approved"?"Remove verification":"Send back with this reason")+'</button></div>')+'</section></div>';
    $("#back").onclick=function(){verificationPage()};
    var sh=$("#show");if(sh)sh.onclick=function(){$("#nin").textContent=x.nin||"—";$("#bvn").textContent=x.bvn||"—";sh.hidden=true};
    var ok=$("#ok");if(ok)ok.onclick=function(){ok.disabled=true;api("/verifications/"+id+"/approve",{method:"POST"}).then(function(){cache=null;verificationPage()}).catch(function(e){ok.disabled=false;fail(e)})};
    var no=$("#no");if(no)no.onclick=function(){var w=$("#why").value.trim();if(w.length<5){fail(new Error("Write a reason of at least 5 characters"));return}no.disabled=true;api("/verifications/"+id+"/reject",{method:"POST",body:JSON.stringify({reason:w})}).then(function(){cache=null;verificationPage()}).catch(function(e){no.disabled=false;fail(e)})};
  }).catch(fail);
}

/* ---------- safety (SOS + incidents) ---------- */
var safetyTab=sessionStorage.getItem("gr_admin_stab")||"sos",incView="pending";
var INCTYPE={geofence_mismatch:"Wrong location at pickup or drop-off",route_deviation:"Left the expected route",theft_confirmed:"Theft confirmed",dispute_lost:"Lost a dispute",sos_triggered:"SOS was raised",other:"Other"};
function telLink(p){return p?'<a href="tel:'+esc(p)+'" style="color:var(--deep);font-weight:500">'+esc(p)+'</a>':"—"}
function safetyPage(){
  var c=$("#content");c.setAttribute("data-page","safety");
  c.innerHTML=head("Safety","Respond to SOS alerts and review reports about runners.",'<select class="btn" id="stab" aria-label="Show"><option value="sos">SOS alerts</option><option value="incidents">Runner incidents</option></select>')+'<div id="view">Loading…</div>';
  var f=$("#stab");f.value=safetyTab;f.onchange=function(){safetyTab=f.value;sessionStorage.setItem("gr_admin_stab",safetyTab);safetyPage()};
  load(false).then(function(d){badges(d.i)}).catch(function(){});
  if(safetyTab==="sos")sosList();else incidentList();
}
function sosList(){
  api("/sos").then(function(r){
    $("#view").innerHTML=(r.alerts.length?r.alerts.map(function(a){
      var t=a.triggeredBy,o=a.otherParty,live=a.status==="active",maps="https://www.google.com/maps?q="+a.location.lat+","+a.location.lng;
      return '<section class="card" style="margin-bottom:12px'+(live?";box-shadow:0 0 0 2px var(--bad)":"")+'"><div class="cardh"><h3>'+esc(t.name||"Someone")+' ('+esc(t.role)+') pressed SOS</h3><span class="pillx '+(live?"p-bad":"p-mute")+'">'+(live?"Active":"Closed"+(a.resolvedBy?" by "+(a.resolvedBy==="self"?"the person":a.resolvedBy==="auto"?"the system":"staff"):""))+'</span></div>'+
      '<p class="sub">'+esc(CATNAME[a.category]||a.category)+" errand · "+esc(STATUS[a.errandStatus]||a.errandStatus)+" · raised "+ago(a.createdAt)+(a.updateCount?" · "+a.updateCount+" location updates":"")+'</p>'+
      '<div class="kv"><span>Phone</span><b>'+telLink(t.phone)+'</b><span>Other person ('+esc(o.role)+')</span><b>'+(o.name?esc(o.name)+" · ":"")+telLink(o.phone)+'</b><span>Last known location</span><b><a href="'+maps+'" target="_blank" rel="noopener" style="color:var(--deep)">Open in maps</a></b><span>Safety team texted</span><b>'+(a.notifiedCount?a.notifiedCount+(a.notifiedCount===1?" person":" people"):"nobody")+'</b></div>'+
      (live&&!a.notifiedCount?'<div class="err" style="background:var(--warnbg);color:var(--warn);margin:12px 0 0">Nobody was texted for this alert. Call '+esc(t.name||"them")+' now, and check SOS_ALERT_PHONES and your SMS provider.</div>':'')+
      (live?'<div class="fld"><button class="btn" data-resolve="'+a.id+'">Mark as handled</button></div>':'')+'</section>'}).join(""):'<div class="card"><div class="clear">'+icon("ok")+'No SOS alerts</div><p class="desc muted">Nothing has been raised yet.</p></div>');
    $$("[data-resolve]").forEach(function(b){b.onclick=function(){b.disabled=true;api("/sos/"+b.getAttribute("data-resolve")+"/resolve",{method:"POST"}).then(function(){cache=null;safetyPage()}).catch(function(e){b.disabled=false;fail(e)})}});
  }).catch(fail);
}
function incidentList(){
  var h='<div class="fld"><select class="btn" id="iv" aria-label="Show incidents"><option value="pending">Needs review</option><option value="confirmed">Confirmed</option><option value="dismissed">Dismissed</option></select></div><div id="ilist">Loading…</div>';
  $("#view").innerHTML=h;var f=$("#iv");f.value=incView;f.onchange=function(){incView=f.value;incidentList()};
  api("/incidents?view="+incView).then(function(r){
    $("#ilist").innerHTML=r.incidents.length?r.incidents.map(function(x){
      return '<section class="card" style="margin-bottom:12px"><div class="cardh"><h3>'+esc(INCTYPE[x.type]||x.type)+'</h3><span class="pillx '+(x.confirmed?"p-bad":x.dismissed?"p-mute":"p-warn")+'">'+(x.confirmed?"Confirmed":x.dismissed?"Dismissed":"Needs review")+'</span></div><p class="sub">'+esc(x.runnerName)+" · "+esc(x.tier)+" runner · reported "+ago(x.createdAt)+(x.errandId?" · errand "+esc(x.errandId.slice(0,8)):"")+'</p><p style="margin:0 0 10px">'+esc(x.description)+'</p>'+
      (x.confirmed?'<p class="muted" style="font-size:12px;margin:0 0 8px">Counts against this runner’s tier.</p>':'')+
      '<div class="fld">'+(!x.confirmed?'<button class="btn small" data-ic="'+x.id+'">Confirm</button>':'')+(!x.dismissed?'<button class="btn ghost small" data-id2="'+x.id+'">'+(x.confirmed?"Remove":"Dismiss")+'</button>':'')+'</div></section>'}).join(""):'<div class="card"><div class="clear">'+icon("ok")+'Nothing here</div><p class="desc muted">No incidents in this list.</p></div>';
    $$("[data-ic]").forEach(function(b){b.onclick=function(){b.disabled=true;api("/incidents/"+b.getAttribute("data-ic")+"/confirm",{method:"POST"}).then(function(){cache=null;safetyPage()}).catch(function(e){b.disabled=false;fail(e)})}});
    $$("[data-id2]").forEach(function(b){b.onclick=function(){b.disabled=true;api("/incidents/"+b.getAttribute("data-id2")+"/dismiss",{method:"POST"}).then(function(){cache=null;safetyPage()}).catch(function(e){b.disabled=false;fail(e)})}});
  }).catch(fail);
}

/* ---------- payouts ---------- */
var pFilter="";
function payoutsPage(){
  var c=$("#content");c.setAttribute("data-page","payouts");
  c.innerHTML=head("Payouts","Money sent to runners’ bank accounts, and any that failed.",'<select class="btn" id="pf" aria-label="Show payouts"><option value="">All payouts</option><option value="failed">Failed</option><option value="pending">On the way</option><option value="success">Paid</option></select>')+'<div id="view">Loading…</div>';
  var f=$("#pf");f.value=pFilter;f.onchange=function(){pFilter=f.value;payoutsPage()};
  load(false).then(function(d){badges(d.i)}).catch(function(){});
  api("/payouts"+(pFilter?"?status="+pFilter:"")).then(function(r){
    var s=r.summary;
    $("#view").innerHTML='<div class="grid" style="margin-bottom:14px"><div class="c3">'+miniStat("Owed to runners",N(s.owedToRunners),'<span>Earned, not yet sent</span>',null)+'</div><div class="c3">'+miniStat("Paid out so far",N(s.paidTotal),'<span>Settled transfers</span>',null)+'</div><div class="c3">'+miniStat("On the way",I(s.pending),'<span>Waiting for Paystack</span>',null)+'</div><div class="c3">'+miniStat("Failed",I(s.failed),'<span>Need a retry</span>',null)+'</div></div>'+
    '<section class="card"><h3>Payout history</h3><div class="twrap" style="margin-top:10px"><table><thead><tr><th>When</th><th>Runner</th><th class="n">Amount</th><th>Status</th><th>Bank</th><th></th></tr></thead><tbody>'+(r.payouts.length?r.payouts.map(function(p){
      return '<tr><td>'+new Date(p.createdAt).toLocaleString()+'</td><td>'+esc(p.runnerName)+'<div class="muted" style="font-size:12px">'+esc(p.phone)+'</div></td><td class="n">'+N(p.amount)+'</td><td><span class="pillx '+(p.status==="success"?"p-good":p.status==="failed"?"p-bad":"p-warn")+'">'+(p.status==="success"?"Paid":p.status==="failed"?"Failed":"On the way")+'</span>'+(p.failureReason?'<div class="muted" style="font-size:12px;white-space:normal;max-width:260px">'+esc(p.failureReason)+'</div>':'')+'</td><td>'+(p.bank?esc(p.bank):"—")+(p.bankVerified?"":'<div class="muted" style="font-size:12px">not verified</div>')+'</td><td>'+(p.status==="failed"?'<button class="btn ghost small" data-retry-runner="'+p.runnerId+'">Pay out again</button>':'')+'</td></tr>'}).join(""):'<tr><td colspan="6" class="muted">No payouts yet.</td></tr>')+'</tbody></table></div></section>';
    $$("[data-retry-runner]").forEach(function(b){b.onclick=function(){b.disabled=true;api("/payouts/retry",{method:"POST",body:JSON.stringify({runnerId:b.getAttribute("data-retry-runner")})}).then(function(){cache=null;payoutsPage()}).catch(function(e){b.disabled=false;fail(e)})}});
  }).catch(fail);
}

/* ---------- people + errand detail ---------- */
var pState={role:"",q:"",susp:false},backFn=null;
var RELBL={requester:"Requester",runner:"Runner"};
function pRowPill(p){return p.suspended?'<span class="pillx p-bad">Suspended</span>':(p.role==="runner"&&p.verification!=="approved"?'<span class="pillx p-warn">'+esc(vLabel(p.verification))+'</span>':'<span class="pillx p-good">Active</span>')}
function peoplePage(){
  page="people";sessionStorage.setItem("gr_admin_page",page);
  var c=$("#content");c.setAttribute("data-page","people");
  $$("[data-page]").forEach(function(b){b.classList.toggle("on",b.getAttribute("data-page")==="people")});
  c.innerHTML=head("People","Every requester and runner. Open a profile to see their history, suspend them or record an incident.",
    '<select class="btn" id="pr" aria-label="Show"><option value="">Everyone</option><option value="requester">Requesters</option><option value="runner">Runners</option></select>')+
    '<div class="fld" style="margin-bottom:12px"><input id="pq" type="search" placeholder="Search by name, phone or email" aria-label="Search people" style="flex:1;min-width:200px"><label style="display:flex;gap:6px;align-items:center;font-size:13px"><input type="checkbox" id="ps"> Suspended only</label></div><div id="view">Loading…</div>';
  var r=$("#pr"),q=$("#pq"),s=$("#ps"),t=null;
  r.value=pState.role;q.value=pState.q;s.checked=pState.susp;
  var run=function(){pState={role:r.value,q:q.value.trim(),susp:s.checked};peopleList()};
  r.onchange=run;s.onchange=run;q.oninput=function(){clearTimeout(t);t=setTimeout(run,250)};
  peopleList();
}
function peopleList(){
  api("/people?role="+pState.role+"&q="+encodeURIComponent(pState.q)+(pState.susp?"&suspended=1":"")).then(function(r){
    var v=$("#view");if(!v)return;
    v.innerHTML='<p class="sub" style="margin:0 0 10px">'+I(r.counts.requesters)+' requesters · '+I(r.counts.runners)+' runners · '+I(r.counts.suspended)+' suspended</p>'+(r.people.length?r.people.map(function(p){
      return '<button class="tk" data-role="'+p.role+'" data-id="'+p.id+'"><span class="av" style="background:'+avColor(p.fullName)+'">'+esc(initials(p.fullName))+'</span><div class="grow" style="flex:1;min-width:0"><div class="t" style="font-weight:600">'+esc(p.fullName)+'</div><div class="m muted" style="font-size:12px">'+RELBL[p.role]+" · "+esc(p.phone)+(p.role==="runner"?" · "+esc(p.tier)+" tier · "+p.errands+(p.errands===1?" delivery":" deliveries"):" · "+p.errands+(p.errands===1?" errand":" errands"))+" · joined "+ago(p.joinedAt)+'</div></div>'+pRowPill(p)+'</button>'}).join(""):'<div class="card"><div class="clear">'+icon("ok")+'No one found</div><p class="desc muted">Try a different search.</p></div>');
    $$(".tk",v).forEach(function(b){b.onclick=function(){backFn=peoplePage;personOpen(b.getAttribute("data-role"),b.getAttribute("data-id"))}});
  }).catch(fail);
}
function errTable(list,withWho){
  return '<div class="twrap" style="margin-top:10px"><table><thead><tr><th>When</th><th>Errand</th><th>Status</th><th class="n">Cost</th></tr></thead><tbody>'+(list.length?list.map(function(e){
    return '<tr class="clk" data-erow="'+e.id+'" tabindex="0"><td>'+ago(e.createdAt)+'</td><td>'+esc(CATNAME[e.category]||e.category)+'<div class="muted" style="font-size:12px">'+esc(e.requester)+(e.runner?" → "+esc(e.runner):"")+'</div></td><td>'+statusPill(e.status)+'</td><td class="n">'+N(e.estimatedCost)+'</td></tr>'}).join(""):'<tr><td colspan="4" class="muted">No errands yet.</td></tr>')+'</tbody></table></div>';
}
function wireErrandRows(root,back){
  $$("[data-erow]",root).forEach(function(r){var open=function(){backFn=back;errandOpen(r.getAttribute("data-erow"))};r.onclick=open;r.onkeydown=function(e){if(e.key==="Enter")open()}});
}
function personOpen(role,id){
  page="people";sessionStorage.setItem("gr_admin_page",page);
  api("/people/"+role+"/"+id).then(function(r){
    var p=r.person,s=r.stats,c=$("#content"),run=role==="runner",here=function(){personOpen(role,id)};
    c.setAttribute("data-page","people");
    $$("[data-page]").forEach(function(b){b.classList.toggle("on",b.getAttribute("data-page")==="people")});
    var stats=run?
      [["Deliveries",I(s.delivered),(s.inProgress?s.inProgress+" in progress":s.cancelled+" cancelled")],["Earned",N(s.earned),"All time"],["Owed now",N(s.owedNow),"Earned, not yet paid out"],["Rating",s.rating===null?"—":s.rating+" / 5",s.ratings+(s.ratings===1?" review":" reviews")]]:
      [["Errands",I(s.errands),s.delivered+" delivered · "+s.cancelled+" cancelled"],["Paid",N(s.spent),"Total charged"],["Refunded",N(s.refunded),"Sent back to them"],["Rating",s.rating===null?"—":s.rating+" / 5",s.ratings+(s.ratings===1?" review":" reviews")]];
    var h=head(esc(p.fullName),RELBL[role]+" · "+esc(p.phone)+(p.email?" · "+esc(p.email):"")+" · joined "+new Date(p.joinedAt).toLocaleDateString(),
      '<button class="btn ghost" id="back">Back</button>'+(p.suspended?'<button class="btn" id="reinstate">Reinstate account</button>':'<button class="btn ghost" id="suspend">Suspend account</button>'));
    h+=p.suspended?'<div class="err"><b>Suspended '+ago(p.suspendedAt)+'</b>'+(p.suspendedReason?' — '+esc(p.suspendedReason):'')+'<br>They can’t log in or use the app until you reinstate them.</div>':'';
    h+='<section class="card" id="sbox" hidden style="margin-bottom:14px"><h3>Suspend '+esc(p.fullName)+'</h3><p class="sub">They’ll be signed out straight away and can’t log in again until you reinstate them. The reason is shown to them.'+(run?' A runner is also taken offline.':'')+(s.inProgress?' <b>They have '+s.inProgress+' errand'+(s.inProgress===1?'':'s')+' in progress; suspending doesn’t cancel '+(s.inProgress===1?'it':'them')+'.</b>':'')+'</p><textarea class="in" id="sreason" placeholder="Reason (the person sees this)" aria-label="Reason"></textarea><div class="fld"><button class="btn" id="sgo">Suspend</button><button class="btn ghost" id="scancel">Cancel</button></div></section>';
    h+='<div class="grid" style="margin-bottom:14px">'+stats.map(function(x){return '<div class="c3">'+miniStat(x[0],x[1],'<span>'+esc(x[2])+'</span>',null)+'</div>'}).join("")+'</div><div class="grid">';
    h+='<section class="card c12"><h3>Recent errands</h3>'+errTable(r.recentErrands)+'</section>';
    if(run){
      var rn=r.runner;
      h+='<section class="card c6"><h3>Account</h3><div class="kv"><span>Trust tier</span><b><span class="pillx '+(TIERCLS[rn.tier]||"p-mute")+'">'+esc(rn.tier)+'</span></b><span>Identity</span><b>'+esc(vLabel(rn.verificationStatus))+' <button class="btn ghost small" id="vopen">Open</button></b><span>Online now</span><b>'+(rn.online?"Yes":"No")+'</b><span>Payout account</span><b>'+(rn.bank?esc(rn.bank.name)+(rn.bank.verified?"":" (not verified)"):"None")+'</b><span>Vehicle</span><b>'+esc(rn.vehicle||"—")+'</b></div></section>';
      h+='<section class="card c6"><h3>Payouts</h3>'+(r.payouts.length?'<ul class="list">'+r.payouts.map(function(x){return '<li><div class="grow"><div class="t">'+N(x.amount)+'</div><div class="m muted" style="font-size:12px">'+new Date(x.createdAt).toLocaleDateString()+(x.failureReason?" · "+esc(x.failureReason):"")+'</div></div><span class="pillx '+(x.status==="success"?"p-good":x.status==="failed"?"p-bad":"p-warn")+'">'+(x.status==="success"?"Paid":x.status==="failed"?"Failed":"On the way")+'</span></li>'}).join("")+'</ul>':'<p class="muted">No payouts yet.</p>')+'</section>';
      h+='<section class="card c12"><h3>Incidents</h3>'+(r.incidents.length?'<ul class="list">'+r.incidents.map(function(x){return '<li><div class="grow"><div class="t">'+esc(INCTYPE[x.type]||x.type)+'</div><div class="m muted" style="font-size:12px">'+esc(x.description)+" · "+ago(x.createdAt)+'</div></div><span class="pillx '+(x.confirmed?"p-bad":x.dismissed?"p-mute":"p-warn")+'">'+(x.confirmed?"Confirmed":x.dismissed?"Dismissed":"Needs review")+'</span></li>'}).join("")+'</ul>':'<p class="muted">No incidents recorded.</p>')+
        '<h4 style="margin:16px 0 4px">Record an incident</h4><p class="sub">Counts against this runner’s tier straight away.</p><div class="fld"><select class="btn" id="itype" aria-label="Type">'+Object.keys(INCTYPE).map(function(k){return '<option value="'+k+'">'+esc(INCTYPE[k])+'</option>'}).join("")+'</select><input id="ierr" placeholder="Errand id (optional)" aria-label="Errand id" style="flex:1;min-width:160px"></div><textarea class="in" id="idesc" placeholder="What happened" aria-label="What happened"></textarea><div class="fld"><button class="btn ghost" id="igo">Record incident</button></div></section>';
    }else{
      h+='<section class="card c12"><h3>Refunds</h3>'+(r.refunds.length?'<ul class="list">'+r.refunds.map(function(x){return '<li><div class="grow"><div class="t">'+N(x.amount)+" · "+esc(x.reason.replace("_"," "))+'</div><div class="m muted" style="font-size:12px">'+new Date(x.createdAt).toLocaleDateString()+'</div></div><span class="pillx '+(x.status==="processed"?"p-good":x.status==="failed"?"p-bad":"p-warn")+'">'+esc(x.status)+'</span></li>'}).join("")+'</ul>':'<p class="muted">No refunds.</p>')+'</section>';
    }
    h+='<section class="card c12"><h3>Support tickets</h3>'+(r.tickets.length?'<ul class="list">'+r.tickets.map(function(t){return '<li><button class="tk" data-tk2="'+t.id+'" style="width:100%"><div class="grow" style="flex:1;text-align:left"><div class="t" style="font-weight:600">'+esc(t.subject)+'</div><div class="m muted" style="font-size:12px">'+esc(t.category.replace("_"," "))+" · "+ago(t.updatedAt)+'</div></div><span class="pillx '+(t.status==="open"?"p-warn":t.status==="resolved"?"p-good":"p-mute")+'">'+esc(t.status.replace("_"," "))+'</span></button></li>'}).join("")+'</ul>':'<p class="muted">No tickets.</p>')+'</section></div>';
    c.innerHTML=h;
    $("#back").onclick=function(){(backFn||peoplePage)()};
    wireErrandRows(c,here);
    $$("[data-tk2]",c).forEach(function(b){b.onclick=function(){ticketOpen(b.getAttribute("data-tk2"))}});
    var sb=$("#suspend");if(sb)sb.onclick=function(){$("#sbox").hidden=false;$("#sreason").focus()};
    $("#scancel")&&($("#scancel").onclick=function(){$("#sbox").hidden=true});
    $("#sgo").onclick=function(){var w=$("#sreason").value.trim();if(w.length<5){fail(new Error("Give a reason of at least 5 characters"));return}var b=$("#sgo");b.disabled=true;api("/people/"+role+"/"+id+"/suspend",{method:"POST",body:JSON.stringify({reason:w})}).then(function(){cache=null;here()}).catch(function(e){b.disabled=false;fail(e)})};
    var ri=$("#reinstate");if(ri)ri.onclick=function(){ri.disabled=true;api("/people/"+role+"/"+id+"/reinstate",{method:"POST"}).then(function(){cache=null;here()}).catch(function(e){ri.disabled=false;fail(e)})};
    var vo=$("#vopen");if(vo)vo.onclick=function(){verificationOpen(id)};
    var ig=$("#igo");if(ig)ig.onclick=function(){ig.disabled=true;api("/incidents",{method:"POST",body:JSON.stringify({runnerId:id,type:$("#itype").value,errandId:$("#ierr").value.trim(),description:$("#idesc").value})}).then(function(){cache=null;here()}).catch(function(e){ig.disabled=false;fail(e)})};
  }).catch(fail);
}
function personLink(role,x){return x?'<button class="linkb" data-prole="'+role+'" data-pid="'+x.id+'">'+esc(x.name)+'</button>'+(x.suspended?' <span class="pillx p-bad">Suspended</span>':''):'<span class="muted">Nobody yet</span>'}
function errandOpen(id){
  page="people";sessionStorage.setItem("gr_admin_page",page);
  api("/errands/"+id).then(function(r){
    var e=r.errand,m=r.money,c=$("#content"),here=function(){errandOpen(id)};
    c.setAttribute("data-page","people");
    $$("[data-page]").forEach(function(b){b.classList.toggle("on",b.getAttribute("data-page")==="people")});
    var tone={good:"green",bad:"red",warn:"amber",info:"violet"};
    var h=head(esc(CATNAME[e.category]||e.category)+" errand",statusPill(e.status)+' <span class="muted">· '+esc(e.id)+'</span>','<button class="btn ghost" id="back">Back</button>');
    h+='<div class="grid"><section class="card c6"><h3>Details</h3><div class="kv"><span>Requester</span><b>'+personLink("requester",r.requester)+'</b><span>Runner</span><b>'+personLink("runner",r.runner)+'</b><span>Posted</span><b>'+new Date(e.createdAt).toLocaleString()+'</b>'+(e.scheduledFor?'<span>Scheduled for</span><b>'+new Date(e.scheduledFor).toLocaleString()+'</b>':'')+'<span>Urgency</span><b>'+esc(e.urgency)+'</b><span>Estimated cost</span><b>'+N(e.estimatedCost)+'</b><span>Items budget</span><b>'+N(e.itemsBudget)+'</b><span>Extra stops</span><b>'+e.stops+'</b><span>Chat messages</span><b>'+r.chatMessages+'</b></div>'+
      (e.items.length?'<h4 style="margin:14px 0 4px">Items</h4><ul style="margin:0;padding-left:18px;font-size:13px">'+e.items.map(function(i){return '<li>'+esc(i.name||i.description||JSON.stringify(i))+(i.quantity?" × "+esc(i.quantity):"")+'</li>'}).join("")+'</ul>':'')+(e.instructions?'<p class="sub" style="margin-top:10px">Instructions: '+esc(e.instructions)+'</p>':'')+'</section>';
    h+='<section class="card c6"><h3>Money</h3><div class="kv"><span>Charged to the requester</span><b>'+N(m.charged)+'</b><span>Refunded so far</span><b>'+N(m.refunded)+'</b><span>Still refundable</span><b>'+N(m.refundable)+'</b></div>'+
      (m.payments.length?'<h4 style="margin:14px 0 4px">Payments</h4><ul class="list">'+m.payments.map(function(p){return '<li><div class="grow"><div class="t">'+N(p.amount)+(p.itemsBudget?" + "+N(p.itemsBudget)+" items":"")+(p.credit?" − "+N(p.credit)+" credit":"")+'</div><div class="m muted" style="font-size:12px">Runner gets '+N(p.runnerPayout)+" · fee "+N(p.commission)+(p.itemsSpent?" · "+N(p.itemsSpent)+" spent on items":"")+'</div></div><span class="pillx '+(p.status==="failed"?"p-bad":p.status==="pending"?"p-warn":"p-good")+'">'+esc(p.status)+'</span></li>'}).join("")+'</ul>':'<p class="muted" style="margin-top:10px">Not paid yet.</p>')+
      (m.refunds.length?'<h4 style="margin:14px 0 4px">Refunds</h4><ul class="list">'+m.refunds.map(function(x){return '<li><div class="grow"><div class="t">'+N(x.amount)+" · "+esc(x.reason.replace("_"," "))+'</div><div class="m muted" style="font-size:12px">'+(x.note?esc(x.note)+" · ":"")+(x.failureReason?esc(x.failureReason):new Date(x.createdAt).toLocaleDateString())+'</div></div><span class="pillx '+(x.status==="processed"?"p-good":x.status==="failed"?"p-bad":"p-warn")+'">'+esc(x.status)+'</span></li>'}).join("")+'</ul>':'')+
      (m.refundable>0?'<p style="margin:12px 0 0"><button class="btn ghost small" id="pref">Send a partial refund</button></p>':'')+'</section>';
    h+='<section class="card c6"><h3>What happened</h3><ul class="list att">'+r.timeline.map(function(x){return '<li><span class="tone '+tone[x.tone]+'"></span><div class="grow"><div class="t">'+esc(x.text)+'</div><div class="m muted" style="font-size:12px">'+new Date(x.at).toLocaleString()+'</div></div></li>'}).join("")+'</ul><p class="sub" style="margin-top:10px">Status changes aren’t logged individually, so only the latest one is shown.</p></section>';
    h+='<section class="card c6"><h3>Also on this errand</h3>'+
      (r.reviews.length?'<h4 style="margin:0 0 4px">Reviews</h4><ul class="list">'+r.reviews.map(function(x){return '<li><div class="grow"><div class="t">'+(x.role==="requester"?"Requester":"Runner")+' · '+x.rating+' / 5</div>'+(x.comment?'<div class="m muted" style="font-size:12px">'+esc(x.comment)+'</div>':'')+'</div></li>'}).join("")+'</ul>':'')+
      (r.sos.length?'<h4 style="margin:12px 0 4px">SOS alerts</h4><ul class="list">'+r.sos.map(function(x){return '<li><div class="grow"><div class="t">Pressed by the '+esc(x.role)+" · "+ago(x.createdAt)+'</div></div><span class="pillx '+(x.status==="active"?"p-bad":"p-mute")+'">'+(x.status==="active"?"Active":"Closed")+'</span></li>'}).join("")+'</ul>':'')+
      (r.tickets.length?'<h4 style="margin:12px 0 4px">Support tickets</h4><ul class="list">'+r.tickets.map(function(x){return '<li><button class="tk" data-tk2="'+x.id+'" style="width:100%"><div class="grow" style="flex:1;text-align:left"><div class="t" style="font-weight:600">'+esc(x.subject)+'</div></div><span class="pillx p-mute">'+esc(x.status.replace("_"," "))+'</span></button></li>'}).join("")+'</ul>':'')+
      (!r.reviews.length&&!r.sos.length&&!r.tickets.length?'<p class="muted">No reviews, SOS alerts or tickets.</p>':'')+'</section>';
    if(r.actions.canCancel||r.actions.canUnassign){
      h+='<section class="card c12"><h3>Fix a stuck errand</h3><p class="sub">Both people are told. Once the runner has picked up, money has been spent, so use a partial refund instead.</p><textarea class="in" id="areason" placeholder="Reason (the people involved see this)" aria-label="Reason"></textarea>'+
      (r.runner&&r.actions.canCancel?'<label style="display:flex;gap:6px;align-items:center;font-size:13px;margin:6px 0"><input type="checkbox" id="waive"> Don’t charge the runner’s cancellation fee (requester gets everything back)</label>':'')+
      '<div class="fld">'+(r.actions.canUnassign?'<button class="btn ghost" id="unassign">Take runner off, offer to others</button>':'')+(r.actions.canCancel?'<button class="btn" id="acancel">Cancel and refund</button>':'')+'</div></section>';
    }
    h+='</div>';
    c.innerHTML=h;
    $("#back").onclick=function(){(backFn||peoplePage)()};
    $$("[data-pid]",c).forEach(function(b){b.onclick=function(){backFn=here;personOpen(b.getAttribute("data-prole"),b.getAttribute("data-pid"))}});
    $$("[data-tk2]",c).forEach(function(b){b.onclick=function(){ticketOpen(b.getAttribute("data-tk2"))}});
    var pr=$("#pref");if(pr)pr.onclick=function(){prefillErrand=id;go("refunds")};
    var act=function(btn,path,body,msg){btn.onclick=function(){var w=$("#areason").value.trim();if(w.length<5){fail(new Error("Give a reason of at least 5 characters"));return}
      if(!confirm(msg))return;btn.disabled=true;body.reason=w;if(path==="cancel"){var wv=$("#waive");body.waiveFee=!!(wv&&wv.checked)}
      api("/errands/"+id+"/"+path,{method:"POST",body:JSON.stringify(body)}).then(function(){cache=null;here()}).catch(function(x){btn.disabled=false;fail(x)})}};
    var ac=$("#acancel");if(ac)act(ac,"cancel",{},"Cancel this errand and refund the requester? This can’t be undone.");
    var un=$("#unassign");if(un)act(un,"unassign",{},"Take the runner off this errand and offer it to other runners?");
  }).catch(fail);
}

/* ---------- support ---------- */
function supportPage(){
  var c=$("#content");c.setAttribute("data-page","support");
  c.innerHTML=head("Support","Reply to requesters and runners, then mark tickets resolved.",'<select class="btn" id="filter" aria-label="Show tickets"><option value="">Needs attention</option><option value="open">Open</option><option value="awaiting_user">Waiting on user</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select>')+'<div id="view">Loading…</div>';
  var f=$("#filter");f.value=supportFilter;f.onchange=function(){supportFilter=f.value;supportList()};
  load(false).then(function(d){badges(d.i)}).catch(function(){});
  supportList();
}
function supportList(){
  api("/support/tickets"+(supportFilter?"?status="+supportFilter:"")).then(function(r){
    $("#view").innerHTML=r.tickets.length?r.tickets.map(function(t){return '<button class="tk" data-id="'+t.id+'"><div class="grow" style="flex:1;min-width:0"><div class="t" style="font-weight:600">'+esc(t.subject)+'</div><div class="m muted" style="font-size:12px">'+esc(t.userRole)+" · "+esc(t.category.replace("_"," "))+" · "+new Date(t.updatedAt).toLocaleString()+'</div></div><span class="pillx '+(t.status==="open"?"p-warn":t.status==="resolved"?"p-good":"p-mute")+'">'+esc(t.status.replace("_"," "))+'</span></button>'}).join(""):'<div class="card"><div class="clear">'+icon("ok")+'Nothing here</div><p class="desc muted">No tickets match this filter.</p></div>';
    $$(".tk").forEach(function(b){b.onclick=function(){ticketOpen(b.getAttribute("data-id"))}});
  }).catch(fail);
}
function ticketOpen(id){
  page="support";
  api("/support/tickets/"+id).then(function(r){
    var t=r.ticket,c=$("#content");c.setAttribute("data-page","support");
    $$("[data-page]").forEach(function(b){b.classList.toggle("on",b.getAttribute("data-page")==="support")});
    c.innerHTML=head(esc(t.subject),esc(t.userRole)+" · "+esc(t.category.replace("_"," "))+" · "+esc(t.status.replace("_"," "))+(t.errandId?" · errand "+esc(t.errandId):""),'<button class="btn ghost" id="back">Back to tickets</button>')+
    '<div class="card">'+r.messages.map(function(m){return '<div class="msg '+(m.sender==="staff"?"staff":"")+'"><div class="m">'+esc(m.sender)+" · "+new Date(m.createdAt).toLocaleString()+'</div>'+esc(m.body)+'</div>'}).join("")+
    '<textarea class="in" id="body" placeholder="Reply to the user" aria-label="Reply"></textarea><div class="fld"><button class="btn" id="send">Send reply</button><button class="btn ghost" id="res">Mark resolved</button><button class="btn ghost" id="cls">Close ticket</button></div></div>';
    $("#back").onclick=function(){supportPage()};
    $("#send").onclick=function(){var b=$("#body").value.trim();if(!b)return;api("/support/tickets/"+id+"/messages",{method:"POST",body:JSON.stringify({body:b})}).then(function(){cache=null;ticketOpen(id)}).catch(fail)};
    var st=function(s){return function(){api("/support/tickets/"+id,{method:"PATCH",body:JSON.stringify({status:s})}).then(function(){cache=null;supportPage()}).catch(fail)}};
    $("#res").onclick=st("resolved");$("#cls").onclick=st("closed");
  }).catch(fail);
}

/* ---------- refunds ---------- */
function refundsPage(){
  var c=$("#content");c.setAttribute("data-page","refunds");
  c.innerHTML=head("Refunds","Send money back to a requester, and retry refunds that failed.","")+'<div id="view">Loading…</div>';
  load(false).then(function(d){badges(d.i)}).catch(function(){});
  api("/refunds").then(function(r){
    var RS={processed:"p-good",pending:"p-warn",failed:"p-bad"};
    $("#view").innerHTML='<section class="card" style="margin-bottom:14px"><h3>Refund a payment</h3><p class="sub">Paste the errand id (or search for it above). The amount can’t be more than was paid.</p><div class="fld"><input id="rf-e" placeholder="Errand id" aria-label="Errand id"><input id="rf-a" type="number" min="1" placeholder="Amount (₦)" aria-label="Amount in Naira"><input id="rf-n" placeholder="Reason" aria-label="Reason"><button class="btn" id="rf-go">Refund</button></div></section>'+
    '<section class="card"><h3>Recent refunds</h3><div class="twrap" style="margin-top:10px"><table><thead><tr><th>When</th><th class="n">Amount</th><th>Reason</th><th>Status</th><th>Errand</th></tr></thead><tbody>'+(r.refunds.length?r.refunds.map(function(x){return '<tr><td>'+new Date(x.createdAt).toLocaleString()+'</td><td class="n">'+N(x.amount)+'</td><td>'+esc(x.reason.replace("_"," "))+(x.note?" · "+esc(x.note):"")+'</td><td><span class="pillx '+(RS[x.status]||"p-mute")+'">'+esc(x.status)+'</span>'+(x.status==="failed"?' <button class="btn ghost small" data-retry="'+x.id+'">Retry</button><div class="muted" style="font-size:12px">'+esc(x.failureReason||"")+'</div>':'')+'</td><td>'+esc(x.errandId.slice(0,8))+'</td></tr>'}).join(""):'<tr><td colspan="5" class="muted">No refunds yet.</td></tr>')+'</tbody></table></div></section>';
    if(prefillErrand){$("#rf-e").value=prefillErrand;prefillErrand="";$("#rf-a").focus()}
    $("#rf-go").onclick=function(){api("/refunds",{method:"POST",body:JSON.stringify({errandId:$("#rf-e").value.trim(),amount:Number($("#rf-a").value),note:$("#rf-n").value})}).then(function(){cache=null;refundsPage()}).catch(fail)};
    $$("[data-retry]").forEach(function(b){b.onclick=function(){api("/refunds/"+b.getAttribute("data-retry")+"/retry",{method:"POST"}).then(function(){cache=null;refundsPage()}).catch(fail)}});
  }).catch(fail);
}

/* ---------- search ---------- */
function wireSearch(){
  var q=$("#q"),box=$("#sr"),timer=null;
  document.addEventListener("keydown",function(e){
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();q.focus();q.select()}
    else if(e.key==="/"&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)){e.preventDefault();q.focus()}
    else if(e.key==="Escape"){box.hidden=true;$("#pop").hidden=true}
  });
  q.oninput=function(){
    clearTimeout(timer);var v=q.value.trim();
    if(v.length<2){box.hidden=true;return}
    timer=setTimeout(function(){
      api("/search?q="+encodeURIComponent(v)).then(function(r){
        var h="";
        if(r.tickets.length)h+='<h5>Support tickets</h5>'+r.tickets.map(function(t){return '<button data-tk="'+t.id+'"><span class="gl">'+icon("msg")+'</span><span><b>'+esc(t.subject)+'</b><br><span class="muted" style="font-size:12px">'+esc(t.status.replace("_"," "))+'</span></span></button>'}).join("");
        if(r.errands.length)h+='<h5>Errands</h5>'+r.errands.map(function(x){return '<button data-er="'+x.id+'"><span class="gl">'+icon(x.category)+'</span><span><b>'+esc(CATNAME[x.category]||x.category)+" for "+esc(x.requester)+'</b><br><span class="muted" style="font-size:12px">'+esc(STATUS[x.status]||x.status)+" · "+esc(x.id.slice(0,8))+' · opens errand</span></span></button>'}).join("");
        if(r.people.length)h+='<h5>People</h5>'+r.people.map(function(p){return '<button data-prole="'+esc(p.role)+'" data-pid="'+esc(p.id)+'"><span class="av" style="background:'+avColor(p.name)+';width:34px;height:34px">'+esc(initials(p.name))+'</span><span><b>'+esc(p.name)+'</b><br><span class="muted" style="font-size:12px">'+esc(p.role)+" · "+esc(p.phone)+" · opens profile"+'</span></span></button>'}).join("");
        box.innerHTML=h||'<div class="nothing">No matches for “'+esc(v)+'”.</div>';box.hidden=false;
        $$("[data-tk]",box).forEach(function(b){b.onclick=function(){box.hidden=true;ticketOpen(b.getAttribute("data-tk"))}});
        $$("[data-er]",box).forEach(function(b){b.onclick=function(){box.hidden=true;backFn=peoplePage;errandOpen(b.getAttribute("data-er"))}});
        $$("[data-pid]",box).forEach(function(b){b.onclick=function(){box.hidden=true;backFn=peoplePage;personOpen(b.getAttribute("data-prole"),b.getAttribute("data-pid"))}});
      }).catch(fail);
    },250);
  };
}

function start(){if(!key)return renderLogin();renderShell();route(false)}
start();
})();
`;

export const ADMIN_PAGE =
  '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">' +
  "<title>Gracerandly admin</title>" +
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap">' +
  "<style>" +
  CSS +
  "</style></head><body>" +
  BODY +
  "<script>" +
  SCRIPT +
  "</script></body></html>";

/** Content-Security-Policy for the page above: inline code only, Google Fonts for Poppins, and same-origin API calls. */
export const ADMIN_PAGE_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data:; connect-src 'self'; base-uri 'none'; form-action 'none'";
