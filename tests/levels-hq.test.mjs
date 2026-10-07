// 人数放大十倍、帮派堂口、头目等级：这三件事的规则层约束。难度曲线交给 balance.test.mjs。
import assert from "node:assert/strict";
import {createRequire} from "node:module";

const require=createRequire(import.meta.url);
const game=require("../app.js");
function seeded(seed){return()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}}
const P=game.PEOPLE;

// ---- 人数口径 ----
{
  const s=game.createInitialState("沈十倍","yi","standard");
  assert.equal(P,10);
  assert.equal(s.crew,420,"开局 420 人");
  assert.equal(game.crewCap(s),600,"开局上限 600");
  assert.equal(s.territories.tko.guard,1120,"普通社团地盘一千出头");
  assert.equal(s.territories.south_dock.guard,2800,"堂口两千八");
  assert.equal(game.MIN_TROOPS,100,"开战至少带 100 人");
  assert.equal(s.peopleScale,P);
  // 每人开销按十分之一算：钱的节奏不变
  const a=game.createInitialState("沈维护","yi","standard");a.crew=1000;a.regroup=0;a.wounded=0;
  const b=game.createInitialState("沈维护","yi","standard");b.crew=100;
  assert.ok(Math.abs(game.monthlyUpkeep(a)-game.monthlyUpkeep(b)-900*.013)<.2,"维护费每人 0.013 万");
}

// ---- 旧存档按十倍换算，读两次不会放大两次 ----
{
  const s=game.createInitialState("沈旧档","yi","standard");
  const old=JSON.parse(JSON.stringify(s));
  delete old.peopleScale;old.crew=42;old.regroup=6;old.wounded=3;old.casualties=11;
  Object.values(old.territories).forEach(t=>{t.guard=Math.round(t.guard/10)});
  const n=game.normalizeState(old);
  assert.deepEqual([n.crew,n.regroup,n.wounded,n.casualties],[420,60,30,110]);
  assert.equal(n.territories.south_dock.guard,2800);
  const again=game.normalizeState(JSON.parse(JSON.stringify(n)));
  assert.equal(again.crew,420,"已换算的存档不再放大");
  // 打到一半的仗：人数和两边战力一起放大，比值不变
  const f=game.createInitialState("沈半场","yi","standard");f.intel.clocktower=true;
  game.startBattle(f,{targetId:"clocktower",leaderIds:["player","zhaokui"],troops:400,tactic:"steady"},seeded(3));
  const half=JSON.parse(JSON.stringify(f));delete half.peopleScale;
  const b=half.battleSession;b.troops/=10;b.power/=10;b.defPower/=10;Object.keys(b.split).forEach(k=>{b.split[k]/=10});b.units.forEach(u=>{["hp","hp0","str","max","w"].forEach(k=>{u[k]/=10})});
  Object.values(half.territories).forEach(t=>{t.guard=Math.round(t.guard/10)});half.crew/=10;
  const m=game.normalizeState(half);
  assert.equal(m.battleSession.troops,400);
  assert.ok(Math.abs(m.battleSession.power/m.battleSession.defPower-f.battleSession.power/f.battleSession.defPower)<1e-9,"战力比不变");
}

