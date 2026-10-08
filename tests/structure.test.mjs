import assert from "node:assert/strict";
import {createRequire} from "node:module";

const require=createRequire(import.meta.url);
const game=require("../app.js");

const s=game.createInitialState("沈测试","yi","standard");
assert.equal(s.name,"沈测试");
assert.equal(game.ownTerritories(s).length,1);
assert.equal(Object.keys(s.territories).length,36,"香港18区各两个地段");
assert.deepEqual(new Set(game.attackableTerritories(s)),new Set(["clocktower","west_market","kowlooncity"]),"开局三条九龙扩张路线");
assert.equal(s.ap,3);
assert.equal(s.crew,420);
assert.equal(s.regroup,0,"开局没有整补中的人");
assert.equal(s.wounded,0,"开局没有伤员");
assert.equal(game.totalCrew(s),420,"总人手=能战+整补+养伤");
assert.equal(game.crewCap(s),600,"开局只有老街一块地：(40+1*20+0)×10");
assert.ok(game.monthlyGross(s)>game.monthlyUpkeep(s),"开局不应当立即入不敷出");
assert.equal(game.officerCapacity(s),7);

const poor=game.createInitialState("沈没钱","yi","standard");
poor.cash=0;
const poorCrew=poor.crew;
assert.equal(game.applyAction(poor,"recruit_crew"),false,"现金不足时不能无限招人");
assert.equal(poor.cash,0);
assert.equal(poor.crew,poorCrew);

function seeded(seed){return()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}}
const seededBase=game.createInitialState("沈种子","yi","standard");
seededBase.recruitMarket=[];
const seededTwin=structuredClone(seededBase);
assert.deepEqual(
  game.makeCommonCandidate(seededBase,0,seeded(20260729)),
  game.makeCommonCandidate(seededTwin,0,seeded(20260729)),
  "传入相同rng时普通头目必须完全可复现"
);

const debt=game.createInitialState("沈负债","li","standard");
debt.cash=-31;
debt.insolvencyMonths=1;
assert.equal(game.checkInsolvency(debt),true);
assert.equal(debt.flags.debtCrisisQueued,true);
assert.equal(game.checkInsolvency(debt),false,"同一场资金危机不能重复入队");

const overtime=game.createInitialState("沈加时","wei","standard");
overtime.month=game.MAX_MONTHS-1;
assert.equal(game.monthDisplay(overtime),`第${game.MAX_MONTHS}月`,"没有期限，只显示第几月");
overtime.month=300;
assert.equal(game.monthDisplay(overtime),"第301月");
assert.equal(game.monthDisplay(overtime,true),"301月");

const yeState=game.createInitialState("沈商路","li","standard");
yeState.flags.yeUnlocked=true;
yeState.cash=19;
assert.equal(game.namedCandidateStatus(yeState,"yerong").state,"unaffordable");
yeState.cash=20;
assert.equal(game.namedCandidateStatus(yeState,"yerong").state,"ready");

const oldSave=game.createInitialState("沈旧档","yi","standard");
delete oldSave.insolvencyMonths;
delete oldSave.flags.debtCrisisQueued;
assert.equal(game.normalizeState(oldSave).insolvencyMonths,0);
assert.equal(oldSave.flags.debtCrisisQueued,false);
assert.equal(game.normalizeState({version:1,name:"坏档"}),null);

// 战斗单元夹具：让香港仔与老街相邻，复用三段式战斗的隔离测试。真实地图连通性在 city-economy.test.mjs 验证。
game.TERRITORY_DEFS.old_street.neighbors.push("shipyard");
game.TERRITORY_DEFS.shipyard.neighbors.push("old_street");

const shortCrew=game.createInitialState("沈缺人","wei","standard");
shortCrew.crew=90;
assert.throws(()=>game.resolveBattle(shortCrew,{
  targetId:"shipyard",
  leaderIds:["player"],
  troops:90,
  tactic:"steady"
},()=>.5),/not enough crew/);

const bs=game.createInitialState("沈开战","yi","standard");
bs.crew=1200;
const sess=game.startBattle(bs,{targetId:"shipyard",leaderIds:["player","zhaokui"],troops:600,tactic:"steady"});
assert.equal(sess.stage,1,"开战后停在第1段");
assert.equal(sess.momentum,0);
assert.equal(sess.losses,0);
assert.ok(sess.ratio>0,"ratio 必须在开战时冻结");
assert.equal(bs.crew,600,"出战即扣人：1200-600");
assert.equal(sess.mods.moraleFloor,45,"沈川在阵→士气下限45");
assert.equal(bs.battleSession,sess);
assert.deepEqual(sess.leaderIds,["player","zhaokui"],"leaderIds 应按入参顺序保留");
const dedup=game.createInitialState("沈重复","yi","standard");
dedup.crew=1200;
const dsess=game.startBattle(dedup,{targetId:"shipyard",leaderIds:["player","player","player"],troops:600,tactic:"steady"});
assert.deepEqual(dsess.leaderIds,["player"],"重复头目必须去重，否则战力和奖励都会翻倍");
const picky=game.createInitialState("沈筛选","yi","standard");
picky.crew=1200;
picky.officers.find(o=>o.id==="zhaokui").injured=2;
const psess=game.startBattle(picky,{targetId:"shipyard",leaderIds:["zhaokui","hewanshan","sumanqing","chengye","player"],troops:600,tactic:"steady"});
assert.deepEqual(psess.leaderIds,["sumanqing","chengye","player"],"受伤与敌方头目要剔除，且最多取3人");
const busy=game.createInitialState("沈重入","yi","standard");
busy.crew=1200;
game.startBattle(busy,{targetId:"shipyard",leaderIds:["player"],troops:600,tactic:"steady"});
assert.throws(()=>game.startBattle(busy,{targetId:"golden_bay",leaderIds:["player"],troops:600,tactic:"steady"}),/battle in progress/,"已有战斗进行中时不得再开一场");
const nolead=game.createInitialState("沈无将","yi","standard");
nolead.crew=1200;
assert.throws(()=>game.startBattle(nolead,{targetId:"shipyard",leaderIds:["hewanshan"],troops:600,tactic:"steady"}),/no leaders/);
assert.throws(()=>game.startBattle(nolead,{targetId:"shipyard",leaderIds:["player"],troops:undefined,tactic:"steady"}),/invalid troops/);

const stateBefore=JSON.stringify(bs);
const opt1=game.stageOptions(bs,sess);
assert.equal(JSON.stringify(bs),stateBefore,"stageOptions 必须无副作用");
assert.deepEqual(opt1,game.stageOptions(bs,sess),"stageOptions 必须幂等");
// 幂等的真正用途是刷新后重建界面，所以要按 JSON 往返验证
const revived=JSON.parse(JSON.stringify(bs));
assert.deepEqual(game.stageOptions(revived,revived.battleSession),opt1,"存档往返后选项必须一致");
assert.ok(opt1.every(o=>Number.isFinite(o.mult)&&Number.isFinite(o.casualtyMult)),"每个选项都要有可用的 mult 和 casualtyMult");
const press1=opt1.find(o=>o.id==="press");
assert.equal(press1.speaker,"赵魁","赵魁在阵时由他喊话");
assert.ok(press1.mult>1.15,"赵魁在阵时压上威力更高");
assert.ok(opt1.some(o=>o.id==="hold"));
assert.ok(!opt1.some(o=>o.id==="withdraw"),"第1段不给鸣金");
// 赵魁受伤后应退回通用文案与基础威力
bs.officers.find(o=>o.id==="zhaokui").injured=2;
const hurt=game.stageOptions(bs,sess).find(o=>o.id==="press");
assert.equal(hurt.speaker,"","赵魁受伤后不再喊话");
assert.equal(hurt.mult,1.15);
// 已出走的头目不得继续提议
bs.officers.find(o=>o.id==="zhaokui").injured=0;
bs.officers.find(o=>o.id==="zhaokui").side="defected";
assert.equal(game.stageOptions(bs,sess).find(o=>o.id==="press").speaker,"","出走的头目不得继续参战提议");
bs.officers.find(o=>o.id==="zhaokui").side="player";
sess.stage=2;
assert.ok(game.stageOptions(bs,sess).some(o=>o.id==="withdraw"),"第2段起必须有鸣金");
assert.ok(game.stageOptions(bs,sess).length<=5);
assert.ok(game.stageOptions(bs,sess).some(o=>o.id==="hold"),"稳住必须恒在，自动战斗依赖它");
sess.stage=1;
// 月度推进不得在血拼进行中发生
const midFight=game.createInitialState("沈月中","yi","standard");
midFight.crew=1200;
game.startBattle(midFight,{targetId:"shipyard",leaderIds:["player"],troops:600,tactic:"steady"});
assert.equal(game.advanceMonth(midFight,true),false,"血拼进行中不得推进月份");
assert.equal(midFight.month,0);

const adv=game.createInitialState("沈推进","yi","standard");
adv.crew=1200;
const advSess=game.startBattle(adv,{targetId:"shipyard",leaderIds:["player","zhaokui"],troops:600,tactic:"steady"});
const advRatio=advSess.ratio,crewBefore=adv.crew;
const r1=game.applyStageChoice(adv,"hold",()=>.5);      // rng=.5 -> u=1.0
assert.equal(r1.ended,false);
assert.equal(adv.battleSession.stage,2,"打完一段进入第2段");
// 卡牌对战：势＝(我方剩余战力比例−对方剩余战力比例)×100，必须能从单位状态复算出来。
{const u=adv.battleSession.units,frac=side=>u.filter(x=>x.side===side).reduce((a,x)=>a+Math.max(0,x.str),0)/u.filter(x=>x.side===side).reduce((a,x)=>a+x.max,0);
 assert.equal(adv.battleSession.momentum,Math.round((frac("us")-frac("them"))*1000)/10,"势必须能从单位战力复算");
 assert.ok(u.some(x=>x.side==="us")&&u.some(x=>x.side==="them"),"两边都要有上阵单位");
 assert.equal(adv.battleSession.events.length>0,true,"每段要留下可回放的事件");}
