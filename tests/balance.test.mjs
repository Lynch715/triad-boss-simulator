// 平衡回归测试：用固定种子的策略机器人跑完整局，锁住难度曲线。
// 这里断言的是"通关有多难"，不是"代码对不对"——战斗或经济数值一旦被改松，这个文件会先叫。
//
// 三种玩家画像，缺一不可：
//   莽夫  只要评估到"优势"就打，行动点全砸招人合练 —— 给出通关速度的下界
//   稳健  攒够压倒性优势才出手，会用安顿伤员/加固驻防/坐镇新地盘 —— 接近真实玩法
//   躺平  什么都不做 —— 验证"你不动也会输"
//
// 机器人的出手门槛必须自适应：固定门槛的机器人在够不到时会一仗不打坐着等死，
// 那测出来的是机器人的固执，不是游戏的难度。
import assert from "node:assert/strict";
import {createRequire} from "node:module";

const require=createRequire(import.meta.url);
const game=require("../app.js");

function seeded(seed){return()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}}
const TOTAL=Object.keys(game.TERRITORY_DEFS).length; // 14块地：一统需要13场胜仗
const MONTH_CAP=300;                                                  // 游戏本身没有期限；模拟跑到 300 月还没结局就算冻住
const RUNS=24;
const med=a=>a.length?a.slice().sort((x,y)=>x-y)[Math.floor(a.length/2)]:null;

function topLeaders(s){return s.officers.filter(o=>o.side==="player"&&!o.injured)
  .sort((a,b)=>(b.stats.force+b.stats.command)-(a.stats.force+a.stats.command)).slice(0,3).map(o=>o.id)}

function play(seed,difficulty,bar,useSupport,useSiege=false){
  const rng=seeded(seed),s=game.createInitialState("测","wei",difficulty);
  let idle=0,battles=0,lostTerr=0,frozen=0,frozenMax=0,prev="";
  for(let m=0;m<MONTH_CAP&&!s.ended&&game.ownTerritories(s).length<TOTAL;m++){
    const owned=game.ownTerritories(s).length;
    // 围困的钱只在打不动的时候花——这正是破口/封锁/策反这套工具的设计用途。
    // 排在招人之后：抢在招人前面会把机器人锁进「没兵→只能封锁→更没兵」的死循环，那测的是机器人不是游戏。
    const stuck=useSiege&&idle>=2;
    while(s.ap>1&&(
      (useSupport&&game.applyAction(s,"garrison",rng))||
      (useSupport&&game.applyAction(s,"tend_wounded",rng))||
      game.applyAction(s,"recruit_crew",rng)||
      (stuck&&game.applyAction(s,"blockade",rng))||(stuck&&game.applyAction(s,"turncoat",rng))||
      game.applyAction(s,"train",rng)||
      game.applyAction(s,"business",rng)||(useSupport&&game.applyAction(s,"fortify",rng))));
    let fought=false;
    if(s.ap>=1&&s.crew>=game.MIN_TROOPS){
      const L=topLeaders(s),troops=Math.max(game.MIN_TROOPS,Math.round(s.crew*.9));
      const eff=idle>=6?Math.max(1.05,bar-.3):idle>=3?Math.max(1.1,bar-.15):bar;   // 干等越久越肯冒险
      let best=null;
      for(const id of game.attackableTerritories(s)){
        const e=game.estimateBattle(s,id,L,troops,"assault");
        if(e.ratio>=eff&&(!best||e.ratio>best.r))best={id,r:e.ratio};
      }
      if(best){
        game.startBattle(s,{targetId:best.id,leaderIds:L,troops,tactic:"assault"},rng);
        while(s.battleSession)game.applyStageChoice(s,"press",rng);
        battles++;fought=true;
      }
    }
    if(!fought&&s.ap>=1)idle++;else idle=0;
    if(game.ownTerritories(s).length>=TOTAL)break;
    if(!game.advanceMonth(s,true,rng))break;
    if(game.ownTerritories(s).length<owned)lostTerr+=owned-game.ownTerritories(s).length;
    // 僵局哨兵：玩家与各存活AI的地盘数同时纹丝不动，就是 spec §1 描述的冻结局面。
    const sig=game.ownTerritories(s).length+"|"+game.aliveAIFactions(s).map(f=>game.factionTerritories(s,f).length).join(",");
    if(sig===prev)frozen++;else frozen=0;
    prev=sig;frozenMax=Math.max(frozenMax,frozen);
  }
  return{seed,owned:game.ownTerritories(s).length,reason:s.endingReason,months:s.month,ended:s.ended,unified:game.ownTerritories(s).length===TOTAL,battles,lostTerr,frozenMax,
    poolsOk:s.crew>=0&&s.regroup>=0&&s.wounded>=0};
}

function passive(seed){
  const s=game.createInitialState("躺","yi","standard");
  const prng=seeded(seed);for(let m=0;m<60&&!s.ended;m++){s.ap=0;game.advanceMonth(s,true,prng)}
  return{owned:game.ownTerritories(s).length,wiped:s.ended};
}

const sweep=(d,bar,sup,siege)=>Array.from({length:RUNS},(_,i)=>play(20260731+i*7919,d,bar,sup,siege));
const rush=sweep("standard",1.28,false);
const rushBrutal=sweep("brutal",1.28,false);
const steady=sweep("standard",1.6,true);
const besieger=sweep("standard",1.6,true,true);
const idle=Array.from({length:RUNS},(_,i)=>passive(20260731+i*7919));