// ---- 堂口 ----
{
  const s=game.createInitialState("沈堂口","wei","standard");
  assert.deepEqual(Object.keys(game.HQ_OF).map(f=>game.HQ_OF[f]),["south_dock","golden_bay","cheungsha"]);
  for(const [f,id] of Object.entries(game.HQ_OF)){assert.ok(game.isHomeHQ(s,id),`${f}的堂口`);assert.ok(game.hqLocked(s,id),"外围还有四块，堂口不开门")}
  // 外围剩两块才开门
  s.territories.old_street.owner="player";
  ["shipyard","kwuntong"].forEach(id=>{s.territories[id].owner="player";s.territories[id].settling=0});
  assert.equal(game.hqLocked(s,"south_dock"),false,"东潮会只剩两块外围，堂口可以打了");
  // 守方：本家能打的头目全上，受伤 −15%（折成战力 ÷0.85）
  const lineup=game.enemyLineup(s,"south_dock",null).filter(u=>u.id);
  assert.equal(lineup.length,3,"堂口三路都是有名有姓的头目");assert.ok(["hewanshan","tangji"].every(id=>lineup.some(u=>u.id===id)),"何万山、唐霁都在");
  assert.equal(game.enemyLineup(s,"tko",null).filter(u=>u.id).length,2,"普通地盘只派两名头目");
  s.officers.filter(o=>o.side==="east"&&!o.named).forEach(o=>{o.injured=2});   // 只留两名名将，好和普通地盘逐项对比
  const dp=game.defenderPower(s,"south_dock").power;
  s.territories.south_dock.owner="wan";                 // 被别家占了就只是一块普通地
  assert.equal(game.isHomeHQ(s,"south_dock"),false);
  s.territories.south_dock.owner="east";
  game.TERRITORY_DEFS.south_dock.hq=false;const plain=game.defenderPower(s,"south_dock").power;game.TERRITORY_DEFS.south_dock.hq=true;
  assert.ok(Math.abs(dp-plain/.85)<1e-6,"堂口加成只算一次，何万山的码头不再另加 8%");
  { const e=game.createInitialState("沈码头","wei","standard");e.territories.shipyard.guard=e.territories.tko.guard=1000;
    assert.equal(game.defenderPower(e,"shipyard").power,game.defenderPower(e,"tko").power,"红磡不再给何万山额外 8%：码头只靠「老码头」技能"); }
  // 驻防上限与生长
  const capHQ=game.enemyCap(s,"south_dock"),capPlain=game.enemyCap(s,"tko");
  assert.equal(capHQ,Math.round(capPlain*2.5),"堂口驻防上限是普通地盘的两倍半");
  // 拔掉堂口：本家其余地盘驻防 −30%
  const g=game.createInitialState("沈拔堂","wei","standard");
  ["shipyard","kwuntong"].forEach(id=>{g.territories[id].owner="player";g.territories[id].settling=0});
  g.territories.stanley.owner="player";g.territories.stanley.settling=0;
  g.crew=6000;g.morale=99;g.territories.south_dock.guard=40;g.intel.south_dock=true;
  g.officers.filter(o=>o.side==="east").forEach(o=>{o.injured=3});
  const before=game.factionTerritories(g,"east").filter(id=>id!=="south_dock").map(id=>g.territories[id].guard);
  const rep=game.resolveBattle(g,{targetId:"south_dock",leaderIds:["player","zhaokui","chengye"],troops:1500,tactic:"assault"},seeded(4));
  assert.equal(rep.outcome,"win","四十个人守不住");
  const after=game.factionTerritories(g,"east").map(id=>g.territories[id].guard);
  assert.deepEqual(after,before.map(v=>Math.max(120,Math.round(v*.7))),"其余地盘驻防掉三成");
  assert.ok(g.log.some(l=>/堂口香港仔被拔/.test(l.text)));
  // 旧存档补堂口驻防，只补一次
  const o=JSON.parse(JSON.stringify(game.createInitialState("沈旧堂","wei","standard")));delete o.hqBoost;o.territories.golden_bay.guard=1120;
  const n=game.normalizeState(o);assert.equal(n.territories.golden_bay.guard,2800);
  assert.equal(game.normalizeState(JSON.parse(JSON.stringify(n))).territories.golden_bay.guard,2800);
}

// ---- 头目等级 ----
{
  const s=game.createInitialState("沈升级","yi","standard");
  const zk=s.officers.find(o=>o.id==="zhaokui"),f0=zk.stats.force,c0=zk.stats.command,cap0=game.troopCap(zk);
  assert.equal(zk.lv,1);assert.equal(zk.xp,0);
  assert.equal(game.lvNeed(1),32);
  assert.equal(game.gainXP(zk,31),0,"差一点不升");
  assert.equal(game.gainXP(zk,1),1,"凑满升一级");
  assert.deepEqual([zk.lv,zk.xp,zk.stats.force,zk.stats.command],[2,0,f0+2,c0+2],"猛将升级加武、统各 2");
  assert.equal(game.troopCap(zk),cap0+2*P+10,"带兵上限：统 +2 折 +10 人，等级再 +20 人");
  game.gainXP(zk,100000);assert.equal(zk.lv,10,"封顶 Lv10");assert.equal(zk.xp,0);
  // 名将技能 Lv5 升「贰」、Lv10 升「叁」
  assert.deepEqual(Object.values(game.skillTiers(s,zk)),[3,3]);
  assert.equal(game.skillLabel("zk_hold",3),"镇场·叁","赵魁的「压阵」改名「镇场」");
  const cy=s.officers.find(o=>o.id==="chengye");game.gainXP(cy,[1,2,3,4].reduce((a,l)=>a+game.lvNeed(l),0));
  assert.equal(cy.lv,5);assert.deepEqual(Object.values(game.skillTiers(s,cy)),[2,2]);
  assert.equal(game.skillLabel("cy_talk",2),"喊话·贰");
  // 普通头目 Lv5 学会第二个技能
  const c=s.recruitMarket[0];
  assert.equal(game.officerSkills(s,c).length,1);
  c.lv=5;assert.equal(game.officerSkills(s,c).length,2,"Lv5 第二个技能");
  assert.equal(new Set(game.officerSkills(s,c)).size,2);
  assert.deepEqual(Object.values(game.skillTiers(s,c)),[1,1],"普通头目没有技能升阶");
}