assert.equal(adv.crew,crewBefore,"段内不再动人手池：人在开战时就离开了，伤亡只记在 session 上");
assert.equal(adv.casualties,adv.battleSession.losses,"累计伤亡同步");
assert.ok(adv.battleSession.enemyLoss>0,"敌方也要掉人");
assert.equal(adv.battleSession.log.length,1,"每段留一条战报");
assert.equal(adv.battleSession.log[0].name,"开局");
// 第1段不能鸣金：stageOptions 不提供该选项，因此必须被拒。
// 必须另起一场没打过的战斗来验——adv 此刻已经被上面那次 hold 推进到第2段了。
const fresh=game.createInitialState("沈开局撤","yi","standard");
fresh.crew=1200;
game.startBattle(fresh,{targetId:"shipyard",leaderIds:["player"],troops:600,tactic:"steady"});
assert.equal(fresh.battleSession.stage,1);
assert.throws(()=>game.applyStageChoice(fresh,"withdraw",()=>.5),/invalid option/,"第1段不得撤退");
assert.equal(fresh.crew,1200-fresh.battleSession.troops,"被拒的撤退不得再额外扣人（出战人数按头目能带的上限封顶）");
// 非法选项不得留下任何副作用
const stageOneStage=adv.battleSession.stage;
const crewAfterThrow=adv.crew;
assert.throws(()=>game.applyStageChoice(adv,"不存在的选项",()=>.5),/invalid option/);
assert.equal(adv.crew,crewAfterThrow,"抛错不得扣人");
assert.equal(adv.battleSession.stage,stageOneStage,"抛错不得推进段数");
// 伤亡累计封顶在出战人数：否则 finishBattle 算幸存者会得到负数，人手池会凭空膨胀。
// 自然战斗打不满这个上限（每段约扣 4% 出战人数），所以直接把 losses 顶到临界值来验。
const capLoss=game.createInitialState("沈封顶","wei","standard");
capLoss.crew=2000;
game.startBattle(capLoss,{targetId:"shipyard",leaderIds:["player"],troops:600,tactic:"steady"});
capLoss.battleSession.losses=599;
game.applyStageChoice(capLoss,"hold",()=>.5);
assert.ok(capLoss.battleSession.losses<=600,`伤亡 ${capLoss.battleSession.losses} 不得超过出战的 600 人`);
// rng=0 -> u=0.705，走劣势分支，覆盖 .25 档与"对面顶住了"文案。
// 兵力必须真的处于劣势：30人打驻防68，ratio<1，再好的骰子也翻不出正势。
const bad=game.createInitialState("沈劣势","yi","standard");
bad.crew=3000;
const badSess=game.startBattle(bad,{targetId:"shipyard",leaderIds:["player"],troops:300,tactic:"steady"});
assert.ok(badSess.ratio<1,"这一局必须真的是劣势，否则下面的断言没有意义");
game.applyStageChoice(bad,"hold",()=>0);
assert.ok(bad.battleSession.momentum<0,"u=0.705 且 ratio<1 应打出负势");
assert.ok(bad.battleSession.log[0].text.includes("本段我方折损"),"每段战报要写明双方折损");
// 会话结束后不得再推进
const done=game.createInitialState("沈越界","yi","standard");
done.crew=1200;
game.startBattle(done,{targetId:"shipyard",leaderIds:["player"],troops:600,tactic:"steady"});
done.battleSession.stage=4;
assert.throws(()=>game.applyStageChoice(done,"hold",()=>.5),/battle already finished/,"越界段不得再打");
const noFight=game.createInitialState("沈无战","yi","standard");
assert.throws(()=>game.applyStageChoice(noFight,"hold",()=>.5),/no battle in progress/);

const fin=game.createInitialState("沈结算","yi","standard");
fin.crew=2000;fin.morale=95;fin.territories.shipyard.guard=80;
const fr=game.resolveBattle(fin,{targetId:"shipyard",leaderIds:["player","zhaokui","chengye"],troops:1500,tactic:"assault"},()=>.99);
assert.equal(fr.won,true);
assert.equal(fr.outcome,"win");
assert.equal(fin.territories.shipyard.owner,"player");
assert.equal(fin.battleSession,null,"结算后必须清空会话");
assert.equal(fin.winStreak,1,"胜场连胜计数");
assert.ok(fr.stages.length>=1&&fr.stages.length<=3,"战报按实际打了几段来写：守军提前打散就提前收场");
assert.equal(fin.lastBattle,fr);

// 平衡回归：势必须真的响应兵力差。
// 注意必须用「一条连续的随机流」，不能每局 seeded(seed+k) 重开：LCG 相邻种子的首个输出只差
// 1664525/2^32≈0.0004，那样 150 局的开局骰子几乎完全相同，是格点取样而非蒙特卡洛，尾部永远取不到。
function winRate(troops,seed,n){
  let w=0;const rng=seeded(seed);
  for(let k=0;k<n;k++){
    const t=game.createInitialState("沈平衡","yi","standard");
    t.crew=4000;t.morale=62;t.territories.shipyard.guard=460;
    if(game.resolveBattle(t,{targetId:"shipyard",leaderIds:["player","zhaokui","chengye"],troops,tactic:"steady"},rng).won)w++;
  }
  return w/n;
}
// 兵力只能在 ratio∈(0.772,1.418) 这段窗口里取样：战力对兵力是仿射的（头目那份常数很大），
// 34人→ratio≈0.89，56人→ratio≈1.13，倍差 1.29 才塞得进窗口。取 45/160 会直接冲出窗口两端变成必胜必败。
// 2026-10：人数×10、敌方卡牌系数 1.6（抵掉头目等级带来的增强）之后，窗口整体右移到 400/650 人（ratio≈0.99/1.28）。
const WEAK_TROOPS=400,STRONG_TROOPS=650;
const weakRate=winRate(WEAK_TROOPS,11000,150),strongRate=winRate(STRONG_TROOPS,11000,150);
assert.ok(strongRate>weakRate+.3,`兵力差必须显著改变胜率：${WEAK_TROOPS}人 ${weakRate} vs ${STRONG_TROOPS}人 ${strongRate}`);
assert.ok(weakRate>0,"弱势方不应是必败死区（旧版 ratio<0.848 必败）");
assert.ok(strongRate<1,"优势方不应是必胜死区（旧版 ratio>1.191 必胜）");

s.cash=200;
const candidate=s.recruitMarket[0];
assert.ok(candidate);
assert.equal(game.hireCommon(s,candidate.id),true);
assert.equal(s.ap,2);
assert.equal(s.officers.some(o=>o.id===candidate.id&&o.side==="player"),true);

s.crew=1200;
s.morale=95;
s.territories.shipyard.guard=120;
const report=game.resolveBattle(s,{
  targetId:"shipyard",
  leaderIds:["player","zhaokui","chengye"],
  troops:900,
  tactic:"assault"
},()=>.99);
assert.equal(report.won,true);
assert.equal(s.territories.shipyard.owner,"player");
assert.equal(game.ownTerritories(s).length,2);
assert.ok(s.crew<1200,"battle must consume real crew");

const finalState=game.createInitialState("沈终局","wei","standard");
for(const [id,t] of Object.entries(finalState.territories)){
  if(id!=="central_harbor")t.owner="player";
}
finalState.crew=2400;
finalState.morale=100;
finalState.territories.central_harbor.guard=100;
assert.deepEqual(game.attackableTerritories(finalState),["central_harbor"]);
const finalReport=game.resolveBattle(finalState,{
  targetId:"central_harbor",
  leaderIds:["player","zhaokui","sumanqing"],
  troops:1800,
  tactic:"steady"
},()=>.99);
assert.equal(finalReport.won,true);
assert.equal(finalState.ended,true);
assert.equal(finalState.endingReason,"unified");

const advancing=game.createInitialState("沈经营","li","standard");
const beforeCash=advancing.cash;
game.advanceMonth(advancing,true);
assert.equal(advancing.month,1);
assert.equal(advancing.ap,3);
assert.ok(advancing.cash>beforeCash);
assert.equal(advancing.recruitMarket.length,3);

// 把一名命名头目以我方身份塞进队伍（后续任务复用）
function joinNamed(state,id){
  const d=game.CHARACTER_DEFS[id];
  state.officers=state.officers.filter(o=>o.id!==id);
  state.officers.push({id,name:d.name,side:"player",role:d.role,type:d.type,portrait:d.portrait,
    stats:{...d.stats},trait:d.trait,traitText:d.traitText,loyalty:70,resentment:0,merit:0,
    injured:0,exp:0,battles:0,wins:0,named:true});
  return state;
}
// quitAt=2 表示第2段鸣金；quitAt=0 表示打满三段
function runBattle(quitAt,extraLeader){
  const g=game.createInitialState("沈撤退","yi","standard");
  g.crew=2000;g.morale=70;
  if(extraLeader)joinNamed(g,extraLeader);
  const ids=["player","zhaokui"];if(extraLeader)ids[1]=extraLeader;
  const rng=()=>.5;
  game.startBattle(g,{targetId:"shipyard",leaderIds:ids,troops:1200,tactic:"steady"},rng);
  for(let stage=1;stage<=3&&g.battleSession;stage++){
    game.applyStageChoice(g,quitAt===stage?"withdraw":"hold",rng);
  }
  return g;
}
const quit=runBattle(2),full=runBattle(0);
assert.equal(quit.lastBattle.outcome,"retreat");
assert.ok(full.lastBattle,"打满三段必须结算出战报");
assert.ok(quit.lastBattle.losses<full.lastBattle.losses,"第2段鸣金的伤亡必须严格小于打满三段");
assert.notEqual(quit.territories.shipyard.owner,"player","撤退不夺地");
assert.equal(quit.morale,64,"撤退士气 70-6=64");
assert.equal(quit.battleSession,null,"撤退后必须清空会话");
assert.equal(quit.losses,0,"撤退不计入败场");
assert.equal(quit.winStreak,0,"撤退中断连胜");

// 叶蓉在阵：撤退不掉士气（经营属性首次在战场上生效）
const shielded=runBattle(2,"yerong");
assert.equal(shielded.lastBattle.outcome,"retreat");
assert.equal(shielded.morale,70,"叶蓉在阵撤退不掉士气");

