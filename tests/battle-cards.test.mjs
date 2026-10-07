// 头目卡牌对战：引擎层面的约束。数值平衡交给 balance.test.mjs，这里只锁“对不对”。
import assert from "node:assert/strict";
import {createRequire} from "node:module";

const require=createRequire(import.meta.url);
const game=require("../app.js");
function seeded(seed){return()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}}
const fresh=(name="沈卡牌")=>{const s=game.createInitialState(name,"yi","standard");s.crew=120;return s};

// ---- 阵容 ----
{
  const s=fresh();s.intel.clocktower=true;
  const sess=game.startBattle(s,{targetId:"clocktower",leaderIds:["player","zhaokui","chengye"],troops:30,tactic:"steady"},seeded(1));
  const us=sess.units.filter(u=>u.side==="us"),them=sess.units.filter(u=>u.side==="them");
  assert.equal(us.length,3,"三名头目各自成一路");
  assert.equal(us.reduce((a,u)=>a+u.hp0,0),30,"出战人数全部分到头目手下");
  assert.equal(them.reduce((a,u)=>a+u.hp0,0),s.territories.clocktower.guard,"守军人数等于驻防");
  assert.ok(them.length>=1&&them.length<=3,"守方一到三路");
  assert.ok(us.some(u=>u.row==="front")&&them.some(u=>u.row==="front"),"两边都至少有一路站前排");
  assert.equal(us.find(u=>u.id==="chengye").row,"back","说客默认站后排");
  assert.equal(us.find(u=>u.id==="zhaokui").row,"front","猛将默认站前排");
  // 开战总战力必须等于旧公式的战力：难度曲线就锚在这里
  const usPower=us.reduce((a,u)=>a+u.max*u.mult,0);
  assert.ok(Math.abs(usPower-sess.power)<1e-6,"我方总战力等于 estimateBattle 的 power");
  assert.ok(Math.abs(sess.ratio-sess.power/sess.defPower)<1e-9,"ratio 等于两边战力之比");
}

// ---- 分兵与带兵上限 ----
{
  const s=fresh();
  const split=game.splitTroops(s,["player","zhaokui"],40,{});
  assert.equal(split.player+split.zhaokui,40,"自动分兵加起来等于出战人数");
  const manual=game.splitTroops(s,["player","zhaokui"],40,{player:5});
  assert.equal(manual.player,5,"手动分过的人数保留");
  assert.equal(manual.zhaokui,35,"余下的人补给其他头目");
  const capped=game.splitTroops(s,["player"],500,{});
  assert.ok(capped.player<=game.troopCap(game.CHARACTER_DEFS.player),"单人带兵不超过统率上限");
  const big=fresh("沈大军");big.crew=400;
  const bs=game.startBattle(big,{targetId:"clocktower",leaderIds:["player"],troops:300,tactic:"steady"},seeded(2));
  assert.equal(bs.troops,game.maxTroops(big,["player"]),"带不动的人不上阵");
  assert.equal(big.crew,400-bs.troops,"留在老街的人还在能战池里");
}

// ---- 确定性与存档往返 ----
function playOut(s,cards,rngSeed){const rng=seeded(rngSeed);const out=[];let i=0;while(s.battleSession){const r=game.applyStageChoice(s,cards[i++]||"hold",rng);out.push(JSON.stringify(r.ended?r.report.events:s.battleSession.events))}return{report:s.lastBattle,ev:out}}
{
  const mk=()=>{const s=fresh();game.startBattle(s,{targetId:"clocktower",leaderIds:["player","zhaokui"],troops:40,tactic:"steady"},seeded(5));return s};
  const a=playOut(mk(),["press","hold","hold"],9),b=playOut(mk(),["press","hold","hold"],9);
  assert.deepEqual(a.ev,b.ev,"同样的种子和出牌，回放事件逐条一致");
  assert.equal(a.report.losses,b.report.losses);
  // 打完第一段存档、读档再打，结果必须与不读档一致
  const c=mk(),rng=seeded(9);game.applyStageChoice(c,"press",rng);
  const revived=game.normalizeState(JSON.parse(JSON.stringify(c)));
  assert.ok(revived.battleSession&&Array.isArray(revived.battleSession.units),"进行中的对阵能存档");
  let r;while(revived.battleSession)r=game.applyStageChoice(revived,"hold",rng);
  const d=mk(),rng2=seeded(9);game.applyStageChoice(d,"press",rng2);let r2;while(d.battleSession)r2=game.applyStageChoice(d,"hold",rng2);
  assert.equal(revived.lastBattle.losses,d.lastBattle.losses,"读档不改变战斗结果");
  assert.equal(revived.lastBattle.outcome,d.lastBattle.outcome);
}

// ---- 旧版存档里打到一半的仗 ----
{
  const s=fresh("沈旧仗");
  game.startBattle(s,{targetId:"clocktower",leaderIds:["player","zhaokui"],troops:40,tactic:"steady"},seeded(3));
  const old=JSON.parse(JSON.stringify(s));
  ["units","split","rows","round","status","converted","bribed","events","power","defPower"].forEach(k=>delete old.battleSession[k]);
  const loaded=game.normalizeState(old);
  assert.ok(loaded.battleSession,"旧版会话不丢弃");
  let rep;const rng=seeded(4);while(loaded.battleSession)rep=game.applyStageChoice(loaded,"hold",rng);
  assert.ok(["win","loss"].includes(loaded.lastBattle.outcome),"按当下阵容摆开后能正常打完");
  assert.ok(loaded.lastBattle.losses>=0&&loaded.lastBattle.losses<=40);
}