// ---- 技能升阶真的变强 ----
{
  const s=game.createInitialState("沈升阶","yi","standard");s.intel.clocktower=true;
  game.startBattle(s,{targetId:"clocktower",leaderIds:["player","zhaokui"],troops:400,tactic:"steady"},seeded(5));
  const sess=s.battleSession,zk=sess.units.find(u=>u.id==="zhaokui"),pl=sess.units.find(u=>u.id==="player");
  zk.row="front";pl.row="front";
  const c=game.battleCtx(s,sess,()=>.5),t1=c.mod("taken",null,pl);
  zk.tiers.zk_hold=3;const t3=c.mod("taken",null,pl);
  assert.ok(Math.abs(t1-.9*.95)<1e-9&&Math.abs(t3-(1-.1*1.8)*.95)<1e-9,"镇场·叁：同排受伤 −18%");
}

// ---- 阿七「跟着学」 ----
{
  const s=game.createInitialState("沈阿七","yi","standard");
  const c={units:[]},u={battles:7},v={battles:40};
  assert.ok(Math.abs(game.SKILLS.aq_learn.out(c,u,u)-1.07)<1e-9,"打过七场 +7%");
  assert.equal(game.SKILLS.aq_learn.out(c,v,v),1.15,"最多 +15%");
  assert.equal(game.SKILLS.aq_learn.out(c,u,v),1,"只管自己");
}

// ---- 打仗攒经验，战报写升级 ----
{
  const s=game.createInitialState("沈攒经验","wei","standard");s.crew=3000;s.morale=95;s.territories.clocktower.guard=200;s.intel.clocktower=true;
  const zk=s.officers.find(o=>o.id==="zhaokui");zk.xp=game.lvNeed(1)-1;
  const rep=game.resolveBattle(s,{targetId:"clocktower",leaderIds:["player","zhaokui"],troops:1000,tactic:"assault"},seeded(6));
  assert.equal(rep.outcome,"win");
  assert.ok(zk.lv>=2,"打一场就够升");
  assert.ok(rep.levelUps.some(x=>x.startsWith("赵魁升到 Lv")),"战报写进升级");
  assert.ok(s.log.some(l=>/赵魁升到 Lv/.test(l.text)));
  // 输了也有经验，只是少
  const l=game.createInitialState("沈输","wei","standard");l.crew=3000;l.territories.clocktower.guard=9000;l.intel.clocktower=true;
  game.resolveBattle(l,{targetId:"clocktower",leaderIds:["zhaokui"],troops:200,tactic:"assault"},seeded(7));
  const z2=l.officers.find(o=>o.id==="zhaokui");assert.ok(z2.xp>=4&&z2.xp<16,"败仗 4 点打底");
}

// ---- 对家每年长一级；旧经验折算 ----
{
  const s=game.createInitialState("沈年","yi","standard");
  s.month=24;game.enemyYearUp(s);
  assert.ok(s.officers.filter(o=>o.side==="east").every(o=>o.lv===3),"两年后对家 Lv3");
  assert.ok(s.officers.filter(o=>o.side==="player").every(o=>o.lv===1),"自家不白涨");
  const hw=s.officers.find(o=>o.id==="hewanshan"),d=game.CHARACTER_DEFS.hewanshan;
  assert.equal(hw.stats.command,d.stats.command+4,"龙头升级加统、魅");
  const old=JSON.parse(JSON.stringify(game.createInitialState("沈旧经验","yi","standard")));
  old.officers.forEach(o=>{delete o.lv;delete o.xp});
  const z=old.officers.find(o=>o.id==="zhaokui");z.exp=6;z.stats.force+=3;   // 旧档：长过 3 点属性，手里还有 6 点经验
  const n=game.normalizeState(old),nz=n.officers.find(o=>o.id==="zhaokui");
  assert.equal(nz.exp,undefined,"旧字段删掉");
  assert.equal(nz.lv,4,"(3×10+6)×4=144 经验 → Lv4");
  assert.equal(nz.stats.force,game.CHARACTER_DEFS.zhaokui.stats.force+3,"折算等级不重复加属性");
}

// ---- 三家的二线头目 ----
{
  const s=game.createInitialState("沈名册","yi","standard");
  for(const f of ["east","wan","long"])assert.equal(s.officers.filter(o=>o.side===f).length,5,`${f} 五名头目`);
  const old=JSON.parse(JSON.stringify(s));old.officers=old.officers.filter(o=>!o.id.includes("_"));old.factions.long.defeated=true;
  const n=game.normalizeState(old);
  assert.equal(n.officers.filter(o=>o.side==="east").length,5,"旧档补上二线头目");
  assert.equal(n.officers.filter(o=>o.side==="long").length,2,"已经灭掉的社团不补");
  const e=n.officers.find(o=>o.id==="east_li");assert.equal(e.portrait,"");assert.equal(game.officerSkills(n,e).length,1);
}