// 听了赵魁「压上去」之后又收手，他会记仇
const pressedQuit=game.createInitialState("沈食言","yi","standard");
pressedQuit.crew=2000;
const pq=()=>.5;
game.startBattle(pressedQuit,{targetId:"shipyard",leaderIds:["player","zhaokui"],troops:1200,tactic:"steady"},pq);
game.applyStageChoice(pressedQuit,"press",pq);
const zkResentBefore=pressedQuit.officers.find(o=>o.id==="zhaokui").resentment;
game.applyStageChoice(pressedQuit,"withdraw",pq);
assert.equal(pressedQuit.officers.find(o=>o.id==="zhaokui").resentment,zkResentBefore+8,"听了赵魁又临阵收手，怨气+8");

// 全程稳住再撤退则不该记仇
const calmQuit=game.createInitialState("沈稳撤","yi","standard");
calmQuit.crew=2000;
const cq=()=>.5;
game.startBattle(calmQuit,{targetId:"shipyard",leaderIds:["player","zhaokui"],troops:1200,tactic:"steady"},cq);
game.applyStageChoice(calmQuit,"hold",cq);
const calmBefore=calmQuit.officers.find(o=>o.id==="zhaokui").resentment;
game.applyStageChoice(calmQuit,"withdraw",cq);
assert.equal(calmQuit.officers.find(o=>o.id==="zhaokui").resentment,calmBefore,"没喊过压上就不该记仇");

const prop=game.createInitialState("沈提议","yi","standard");
prop.crew=2000;
game.startBattle(prop,{targetId:"shipyard",leaderIds:["player","sumanqing","chengye"],troops:1000,tactic:"steady"});
const ps=prop.battleSession;
assert.ok(game.stageOptions(prop,ps).some(o=>o.id==="flank"),"苏曼青谋略88应给出侧翼提议");
assert.ok(!game.stageOptions(prop,ps).some(o=>o.id==="parley"),"势≤10 时不给劝降");
ps.momentum=25;
assert.ok(game.stageOptions(prop,ps).some(o=>o.id==="parley"),"势>10 才解锁劝降");
assert.ok(game.stageOptions(prop,ps).length<=5,"选项上限5");
assert.ok(game.stageOptions(prop,ps).some(o=>o.id==="hold"),"稳住必须恒在");
// 提议效果必须按属性缩放，不是固定值
const flank=game.stageOptions(prop,ps).find(o=>o.id==="flank");
assert.equal(flank.mult,1+prop.officers.find(o=>o.id==="sumanqing").stats.scheme/900,"侧翼威力按谋略缩放");
const parley=game.stageOptions(prop,ps).find(o=>o.id==="parley");
assert.equal(parley.convert,prop.officers.find(o=>o.id==="chengye").stats.charm/260,"劝降转化率按魅力缩放");
assert.equal(parley.mult,.88,"劝降要付出实打实的势，否则解锁后就是必选项");
// 魏小楼：情报未查明时提议后门，并当场写入 intel
const spy=joinNamed(game.createInitialState("沈探路","yi","standard"),"weixiaolou");
spy.crew=2000;
game.startBattle(spy,{targetId:"shipyard",leaderIds:["player","weixiaolou"],troops:1000,tactic:"steady"});
assert.ok(!spy.intel.shipyard,"开打前该地情报未知");
assert.ok(game.stageOptions(spy,spy.battleSession).some(o=>o.id==="backdoor"));
game.applyStageChoice(spy,"backdoor",()=>.5);
assert.equal(spy.intel.shipyard,true,"后门提议必须当场揭穿驻防");
assert.ok(spy.battleSession.log[0].text.includes("魏小楼"),"揭穿要写进战报");
assert.ok(!game.stageOptions(spy,spy.battleSession).some(o=>o.id==="backdoor"),"情报已知后不再重复提议");
// 劝降真的会把敌兵变成自己人。用 guard=70 让 enemyLoss 足够大，转化量才可观。
const talk=game.createInitialState("沈劝降","yi","standard");
talk.crew=3000;talk.morale=95;talk.territories.shipyard.guard=250;   // 出战人数按头目带兵上限封顶到90，守军要相应减少才打得出优势
const tr=()=>.99;
game.startBattle(talk,{targetId:"shipyard",leaderIds:["player","chengye"],troops:2000,tactic:"steady"},tr);
game.applyStageChoice(talk,"hold",tr);
game.applyStageChoice(talk,"hold",tr);
assert.ok(talk.battleSession.momentum>10,"这局必须打出优势，否则劝降不会出现");
assert.ok(game.stageOptions(talk,talk.battleSession).some(o=>o.id==="parley"));
const parleyRate=game.stageOptions(talk,talk.battleSession).find(o=>o.id==="parley").convert;
const crewBeforeStage3=talk.crew;
game.applyStageChoice(talk,"parley",tr);
assert.equal(talk.lastBattle.outcome,"win");
const gain=Math.round(talk.lastBattle.enemyLoss*parleyRate);
assert.ok(gain>0,"转化人数必须大于0，否则这条断言没有意义");
assert.equal(talk.crew,crewBeforeStage3+gain,"劝降转化的人直接进能战池；段内伤亡不再从池子扣");
assert.ok(talk.log.some(l=>l.text.includes("程野把")),"转化要留下江湖记事");
// 对照组：同样局势下选 hold 则不该有任何转化
const noTalk=game.createInitialState("沈不劝","yi","standard");
noTalk.crew=3000;noTalk.morale=95;noTalk.territories.shipyard.guard=250;
const nr=()=>.99;
game.startBattle(noTalk,{targetId:"shipyard",leaderIds:["player","chengye"],troops:2000,tactic:"steady"},nr);
game.applyStageChoice(noTalk,"hold",nr);
game.applyStageChoice(noTalk,"hold",nr);
const noCrewBefore=noTalk.crew;
game.applyStageChoice(noTalk,"hold",nr);
assert.equal(noTalk.crew,noCrewBefore,"没劝降就不该有人加入，且段内伤亡不动人手池");
// 阿七断后：成长更快
const rear=joinNamed(game.createInitialState("沈断后","yi","standard"),"aqi");
rear.crew=2000;
game.startBattle(rear,{targetId:"shipyard",leaderIds:["player","aqi"],troops:1000,tactic:"steady"});
game.applyStageChoice(rear,"hold",()=>.5);
const totalXP=o=>{let n=o.xp||0;for(let l=1;l<(o.lv||1);l++)n+=game.lvNeed(l);return n};
const aqiExpBefore=totalXP(rear.officers.find(o=>o.id==="aqi"));
assert.ok(game.stageOptions(rear,rear.battleSession).some(o=>o.id==="rearguard"),"第2段起阿七可断后");
game.applyStageChoice(rear,"rearguard",()=>.5);
assert.equal(totalXP(rear.officers.find(o=>o.id==="aqi")),aqiExpBefore+6,"断后让阿七多拿6点经验");

// joinNamed 在 Task 5 已定义并会先剔除同 id 的既有条目（韩彪等本来是敌方头目）
const duel=joinNamed(game.createInitialState("沈单挑","wei","standard"),"hanbiao");
duel.crew=2000;
game.startBattle(duel,{targetId:"shipyard",leaderIds:["player","hanbiao"],troops:1000,tactic:"assault"});
assert.ok(game.stageOptions(duel,duel.battleSession).some(o=>o.id==="duel"),"敌方有高武力头目时应给出单挑");
game.applyStageChoice(duel,"duel",()=>.01);   // rng 极小 -> 单挑必胜
assert.ok(duel.battleSession.mods.multRest>1,"单挑胜利提高后续段的势");
assert.ok(duel.battleSession.log[0].text.includes("韩彪"),"单挑要写进战报");
assert.ok(duel.officers.some(o=>o.side==="east"&&o.injured>0),"败方头目应受伤");
assert.ok(duel.officers.find(o=>o.id==="hanbiao").merit>=8,"单挑胜者记功");

// 单挑落败：自己人受伤、后续段变差、士气下降
const lost=joinNamed(game.createInitialState("沈落败","wei","standard"),"hanbiao");
lost.crew=2000;lost.morale=70;
game.startBattle(lost,{targetId:"shipyard",leaderIds:["player","hanbiao"],troops:1000,tactic:"assault"});
game.applyStageChoice(lost,"duel",()=>.999);  // rng 极大 -> 单挑必败
assert.ok(lost.battleSession.mods.multRest<1,"单挑落败拖累后续段");
assert.ok(lost.officers.find(o=>o.id==="hanbiao").injured>0,"落败者受伤");
assert.equal(lost.morale,65,"单挑落败士气 -5（70-5=65），再无其他士气变动");

// 韩彪不在阵时赵魁也能单挑，但没有 +0.15 加成
const noHan=game.createInitialState("沈无韩","wei","standard");
noHan.crew=2000;
game.startBattle(noHan,{targetId:"shipyard",leaderIds:["player","zhaokui"],troops:1000,tactic:"assault"});
assert.ok(game.stageOptions(noHan,noHan.battleSession).some(o=>o.id==="duel"),"赵魁也能发起单挑");

// 敌方全员受伤后不再提供单挑
const noFoe=joinNamed(game.createInitialState("沈无敵","wei","standard"),"hanbiao");
noFoe.crew=2000;
game.startBattle(noFoe,{targetId:"shipyard",leaderIds:["player","hanbiao"],troops:1000,tactic:"assault"});
noFoe.officers.filter(o=>o.side==="east").forEach(o=>{o.injured=2});
assert.ok(!game.stageOptions(noFoe,noFoe.battleSession).some(o=>o.id==="duel"),"敌方无可战头目时不给单挑");