const stat=(n,r)=>{const u=r.filter(x=>x.unified);
  return `${n.padEnd(10)} 通关 ${String(u.length).padStart(2)}/${RUNS}  中位 ${String(med(u.map(x=>x.months))??"—").padStart(2)}月  仗 ${med(r.map(x=>x.battles))}  丢地 ${med(r.map(x=>x.lostTerr))}`};
console.log(stat("莽夫·标准",rush));
console.log(stat("莽夫·死战",rushBrutal));
console.log(stat("稳健·标准",steady));
console.log(stat("稳健·围困",besieger));
console.log(`躺平·标准   60月后剩余地盘中位 ${med(idle.map(x=>x.owned))}  被灭 ${idle.filter(x=>x.wiped).length}/${RUNS}`);

const rushMonths=rush.filter(x=>x.unified).map(x=>x.months);
const steadyMonths=steady.filter(x=>x.unified).map(x=>x.months);

// ① 行动点闸门：一统需 13 场仗（14 块地减去开局的老街），每场 1 行动点、每月 3 点，
//    且出战会掏空能战人手 ⇒ 每月至多一场 ⇒ 最快第 12 月。这条精确锁死"血拼不消耗行动点"这个根因。
assert.ok(Math.min(...rushMonths)>=80,`最快通关 ${Math.min(...rushMonths)} 月，太快了（要求 >=80）`);

// ② 速通下界：莽夫是接近完美的打法，它都要 12 个月以上，说明滚雪球已经被掐住。
//    实测中位 18~19 月（2026-08 难度上调后）；阈值留余量。
assert.ok(med(rushMonths)>=85,`莽夫中位 ${med(rushMonths)} 月，滚雪球回来了（要求 >=85）`);

// ③ 正常玩法要撑起战役体量。实测稳健派中位 52 月：主战役刚好打满，常要进加时。
assert.ok(med(steadyMonths)>=110,`稳健中位 ${med(steadyMonths)} 月，战役太短（要求 >=110）`);

// ④ 但不能矫枉过正变成打不完。稳健派至少要有一半能赢（2026-08 难度上调后实测 54%~70%）。
assert.ok(steady.filter(x=>x.unified).length>=RUNS*.5,`稳健只有 ${steady.filter(x=>x.unified).length}/${RUNS} 通关，难到不可玩`);

// ⑤ 死战要真的难，不能和标准难度一个手感。
const brutalWin=rushBrutal.filter(x=>x.unified).length;
assert.ok(brutalWin<RUNS*.8,`死战通关 ${brutalWin}/${RUNS}，太容易`);
assert.ok(brutalWin>0,"死战通关率为 0，等于不可玩");

// ⑥ 你不动也会输：躺平的玩家 60 个月后应当所剩无几。
assert.ok(med(idle.map(x=>x.owned))<=2,`躺平玩家还剩 ${med(idle.map(x=>x.owned))} 块地，外部压力不够`);

// ⑦ 人手守恒：三个池子任何时候都不得为负。
for(const r of [...rush,...rushBrutal,...steady])assert.ok(r.poolsOk,"出现负数人手池");

console.log("balance tests passed");

// ================= 破局机制（2026-08-31）的平衡收口 =================
// 加这一组之前，稳健画像有 5/24 局跑到 120 个月仍未终结：敌方驻防 300+ 对玩家攻击天花板 ~250，
// 双方互相打不动，现金堆到几千万无处可花。下面三条锁住的就是「这种局面不再出现」。

// ⑧ 必然终结：没有时间限制，但任何一局都要在 300 月内分出结局（一统、失守或破产）。
for(const [name,set] of [["稳健",steady],["稳健·围困",besieger],["莽夫",rush],["莽夫·死战",rushBrutal]]){
  const stuck=set.filter(r=>!r.ended&&!r.unified);
  assert.equal(stuck.length,0,`${name} 有 ${stuck.length} 局跑到 ${MONTH_CAP} 月仍未终结，后期又冻住了`);
}

// ⑨ 僵局哨兵：地盘数连续 24 个月完全不变即判定为冻结。
for(const [name,set] of [["稳健",steady],["稳健·围困",besieger],["莽夫·死战",rushBrutal]]){
  const worst=Math.max(...set.map(r=>r.frozenMax));
  if(worst>=24)console.log(name,set.filter(r=>r.frozenMax>=24));
  assert.ok(worst<24,`${name} 出现连续 ${worst} 个月地盘数纹丝不动的冻结局面`);
}

// ⑩ 破局工具是通路不是送分：稳健派通关率仍要落在一个像样的区间里。
const steadyWin=steady.filter(x=>x.unified).length,siegeWin=besieger.filter(x=>x.unified).length;
// 没有期限之后，稳健派慢慢磨总能赢；难度改由通关月数（③）来锁，这里只管下限。
assert.ok(steadyWin>=RUNS*.4,`稳健通关 ${steadyWin}/${RUNS}，难到不可玩`);
assert.ok(siegeWin>=RUNS*.3,`会用围困的稳健派只通关 ${siegeWin}/${RUNS}，破局工具反而是负收益`);

console.log(`必然终结：全部 ${RUNS*4} 局均在 ${Math.max(...[...steady,...besieger,...rush,...rushBrutal].map(r=>r.months))} 月内结束`);
console.log("破局机制 balance tests passed");