// ---- 人从地盘来 ----
{
  const s=game.createInitialState("沈招人","yi","standard");
  const base=game.recruitYield(s);
  assert.equal(base,game.territoryRecruit(s,"old_street"),"开局只有老街出人");
  s.territories.kowlooncity.owner="player";s.territories.kowlooncity.stability=75;s.territories.kowlooncity.settling=0;
  const nb=game.territoryRecruit(s,"kowlooncity");
  s.territories.kwuntong.owner="player";s.territories.kwuntong.stability=75;s.territories.kwuntong.settling=0;
  assert.ok(nb>game.territoryRecruit(s,"kwuntong"),"街坊地段比物流地段出人多");
  assert.equal(game.recruitYield(s),base+nb+game.territoryRecruit(s,"kwuntong"),"招人是各块地盘之和");
  s.territories.kwuntong.settling=2;assert.equal(game.territoryRecruit(s,"kwuntong"),0,"未稳的地招不到人");
  s.territories.kowlooncity.stability=20;assert.equal(game.territoryRecruit(s,"kowlooncity"),0,"人心散了招不到人");
  s.cash=100;const c0=s.crew;game.applyAction(s,"recruit_crew",()=>.5);
  assert.equal(s.crew-c0,Math.min(Math.round(game.recruitYield(s)*1.25),game.crewCap(s)-c0),"程野在：招到的人×1.25");
  // 每月投奔
  const f=game.createInitialState("沈投奔","yi","standard");f.crew=0;
  assert.ok(game.monthlyInflow(f)>0,"立稳的地盘每月有人来投奔");
  const g=game.createInitialState("沈满员","yi","standard");g.crew=game.crewCap(g);
  assert.equal(game.monthlyInflow(g),0,"满员就不来了");
}

// ---- 留守与立稳 ----
{
  const s=game.createInitialState("沈留守","yi","standard");s.crew=3000;s.territories.clocktower.guard=50;
  const rep=game.resolveBattle(s,{targetId:"clocktower",leaderIds:["player","zhaokui","chengye"],troops:1000,tactic:"assault"},seeded(9));
  assert.equal(rep.outcome,"win");
  const surv=rep.troops-rep.losses-(rep.bribed||0);
  assert.equal(rep.garrison,Math.min(surv,Math.max(200,Math.round(surv*.6))),"幸存者六成留守，至少 200");
  assert.equal(s.territories.clocktower.guard,rep.garrison);
  assert.equal(s.regroup,surv-rep.garrison,"留守的人不回老街整补");
  assert.equal(s.territories.clocktower.settling,4,"新地立稳要四个月");
  // 未稳的地不能当跳板
  const nb=game.TERRITORY_DEFS.clocktower.neighbors.filter(id=>!game.TERRITORY_DEFS.old_street.neighbors.includes(id)&&id!=="old_street"&&s.territories[id].owner!=="player");
  assert.ok(nb.length>0);
  assert.ok(nb.every(id=>!game.attackableTerritories(s).includes(id)),"钟楼还没立稳，不能从这里往外打");
  s.territories.clocktower.settling=0;
  assert.ok(nb.some(id=>game.attackableTerritories(s).includes(id)),"立稳了就能往外打");
  // 铺得越开越难立稳
  const w=game.createInitialState("沈铺开","yi","standard");w.crew=6000;
  ["kowlooncity","west_market"].forEach(id=>{w.territories[id].owner="player";w.territories[id].settling=3});
  w.territories.clocktower.guard=50;
  game.resolveBattle(w,{targetId:"clocktower",leaderIds:["player","zhaokui","chengye"],troops:1000,tactic:"assault"},seeded(9));
  assert.equal(w.territories.clocktower.settling,4+Math.round(2*1.25),"另有两块没稳：立稳期 +2.5 取整");
  // 坐镇只缩短两个月
  w.ap=3;w.territories.clocktower.settling=6;game.applyAction(w,"garrison",()=>.5);
  assert.equal(w.territories.clocktower.settling,4,"坐镇新地盘：未稳期 −2 月");
}

// ---- 没有时间限制 ----
{
  assert.equal(game.FINAL_MONTH,undefined);assert.equal(game.forcedSettlement,undefined);
  const s=game.createInitialState("沈不限时","yi","standard");s.month=200;s.ap=0;
  game.advanceMonth(s,true,seeded(1));
  assert.ok(!s.ended||!["halfharbor","warlord","faded"].includes(s.endingReason),"第 200 月也不会被强行结算");
  assert.equal(game.monthDisplay(s),"第202月");
}

console.log("scale / headquarters / officer level / pacing tests passed");