// 单挑打伤的敌将必须会痊愈，否则战后收编那条线会被永久掐断
const healFoe=joinNamed(game.createInitialState("沈愈合","wei","standard"),"hanbiao");
healFoe.crew=4000;
game.startBattle(healFoe,{targetId:"shipyard",leaderIds:["player","hanbiao"],troops:2000,tactic:"assault"});
game.applyStageChoice(healFoe,"duel",()=>.01);
const hurtFoe=healFoe.officers.find(o=>o.side==="east"&&o.injured>0);
assert.ok(hurtFoe,"单挑胜利应打伤一名敌将");
healFoe.battleSession=null;
for(let i=0;i<4;i++)game.advanceMonth(healFoe,true);
assert.equal(healFoe.officers.find(o=>o.id===hurtFoe.id).injured,0,"敌将伤病必须随月份愈合");
// 单挑一场只能打一次，否则 multRest 会叠到 1.56
const once=joinNamed(game.createInitialState("沈一次","wei","standard"),"hanbiao");
once.crew=4000;
game.startBattle(once,{targetId:"shipyard",leaderIds:["player","hanbiao"],troops:2000,tactic:"assault"});
game.applyStageChoice(once,"duel",()=>.01);
assert.equal(once.battleSession.mods.dueled,true);
assert.equal(once.battleSession.mods.multRest,1.25);
assert.ok(!game.stageOptions(once,once.battleSession).some(o=>o.id==="duel"),"一场血拼只能单挑一次");
// 单挑发生在第1段时，multRest 只作用于后续段，不该抬高本段
const timing=joinNamed(game.createInitialState("沈时序","wei","standard"),"hanbiao");
timing.crew=4000;
const tSess=game.startBattle(timing,{targetId:"shipyard",leaderIds:["player","hanbiao"],troops:2000,tactic:"assault"});
const tRatio=tSess.ratio;
game.applyStageChoice(timing,"duel",()=>.01);
assert.ok(Number.isFinite(timing.battleSession.momentum)&&timing.battleSession.mods.multRest===1.25,"单挑赢下后只抬高后续段");
// 阿七断后会提高他自己的受伤概率
const risky=joinNamed(game.createInitialState("沈断后险","yi","standard"),"aqi");
risky.crew=2000;
game.startBattle(risky,{targetId:"shipyard",leaderIds:["player","aqi"],troops:1000,tactic:"steady"});
game.applyStageChoice(risky,"hold",()=>.5);
game.applyStageChoice(risky,"rearguard",()=>.5);
assert.equal(risky.battleSession.mods.aqiRisk,true,"断后要记下加成风险");

// 单挑当场打伤的自己人必须出现在战报的伤员名单里，且不重复。
// startBattle 会把已受伤的头目剔出阵容，所以结算时 injured>0 的必然是本场负伤的。
const rep=joinNamed(game.createInitialState("沈伤报","wei","standard"),"hanbiao");
rep.crew=4000;
game.startBattle(rep,{targetId:"shipyard",leaderIds:["player","hanbiao"],troops:2000,tactic:"assault"});
game.applyStageChoice(rep,"duel",()=>.999);   // 必败 -> 韩彪当场受伤
assert.ok(rep.officers.find(o=>o.id==="hanbiao").injured>0,"落败者应当场受伤");
game.applyStageChoice(rep,"hold",()=>.5);
game.applyStageChoice(rep,"hold",()=>.5);
assert.deepEqual(rep.lastBattle.injured,["韩彪"],"单挑负伤的头目要进战报，且只出现一次");

// 沈川「沈家之后」：士气下限45，低士气时伤亡不再随士气恶化。
// 用同一套阵容与同一 rng，只切 mods.moraleFloor，才能把变量隔离干净。
function floorPower(morale,withPlayer){
  const a=game.createInitialState("沈低迷","yi","standard");
  a.crew=9000;a.morale=morale;
  return game.startBattle(a,{targetId:"shipyard",leaderIds:withPlayer?["player","zhaokui"]:["zhaokui","sumanqing"],troops:800,tactic:"steady"}).power;
}
{const base=game.createInitialState("沈对照","yi","standard");base.crew=9000;base.morale=45;
 assert.equal(floorPower(10,true),game.startBattle(base,{targetId:"shipyard",leaderIds:["player","zhaokui"],troops:800,tactic:"steady"}).power,"士气10但有沈川：开战战力按士气45算");}
assert.ok(floorPower(10,false)<floorPower(45,false),"没有沈川：低士气真的会削弱战力");
const onHi=floorPower(62,true),offHi=game.startBattle(Object.assign(game.createInitialState("沈高昂","yi","standard"),{crew:900,morale:62}),{targetId:"shipyard",leaderIds:["player","zhaokui"],troops:800,tactic:"steady"}).power;
assert.equal(onHi,offHi,"士气62高于下限45，沈川被动不该改变任何结果");

// 唐霁「唯能者居」：胜利时全员功劳 ×1.5
const merit=joinNamed(game.createInitialState("沈唯能","yi","standard"),"tangji");
merit.crew=2500;merit.morale=95;merit.territories.shipyard.guard=60;
game.resolveBattle(merit,{targetId:"shipyard",leaderIds:["player","tangji"],troops:2000,tactic:"assault"},()=>.99);
assert.equal(merit.lastBattle.won,true);
assert.equal(merit.officers.find(o=>o.id==="player").merit,8,"唐霁在阵：胜利功劳 round(5×1.5)=8");
// 对照组：没有唐霁则是基础 5
const noMerit=game.createInitialState("沈无唐","yi","standard");
noMerit.crew=2500;noMerit.morale=95;noMerit.territories.shipyard.guard=60;
game.resolveBattle(noMerit,{targetId:"shipyard",leaderIds:["player","zhaokui"],troops:2000,tactic:"assault"},()=>.99);
assert.equal(noMerit.lastBattle.won,true);
assert.equal(noMerit.officers.find(o=>o.id==="player").merit,5,"没有唐霁就是基础功劳5");

// 谢九「只服胜者」：败北忠诚共 -8（通用 -2 再叠 -6）
const xie=joinNamed(game.createInitialState("沈只服","yi","standard"),"xiejiu");
xie.crew=600;xie.morale=20;xie.territories.shipyard.guard=780;
game.resolveBattle(xie,{targetId:"shipyard",leaderIds:["xiejiu"],troops:200,tactic:"steady"},()=>.01);
assert.equal(xie.lastBattle.won,false,"这局必须打输，否则断言没有意义");
assert.equal(xie.officers.find(o=>o.id==="xiejiu").loyalty,62,"70 -2(通用) -6(谢九) = 62");
assert.equal(xie.winStreak,0);
// 对照组：赵魁同样打输只掉 2
const zk=game.createInitialState("沈赵败","yi","standard");
zk.crew=600;zk.morale=20;zk.territories.shipyard.guard=780;
const zkBefore=zk.officers.find(o=>o.id==="zhaokui").loyalty;
game.resolveBattle(zk,{targetId:"shipyard",leaderIds:["zhaokui"],troops:200,tactic:"steady"},()=>.01);
assert.equal(zk.lastBattle.won,false);
assert.equal(zk.officers.find(o=>o.id==="zhaokui").loyalty,zkBefore-2,"普通头目败北只掉2");
// 谢九连胜加成：winStreak>=2 时 multRest 起步就是 1.05
const streak=joinNamed(game.createInitialState("沈连胜","yi","standard"),"xiejiu");
streak.crew=2000;streak.winStreak=2;
const streakSess=game.startBattle(streak,{targetId:"shipyard",leaderIds:["player","xiejiu"],troops:1000,tactic:"steady"});
assert.equal(streakSess.mods.multRest,1.05,"连胜2场后谢九给全程 ×1.05");
const noStreak=joinNamed(game.createInitialState("沈无连胜","yi","standard"),"xiejiu");
noStreak.crew=2000;noStreak.winStreak=1;
assert.equal(game.startBattle(noStreak,{targetId:"shipyard",leaderIds:["player","xiejiu"],troops:1000,tactic:"steady"}).mods.multRest,1,"连胜不足2场则无加成");

// 旧档缺字段应补默认值，且不得因此被判废
const mig=game.createInitialState("沈迁移","yi","standard");
delete mig.battleSession;delete mig.winStreak;
assert.equal(game.normalizeState(mig).battleSession,null,"旧档缺 battleSession 应补 null");
assert.equal(mig.winStreak,0,"旧档缺 winStreak 应补 0");
// 损坏的会话必须丢弃
function corrupt(mutate){
  const c=game.createInitialState("沈坏档","yi","standard");
  c.crew=1200;
  game.startBattle(c,{targetId:"shipyard",leaderIds:["player"],troops:600,tactic:"steady"});
  mutate(c);
  return game.normalizeState(c);
}
assert.equal(corrupt(c=>{c.battleSession.stage=9}).battleSession,null,"stage 越界要丢弃");
assert.equal(corrupt(c=>{c.battleSession.stage=0}).battleSession,null,"stage 为0要丢弃");
assert.equal(corrupt(c=>{c.battleSession.targetId="不存在的地盘"}).battleSession,null,"目标地盘不存在要丢弃");
assert.equal(corrupt(c=>{c.battleSession.leaderIds=[]}).battleSession,null,"没有可用头目要丢弃");
assert.equal(corrupt(c=>{c.battleSession.leaderIds=["hewanshan"]}).battleSession,null,"阵容全是敌方头目要丢弃");
assert.equal(corrupt(c=>{c.battleSession.momentum="很多"}).battleSession,null,"势不是数字要丢弃");
assert.equal(corrupt(c=>{c.battleSession.troops=NaN}).battleSession,null,"兵力是NaN要丢弃");
assert.equal(corrupt(c=>{delete c.battleSession.mods}).battleSession,null,"缺 mods 要丢弃");
assert.equal(corrupt(c=>{delete c.battleSession.log}).battleSession,null,"缺 log 要丢弃");
// 丢弃时要给玩家留一条记事
const dropped=corrupt(c=>{c.battleSession.stage=9});
assert.ok(dropped.log.some(l=>l.text.includes("中断")),"丢弃会话要写进江湖录");
// 完好会话经 JSON 往返后必须保留并可继续
const ok=game.createInitialState("沈好档","yi","standard");
ok.crew=1200;
game.startBattle(ok,{targetId:"shipyard",leaderIds:["player","zhaokui"],troops:600,tactic:"steady"});
const roundTrip=game.normalizeState(JSON.parse(JSON.stringify(ok)));
assert.ok(roundTrip.battleSession,"完好会话必须保留");
assert.equal(roundTrip.battleSession.stage,1);
assert.deepEqual(game.stageOptions(roundTrip,roundTrip.battleSession),game.stageOptions(ok,ok.battleSession),"往返后重建的选项必须一致");
assert.equal(game.applyStageChoice(roundTrip,"hold",()=>.5).ended,false,"往返后必须能继续推进");