// ---- 号令牌：casualtyMult 只改倒下的人数，不改战力对比 ----
{
  const run=card=>{const s=fresh();s.territories.clocktower.guard=60;game.startBattle(s,{targetId:"clocktower",leaderIds:["player","zhaokui"],troops:40,tactic:"steady"},seeded(21));const before=JSON.stringify(s.battleSession.units.filter(u=>u.side==="them").map(u=>u.str));game.applyStageChoice(s,card,()=>.4);return{s,before}};
  const hold=run("hold"),press=run("press");
  const themStr=x=>x.s.battleSession.units.filter(u=>u.side==="them").reduce((a,u)=>a+u.str,0);
  assert.ok(themStr(press)<themStr(hold),"压上去打掉对面更多战力");
  assert.ok(press.s.battleSession.losses>=hold.s.battleSession.losses,"压上去自己也倒下更多人");
}

// ---- 技能表 ----
{
  const named=["player","zhaokui","sumanqing","chengye","aqi","yerong","xiejiu","tangji","hewanshan","fangjingyao","hanbiao","guchangfeng","weixiaolou"];
  const s=fresh();
  for(const id of named){
    const o={...game.CHARACTER_DEFS[id],id};
    const sk=game.officerSkills(s,o);
    assert.equal(sk.length,2,`${o.name}应有两个技能`);
    sk.forEach(k=>assert.ok(game.SKILLS[k],`${o.name}的技能 ${k} 必须存在`));
  }
  for(const creed of ["yi","wei","li"]){const c=game.createInitialState("沈"+creed,creed,"standard");assert.equal(new Set(game.officerSkills(c,c.officers.find(o=>o.id==="player"))).size,2,"沈川的第二个技能跟着开局那句话走")}
  const common=s.recruitMarket[0];
  assert.deepEqual(game.officerSkills(s,common),game.officerSkills(s,{...common}),"普通头目的技能由 id 决定，读档不变");
  Object.values(game.SKILLS).forEach(k=>{assert.ok(k.name&&k.desc&&["active","chase","passive","aura"].includes(k.kind),`技能 ${k.name} 字段完整`)});
}

// ---- 方景曜「砸钱」：被撬走的人既不算阵亡也不回来 ----
{
  const s=fresh("沈被撬");s.crew=200;
  const target=Object.keys(s.territories).find(id=>s.territories[id].owner==="wan");
  game.TERRITORY_DEFS.old_street.neighbors.push(target);game.TERRITORY_DEFS[target].neighbors.push("old_street");
  s.officers.filter(o=>o.side==="wan"&&o.id!=="fangjingyao").forEach(o=>{o.injured=3});
  game.startBattle(s,{targetId:target,leaderIds:["player","zhaokui"],troops:60,tactic:"steady"},seeded(8));
  const sess=s.battleSession;
  assert.ok(sess.units.some(u=>u.id==="fangjingyao"),"方景曜亲自守");
  assert.ok(sess.bribed>0,"开战前撬走了人");
  assert.ok(sess.log.some(l=>l.name==="开战前"),"撬人写进战报");
  const troops=sess.troops,bribed=sess.bribed,regroupBefore=s.regroup||0,woundedBefore=s.wounded||0;
  let r;const rng=seeded(9);while(s.battleSession)r=game.applyStageChoice(s,"hold",rng);
  const rep=s.lastBattle;
  assert.equal((s.regroup-regroupBefore)+rep.losses+bribed,troops,"幸存＋折损＋被撬＝出战人数");
  game.TERRITORY_DEFS.old_street.neighbors.pop();game.TERRITORY_DEFS[target].neighbors.pop();
}

// ---- 胜算预估：不碰存档、稳定、随兵力单调 ----
{
  const s=fresh("沈估算");s.territories.clocktower.guard=50;
  const before=JSON.stringify(s);
  const plan=n=>({targetId:"clocktower",leaderIds:["player","zhaokui","chengye"],troops:n,tactic:"steady"});
  const a=game.simulateBattleOdds(s,plan(20)),b=game.simulateBattleOdds(s,plan(20)),c=game.simulateBattleOdds(s,plan(60));
  assert.equal(JSON.stringify(s),before,"空跑不得改动存档");
  assert.deepEqual(a,b,"同样的安排永远显示同样的把握");
  assert.ok(a.p>=0&&a.p<=1);
  assert.ok(c.p>=a.p,"多带人不会更没把握");
}

// ---- 守军被打散就提前收场 ----
{
  const s=fresh("沈速胜");s.territories.clocktower.guard=3;s.morale=95;
  const rep=game.resolveBattle(s,{targetId:"clocktower",leaderIds:["player","zhaokui","chengye"],troops:60,tactic:"assault"},seeded(12));
  assert.equal(rep.outcome,"win");
  assert.ok(rep.stages.length<3,"三个人的守军撑不满三段");
}

console.log("card battle tests passed");