// 终局之战也要有单挑：中央港区挂在港城同盟名下而同盟没有头目，
// 需由已被打散的三家龙头压最后一阵，否则最该有单挑的一战反而没有。
const lastStand=game.createInitialState("沈终战","wei","standard");
for(const id of Object.keys(lastStand.territories))if(id!=="central_harbor")lastStand.territories[id].owner="player";
lastStand.crew=5000;
["hewanshan","fangjingyao","guchangfeng"].forEach(id=>{lastStand.officers.find(o=>o.id===id).side="defeated"});
assert.equal(lastStand.territories.central_harbor.owner,"coalition");
assert.equal(lastStand.officers.filter(o=>o.side==="coalition").length,0,"同盟名下确实没有头目");
game.startBattle(lastStand,{targetId:"central_harbor",leaderIds:["player","zhaokui"],troops:3000,tactic:"assault"});
assert.ok(game.stageOptions(lastStand,lastStand.battleSession).some(o=>o.id==="duel"),"终局之战必须能单挑");
game.applyStageChoice(lastStand,"duel",()=>.01);
assert.ok(lastStand.officers.some(o=>o.side==="defeated"&&o.injured>0),"被打散的龙头出来压阵并被打伤");
// 普通地盘不该借用已被打散的龙头当守将
const normal=game.createInitialState("沈常规","wei","standard");
normal.crew=3000;
normal.officers.filter(o=>o.side==="east").forEach(o=>{o.injured=2});
["hewanshan","fangjingyao","guchangfeng"].forEach(id=>{const o=normal.officers.find(x=>x.id===id);if(o&&o.side!=="east")o.side="defeated"});
game.startBattle(normal,{targetId:"shipyard",leaderIds:["player","zhaokui"],troops:2000,tactic:"assault"});
assert.ok(!game.stageOptions(normal,normal.battleSession).some(o=>o.id==="duel"),"非同盟地盘守将全伤时不得借调他人");

// 劝降拿下的地盘不服管：稳定度比强攻拿下低 10
function parleyStability(useParley){
  const s=game.createInitialState("沈收编","yi","standard");
  s.crew=4000;s.morale=95;s.territories.shipyard.guard=250;
  const rng=()=>.99;
  game.startBattle(s,{targetId:"shipyard",leaderIds:["player","chengye"],troops:2000,tactic:"steady"},rng);
  game.applyStageChoice(s,"hold",rng);game.applyStageChoice(s,"hold",rng);
  game.applyStageChoice(s,useParley?"parley":"hold",rng);
  assert.equal(s.lastBattle.won,true);
  return s.territories.shipyard.stability;
}
assert.equal(parleyStability(false),62,"强攻拿下：义字当头的基础稳定度 62");
assert.equal(parleyStability(true),52,"劝降拿下：收编来的人压不住街面，稳定度 -10");

// ---- 战后人手分流 ----
// 出战的人在 startBattle 离池，finishBattle 必须把他们分成幸存(整补)/重伤(养伤)/阵亡(消失)三份。
const settle=game.createInitialState("沈结算","yi","standard");
settle.crew=1200;
game.resolveBattle(settle,{targetId:"shipyard",leaderIds:["player","zhaokui"],troops:600,tactic:"steady"},seeded(7));   // 两人带兵上限 94，60 人全部上阵
const settleRep=settle.lastBattle;
const settleWounded=Math.round(settleRep.losses*.55);
assert.ok(settleRep.losses>0,"这场仗必须真的死人，否则断言无意义");
assert.equal(settle.crew,600,"出战的600人不得直接回到能战池");
assert.equal(settle.regroup,600-settleRep.losses,"幸存者全部进整补");
assert.equal(settle.wounded,settleWounded,"伤亡的55%进养伤");
assert.equal(game.totalCrew(settle),1200-(settleRep.losses-settleWounded),"总人手只少了阵亡的那部分");

// 撤退与战败走同一条分流路径，不能只在胜利分支里结算。
const settleRetreat=game.createInitialState("沈撤退结算","yi","standard");
settleRetreat.crew=1200;
game.startBattle(settleRetreat,{targetId:"shipyard",leaderIds:["player","sumanqing"],troops:600,tactic:"steady"});
game.applyStageChoice(settleRetreat,"hold",seeded(11));
game.applyStageChoice(settleRetreat,"withdraw",seeded(11));
assert.equal(settleRetreat.battleSession,null,"撤退后会话必须结束");
assert.equal(settleRetreat.regroup+settleRetreat.wounded>0,true,"撤退回来的人也要进整补/养伤，不能凭空消失");
assert.equal(settleRetreat.crew,600,"撤退不把人直接还回能战池");

// ---- 每月回流 ----
const rec=game.createInitialState("沈回流","yi","standard");
rec.crew=0;rec.regroup=480;rec.wounded=100;rec.cash=100;
const recOut=game.recoverCrew(rec);
assert.equal(recOut.back,240,"整补每月回一半：ceil(480*0.5)");
assert.equal(rec.regroup,240);
assert.equal(recOut.healed,28,"讲义气：养伤每月回 ceil(100*0.28)=28");
assert.equal(recOut.cost,4,"医药费 = 伤员数 * 0.04");
assert.equal(rec.cash,96,"医药费从现金里扣");
assert.equal(rec.wounded,72);
assert.equal(rec.crew,268,"240 整补归队 + 28 伤愈");

// 付不出药钱：回归减半、掉士气、且不扣钱（钱本来就不够）
const broke=game.createInitialState("沈没钱养伤","yi","standard");
broke.crew=0;broke.regroup=0;broke.wounded=100;broke.cash=1;
const brokeMorale=broke.morale;
const brokeOut=game.recoverCrew(broke);
assert.equal(brokeOut.broke,true);
assert.equal(brokeOut.healed,14,"付不起时回归减半：floor(28/2)");
assert.equal(brokeOut.cost,0,"付不起就不扣钱");
assert.equal(broke.cash,1);
assert.equal(broke.morale,brokeMorale-4);

// 尾数：整补只剩 30 人时，不能因为"至少回 50 人"而回出负数
const tail=game.createInitialState("沈收尾","yi","standard");
tail.crew=0;tail.regroup=30;tail.wounded=0;
assert.equal(game.recoverCrew(tail).back,30,"整补余数不足50人时一次归队完毕");
assert.equal(tail.regroup,0);
assert.equal(tail.crew,30);

// 空池不得产生任何副作用
const idle=game.createInitialState("沈无伤","yi","standard");
const idleCash=idle.cash,idleCrew=idle.crew;
const idleOut=game.recoverCrew(idle);
assert.deepEqual([idleOut.back,idleOut.healed,idleOut.cost],[0,0,0]);
assert.equal(idle.cash,idleCash);
assert.equal(idle.crew,idleCrew);

// 推进月份必须触发回流
const flow=game.createInitialState("沈过月","yi","standard");
flow.regroup=200;flow.ap=0;
game.advanceMonth(flow,true);
assert.ok(flow.regroup<200,"advanceMonth 必须调用 recoverCrew");

// ---- 人手上限与维护费 ----
const capped=game.createInitialState("沈满员","yi","standard");
capped.cash=100;capped.crew=600;
assert.equal(game.crewCap(capped),600);
assert.equal(game.applyAction(capped,"recruit_crew"),false,"到上限就招不动了");
assert.equal(capped.crew,600,"被拒的招募不得改变人手");
assert.equal(capped.ap,3,"被拒的行动不得扣行动点");

const nearCap=game.createInitialState("沈快满","yi","standard");
nearCap.cash=100;nearCap.crew=550;
game.applyAction(nearCap,"recruit_crew");
assert.equal(game.totalCrew(nearCap),600,"招人不得越过上限");

// 整补和养伤的人也占上限：否则打完仗立刻能招满，池子形同虚设
const capCounts=game.createInitialState("沈占额","yi","standard");
capCounts.cash=100;capCounts.crew=100;capCounts.regroup=300;capCounts.wounded=200;
assert.equal(game.applyAction(capCounts,"recruit_crew"),false,"整补/养伤的人同样占用人手上限");

// 养伤的人也要吃饭
const up=game.createInitialState("沈养伤开销","yi","standard");
const upBase=game.monthlyUpkeep(up);
up.crew=220;up.regroup=100;up.wounded=100;
assert.equal(game.monthlyUpkeep(up),upBase,"维护费按总人手算，养伤的人不免费");

// ---- 血拼消耗行动点 ----
// 这是"5分钟通关"的根因之一：过去发起进攻零成本，一个月可以打无限场。
const apCost=game.createInitialState("沈行动点","yi","standard");
apCost.crew=2000;
game.startBattle(apCost,{targetId:"shipyard",leaderIds:["player"],troops:600,tactic:"steady"});
assert.equal(apCost.ap,2,"开战消耗1个行动点");
while(apCost.battleSession)game.applyStageChoice(apCost,"hold",seeded(3));

const apBroke=game.createInitialState("沈没点数","yi","standard");
apBroke.crew=2000;apBroke.ap=0;
assert.throws(()=>game.startBattle(apBroke,{targetId:"shipyard",leaderIds:["player"],troops:600,tactic:"steady"}),/no action point/);
assert.equal(apBroke.crew,2000,"被拒的开战不得扣人手");

// 错误优先级：人手不足要先于行动点不足报出来，界面提示才对得上
const apOrder=game.createInitialState("沈两缺","yi","standard");
apOrder.crew=90;apOrder.ap=0;
assert.throws(()=>game.startBattle(apOrder,{targetId:"shipyard",leaderIds:["player"],troops:900,tactic:"steady"}),/not enough crew/);

// ---- 存档迁移 ----
// 旧存档没有三池字段，载入后必须补齐而不是变成 NaN。
const legacy=game.createInitialState("沈旧档","yi","standard");
delete legacy.regroup;delete legacy.wounded;
const migrated=game.normalizeState(JSON.parse(JSON.stringify(legacy)));
assert.equal(migrated.regroup,0,"旧存档缺失的整补池补0");
assert.equal(migrated.wounded,0,"旧存档缺失的养伤池补0");
assert.equal(migrated.crew,420,"旧存档的 crew 原样视为能战");

// 脏数据不得变成 NaN
const dirty=game.createInitialState("沈脏档","yi","standard");
dirty.regroup="abc";dirty.wounded=-5;
const cleaned=game.normalizeState(JSON.parse(JSON.stringify(dirty)));
assert.equal(cleaned.regroup,0);
assert.equal(cleaned.wounded,0);

// 中断的战斗：出战的人已经离池，丢弃会话时必须还回整补池，否则凭空蒸发
const aborted=game.createInitialState("沈中断","yi","standard");
aborted.crew=2000;
game.startBattle(aborted,{targetId:"shipyard",leaderIds:["player","zhaokui"],troops:600,tactic:"steady"});
assert.equal(aborted.crew,1400);
aborted.battleSession.stage=99;                                    // 制造一个 validBattleSession 会拒绝的会话
const rescued=game.normalizeState(JSON.parse(JSON.stringify(aborted)));
assert.equal(rescued.battleSession,null,"损坏的会话必须丢弃");
assert.equal(rescued.regroup,600,"出战的600人要还进整补池");
assert.equal(game.totalCrew(rescued),2000,"总人手不得因为存档损坏而减少");


// ---- 三池化之后的连带修正：任何"从组织里扣人"的地方都不能只盯着能战池 ----
// 打完一仗 s.crew 常常是 0（人都在整补），旧写法 Math.max(1,s.crew-n) 会在这种局面下凭空造人。
const drainEmpty=game.createInitialState("沈空池","yi","standard");
drainEmpty.crew=0;drainEmpty.regroup=800;drainEmpty.wounded=0;
assert.equal(game.drainCrew(drainEmpty,80),80,"能战池空时要从整补池里扣");
assert.equal(drainEmpty.crew,0);
assert.equal(drainEmpty.regroup,720);
assert.equal(game.totalCrew(drainEmpty),720,"总人手必须真的减少 80");

const drainOrder=game.createInitialState("沈顺序","yi","standard");
drainOrder.crew=30;drainOrder.regroup=40;drainOrder.wounded=100;
assert.equal(game.drainCrew(drainOrder,90),90,"按 能战→整补→养伤 的顺序扣");
assert.deepEqual([drainOrder.crew,drainOrder.regroup,drainOrder.wounded],[0,0,80]);

const drainOver=game.createInitialState("沈扣光","yi","standard");
drainOver.crew=20;drainOver.regroup=0;drainOver.wounded=10;
assert.equal(game.drainCrew(drainOver,500),30,"人不够时只扣得到实际人数，不得扣成负数");
assert.equal(game.totalCrew(drainOver),0);
assert.ok(drainOver.crew>=0&&drainOver.regroup>=0&&drainOver.wounded>=0,"三池都不得为负");

// 头目叛离：带走的人要从整个组织算，且不得凭空造人
const defect=game.createInitialState("沈叛离","yi","standard");
defect.crew=0;defect.regroup=800;
const defector=defect.officers.find(o=>o.id==="zhaokui");
defector.resentment=90;defector.loyalty=20;
const beforeDefect=game.totalCrew(defect);
game.officerTension(defect,()=>0);                       // rng=0 → chance(.2) 必定触发
assert.equal(defector.side,"defected","这个局面下必须叛离");
assert.equal(game.totalCrew(defect),beforeDefect-80,"叛离带走的80人必须真的从总人手里消失");

console.log("structure and core-loop tests passed");

// ---- Part 2/3 字段的存档迁移 ----
const legacy2=game.createInitialState("沈老档二","yi","standard");
delete legacy2.factions.east.ambition;
legacy2.factions.wan.ambition="x";
legacy2.factions.long.ambition=-3;
delete legacy2.territories.shipyard.settling;
legacy2.territories.golden_bay.settling=99;
const mig2=game.normalizeState(JSON.parse(JSON.stringify(legacy2)));
assert.equal(mig2.factions.east.ambition,0,"缺失的 ambition 补0");
assert.equal(mig2.factions.wan.ambition,0,"非数字的 ambition 补0");
assert.equal(mig2.factions.long.ambition,0,"负数 ambition 夹到0");
assert.equal(mig2.territories.shipyard.settling,0,"缺失的 settling 补0");
assert.equal(mig2.territories.golden_bay.settling,8,"超范围的 settling 夹到8（铺得最开时的上限）");

// ---- 驻防期 ----
const settleT=game.createInitialState("沈未稳","yi","standard");
settleT.territories.shipyard.owner="player";settleT.territories.shipyard.settling=3;
const grossSettling=game.monthlyGross(settleT);
settleT.territories.shipyard.settling=0;
assert.ok(game.monthlyGross(settleT)>grossSettling,"驻防期内收入必须减半");
settleT.territories.shipyard.settling=2;
assert.equal(game.effectiveGuard(settleT,"shipyard"),settleT.territories.shipyard.guard*.7,"驻防期被进攻时只算七成");
const tickT=game.createInitialState("沈递减","yi","standard");
tickT.territories.old_street.settling=2;
game.tickSettling(tickT,()=>.9);                        // rng=.9 → 不触发街面不服
assert.equal(tickT.territories.old_street.settling,1,"每月递减1");
assert.equal(game.settlingTerritories(tickT).length,1);

// ---- 事件池健全性：30+ 事件在"什么都有"的状态下逐个构造，模板串错误在这里先叫 ----
{
  const rich=game.createInitialState("沈事件","yi","standard");
  rich.month=20;rich.cash=100;rich.wins=5;rich.casualties=250;rich.heat=40;rich.wounded=80;
  ["whitesand","clocktower","fogvillage"].forEach(id=>rich.territories[id].owner="player");
  rich.incited={faction:"east",until:25};
  rich.officers.push(...Array.from({length:4},(_,i)=>game.makeCommonCandidate(rich,i)).map(c=>({...c,side:"player"})));
  for(const e of game.RANDOM_EVENTS){
    assert.equal(typeof e.id,"string");
    if(e.condition)e.condition(rich);                       // 条件函数不得抛错
    const opts=e.options(rich);                             // 选项构造不得抛错
    assert.ok(Array.isArray(opts)&&opts.length>=1,`事件 ${e.id} 至少要有一个选项`);
    for(const o of opts)assert.ok(o.text&&typeof o.apply==="function",`事件 ${e.id} 的选项缺 text/apply`);
  }
  assert.ok(game.RANDOM_EVENTS.length>=25,`事件池只有 ${game.RANDOM_EVENTS.length} 个，可玩性扩展要求 25+`);
  for(const [key,build] of Object.entries(game.CHAIN_STEPS)){
    const d=build(rich);                                    // 链式回响允许返回 null，但不得抛错
    if(d)assert.ok(Array.isArray(d.options)&&d.options.length>=1,`事件链 ${key} 缺选项`);
  }
  console.log(`event pool ok: ${game.RANDOM_EVENTS.length} events, ${Object.keys(game.CHAIN_STEPS).length} chain steps`);
}

// ---- 排行榜：用时升序，同用时比难度，再比日期；无 localStorage 时安全退化 ----
{
  const list=[
    {runId:"a",months:40,difficulty:"standard",date:"2026-01-02"},
    {runId:"b",months:18,difficulty:"standard",date:"2026-01-03"},
    {runId:"c",months:18,difficulty:"brutal",date:"2026-01-04"},
    {runId:"d",months:18,difficulty:"brutal",date:"2026-01-01"},
    {runId:"e",months:25,difficulty:"hard",date:"2026-01-05"}
  ];
  const sorted=game.sortLeaderboard(list).map(e=>e.runId);
  assert.deepEqual(sorted,["d","c","b","e","a"],"用时最少在前；同用时死战>标准；同难度先来居前");
  assert.equal(game.rankOf(list,"d"),1);
  assert.equal(game.rankOf(list,"a"),5);
  assert.equal(game.rankOf(list,"没有这局"),null);
  const won=game.createInitialState("沈榜首","wei","brutal");
  won.ended=true;won.endingReason="unified";won.month=17;
  assert.equal(game.recordLeaderboard(won),null,"node 环境无 localStorage：安全返回 null 而不是抛错");
  assert.deepEqual(game.loadLeaderboard(),[],"无 localStorage 时名录为空数组");
  console.log("leaderboard tests ok");
}

// ================= 破局机制（2026-08-31）=================
// 后期地图会冻住的根因是「失败不积累」：打输只削几点驻防，下个月就长回来了。
// 下面这一组锁住的是「围困期不长只掉」「摊子大了压不住」「终局必然到来」这三条通路。

function seq(vals){let i=0;return()=>vals[Math.min(i++,vals.length-1)]}

// ---- 破口：打过一场，那扇门就得漏四个月 ----
{
  const s=game.createInitialState("沈破口","wei","standard");
  s.crew=2000;s.morale=90;const id="clocktower";
  s.territories[id].guard=1200;
  game.resolveBattle(s,{targetId:id,leaderIds:["zhaokui"],troops:120,tactic:"assault"},()=>0.99);
  assert.ok(!game.ownTerritories(s).includes(id),"120人打1200驻防不该赢——这条夹具依赖它输");
  assert.equal(s.breach[id],s.month+4,"打过就留破口，四个月");
  const before=s.territories[id].guard;
  game.enemyGrowth(s);
  assert.equal(s.territories[id].guard,before-60,"破口期内不长驻防，每月-60");
  s.territories[id].guard=320;game.enemyGrowth(s);
  assert.equal(s.territories[id].guard,300,"失血有下限300，不会把墙磨成纸");
  s.month+=5;game.pruneSiege(s);
  assert.ok(!(id in s.breach),"过期的破口标记要清掉");
  const cap=game.enemyCap(s,id);game.enemyGrowth(s);
  assert.ok(s.territories[id].guard>300&&s.territories[id].guard<=cap,"破口一过，驻防照常生长");
}
// 打赢了就没有破口可言——那块地已经是自己的
{
  const s=game.createInitialState("沈拿下","wei","standard");
  s.crew=3000;s.morale=95;s.territories.clocktower.guard=80;
  game.resolveBattle(s,{targetId:"clocktower",leaderIds:["zhaokui","chengye"],troops:2000,tactic:"assault"},()=>0.99);
  assert.ok(game.ownTerritories(s).includes("clocktower"),"这一仗该赢");
  assert.ok(!("clocktower" in s.breach),"打下来的地不留破口");
}

// ---- 封锁：后期现金终于有地方花 ----
{
  const s=game.createInitialState("沈封锁","li","standard");
  const id=game.blockadeTarget(s);
  assert.ok(id&&s.territories[id].owner!=="player"&&s.territories[id].owner!=="free","封锁挑相邻的敌方地盘");
  assert.equal(id,"shipyard","开局唯一相邻的社团地盘是南港码头");
  assert.equal(game.blockadeCost(s,id),Math.round(20+s.territories[id].guard*.015));
  s.cash=5;assert.equal(game.runBlockade(s,id),false,"钱不够就做不成");
  s.cash=400;const cash=s.cash,cost=game.blockadeCost(s,id);
  assert.equal(game.runBlockade(s,id),true);
  assert.equal(Math.round(s.cash),Math.round(cash-cost));
  assert.equal(s.blockade[id],s.month+3,"封锁三个月");
  let g=s.territories[id].guard;game.enemyGrowth(s);
  assert.equal(s.territories[id].guard,g-100,"单独封锁每月-100");
  s.breach[id]=s.month+4;g=s.territories[id].guard;game.enemyGrowth(s);
  assert.equal(s.territories[id].guard,g-140,"破口+封锁叠加为-140而不是-160：双押不该成为唯一解");
  s.month+=5;game.pruneSiege(s);
  assert.ok(!(id in s.blockade)&&!(id in s.breach),"到期一起清");
  const empty=game.createInitialState("沈无邻","li","standard");
  empty.territories.shipyard.owner="free";
  assert.equal(game.blockadeTarget(empty),undefined,"周围没有社团地盘就封锁不了");
}

// ---- 策反：一次性重击，成败两条分支都要成立 ----
{
  const s=game.createInitialState("沈策反","li","standard");
  s.cash=400;const id=game.turncoatTarget(s);
  assert.equal(s.territories[id].owner,"east","策反只对社团地盘生效，散户地不在名单里");
  const p=game.turncoatChance(s),charm=game.createInitialState("x","li","standard").officers
    .filter(o=>o.side==="player").sort((a,b)=>b.stats.charm-a.stats.charm)[0].stats.charm;
  assert.equal(p,Math.max(.25,Math.min(.75,.3+charm/180)),"成功率 = clamp(0.3+最高魅力/180, 0.25, 0.75)");
  const g=s.territories[id].guard;
  const ok=game.runTurncoat(s,id,seq([0]));                       // rng=0 必落在成功区间
  assert.equal(ok.ok,true);
  assert.equal(s.territories[id].guard,g-250,"策反成功：驻防-250");
  assert.equal(s.postures[id],"shaky","街面开始传闲话：姿态转人心浮动");
  assert.equal(s.flags.turncoatWins,1,"成功次数要记下来，总攻的准备度按它算");
  const s2=game.createInitialState("沈失手","li","standard");
  s2.cash=400;const rep=s2.rep,amb=s2.factions.east.ambition||0;
  const bad=game.runTurncoat(s2,game.turncoatTarget(s2),seq([0.999]));
  assert.equal(bad.ok,false);
  assert.equal(s2.rep,rep-3,"失手：声望-3");
  assert.equal(s2.factions.east.ambition,amb+4,"失手：惹火上身，对方扩张意愿+4");
}

// ---- 豪强失序：摊子大了压不住 ----
{
  const s=game.createInitialState("沈失序","wei","standard");
  assert.equal(game.factionDisorder(s,"east"),0,"三块地不失序");
  const capBefore=game.enemyCap(s,"shipyard");
  ["clocktower","fogvillage","whitesand"].forEach(id=>{s.territories[id].owner="east"});
  assert.equal(game.factionDisorder(s,"east"),3,"八块地：disorder = 8-5");
  assert.equal(game.enemyCap(s,"shipyard"),(90+8*18-3*14)*10,"上限 = 90+n*30 - disorder*22");
  assert.ok(game.enemyCap(s,"shipyard")>capBefore,"打折之后仍然比三块地时厚：巨无霸还是巨无霸");
  ["mall","west_market","north_yard"].forEach(id=>{s.territories[id].owner="east"});
  assert.equal(game.factionDisorder(s,"east"),6);
  assert.equal(game.enemyCap(s,"shipyard"),(90+11*18-6*14)*10,"九块地：360 打到 272，被压回玩家天花板的量级");
  // 街面生乱：抢来的地才会闹，老巢不会
  const t=s.territories.whitesand;t.guard=1400;
  const lines=game.disorderTick(s,seq([0]));
  assert.ok(lines.length>=1,"失序要在月报里留一行");
  assert.ok(s.territories.whitesand.guard<1400||s.territories.clocktower.guard<s.territories.clocktower.guard+1);
  // 驻防已经很薄的抢来地会直接反水成散户
  const s2=game.createInitialState("沈反水","wei","standard");
  ["clocktower","fogvillage","whitesand","mall","west_market","north_yard"].forEach(id=>{s2.territories[id].owner="east"});
  s2.territories.whitesand.guard=200;
  game.disorderTick(s2,seq([0]));
  assert.equal(s2.territories.whitesand.owner,"free","驻防<50的抢来地会卷账本走人，变回散户");
  // 起家地不参与
  const s3=game.createInitialState("沈老巢","wei","standard");
  ["clocktower","fogvillage","whitesand"].forEach(id=>{s3.territories[id].owner="east"});
  const homeGuards=["shipyard","shipyard","kwuntong"].map(id=>s3.territories[id].guard);
  for(let i=0;i<20;i++)game.disorderTick(s3,seq([0]));
  assert.deepEqual(["shipyard","shipyard","kwuntong"].map(id=>s3.territories[id].guard),homeGuards,"老巢的人心不会说散就散");
  // 策反对失序势力打七折
  const s4=game.createInitialState("沈折扣","li","standard");
  const full=game.turncoatCost(s4,"shipyard");
  ["clocktower","fogvillage","whitesand"].forEach(id=>{s4.territories[id].owner="east"});
  assert.equal(game.turncoatCost(s4,"shipyard"),Math.round(full*.7),"失序势力的门更好买：成本×0.7");
}

// ---- 消耗战通路（spec §5.4）：300 驻防的墙，八个月能磨到可打 ----
{
  const s=game.createInitialState("沈围困","wei","standard");
  s.crew=900;s.cash=3000;s.morale=85;   // 死局里的玩家从来填不满人手上限：seed0 实测 71/180
  ["kowlooncity","clocktower","fogvillage","whitesand","west_market","mall","north_yard"].forEach(id=>{s.territories[id].owner="player";s.territories[id].settling=0});
  const wall="shipyard";                              // 东潮会的红磡：七块地时够得着的那堵高墙
  s.territories[wall].guard=3000;s.intel[wall]=true;
  const L=["zhaokui","chengye","sumanqing"];
  const rng=(()=>{let n=0;return()=>((n=(n*1664525+1013904223)>>>0)/4294967296)})();
  const before=game.estimateBattle(s,wall,L,800,"assault").ratio;
  assert.ok(before<.6,`起手兵力比 ${before.toFixed(2)}，该是打不动的墙`);
  let taken=false;
  for(let m=0;m<8&&!taken;m++){
    s.ap=3;s.usedActions={};s.crew=900;
    game.applyAction(s,"blockade",rng);                            // 每月一次封锁：这是后期现金的主要去处
    game.resolveBattle(s,{targetId:wall,leaderIds:L,troops:800,tactic:"assault"},rng);  // 打输也算施压
    taken=game.ownTerritories(s).includes(wall);
    s.month++;game.enemyGrowth(s);game.pruneSiege(s);
  }
  s.crew=900;
  const after=taken?9:game.estimateBattle(s,wall,L,800,"assault").ratio;
  assert.ok(after>=.8,`连续施压八个月后兵力比只有 ${after.toFixed(2)}，消耗战通路没有打通（要求 >=0.8）`);
  assert.ok(taken||s.territories[wall].guard<2200,`墙还有 ${s.territories[wall].guard} 驻防，失血量不够`);
  assert.ok(s.month<=8,"八个月之内要么打进去，要么把墙磨到可打");
}

// ---- 终局决战 · 玩家侧 ----
{
  const s=game.createInitialState("沈总攻","wei","standard");s.month=40;
  assert.equal(game.decisiveReady(s),null,"开局不该摊牌");
  Object.keys(s.territories).forEach(id=>{if(id!=="central_harbor"&&!["shipyard","shipyard","fishmarket"].includes(id))s.territories[id].owner="player"});
  ["shipyard","shipyard","fishmarket","central_harbor"].forEach(id=>{s.territories[id].owner="east"});
  s.factions.wan.defeated=true;s.factions.long.defeated=true;
  assert.equal(game.decisiveReady(s),"east","只剩一家、玩家占优：该上最后一张桌了");
  s.flags.decisiveOffered=s.month;
  assert.equal(game.decisiveReady(s),null,"半年之内不重复上桌");
  s.month+=6;
  assert.equal(game.decisiveReady(s),"east","半年后重新触发");
  // 准备度：围困、策反与民心都要算进去
  s.support=70;s.breach.shipyard=s.month+2;s.blockade.shipyard=s.month+1;s.flags.turncoatWins=2;
  assert.equal(game.decisivePrep(s),Math.round((.08*2+.08*2+.1)*100)/100,"准备度 = 破口/封锁/策反各8% + 民心10%");
  // 总攻打赢：整家一次性吞并，直接一统
  const win=JSON.parse(JSON.stringify(s));win.crew=4000;win.morale=95;
  const target=game.decisiveTarget(win,"east");
  assert.ok(game.factionTerritories(win,"east").includes(target));
  win.territories[target].guard=10;game.factionTerritories(win,"east").forEach(id=>{win.territories[id].guard=10});
  game.startBattle(win,{targetId:target,leaderIds:["zhaokui","chengye"],troops:3000,tactic:"assault",decisive:"east",cashIn:0},()=>0.99);
  while(win.battleSession)game.applyStageChoice(win,"press",()=>0.99);
  assert.equal(game.factionTerritories(win,"east").length,0,"总攻打赢：对方全境易帜");
  assert.equal(win.ended,true);
  assert.equal(win.endingReason,"unified");
  // 总攻打输：不判死，但要丢最外沿两块地和三成人手
  const lose=JSON.parse(JSON.stringify(s));lose.crew=600;lose.morale=20;
  game.factionTerritories(lose,"east").forEach(id=>{lose.territories[id].guard=9000});
  const owned=game.ownTerritories(lose).length,crew=game.totalCrew(lose);
  game.startBattle(lose,{targetId:game.decisiveTarget(lose,"east"),leaderIds:["zhaokui"],troops:400,tactic:"assault",decisive:"east"},()=>0.01);
  while(lose.battleSession)game.applyStageChoice(lose,"press",()=>0.01);
  assert.equal(lose.ended,false,"总攻败不判死");
  assert.equal(game.ownTerritories(lose).length,owned-2,"败要丢最外沿两块地");
  assert.ok(game.totalCrew(lose)<crew*.75,"败要掉三成人手（战损另计）");
  assert.equal(lose.flags.decisiveOffered,lose.month,"败后半年才谈得了第二次");
  assert.ok(game.ownTerritories(lose).includes("old_street"),"丢的是最外沿，老街是根");
  // 和局：花钱收编，同样算一统，只是文案要写清楚
  const peace=JSON.parse(JSON.stringify(s));peace.cash=99999;
  assert.equal(game.decisivePeaceCost(peace,"east"),game.factionTerritories(peace,"east").length*40);
  assert.equal(game.decisivePeace(peace,"east"),true);
  assert.equal(peace.endingReason,"unified");
  assert.equal(peace.peaceUnified,true,"和局要留标记，结局文案与名录靠它区分武统");
  assert.equal(game.factionTerritories(peace,"east").length,0);
}

// ---- 终局决战 · AI 侧「兵临老街」 ----
{
  const s=game.createInitialState("沈守城","wei","standard");
  s.month=30;
  assert.equal(game.siegeCandidate(s),undefined,"三块地的一家不会来摘招牌");
  Object.keys(s.territories).filter(id=>id!=="old_street").slice(0,22).forEach(id=>{s.territories[id].owner="east"});
  assert.equal(game.siegeCandidate(s),"east","八块地：该来了");
  assert.equal(game.maybeSiegeWarn(s),"east");
  assert.equal(s.siegeWarn.month,s.month+1,"警讯必须早一个月到——那一个月是留给玩家整备的");
  assert.equal(game.resolveSiege(s,()=>.5),null,"警讯当月不开打");
  const early=game.createInitialState("沈太早","wei","standard");
  early.month=10;["clocktower","fogvillage","whitesand","mall","west_market"].forEach(id=>{early.territories[id].owner="east"});
  assert.equal(game.maybeSiegeWarn(early),null,"第30个月之前不触发守城战");
  // 守得住：对方全境驻防大损，最远一块当场反水
  const hold=JSON.parse(JSON.stringify(s));hold.month++;hold.crew=9000;hold.morale=95;hold.support=80;
  const guards=Object.fromEntries(game.factionTerritories(hold,"east").map(id=>[id,hold.territories[id].guard]));
  const r1=game.resolveSiege(hold,()=>.5);
  assert.equal(r1.held,true);
  assert.equal(hold.ended,false);
  assert.ok(game.factionTerritories(hold,"east").every(id=>hold.territories[id].guard<guards[id]),"守住了：对方全境驻防×0.6");
  assert.ok(Object.values(hold.territories).some(t=>t.owner==="free"),"最远端一块当场反水成散户");
  assert.equal(hold.siegeDone.east,hold.month,"每家只来一次");
  // 惨胜：门顶住了，家底没了
  const grim=JSON.parse(JSON.stringify(s));grim.month++;grim.crew=0;grim.regroup=0;grim.morale=50;grim.support=50;
  grim.territories.old_street.guard=0;
  // 把守方战力精确摆到攻方的 0.8 倍：介于崩盘线(0.72)与守住线(1.0)之间，正好落在惨胜那一档
  grim.territories.old_street.guard=Math.max(1,Math.round((game.siegePower(grim,"east")*.9*.8-game.siegeDefense(grim))/1.5));
  const r2=game.resolveSiege(grim,()=>0);
  assert.equal(r2.held,false);
  assert.equal(r2.routed,false,"没被打崩：留一条命，但要付掉一半家底");
  assert.equal(grim.ended,false);
  // 被打崩：结局 crushed
  const rout=JSON.parse(JSON.stringify(s));rout.month++;rout.crew=0;rout.regroup=0;rout.morale=10;rout.support=10;
  rout.territories.old_street.guard=10;
  const r3=game.resolveSiege(rout,()=>.99);
  assert.equal(r3.routed,true);
  assert.equal(rout.ended,true);
  assert.equal(rout.endingReason,"crushed");
}

// ---- 第十年起风向变：只抬压力底线，不再打折收入 ----
{
  const s=game.createInitialState("沈加时","li","standard");
  s.month=game.MAX_MONTHS;assert.equal(game.eraTick(s),false,"第十年之前不变");
  s.month=game.MAX_MONTHS+6;const gross=game.monthlyGross(s);
  assert.equal(game.eraTick(s),true);
  assert.equal(s.heatFloor,8,"外部压力的地板抬起来，低调也压不回去了");
  assert.equal(game.monthlyGross(s),gross,"收入不再随年份打折");
  for(let k=2;k<20;k++){s.month=game.MAX_MONTHS+6*k;game.eraTick(s)}
  assert.equal(s.heatFloor,60,"压力底线最多抬到 60");
  assert.equal(game.forcedSettlement,undefined,"不再有强制结算");
}

// ---- 必然终结：冻结局面不再存在 ----
// 造一个 spec §1 里描述的死局：玩家 7 块、东潮会 7 块、双方驻防都够不着对方。
{
  const s=game.createInitialState("沈死局","wei","standard");
  s.month=70;s.cash=5000;s.crew=710;s.regroup=0;
  const mine=["old_street","clocktower","fogvillage","whitesand","west_market","mall","north_yard"];
  Object.keys(s.territories).forEach(id=>{s.territories[id].owner=mine.includes(id)?"player":"east";s.territories[id].settling=0;s.territories[id].guard=mine.includes(id)?60:300});
  s.factions.wan.defeated=true;s.factions.long.defeated=true;
  const rng=(()=>{let n=7;return()=>((n=(n*1664525+1013904223)>>>0)/4294967296)})();
  let frozen=0,prev="";
  for(let m=0;m<40&&!s.ended;m++){
    s.ap=0;game.advanceMonth(s,true,rng);
    const sig=game.ownTerritories(s).length+"|"+game.factionTerritories(s,"east").length;
    if(sig===prev)frozen++;else frozen=0;prev=sig;
  }
  assert.ok(s.ended,`spec §1 的死局跑了 40 个月还没终结（现在第 ${s.month} 月）`);
  assert.ok(frozen<24,`地盘数连续 ${frozen} 个月纹丝不动，僵局哨兵报警`);
}

// ---- 旧存档：破局机制的新字段全部要能补默认值 ----
{
  const old=game.createInitialState("沈老档","yi","standard");
  ["breach","blockade","siegeDone","siegeWarn","eraDecay","heatFloor","peaceUnified"].forEach(k=>delete old[k]);
  delete old.flags.decisiveOffered;delete old.flags.turncoatWins;
  old.month=8;
  const fixed=game.normalizeState(JSON.parse(JSON.stringify(old)));
  assert.ok(fixed,"缺新字段的老存档必须读得进来");
  assert.deepEqual(fixed.breach,{});
  assert.deepEqual(fixed.blockade,{});
  assert.deepEqual(fixed.siegeDone,{});
  assert.equal(fixed.siegeWarn,null);
  assert.equal(fixed.eraDecay,1);
  assert.equal(fixed.heatFloor,0);
  assert.equal(fixed.flags.decisiveOffered,0);
  assert.equal(fixed.flags.turncoatWins,0);
  assert.doesNotThrow(()=>{game.enemyGrowth(fixed);game.pruneSiege(fixed);game.disorderTick(fixed,()=>.5);game.eraTick(fixed)});
  // 脏数据也不能把新机制喂成 NaN
  const dirty=game.createInitialState("沈脏档","yi","standard");
  dirty.breach={不存在的地:"x",whitesand:"NaN"};dirty.siegeWarn={faction:"没这家",month:"三"};dirty.eraDecay=-5;
  const cleaned=game.normalizeState(JSON.parse(JSON.stringify(dirty)));
  assert.deepEqual(cleaned.breach,{});
  assert.equal(cleaned.siegeWarn,null);
  assert.equal(cleaned.eraDecay,1);
}

// ---- rng 纪律：同一种子必须走出同一条路 ----
// README 的前车之鉴：漏一处裸 Math.random，固定种子就锁不住曲线。
{
  const seed=()=>{let n=20260831;return()=>((n=(n*1664525+1013904223)>>>0)/4294967296)};
  const run=()=>{const s=game.createInitialState("沈种子","wei","standard"),rng=seed();
    for(let m=0;m<24&&!s.ended;m++){
      s.ap=3;s.usedActions={};
      game.applyAction(s,"recruit_crew",rng);game.applyAction(s,"blockade",rng);game.applyAction(s,"turncoat",rng);
      s.ap=0;game.advanceMonth(s,true,rng);
    }
    return JSON.stringify({m:s.month,c:s.crew,cash:Math.round(s.cash),t:game.ownTerritories(s).length,
      g:Object.keys(s.territories).map(id=>s.territories[id].guard),b:s.breach,k:s.blockade});};
  assert.equal(run(),run(),"同一种子跑两次结果不同：新掷骰里混进了裸 Math.random");
}

// ---- 行动卡的文案预算：卡片在手机上只有半屏宽，标签一旦写成句子就会挤成两行 ----
// 上限取自既有卡片里最长的两条（挑拨离间的效果标签与它的锁定文案），新加的行动不许比它们更长。
{
  const s2=game.createInitialState("沈文案","yi","standard");
  for(const a of game.ACTIONS){
    for(const e of (typeof a.effects==="function"?a.effects(s2):a.effects))assert.ok(e.length<=13,`行动「${a.name}」的效果标签「${e}」有 ${e.length} 字，超出卡片预算`);
    const lt=typeof a.lockedText==="function"?a.lockedText(s2):a.lockedText;
    if(lt)assert.ok(lt.length<=14,`行动「${a.name}」的锁定文案「${lt}」有 ${lt.length} 字，按钮放不下`);
    assert.equal([...a.icon].length,1,`行动「${a.name}」的图标必须是单字`);
  }
  console.log("action copy budget ok");
}

console.log("破局机制 tests ok");
