"use strict";

const SAVE_KEY="fog_harbor_boss_save_v1";
const VERSION=1;
// 没有时间限制：打到一统、老街失守或破产为止。第十年起「风向变」（eraTick）只是后期压力，不是期限。
const MAX_MONTHS=120;
// 守城战的攻方缩放：调它就是调「兵临老街」的难度。1.5 时稳健派多数能顶住，死战难度约三成被攻破——
// 低于这个数守城不成其为关卡，高于它则一个没提前整备的玩家必死。
const SIEGE_SCALE=1.5;
const BANKRUPT_CASH=-30;

// 2026-08 整体难度上调：旧"标准"手感约等于现在的入门想象，全档位向上压一档。
const DIFFICULTIES={
  standard:{name:"标准",enemyGrowth:1.05,enemyAttack:.3,battle:1.04,income:.95,aiOnPlayer:.28},
  hard:{name:"艰难",enemyGrowth:1.24,enemyAttack:.38,battle:1.07,income:.86,aiOnPlayer:.38},
  brutal:{name:"死战",enemyGrowth:1.36,enemyAttack:.45,battle:1.12,income:.76,aiOnPlayer:.44}
};

const CREEDS={
  yi:{name:"义字当头",desc:"旧部更忠，收编敌将更容易"},
  wei:{name:"人必须怕你",desc:"血拼威力更强，对手更容易崩溃"},
  li:{name:"钱要永远先到",desc:"收入更高，招募成本更低"}
};

// ---- 防守姿态与战术克制 ----
// 每块敌方地盘有一种姿态，易主时重掷。姿态只有查过情报才可见——
// 情报因此从「加分项」变成「选战术的依据」。稳扎稳打对所有姿态中立（保底解），
// 其余三种战术各有克制与被克，蒙着打的期望持平，查明了打才有溢价。
const POSTURES={
  ironwall:{name:"铁壁死守",hint:"怕奇袭 · 克强攻",mods:{assault:.9,ambush:1.12}},
  roam:{name:"外线游斗",hint:"怕强攻 · 克奇袭",mods:{ambush:.9,assault:1.08}},
  bounty:{name:"重赏死士",hint:"怕消耗 · 克劝降",mods:{persuade:.88,steady:1.08}},
  shaky:{name:"人心浮动",hint:"怕劝降",mods:{persuade:1.15}}
};
const POSTURE_IDS=Object.keys(POSTURES);
// 开局姿态按阵营性格固定（何万山死守码头、方景曜重金养人、顾长风人心机变），
// 易主后才随机重掷。开局若随机，平衡测试的固定种子会失去意义。
const INIT_POSTURES={south_dock:"ironwall",shipyard:"roam",fishmarket:"shaky",golden_bay:"bounty",new_city:"ironwall",mall:"bounty",west_market:"shaky",north_yard:"roam",highway:"roam",clocktower:"shaky",fogvillage:"shaky",whitesand:"shaky",central_harbor:"ironwall"};

// ---- 世界规则（每局随机） ----
// 开局随机抽2条，整局生效。测试与老存档默认为空数组，不影响既有平衡基线。
const MUTATORS={
  rain:{name:"阴雨连绵",desc:"血拼伤亡-12%，地盘收入-8%"},
  customs:{name:"海关大检查",desc:"外部压力涨得更快，但敌方扩张也更慢"},
  goldrush:{name:"金价飞涨",desc:"地盘收入+15%，招募成本+25%"},
  veterans:{name:"老兵还乡",desc:"整补归队更快，招人略多"},
  crackdown:{name:"严打之年",desc:"扫荡更凶，但每场胜仗声望+2"},
  smuggle:{name:"走私旺季",desc:"香港仔与湾仔收入+40%，外部压力每月+1"}
};
function mutOn(s,id){return Array.isArray(s.mutators)&&s.mutators.includes(id)}
function rollMutators(rng=Math.random){const pool=Object.keys(MUTATORS).slice();const out=[];while(out.length<2&&pool.length)out.push(pool.splice(Math.floor(rng()*pool.length),1)[0]);return out}

const FACTIONS={
  player:{name:"和联胜",color:"#a8241c"},
  east:{name:"东潮会",color:"#2f4f7a"},
  wan:{name:"万盛堂",color:"#a77a2a"},
  long:{name:"长风社",color:"#6b4a7a"},
  free:{name:"散户自保",color:"#8a7f6b"},
  coalition:{name:"港城同盟",color:"#2a2118"}
};

const CHARACTER_DEFS={
  player:{name:"沈川",faction:"player",role:"话事人",type:"龙头",portrait:"assets/player.webp",stats:{force:64,command:63,scheme:58,business:52,charm:64},trait:"沈家之后",traitText:"亲自出战时士气不会低于45。"},
  father:{name:"沈振海",faction:"player",role:"前任话事人",type:"前辈",portrait:"assets/father.webp",stats:{force:71,command:88,scheme:82,business:65,charm:84},trait:"父亲的旧账",traitText:"他留下的每笔人情都会回来找你。"},
  zhaokui:{name:"赵魁",faction:"player",role:"战堂负责人",type:"猛将",portrait:"assets/zhao-kui.webp",stats:{force:86,command:76,scheme:38,business:31,charm:49},trait:"战堂铁腕",traitText:"强攻时进攻威力+12%，但连续避战会积累怨气。"},
  sumanqing:{name:"苏曼青",faction:"player",role:"账房军师",type:"军师",portrait:"assets/su-manqing.webp",stats:{force:28,command:57,scheme:88,business:92,charm:68},trait:"精算旧账",traitText:"地盘净收入+12%，可得到更精确的战前评估。"},
  chengye:{name:"程野",faction:"player",role:"青年堂口头目",type:"说客",portrait:"assets/cheng-ye.webp",stats:{force:68,command:67,scheme:62,business:51,charm:84},trait:"一声兄弟",traitText:"招募人手增加25%，劝降战术更强。"},
  hewanshan:{name:"何万山",faction:"east",role:"东潮会话事人",type:"龙头",portrait:"assets/he-wanshan.webp",stats:{force:73,command:84,scheme:69,business:61,charm:70},trait:"码头老将",traitText:"防守香港仔和船厂时格外强硬。"},
  tangji:{name:"唐霁",faction:"east",role:"东潮会主将",type:"统将",portrait:"assets/tang-ji.webp",stats:{force:78,command:87,scheme:70,business:43,charm:67},trait:"唯能者居",traitText:"胜利时显著提高所有参战头目的功劳。"},
  fangjingyao:{name:"方景曜",faction:"wan",role:"万盛堂话事人",type:"商枭",portrait:"assets/fang-jingyao.webp",stats:{force:45,command:66,scheme:81,business:94,charm:78},trait:"价码优先",traitText:"手下地盘收入与敌将挖角能力极强。"},
  hanbiao:{name:"韩彪",faction:"wan",role:"万盛堂头号猛将",type:"猛将",portrait:"assets/han-biao.webp",stats:{force:94,command:67,scheme:31,business:24,charm:45},trait:"顶门硬骨",traitText:"个人武力最高，强攻时可压住对方一名猛将。"},
  guchangfeng:{name:"顾长风",faction:"long",role:"长风社话事人",type:"策士",portrait:"assets/gu-changfeng.webp",stats:{force:61,command:72,scheme:91,business:72,charm:86},trait:"合纵连横",traitText:"反攻前更容易与其他势力共同施压。"},
  weixiaolou:{name:"魏小楼",faction:"long",role:"长风社情报头目",type:"探子",portrait:"assets/wei-xiaolou.webp",stats:{force:48,command:59,scheme:95,business:65,charm:73},trait:"留一扇门",traitText:"可查明相邻敌方地盘的真实驻防。"},
  xiejiu:{name:"谢九",faction:"neutral",role:"独立头目",type:"猛将",portrait:"assets/xie-jiu.webp",stats:{force:91,command:72,scheme:46,business:35,charm:57},trait:"只服胜者",traitText:"连胜时战力上升，战败后忠诚下降更快。"},
  yerong:{name:"叶蓉",faction:"neutral",role:"港口商路经营者",type:"管事",portrait:"assets/ye-rong.webp",stats:{force:33,command:55,scheme:76,business:96,charm:79},trait:"货通雾港",traitText:"所有已占地盘收入+15%。"},
  aqi:{name:"阿七",faction:"neutral",role:"老街新人",type:"新人",portrait:"assets/ah-qi.webp",stats:{force:52,command:43,scheme:46,business:38,charm:61},trait:"照着你长",traitText:"每次参战都会成长，结局会反映玩家的行事方式。"}
};

// ---- 雾港全图：36块地（十八区各两段） ----
// 结构：老街（玩家，全图最小）被三块散户地半包围；散户带是早期唯一啃得动的目标，
// 也是玩家与三家社团的必争缓冲区。三家各3块地、驻防很高——正面攻坚是中后期的事。
// 老街与香港仔保留相邻（原图设定，测试与剧情都依赖这条边）。
// 香港18区，每区两个经营地段。线路为策略示意，不是行政边界或真实通行图。
const DISTRICTS={
  "中西区":{"region":"港岛","territories":["central_harbor","sheungwan"]},
  "湾仔区":{"region":"港岛","territories":["golden_bay","causeway"]},
  "东区":{"region":"港岛","territories":["new_city","chaiwan"]},
  "南区":{"region":"港岛","territories":["south_dock","stanley"]},
  "油尖旺区":{"region":"九龙","territories":["old_street","clocktower"]},
  "深水埗区":{"region":"九龙","territories":["west_market","cheungsha"]},
  "九龙城区":{"region":"九龙","territories":["shipyard","kowlooncity"]},
  "黄大仙区":{"region":"九龙","territories":["wongtais","diamond"]},
  "观塘区":{"region":"九龙","territories":["kwuntong","yautong"]},
  "葵青区":{"region":"新界","territories":["kwai","tsingyi"]},
  "荃湾区":{"region":"新界","territories":["tsuenwan","shamtseng"]},
  "屯门区":{"region":"新界","territories":["tuenmun","butterfly"]},
  "元朗区":{"region":"新界","territories":["yuenlong","tinsui"]},
  "北区":{"region":"新界","territories":["north_yard","fanling"]},
  "大埔区":{"region":"新界","territories":["taipo","fishmarket"]},
  "沙田区":{"region":"新界","territories":["mall","highway"]},
  "西贡区":{"region":"新界","territories":["fogvillage","tko"]},
  "离岛区":{"region":"离岛","territories":["tungchung","whitesand"]}
};
// 人数口径：小弟、驻防都按“个人”计，2026-10 起整体放大十倍（开局 420 人）。
const PEOPLE=10,MIN_TROOPS=10*PEOPLE;
// 新地立稳要四个月；打下来的地留一半幸存者看守。
const SETTLE_MONTHS=4,SETTLE_MAX=8;
const TERRITORY_DEFS={
  "central_harbor":{"name":"中环","owner":"coalition","income":24,"guard":210,"district":"中西区","region":"港岛","affinity":"commerce","bonus":"商业客流旺，商贸产业收入更高","neighbors":["sheungwan","clocktower"],"final":true},
  "sheungwan":{"name":"上环","owner":"wan","income":11,"guard":112,"district":"中西区","region":"港岛","affinity":"commerce","bonus":"商业客流旺，商贸产业收入更高","neighbors":["central_harbor","golden_bay","whitesand"]},
  "golden_bay":{"name":"湾仔","owner":"wan","income":11,"guard":280,"hq":true,"district":"湾仔区","region":"港岛","affinity":"commerce","bonus":"商业客流旺，商贸产业收入更高；收入较高，每月压力+2","neighbors":["causeway","shipyard","sheungwan","south_dock"]},
  "causeway":{"name":"铜锣湾","owner":"wan","income":11,"guard":112,"district":"湾仔区","region":"港岛","affinity":"commerce","bonus":"商业客流旺，商贸产业收入更高","neighbors":["golden_bay","new_city"]},
  "new_city":{"name":"北角","owner":"wan","income":11,"guard":112,"district":"东区","region":"港岛","affinity":"logistics","bonus":"运输条件好，物流产业收入更高；高级人才出现率提升","neighbors":["chaiwan","yautong","causeway"]},
  "chaiwan":{"name":"柴湾","owner":"free","income":6,"guard":46,"district":"东区","region":"港岛","affinity":"logistics","bonus":"运输条件好，物流产业收入更高","neighbors":["new_city","stanley"]},
  "south_dock":{"name":"香港仔","owner":"east","income":11,"guard":280,"hq":true,"district":"南区","region":"港岛","affinity":"neighborhood","bonus":"街坊根基深，社区产业收入更高；人手维护-10%","neighbors":["stanley","golden_bay"]},
  "stanley":{"name":"赤柱","owner":"free","income":6,"guard":58,"district":"南区","region":"港岛","affinity":"neighborhood","bonus":"街坊根基深，社区产业收入更高","neighbors":["south_dock","chaiwan"]},
  "old_street":{"name":"油麻地老街","owner":"player","income":8,"guard":44,"district":"油尖旺区","region":"九龙","affinity":"commerce","bonus":"商业客流旺，商贸产业收入更高；招人额外+20人","neighbors":["clocktower","west_market","kowlooncity"]},
  "clocktower":{"name":"尖沙咀","owner":"free","income":6,"guard":46,"district":"油尖旺区","region":"九龙","affinity":"commerce","bonus":"商业客流旺，商贸产业收入更高；一次可打听两处敌情","neighbors":["old_street","shipyard","central_harbor"]},
  "west_market":{"name":"深水埗","owner":"free","income":6,"guard":52,"district":"深水埗区","region":"九龙","affinity":"neighborhood","bonus":"街坊根基深，社区产业收入更高；地盘投资-15%","neighbors":["cheungsha","old_street"]},
  "cheungsha":{"name":"长沙湾","owner":"long","income":11,"guard":280,"hq":true,"district":"深水埗区","region":"九龙","affinity":"neighborhood","bonus":"街坊根基深，社区产业收入更高","neighbors":["west_market","kwai"]},
  "shipyard":{"name":"红磡","owner":"east","income":11,"guard":112,"district":"九龙城区","region":"九龙","affinity":"neighborhood","bonus":"街坊根基深，社区产业收入更高；血拼伤亡-8%","neighbors":["kowlooncity","clocktower","golden_bay"]},
  "kowlooncity":{"name":"九龙城","owner":"free","income":6,"guard":46,"district":"九龙城区","region":"九龙","affinity":"neighborhood","bonus":"街坊根基深，社区产业收入更高","neighbors":["shipyard","old_street","wongtais","kwuntong"]},
  "wongtais":{"name":"黄大仙","owner":"free","income":6,"guard":52,"district":"黄大仙区","region":"九龙","affinity":"neighborhood","bonus":"街坊根基深，社区产业收入更高","neighbors":["diamond","mall","kowlooncity"]},
  "diamond":{"name":"钻石山","owner":"free","income":6,"guard":58,"district":"黄大仙区","region":"九龙","affinity":"neighborhood","bonus":"街坊根基深，社区产业收入更高","neighbors":["wongtais","kwuntong"]},
  "kwuntong":{"name":"观塘","owner":"east","income":11,"guard":112,"district":"观塘区","region":"九龙","affinity":"logistics","bonus":"运输条件好，物流产业收入更高","neighbors":["yautong","diamond","kowlooncity"]},
  "yautong":{"name":"油塘","owner":"east","income":11,"guard":112,"district":"观塘区","region":"九龙","affinity":"logistics","bonus":"运输条件好，物流产业收入更高","neighbors":["kwuntong","tko","new_city"]},
  "kwai":{"name":"葵涌","owner":"long","income":11,"guard":112,"district":"葵青区","region":"新界","affinity":"logistics","bonus":"运输条件好，物流产业收入更高","neighbors":["tsingyi","cheungsha","tsuenwan"]},
  "tsingyi":{"name":"青衣","owner":"long","income":11,"guard":112,"district":"葵青区","region":"新界","affinity":"logistics","bonus":"运输条件好，物流产业收入更高","neighbors":["kwai","tungchung"]},
  "tsuenwan":{"name":"荃湾","owner":"long","income":11,"guard":112,"district":"荃湾区","region":"新界","affinity":"commerce","bonus":"商业客流旺，商贸产业收入更高","neighbors":["shamtseng","kwai"]},
  "shamtseng":{"name":"深井","owner":"free","income":6,"guard":46,"district":"荃湾区","region":"新界","affinity":"commerce","bonus":"商业客流旺，商贸产业收入更高","neighbors":["tsuenwan","tuenmun"]},
  "tuenmun":{"name":"屯门","owner":"free","income":6,"guard":52,"district":"屯门区","region":"新界","affinity":"logistics","bonus":"运输条件好，物流产业收入更高","neighbors":["butterfly","shamtseng","yuenlong"]},
  "butterfly":{"name":"蝴蝶湾","owner":"free","income":6,"guard":58,"district":"屯门区","region":"新界","affinity":"logistics","bonus":"运输条件好，物流产业收入更高","neighbors":["tuenmun"]},
  "yuenlong":{"name":"元朗","owner":"free","income":6,"guard":40,"district":"元朗区","region":"新界","affinity":"neighborhood","bonus":"街坊根基深，社区产业收入更高","neighbors":["tinsui","tuenmun","north_yard"]},
  "tinsui":{"name":"天水围","owner":"free","income":6,"guard":46,"district":"元朗区","region":"新界","affinity":"neighborhood","bonus":"街坊根基深，社区产业收入更高","neighbors":["yuenlong","north_yard"]},
  "north_yard":{"name":"上水","owner":"long","income":11,"guard":112,"district":"北区","region":"新界","affinity":"logistics","bonus":"运输条件好，物流产业收入更高；撤退伤亡-12%","neighbors":["fanling","tinsui","yuenlong"]},
  "fanling":{"name":"粉岭","owner":"free","income":6,"guard":58,"district":"北区","region":"新界","affinity":"logistics","bonus":"运输条件好，物流产业收入更高","neighbors":["north_yard","taipo"]},
  "taipo":{"name":"大埔","owner":"free","income":6,"guard":40,"district":"大埔区","region":"新界","affinity":"neighborhood","bonus":"街坊根基深，社区产业收入更高","neighbors":["fishmarket","fanling"]},
  "fishmarket":{"name":"大埔墟","owner":"free","income":6,"guard":46,"district":"大埔区","region":"新界","affinity":"neighborhood","bonus":"街坊根基深，社区产业收入更高；伤员药钱-20%","neighbors":["taipo","mall"]},
  "mall":{"name":"沙田","owner":"wan","income":11,"guard":112,"district":"沙田区","region":"新界","affinity":"commerce","bonus":"商业客流旺，商贸产业收入更高；地盘投资-10%","neighbors":["highway","fishmarket","wongtais"]},
  "highway":{"name":"马鞍山","owner":"free","income":6,"guard":58,"district":"沙田区","region":"新界","affinity":"commerce","bonus":"商业客流旺，商贸产业收入更高；整补归队更快","neighbors":["mall","fogvillage"]},
  "fogvillage":{"name":"西贡","owner":"free","income":6,"guard":40,"district":"西贡区","region":"新界","affinity":"neighborhood","bonus":"街坊根基深，社区产业收入更高；人手维护-5%","neighbors":["tko","highway"]},
  "tko":{"name":"将军澳","owner":"east","income":11,"guard":112,"district":"西贡区","region":"新界","affinity":"neighborhood","bonus":"街坊根基深，社区产业收入更高","neighbors":["fogvillage","yautong"]},
  "tungchung":{"name":"东涌","owner":"free","income":6,"guard":52,"district":"离岛区","region":"离岛","affinity":"logistics","bonus":"运输条件好，物流产业收入更高","neighbors":["whitesand","tsingyi"]},
  "whitesand":{"name":"长洲","owner":"free","income":6,"guard":58,"district":"离岛区","region":"离岛","affinity":"logistics","bonus":"运输条件好，物流产业收入更高；招募成本-10%","neighbors":["tungchung","sheungwan"]}
};
Object.values(TERRITORY_DEFS).forEach(d=>{d.guard*=PEOPLE});
const TERRITORY_TOTAL=Object.keys(TERRITORY_DEFS).length;
// 坐标对应 assets/map-harbor.webp（1254×1254），每个点都落在图上的陆地里。
const MAP_POS={"sheungwan":[460,892],"central_harbor":[571,908],"golden_bay":[738,899],"causeway":[857,899],"new_city":[934,966],"chaiwan":[1059,1010],"south_dock":[585,1024],"stanley":[803,991],"clocktower":[669,790],"old_street":[655,669],"shipyard":[740,656],"west_market":[557,585],"cheungsha":[460,536],"kowlooncity":[780,571],"wongtais":[808,481],"diamond":[892,571],"kwuntong":[1003,683],"yautong":[1087,690],"tko":[1116,765],"fogvillage":[1190,695],"kwai":[404,460],"tsingyi":[300,425],"tsuenwan":[376,369],"shamtseng":[265,341],"tuenmun":[209,251],"butterfly":[125,265],"yuenlong":[334,209],"tinsui":[279,118],"north_yard":[557,111],"fanling":[683,153],"taipo":[794,279],"fishmarket":[683,307],"mall":[655,418],"highway":[864,376],"tungchung":[238,953],"whitesand":[181,1059]};
// 产业按月自动营业，建设占用现金和行动；营业方针每月只能调整一次。
const INDUSTRIES={
  neighborhood:{name:"街坊生意",icon:"茶",examples:"茶楼 · 餐馆 · 修理铺",cost:16,revenue:6,upkeep:2,description:"回本平稳；照顾街坊可提高本地稳定。"},
  commerce:{name:"商贸经营",icon:"市",examples:"商行 · 百货 · 旅店",cost:26,revenue:10,upkeep:4,description:"收益较高；冲突和低稳定会影响客流。"},
  logistics:{name:"仓储物流",icon:"运",examples:"仓库 · 货运 · 维修",cost:22,revenue:8,upkeep:3,description:"与相邻的自家商贸产业配合，可获得供货加成。"}
};
function enterpriseGross(s,id){
  const t=s.territories[id],d=INDUSTRIES[t?.industry];if(!d||!t.enterpriseLevel||t.building>0)return 0;
  const fit=TERRITORY_DEFS[id].affinity===t.industry?1.25:1;
  const stability=.5+clamp(t.stability)/200;
  const policy=t.policy==="growth"?1.25:t.policy==="care"?.85:1;
  const linked=t.industry==="logistics"&&TERRITORY_DEFS[id].neighbors.some(n=>owns(s,n)&&s.territories[n].industry==="commerce"&&s.territories[n].enterpriseLevel>0&&!s.territories[n].building)?1.15:1;
  return Math.round(d.revenue*t.enterpriseLevel*fit*stability*policy*linked*10)/10;
}
// 以同一套月结公式计算产业贡献，包含地段、主政和年景。
function enterpriseProfit(s,id){
 const t=s.territories[id];if(!t?.industry||t.building)return 0;
 const without={...s,territories:{...s.territories,[id]:{...t,industry:null,enterpriseLevel:0}}};
 return Math.round((monthlyNet(s)-monthlyNet(without))*10)/10;
}
function enterpriseForecast(s,id,kind,level){
 // 预估的是开张以后的常态月收益：开张时新地盘的驻防期多半已过，按当下减半的收入算会把产业看得太差。
 const trial={...s,territories:{...s.territories,[id]:{...s.territories[id],industry:kind,enterpriseLevel:level,building:0,settling:0}}};
 return enterpriseProfit(trial,id);
}
function districtHonors(s){
 const earned=s.flags.districtHonors||(s.flags.districtHonors=[]),newOnes=[];
 for(const [name,d] of Object.entries(DISTRICTS))if(!earned.includes(name)&&d.territories.every(id=>owns(s,id))){
  earned.push(name);newOnes.push(name);addCash(s,8);change(s,"support",2);
  log(s,"good",`${name}全区归入和联胜，商户送来贺礼8万，民心+2。`);
 }
 return newOnes;
}
function enterpriseUpkeep(s,id){const t=s.territories[id],d=INDUSTRIES[t?.industry];return d&&t.enterpriseLevel&&!t.building?d.upkeep*t.enterpriseLevel:0}
function developEnterprise(s,id,kind){
  const t=s.territories[id],d=INDUSTRIES[kind];if(!t||t.owner!=="player"||!d||s.ap<1||t.building>0||t.enterpriseLevel>=3||t.industry&&t.industry!==kind)return false;
  const cost=d.cost*((t.enterpriseLevel||0)+1);if(s.cash<cost)return false;
  addCash(s,-cost);s.ap--;t.industry=kind;t.enterpriseLevel=(t.enterpriseLevel||0)+1;t.building=2;t.policy=t.policy||"balanced";t.invested=(t.invested||0)+cost;
  log(s,"good",`${TERRITORY_DEFS[id].name}投资${cost}万发展${d.name}，停业整备一个月。`);return true;
}
function setEnterprisePolicy(s,id,policy){const t=s.territories[id];if(!t||t.owner!=="player"||!INDUSTRIES[t.industry]||!["balanced","growth","care"].includes(policy)||t.policyMonth===s.month)return false;t.policy=policy;t.policyMonth=s.month;return true}
function enterpriseTick(s){s.businessNews=[];ownTerritories(s).forEach(id=>{const t=s.territories[id];if(t.building>0){t.building--;if(!t.building){const text=`${TERRITORY_DEFS[id].name}的${INDUSTRIES[t.industry]?.name||"产业"}${t.enterpriseLevel>1?"扩建完工":"开张了"}，声望+2。`;change(s,"rep",2);s.businessNews.push(text);log(s,"good",text)}}if(t.industry&&!t.building){t.stability=clamp(t.stability+(t.policy==="care"?4:t.policy==="growth"?-3:1));}})}
function recordEnterpriseEarnings(s){ownTerritories(s).forEach(id=>{const t=s.territories[id];if(!t.industry||t.building)return;t.earned=Math.round(((t.earned||0)+enterpriseProfit(s,id))*10)/10;if(t.invested>0&&t.earned>=t.invested&&!t.paidBack){t.paidBack=true;const text=`${TERRITORY_DEFS[id].name}的生意回本了，累计净赚${t.earned}万。`;s.businessNews.push(text);log(s,"good",text)}})}
function enterpriseSummary(s,id){const t=s.territories[id],d=INDUSTRIES[t.industry];return `<div class="enterprise-summary">${d?`<b>${d.icon} ${d.name} · ${t.enterpriseLevel}级</b><span>${t.building?`整备中 · ${t.building>1?"下月照常停业，再下月开张":"下次月结开张"}`:`每月净收益 ${enterpriseProfit(s,id)>=0?"+":""}${enterpriseProfit(s,id)}万`}</span>${t.invested?`<span>累计净收 ${t.earned||0} / 投入 ${t.invested}万${(t.earned||0)>=t.invested?" · 已回本":""}</span>`:""}`:`<b>待开发铺面</b><span>适合${INDUSTRIES[TERRITORY_DEFS[id].affinity].name} · 营收+25%</span>`}</div>`}
function manageEnterprise(id){const t=S.territories[id];if(!t||t.owner!=="player")return;const d=INDUSTRIES[t.industry];
  const choices=d?[
    ...(t.enterpriseLevel<3&&!t.building?[option(`扩建${d.name}`,`现金-${d.cost*(t.enterpriseLevel+1)}万 · 1行动点 · 停业1个月 · 完工后月净收约${enterpriseForecast(S,id,t.industry,t.enterpriseLevel+1)}万`,()=>{if(!developEnterprise(S,id,t.industry))toast("现金或行动点不足")})]:[]),
    ...Object.entries({balanced:["稳健经营","营收正常；每月稳定+1"],growth:["扩大客流","营收+25%；每月稳定-3"],care:["照顾街坊","营收-15%；每月稳定+4"]}).filter(([k])=>k!==t.policy&&t.policyMonth!==S.month).map(([k,v])=>option(v[0],v[1]+" · 本月可改一次",()=>setEnterprisePolicy(S,id,k)))
  ]:Object.entries(INDUSTRIES).map(([k,v])=>option(`开办${v.name}${TERRITORY_DEFS[id].affinity===k?" · 本地优势":""}`,`${v.examples}｜${v.cost}万 · 1行动点 · 整备1个月后开业 · 月净收约${enterpriseForecast(S,id,k,1)}万`,()=>{if(!developEnterprise(S,id,k))toast("现金或行动点不足")}));
  enqueue({title:`${TERRITORY_DEFS[id].name} · 产业经营`,body:`${enterpriseSummary(S,id)}${d?`<p>${d.examples}</p>`:""}`,options:[...choices,option("回到地图","",()=>{})]},"经营账本");
}

const PROLOGUE=[
  {kicker:"序章 · 雨夜",title:"父亲把钥匙放在了桌上",portrait:"assets/father.webp",body:["窗外的雨打在旧街祖堂的铁皮棚上。沈振海没穿那件平时见人的西装，只穿了一件灰色背心。","他把一串钥匙、一枚磨花的龙头印和一本蓝色旧账簿摆在桌上。<span class='dialogue'>“红磡、北角、长沙湾，都被他们拿走了。”</span>","你问他还剩下什么。他抬眼望向窗外的老街：<span class='dialogue'>“剩下这条街，和几个还肯来看我的人。”</span>"]},
  {kicker:"序章 · 旧部",title:"三双眼睛都在看你",portrait:"assets/zhao-kui.webp",body:["赵魁站在门边，双手抱在胸前；苏曼青翻着账簿，笔尖一直没停；程野坐在桌角，朝你点了一下头。","他们留下来的理由各不相同。赵魁等着看你敢不敢开战，苏曼青想知道你能不能把账算清，程野只说了一句：<span class='dialogue'>“你上，我就上。”</span>","沈振海咳了很久，最后看着你：<span class='dialogue'>“别问他们服不服。打一场该打的仗，他们自己会回答。”</span>"]},
  {kicker:"第一章 · 接印",title:"和联胜只剩一条街",portrait:"assets/player.webp",body:["第二天早上，祖堂门口的招牌被雨冲得发白。你把龙头印放进外套内袋，开门时，外面只站了四十来个人。","更远的地方，东潮会占着红磡的码头，万盛堂占着港岛北岸，长风社把手伸进了上水。所有人都在等和联胜自己熄灭。","你看了一眼门外的人，然后把钥匙收进掌心。从今天起，这座城市里的每一块地、每一个人，都得重新回答一个问题——谁说了算。"]}
];

const ACTIONS=[
  {id:"recruit_crew",icon:"众",name:"各处招人",desc:"从自家地盘招人，街坊地段出人最多。",effects:s=>[`人手约+${Math.round(recruitYield(s)*(hasOfficer(s,"chengye")?1.25:1))}`,"现金-5万"],max:2,canRun:s=>s.cash>=recruitCost(s,5)&&totalCrew(s)<crewCap(s),lockedText:s=>totalCrew(s)>=crewCap(s)?"人手已满":"现金不足",run:(s,rng=Math.random)=>{const mult=hasOfficer(s,"chengye")?1.25:1,gain=Math.min(Math.round(recruitYield(s)*mult*(.85+rng()*.3)),Math.max(0,crewCap(s)-totalCrew(s)));s.crew+=gain;addCash(s,-recruitCost(s,5));change(s,"morale",2);log(s,"good",`${hasOfficer(s,"chengye")?"程野":"弟兄们"}从各处地盘带回了 ${gain} 名新人。`)}},
  {id:"train",icon:"练",name:"整队合练",desc:"操练队伍，备战下场血拼。",effects:["士气↑↑","下场血拼↑"],max:2,run:s=>{change(s,"morale",9);s.training=clamp((s.training||0)+8,0,30);s.officers.filter(o=>o.side==="player"&&!o.injured).forEach(o=>{o.loyalty=clamp(o.loyalty+1);gainXP(o,1)});log(s,"good","赵魁把队伍从老街头拉到了尾。")}},
  {id:"business",icon:"账",name:"盘活地盘生意",desc:"提前收账，补充现金。",effects:["现金↑↑","压力↑"],max:1,run:s=>{const gain=Math.max(8,Math.round(monthlyGross(s)*.55));addCash(s,gain);change(s,"heat",5);log(s,"good",`账面提前回了 ${gain} 万。`)}},
  {id:"intel",icon:"眼",name:"打听敌情",desc:"查探相邻地盘的驻防与动向。",effects:["情报↑","谋略人物受益"],max:1,run:(s,rng=Math.random)=>{const n=owns(s,"clocktower")?2:1;let found=0;for(let i=0;i<n;i++){const targets=attackableTerritories(s).filter(id=>!s.intel[id]);if(!targets.length)break;const id=pick(targets,rng);s.intel[id]=true;found++;const p=postureOf(s,id);log(s,"good",`已摸清${TERRITORY_DEFS[id].name}的驻防${p?`——对方摆的是${p.name}（${p.hint}）`:"和主将"}。`)}if(!found){change(s,"heat",-4);log(s,"story","魏小楼的路子暂时没有新消息。")}}},
  {id:"visit",icon:"茶",name:"找头目谈话",desc:"摆茶谈心，化解不满。",effects:["最低忠诚↑","怨气↓"],max:1,run:s=>{const o=ownedOfficers(s).filter(x=>x.id!=="player").sort((a,b)=>a.loyalty-b.loyalty)[0];if(o){o.loyalty=clamp(o.loyalty+9);o.resentment=clamp(o.resentment-7);log(s,"story",`你和${o.name}在祖堂里谈了很久。`)}else change(s,"morale",3)}},
  {id:"tend_wounded",icon:"药",name:"安顿伤员",desc:"请郎中，发抚恤。",effects:["伤员多回一批","士气↑"],max:1,canRun:s=>s.wounded>0&&s.cash>=woundedCareCost(s),lockedText:s=>s.wounded<=0?"眼下没有伤员":"现金不足",run:s=>{const extra=Math.min(s.wounded,Math.max(PEOPLE,Math.ceil(s.wounded*.22)));addCash(s,-woundedCareCost(s));s.wounded-=extra;s.crew+=extra;change(s,"morale",3);log(s,"good",`郎中和被褥进了伤号房，${extra} 个人提前归队。`)}},
  // 自动挑最薄弱的一块地：省掉一层选地界面，而"该加固哪里"本来也只有一个正确答案。
  {id:"fortify",icon:"守",name:"加固驻防",desc:"增援驻防最薄弱的地段。",effects:["该地驻防+180","能战-120"],max:1,canRun:s=>s.crew>=12*PEOPLE&&ownTerritories(s).length>0,lockedText:s=>"能战人手不足120人",run:s=>{const id=weakestOwned(s);s.crew-=12*PEOPLE;s.territories[id].guard+=18*PEOPLE;change(s,"support",2);log(s,"good",`120 个人留在了${TERRITORY_DEFS[id].name}，驻防加厚到 ${s.territories[id].guard}。`)}},
  {id:"garrison",icon:"镇",name:"坐镇新地盘",desc:"派头目住进最乱的新地盘，压一压街面。",effects:["未稳期-2月","稳定+12"],max:1,canRun:s=>settlingTerritories(s).length>0&&ownedOfficers(s).some(o=>o.id!=="player"&&!o.injured),lockedText:s=>settlingTerritories(s).length?"没有能派去的头目":"没有未稳的地盘",run:s=>{const id=settlingTerritories(s).sort((a,b)=>s.territories[b].settling-s.territories[a].settling)[0],o=ownedOfficers(s).filter(x=>x.id!=="player"&&!x.injured).sort((a,b)=>b.stats.charm-a.stats.charm)[0];s.territories[id].settling=Math.max(0,s.territories[id].settling-(TUNE.gs??2));s.territories[id].stability=clamp(s.territories[id].stability+12);o.merit+=3;log(s,"good",`${o.name}住进了${TERRITORY_DEFS[id].name}，街面开始服气。`)}},
  {id:"laylow",icon:"静",name:"低调一个月",desc:"收敛声势，照应街坊。",effects:["压力↓↓","人心↑"],max:1,run:s=>{change(s,"heat",-13);change(s,"support",5);change(s,"morale",2);log(s,"story","这个月没有人在老街听见太大的动静。")}},
  // ---- 外交：谈判桌是第四种武器 ----
  {id:"truce",icon:"和",name:"递茶讲数",desc:"送茶递话，暂息干戈。",effects:["指定一家4个月不攻你","现金↓ 声望-2"],max:1,canRun:s=>aliveAIFactions(s).some(f=>!truceActive(s,f)&&s.cash>=truceCost(s,f)),lockedText:s=>aliveAIFactions(s).some(f=>!truceActive(s,f))?"现金不足":"没有可讲数的对象",run:s=>{
    enqueue({title:"茶要递到哪张桌上",portrait:CHARACTER_DEFS.sumanqing.portrait,body:"<p>苏曼青备好了茶礼和话。<span class='dialogue'>“讲数不丢人。丢人的是讲完了守不住。”</span>停战只管对方不动手，不管你自己动不动手——你先动，茶就白递了。</p>",options:[
      ...aliveAIFactions(s).filter(f=>!truceActive(s,f)).map(f=>{const cost=truceCost(s,f);return option(`与${FACTIONS[f].name}停战4个月`,`现金-${cost}万`,()=>{if(s.cash<cost){toast("现金不足");s.ap++;s.usedActions.truce=0;return}addCash(s,-cost);s.truces[f]=s.month+4;change(s,"rep",-2);markStyle(s,"li",1);log(s,"story",`${FACTIONS[f].name}收了茶。四个月内，他们的人不会过界。`)},s.cash<cost?"danger":"")}),
      option("再想想","不花钱，行动点退回",()=>{s.ap++;s.usedActions.truce=0})
    ]},"讲数")}},
  {id:"incite",icon:"间",name:"挑拨离间",desc:"散布消息，引两家相争。",effects:["成功则该社团3个月只咬同行","失败惹火上身"],max:1,canRun:s=>aliveAIFactions(s).length>=2&&s.cash>=10&&!(s.incited&&s.incited.until>=s.month),lockedText:s=>aliveAIFactions(s).length<2?"雾港只剩一个对手，没得挑拨":s.incited&&s.incited.until>=s.month?"上一手离间还没收场":"现金不足",run:s=>{
    const best=ownedOfficers(s).filter(o=>!o.injured).sort((a,b)=>b.stats.scheme-a.stats.scheme)[0];
    enqueue({title:"一封信，两家火",portrait:best?.portrait||CHARACTER_DEFS.sumanqing.portrait,body:`<p>${best?esc(best.name):"账房"}拟好了几封以假乱真的信。选一家，让他们相信自己真正的敌人不是你。</p><p>经手人谋略 <b>${best?best.stats.scheme:40}</b>，成事的把握约 <b>${Math.round(inciteChance(s)*100)}%</b>。</p>`,options:[
      ...aliveAIFactions(s).map(f=>option(`把火引向${FACTIONS[f].name}`,`现金-10万`,()=>{addCash(s,-10);if(chance(inciteChance(s))){s.incited={faction:f,until:s.month+3};markStyle(s,"li",1);log(s,"good",`${FACTIONS[f].name}信了。接下来三个月，他们的刀口不朝你。`)}else{change(s,"heat",6);change(s,"rep",-3);s.factions[f].ambition=(s.factions[f].ambition||0)+8;log(s,"bad",`信被识破了。${FACTIONS[f].name}把这笔账记在了和联胜头上。`)}})),
      option("再想想","不花钱，行动点退回",()=>{s.ap++;s.usedActions.incite=0})
    ]},"离间")}},
  {id:"insider",icon:"应",name:"安插内应",desc:"重金在对方地盘里买一个开门的人。",effects:["目标驻防-120","当场查明敌情"],max:1,canRun:s=>s.cash>=14&&attackableTerritories(s).length>0,lockedText:s=>attackableTerritories(s).length?"现金不足":"没有相邻的敌方地盘",run:s=>{
    enqueue({title:"哪扇门需要一个内应",portrait:CHARACTER_DEFS.weixiaolou.portrait,body:"<p>钱到位了，门就会从里面开。内应买通后，那块地的驻防会出现缺口，真实布防也会摆到你桌上。</p>",options:[
      ...attackableTerritories(s).slice().sort((a,b)=>s.territories[b].guard-s.territories[a].guard).slice(0,6).map(id=>option(`买通${TERRITORY_DEFS[id].name}的人`,"现金-14万",()=>{if(s.cash<14){toast("现金不足");s.ap++;s.usedActions.insider=0;return}addCash(s,-14);s.territories[id].guard=Math.max(12*PEOPLE,s.territories[id].guard-12*PEOPLE);s.intel[id]=true;markStyle(s,"li",2);log(s,"good",`${TERRITORY_DEFS[id].name}里有人收了钱。驻防出现缺口，布防图也送了出来。`)})),
      option("再想想","不花钱，行动点退回",()=>{s.ap++;s.usedActions.insider=0})
    ]},"内应")}},
  // ---- 破局：钱要能买到「让对面变弱」 ----
  // 封锁与策反都自动选目标：跟 fortify 同一个理由——这两件事各自只有一个正确答案，
  // 多一层选地界面只是多一次点击。封锁挑最高那堵墙，策反挑最松那扇门。
  {id:"blockade",icon:"封",name:"断其财路",desc:"封住货路，消耗对方驻防。",effects:["目标3个月不长驻防","每月驻防-100"],max:1,canRun:s=>{const id=blockadeTarget(s);return !!id&&s.cash>=blockadeCost(s,id)},lockedText:s=>blockadeTarget(s)?"现金不足":"没有可封锁的相邻地盘",run:s=>{runBlockade(s,blockadeTarget(s))}},
  {id:"turncoat",icon:"策",name:"重金策反",desc:"收买守门人，里应外合。",effects:["成功 驻防-250","失败 声望-3"],max:1,canRun:s=>{const id=turncoatTarget(s);return !!id&&s.cash>=turncoatCost(s,id)},lockedText:s=>turncoatTarget(s)?"现金不足":"没有可策反的相邻敌方地盘",run:(s,rng=Math.random)=>{runTurncoat(s,turncoatTarget(s),rng)}}
];
function aliveAIFactions(s){return AI_FACTIONS.filter(f=>!s.factions[f].defeated&&territoryCount(s,f)>0)}
function truceCost(s,f){return Math.round((10+territoryCount(s,f)*5)*(s.creed==="li"?.8:1))}
function inciteChance(s){const best=ownedOfficers(s).filter(o=>!o.injured).sort((a,b)=>b.stats.scheme-a.stats.scheme)[0];return clamp(.35+(best?best.stats.scheme:40)/200,.2,.9)}

// ---- 破局机制：围困消耗战 ----
// 后期地图会冻住不是难度问题，是缺一条「打不动那堵墙时还能推进」的通路：
// 敌方驻防上限随地盘数一路涨过玩家的攻击天花板，而失败不积累任何进展，消耗战根本不成立。
// 破口与封锁把「失败」变成「买下对面几个月的失血期」，钱从此换得到进展。
function breachActive(s,id){return Number.isFinite((s.breach||{})[id])&&s.breach[id]>=s.month}
function blockadeActive(s,id){return Number.isFinite((s.blockade||{})[id])&&s.blockade[id]>=s.month}
// 双押不叠满（14 而不是 16）：否则「封锁＋硬打」会变成后期唯一的正确解法。
function siegeDrain(s,id){const b=breachActive(s,id),k=blockadeActive(s,id);return (b&&k?14:k?10:b?6:0)*PEOPLE}
// attackableTerritories 会把中环挡在门外（要先拿满13块），但封锁与策反是「够得着就能做」的手段，
// 不该被终局门槛连坐——所以这里只看相邻，不看那道前置门。
function adjacentEnemy(s){const mine=new Set(ownTerritories(s));return Object.keys(s.territories).filter(id=>!mine.has(id)&&TERRITORY_DEFS[id].neighbors.some(n=>mine.has(n)))}
function blockadeTargets(s){return adjacentEnemy(s).filter(id=>s.territories[id].owner!=="free"&&!blockadeActive(s,id))}
function blockadeTarget(s){return blockadeTargets(s).slice().sort((a,b)=>s.territories[b].guard-s.territories[a].guard)[0]}
function blockadeCost(s,id){return id&&s.territories[id]?Math.round(20+s.territories[id].guard*.15/PEOPLE):0}
function runBlockade(s,id){if(!id||!s.territories[id])return false;const cost=blockadeCost(s,id);if(s.cash<cost)return false;addCash(s,-cost);if(!s.blockade)s.blockade={};s.blockade[id]=s.month+3;markStyle(s,"li",1);log(s,"good",`${TERRITORY_DEFS[id].name}的货路和水路都断了。三个月内，那边的人只出不进。`);return true}
function turncoatTargets(s){return adjacentEnemy(s).filter(id=>AI_FACTIONS.includes(s.territories[id].owner))}
// 策反挑最松的一扇门：-25 是定额，驻防越低越接近打穿；失序的势力更便宜，也更容易买动。
function turncoatTarget(s){return turncoatTargets(s).slice().sort((a,b)=>(factionDisorder(s,s.territories[b].owner)>0)-(factionDisorder(s,s.territories[a].owner)>0)||s.territories[a].guard-s.territories[b].guard)[0]}
function turncoatChance(s){const best=ownedOfficers(s).filter(o=>!o.injured).sort((a,b)=>b.stats.charm-a.stats.charm)[0];return clamp(.3+(best?best.stats.charm:40)/180,.25,.75)}
function turncoatCost(s,id){return Math.round(40*(id&&factionDisorder(s,s.territories[id].owner)>0?.7:1))}
function runTurncoat(s,id,rng=Math.random){const f=id&&s.territories[id]&&s.territories[id].owner;if(!AI_FACTIONS.includes(f))return null;const cost=turncoatCost(s,id);if(s.cash<cost)return null;addCash(s,-cost);const ok=chance(turncoatChance(s),rng);
  if(ok){const t=s.territories[id];t.guard=Math.max(20*PEOPLE,t.guard-25*PEOPLE);if(!s.postures)s.postures={};s.postures[id]="shaky";s.intel[id]=true;s.flags.turncoatWins=(s.flags.turncoatWins||0)+1;markStyle(s,"li",2);log(s,"good",`${TERRITORY_DEFS[id].name}的话事人收了钱。门房换了人，街面开始传闲话。`)}
  else{change(s,"rep",-3);s.factions[f].ambition=(s.factions[f].ambition||0)+4;log(s,"bad",`钱送出去了，人没买动。${FACTIONS[f].name}把这笔账记在了和联胜头上。`)}
  return{ok,cost,id}}
// 摊子大了压不住：一家吃到6块地以上，内部就开始漏。这是巨无霸身上唯一的裂缝，
// 也是「后期要面对一个巨无霸」和「面对巨无霸不是死局」之间唯一能同时成立的写法。
function factionDisorder(s,f){return AI_FACTIONS.includes(f)?Math.max(0,territoryCount(s,f)-5):0}
function disorderTick(s,rng=Math.random){const out=[];
  aliveAIFactions(s).forEach(f=>{const d=factionDisorder(s,f);if(!d)return;
    // 只烧非起家地：老巢的人心不会说散就散，抢来的街面才会。
    const ids=Object.keys(s.territories).filter(id=>s.territories[id].owner===f&&TERRITORY_DEFS[id].owner!==f);
    if(!ids.length)return;
    const id=ids.sort((a,b)=>s.territories[a].guard-s.territories[b].guard)[0],t=s.territories[id],weak=t.guard<50*PEOPLE;
    let hit=false;for(let i=0;i<d;i++)if(chance(weak?.1:.25,rng)){hit=true;break}   // 每点失序掷一次，但一家每月最多出一件事
    if(!hit)return;
    if(weak&&!TERRITORY_DEFS[id].final){t.owner="free";t.guard=30*PEOPLE;t.stability=60;t.settling=0;rerollPosture(s,id,rng);delete (s.governors||{})[id];
      out.push(`${FACTIONS[f].name}在${TERRITORY_DEFS[id].name}的堂口卷了账本走人，那条街重新变回散户地界。`);log(s,"good",`${TERRITORY_DEFS[id].name}脱离了${FACTIONS[f].name}。`)}
    else{t.guard=Math.max(20*PEOPLE,t.guard-rand(15,25,rng)*PEOPLE);if(!s.postures)s.postures={};s.postures[id]="shaky";
      out.push(`${FACTIONS[f].name}的${TERRITORY_DEFS[id].name}闹了一场，看场的人少了一半。`);log(s,"story",`${TERRITORY_DEFS[id].name}的街面乱了一阵，${FACTIONS[f].name}压得很吃力。`)}});
  return out}
// 从老街出发的跳数：决战的战利品与败仗的代价都按「最远端」算，近处的地才是根。
function distanceFrom(start){const dist={};dist[start]=0;const q=[start];while(q.length){const id=q.shift();TERRITORY_DEFS[id].neighbors.forEach(n=>{if(!(n in dist)){dist[n]=dist[id]+1;q.push(n)}})}return dist}

const COMMON_NAMES=["高子鹏","罗小武","杜庆","张海生","黄东","陈三","林家豪","周平","许朝阳","杨金生","何文辉","魏达","杨子麟","胡南","徐涛","马永昌"];
const COMMON_TYPES=["猛将","统将","军师","管事","说客","探子"];
const COMMON_TRAITS=["敢拼","稳手","快脚","会算账","善交际","记路","护短","老成"];

const RANDOM_EVENTS=[
  {id:"street_protection",title:"老街商户把门关早了",portrait:"assets/su-manqing.webp",body:"<p>连续几场血拼之后，老街上的卷帘门天还没黑就降了下来。苏曼青把一叠账单放在你面前：<span class='dialogue'>“地盘拿回来了，人不敢出门，这算谁的？”</span></p>",condition:s=>s.heat>=35,options:s=>[
    option("拿钱补贴商户","现金-12万；人心+10",()=>{addCash(s,-12);change(s,"support",10);change(s,"heat",-5);markStyle(s,"yi",2)}),
    option("先把地盘稳住","现金不变；人心-8",()=>{change(s,"support",-8);change(s,"morale",4);markStyle(s,"wei",1)},"danger")
  ]},
  {id:"old_debt",title:"旧账簿里有一页被撕过",portrait:"assets/father.webp",body:"<p>苏曼青在蓝色账簿里找到一道撕痕。纸下面只剩一句话：<span class='dialogue'>“谢家九郎，这条命是我欠的。”</span></p><p>两天后，谢九在老街口等你。</p>",condition:s=>s.wins>=2&&!s.flags.xieUnlocked&&!hasOfficer(s,"xiejiu"),options:s=>[
    option("把原话告诉他","谢九进入招募名单；义+2",()=>{s.flags.xieUnlocked=true;markStyle(s,"yi",2);log(s,"story","谢九看完那页旧账，只说了句“知道了”。")},"gold"),
    option("说父债子偿","谢九进入招募名单；威+2",()=>{s.flags.xieUnlocked=true;change(s,"rep",5);markStyle(s,"wei",2)})
  ]},
  {id:"cash_offer",title:"方景曜送来一张空白支票",portrait:"assets/fang-jingyao.webp",body:"<p>支票上没写数字。方景曜的人说，只要和联胜一年内不进北角，数字可以由你填。<span class='dialogue'>“方先生说，地盘是面子，现金才是里子。”</span></p>",condition:s=>!s.flags.cashOffer&&s.month>=8&&TERRITORY_DEFS.new_city&&s.territories.new_city.owner==="wan",options:s=>[
    option("把支票送回去","声望+8；万盛堂驻防上升",()=>{s.flags.cashOffer=true;change(s,"rep",8);s.territories.new_city.guard+=8*PEOPLE;markStyle(s,"wei",2)}),
    option("填下30万","现金+30万；12个月内攻击北角会掉忠诚",()=>{s.flags.cashOffer=true;s.flags.cashDealUntil=s.month+12;addCash(s,30);markStyle(s,"li",3)},"gold")
  ]},
  {id:"captain_seat",title:"程野问了一句“我坐哪儿”",portrait:"assets/cheng-ye.webp",body:"<p>祖堂里添了两把椅子，都是新收编的头目坐的。程野拍了拍其中一把，笑着问：<span class='dialogue'>“这儿越来越热闹了。那我以后坐哪儿？”</span></p>",condition:s=>officer(s,"chengye")&&officer(s,"chengye").merit>=18&&!s.flags.chengSeat,options:s=>[
    option("让他管所有新人","程野忠诚+12；普通人才成本-10%",()=>{s.flags.chengSeat=true;s.flags.chengRecruitChief=true;loyalty(s,"chengye",12);markStyle(s,"yi",2)}),
    option("“椅子靠自己拿”","声望+5；程野怨气+15",()=>{s.flags.chengSeat=true;change(s,"rep",5);resent(s,"chengye",15);markStyle(s,"wei",2)},"danger")
  ]},
  {id:"zhao_no_war",title:"赵魁把出战名单撕了",portrait:"assets/zhao-kui.webp",body:"<p>你连续几个月没动。赵魁把出战名单放在桌上，然后当着你的面撕成了四片：<span class='dialogue'>“人都招回来了，是留着吃饭的？”</span></p>",condition:s=>s.month>=6&&s.month-(s.lastBattleMonth||0)>=5&&!s.flags.zhaoNoWar,options:s=>[
    option("答应下月之前开战","士气+8；若3个月不开战则反噬",()=>{s.flags.zhaoNoWar=true;s.flags.warPromise=s.month+3;change(s,"morale",8);loyalty(s,"zhaokui",4)}),
    option("让他学会等","赵魁忠诚-10；现金+8万",()=>{s.flags.zhaoNoWar=true;loyalty(s,"zhaokui",-10);resent(s,"zhaokui",10);addCash(s,8);markStyle(s,"li",2)},"danger")
  ]},
  {id:"wounded_families",title:"伤者家属在祖堂外等你",portrait:"assets/player.webp",body:"<p>那场仗打完后，祖堂外多了三把伞。没有人闹，他们只想知道，那些躺在诊所里的人以后怎么办。</p>",condition:s=>s.casualties>=18*PEOPLE&&!s.flags.familyPaid,options:s=>[
    option("按最好的标准安顿","现金-18万；士气+12；义+3",()=>{s.flags.familyPaid=true;addCash(s,-18);change(s,"morale",12);change(s,"support",8);markStyle(s,"yi",3)}),
    option("按老规矩给钱","现金-7万；士气-3",()=>{s.flags.familyPaid=true;addCash(s,-7);change(s,"morale",-3);markStyle(s,"li",1)})
  ]},

  // ---- 事件链起点：今天的选择，几个月后回来敲门 ----
  {id:"smuggler_ship",title:"一条没挂旗的货船想靠老街码头",portrait:"assets/ye-rong.webp",body:"<p>船老大只肯半夜谈。货不问来路，钱当场结清，他只要一个能安静卸货的泊位。</p>",condition:s=>s.month>=5,options:s=>[
    option("让它靠岸","现金+20万；压力+8；这事没完",()=>{addCash(s,20);change(s,"heat",8);markStyle(s,"li",2);scheduleIn(s,3,"customs_probe");log(s,"warn","货连夜卸完了。码头上没人提这条船，提的人都收了钱。")},"gold"),
    option("让它去别家碰运气","声望+4；义+1",()=>{change(s,"rep",4);markStyle(s,"yi",1);log(s,"story","船在雾里掉了头。你不知道它最后靠了谁的岸。")})
  ]},
  {id:"reporter_visit",title:"一个记者在老街转了三天",portrait:"assets/wei-xiaolou.webp",body:"<p>她在茶楼、诊所和码头都问了同样的问题：雾港的地盘换招牌，普通人的日子有没有变好。程野问你要不要管。</p>",condition:s=>s.month>=10,options:s=>[
    option("让她看她想看的","两个月后见报；人心是什么样就写什么样",()=>{scheduleIn(s,2,s.support>=55?"reporter_story_good":"reporter_story_mixed");markStyle(s,"yi",1);log(s,"story","你让人给她带了句话：随便看，别编。")}),
    option("请她喝茶，递个信封","现金-10万；报道不会出现",()=>{addCash(s,-10);markStyle(s,"li",2);log(s,"story","信封留在了茶桌上。第二天她退了房。")}),
    option("吓走她","威+2；两个月后有篇不好看的报道",()=>{markStyle(s,"wei",2);scheduleIn(s,2,"reporter_story_bad");log(s,"warn","她走得很急，笔记本落在了旅馆。")},"danger")
  ]},
  {id:"father_old_friend",title:"一个老人说认识你父亲",portrait:"assets/father.webp",body:"<p>他袖口磨得发亮，说三十年前和沈振海一起扛过包。现在他儿子病了，走投无路才敢来敲祖堂的门。苏曼青翻遍旧账簿，没找到这个名字。</p>",condition:s=>s.month>=8,options:s=>[
    option("按父亲的规矩接济","现金-8万；义+2；这份情会回来",()=>{addCash(s,-8);markStyle(s,"yi",2);scheduleIn(s,4,"old_friend_repay");log(s,"story","老人走时没说谢。他只是在祖堂门口站了很久。")}),
    option("账上没有就是没有","现金不动；人心-3",()=>{change(s,"support",-3);markStyle(s,"li",1);log(s,"story","老人点点头走了，像是早料到这个答案。")})
  ]},
  {id:"aqi_solo",title:"阿七说想自己办一件事",portrait:"assets/ah-qi.webp",body:"<p>他没说是什么事，只说“办不成我自己担”。程野在旁边没吭声——当年他也是这么开口的。</p>",condition:s=>hasOfficer(s,"aqi")&&(officer(s,"aqi").merit||0)>=8,options:s=>[
    option("放手让他去","两个月后见分晓",()=>{scheduleIn(s,2,"aqi_result");log(s,"story","阿七揣着你给的名单出了门，背影比来时直了一些。")},"gold"),
    option("再压一压","阿七怨气+8；忠诚-4",()=>{resent(s,"aqi",8);loyalty(s,"aqi",-4);log(s,"story","阿七应了一声，把话咽了回去。")})
  ]},

  // ---- 头目与人心 ----
  {id:"officer_gamble",title:"有个头目在赌档欠了钱",portrait:"assets/zhao-kui.webp",body:"<p>数目不小，而且欠的是万盛堂场子的钱。对方放话：钱可以慢慢还，用和联胜的消息抵也行。</p>",condition:s=>ownedOfficers(s).length>=5&&s.month>=7,options:s=>[
    option("替他还清，关起门来算","现金-12万；全员忠诚+3",()=>{addCash(s,-12);ownedOfficers(s).forEach(o=>o.loyalty=clamp(o.loyalty+3));markStyle(s,"yi",2);log(s,"good","赌债当天结清。祖堂里那顿骂，只有你们两个人听见。")}),
    option("让他自己想办法","士气-5；此人可能被策反",()=>{change(s,"morale",-5);const o=ownedOfficers(s).filter(x=>!x.named)[0];if(o){o.loyalty=clamp(o.loyalty-15);o.resentment=clamp(o.resentment+12)}markStyle(s,"wei",1);log(s,"warn","没人再提这笔债。但赌档的人开始跟他喝茶了。")},"danger")
  ]},
  {id:"officers_feud",title:"两个堂口在酒桌上动了手",portrait:"assets/cheng-ye.webp",body:"<p>起因小得可笑：一个位子，一句旧事。但桌子掀了，人也见了血。两边都在等你说话。</p>",condition:s=>ownedOfficers(s).length>=6&&s.month>=12,options:s=>[
    option("各打五十大板","士气-3；不再恶化",()=>{change(s,"morale",-3);log(s,"story","两边各罚三个月分红。酒桌上的事，到酒桌为止。")}),
    option("彻查是谁先动的手","谋略高则揪出挑事者，忠诚整体+4",()=>{const best=ownedOfficers(s).sort((a,b)=>b.stats.scheme-a.stats.scheme)[0];if(best&&best.stats.scheme>=75){ownedOfficers(s).forEach(o=>o.loyalty=clamp(o.loyalty+4));log(s,"good",`${best.name}把那晚每一杯酒都查了一遍。挑事的人自己站了出来。`)}else{change(s,"morale",-5);log(s,"bad","查了半个月没查出结果，两边的心结反而更深了。")}})
  ]},
  {id:"clinic_price",title:"诊所说药钱要涨了",portrait:"assets/su-manqing.webp",body:"<p>不是郎中黑心——是最近全雾港都在打，药材过港的价钱翻了一倍。伤号房里还躺着人。</p>",condition:s=>s.wounded>=6*PEOPLE,options:s=>[
    option("照涨价付","现金-10万；伤员多回一批",()=>{addCash(s,-10);const extra=Math.min(s.wounded,3*PEOPLE);s.wounded-=extra;s.crew+=extra;change(s,"morale",3);log(s,"good","药没断。伤号房里咳嗽声轻了些。")}),
    option("找叶蓉那样的人想办法","有商路人物则免费解决，否则伤员回得更慢",()=>{if(hasOfficer(s,"yerong")){log(s,"good","叶蓉从相熟的货船上匀出了一批药材，一分冤枉钱没花。")}else{change(s,"morale",-4);log(s,"bad","没有门路，只能省着用药。伤号房的灯亮到很晚。")}})
  ]},
  {id:"arms_dealer",title:"黑市贩子带来一批“硬家伙”",portrait:"assets/xie-jiu.webp",body:"<p>成色不错，价也公道。唯一的问题是：这种东西一旦上了街，就再也收不回来了。</p>",condition:s=>s.month>=15&&s.cash>=20,options:s=>[
    option("买下","现金-20万；下三场血拼威力+8%",()=>{addCash(s,-20);s.flags.armsBoost=3;change(s,"heat",6);markStyle(s,"wei",2);log(s,"warn","货进了祖堂后院。赵魁验完货，半天没说话。")},"gold"),
    option("不碰这条线","压力-4；义+1",()=>{change(s,"heat",-4);markStyle(s,"yi",1);log(s,"story","贩子耸耸肩走了。雾港永远不缺买家。")})
  ]},
  {id:"defector_offer",title:"对面有人想“换个东家”",portrait:"assets/wei-xiaolou.webp",body:"<p>递话的人说，他在那边不受重用，愿意带着地盘布防图过来。也可能，这是一步安排好的棋。</p>",condition:s=>s.month>=10&&aliveAIFactions(s).length>=1,options:s=>[
    option("收下他","得一名人才与一份情报；小概率是死间",()=>{if(chance(.75)){const c=makeCommonCandidate(s,9);c.side="player";c.loyalty=58;s.officers.push(c);const ids=attackableTerritories(s);if(ids.length)s.intel[pick(ids)]=true;log(s,"good",`${c.name}深夜进了祖堂，带来一张手画的布防图。`)}else{change(s,"morale",-6);change(s,"heat",5);const took=drainCrew(s,5*PEOPLE);s.casualties+=took;log(s,"bad",`是个死间。等发现的时候，${took}个人已经折了进去。`)}},"gold"),
    option("原路送回去","声望+3；威+1",()=>{change(s,"rep",3);markStyle(s,"wei",1);log(s,"story","你让人把他送回了他来的地方。这本身就是一句话。")})
  ]},
  {id:"festival",title:"老街的龙船节到了",portrait:"assets/ah-qi.webp",body:"<p>往年这个节，沈振海会包下整条街的流水席。今年街坊都在看：新话事人还办不办。</p>",condition:s=>s.month>=6&&s.month%12>=5&&s.month%12<=7&&!s.flags.festivalDone,options:s=>[
    option("照老规矩办","现金-10万；人心+12；压力-5",()=>{s.flags.festivalDone=true;addCash(s,-10);change(s,"support",12);change(s,"heat",-5);markStyle(s,"yi",2);log(s,"good","流水席摆了四十桌。那天老街的卷帘门开到了半夜。")}),
    option("今年从简","现金-3万；人心+3",()=>{s.flags.festivalDone=true;addCash(s,-3);change(s,"support",3);log(s,"story","席面小了，但香还是上了。街坊心里有数。")})
  ]},
  {id:"typhoon",title:"台风“白鹿”正面过港",portrait:"assets/su-manqing.webp",body:"<p>码头封了，船厂停了，老街的雨棚被掀了一半。全雾港都在等风停——包括你的对手。</p>",condition:s=>s.month>=9&&s.month%12>=8&&s.month%12<=9,options:s=>[
    option("组织人手救灾","人手暂时占用；人心+10",()=>{change(s,"support",10);change(s,"morale",5);markStyle(s,"yi",2);log(s,"good","和联胜的人在雨里搬了两天沙袋。这种事，街坊记得比谁都牢。")}),
    option("趁乱清点自家","现金+6万；本月敌方不会反扑",()=>{addCash(s,6);aliveAIFactions(s).forEach(f=>s.factions[f].ambition=Math.max(0,(s.factions[f].ambition||0)-5));markStyle(s,"li",1);log(s,"story","风雨里没人打仗。你把仓库和账目理了一遍。")})
  ]},
  {id:"protection_plea",title:"长沙湾批发市场的摊主们凑了笔钱",portrait:"assets/ye-rong.webp",body:"<p>他们被长风社的人收了两道费，听说和联胜的地界只收一道，托人来问：能不能罩他们。</p>",condition:s=>!owns(s,"cheungsha")&&s.territories.cheungsha&&s.territories.cheungsha.owner==="long",options:s=>[
    option("收下这笔钱，应下这件事","现金+8万；长风社警觉",()=>{addCash(s,8);s.factions.long.ambition=(s.factions.long.ambition||0)+6;s.intel.cheungsha=true;log(s,"warn","钱收了，人也应了。长沙湾的布防图跟着钱一起到的。")},"gold"),
    option("暂时不伸这只手","不结新怨",()=>{log(s,"story","你让摊主们再等等。有些手一旦伸出去，就收不回来了。")})
  ]},
  {id:"loan_shark",title:"有人想借和联胜的名头放贷",portrait:"assets/fang-jingyao.webp",body:"<p>条子都拟好了：他出钱，你出名，利钱三七开。这生意万盛堂做了很多年，很赚，也很脏。</p>",condition:s=>s.creed==="li"&&s.month>=10,options:s=>[
    option("做","每月现金+4万；人心慢慢流失",()=>{s.flags.loanBusiness=true;markStyle(s,"li",3);log(s,"warn","条子签了。从此老街有人见了和联胜的人会绕路。")},"gold"),
    option("这钱不赚","声望+5；义+2",()=>{change(s,"rep",5);markStyle(s,"yi",2);log(s,"story","你把条子推了回去：“利钱再高，也高不过老街这块招牌。”")})
  ]},
  {id:"street_challenge",title:"有人在老街口摆了三张桌子",portrait:"assets/han-biao.webp",body:"<p>茶三杯，凳一条——老规矩，这是公开叫阵。来人自称替万盛堂韩彪递话：和联胜的新话事人，敢不敢应？</p>",condition:s=>s.creed==="wei"&&s.month>=8&&!s.factions.wan.defeated,options:s=>[
    option("亲自去应","声望赌局：赢大输也大",()=>{if(chance(.5+s.rep/200)){change(s,"rep",10);change(s,"morale",8);markStyle(s,"wei",3);log(s,"good","三杯茶你一口没碰，桌子翻了一张，人是站着走回来的。")}else{change(s,"rep",-6);change(s,"morale",-6);const p=officer(s,"player");p.injured=Math.max(p.injured,1);log(s,"bad","那一趟你是被程野扶回来的。老街安静了三天。")}},"danger"),
    option("让赵魁去","赵魁的场子赵魁收",()=>{const zk=officer(s,"zhaokui");if(zk&&zk.side==="player"&&!zk.injured){zk.merit+=6;change(s,"rep",4);log(s,"good","赵魁把三张桌子都坐了一遍，一句话没说就回来了。")}else{change(s,"rep",-4);log(s,"bad","战堂没人能去应场。桌子在老街口摆了整整一天。")}})
  ]},
  {id:"yi_test",title:"老兄弟破了自己人的规矩",portrait:"assets/zhao-kui.webp",body:"<p>动手打劫的是跟了沈振海十五年的老人，被打的是刚入伙三个月的新人。按堂规，谁破规矩谁走人——但他是老人。</p>",condition:s=>s.creed==="yi"&&s.month>=9,options:s=>[
    option("规矩就是规矩","老兄弟离开；全员忠诚+5",()=>{const took=drainCrew(s,4*PEOPLE);ownedOfficers(s).forEach(o=>o.loyalty=clamp(o.loyalty+5));change(s,"rep",4);markStyle(s,"yi",3);log(s,"good",`老人带着${took}个跟班走了。祖堂里剩下的人，眼神都不一样了。`)}),
    option("看在旧情上按下","士气-4；新人寒心",()=>{change(s,"morale",-4);change(s,"support",-4);log(s,"warn","事情压下去了。但每个新人都记住了：这里的规矩分人。")},"danger")
  ]},
  {id:"informant_price",title:"魏小楼开出了一个价",portrait:"assets/wei-xiaolou.webp",body:"<p>长风社的情报头子亲自递话：三份布防图，只卖一次，价钱不还。他没说的是——他也会把你的东西卖给别人。</p>",condition:s=>s.month>=13&&!s.factions.long.defeated&&s.cash>=18,options:s=>[
    option("买","现金-18万；查明三块敌方地盘",()=>{addCash(s,-18);attackableTerritories(s).slice(0,3).forEach(id=>s.intel[id]=true);markStyle(s,"li",1);log(s,"good","三卷图纸当夜送到。魏小楼的规矩：钱货两讫，概不负责。")},"gold"),
    option("不跟卖主做买卖","压力-3",()=>{change(s,"heat",-3);log(s,"story","你让人回了句：“替我谢谢魏先生，和联胜的门他随时能进——空着手进。”")})
  ]},

  // ---- 三家的政治：结盟、密会与背刺 ----
  {id:"teahouse_meeting",title:"两家龙头在茶楼包了同一个厢",portrait:"assets/gu-changfeng.webp",body:"<p>线人看见两家的车停在同一家茶楼后巷。谈什么不知道，但两家坐一桌，桌上多半有第三家的名字。</p>",condition:s=>s.month>=8&&aliveAIFactions(s).length>=2,options:s=>{
    const alive=aliveAIFactions(s),third=alive[2],best=ownedOfficers(s).filter(o=>!o.injured).sort((a,b)=>b.stats.scheme-a.stats.scheme)[0];
    const out=[
      option("搅了这个局","谋略够高则两家互相起疑",()=>{if(best&&best.stats.scheme>=75){alive.slice(0,2).forEach(f=>s.factions[f].ambition=Math.max(0,(s.factions[f].ambition||0)-8));log(s,"good",`${best.name}让茶楼里多传出去几句“原话”。那一桌不欢而散。`)}else{change(s,"heat",5);log(s,"bad","插进去的人手太糙，反而让两家确认了共同的麻烦是谁。")}}),
      option("坐山观虎斗","不动，看他们谈成什么",()=>{markStyle(s,"wei",1);log(s,"story","你让人守着茶楼后巷，只记车牌，不进门。")})
    ];
    if(third)out.push(option(`把消息卖给${FACTIONS[third].name}`,"现金+8万；那一家警觉大增",()=>{addCash(s,8);s.factions[third].ambition=(s.factions[third].ambition||0)+6;markStyle(s,"li",2);log(s,"warn",`${FACTIONS[third].name}连夜给了钱。雾港的消息，从来比货值钱。`)},"gold"));
    return out}},
  {id:"big_brother",title:"雾港出现了一家独大的苗头",portrait:"assets/fang-jingyao.webp",body:"<p>有一家的地盘已经连成了片。苏曼青把地图推过来：<span class='dialogue'>“再让它吞两块，剩下的所有人加起来都未必打得动它。”</span></p>",condition:s=>AI_FACTIONS.some(f=>territoryCount(s,f)>=5),options:s=>{
    const big=AI_FACTIONS.filter(f=>territoryCount(s,f)>=5).sort((a,b)=>territoryCount(s,b)-territoryCount(s,a))[0],others=aliveAIFactions(s).filter(f=>f!==big);
    return[
      option("递话给另外两家：会猎","弱势两家的矛头转向巨头；声望+3",()=>{others.forEach(f=>s.factions[f].ambition=(s.factions[f].ambition||0)+8);change(s,"rep",3);markStyle(s,"yi",1);log(s,"story",`几张字条送了出去。想活下去的人，自己会明白该咬谁。`)}),
      option(`与${FACTIONS[big]?.name||"巨头"}虚与委蛇`,"免费换2个月停战；声望-2",()=>{if(big)s.truces[big]=s.month+2;change(s,"rep",-2);markStyle(s,"li",1);log(s,"warn","你亲自去敬了一杯茶。杯子放下的位置，双方都看得懂。")},"gold")
    ]}},
  {id:"betrayal_rumor",title:"魏小楼捎话：那边起疑了",portrait:"assets/wei-xiaolou.webp",body:"<p>你挑起来的那把火烧得不错——但对方的军师开始追查信的来路了。<span class='dialogue'>“加钱，火接着烧。收手，趁现在还来得及。”</span></p>",condition:s=>s.incited&&s.incited.until>=s.month,options:s=>[
    option("加钱续火","现金-8万；离间延长2个月",()=>{addCash(s,-8);if(s.incited)s.incited.until+=2;markStyle(s,"li",2);log(s,"warn","又一笔钱进了雾港的邮路。火继续烧。")},"gold"),
    option("见好就收","离间提前结束；压力-3",()=>{s.incited=null;change(s,"heat",-3);log(s,"story","线头当夜全部剪断。没人能证明那些信从老街寄出。")})
  ]},

  // ---- 散户地界的小事件线 ----
  {id:"free_delegates",title:"散户们推了个代表来喝茶",portrait:"assets/ye-rong.webp",body:"<p>钟楼、西贡和长洲的摊主们凑在一起，托一位老茶商来问：如果有一天和联胜的招牌挂过来，规矩会是什么样的。</p>",condition:s=>s.month>=3&&Object.keys(s.territories).some(id=>s.territories[id].owner==="free"),options:s=>[
    option("“费只收一道，事帮着办”","此后拿下散户地：稳定+12、人心+3",()=>{s.flags.freeGentle=true;markStyle(s,"yi",2);log(s,"good","老茶商把话带了回去。三块地界的门槛，从此对和联胜低了一寸。")},"gold"),
    option("“按江湖规矩来”","不承诺；威+1",()=>{markStyle(s,"wei",1);log(s,"story","老茶商点点头走了。江湖规矩他懂，所以他才来问。")}),
    option("先收一笔“见面礼”","现金+6万；人心-4",()=>{addCash(s,6);change(s,"support",-4);markStyle(s,"li",2);log(s,"warn","礼收下了。茶没喝完，人就走了。")})
  ]},
  {id:"whitesand_boss",title:"长洲的渔霸不认新招牌",portrait:"assets/han-biao.webp",body:"<p>老宋在长洲说了十五年算。他没闹，只是照旧收他那份钱，就当你的招牌不存在。</p>",condition:s=>owns(s,"whitesand"),options:s=>[
    option("请他入伙","现金-8万；人手+80",()=>{addCash(s,-8);s.crew+=Math.min(8*PEOPLE,Math.max(0,crewCap(s)-totalCrew(s)));log(s,"good","老宋把船队的兄弟都带了过来。长洲的钱，从此只过一道手。")},"gold"),
    option("请他离开","人手-30；该地驻防+80；人心-3",()=>{drainCrew(s,3*PEOPLE);s.territories.whitesand.guard+=8*PEOPLE;change(s,"support",-3);markStyle(s,"wei",2);log(s,"warn","老宋走的那天，码头没人说话。但也没人再收两道钱。")},"danger")
  ]},
  {id:"clocktower_bell",title:"钟楼的钟停了三十年",portrait:"assets/ah-qi.webp",body:"<p>老街坊说，钟响的年代，这一带没人敢乱来。修钟的师傅还在，要的钱不多，要的是有人拍板。</p>",condition:s=>owns(s,"clocktower"),options:s=>[
    option("修","现金-6万；人心+8；三个月后钟会响",()=>{addCash(s,-6);change(s,"support",8);scheduleIn(s,3,"bell_rings");markStyle(s,"yi",2);log(s,"good","脚手架搭上钟楼那天，围观的人比赶集还多。")},"gold"),
    option("拆了卖铜","现金+8万；人心-6",()=>{addCash(s,8);change(s,"support",-6);markStyle(s,"li",2);log(s,"warn","铜是好铜，价是好价。只是从此老人们路过钟楼都不抬头了。")},"danger")
  ]},
  {id:"fogvillage_shrine",title:"西贡的祠堂漏雨了",portrait:"assets/father.webp",body:"<p>村里供的是几代跑船人的牌位，你父亲年轻时也在里面上过香。村长的意思：修不修，都请新话事人来看一眼。</p>",condition:s=>owns(s,"fogvillage"),options:s=>[
    option("出钱重修","现金-5万；旧部忠诚+4",()=>{addCash(s,-5);["zhaokui","sumanqing","chengye"].forEach(id=>loyalty(s,id,4));markStyle(s,"yi",2);log(s,"good","上梁那天你去了。有人看见你在一块旧牌位前站了很久。")}),
    option("改成货仓","西贡收入提升；义气受损",()=>{const t=s.territories.fogvillage;t.level=Math.min(3,(t.level||1)+1);["zhaokui","chengye"].forEach(id=>resent(s,id,4));markStyle(s,"li",2);log(s,"warn","牌位迁去了偏殿。货进来的那天，村里的香火淡了一半。")},"danger")
  ]}
];

// ---- 事件链后续：由 s.schedule 定时触发 ----
function scheduleIn(s,months,key){if(!Array.isArray(s.schedule))s.schedule=[];s.schedule.push({month:s.month+months,key})}
const CHAIN_STEPS={
  customs_probe:s=>({title:"海关的人查到了那晚的泊位",portrait:"assets/su-manqing.webp",body:"<p>那条没挂旗的船在外海被扣了。船老大没扛住，交代了卸货的码头。现在有人拿着记录来谈“处理办法”。</p>",options:[
    option("花钱销记录","现金-15万；压力-5",()=>{addCash(s,-15);change(s,"heat",-5);log(s,"warn","记录消失了。经手的每个人都拿到了自己那份。")}),
    option("咬死不认","压力+12；声望+3",()=>{change(s,"heat",12);change(s,"rep",3);markStyle(s,"wei",1);log(s,"bad","案子挂着结不了。码头往后每条船都会被多查一遍。")},"danger")
  ]}),
  reporter_story_good:s=>({title:"报道登出来了：《老街的灯》",portrait:"assets/ah-qi.webp",body:"<p>整版。写了流水席，写了诊所，写了半夜还亮着灯的祖堂。没提一个字的打打杀杀。</p>",options:[
    option("收下这份人情","压力-12；人心+8",()=>{change(s,"heat",-12);change(s,"support",8);log(s,"good","那期报纸在老街卖脱销了。剪报被人贴在了茶楼墙上。")},"gold")
  ]}),
  reporter_story_mixed:s=>({title:"报道登出来了，好坏参半",portrait:"assets/wei-xiaolou.webp",body:"<p>她写了老街的规矩，也写了诊所里的伤员和关得越来越早的卷帘门。都是实话，这才最难办。</p>",options:[
    option("实话就让它是实话","压力-4；人心-3",()=>{change(s,"heat",-4);change(s,"support",-3);log(s,"story","没人去找报社麻烦。这大概是报道里没写到的那部分和联胜。")})
  ]}),
  reporter_story_bad:s=>({title:"报道登出来了：《雾港的新阎王》",portrait:"assets/wei-xiaolou.webp",body:"<p>她把落下的笔记本里的东西全写了出来，还配了茶楼的照片。三家对手都在转发这篇报道。</p>",options:[
    option("硬着头皮受着","人心-10；压力+6",()=>{change(s,"support",-10);change(s,"heat",6);log(s,"bad","老街的墙上被人贴了报纸。撕了一层，又有一层。")},"danger")
  ]}),
  old_friend_repay:s=>({title:"老人的儿子病好了，带着人来谢",portrait:"assets/father.webp",body:"<p>他身后站着十来个码头上的壮小伙，都是他叫来的。<span class='dialogue'>“我爸说，沈家的账，我们这辈接着认。”</span></p>",options:[
    option("收下这份心意","人手+100；人心+6",()=>{s.crew+=Math.min(10*PEOPLE,Math.max(0,crewCap(s)-totalCrew(s)));change(s,"support",6);markStyle(s,"yi",1);log(s,"good","十个新人当天进了名册。老账簿上没有的名字，记在了新账簿上。")},"gold")
  ]}),
  bell_rings:s=>owns(s,"clocktower")?{title:"三十年后，钟又响了",portrait:"assets/ah-qi.webp",body:"<p>正午十二点，钟声压过了整条老街的嘈杂。摊主们停下手里的活，有人笑，有人抹眼睛。阿七说：<span class='dialogue'>“原来这就是他们说的、有人管事的声音。”</span></p>",options:[
    option("让它以后每天都响","人心+4；压力-4",()=>{change(s,"support",4);change(s,"heat",-4);log(s,"good","钟声成了老街的报时。它响一天，就等于告诉全雾港：这里有人当家。")},"gold")
  ]}:null,
  aqi_result:s=>{const a=officer(s,"aqi");if(!a||a.side!=="player")return null;const ok=(a.stats.scheme+a.stats.charm)/2>=55;return{title:ok?"阿七把事办成了":"阿七把事办砸了",portrait:"assets/ah-qi.webp",body:ok?"<p>他不但办成了，还顺手带回一条你没交代的线报。程野看完汇报，半天说了一句：“比我当年强。”</p>":"<p>他低着头站在祖堂中间，把经过一五一十讲完，没替自己辩一个字。<span class='dialogue'>“损失我认。要罚，我领。”</span></p>",options:ok?[
    option("当众记他一功","阿七忠诚+10、功劳+8；全维成长",()=>{a.loyalty=clamp(a.loyalty+10);a.merit+=8;Object.keys(a.stats).forEach(k=>a.stats[k]=clamp(a.stats[k]+2,1,99));log(s,"good","祖堂里第一次为阿七摆了一杯茶。")},"gold")
  ]:[
    option("“输得起，就还能赢”","阿七忠诚+8；经验+10",()=>{a.loyalty=clamp(a.loyalty+8);gainXP(a,10);markStyle(s,"yi",1);log(s,"story","阿七抬起头的时候，眼睛是红的。但腰是直的。")}),
    option("罚他三个月分红","威+1；阿七怨气+6",()=>{resent(s,"aqi",6);markStyle(s,"wei",1);log(s,"story","罚单贴在了祖堂墙上。阿七看了很久。")})
  ]}}
};
function pumpSchedule(s){
  if(s.ended||!Array.isArray(s.schedule)||!s.schedule.length)return;
  const due=s.schedule.filter(x=>x.month<=s.month);
  s.schedule=s.schedule.filter(x=>x.month>s.month);
  due.forEach(x=>{const build=CHAIN_STEPS[x.key];const d=build&&build(s);if(d)enqueue(d,"旧事回响")});
}

function clamp(n,min=0,max=100){return Math.max(min,Math.min(max,n))}
function rand(min,max,rng=Math.random){return Math.floor(rng()*(max-min+1))+min}
function pick(arr,rng=Math.random){return arr[Math.floor(rng()*arr.length)]}
function chance(p,rng=Math.random){return rng()<p}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
// 立绘一律以 assets/ 下的短路径在状态和存档里流转，只在真正写进 src 时才解析。
// 单文件版由 build_single.py 注入 ASSETS 查找表；模块化版本没有它，原样返回路径即可。
// 别把解析结果存回 officer.portrait —— cloneOfficer 会把它复制进存档，单条存档会涨到 1MB 以上。
function assetUrl(p){return typeof ASSETS!=="undefined"&&ASSETS[p]||p}
function change(obj,key,n){obj[key]=clamp((obj[key]??0)+n);return obj[key]}
function addCash(s,n){s.cash=Math.round((s.cash+n)*10)/10;return s.cash}
function option(text,effect,apply,tone=""){return{text,effect,apply,tone}}
function diff(s){return DIFFICULTIES[s.difficulty]||DIFFICULTIES.standard}
function markStyle(s,key,n=1){s.style[key]=(s.style[key]||0)+n}
function owns(s,id){return s.territories[id]&&s.territories[id].owner==="player"}
function ownTerritories(s){return Object.keys(s.territories).filter(id=>owns(s,id))}
function territoryCount(s,owner="player"){return Object.values(s.territories).filter(t=>t.owner===owner).length}
function officer(s,id){return s.officers.find(o=>o.id===id)}
function hasOfficer(s,id){const o=officer(s,id);return !!(o&&o.side==="player")}
function ownedOfficers(s){return s.officers.filter(o=>o.side==="player")}
function loyalty(s,id,n){const o=officer(s,id);if(o)o.loyalty=clamp(o.loyalty+n)}
function resent(s,id,n){const o=officer(s,id);if(o)o.resentment=clamp(o.resentment+n)}
function log(s,kind,text){s.log.unshift({month:s.month,kind,text,id:`log_${Date.now()}_${Math.random()}`});s.log=s.log.slice(0,100)}

function cloneOfficer(id,side,loyal=60){const d=CHARACTER_DEFS[id];return{id,name:d.name,side,role:d.role,type:d.type,portrait:d.portrait,stats:{...d.stats},trait:d.trait,traitText:d.traitText,loyalty:loyal,resentment:0,merit:0,injured:0,lv:1,xp:0,battles:0,wins:0,named:true}}

function createInitialState(name="沈川",creed="yi",difficulty="standard",mutators=null){
  const officers=[cloneOfficer("player","player",100),cloneOfficer("zhaokui","player",64),cloneOfficer("sumanqing","player",72),cloneOfficer("chengye","player",78),cloneOfficer("hewanshan","east",100),cloneOfficer("tangji","east",82),cloneOfficer("fangjingyao","wan",100),cloneOfficer("hanbiao","wan",79),cloneOfficer("guchangfeng","long",100),cloneOfficer("weixiaolou","long",76)];
  officers[0].name=(name||"沈川").trim().slice(0,8)||"沈川";
  if(creed==="yi"){officers.slice(1,4).forEach(o=>o.loyalty+=5)}
  const territories={};Object.entries(TERRITORY_DEFS).forEach(([id,t])=>territories[id]={owner:t.owner,guard:t.guard,level:1,stability:t.owner==="player"?72:82,settling:0,industry:"",enterpriseLevel:0,building:0,policy:"balanced"});
  const s={version:VERSION,runId:`fog_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,name:officers[0].name,creed:CREEDS[creed]?creed:"yi",difficulty:DIFFICULTIES[difficulty]?difficulty:"standard",month:0,ap:3,tab:"hall",cash:36,crew:42*PEOPLE,peopleScale:PEOPLE,hqBoost:true,regroup:0,wounded:0,morale:62,rep:18,support:55,heat:8,training:0,insolvencyMonths:0,style:{yi:creed==="yi"?2:0,wei:creed==="wei"?2:0,li:creed==="li"?2:0},territories,officers,intel:{old_street:true},recruitMarket:[],usedActions:{},log:[],flags:{fatherRetired:false,aqiUnlocked:false,xieUnlocked:false,yeUnlocked:false,coalition:false,debtCrisisQueued:false,emergencyLoanTaken:false,decisiveOffered:0,turncoatWins:0,districtHonors:[]},factions:{east:{defeated:false,ambition:0},wan:{defeated:false,ambition:0},long:{defeated:false,ambition:0}},wins:0,losses:0,battles:0,casualties:0,lastBattleMonth:0,lastAction:null,lastBattle:null,winStreak:0,battleSession:null,ended:false,endingReason:"",
  postures:{},governors:{},truces:{},incited:null,schedule:[],crisisCooldowns:{},aiPityUntil:0,
  breach:{},blockade:{},siegeDone:{},siegeWarn:null,eraDecay:1,heatFloor:0,peaceUnified:false,mutators:Array.isArray(mutators)?mutators.filter(id=>MUTATORS[id]).slice(0,2):[]};
  Object.keys(territories).forEach(id=>{if(territories[id].owner!=="player")s.postures[id]=INIT_POSTURES[id]||POSTURE_IDS[Object.keys(TERRITORY_DEFS).indexOf(id)%POSTURE_IDS.length]});
  refreshRecruitMarket(s);log(s,"story",`${s.name}接过了和联胜的龙头印。`);return s;
}

// ---- 姿态与主政的读写 ----
function postureOf(s,id){return s.territories[id]&&s.territories[id].owner!=="player"?POSTURES[s.postures?.[id]]?POSTURES[s.postures[id]]:null:null}
function postureMult(s,id,tactic){const p=postureOf(s,id);return p?.mods?.[tactic]??1}
function rerollPosture(s,id,rng=Math.random){if(!s.postures)s.postures={};if(s.territories[id].owner==="player")delete s.postures[id];else s.postures[id]=pick(POSTURE_IDS,rng)}
function isGovernor(s,officerId){return Object.values(s.governors||{}).includes(officerId)}
function governorOf(s,terrId){const id=(s.governors||{})[terrId],o=id?officer(s,id):null;return o&&o.side==="player"?o:null}
// 主政头目按五维给地盘持续加成，但不能带出去打仗——"人往哪放"从此是道真题。
function governorTick(s){
  Object.entries(s.governors||{}).forEach(([terrId,oid])=>{
    const t=s.territories[terrId],o=officer(s,oid);
    if(!t||t.owner!=="player"||!o||o.side!=="player"){delete s.governors[terrId];return}
    const cap=(90+ownTerritories(s).length*8)*PEOPLE;
    if(t.guard<cap)t.guard=Math.min(cap,t.guard+Math.max(1,Math.round(o.stats.command/25))*PEOPLE);
    t.stability=clamp(t.stability+Math.max(1,Math.round(o.stats.charm/30)));
    if(o.stats.scheme>=70)change(s,"heat",-1);
    o.merit+=1;gainXP(o,2);
  });
}

function officerCapacity(s){return 5+ownTerritories(s).length*2+(owns(s,"new_city")?2:0)}
function totalCrew(s){return s.crew+(s.regroup||0)+(s.wounded||0)}
// 从组织里扣人，按 能战→整补→养伤 的顺序，返回实际扣掉的数目。
// 打完一仗 s.crew 常常是 0（人都在整补），任何 Math.max(1,s.crew-n) 的写法都会在这时凭空造人。
function drainCrew(s,n){let left=Math.max(0,Math.round(n)),gone=0;for(const k of["crew","regroup","wounded"]){const take=Math.min(s[k]||0,left);s[k]=(s[k]||0)-take;left-=take;gone+=take;if(!left)break}return gone}
// 人手上限绑定地盘：想养更多人只能先拿地，拿地又需要人。这是本作扩张压力的主旋钮。
// ---- 人从地盘来 ----
// 招人：每块已立稳的自家地盘出一批人。街坊地段最多，商业次之，物流最少；稳定越高出得越多，稳定 20 以下招不到人。老街是根，多出 20 人。
const RECRUIT_YIELD={neighborhood:6,commerce:4.5,logistics:3.5};
function stabilityFactor(t){return clamp((t.stability-20)/55,0,1.4)}
function territoryRecruit(s,id){const t=s.territories[id],d=TERRITORY_DEFS[id];if(!t||t.owner!=="player"||t.settling>0)return 0;return Math.round(((RECRUIT_YIELD[d.affinity]||4.5)*(TUNE.ry??1)*stabilityFactor(t)+(id==="old_street"?2:0))*PEOPLE)}
function recruitYield(s){return ownTerritories(s).reduce((a,id)=>a+territoryRecruit(s,id),0)}
// 投奔：每月每块已立稳的地盘自己来几个人，主政头目魅力越高来得越多。
function territoryInflow(s,id){const t=s.territories[id];if(!t||t.owner!=="player"||t.settling>0)return 0;const gov=governorOf(s,id);return Math.round((stabilityFactor(t)*2.5+(gov?gov.stats.charm/25:0))*(TUNE.fl??1)*PEOPLE/2)}
function monthlyInflow(s){const room=Math.max(0,crewCap(s)-totalCrew(s)),n=Math.min(room,ownTerritories(s).reduce((a,id)=>a+territoryInflow(s,id),0));s.crew+=n;return n}
function crewCap(s){const ids=ownTerritories(s);return (40+ids.length*20+ids.reduce((sum,id)=>sum+((s.territories[id].level||1)-1),0)*6)*PEOPLE}
function commonOfficerCount(s){return ownedOfficers(s).filter(o=>!o.named).length}
function commonOfficer(id,name,type,trait,stats,cost,rng=Math.random){return{id,name,side:"market",role:`${type}人才`,type,portrait:"",stats,trait,traitText:`${trait}，在${type}岗位上更可靠。`,loyalty:rand(52,72,rng),resentment:0,merit:0,injured:0,lv:1,xp:0,battles:0,wins:0,named:false,cost}}
function rngToken(rng=Math.random){return Math.floor(rng()*46656).toString(36).padStart(3,"0")}
function makeCommonCandidate(s,index=0,rng=Math.random){const type=pick(COMMON_TYPES,rng),name=pick(COMMON_NAMES.filter(n=>!s.officers.some(o=>o.name===n)&&!s.recruitMarket.some(o=>o.name===n)),rng)||`雾港青年${index+1}`,trait=pick(COMMON_TRAITS,rng);const base={force:rand(40,68,rng),command:rand(38,68,rng),scheme:rand(35,70,rng),business:rand(34,70,rng),charm:rand(38,72,rng)};const key={"猛将":"force","统将":"command","军师":"scheme","管事":"business","说客":"charm","探子":"scheme"}[type];base[key]=rand(67,80+(owns(s,"new_city")?5:0),rng);const cost=Math.round((Object.values(base).reduce((a,b)=>a+b,0)/28)+(type==="猛将"?3:0)),id=`common_${s.month}_${index}_${rngToken(rng)}`;return commonOfficer(id,name,type,trait,base,cost,rng)}
function refreshRecruitMarket(s,rng=Math.random){s.recruitMarket=[];for(let i=0;i<3;i++)s.recruitMarket.push(makeCommonCandidate(s,i,rng))}
function recruitCost(s,cost){let c=cost;if(s.creed==="li")c*=.85;if(s.flags.chengRecruitChief)c*=.9;if(owns(s,"whitesand"))c*=.9;if(mutOn(s,"goldrush"))c*=1.25;return Math.max(1,Math.round(c))}
function hireCommon(s,id){if(s.ap<1)return false;if(ownedOfficers(s).length>=officerCapacity(s))return false;const i=s.recruitMarket.findIndex(o=>o.id===id);if(i<0)return false;const c=s.recruitMarket[i],cost=recruitCost(s,c.cost);if(s.cash<cost)return false;s.ap--;addCash(s,-cost);c.side="player";c.loyalty=clamp(c.loyalty+(s.creed==="yi"?6:0));s.officers.push(c);s.recruitMarket.splice(i,1);log(s,"good",`${c.name}带着自己的人加入和联胜。`);s.lastAction={name:"招募人才",text:`${c.name}（${c.type}）正式加入。`};return true}

function namedCandidateStatus(s,id){
  if(hasOfficer(s,id))return{state:"owned",text:"已加入"};
  if(id==="aqi")return s.month>=2||s.flags.aqiUnlocked?{state:"ready",text:"老街口等你"}:{state:"locked",text:"第3个月出现"};
  if(id==="yerong"){const revealed=s.cash>=45||owns(s,"west_market")||s.flags.yeUnlocked;if(!revealed)return{state:"locked",text:"需现金45万或占领深水埗"};return s.cash>=20?{state:"ready",text:"20万启动商路"}:{state:"unaffordable",text:`还差${Math.ceil(20-s.cash)}万`}}
  if(id==="xiejiu")return s.flags.xieUnlocked||s.wins>=3?{state:"ready",text:"要先证明你能打胜仗"}:{state:"locked",text:"赢下3场血拼后出现"};
  return{state:"locked",text:"剧情未解锁"};
}

function recruitNamed(s,id){
  if(s.ap<1||hasOfficer(s,id))return false;const st=namedCandidateStatus(s,id);if(st.state!=="ready")return false;
  if(id==="aqi"){s.ap--;const o=cloneOfficer(id,"player",68);s.officers.push(o);s.flags.aqiUnlocked=true;change(s,"support",5);log(s,"good","阿七拎着一只旧包走进了祖堂。");return true}
  if(id==="yerong"){if(s.cash<20)return false;s.ap--;addCash(s,-20);s.officers.push(cloneOfficer(id,"player",72));s.flags.yeUnlocked=true;markStyle(s,"li",2);log(s,"good","叶蓉把一张雾港商路图铺在了祖堂桌上。");return true}
  if(id==="xiejiu"){s.ap--;enqueue({title:"谢九要你亲自给个答案",portrait:CHARACTER_DEFS.xiejiu.portrait,body:"<p>谢九坐在老街茶馆的最里面，手边压着父亲旧账簿的那张复印件。<span class='dialogue'>“你爸欠我的，不是一把椅子。我想看看你能不能扛住他的名字。”</span></p>",options:[
      option("把战堂副位给他","谢九加入；赵魁怨气+12",()=>{s.officers.push(cloneOfficer(id,"player",67));resent(s,"zhaokui",12);markStyle(s,"yi",1)}),
      option("“先跟我打一场”","声望决定成功；失败则受伤",()=>{if(chance(.48+s.rep/180)){s.officers.push(cloneOfficer(id,"player",78));change(s,"rep",6);markStyle(s,"wei",2)}else{const p=officer(s,"player");p.injured=2;change(s,"morale",-5);log(s,"bad","谢九没留下，你却在那场较量里伤了肩。")}},"danger")
    ]},"人才招募");return true}
  return false;
}

function lockedTextOf(a,s){return typeof a.lockedText==="function"?a.lockedText(s):a.lockedText}
function monthlyGross(s){let gross=ownTerritories(s).reduce((sum,id)=>{let v=(TERRITORY_DEFS[id].income+enterpriseGross(s,id))*(s.territories[id].level||1)*((s.territories[id].settling||0)>0?.5:1);const g=governorOf(s,id);if(g)v*=1+g.stats.business/350;if(mutOn(s,"smuggle")&&(id==="south_dock"||id==="golden_bay"))v*=1.4;return sum+v},0);if(hasOfficer(s,"sumanqing"))gross*=1.12;if(hasOfficer(s,"yerong"))gross*=1.15;if(s.creed==="li")gross*=1.12;if(mutOn(s,"rain"))gross*=.92;if(mutOn(s,"goldrush"))gross*=1.15;gross*=diff(s).income*(s.eraDecay||1);return Math.round(gross)}
function monthlyUpkeep(s){let crew=totalCrew(s)*.13/PEOPLE;if(owns(s,"south_dock"))crew*=.9;if(owns(s,"fogvillage"))crew*=.95;const officerCost=Math.max(0,ownedOfficers(s).length-4)*1.2,territoryCost=Math.max(0,ownTerritories(s).length-1)*2;return Math.round((crew+officerCost+territoryCost+ownTerritories(s).reduce((n,id)=>n+enterpriseUpkeep(s,id),0))*10)/10}
function monthlyNet(s){return Math.round((monthlyGross(s)-monthlyUpkeep(s))*10)/10}
// 整补两个月归队、养伤四五个月且要花钱——"打完一仗伤不起"的实现在这里。
// 必须在 applyEconomy 之前调用：医药费要计入当月账面，否则资金链危机会晚一个月才发作。
function recoverCrew(s){
  const out={back:0,healed:0,cost:0,broke:false};
  if(s.regroup>0){let rate=mutOn(s,"veterans")?.65:.5;if(owns(s,"highway"))rate+=.1;out.back=Math.min(s.regroup,Math.max(5*PEOPLE,Math.ceil(s.regroup*rate)));s.regroup-=out.back;s.crew+=out.back}
  if(s.wounded>0){
    const base=Math.min(s.wounded,Math.max(PEOPLE,Math.ceil(Math.round(s.wounded*(s.creed==="yi"?28:22))/100))),cost=Math.round(s.wounded*.4/PEOPLE*(owns(s,"fishmarket")?.8:1)*10)/10;
    if(s.cash>=cost){addCash(s,-cost);out.cost=cost;out.healed=base}
    else{out.broke=true;out.healed=Math.floor(base/2);change(s,"morale",-4);log(s,"bad","付不出伤者的药钱，养伤的人回得更慢了。")}
    s.wounded-=out.healed;s.crew+=out.healed;
  }
  if(out.back||out.healed)log(s,"good",`${out.back} 人整补归队，${out.healed} 人伤愈。`);
  return out;
}
function settlingTerritories(s){return ownTerritories(s).filter(id=>(s.territories[id].settling||0)>0)}
function weakestOwned(s){return ownTerritories(s).slice().sort((a,b)=>s.territories[a].guard-s.territories[b].guard)[0]}
function woundedCareCost(s){return Math.max(3,Math.round(s.wounded*.6/PEOPLE*10)/10)}
// 新打下来的地盘头三个月是负资产：收入减半、被进攻时驻防只算七成、街面随时闹事。
// 扩张有代价——但这个代价可以用一个行动点（坐镇新地盘）买断，而不是干等。
function tickSettling(s,rng=Math.random){
  ownTerritories(s).forEach(id=>{const t=s.territories[id];if(!(t.settling>0))return;t.settling--;
    if(chance(.25,rng)){addCash(s,-4);s.casualties+=drainCrew(s,3*PEOPLE);change(s,"support",-3);log(s,"warn",`${TERRITORY_DEFS[id].name}的街面还不服管，又出了乱子。`)}
    else if(t.settling===0)log(s,"good",`${TERRITORY_DEFS[id].name}的街面终于安静下来了。`)});
}
function applyEconomy(s){const gross=monthlyGross(s),upkeep=monthlyUpkeep(s),net=Math.round((gross-upkeep)*10)/10;addCash(s,net);s.insolvencyMonths=s.cash<0?(s.insolvencyMonths||0)+1:0;if(owns(s,"golden_bay"))change(s,"heat",2);if(net<0){change(s,"morale",-7);ownedOfficers(s).filter(o=>o.id!=="player").forEach(o=>{o.loyalty=clamp(o.loyalty-3);o.resentment=clamp(o.resentment+2)});log(s,"bad",`本月收入${gross}万，支出${upkeep}万，账面继续失血。`)}else log(s,"story",`本月地盘净收入 ${net} 万。`);return{gross,upkeep,net}}

function checkInsolvency(s){
  if(s.ended||s.flags.debtCrisisQueued||!(s.cash<=BANKRUPT_CASH||(s.insolvencyMonths||0)>=2))return false;
  s.flags.debtCrisisQueued=true;
  const sellable=ownTerritories(s).filter(id=>id!=="old_street").sort((a,b)=>(s.territories[a].enterpriseLevel||0)-(s.territories[b].enterpriseLevel||0)||(s.territories[a].invested||0)-(s.territories[b].invested||0)||TERRITORY_DEFS[a].income-TERRITORY_DEFS[b].income),options=[];
  if(sellable.length){const id=sellable[0],price=Math.max(24,TERRITORY_DEFS[id].income*2);const shop=INDUSTRIES[s.territories[id].industry];options.push(option(`卖掉${TERRITORY_DEFS[id].name}`,`现金+${price}万；失去该地盘${shop?`，连同${s.territories[id].enterpriseLevel}级${shop.name}（已投入${s.territories[id].invested||0}万）`:""}`,()=>{s.territories[id].owner="coalition";s.territories[id].guard=24*PEOPLE;s.territories[id].stability=56;addCash(s,price);change(s,"rep",-6);change(s,"support",-5);s.insolvencyMonths=0;s.flags.debtCrisisQueued=false;log(s,"bad",`${TERRITORY_DEFS[id].name}被拿去填了账。`)}))}
  if(!s.flags.emergencyLoanTaken)options.push(option("借一次救命钱","现金+35万；忠诚和人心下降",()=>{addCash(s,35);s.flags.emergencyLoanTaken=true;s.flags.debtCrisisQueued=false;s.insolvencyMonths=0;change(s,"support",-8);change(s,"heat",7);ownedOfficers(s).filter(o=>o.id!=="player").forEach(o=>o.loyalty=clamp(o.loyalty-5));markStyle(s,"li",2);log(s,"warn","和联胜借进了一笔只够救一次命的钱。")},"gold"));
  options.push(option("承认资金链断裂","进入破产结局",()=>endGame(s,"bankrupt"),"danger"));
  enqueue({title:"账房已经付不出下个月的钱",portrait:CHARACTER_DEFS.sumanqing.portrait,body:`<p>苏曼青把账簿推到你面前。现金已经跌到 <b>${Math.round(s.cash)} 万</b>，连续赤字 ${s.insolvencyMonths||0} 个月。</p><p><span class='dialogue'>“地盘还能抢回来。账一旦断了，人会先散。”</span></p>`,options},"资金链危机");
  return true;
}

function attackableTerritories(s){const own=ownTerritories(s),mine=new Set(own),base=new Set(own.filter(id=>!(s.territories[id].settling>0))),out=[];Object.keys(s.territories).forEach(id=>{if(mine.has(id))return;const def=TERRITORY_DEFS[id];if(def.final&&mine.size<TERRITORY_TOTAL-1)return;if(hqLocked(s,id))return;if(def.neighbors.some(n=>base.has(n)))out.push(id)});return out}
function factionLeaders(s,owner){return s.officers.filter(o=>o.side===owner&&o.injured<=0)}
function leaderScore(o,tactic="steady"){let score=(o.stats.force+o.stats.command)/8*PEOPLE;if(tactic==="ambush")score+=o.stats.scheme/6*PEOPLE;if(tactic==="persuade")score+=(o.stats.scheme+o.stats.charm)/12*PEOPLE;if(tactic==="assault")score+=o.stats.force/10*PEOPLE;return score}
function tacticMeta(id){return({assault:{name:"正面强攻",power:1.12,casualty:1.25},steady:{name:"稳扎稳打",power:1,casualty:.83},ambush:{name:"迂回奇袭",power:1.02,casualty:.94},persuade:{name:"攻心劝降",power:.92,casualty:.72}})[id]||{name:"稳扎稳打",power:1,casualty:1}}
function officerTraitPower(s,leaders,tactic){let m=1;if(tactic==="assault"&&leaders.some(o=>o.id==="zhaokui"))m*=1.12;if(tactic==="persuade"&&leaders.some(o=>o.id==="chengye"))m*=1.12;if(tactic==="ambush"&&leaders.some(o=>o.id==="weixiaolou"))m*=1.13;if(s.creed==="wei")m*=1.06;if((s.flags.armsBoost||0)>0)m*=1.08;return m}
function defenderPower(s,targetId){const t=s.territories[targetId],owner=t.owner,hq=isHomeHQ(s,targetId),leaders=factionLeaders(s,owner).slice().sort((a,b)=>leaderScore(b)-leaderScore(a)).slice(0,hq?3:2);let power=t.guard*1.18+leaders.reduce((sum,o)=>sum+leaderScore(o,"steady"),0);if(hq)power/=HQ_TAKEN;   // 堂口：全队受伤 −15%，折成战力就是 ÷0.85
if(owner==="coalition")power*=1.08;if(AI_FACTIONS.includes(owner)&&territoryCount(s,owner)===1)power*=1.12;return{power:power*diff(s).battle,leaders}}
// actual=true 时计入姿态克制（开战时用）；未查明情报的战前评估不计入——
// 这正是情报的价值：蒙着打，评估和实际之间隔着 ±13% 的姿态修正。
function estimateBattle(s,targetId,leaderIds,troops,tactic,actual=false){const leaders=leaderIds.map(id=>officer(s,id)).filter(Boolean),meta=tacticMeta(tactic);let power=troops*(.82+s.morale*.0048)+leaders.reduce((sum,o)=>sum+leaderScore(o,tactic),0)+(s.training||0)*.7*PEOPLE;power*=meta.power*officerTraitPower(s,leaders,tactic);if(tactic==="ambush"&&!s.intel[targetId])power*=.78;if(actual||s.intel[targetId])power*=postureMult(s,targetId,tactic);const def=defenderPower(s,targetId).power,ratio=power/def;return{power,def,ratio,label:ratio>=1.28?"优势":ratio>=.88?"胶着":ratio>=.68?"凶险":"九死一生"}}

// ---- 头目卡牌对战 ----
// 双方各最多三名头目，每人带一队小弟（小弟数＝血量），分前后两排。一场仗分开局/僵持/决胜三段，
// 每段自动打两回合；段与段之间玩家出一张号令牌（stageOptions），牌的效果作用于下一段。
// 开战时双方总战力之比与旧公式 estimateBattle/defenderPower 完全一致，变化只在过程：
// 谁站前排挨打、谁的技能发动、哪一路先溃散。CARD_K 与 CARD_SWING 校准自旧版三段式的胜率曲线。
const STAGE_NAMES=["开局","僵持","决胜"];
const ROUNDS_PER_STAGE=2;
const CARD_K=.024;          // 每次出手打掉对方的战力份额（相对出手者自身战力）
const TUNE=typeof process!=="undefined"&&process.env&&process.env.CARD_TUNE?JSON.parse(process.env.CARD_TUNE):{};
const GARRISON_RATE=TUNE.gr??.6,GARRISON_MIN=(TUNE.gm??20)*PEOPLE;
const CARD_SWING=TUNE.sw??.45;       // 每段我方临场发挥的浮动幅度
const CARD_ENEMY=TUNE.en??1.6;        // 守方战力的总校准：我方头目自带技能多于守方杂兵，这里把平均优势抵掉
const ROUT_AT=.22;          // 一路人马的战力跌到开战时的这个比例以下就溃散退场
const ENEMY_BREACH=2.4;
const CONVERT_JOIN=.3;       // 阵前被劝下的人只有三成真跟你走，其余散回街上——全收的话，劝降会滚成雪球     // 进攻失利时守方的门板损耗相对实际伤亡的倍数（打过一场，伤的养不回来）
const FRONT_TYPES=new Set(["猛将","统将","龙头","新人","地头蛇","打手"]);

// 技能：kind=active(出手时按发动率替代普攻；带 free 的是瞬发，放完照样普攻)/chase(普攻后追击)/passive(常驻)/aura(压阵，作用全队)。
// 效果写成钩子，战斗单位只存技能 id，存档里不放函数。
const SKILLS={
  // 名将专属
  zk_open:{name:"开路",kind:"active",rate:.35,desc:"对一人1.7倍",act:(c,u)=>c.hit(u,c.pick(u),1.7)},
  zk_hold:{name:"镇场",kind:"aura",desc:"同排友军受伤−10%",taken:(c,u,v)=>v.side===u.side&&v.row===u.row?.9:1},
  sm_count:{name:"算账",kind:"aura",desc:"全队伤害+6%",out:(c,u,a)=>a.side===u.side?1.06:1},
  sm_cut:{name:"断粮",kind:"active",free:true,rate:.3,desc:"对方全队下一回合伤害−20%",act:(c,u)=>c.sideStatus(c.foe(u.side),"weak",1,.8,`${u.name}断了对面的补给`)},
  cy_talk:{name:"喊话",kind:"active",free:true,rate:.3,desc:"劝走一队里的几个人",act:(c,u)=>c.persuade(u,c.pick(u,"weakest"),u.stats.charm/22)},
  cy_bro:{name:"兄弟",kind:"passive",desc:"有友军溃散后伤害+20%",out:(c,u,a)=>a===u&&c.routed(u.side)>0?1.2:1},
  pl_seat:{name:"坐镇",kind:"aura",desc:"全队受伤−5%",taken:(c,u,v)=>v.side===u.side?.95:1},
  pl_yi:{name:"义字当头",kind:"active",free:true,rate:.25,desc:"劝走对面几个人",act:(c,u)=>c.persuade(u,c.pick(u,"weakest"),u.stats.charm/26)},
  pl_wei:{name:"人必须怕你",kind:"aura",desc:"前两回合全队伤害+15%",out:(c,u,a)=>a.side===u.side&&c.round<=2?1.15:1},
  pl_li:{name:"钱要先到",kind:"aura",desc:"开战发红包，全队受伤−8%",taken:(c,u,v)=>v.side===u.side?.92:1},
  aq_learn:{name:"跟着学",kind:"passive",desc:"每打过一场伤害+1%，最多+15%",out:(c,u,a)=>a===u?1+Math.min(.15,(u.battles||0)*.01):1},
  aq_rush:{name:"愣头青",kind:"chase",rate:.3,desc:"普攻后追击0.8倍",act:(c,u,t)=>c.hit(u,t,.8)},
  yr_supply:{name:"补给",kind:"active",free:true,rate:.28,desc:"给一路友军补回几个人",act:(c,u)=>c.heal(u,c.pick(u,"allyHurt"),3+u.stats.business/40)},
  yr_back:{name:"后路",kind:"passive",desc:"战后多救回两成伤员",finish:"wounded"},
  xj_win:{name:"只服胜者",kind:"passive",desc:"连胜两场以上伤害+12%",out:(c,u,a)=>a===u&&c.streak>=2?1.12:1},
  xj_fierce:{name:"狠",kind:"chase",rate:.4,desc:"普攻后追击0.9倍",act:(c,u,t)=>c.hit(u,t,.9)},
  tj_steady:{name:"稳",kind:"aura",desc:"本方前排受伤−12%",taken:(c,u,v)=>v.side===u.side&&v.row==="front"?.88:1},
  tj_drill:{name:"整队",kind:"active",free:true,rate:.25,desc:"本方下一回合伤害+15%",act:(c,u)=>c.sideStatus(u.side,"rally",1,1.15,`${u.name}把队伍重新排了一遍`)},
  hw_dock:{name:"老码头",kind:"aura",desc:"守香港仔、红磡时全队受伤−10%",taken:(c,u,v)=>v.side===u.side&&["south_dock","shipyard"].includes(c.targetId)?.9:1},
  hw_squeeze:{name:"压价",kind:"active",rate:.3,desc:"对一人1.5倍",act:(c,u)=>c.hit(u,c.pick(u),1.5)},
  fj_money:{name:"砸钱",kind:"passive",desc:"开战前撬走对面魅力最低那一路的人",start:(c,u)=>c.bribe(u)},
  fj_book:{name:"账面",kind:"aura",desc:"本方受伤−8%",taken:(c,u,v)=>v.side===u.side?.92:1},
  hb_clash:{name:"硬碰",kind:"active",rate:.35,desc:"找对面武力最高的人，1.8倍",act:(c,u)=>c.hit(u,c.pick(u,"strongest"),1.8)},
  hb_door:{name:"顶门",kind:"passive",desc:"人手过半时受伤−15%",taken:(c,u,v)=>v===u&&u.str>u.max*.5?.85:1},
  gc_ally:{name:"合纵",kind:"aura",desc:"本方伤害+8%",out:(c,u,a)=>a.side===u.side?1.08:1},
  gc_split:{name:"离间",kind:"active",free:true,rate:.3,desc:"让对面一路下一回合动不了",act:(c,u)=>c.stun(u,c.pick(u,"strongest"))},
  wx_door:{name:"第二扇门",kind:"passive",desc:"闪避两成，溃散时带人全身而退",dodge:.2},
  wx_arrow:{name:"暗箭",kind:"active",rate:.35,desc:"打对面后排1.4倍",act:(c,u)=>c.hit(u,c.pick(u,"back"),1.4)},
  // 通用技能池（按类型）
  g_charge:{name:"猛冲",kind:"active",rate:.35,desc:"对一人1.6倍",act:(c,u)=>c.hit(u,c.pick(u),1.6)},
  g_last:{name:"死战",kind:"passive",desc:"人手不到四成时伤害+25%",out:(c,u,a)=>a===u&&u.str<u.max*.4?1.25:1},
  g_chase:{name:"追砍",kind:"chase",rate:.4,desc:"普攻后追击0.8倍",act:(c,u,t)=>c.hit(u,t,.8)},
  g_wall:{name:"结阵",kind:"aura",desc:"同排友军受伤−10%",taken:(c,u,v)=>v.side===u.side&&v.row===u.row?.9:1},
  g_rotate:{name:"轮换",kind:"passive",desc:"自身受伤−12%",taken:(c,u,v)=>v===u?.88:1},
  g_drum:{name:"督战",kind:"active",free:true,rate:.25,desc:"本方下一回合伤害+12%",act:(c,u)=>c.sideStatus(u.side,"rally",1,1.12,`${u.name}在后面督着`)},
  g_see:{name:"看破",kind:"aura",desc:"对方伤害−5%",out:(c,u,a)=>a.side!==u.side?.95:1},
  g_feint:{name:"疑兵",kind:"active",free:true,rate:.3,desc:"让对面一路下一回合动不了",act:(c,u)=>c.stun(u,c.pick(u))},
  g_fire:{name:"火攻",kind:"active",rate:.25,desc:"打对面整个前排0.8倍",act:(c,u)=>c.pickAll(u,"front").forEach(t=>c.hit(u,t,.8))},
  g_bandage:{name:"包扎",kind:"active",free:true,rate:.3,desc:"给一路友军补回几个人",act:(c,u)=>c.heal(u,c.pick(u,"allyHurt"),3+u.stats.business/50)},
  g_stock:{name:"备货",kind:"aura",desc:"全队受伤−5%",taken:(c,u,v)=>v.side===u.side?.95:1},
  g_scatter:{name:"劝散",kind:"active",free:true,rate:.3,desc:"劝走一队里的几个人",act:(c,u)=>c.persuade(u,c.pick(u),u.stats.charm/30)},
  g_calm:{name:"稳人心",kind:"aura",desc:"本方不容易溃散",calm:true},
  g_backdoor:{name:"摸后门",kind:"active",rate:.35,desc:"打对面后排1.3倍",act:(c,u)=>c.hit(u,c.pick(u,"back"),1.3)},
  g_scout:{name:"探路",kind:"passive",desc:"首回合闪避三成",dodge:.3,dodgeRound:1}
};
const NAMED_SKILLS={player:["pl_seat"],zhaokui:["zk_open","zk_hold"],sumanqing:["sm_count","sm_cut"],chengye:["cy_talk","cy_bro"],aqi:["aq_learn","aq_rush"],yerong:["yr_supply","yr_back"],xiejiu:["xj_win","xj_fierce"],tangji:["tj_steady","tj_drill"],hewanshan:["hw_dock","hw_squeeze"],fangjingyao:["fj_money","fj_book"],hanbiao:["hb_clash","hb_door"],guchangfeng:["gc_ally","gc_split"],weixiaolou:["wx_door","wx_arrow"]};
const CREED_SKILL={yi:"pl_yi",wei:"pl_wei",li:"pl_li"};
const TYPE_SKILLS={猛将:["g_charge","g_last","g_chase"],统将:["g_wall","g_rotate","g_drum"],军师:["g_see","g_feint","g_fire"],策士:["g_see","g_feint","g_fire"],管事:["g_bandage","g_stock"],商枭:["g_bandage","g_stock"],说客:["g_scatter","g_calm"],探子:["g_backdoor","g_scout"],地头蛇:["g_charge","g_chase","g_rotate"],打手:["g_charge","g_wall"]};
function strHash(t){let h=7;for(const ch of String(t))h=(h*31+ch.charCodeAt(0))>>>0;return h}
// ---- 头目等级 Lv1~10 ----
// 打仗攒经验：出战、打赢、放倒的人、放出的技能都算。每升一级，按类型给两项主属性各+2，带兵上限+20。
// Lv5：普通头目学会第二个技能，名将的技能升「·贰」；Lv10：名将技能升「·叁」。
const LV_MAX=10,TIER_K=[1,1.4,1.8],TIER_MARK=["","·贰","·叁"];
const LV_STATS={猛将:["force","command"],统将:["command","force"],龙头:["command","charm"],新人:["force","command"],前辈:["command","scheme"],军师:["scheme","business"],策士:["scheme","business"],管事:["business","charm"],商枭:["business","charm"],说客:["charm","scheme"],探子:["scheme","force"]};
function lvNeed(lv){return 20+lv*12}
function lvOf(o){return clamp(Math.round(Number(o?.lv)||1),1,LV_MAX)}
function levelUp(o){if(lvOf(o)>=LV_MAX)return false;o.lv=lvOf(o)+1;(LV_STATS[o.type]||LV_STATS.猛将).forEach(k=>{o.stats[k]=clamp(o.stats[k]+2,1,99)});return true}
function gainXP(o,n){if(!o||!(n>0))return 0;o.lv=lvOf(o);o.xp=(Number(o.xp)||0)+Math.round(n);let ups=0;while(o.lv<LV_MAX&&o.xp>=lvNeed(o.lv)){o.xp-=lvNeed(o.lv);levelUp(o);ups++}if(o.lv>=LV_MAX)o.xp=0;return ups}
function enemyYearUp(s){const target=Math.min(LV_MAX,1+Math.floor(s.month/12));s.officers.filter(o=>AI_FACTIONS.includes(o.side)||o.side==="coalition").forEach(o=>{while(lvOf(o)<target&&levelUp(o));o.xp=0})}
// 旧存档：隐藏的 exp（每 10 点随机 +1 属性）折成新经验；已经长出来的属性不再重复发放。
function migrateLevels(s){(s.officers||[]).forEach(o=>{if(!o||typeof o!=="object"||Number.isFinite(o.lv))return;
  const d=CHARACTER_DEFS[o.id],grown=d&&o.stats?Object.keys(d.stats).reduce((a,k)=>a+Math.max(0,(o.stats[k]||0)-d.stats[k]),0):0;
  let xp=Math.round(((o.id==="aqi"?0:grown)*10+(Number(o.exp)||0))*4);o.lv=1;while(o.lv<LV_MAX&&xp>=lvNeed(o.lv)){xp-=lvNeed(o.lv);o.lv++}o.xp=o.lv>=LV_MAX?0:xp;delete o.exp});
  if(AI_FACTIONS.some(f=>(s.officers||[]).some(o=>o.side===f&&lvOf(o)<Math.min(LV_MAX,1+Math.floor((s.month||0)/12)))))enemyYearUp(s)}
function skillTier(o){return o?.named?(lvOf(o)>=10?3:lvOf(o)>=5?2:1):1}
function skillTiers(s,o){const tr=skillTier(o),out={};officerSkills(s,o).forEach(id=>{out[id]=tr});return out}
function skillLabel(id,tier){return (SKILLS[id]?.name||"")+(TIER_MARK[(tier||1)-1]||"")}
function officerSkills(s,o){
  if(!o)return[];
  if(NAMED_SKILLS[o.id])return o.id==="player"?[...NAMED_SKILLS.player,CREED_SKILL[s.creed]||"pl_yi"]:NAMED_SKILLS[o.id].slice();
  const pool=TYPE_SKILLS[o.type]||TYPE_SKILLS.猛将,h=strHash(o.id||o.name),first=pool[h%pool.length];
  return lvOf(o)>=5&&pool.length>1?[first,pool[(h+1)%pool.length]]:[first];
}
function skillInfo(id){const k=SKILLS[id];return k?{id,name:k.name,kind:k.kind,desc:k.desc}:null}
function troopCap(o){return (Math.round(12+(o?.stats?.command||50)/2)+(lvOf(o)-1)*(TUNE.tc??2))*PEOPLE}
function defaultRow(o){return FRONT_TYPES.has(o.type)?"front":"back"}

// 按统率比例把出战人手分给头目；手动分配过的保留，再把余数补齐或扣回。
function splitTroops(s,leaderIds,troops,manual={}){
  const ls=leaderIds.map(id=>officer(s,id)).filter(Boolean);if(!ls.length)return{};
  const out={};let left=troops;
  ls.forEach(o=>{const m=manual[o.id];if(Number.isFinite(m)){out[o.id]=clamp(Math.round(m),1,troopCap(o));left-=out[o.id]}});
  const auto=ls.filter(o=>out[o.id]==null);
  if(auto.length){const tot=auto.reduce((a,o)=>a+o.stats.command,0);auto.forEach(o=>{out[o.id]=clamp(Math.round(left*o.stats.command/tot),1,troopCap(o))})}
  let diffN=troops-Object.values(out).reduce((a,b)=>a+b,0);
  const order=ls.slice().sort((a,b)=>b.stats.command-a.stats.command);
  for(let guard=0;diffN!==0&&guard<4000;guard++){const o=order[guard%order.length];if(diffN>0&&out[o.id]<troopCap(o)){out[o.id]++;diffN--}else if(diffN<0&&out[o.id]>1){out[o.id]--;diffN++}}
  return out;
}
function maxTroops(s,leaderIds){return leaderIds.map(id=>officer(s,id)).filter(Boolean).reduce((a,o)=>a+troopCap(o),0)}

const STREET_NICKS=["大眼辉","跛脚坤","肥佬祥","阿炳","细佬强","四眼明","老鬼添","黑仔荣","大口九","沙皮狗","烂命华","花蟹"];
function enemyLineup(s,targetId,decisive){
  const t=s.territories[targetId],owner=t.owner;
  const named=(decisive?factionLeaders(s,decisive):defenderPower(s,targetId).leaders).slice(0,isHomeHQ(s,targetId)&&!decisive?3:2);
  const guard=decisive?Math.round(factionTerritories(s,decisive).reduce((a,id)=>a+s.territories[id].guard,0)*.45):t.guard;
  const units=named.map(o=>({id:o.id,name:o.name,type:o.type,portrait:o.portrait||"",stats:{...o.stats},skills:officerSkills(s,o),tiers:skillTiers(s,o),lv:lvOf(o)}));
  const want=guard<16*PEOPLE?1:Math.min(3,Math.max(units.length+1,2));
  for(let i=0;units.length<want;i++){
    const h=strHash(targetId+":"+i),nick=STREET_NICKS[h%STREET_NICKS.length];
    const type=owner==="free"?"地头蛇":"打手",base=40+(h%17);
    units.push({id:null,name:owner==="free"?`${nick}`:`${FACTIONS[owner]?.name||"同盟"}·${nick}`,type,portrait:"",stats:{force:base+8,command:base,scheme:36,business:30,charm:40},skills:[pick(TYPE_SKILLS[type],()=>(h%1000)/1000)]});
  }
  const weight=units.map(u=>u.stats.command+(u.id?40:0)),tw=weight.reduce((a,b)=>a+b,0);
  let left=guard;units.forEach((u,i)=>{u.hp=i===units.length-1?left:Math.max(1,Math.round(guard*weight[i]/tw));left-=u.hp});
  if(!units.some(u=>FRONT_TYPES.has(u.type)))units[0].frontForced=true;
  return units;
}

// 建两边的战斗单位。str 是“战力”（小弟+头目本人的分量），hp 是小弟人数；挨打时两者按同一比例掉。
function buildBattleUnits(s,session){
  const {targetId,leaderIds,troops,tactic,decisive}=session;
  // 旧版存档里打到一半的仗没有存两边战力：沿用当时冻结的 ratio 反推，难度不变
  if(!Number.isFinite(session.power)||!Number.isFinite(session.defPower)){const est=estimateBattle(s,targetId,leaderIds,troops,tactic,true);session.defPower=decisive?decisiveDefPower(s,decisive):est.def;session.power=(Number.isFinite(session.ratio)?session.ratio:est.ratio)*session.defPower}
  if(!session.status)session.status={us:{},them:{}};
  const split=session.split||(session.split=splitTroops(s,leaderIds,troops));
  const ours=leaderIds.map(id=>officer(s,id)).filter(Boolean).map(o=>({key:"u_"+o.id,side:"us",id:o.id,name:o.name,type:o.type,portrait:o.portrait||"",stats:{...o.stats},skills:officerSkills(s,o),tiers:skillTiers(s,o),lv:lvOf(o),battles:o.battles||0,hp:split[o.id]||1,w:leaderScore(o,tactic),row:(session.rows||{})[o.id]||defaultRow(o)}));
  if(!ours.some(u=>u.row==="front"))ours.sort((a,b)=>b.stats.force-a.stats.force)[0].row="front";
  const theirs=enemyLineup(s,targetId,decisive).map((u,i)=>({...u,key:"e_"+i,side:"them",w:u.id?leaderScore(officer(s,u.id)||u):0,row:u.frontForced||FRONT_TYPES.has(u.type)?"front":"back"}));
  const usRaw=ours.reduce((a,u)=>a+u.hp+u.w,0),themRaw=theirs.reduce((a,u)=>a+u.hp+u.w,0);
  // 两边的倍率让开战时的总战力等于旧公式：ratio 不变，难度曲线才不会漂。
  const usPower=session.power,themPower=session.defPower;
  const usMult=usPower/Math.max(1,usRaw),themMult=themPower*CARD_ENEMY/Math.max(1,themRaw);
  const all=[...ours,...theirs].map(u=>({...u,max:u.hp+u.w,str:u.hp+u.w,hp0:u.hp,mult:u.side==="us"?usMult:themMult,out:false,stun:0}));
  return all;
}

// 战斗上下文：技能钩子通过它出手，事件写进 ev 供界面回放。
function tierOf(u,id){return (u&&u.tiers&&u.tiers[id])||1}
function tierAdj(v,tr){return tr>1&&Number.isFinite(v)?1+(v-1)*TIER_K[tr-1]:v}
function battleCtx(s,session,rng){
  const units=session.units,ev=[];
  const avgOf=side=>{const xs=units.filter(u=>u.side===side);return{force:xs.reduce((a,x)=>a+x.stats.force,0)/Math.max(1,xs.length),command:xs.reduce((a,x)=>a+x.stats.command,0)/Math.max(1,xs.length)}};
  const c={units,ev,rng,avg:{us:avgOf("us"),them:avgOf("them")},targetId:session.targetId,streak:s.winStreak||0,round:session.round||0,status:session.status||(session.status={us:{},them:{}}),
    foe:side=>side==="us"?"them":"us",
    alive:side=>units.filter(u=>u.side===side&&!u.out),
    routed:side=>units.filter(u=>u.side===side&&u.out).length,
    pick(u,mode){const foes=c.alive(c.foe(u.side));if(!foes.length)return null;
      if(mode==="weakest")return foes.slice().sort((a,b)=>a.hp-b.hp)[0];
      if(mode==="strongest")return foes.slice().sort((a,b)=>b.stats.force-a.stats.force)[0];
      if(mode==="back"){const b=foes.filter(x=>x.row==="back");return b.length?b[Math.floor(rng()*b.length)]:foes[Math.floor(rng()*foes.length)]}
      if(mode==="allyHurt"){const al=c.alive(u.side).filter(x=>x.hp<x.hp0);return al.length?al.sort((a,b)=>a.hp/a.hp0-b.hp/b.hp0)[0]:null}
      const front=foes.filter(x=>x.row==="front"),pool=front.length?front:foes;
      let r=rng()*pool.reduce((a,x)=>a+x.str,0);for(const x of pool){r-=x.str;if(r<=0)return x}return pool[pool.length-1]},
    pickAll(u,row){const foes=c.alive(c.foe(u.side)),f=foes.filter(x=>x.row===row);return f.length?f:foes},
    mod(kind,actor,target){let m=1;units.filter(x=>!x.out).forEach(x=>x.skills.forEach(id=>{const k=SKILLS[id],tr=tierOf(x,id);if(kind==="out"&&k?.out)m*=tierAdj(k.out(c,x,actor),tr);if(kind==="taken"&&k?.taken)m*=tierAdj(k.taken(c,x,target),tr)}));return m},
    hit(u,t,mult=1){
      if(!u||!t||t.out)return 0;
      const dodgeId=t.skills.find(id=>{const k=SKILLS[id];return k?.dodge&&(!k.dodgeRound||k.dodgeRound===c.round)}),dodge=dodgeId&&SKILLS[dodgeId];
      if(dodge&&rng()<dodge.dodge*(1+.25*(tierOf(t,dodgeId)-1))){ev.push({k:"dodge",a:u.key,b:t.key});return 0}
      const st=c.status[u.side],ost=c.status[t.side];
      // 武、统只在本方内部拉开差距：总量已经算在开战战力里，再按绝对值乘一次会让高属性的一方白赚。
      let d=CARD_K*u.str*u.mult*mult*(1+(u.stats.force-c.avg[u.side].force)/250)*(1-clamp((t.stats.command-c.avg[t.side].command)/300,-.1,.12));
      d*=c.mod("out",u,t)*c.mod("taken",u,t)*(st.rally?st.rally.v:1)*(st.weak?st.weak.v:1)*(c.sideMult[u.side]||1)*(c.boost||1)*(.85+rng()*.3);
      d=Math.min(d,t.str);
      const before=t.hp;t.hp=Math.max(0,t.hp-d*t.hp/Math.max(t.str,.0001)*(c.casualty[t.side]??1));t.str-=d;u.dealt=(u.dealt||0)+(before-t.hp);   // casualty 只改真正倒下的人数，不改战力对比
      ev.push({k:mult>1.01?"skill":"atk",a:u.key,b:t.key,n:Math.round(before)-Math.round(t.hp)});
      if(t.str<t.max*(c.calm(t.side)?ROUT_AT*.6:ROUT_AT)||t.hp<.5){t.out=true;ev.push({k:"rout",b:t.key,escape:t.skills.includes("wx_door")})}
      return d},
    calm:side=>units.some(x=>x.side===side&&!x.out&&x.skills.some(id=>SKILLS[id]?.calm)),
    // 劝人、补人都以一次普攻的分量为尺子，再按属性放大，免得一张技能顶三次出手。
    unit(u){return CARD_K*u.str*u.mult*(c.sideMult[u.side]||1)},
    heal(u,t,n){if(!t)return;n*=c.boost||1;const add=Math.min(Math.max(1,Math.round(c.unit(u)*1.3*t.hp/Math.max(t.str,1)*(n/5))),t.hp0-Math.round(t.hp));if(add<=0)return;const per=t.str/Math.max(t.hp,.0001);t.hp+=add;t.str=Math.min(t.max,t.str+add*Math.min(per,1.5));ev.push({k:"heal",a:u.key,b:t.key,n:add})},
    persuade(u,t,n){if(!t)return;n*=c.boost||1;const take=Math.min(Math.round(c.unit(u)*1.4*(n/3)*t.hp/Math.max(t.str,1)*(.7+rng()*.6)),Math.floor(t.hp));if(take<=0)return;u.dealt=(u.dealt||0)+take;const share=take/Math.max(t.hp,.0001);t.str-=t.str*share*Math.min(1,t.hp/Math.max(t.str,1));t.hp-=take;
      if(u.side==="us")session.converted=(session.converted||0)+take;ev.push({k:"talk",a:u.key,b:t.key,n:take});if(t.hp<.5){t.out=true;ev.push({k:"rout",b:t.key})}},
    stun(u,t){if(!t)return;t.stun=1;ev.push({k:"stun",a:u.key,b:t.key})},
    sideStatus(side,key,turns,v,text){v=tierAdj(v,c.tier||1);c.status[side][key]={left:turns+1,v};ev.push({k:"status",side,key,text})},
    bribe(u){const foes=c.alive(c.foe(u.side));if(!foes.length)return;const t=foes.slice().sort((a,b)=>a.stats.charm-b.stats.charm)[0];const take=Math.min(Math.floor(t.hp)-1,Math.max(0,Math.round((82-t.stats.charm)/7*PEOPLE*(c.boost||1))));if(take<=0)return;
      t.str-=t.str*take/Math.max(t.hp,1)*Math.min(1,t.hp/Math.max(t.str,1));t.hp-=take;if(t.side==="us")session.bribed=(session.bribed||0)+take;ev.push({k:"bribe",a:u.key,b:t.key,n:take})},
    sideMult:{us:1,them:1},casualty:{us:1,them:1},boost:1,tier:1,
    // 技能出手时按等级档位放大：倍率、补人、劝人、撬人一律×(1+15%/档)，增减益的偏移量×1.4/1.8
    cast(u,id,fn){const tr=tierOf(u,id);c.tier=tr;c.boost=1+.15*(tr-1);try{fn()}finally{c.tier=1;c.boost=1}}
  };
  return c;
}

// 一回合：所有在场单位按武力高低轮流出手。
function battleRound(c){
  c.round++;
  const order=c.units.filter(u=>!u.out).sort((a,b)=>b.stats.force-a.stats.force||(a.side==="us"?-1:1));
  for(const u of order){
    if(u.out)continue;
    if(!c.alive("us").length||!c.alive("them").length)break;
    if(u.stun){u.stun=0;c.ev.push({k:"stunned",a:u.key});continue}
    const act=u.skills.map(id=>[id,SKILLS[id]]).find(([id,k])=>k?.kind==="active"&&c.rng()<Math.min(.7,k.rate*(1+.15*(tierOf(u,id)-1))*(.75+u.stats.scheme/200)));
    if(act){u.casts=(u.casts||0)+1;c.ev.push({k:"cast",a:u.key,skill:act[0],tier:tierOf(u,act[0])});c.cast(u,act[0],()=>act[1].act(c,u));if(!act[1].free)continue}   // free＝瞬发：放完还能普攻
    const t=c.pick(u);if(!t)break;c.hit(u,t,1);
    const ch=u.skills.map(id=>[id,SKILLS[id]]).find(([id,k])=>k?.kind==="chase"&&c.rng()<k.rate*(1+.15*(tierOf(u,id)-1)));
    if(ch&&!t.out){u.casts=(u.casts||0)+1;c.ev.push({k:"cast",a:u.key,skill:ch[0],tier:tierOf(u,ch[0])});c.cast(u,ch[0],()=>ch[1].act(c,u,t))}
  }
  ["us","them"].forEach(side=>Object.keys(c.status[side]).forEach(k=>{if(--c.status[side][k].left<=0)delete c.status[side][k]}));
}
function sideFrac(units,side){const u=units.filter(x=>x.side===side);return u.reduce((a,x)=>a+Math.max(0,x.str),0)/Math.max(1,u.reduce((a,x)=>a+x.max,0))}
function battleTally(s,session){
  const us=session.units.filter(u=>u.side==="us"),them=session.units.filter(u=>u.side==="them");
  // 只数真正倒下的：被撬走的另算；旧档里超出带兵上限的人没上阵，算幸存
  const fell=us.reduce((a,u)=>a+Math.max(0,u.hp0-Math.max(0,Math.round(u.hp))),0);
  session.losses=clamp(fell-(session.bribed||0),0,session.troops);
  session.enemyLoss=Math.max(0,them.reduce((a,u)=>a+u.hp0-Math.max(0,Math.round(u.hp)),0));
  session.momentum=Math.round((sideFrac(session.units,"us")-sideFrac(session.units,"them"))*1000)/10;
}

function startBattle(s,{targetId,leaderIds,troops,tactic,decisive=null,cashIn=0,split=null,rows=null},rng=Math.random){
  if(s.battleSession)throw new Error("battle in progress");
  // 总攻打的是整整一家，不是一块地：目标只是决战发生的地点，相邻门槛在这条路径上不适用。
  if(!decisive&&!attackableTerritories(s).includes(targetId))throw new Error("target not attackable");
  if(s.crew<MIN_TROOPS)throw new Error("not enough crew");
  if(s.ap<1)throw new Error("no action point");                                   // 必须排在 battleSession/crew 检查之后，既有测试依赖那两条的错误信息
  const leaders=[...new Set(leaderIds)].map(id=>officer(s,id)).filter(o=>o&&o.side==="player"&&!o.injured&&!isGovernor(s,o.id)).slice(0,3);
  if(!leaders.length)throw new Error("no leaders");
  troops=clamp(Math.round(troops),MIN_TROOPS,s.crew);
  if(!Number.isFinite(troops))throw new Error("invalid troops");
  const ids=leaders.map(o=>o.id);
  troops=Math.max(MIN_TROOPS,Math.min(troops,maxTroops(s,ids)));                         // 头目带不动的人留在老街，不跟着上去白白折损
  // 沈川「沈家之后」：亲自出战时士气按不低于45计
  const est=estimateBattle(ids.includes("player")&&s.morale<45?{...s,morale:45}:s,targetId,ids,troops,tactic,true);
  let power=est.power,defPower=est.def;
  // 决战的对手是那一家的全部驻防与全部头目；准备度（破口/封锁/策反/民心/临阵砸钱）在这里一次性兑现。
  if(decisive){const spend=Math.max(0,Math.min(200,Math.round(cashIn)));addCash(s,-spend);power=est.power*(1+decisivePrep(s)+spend/25*.05);defPower=decisiveDefPower(s,decisive)}
  const mods={multRest:1,moraleFloor:0,convertRate:0,pressed:false,retreatShield:false,dueled:false,aqiRisk:false};
  if(ids.includes("player"))mods.moraleFloor=45;                                  // 沈川「沈家之后」
  if(ids.includes("yerong"))mods.retreatShield=true;                              // 叶蓉在阵：撤退不掉士气
  if(ids.includes("xiejiu")&&(s.winStreak||0)>=2)mods.multRest*=1.05;             // 谢九「只服胜者」
  s.ap--;s.crew-=troops;                                                          // 人立刻离开能战池，直到 finishBattle 才分流回整补/养伤
  const session={targetId,leaderIds:ids,troops,tactic,hq:!decisive&&isHomeHQ(s,targetId),stage:1,momentum:0,ratio:power/defPower,power,defPower,losses:0,enemyLoss:0,outcome:"",mods,log:[],decisive,
    split:splitTroops(s,ids,troops,split||{}),rows:rows||{},round:0,status:{us:{},them:{}},converted:0,bribed:0,events:[]};
  session.units=buildBattleUnits(s,session);
  const c=battleCtx(s,session,rng);
  session.units.forEach(u=>u.skills.forEach(id=>{const k=SKILLS[id];if(k?.start)c.cast(u,id,()=>k.start(c,u))}));
  session.events=c.ev;battleTally(s,session);session.momentum=0;
  const bribes=c.ev.filter(e=>e.k==="bribe").map(e=>`${session.units.find(u=>u.key===e.a)?.name}砸了钱，${session.units.find(u=>u.key===e.b)?.name}手下 ${e.n} 个人临阵换了边。`);
  if(bribes.length)session.log.push({name:"开战前",text:bribes.join("")});
  s.battleSession=session;
  return session;
}

// 号令牌。纯函数：同一 (s,session) 永远返回同样的牌，刷新后才能按存档重建手牌。
// 压上/稳住两张恒在（自动战斗依赖 hold 恒在），头目带来的牌按 priority 取前 2，第二段起多一张「撤」。
// mult 是本段我方出手的倍率，casualtyMult 只影响我方真正折损的人数（不影响战力对比）。
function lineupOfficer(s,session,id){const o=session.leaderIds.includes(id)?officer(s,id):null;return o&&o.side==="player"&&!o.injured?o:null}
function stageOptions(s,session){
  const zk=lineupOfficer(s,session,"zhaokui");
  const out=[
    {id:"press",speaker:zk?"赵魁":"",text:zk?"「压上去，别给他们喘气」":"压上去",effect:"出手+15% · 折损多三成",mult:zk?1.15+zk.stats.force/1200:1.15,casualtyMult:1.3},
    {id:"hold",speaker:"",text:"稳住阵型",effect:"出手照常 · 折损少一成半",mult:1,casualtyMult:.85}
  ];
  out.push(...officerProposals(s,session).slice().sort((a,b)=>(b.priority||0)-(a.priority||0)).slice(0,2));
  if(session.stage>=2)out.push({id:"withdraw",speaker:lineupOfficer(s,session,"sumanqing")?"苏曼青":"",text:"鸣金收兵",effect:"保住剩下的人，此战作罢",mult:1,casualtyMult:0});
  return out;
}
// 效果按属性缩放，不是固定值——否则杂鱼说客和程野没区别。
// priority 决定被截断时谁先留下，必须两两不同：
// backdoor 5（每块地只能用一次）＞ duel 4（每场一次）＞ parley 3（需势>10）＞ flank 2 ＞ supply 1.5 ＞ rearguard 1
function officerProposals(s,session){
  const out=[],sm=lineupOfficer(s,session,"sumanqing"),cy=lineupOfficer(s,session,"chengye");
  if(sm&&session.stage<=2&&sm.stats.scheme>=70)
    out.push({id:"flank",speaker:"苏曼青",text:"「他们左翼是空的」",effect:`出手+${Math.round(sm.stats.scheme/9)}% · 折损少一成`,mult:1+sm.stats.scheme/900,casualtyMult:.9,priority:2});
  if(lineupOfficer(s,session,"weixiaolou")&&!s.intel[session.targetId])
    out.push({id:"backdoor",speaker:"魏小楼",text:"「后门我一直留着」",effect:"出手+12% · 当场摸清驻防",mult:1.12,casualtyMult:1,priority:5});
  if(cy&&session.momentum>10)          // 势＝双方剩余战力比例之差×100，领先一成就算占住了上风
   
    out.push({id:"parley",speaker:"程野",text:"「让我去喊一嗓子」",effect:"出手−12% · 胜则收编对方的人，但这块地不服你",mult:.88,casualtyMult:1,convert:cy.stats.charm/260,priority:3});
  if(lineupOfficer(s,session,"yerong")&&session.stage<=2)
    out.push({id:"supply",speaker:"叶蓉",text:"「退路和粮草我安排好了」",effect:"折损少四分之一",mult:1,casualtyMult:.75,priority:1.5});
  const dc=session.mods.dueled?null:duelChallenger(s,session);
  if(dc&&duelTarget(s,session))
    out.push({id:"duel",speaker:dc.name,text:"「那个人交给我」",effect:"单挑：胜则重创对方一路，败则受伤",mult:1,casualtyMult:1,priority:4});
  if(lineupOfficer(s,session,"aqi")&&session.stage>=2)
    out.push({id:"rearguard",speaker:"阿七",text:"「我来断后」",effect:"折损少一成半 · 阿七成长更快",mult:1,casualtyMult:.85,priority:1});
  return out;
}
// 对手取敌方未受伤头目里武力最高者，并要求 force>=60——否则全局只有韩彪算猛将，单挑几乎不会出现。
// 中环挂在「港城同盟」名下，而同盟本身没有任何头目：这里让已被打散的三家龙头到同盟的地界上压最后一阵。
function duelTarget(s,session){
  const owner=s.territories[session.targetId].owner,live=factionLeaders(s,owner).filter(o=>o.stats.force>=60);
  const pool=live.length?live:owner==="coalition"?s.officers.filter(o=>o.side==="defeated"&&o.injured<=0&&o.stats.force>=60):[];
  return pool.slice().sort((a,b)=>b.stats.force-a.stats.force)[0]||null;
}
function duelChallenger(s,session){return["hanbiao","zhaokui","xiejiu"].map(id=>lineupOfficer(s,session,id)).filter(Boolean).sort((a,b)=>b.stats.force-a.stats.force)[0]||null}
function resolveDuel(s,session,rng){
  const me=duelChallenger(s,session),foe=duelTarget(s,session);
  if(!me||!foe)return"";
  session.mods.dueled=true;                                        // 一场血拼只能单挑一次，否则 multRest 会连乘
  let p=.5+(me.stats.force-foe.stats.force)/200;
  if(lineupOfficer(s,session,"hanbiao"))p+=.15;                    // 韩彪「顶门硬骨」：压住对方猛将
  p=clamp(p,.15,.85);
  const hurt=(key,k)=>{const u=session.units?.find(x=>x.key===key||x.id===key);if(u&&!u.out){u.str*=k;u.hp*=k;if(u.str<u.max*ROUT_AT)u.out=true}};
  if(chance(p,rng)){foe.injured=rand(1,3,rng);session.mods.multRest*=1.25;me.merit+=8;hurt(foe.id,.6);return`${me.name}把${foe.name}逼到了墙角。`}
  me.injured=rand(1,3,rng);session.mods.multRest*=.85;change(s,"morale",-5);hurt("u_"+me.id,.7);
  return`${me.name}没能压住${foe.name}，被抬了下去。`;
}
function stageSummary(s,session,opt,before,c){
  const nameOf=k=>session.units.find(u=>u.key===k)?.name||"";
  const casts=[...new Set(c.ev.filter(e=>e.k==="cast").map(e=>`${nameOf(e.a)}「${skillLabel(e.skill,e.tier)}」`))].slice(0,3);
  const routs=c.ev.filter(e=>e.k==="rout").map(e=>nameOf(e.b));
  const who=opt.speaker||session.units.find(u=>u.side==="us"&&!u.out)?.name||s.name;
  const head=opt.id==="press"?`${who}让队伍整个压了上去。`:opt.id==="hold"?"队伍一段一段往前挪，没人脱队。":`${who}的安排开始起作用。`;
  const lost=session.losses-before.losses,elost=session.enemyLoss-before.enemyLoss;
  return`${head}${casts.length?casts.join("、")+"。":""}${routs.length?routs.join("、")+"那一路散了。":""}本段我方折损 ${lost} 人，对面倒下 ${elost} 人。`;
}
function applyStageChoice(s,optionId,rng=Math.random){
  const session=s.battleSession;if(!session)throw new Error("no battle in progress");
  if(!(session.stage>=1&&session.stage<=3))throw new Error("battle already finished");
  if(!Array.isArray(session.units))session.units=buildBattleUnits(s,session);    // 旧版存档里打到一半的仗：按当下阵容摆开
  const opt=stageOptions(s,session).find(o=>o.id===optionId);if(!opt)throw new Error("invalid option");
  if(opt.id==="withdraw"){session.outcome="retreat";battleTally(s,session);return{ended:true,report:finishBattle(s,rng)}}
  const name=STAGE_NAMES[session.stage-1];let extra="";
  if(opt.id==="press")session.mods.pressed=true;
  if(opt.id==="backdoor"){s.intel[session.targetId]=true;extra=`魏小楼把${TERRITORY_DEFS[session.targetId].name}的真实驻防摊在了你面前。`}
  if(opt.id==="parley")session.mods.convertRate=opt.convert;
  if(opt.id==="rearguard"){const a=officer(s,"aqi");if(a)gainXP(a,6);session.mods.aqiRisk=true}
  const before={losses:session.losses,enemyLoss:session.enemyLoss};
  const c=battleCtx(s,session,rng);
  if(opt.id==="duel")extra=resolveDuel(s,session,rng);
  c.sideMult.us=(opt.mult??1)*session.mods.multRest*(1-CARD_SWING+rng()*CARD_SWING*2);
  c.casualty={us:opt.casualtyMult??1,them:1};
  for(let r=0;r<ROUNDS_PER_STAGE;r++){if(!c.alive("us").length||!c.alive("them").length)break;battleRound(c)}
  session.round=c.round;session.events=c.ev;
  battleTally(s,session);
  const lost=session.losses-before.losses;s.casualties+=lost;
  session.log.push({name,text:stageSummary(s,session,opt,before,c)+(extra?" "+extra:"")});
  session.stage++;
  const usDown=!c.alive("us").length,themDown=!c.alive("them").length;
  if(usDown||themDown||session.stage>3){session.outcome=themDown&&!usDown?"win":usDown?"loss":session.momentum>=0?"win":"loss";return{ended:true,report:finishBattle(s,rng)}}
  saveGame();return{ended:false,session};
}
// 开战前的胜算：用同一套引擎在不动存档的前提下空跑若干场。种子固定，同样的安排永远显示同样的把握。
function simulateBattleOdds(s,plan,runs=40){
  if(!plan.leaderIds?.length||!s.territories[plan.targetId])return null;
  const ids=plan.leaderIds.filter(id=>{const o=officer(s,id);return o&&o.side==="player"&&!o.injured});if(!ids.length)return null;
  const troops=clamp(Math.round(plan.troops),1,Math.max(1,s.crew)),est=estimateBattle(s,plan.targetId,ids,troops,plan.tactic,!!s.intel[plan.targetId]);
  let wins=0,loss=0;
  for(let i=0;i<runs;i++){
    let seed=strHash(plan.targetId)+i*7919;const rng=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
    const sess={targetId:plan.targetId,leaderIds:ids,troops,tactic:plan.tactic,power:est.power,defPower:est.def,split:splitTroops(s,ids,troops,plan.split||{}),rows:plan.rows||{},round:0,status:{us:{},them:{}},mods:{multRest:1},converted:0,bribed:0};
    sess.units=buildBattleUnits(s,sess);
    const c=battleCtx(s,sess,rng);sess.units.forEach(u=>u.skills.forEach(id=>{const k=SKILLS[id];if(k?.start)c.cast(u,id,()=>k.start(c,u))}));
    for(let st=0;st<3;st++){c.sideMult.us=(plan.tactic==="assault"?1.15:1)*(1-CARD_SWING+rng()*CARD_SWING*2);c.casualty={us:1,them:1};for(let r=0;r<ROUNDS_PER_STAGE;r++){if(!c.alive("us").length||!c.alive("them").length)break;battleRound(c)}if(!c.alive("us").length||!c.alive("them").length)break}
    battleTally(s,sess);const won=c.alive("us").length&&(!c.alive("them").length||sess.momentum>=0);if(won)wins++;loss+=sess.losses;
  }
  const p=wins/runs;
  return{p,losses:Math.round(loss/runs),ratio:est.ratio,label:p>=.8?"优势":p>=.45?"胶着":p>=.15?"凶险":"九死一生"};
}

function finishBattle(s,rng=Math.random){
  const session=s.battleSession;if(!session)return null;
  const {targetId,tactic,troops}=session,t=s.territories[targetId],oldOwner=t.owner;
  const won=session.outcome==="win",retreated=session.outcome==="retreat";
  // 出战的人在 startBattle 就离开了能战池，这里分三份收尾。阵亡的那部分永久消失——这是"打不起"的根源。
  const survivors=Math.max(0,session.troops-session.losses-(session.bribed||0)),woundedBack=Math.round(session.losses*(session.leaderIds.includes("yerong")?.75:.55));   // 被方景曜撬走的人不回来；叶蓉「后路」多救回两成
  // 打下来的地要留人看：幸存者里一半（至少 200 人）留在当地当驻防，不回老街。
  const garrison=won?Math.min(survivors,Math.max(GARRISON_MIN,Math.round(survivors*GARRISON_RATE))):0;
  s.regroup=(s.regroup||0)+survivors-garrison;s.wounded=(s.wounded||0)+woundedBack;
  const leaders=session.leaderIds.map(id=>officer(s,id)).filter(Boolean);
  const meritMult=won&&session.leaderIds.includes("tangji")?1.5:1;                 // 唐霁「唯能者居」
  s.battles++;s.lastBattleMonth=s.month;s.training=Math.max(0,(s.training||0)-8);
  if((s.flags.armsBoost||0)>0)s.flags.armsBoost--;
  change(s,"heat",won?8:retreated?3:5);
  const levelUps=[];leaders.forEach(o=>{o.battles++;o.merit+=Math.round((won?5:2)*meritMult);{const u=(session.units||[]).find(x=>x.side==="us"&&x.id===o.id),xp=4+(won?4:0)+Math.min(8,Math.round((u?.dealt||0)/(5*PEOPLE)))+Math.min(4,u?.casts||0);if(gainXP(o,xp))levelUps.push(`${o.name}升到 Lv${o.lv}`)}o.loyalty=clamp(o.loyalty+(won?2:-2));if(o.id==="aqi"){const k=pick(["force","command","scheme","charm"],rng);o.stats[k]=clamp(o.stats[k]+rand(1,2,rng),1,99)}});
  const injured=[];leaders.forEach(o=>{
    if(o.id==="player")return;
    if(o.injured>0){injured.push(o.name);return}                                 // 单挑当场受伤的也要写进战报
    const risk=(won?.08:retreated?.05:.18)+(o.id==="aqi"&&session.mods.aqiRisk?.15:0);   // 阿七断后更容易挂彩
    if(chance(risk,rng)){o.injured=rand(1,3,rng);injured.push(o.name)}
  });
  let captured=null;const beforeNet=monthlyNet(s),beforeCash=s.cash,beforeRep=s.rep;let honors=[];
  if(won){
    s.wins++;s.winStreak=(s.winStreak||0)+1;
    change(s,"morale",9);change(s,"rep",7+(mutOn(s,"crackdown")?2:0));change(s,"support",t.stability>=55?2:-2);
    addCash(s,Math.round(TERRITORY_DEFS[targetId].income*.8));
    const wasHQ=isHomeHQ(s,targetId);
    const busy=settlingTerritories(s).length;t.owner="player";t.guard=Math.max(10*PEOPLE,garrison);t.settling=Math.min(SETTLE_MAX,SETTLE_MONTHS+Math.round(busy*(TUNE.ss??1.25)));   // 摊子铺得越开，新地越难立稳
    t.stability=s.creed==="yi"?62:s.creed==="wei"?42:52;s.intel[targetId]=true;
    // 答应过散户"费只收一道"：兑现承诺的地界立稳得快
    if(oldOwner==="free"&&s.flags.freeGentle){t.stability=clamp(t.stability+12);change(s,"support",3)}
    rerollPosture(s,targetId,rng);
    // 拔掉堂口：本家其余地盘人心散了，驻防一起掉三成。
    if(wasHQ){const rest=hqFall(s,oldOwner,targetId);change(s,"rep",8);log(s,"good",`${FACTIONS[oldOwner].name}的堂口${TERRITORY_DEFS[targetId].name}被拔了。${rest.length?`${rest.map(x=>TERRITORY_DEFS[x].name).join("、")}的看场连夜散了三成。`:""}`)}
    // 威字流派：打赢一场，相邻敌方地盘也跟着发抖——速攻流的滚雪球资本。
    if(s.creed==="wei")TERRITORY_DEFS[targetId].neighbors.forEach(n=>{const nt=s.territories[n];if(nt.owner!=="player"&&nt.owner!=="coalition")nt.guard=Math.max(12*PEOPLE,nt.guard-2*PEOPLE)});
    // 劝降来的人终究是对家的旧部：地盘落到手里，街面上却不服你。义字流派压得住一些。
    if(session.mods.convertRate>0){t.stability=clamp(t.stability-10);const gain=Math.round(session.enemyLoss*session.mods.convertRate);if(gain>0){s.crew+=gain;log(s,"good",`程野把 ${gain} 名对方的人带回了老街，${TERRITORY_DEFS[targetId].name}一时还压不住。`)}}
    const joined=Math.round((session.converted||0)*(TUNE.cf??CONVERT_JOIN));if(joined>0){s.crew+=joined;log(s,"good",`阵前被劝下来的人里，有 ${joined} 个跟着回了老街。`)}
    const lts=factionLeaders(s,oldOwner).filter(o=>!["hewanshan","fangjingyao","guchangfeng"].includes(o.id));
    if(lts.length&&territoryCount(s,oldOwner)===0)captured=lts[0];
    log(s,"good",`和联胜拿下了${TERRITORY_DEFS[targetId].name}，伤${session.losses}人。`);
  }else{
    s.winStreak=0;
    if(retreated){
      if(!session.mods.retreatShield)change(s,"morale",-6);                        // 叶蓉在阵则不掉士气
      change(s,"rep",-2);
      if(session.mods.pressed)resent(s,"zhaokui",8);                               // 听了赵魁又收手
      log(s,"warn",`队伍从${TERRITORY_DEFS[targetId].name}撤了回来，折损${session.losses}人。`);
    }else{
      s.losses++;change(s,"morale",-10);change(s,"rep",-3);
      t.guard=Math.max(12*PEOPLE,t.guard-Math.round(session.enemyLoss*(TUNE.br??ENEMY_BREACH)));
      leaders.forEach(o=>o.resentment=clamp(o.resentment+2));
      log(s,"bad",`进攻${TERRITORY_DEFS[targetId].name}失利，折损${session.losses}人。`);
    }
    if(session.leaderIds.includes("xiejiu"))loyalty(s,"xiejiu",-6);                // 谢九败北忠诚共 -8
  }
  // 破口：只要打过一场，那扇门就得漏四个月。打输不再是白打，是买下了对面的失血期。
  if(oldOwner!=="player"){if(!s.breach)s.breach={};if(won)delete s.breach[targetId];else{s.breach[targetId]=s.month+4;log(s,"story",`${TERRITORY_DEFS[targetId].name}的门板换了三次，缺口一时补不回来。`)}}
  if(session.decisive)resolveDecisive(s,session,won,rng);
  if(won)honors=districtHonors(s);
  const report={repGain:s.rep-beforeRep,cashGain:Math.round((s.cash-beforeCash)*10)/10,netGain:Math.round((monthlyNet(s)-beforeNet)*10)/10,honors,survivors:survivors-garrison,garrison,woundedBack,targetId,targetName:TERRITORY_DEFS[targetId].name,oldOwner,leaders:session.leaderIds.slice(),troops,tactic,won,outcome:session.outcome,losses:session.losses,enemyLoss:session.enemyLoss,injured,captured:captured?.id||null,ratio:session.ratio,momentum:session.momentum,stages:session.log.slice(),events:session.events||[],units:(session.units||[]).map(u=>({key:u.key,side:u.side,id:u.id,name:u.name,hp:Math.round(u.hp),hp0:u.hp0,out:u.out})),bribed:session.bribed||0,converted:session.converted||0,levelUps};
  if(levelUps.length)log(s,"good",`${levelUps.join("，")}。`);
  s.lastBattle=report;s.battleSession=null;
  if(won){markStyle(s,s.creed,1);checkFactionDefeat(s,oldOwner,captured);checkVictory(s)}
  saveGame();return report;
}

// ---- 终局决战 · 玩家侧「雾港最后一张桌」 ----
// 只剩一家而玩家又占优时，逐块去磨五个 300 驻防不是战役，是罚站。终局应该在一个决策点上结束。
function factionTerritories(s,f){return Object.keys(s.territories).filter(id=>s.territories[id].owner===f)}
function decisiveDefPower(s,f){return (factionTerritories(s,f).reduce((a,id)=>a+s.territories[id].guard,0)*.45+factionLeaders(s,f).reduce((a,o)=>a+leaderScore(o),0))*diff(s).battle}
function decisivePrep(s){let b=0;
  Object.keys(s.breach||{}).forEach(id=>{if(breachActive(s,id))b+=.08});
  Object.keys(s.blockade||{}).forEach(id=>{if(blockadeActive(s,id))b+=.08});
  b+=.08*Math.min(3,s.flags.turncoatWins||0);
  if(s.support>=60)b+=.1;
  return Math.round(b*100)/100}
function decisiveTarget(s,f){const ids=factionTerritories(s,f),att=ids.filter(id=>attackableTerritories(s).includes(id));return (att.length?att:ids).slice().sort((a,b)=>s.territories[b].guard-s.territories[a].guard)[0]}
function decisiveReady(s){if(s.ended||s.battleSession)return null;const alive=aliveAIFactions(s);if(alive.length!==1)return null;const f=alive[0];
  if(ownTerritories(s).length<Math.ceil(TERRITORY_TOTAL*.75)||ownTerritories(s).length<territoryCount(s,f))return null;
  if(Number.isFinite(s.flags.decisiveOffered)&&s.flags.decisiveOffered&&s.month-s.flags.decisiveOffered<6)return null;
  return f}
function annexFaction(s,f,gentle){factionTerritories(s,f).forEach(id=>{const t=s.territories[id];t.owner="player";t.settling=0;t.stability=gentle?66:56;t.guard=gentle?t.guard:Math.max(24*PEOPLE,Math.round(t.guard*.5));delete (s.postures||{})[id];delete s.breach[id];delete s.blockade[id];s.intel[id]=true})}
function decisivePeaceCost(s,f){return territoryCount(s,f)*40}
// 和局：义字流派或高声望才递得成。名录照收，只是文案里写清楚这一统是谈下来的。
function decisivePeace(s,f){const cost=decisivePeaceCost(s,f);if(s.cash<cost)return false;addCash(s,-cost);annexFaction(s,f,true);s.peaceUnified=true;change(s,"rep",15);markStyle(s,"yi",3);
  log(s,"good",`${FACTIONS[f].name}把印放在了桌上。这一次，没有人再死。`);checkFactionDefeat(s,f,null);endGame(s,"unified");return true}
function resolveDecisive(s,session,won,rng){const f=session.decisive;
  if(won){annexFaction(s,f,false);change(s,"rep",20);change(s,"morale",12);log(s,"good",`${FACTIONS[f].name}全境易帜。雾港最后一张桌上，只剩一副碗筷。`);checkFactionDefeat(s,f,null);endGame(s,"unified");return}
  // 败不判死：总攻是一次可以再来的豪赌，但要付得起的代价——最外沿两块地和三成人手。
  const far=distanceFrom("old_street"),lost=ownTerritories(s).filter(id=>id!=="old_street").sort((a,b)=>(far[b]||0)-(far[a]||0)).slice(0,2);
  lost.forEach(id=>{const t=s.territories[id];t.owner=f;t.guard=Math.max(30*PEOPLE,Math.round(t.guard*.8));t.settling=0;rerollPosture(s,id,rng);delete (s.governors||{})[id]});
  drainCrew(s,Math.round(totalCrew(s)*.3));change(s,"morale",-14);change(s,"rep",-6);s.flags.decisiveOffered=s.month;
  log(s,"bad",`总攻没能压过去。${lost.map(id=>TERRITORY_DEFS[id].name).join("、")||"外沿"}在退潮里丢了，半年之内谈不了第二次。`)}
function offerDecisive(s,f){s.flags.decisiveOffered=s.month;
  const target=decisiveTarget(s,f),prep=decisivePrep(s),canPeace=Object.entries(s.style).sort((a,b)=>b[1]-a[1])[0][0]==="yi"||s.rep>=70,peaceCost=decisivePeaceCost(s,f);
  const L=ownedOfficers(s).filter(o=>!o.injured&&!isGovernor(s,o.id)).sort((a,b)=>leaderScore(b)-leaderScore(a)).slice(0,3).map(o=>o.id);
  enqueue({title:"雾港最后一张桌",portrait:factionLeaders(s,f)[0]?.portrait||"assets/player.webp",body:
    `<p>地图上只剩两种颜色了。${FACTIONS[f].name}还占着 <b>${territoryCount(s,f)}</b> 块地，你占着 <b>${ownTerritories(s).length}</b> 块。</p>`+
    `<p>苏曼青把账簿推过来：<span class='dialogue'>“再一块一块地啃，啃到你我都老了。这种局面只有一种收法——把所有筹码推上桌，一次。”</span></p>`+
    `<p>眼下的准备度：<b>+${Math.round(prep*100)}%</b>（围困、内线与人心的总和）。</p>`,options:[
    option("发起总攻","一场决定雾港的血拼",()=>{if(s.ap<1)s.ap=1;const troops=Math.max(10*PEOPLE,Math.round(s.crew*.95));
      if(s.crew<10*PEOPLE||!L.length){toast("人手不足以发起总攻");s.flags.decisiveOffered=s.month;return}
      startBattle(s,{targetId:target,leaderIds:L,troops,tactic:"assault",decisive:f,cashIn:Math.min(200,Math.floor(s.cash*.5))});renderAll()},"danger"),
    ...(canPeace&&s.cash>=peaceCost?[option("递茶递到底",`现金-${peaceCost}万，兵不血刃收编`,()=>{decisivePeace(s,f)},"gold")]:[]),
    option("再等半年","搁置，半年后重新上桌",()=>{log(s,"story","茶凉了，话没说完。半年之内，两家都在攒最后一口气。")})
  ]},"最后一张桌")}

// ---- 终局决战 · AI 侧「兵临老街」 ----
// 一家吃到八块地，就会来摘祖堂的招牌。警讯必须早一个月到——那一个月是给玩家整备用的。
function siegeCandidate(s){return aliveAIFactions(s).find(f=>territoryCount(s,f)>=Math.ceil(TERRITORY_TOTAL*.55)&&!(s.siegeDone||{})[f])}
function maybeSiegeWarn(s){if(s.ended||s.month<29||s.siegeWarn)return null;const f=siegeCandidate(s);if(!f)return null;
  s.siegeWarn={faction:f,month:s.month+1};log(s,"bad",`${FACTIONS[f].name}在各堂口点人。苏曼青说，下个月就是冲老街来的。`);return f}
// 攻方必须走小标度（与「敌对反扑」同级，见 README 的两套标度）：对方倾巢而出，也不可能把八块地的看场全带到老街。
// 用 Σ驻防 的大标度算，八块地的一家能凑出 700 战力，而玩家的天花板才 200 上下——那不是决战，是处刑。
function siegePower(s,f){return (38+territoryCount(s,f)*13+s.month*.7)*PEOPLE*SIEGE_SCALE*diff(s).battle}
// 守家不挑人：整补中的人手在自家门口也能上街，只有伤号留在诊所。老街的驻防这一夜值一倍半。
function siegeDefense(s){const guards=ownedOfficers(s).filter(o=>!o.injured);
  let def=(s.crew+(s.regroup||0))*(.82+s.morale*.0048)+guards.reduce((a,o)=>a+leaderScore(o),0)+(owns(s,"old_street")?s.territories.old_street.guard*1.5:0);
  if(s.support>=60)def*=1.12;                                                        // 街坊帮着堵巷子
  return def}
function resolveSiege(s,rng=Math.random){const w=s.siegeWarn;if(!w||w.month!==s.month||s.ended)return null;
  s.siegeWarn=null;const f=w.faction;if(!s.siegeDone)s.siegeDone={};s.siegeDone[f]=s.month;
  if(!aliveAIFactions(s).includes(f)||!owns(s,"old_street"))return null;
  const atk=siegePower(s,f)*(.9+rng()*.2);
  const guards=ownedOfficers(s).filter(o=>!o.injured);
  const def=siegeDefense(s),ratio=def/atk;
  // 三档而不是两档：守城战一旦是纯粹的硬币，死战难度会变成「AI 吃到八块地即通知你可以关游戏了」（实测 24/24 全灭）。
  // 中间那档是「门顶住了，家底没了」——足够惨，但下个月还有下个月。
  const held=ratio>=1,routed=ratio<.72;
  const losses=drainCrew(s,Math.max(4*PEOPLE,Math.round((held?.18:routed?.34:.5)*totalCrew(s))));
  s.casualties+=losses;s.lastBattleMonth=s.month;
  const body=`<p>天没亮，${FACTIONS[f].name}的车队从三个方向压进老街。第一段在街口，铁闸被撞开的声音传到了祖堂。</p>`+
    `<p>第二段在祠堂前的空地。${guards[0]?esc(guards[0].name):"留守的人"}把队伍钉在原地，谁也没有往后退半步。</p>`+
    (held?`<p>第三段打到天亮。对方的人在巷口挤成一团，进不来也退不出去——街坊把板车、鱼箱和门板全推了出来。撤退的号子响起时，祖堂的招牌还在原处。</p><p>本役折损 ${losses} 人。${FACTIONS[f].name}这一趟押上了全部家底，回去的路上，他们的各处堂口都空了。</p>`
     :routed?`<p>第三段没有打完。人手在天亮前就散了，祖堂的门被从外面推开。父亲留下的那本蓝色账簿，摊在地上没有人捡。</p><p>本役折损 ${losses} 人。</p>`
     :`<p>第三段打成了一团烂仗。天亮时对方退了，不是因为打不过，是因为再打下去两家都要绝户。</p><p>本役折损 ${losses} 人——一半的家底。祖堂的门板还立着，后面已经没剩几个人。</p>`);
  if(held){factionTerritories(s,f).forEach(id=>{s.territories[id].guard=Math.max(20*PEOPLE,Math.round(s.territories[id].guard*.6))});
    const far=distanceFrom("old_street"),edge=factionTerritories(s,f).filter(id=>!TERRITORY_DEFS[id].final).sort((a,b)=>(far[b]||0)-(far[a]||0))[0];
    if(edge){const t=s.territories[edge];t.owner="free";t.guard=30*PEOPLE;t.stability=60;t.settling=0;rerollPosture(s,edge,rng);delete (s.governors||{})[edge]}
    change(s,"morale",15);change(s,"rep",12);change(s,"support",6);
    log(s,"good",`${FACTIONS[f].name}在老街碰得头破血流，全境驻防大损${edge?`，${TERRITORY_DEFS[edge].name}当场反了水`:""}。`)}
  else if(routed)log(s,"bad","老街失守。祖堂的门被从外面推开了。");
  else{const far=distanceFrom("old_street"),drop=ownTerritories(s).filter(id=>id!=="old_street").sort((a,b)=>(far[b]||0)-(far[a]||0))[0];
    if(drop){const t=s.territories[drop];t.owner=f;t.guard=Math.max(30*PEOPLE,Math.round(t.guard*.8));t.settling=0;rerollPosture(s,drop,rng);delete (s.governors||{})[drop]}
    change(s,"morale",-20);change(s,"rep",-8);change(s,"support",-6);s.territories.old_street.guard=Math.max(20*PEOPLE,Math.round(s.territories.old_street.guard*.6));
    log(s,"bad",`老街勉强顶住了，代价是一半的人手${drop?`和${TERRITORY_DEFS[drop].name}`:""}。`)}
  enqueue({title:held?"老街守住了":routed?"祖堂的门被推开了":"门顶住了，人没了",portrait:factionLeaders(s,f)[0]?.portrait||"assets/player.webp",body,
    options:[option(held?"把街口的板车收回来":routed?"没有下一个月":"从头再攒一次","",()=>{})]},"兵临老街");
  if(routed)endGame(s,"crushed");
  return{faction:f,held,routed,losses}}

// ---- 加时的代价与最后一页 ----
// 拖延本身开始付费：六十个月之后，每半年这座城就变一次脸，账面越拖越紧。
function eraTick(s){if(s.month<=MAX_MONTHS||s.month%6!==0)return false;
  s.eraDecay=Math.round((s.eraDecay||1)*.95*1000)/1000;s.heatFloor=(s.heatFloor||0)+8;change(s,"heat",8);
  log(s,"warn","雾港的风向又变了一次。生意更难做，外面盯着的眼睛更多。");return true}

// 无头/自动战斗：三段全选 hold。既有测试沿用它，也是平衡回归夹具。
function resolveBattle(s,plan,rng=Math.random){
  startBattle(s,plan,rng);
  while(s.battleSession)applyStageChoice(s,"hold",rng);
  return s.lastBattle;
}

function checkFactionDefeat(s,owner,captured){if(!["east","wan","long"].includes(owner)||territoryCount(s,owner)>0||s.factions[owner].defeated)return;s.factions[owner].defeated=true;const boss={east:"hewanshan",wan:"fangjingyao",long:"guchangfeng"}[owner],bossObj=officer(s,boss);if(bossObj)bossObj.side="defeated";addCash(s,20);s.crew+=12*PEOPLE;change(s,"rep",12);log(s,"good",`${FACTIONS[owner].name}失去所有地盘，人马开始归附。`);if(captured)queueCaptiveDecision(s,captured,owner);enqueue({title:`${FACTIONS[owner].name}的招牌被摘下`,portrait:bossObj?.portrait,body:`<p>${bossObj?.name||"对方老大"}坐在空掉的堂口里，桌上没有茶。<span class='dialogue'>“地没了，人心也散了。你爸那时候，没有你这么快。”</span></p><p>从今天起，${FACTIONS[owner].name}不再是雾港地图上的一种颜色。</p>`,options:[option("收下他们的人","人手+120；声望+12",()=>{})]},"社团吞并")}

function queueCaptiveDecision(s,captured,owner){enqueue({title:`${captured.name}把自己的位置放在桌上`,portrait:captured.portrait,body:`<p>${captured.name}没走。他看了一眼被摘下来的招牌：<span class='dialogue'>“地盘是你打下来的。我的人还在，你敢不敢用？”</span></p>`,options:[
    option("留原职，整队收编",`${captured.name}加入；忠诚较低；义+2`,()=>{captured.side="player";captured.loyalty=s.creed==="yi"?68:55;captured.resentment=15;markStyle(s,"yi",2);change(s,"morale",4)},"gold"),
    option("只收人，不留头目","人手+80；威+2",()=>{captured.side="exiled";s.crew+=8*PEOPLE;markStyle(s,"wei",2);change(s,"rep",3)}),
    option("给一笔钱让他离开雾港","现金-12万；减少后患",()=>{captured.side="exiled";addCash(s,-12);markStyle(s,"li",1)})
  ]},"战后收编")}

// ---- 敌方战略级扩张 ----
// 与 enemyAttack 的分工：enemyTurn 会真的让地盘易主（三家之间也互相吃），enemyAttack 只做消耗。
// 玩家不动手的话，三家会互相吞并，后期面对的可能是一个 5 块地的巨无霸——"什么时候动手"因此成为真决策。
const AI_FACTIONS=["east","wan","long"];
// ---- 堂口：三家的起家老巢 ----
// 只有原主人坐着才算堂口；被别家吃下来就只是一块普通的地。
const HQ_OF={east:"south_dock",wan:"golden_bay",long:"cheungsha"},HQ_TAKEN=TUNE.ht??.85,HQ_LOCK=3,HQ_FALL=.7;
function isHomeHQ(s,id){const d=TERRITORY_DEFS[id];return !!(d&&d.hq&&s.territories[id]&&s.territories[id].owner===d.owner)}
// 堂口的门要先把外围拔干净：本家还有 3 块以上别的地时不开放进攻。
function hqLocked(s,id){if(!isHomeHQ(s,id))return false;const f=s.territories[id].owner;return factionTerritories(s,f).filter(x=>x!==id).length>=HQ_LOCK}
function hqFall(s,f,id){const rest=factionTerritories(s,f).filter(x=>x!==id);rest.forEach(x=>{s.territories[x].guard=Math.max(12*PEOPLE,Math.round(s.territories[x].guard*HQ_FALL))});return rest}
function effectiveGuard(s,id){const t=s.territories[id];return t.guard*(t.settling>0?.7:1)}   // 驻防期的地盘守不住，这是扩张的代价
// 每月至多一家出手（ambition 最高者），只有出手的那家归零，其余保留累积值等下月——
// 否则被压住的一家会永远轮不到，地图就死了。
function pickAmbitiousFaction(s,rng=Math.random,accumulate=true){
  if(accumulate)AI_FACTIONS.forEach(f=>{const n=territoryCount(s,f);if(n)s.factions[f].ambition=(s.factions[f].ambition||0)+(1+n*.5)*diff(s).enemyGrowth});
  const ready=AI_FACTIONS.filter(f=>(s.factions[f].ambition||0)>=10&&territoryCount(s,f)>0);
  if(!ready.length)return null;
  // 平局要随机破，不能靠 AI_FACTIONS 的书写顺序——开局三家 ambition 完全相同，
  // 按数组顺序取的话东潮会永远先手，实测 5/5 局都是东潮会一家独大，地图不再有变数。
  return ready.map(f=>({f,w:(s.factions[f].ambition||0)+rng()}))
    .sort((a,b)=>b.w-a.w)[0].f;
}
// 地图是个星形：三家各据一条辐条，彼此并不接壤，只共享老街和中环两个枢纽。
// 所以中环必须允许 AI 攻取——否则"三家互相吞并"在几何上根本不可能发生（实测 60 个月零次易主）。
// 抢到中环的那家会同时与所有人接壤，"拖到后期要面对一个巨无霸"由此成立；
// 玩家的终局之战也还在——checkVictory 要求占满 8 块地，中环无论落在谁手里都得打下来。
// 老街则排除：祖堂失守＝当场结束这一局，那种结局应该来自经济崩盘或 enemyAttack，而不是一次战略掷骰。
function truceActive(s,f){return Number.isFinite((s.truces||{})[f])&&s.truces[f]>=s.month}
function incitedAgainstAI(s,f){return s.incited&&s.incited.faction===f&&s.incited.until>=s.month}
function enemyExpansionTarget(s,f,rng=Math.random){
  const seen=new Set(),out=[];
  Object.keys(s.territories).filter(id=>s.territories[id].owner===f)
    .forEach(id=>TERRITORY_DEFS[id].neighbors.forEach(n=>{if(s.territories[n].owner!==f&&!seen.has(n)){seen.add(n);out.push(n)}}));
  // 在两个最弱目标里随机挑一个，而不是永远打最弱的那块——否则 AI 会像制导导弹一样
  // 每次都精准锤玩家刚打下来、驻防最薄的那块地，玩家会觉得被针对而不是被围攻。
  // 停战期内该家不碰玩家的地；被挑拨的那家只盯着其他社团咬。
  let ranked=out.filter(id=>id!=="old_street");
  if(truceActive(s,f)||incitedAgainstAI(s,f))ranked=ranked.filter(id=>s.territories[id].owner!=="player");
  // 散户联保：开局头几个月三家都在消化自己的摊子，不碰散户地界——这是玩家抢缓冲区的窗口期。
  if(s.month<6)ranked=ranked.filter(id=>s.territories[id].owner!=="free");
  // AI 的战略扩张主要冲着散户和同行去；玩家的地盘只有约四分之一的概率被列为战略目标——
  // 否则新占地会陷入"你占我夺"的永久拉锯（实测 90 个月 74 胜仍只有 3 块地）。
  // 对玩家的持续骚扰由 enemyAttack（敌对反扑）负责，那套数值是按玩家防御调的。
  // 缓手冷却：刚从玩家手里夺过地的三个月内，战略目标避开玩家——
  // 连续两次战略打击会把玩家推进无法翻盘的雪崩（也是"被针对感"的主要来源）。
  const nonPlayer=ranked.filter(id=>s.territories[id].owner!=="player");
  if(nonPlayer.length&&((s.aiPityUntil||0)>=s.month||!chance(diff(s).aiOnPlayer??.25,rng)))ranked=nonPlayer;
  ranked.sort((a,b)=>effectiveGuard(s,a)-effectiveGuard(s,b));
  return ranked.length?pick(ranked.slice(0,2),rng):null;
}
function enemyTurn(s,rng=Math.random,accumulate=true){
  if(s.ended)return null;
  const f=pickAmbitiousFaction(s,rng,accumulate);if(!f)return null;
  s.factions[f].ambition=0;
  const targetId=enemyExpansionTarget(s,f,rng);if(!targetId)return null;
  const t=s.territories[targetId],defender=t.owner;
  // 标度必须和守方同一个量级：守方是 驻防*1.18*1.15 + 两名头目，一块 82 驻防的地盘约 145 点。
  // 旧式的 地盘数*16 只有 32 点，AI 永远打不动任何人——实测 60 个月零次易主。
  // 两套攻击标度：打 AI/散户用大标度（对面驻防 850~1700）；打玩家用反扑级的小标度——
  // 玩家地盘驻防只有 30~60，用大标度等于必胜，扩张会变成永久拉锯。
  const atk=defender==="player"
    ?(38+Math.min(territoryCount(s,f),8)*12+Math.min(s.month,60)*.5)*PEOPLE*diff(s).battle*(.75+rng()*.5)
    :((territoryCount(s,f)*71+s.month*.6)*PEOPLE+factionLeaders(s,f).reduce((a,o)=>a+leaderScore(o),0)*.8)*diff(s).battle*(.75+rng()*.5);
  const defLeaders=defender==="player"?ownedOfficers(s).filter(o=>!o.injured).sort((a,b)=>leaderScore(b)-leaderScore(a)).slice(0,2):factionLeaders(s,defender).slice(0,2);
  const def=(effectiveGuard(s,targetId)*1.18*1.15+defLeaders.reduce((a,o)=>a+leaderScore(o),0))/(isHomeHQ(s,targetId)?HQ_TAKEN:1)+(defender==="player"?s.morale*.22*PEOPLE:0);   // 1.15 守方加成：防止 AI 滚雪球滚到玩家无法翻盘
  // 散户联保：动散户会惊动警方和街坊，AI 每次出手只有约三成半把握——
  // 散户带因此消耗 AI 的行动机会，而玩家用正规血拼吃散户不受此限。
  const won=defender==="free"?chance(.35,rng):atk>def,name=TERRITORY_DEFS[targetId].name;
  if(!won){if(defender!=="free")t.guard=Math.max(12*PEOPLE,t.guard-rand(2,5,rng)*PEOPLE);log(s,"story",defender==="free"?`${FACTIONS[f].name}想收${name}的保护费，被街坊联保顶了回去。`:`${FACTIONS[f].name}想吃下${name}，没能啃动。`);return{faction:f,targetId,defender,won:false}}
  const tookHQ=isHomeHQ(s,targetId);t.owner=f;t.guard=Math.round(t.guard*.7)+18*PEOPLE;if(tookHQ&&AI_FACTIONS.includes(defender))hqFall(s,defender,targetId);t.stability=50;t.settling=0;rerollPosture(s,targetId,rng);delete (s.governors||{})[targetId];
  if(defender==="player"){
    s.aiPityUntil=s.month+3;                            // 缓手冷却：三个月内战略目标避开玩家
    change(s,"rep",-6);change(s,"morale",-7);s.casualties+=drainCrew(s,Math.max(3*PEOPLE,Math.round(totalCrew(s)*.08)));
    log(s,"bad",`${FACTIONS[f].name}从和联胜手里夺走了${name}。`);
    enqueue({title:`${name}被${FACTIONS[f].name}夺走`,portrait:factionLeaders(s,f)[0]?.portrait||"assets/player.webp",
      body:`<p>这不是一次试探。${FACTIONS[f].name}备足了人手，直接压到${name}的门口。</p><p>等老街的援手赶到，招牌已经换了。</p>`,
      options:[option("这笔账记下了","",()=>{})]},"地盘易主");
  }else{
    log(s,"story",`${FACTIONS[f].name}吞下了${FACTIONS[defender].name}的${name}。`);
    if(territoryCount(s,defender)===0&&s.factions[defender]&&!s.factions[defender].defeated){
      s.factions[defender].defeated=true;
      const boss=officer(s,{east:"hewanshan",wan:"fangjingyao",long:"guchangfeng"}[defender]);
      if(boss)boss.side="defeated";
      log(s,"story",`${FACTIONS[defender].name}的招牌被${FACTIONS[f].name}摘了下来。`);
      enqueue({title:`${FACTIONS[defender].name}没能撑到你动手`,portrait:boss?.portrait||"assets/player.webp",
        body:`<p>${FACTIONS[f].name}吃下了${FACTIONS[defender].name}的最后一块地。雾港的桌上从此少了一个人，也少了一个可以借力的人。</p><p><span class='dialogue'>“他们吞得越快，轮到我们的时候就越难。”</span></p>`,
        options:[option("知道了","",()=>{})]},"雾港变局");
    }
  }
  return{faction:f,targetId,defender,won:true};
}

// 没轮到扩张的社团也要有动作——月报"雾港动向"栏由此而来，地图不再是静止的背景板。
function aiFlavor(s,acted,rng=Math.random){
  const lines=[];
  aliveAIFactions(s).filter(f=>!acted.includes(f)).forEach(f=>{
    const roll=rng();
    if(roll<.4){
      const own=Object.keys(s.territories).filter(id=>s.territories[id].owner===f).sort((a,b)=>s.territories[a].guard-s.territories[b].guard)[0];
      if(own){s.territories[own].guard+=4*PEOPLE;lines.push(`${FACTIONS[f].name}在${TERRITORY_DEFS[own].name}厉兵秣马，驻防加厚了。`)}
    }else if(roll<.7)lines.push(`${FACTIONS[f].name}的人在散户地界和码头茶楼间频繁走动。`);
    else lines.push(`${FACTIONS[f].name}按兵不动，像是在等一个价钱。`);
  });
  return lines;
}

// ---- 月度盘点：结束本月后的第一个弹窗 ----
// 账面、人手回流、三家动向、账房提醒，一屏讲清"这个月雾港发生了什么"。
function monthlyReportModal(s,eco,rec,moves,harass,flavor,disorderLines=[],siege=null){
  const lines=[];
  moves.filter(Boolean).forEach(m=>{const name=TERRITORY_DEFS[m.targetId].name;
    lines.push(m.won?`${FACTIONS[m.faction].name}攻占了${FACTIONS[m.defender]?.name||"无主"}的${name}。`:`${FACTIONS[m.faction].name}对${name}出了手，被顶了回去。`)});
  if(harass)lines.push(harass.held?`${FACTIONS[harass.attacker].name}反扑${TERRITORY_DEFS[harass.targetId].name}，守住了（折损${harass.losses}人）。`:`${TERRITORY_DEFS[harass.targetId].name}在${FACTIONS[harass.attacker].name}的反扑中失守（折损${harass.losses}人）。`);
  if(siege)lines.push(siege.held?`${FACTIONS[siege.faction].name}倾巢来攻老街，被挡了回去（折损${siege.losses}人）。`:siege.routed?`${FACTIONS[siege.faction].name}攻破了老街（折损${siege.losses}人）。`:`${FACTIONS[siege.faction].name}压到了祖堂门口，门顶住了，家底折了一半（折损${siege.losses}人）。`);
  lines.push(...(disorderLines||[]));
  lines.push(...flavor);
  const warns=[];
  aliveAIFactions(s).forEach(f=>{if((s.factions[f].ambition||0)>=8)warns.push(`${FACTIONS[f].name}正在集结人手，近期恐有动作。`)});
  if(s.heat>=60)warns.push("外部压力逼近警戒线，警队随时可能进场。");
  if(s.support<45)warns.push("街坊人心浮动，码头有停工的风声。");
  if(s.siegeWarn)warns.push(`${FACTIONS[s.siegeWarn.faction].name}在各堂口点人——下个月就是冲老街来的。把能站的人都留在家里。`);
  const sieged=Object.keys(s.territories).filter(id=>siegeDrain(s,id)>0);
  if(sieged.length)warns.push(`${sieged.map(id=>TERRITORY_DEFS[id].name).join("、")}正在失血：围困期内对方补不上人，这几个月是打进去的窗口。`);
  const st=settlingTerritories(s);if(st.length)warns.push(`${st.map(id=>TERRITORY_DEFS[id].name).join("、")}尚未站稳：收入减半，也容易被反夺。`);
  const freeLeft=Object.keys(s.territories).filter(id=>s.territories[id].owner==="free").length;
  if(freeLeft&&s.month>=4)warns.push(`散户地界还剩 ${freeLeft} 处。三家迟早伸手，先下手的先得纵深。`);
  return{title:`第${s.month}月 · 雾港月报`,portrait:CHARACTER_DEFS.sumanqing.portrait,body:
    `<div class="report-block"><b>账面</b><p>收入 ${eco.gross}万 · 支出 ${eco.upkeep}万 · 净 <span class="${eco.net>=0?"rep-pos":"rep-neg"}">${eco.net>=0?"+":""}${eco.net}万</span>，现金 ${Math.round(s.cash)}万。</p></div>`+
    `${(s.businessNews||[]).length?`<div class="reward-slip"><b>生意喜讯</b>${s.businessNews.map(x=>`<p>${esc(x)}</p>`).join("")}</div>`:""}<div class="report-block"><b>人手</b><p>${rec.back+rec.healed>0?`${rec.back} 人整补归队、${rec.healed} 人伤愈。`:"没有人员回流。"}${rec.inflow?`各处地盘有 ${rec.inflow} 人来投奔。`:""}当前能战 ${s.crew} · 整补 ${s.regroup} · 养伤 ${s.wounded}。</p></div>`+
    `<div class="report-block"><b>雾港动向</b>${(lines.length?lines:["本月暂无动向。"]).map(x=>`<p>${esc(x)}</p>`).join("")}</div>`+
    (warns.length?`<div class="report-block warn"><b>苏曼青的提醒</b>${warns.map(x=>`<p>${esc(x)}</p>`).join("")}</div>`:""),
    options:[option("知道了","开始新的一个月",()=>{})]};
}

// 驻防数值由 tests/balance.test.mjs 的三种玩家画像扫描定出（缩放系数 1.55），不是拍脑袋：
//   莽夫(只打优势)标准 18 月 / 死战 38 月 63%通关；稳健(攒够才打)标准 37 月 100%；躺平必亡。
// 老街 44 是祖堂的底线——低于此值，卡在一块地的玩家会被 enemyAttack 直接磨死，实测 16/16 灭亡。
// 成长与上限都随该家地盘数放大：做大的势力防线要跟着变厚，否则玩家滚起雪球之后再无对手。
// 只在低于上限时增长——一家被打残后地盘变少、上限下降，不应该反过来让它的驻防缩水。
// 围困期的地盘不长只掉：这是「打输也算进展」的全部实现。
// 上限再减失序折扣——七块地的一家从 300 降到 256，仍然厚，但不再高过玩家的天花板。
function enemyCap(s,id){const t=s.territories[id],own=territoryCount(s,t.owner);return Math.round(Math.max(60,(TERRITORY_DEFS[id].final?232:90+own*18)-factionDisorder(s,t.owner)*14)*PEOPLE*(isHomeHQ(s,id)?(TUNE.hc??2.5):1))}
function enemyGrowth(s){Object.entries(s.territories).forEach(([id,t])=>{if(t.owner==="player")return;const drain=siegeDrain(s,id);
  if(drain){t.guard=Math.max(30*PEOPLE,t.guard-drain);return}
  // 孤城：外围被拔光的堂口断了财路，不再长人，每月还要散掉 4% 的人。
  if(isHomeHQ(s,id)&&territoryCount(s,t.owner)===1){t.guard=Math.max(30*PEOPLE,Math.round(t.guard*(1-(TUNE.hd??.04))));return}
  const cap=enemyCap(s,id),add=Math.max(1,Math.round((1+TERRITORY_DEFS[id].income/18)*(1+territoryCount(s,t.owner)*.25)*diff(s).enemyGrowth*(mutOn(s,"customs")?.85:1)*(isHomeHQ(s,id)?(TUNE.hg??2):1)))*PEOPLE;if(t.guard<cap)t.guard=Math.min(cap,t.guard+add)})}
// 标记到期就清，别让存档里堆一地过期的围困。
function pruneSiege(s){["breach","blockade"].forEach(k=>{if(!s[k]||typeof s[k]!=="object")s[k]={};Object.keys(s[k]).forEach(id=>{if(!(s[k][id]>=s.month))delete s[k][id]})})}
function enemyAttack(s,rng=Math.random){if(s.month<6||s.month%3!==0||!chance(diff(s).enemyAttack,rng))return null;const targets=ownTerritories(s).filter(id=>id!=="old_street"&&TERRITORY_DEFS[id].neighbors.some(n=>{const o=s.territories[n].owner;return o!=="player"&&o!=="free"&&!truceActive(s,o)&&!incitedAgainstAI(s,o)}));const oldStreetAvailable=owns(s,"old_street")&&TERRITORY_DEFS.old_street.neighbors.some(n=>s.territories[n].owner!=="player");if(!targets.length&&oldStreetAvailable)targets.push("old_street");if(!targets.length)return null;const targetId=pick(targets,rng),enemyNeighbor=TERRITORY_DEFS[targetId].neighbors.map(id=>({id,owner:s.territories[id].owner})).find(x=>x.owner!=="player"&&x.owner!=="free"&&!truceActive(s,x.owner)&&!incitedAgainstAI(s,x.owner)),attacker=enemyNeighbor?.owner||"coalition",t=s.territories[targetId],defenders=ownedOfficers(s).filter(o=>!o.injured).sort((a,b)=>leaderScore(b)-leaderScore(a)).slice(0,2);const attackPower=(38+Math.min(territoryCount(s,attacker),8)*12+Math.min(s.month,60)*.5)*PEOPLE*diff(s).battle*(.85+rng()*.3),defPower=effectiveGuard(s,targetId)*1.15+defenders.reduce((a,o)=>a+leaderScore(o),0)+s.morale*.22*PEOPLE,held=defPower>=attackPower,losses=drainCrew(s,Math.max(2*PEOPLE,Math.round((held?.06:.13)*totalCrew(s))));s.casualties+=losses;change(s,"morale",held?4:-8);change(s,"heat",4);if(held){t.guard=Math.max(12*PEOPLE,t.guard-rand(2,6,rng)*PEOPLE);log(s,"good",`${FACTIONS[attacker].name}反扑${TERRITORY_DEFS[targetId].name}，被留守人马挡了回去。`)}else{t.owner=attacker;t.guard=20*PEOPLE;t.stability=58;rerollPosture(s,targetId,rng);delete (s.governors||{})[targetId];change(s,"rep",-7);log(s,"bad",`${TERRITORY_DEFS[targetId].name}在反扑中失守。`)}const report={targetId,attacker,held,losses};enqueue({title:held?`反扑被挡在${TERRITORY_DEFS[targetId].name}`:`${TERRITORY_DEFS[targetId].name}失守`,portrait:factionLeaders(s,attacker)[0]?.portrait||"assets/player.webp",body:`<p>${FACTIONS[attacker].name}从外线压向${TERRITORY_DEFS[targetId].name}。${held?"留守头目撑到了援手赶到，对方没能迈过最后一道门。":"驻防连续求援，但人手赶到之前，招牌已经被摘下来。"}</p><p>本次折损 ${losses} 人。</p>`,options:[option(held?"守住了":"这笔账会讨回来","",()=>{})]},"敌对反扑");if(!held&&targetId==="old_street")endGame(s,"lost");return report}

// 血拼进行中不得再花行动点：月度推进已经被挡住了，行动点却还能照花，属于同一个漏洞的另一半。
function applyAction(s,id,rng=Math.random){const a=ACTIONS.find(x=>x.id===id);if(!a||s.ap<1||(s.usedActions[id]||0)>=a.max)return false;if(s.battleSession){toast("先把这场血拼打完");return false}if(a.canRun&&!a.canRun(s)){toast(lockedTextOf(a,s)||"当前条件不足");return false}s.ap--;s.usedActions[id]=(s.usedActions[id]||0)+1;a.run(s,rng);s.lastAction={name:a.name,text:s.log[0]?.text||"这个月做了一件事。"};saveGame();renderAll();return true}

function maybeUnlockNamed(s){if(s.month>=2&&!s.flags.aqiUnlocked&&!hasOfficer(s,"aqi")){s.flags.aqiUnlocked=true;enqueue({title:"老街口那个年轻人又来了",portrait:CHARACTER_DEFS.aqi.portrait,body:"<p>他叫阿七，连续三天坐在祖堂对面的台阶上。程野问他想要什么，他朝你的方向抬了抬下巴：<span class='dialogue'>“想看看他怎么把丢掉的东西拿回来。”</span></p>",options:[option("让他去招募页等着","解锁成长型人物阿七",()=>{change(s,"support",2)},"gold")]},"人才来投")}
  if((s.cash>=45||owns(s,"west_market"))&&!s.flags.yeUnlocked&&!hasOfficer(s,"yerong"))s.flags.yeUnlocked=true;
  if(s.wins>=3&&!s.flags.xieUnlocked&&!hasOfficer(s,"xiejiu"))s.flags.xieUnlocked=true;
}

function chooseRandomEvent(s,rng=Math.random){const valid=RANDOM_EVENTS.filter(e=>!s.flags[`event_${e.id}`]&&(!e.condition||e.condition(s)));if(!valid.length)return null;const e=pick(valid,rng);s.flags[`event_${e.id}`]=true;return{title:e.title,portrait:e.portrait,body:e.body,options:e.options(s)}}
// ---- 周期性危机：压力、民心与联盟长出牙齿 ----
function crisisReady(s,id,cooldown){const last=(s.crisisCooldowns||{})[id];return !(Number.isFinite(last)&&s.month-last<cooldown)}
function markCrisis(s,id){if(!s.crisisCooldowns)s.crisisCooldowns={};s.crisisCooldowns[id]=s.month}
function checkCrises(s,rng=Math.random){
  if(s.ended)return;
  // ① 大扫荡：外部压力的牙齿。顶到75，警队就会真的进场。
  if(s.heat>=75&&crisisReady(s,"sweep",8)){
    markCrisis(s,"sweep");
    const brutal=mutOn(s,"crackdown"),fine=Math.round((14+ownTerritories(s).length*3)*(brutal?1.4:1));
    enqueue({title:"警队的车停满了老街两头",portrait:CHARACTER_DEFS.sumanqing.portrait,body:`<p>动静太大了。清晨五点，警队封住了老街两头，挨家挨户地查。${brutal?"严打之年，他们连祖堂后院都翻了一遍。":""}</p><p>苏曼青压低声音：<span class='dialogue'>“这阵子，要么破财，要么伤人。”</span></p>`,options:[
      option("花钱平事",`现金-${fine}万；压力大降`,()=>{addCash(s,-fine);change(s,"heat",-30);markStyle(s,"li",1);log(s,"warn","一笔钱送了出去，警队的车第二天就撤了。")}),
      option("交几个人出去顶罪","人手-80；压力大降；人心↓",()=>{const took=drainCrew(s,8*PEOPLE);change(s,"heat",-35);change(s,"support",-8);change(s,"morale",-6);markStyle(s,"wei",1);log(s,"bad",`${took}个人替和联胜进去了。老街上没人说话。`)},"danger"),
      option("硬扛过去","本月生意大损；可能有人被带走",()=>{addCash(s,-Math.round(monthlyGross(s)*.6));const took=drainCrew(s,rand(4,9,rng)*PEOPLE);s.casualties+=took;change(s,"heat",-15);change(s,"morale",-4);log(s,"bad",`风头最紧的一个月：生意停了大半，${took}个人被带走了。`)},"danger")
    ]},"警队扫荡");
  }
  // ② 罢工：民心的牙齿。地盘攥得多、街坊却不服，码头就会停摆。
  if(s.support<40&&ownTerritories(s).length>=3&&crisisReady(s,"strike",10)){
    markCrisis(s,"strike");
    enqueue({title:"码头的吊机停在了半空",portrait:CHARACTER_DEFS.yerong.portrait,body:"<p>工头们把家伙放下了。不是为了钱——是这条街的人不想再替一个不把他们当人的社团扛包。</p>",options:[
      option("涨工钱、赔到位","现金-15万；人心+15",()=>{addCash(s,-15);change(s,"support",15);change(s,"morale",4);markStyle(s,"yi",2);log(s,"good","吊机重新转起来那天，有人朝祖堂的方向点了点头。")}),
      option("换一批肯干的人","本月收入减半；压力+8",()=>{addCash(s,-Math.round(monthlyGross(s)*.5));change(s,"heat",8);change(s,"support",-5);markStyle(s,"wei",2);log(s,"bad","码头换了人，货照走，但老街的门关得更早了。")},"danger")
    ]},"罢工");
  }
  // ③ 同盟施压：结盟后的三家不再各自为战，每6个月上一次桌。
  if(s.flags.coalition&&aliveAIFactions(s).length>=2&&crisisReady(s,"coalitionPress",6)){
    markCrisis(s,"coalitionPress");
    const tribute=Math.round(12+ownTerritories(s).length*2);
    enqueue({title:"三家一起递来了一张单子",portrait:CHARACTER_DEFS.guchangfeng.portrait,body:`<p>单子上是一个数：<b>${tribute}万</b>。名义是“港口公摊”。顾长风的人在门口等答复。</p><p><span class='dialogue'>“交了，这个季度大家相安无事。不交，那就是你先掀的桌。”</span></p>`,options:[
      option("交这笔钱",`现金-${tribute}万；换一季安稳`,()=>{addCash(s,-tribute);change(s,"rep",-3);aliveAIFactions(s).forEach(f=>s.factions[f].ambition=Math.max(0,(s.factions[f].ambition||0)-6));markStyle(s,"li",1);log(s,"story","钱送了出去。桌子暂时没人掀。")}),
      option("把单子撕了","声望+6；三家扩张意愿大增",()=>{change(s,"rep",6);aliveAIFactions(s).forEach(f=>s.factions[f].ambition=(s.factions[f].ambition||0)+7);markStyle(s,"wei",2);log(s,"warn","单子被撕成四片从二楼飘下去。楼下的人记住了。")},"danger")
    ]},"同盟施压");
  }
}

// ---- 章节转折：给60个月一个"幕"的结构 ----
function checkChapter(s){
  if(s.ended)return;
  if(s.month===12&&!s.flags.act1Done){s.flags.act1Done=true;
    enqueue({title:"接印一年，祖堂重新上了漆",portrait:"assets/player.webp",body:`<p>一年了。和联胜没有倒，这件事本身就让雾港重新排了座次。年关的祖堂里，三名旧部等你说今年的路怎么走。</p>`,options:[
      option("“把人心攒厚”","全员忠诚+6；人心+5",()=>{ownedOfficers(s).forEach(o=>o.loyalty=clamp(o.loyalty+6));change(s,"support",5);markStyle(s,"yi",2)}),
      option("“把刀磨快”","士气+10；整训+10",()=>{change(s,"morale",10);s.training=clamp((s.training||0)+10,0,30);markStyle(s,"wei",2)}),
      option("“把账做大”","现金+15万",()=>{addCash(s,15);markStyle(s,"li",2)},"gold")
    ]},"第一幕终");}
  if(s.month===24&&!s.flags.act2Done){s.flags.act2Done=true;
    enqueue({title:"中环换了管事的人",portrait:CHARACTER_DEFS.fangjingyao.portrait,body:`<p>港城同盟的新管事上任第一件事：所有码头生意重新“注册”。这是收钱，也是摸底——每一家的斤两，从此都摆在了台面上。</p>`,options:[
      option("照章注册","现金-12万；压力-10",()=>{addCash(s,-12);change(s,"heat",-10);markStyle(s,"li",1);log(s,"story","该交的交了。同盟的册子上，和联胜写在了第一页。")}),
      option("我的地界我做主","压力+10；声望+8",()=>{change(s,"heat",10);change(s,"rep",8);markStyle(s,"wei",2);log(s,"warn","注册表被原样退了回去。中环记下了这个名字。")},"danger")
    ]},"第二幕启");}
  if(s.month===36&&!s.flags.act3Done){s.flags.act3Done=true;
    const alive=aliveAIFactions(s);
    if(alive.length){enqueue({title:"雾港夜宴，桌上有你一副碗筷",portrait:CHARACTER_DEFS.guchangfeng.portrait,body:`<p>还站着的几家龙头约在金湾酒楼。名义是过节，实际上每个人都想当面掂一掂对方的斤两。去，是入局；不去，是宣战。</p>`,options:[
      option("赴宴","看清各家底细：全部相邻敌地情报",()=>{attackableTerritories(s).forEach(id=>s.intel[id]=true);change(s,"rep",4);log(s,"good","一顿饭吃了三个钟。你记住了每个人夹菜的手是稳是抖。")},"gold"),
      option("退了请帖","士气+8；各家警觉",()=>{change(s,"morale",8);alive.forEach(f=>s.factions[f].ambition=(s.factions[f].ambition||0)+5);markStyle(s,"wei",2);log(s,"warn","空着的那副碗筷，比任何话都响。")})
    ]},"第三幕启")}}
  if(s.month===48&&!s.flags.act4Done){s.flags.act4Done=true;
    enqueue({title:"苏曼青合上账簿：该收官了",portrait:CHARACTER_DEFS.sumanqing.portrait,body:`<p>她把五年的账摊在桌上：打过的仗、收的人、丢过的地。<span class='dialogue'>“雾港的牌就剩最后几张了。你是想赢，还是想赢得漂亮？”</span></p>`,options:[
      option("稳住阵脚，步步为营","全地盘驻防+80",()=>{ownTerritories(s).forEach(id=>s.territories[id].guard+=8*PEOPLE);log(s,"good","每块地都加了夜班。收官阶段，不给任何人翻盘的缝。")}),
      option("倾力一搏","士气+12；整训+12；现金-10万",()=>{change(s,"morale",12);s.training=clamp((s.training||0)+12,0,30);addCash(s,-10);log(s,"good","祖堂的灯连亮了七夜。所有人都知道决战近了。")},"gold")
    ]},"终幕前夜");}
}

function checkPromises(s){if(s.flags.warPromise&&s.month>s.flags.warPromise&&s.lastBattleMonth<s.flags.warPromise-2){s.flags.warPromise=0;loyalty(s,"zhaokui",-14);resent(s,"zhaokui",18);change(s,"morale",-8);log(s,"bad","你没有兑现对赵魁的开战承诺。")}}
function officerTension(s,rng=Math.random){ownedOfficers(s).filter(o=>o.id!=="player").forEach(o=>{if(o.resentment>=70&&o.loyalty<45&&chance(.2,rng)){o.side="defected";const took=drainCrew(s,8*PEOPLE);change(s,"morale",-10);log(s,"bad",`${o.name}带着${took}个人离开了和联胜。`)}else if(o.loyalty<35)change(s,"morale",-1)})}

// rng 必须贯通到所有 AI 掷骰：平衡测试靠固定种子锁曲线，
// 任何一处漏用 Math.random，同一种子的两次运行就会分岔（实测稳健档通关数在 6~19 之间摇摆）。
function advanceMonth(s,force=false,rng=Math.random){if(s.battleSession){toast("先把这场血拼打完");return false}if(s.ended)return false;if(s.ap>0&&!force){enqueue({title:"本月还有行动点",body:`<p>还剩 <b>${s.ap}</b> 个行动点。它们不会带到下个月。</p>`,options:[option("继续安排","回到议事堂",()=>{}),option("直接进入下月","放弃剩余行动点",()=>setTimeout(()=>advanceMonth(s,true),80),"danger")]},"时间确认");return false}
  s.month++;s.ap=3;s.usedActions={};s.lastAction=null;
  modalHold=true;                                    // 本月的弹窗先攒着，月报必须第一个弹
  const rec=recoverCrew(s);enterpriseTick(s);tickSettling(s,rng);governorTick(s);rec.inflow=monthlyInflow(s);
  if(s.flags.loanBusiness){addCash(s,4);change(s,"support",-1)}
  if(mutOn(s,"customs")||mutOn(s,"smuggle"))change(s,"heat",1);
  eraTick(s);recordEnterpriseEarnings(s);const eco=applyEconomy(s);checkInsolvency(s);
  // 伤病对所有人愈合：单挑会打伤敌将，而 factionLeaders 过滤 injured<=0，
  // 不让敌将痊愈会永久断掉战后收编那条线（韩彪/魏小楼从此再也招不到）。
  s.officers.forEach(o=>{if(o.injured>0){o.injured--;if(o.injured===0&&o.side==="player")log(s,"good",`${o.name}伤愈回到了祖堂。`)}});
  // 对家的头目也在长：每满一年，各家能打的人涨一级。
  if(s.month>0&&s.month%12===0)enemyYearUp(s);
  change(s,"morale",Math.round((58-s.morale)*.18));change(s,"heat",-2);if(s.heatFloor&&s.heat<s.heatFloor)s.heat=clamp(s.heatFloor);
  refreshRecruitMarket(s,rng);enemyGrowth(s);pruneSiege(s);const disorderLines=disorderTick(s,rng);
  // NPC 每月必有动作：一家扩张（第10个月起可能两家），没轮到的做小动作进月报。
  const moves=[enemyTurn(s,rng)];
  if(s.month>=10&&!s.ended)moves.push(enemyTurn(s,rng,false));
  maybeUnlockNamed(s);checkPromises(s);officerTension(s,rng);
  // 决战月不再走「敌对反扑」：同一个月里两场攻城，叙事和数值都会打架。
  const siege=resolveSiege(s,rng);
  const harass=siege||s.ended?null:enemyAttack(s,rng);
  if(!s.ended&&!siege)maybeSiegeWarn(s);
  const flavor=s.ended?[]:aiFlavor(s,moves.filter(Boolean).map(m=>m.faction),rng);
  // 停战与离间到期只做清理；危机、章节与事件链在弹窗队列里排在敌情之后。
  Object.keys(s.truces||{}).forEach(f=>{if(s.truces[f]<s.month){delete s.truces[f];log(s,"story",`与${FACTIONS[f].name}的停战到期了。刀又可以出鞘了——双方都是。`)}});
  if(s.incited&&s.incited.until<s.month)s.incited=null;
  checkCrises(s,rng);checkChapter(s);pumpSchedule(s);
  const finalFoe=decisiveReady(s);if(finalFoe)offerDecisive(s,finalFoe);
  // 老街在反扑里失守会当场结束这一局，别再往队列里塞这个月的剧情弹窗。
  if(s.ended){modalHold=false;saveGame();renderAll();pumpModal();return true}
  // 月报插到队首：玩家先看全局，再逐条处理这个月的事。
  modalQueue.unshift({...monthlyReportModal(s,eco,rec,moves,harass,flavor,disorderLines,siege),kicker:"月度盘点"});
  if(s.month===4&&!s.flags.fatherRetired){s.flags.fatherRetired=true;enqueue({title:"沈振海最后一次走进祖堂",portrait:CHARACTER_DEFS.father.portrait,body:"<p>他比上个月更瘦，却自己走完了从门口到主位的路。他没有坐，只把蓝色旧账簿放在你的位置上。<span class='dialogue'>“以后这扇门，我不进了。”</span></p><p>赵魁低下头，苏曼青合上笔，程野替他拉开了门。父亲没有回头。</p>",options:[option("起身送他到门口","三名旧部忠诚+5；义+2",()=>{["zhaokui","sumanqing","chengye"].forEach(id=>loyalty(s,id,5));markStyle(s,"yi",2)}),option("留在主位上","声望+5；威+2",()=>{change(s,"rep",5);markStyle(s,"wei",2)})]},"父亲退场")}
  if(s.month%2===0){const e=chooseRandomEvent(s,rng);if(e)enqueue(e,"雾港事件")}
  if(ownTerritories(s).length>=Math.ceil(TERRITORY_TOTAL*.45)&&!s.flags.coalition){s.flags.coalition=true;enqueue({title:"三家桌上出现了同一张地图",portrait:CHARACTER_DEFS.guchangfeng.portrait,body:"<p>顾长风把东潮会和万盛堂的人约到了一张桌上。地图中间，和联胜的颜色已经占了快一半。<span class='dialogue'>“再让他吃两块，下一个被拆招牌的就在这张桌上。”</span></p>",options:[option("让他们结盟","敌方反攻更快；和联胜声望+10",()=>{change(s,"rep",10);change(s,"morale",6)})]},"港城联盟")}
  if(s.month===MAX_MONTHS&&!s.flags.sixtyMonths){s.flags.sixtyMonths=true;enqueue({title:"父亲留下的日历翻过了十年",portrait:"assets/player.webp",body:`<p>十年前，你只有一条老街。现在和联胜控制着 <b>${ownTerritories(s).length}</b> 块地盘。</p><p>十年只是一个节点。中环还没有升起你的招牌，这场仗就不算打完。</p><p class="dialogue">苏曼青把账簿合上：“雾港的风向要变了。往后生意难做，盯着的人也多。”</p>`,options:[option("继续打到一统雾港","士气+8",()=>{change(s,"morale",8)},"gold")]},"十年之期")}
  checkVictory(s);modalHold=false;saveGame();renderAll();pumpModal();return true
}

function checkVictory(s){if(ownTerritories(s).length===Object.keys(s.territories).length)endGame(s,"unified")}
function endingTitle(s){if(s.endingReason==="lost")return"父业尽失";if(s.endingReason==="bankrupt")return"账断人散";
  if(s.endingReason==="crushed")return"祖堂易主";if(s.endingReason==="faded")return"退出雾港";
  if(s.endingReason==="halfharbor")return"半壁雾港";if(s.endingReason==="warlord")return"割据一方";const max=Object.entries(s.style).sort((a,b)=>b[1]-a[1])[0]?.[0];if(max==="yi"&&ownedOfficers(s).filter(o=>o.loyalty>=70).length>=6)return"义字盟主";if(max==="wei")return"雾港枭雄";if(max==="li")return"地下皇帝";return"雾港话事人"}
// 结局不能抢在弹窗前面显示：终局之战的战报是在 endGame 之后才入队的，
// 而这个月早先排上的剧情弹窗此刻已经作废（它们还会改写已结束的存档）。
// 所以：清掉旧队列，把结局挂起，等队列彻底排空再由 pumpModal 揭晓。
function endGame(s,reason){if(s.ended)return;s.ended=true;s.endingReason=reason;saveGame();recordLeaderboard(s);if(typeof document==="undefined")return;modalQueue.length=0;pendingEnding=s;setTimeout(flushEnding,0)}
function flushEnding(){if(!pendingEnding||modalBusy||modalQueue.length)return false;const s=pendingEnding;pendingEnding=null;showEnding(s);return true}

let S=null,creatorCreed="yi",creatorDifficulty="standard",creatorMutators=[],prologueIndex=0,modalQueue=[],modalBusy=false,modalHold=false,pendingEnding=null,saveErrorNotified=false,battleDraft={targetId:"",leaderIds:[],troops:20*PEOPLE,tactic:"steady",split:{},rows:{}};
const $=id=>typeof document!=="undefined"?document.getElementById(id):null;

// 场景照片路径写成字面量，build_single.py 才会把它们打进单文件版。
const SCENES={hall:"assets/scene-hall.webp",street:"assets/scene-street.webp",pier:"assets/scene-pier.webp"};
const SCENE_BY_KICKER={"父亲退场":"hall","第一幕终":"hall","第二幕启":"hall","第三幕启":"hall","终幕前夜":"hall","十年之期":"hall","最后一张桌":"hall","委任主政":"hall","战后收编":"hall","人才来投":"hall","人才招募":"hall","讲数":"hall","旧事回响":"hall","月度盘点":"street","雾港事件":"street","警队扫荡":"street","罢工":"street","同盟施压":"street","港城联盟":"street","雾港变局":"street","社团吞并":"street","经营账本":"street","血拼战报":"pier","鸣金收兵":"pier","敌对反扑":"pier","兵临老街":"pier","地盘易主":"pier","离间":"pier","内应":"pier"};
function enqueue(decision,kicker="雾港事件"){if(!decision)return;modalQueue.push({...decision,kicker});if(!modalHold)pumpModal()}
function pumpModal(){if(typeof document==="undefined"||modalBusy)return;if(!modalQueue.length){flushEnding();return}const d=modalQueue.shift();modalBusy=true;$("modalKicker").textContent=d.kicker||"雾港事件";const scene=d.scene||SCENE_BY_KICKER[d.kicker||"雾港事件"],sw=$("modalSceneWrap");if(sw){if(scene){$("modalScene").src=assetUrl(SCENES[scene]);sw.classList.remove("hidden")}else sw.classList.add("hidden")}$("modalTitle").textContent=d.title||"";$("modalBody").innerHTML=d.body||"";const wrap=$("modalPortraitWrap");if(d.portrait){$("modalPortrait").src=assetUrl(d.portrait);wrap.classList.remove("hidden")}else wrap.classList.add("hidden");$("modalOptions").innerHTML=(d.options||[option("知道了","",()=>{})]).map((o,i)=>`<button class="option-btn ${o.tone||""}" data-option="${i}"><b>${esc(o.text)}</b><span>${esc(o.effect||"")}</span></button>`).join("");$("modalOptions").querySelectorAll("[data-option]").forEach(btn=>btn.addEventListener("click",()=>{const o=d.options?.[Number(btn.dataset.option)];try{o?.apply?.()}finally{$("modalMask").classList.add("hidden");modalBusy=false;saveGame();renderAll();setTimeout(pumpModal,70)}}));$("modalMask").classList.remove("hidden")}
function toast(text){const el=$("toast");if(!el)return;el.textContent=text;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),1700)}

// ---- 排行榜：一统雾港者按用时排座次 ----
// 与存档分开存放：删档重开不清榜。只收录一统（unified）的战役，用时越短名次越前，
// 同用时先比难度（死战>艰难>标准），再比先来后到。按 runId 去重——结局页会被反复打开。
const LB_KEY="fog_harbor_boss_leaderboard_v1";
const DIFF_ORDER={brutal:3,hard:2,standard:1};
function loadLeaderboard(){if(typeof localStorage==="undefined")return[];try{const l=JSON.parse(localStorage.getItem(LB_KEY)||"[]");return Array.isArray(l)?l.filter(e=>e&&typeof e==="object"&&Number.isFinite(e.months)&&e.months>0):[]}catch{return[]}}
function sortLeaderboard(list){return list.slice().sort((a,b)=>a.months-b.months||(DIFF_ORDER[b.difficulty]||0)-(DIFF_ORDER[a.difficulty]||0)||String(a.date||"").localeCompare(String(b.date||"")))}
function rankOf(list,runId){const i=sortLeaderboard(list).findIndex(e=>e.runId===runId);return i<0?null:i+1}
function recordLeaderboard(s){
  if(typeof localStorage==="undefined"||typeof localStorage.setItem!=="function"||s.endingReason!=="unified")return null;
  const list=loadLeaderboard();
  if(list.some(e=>e.runId===s.runId))return rankOf(list,s.runId);
  list.push({runId:s.runId,name:s.name,months:s.month+1,difficulty:s.difficulty,creed:s.creed,mutators:(s.mutators||[]).slice(),wins:s.wins,casualties:s.casualties,date:new Date().toISOString().slice(0,10)});
  const sorted=sortLeaderboard(list).slice(0,50);
  try{localStorage.setItem(LB_KEY,JSON.stringify(sorted))}catch(error){if(typeof console!=="undefined")console.error("[雾港] 排行榜写入失败",error)}
  return rankOf(sorted,s.runId);
}
function showLeaderboard(highlightRunId){
  const list=sortLeaderboard(loadLeaderboard());
  const rows=list.map((e,i)=>`<tr class="${e.runId===highlightRunId?"lb-me":""}"><td>${i+1}</td><td>${esc(e.name)}</td><td><b>${e.months}</b> 月</td><td>${DIFFICULTIES[e.difficulty]?.name||"—"}</td><td>${CREEDS[e.creed]?.name||"—"}</td><td>${esc(e.date||"")}</td></tr>`).join("");
  enqueue({title:"雾港话事人名录",portrait:"assets/player.webp",
    body:list.length?`<p class="lb-note">只记一统雾港的战役。用时越短，名次越前；同用时先比难度。</p><div class="lb-scroll"><table class="lb-table"><thead><tr><th>名次</th><th>话事人</th><th>用时</th><th>难度</th><th>作风</th><th>日期</th></tr></thead><tbody>${rows}</tbody></table></div>`
    :"<p>名录还空着。雾港等的是第一个把三十六块招牌换完的人。</p>",
    options:[option("合上名录","",()=>{})]},"江湖名录");
}

function saveGame(){if(!S||typeof localStorage==="undefined")return false;try{localStorage.setItem(SAVE_KEY,JSON.stringify(S));saveErrorNotified=false;return true}catch(error){if(typeof console!=="undefined")console.error("[雾港] 本地存档失败",error);if(!saveErrorNotified){saveErrorNotified=true;toast("存档失败：本机存储空间可能不足")}return false}}
// 损坏的会话一律丢弃而不修补：人手是逐段扣的，存档在任何时刻都自洽，
// 丢掉最多只损失一块没打下来的地，绝不会凭空多人或少人。
function validBattleSession(s){
  const b=s.battleSession;
  if(!b||typeof b!=="object")return false;
  if(!TERRITORY_DEFS[b.targetId]||!s.territories[b.targetId])return false;
  if(!Number.isFinite(b.stage)||b.stage<1||b.stage>3)return false;
  if(!Number.isFinite(b.momentum)||!Number.isFinite(b.ratio)||!Number.isFinite(b.troops))return false;
  if(!b.mods||typeof b.mods!=="object"||!Array.isArray(b.log))return false;
  return Array.isArray(b.leaderIds)&&b.leaderIds.some(id=>{const o=officer(s,id);return o&&o.side==="player"});
}
// 旧存档人数按“十几个人”记：载入时统一放大到现行口径，进行中的对阵一起换算，战力比不变。
function migratePeopleScale(s){if(s.peopleScale===PEOPLE)return;const k=PEOPLE/(Number(s.peopleScale)||1),m=v=>Number.isFinite(v)?Math.round(v*k):v;
  ["crew","regroup","wounded","casualties"].forEach(f=>{s[f]=m(s[f])});
  Object.values(s.territories||{}).forEach(t=>{if(t&&typeof t==="object")t.guard=m(t.guard)});
  const b=s.battleSession;if(b&&typeof b==="object"){["troops","losses","enemyLoss","bribed","converted"].forEach(f=>{b[f]=m(b[f])});["power","defPower"].forEach(f=>{if(Number.isFinite(b[f]))b[f]*=k});
    if(b.split&&typeof b.split==="object")Object.keys(b.split).forEach(id=>{b.split[id]=m(b.split[id])});
    if(Array.isArray(b.units))b.units.forEach(u=>{["hp","hp0","str","max","w"].forEach(f=>{if(Number.isFinite(u[f]))u[f]*=k})})}
  if(s.lastBattle&&typeof s.lastBattle==="object")["troops","losses","enemyLoss","survivors","woundedBack"].forEach(f=>{s.lastBattle[f]=m(s.lastBattle[f])});
  s.peopleScale=PEOPLE}
function normalizeState(s){if(!s||typeof s!=="object"||s.version!==VERSION||typeof s.name!=="string"||!Array.isArray(s.officers)||!s.territories||!["old_street","south_dock","clocktower","shipyard","fishmarket","golden_bay","new_city","mall","west_market","north_yard","highway","fogvillage","whitesand","central_harbor"].every(id=>s.territories[id]&&typeof s.territories[id]==="object"))return null;migratePeopleScale(s);migrateLevels(s);if(!s.hqBoost){Object.keys(TERRITORY_DEFS).forEach(id=>{if(isHomeHQ(s,id))s.territories[id].guard=Math.round(s.territories[id].guard*2.5)});s.hqBoost=true}for(const [id,d] of Object.entries(TERRITORY_DEFS)){if(!s.territories[id])s.territories[id]={owner:s.ended&&s.endingReason==="unified"?"player":s.factions?.[d.owner]?.defeated?"free":d.owner==="player"?"free":d.owner,guard:d.guard,level:1,stability:65,settling:0};const t=s.territories[id];if(!INDUSTRIES[t.industry])t.industry="";t.enterpriseLevel=clamp(Math.floor(Number(t.enterpriseLevel)||0),0,3);t.building=clamp(Math.floor(Number(t.building)||0),0,2);if(!["balanced","growth","care"].includes(t.policy))t.policy="balanced";}s.flags={fatherRetired:false,aqiUnlocked:false,xieUnlocked:false,yeUnlocked:false,coalition:false,debtCrisisQueued:false,emergencyLoanTaken:false,decisiveOffered:0,turncoatWins:0,...(s.flags||{})};s.insolvencyMonths=Number.isFinite(s.insolvencyMonths)?Math.max(0,s.insolvencyMonths):0;
  // 弹窗队列只活在内存里：载入时一定没有待答的危机弹窗，所以这个标志必须归零。
  // 否则在危机弹窗开着时刷新，标志会以 true 落盘，checkInsolvency 从此永远直接返回。
  s.flags.debtCrisisQueued=false;
  s.winStreak=Number.isFinite(s.winStreak)?Math.max(0,s.winStreak):0;
  s.crew=Number.isFinite(s.crew)?Math.max(0,Math.round(s.crew)):0;
  s.regroup=Number.isFinite(s.regroup)?Math.max(0,Math.round(s.regroup)):0;
  s.wounded=Number.isFinite(s.wounded)?Math.max(0,Math.round(s.wounded)):0;
  // Part 2/3 新增的字段：老存档里没有，缺了会让 enemyTurn 和驻防期直接算出 NaN。
  AI_FACTIONS.forEach(f=>{const fs=s.factions&&s.factions[f];if(fs)fs.ambition=Number.isFinite(fs.ambition)?Math.max(0,fs.ambition):0});
  Object.keys(TERRITORY_DEFS).forEach(id=>{const t=s.territories[id];t.settling=Number.isFinite(t.settling)?clamp(Math.round(t.settling),0,SETTLE_MAX):0});
  // 可玩性扩展新增的字段：老存档没有，补默认值；姿态缺失的敌方地盘现场补掷。
  if(!s.postures||typeof s.postures!=="object")s.postures={};
  Object.keys(TERRITORY_DEFS).forEach(id=>{if(s.territories[id].owner!=="player"&&!POSTURES[s.postures[id]])s.postures[id]=INIT_POSTURES[id]||POSTURE_IDS[Object.keys(TERRITORY_DEFS).indexOf(id)%POSTURE_IDS.length];if(s.territories[id].owner==="player")delete s.postures[id]});
  if(!s.governors||typeof s.governors!=="object")s.governors={};
  Object.entries(s.governors).forEach(([tid,oid])=>{const o=s.officers.find(x=>x.id===oid);if(!s.territories[tid]||s.territories[tid].owner!=="player"||!o||o.side!=="player")delete s.governors[tid]});
  if(!s.truces||typeof s.truces!=="object")s.truces={};
  if(!s.incited||typeof s.incited!=="object"||!Number.isFinite(s.incited.until))s.incited=null;
  if(!Array.isArray(s.schedule))s.schedule=[];
  s.schedule=s.schedule.filter(x=>x&&Number.isFinite(x.month)&&CHAIN_STEPS[x.key]);
  if(!s.crisisCooldowns||typeof s.crisisCooldowns!=="object")s.crisisCooldowns={};
  if(!Array.isArray(s.mutators))s.mutators=[];
  s.mutators=s.mutators.filter(id=>MUTATORS[id]).slice(0,2);
  s.aiPityUntil=Number.isFinite(s.aiPityUntil)?s.aiPityUntil:0;
  // 破局机制新增的字段：老存档里没有，缺了会让围困、失序与加时结算算出 NaN 或直接抛错。
  s.flags.decisiveOffered=Number.isFinite(s.flags.decisiveOffered)?Math.max(0,s.flags.decisiveOffered):0;
  s.flags.turncoatWins=Number.isFinite(s.flags.turncoatWins)?Math.max(0,s.flags.turncoatWins):0;
  // 新档开局就带空表；没有这张表的是贺礼上线前的旧档，已经整区占着的不再补发。
  if(!Array.isArray(s.flags.districtHonors))s.flags.districtHonors=Object.entries(DISTRICTS).filter(([,d])=>d.territories.every(id=>s.territories[id]?.owner==="player")).map(([name])=>name);
  ["breach","blockade","siegeDone"].forEach(k=>{if(!s[k]||typeof s[k]!=="object")s[k]={};Object.keys(s[k]).forEach(id=>{if(!TERRITORY_DEFS[id]&&!FACTIONS[id]||!Number.isFinite(s[k][id]))delete s[k][id]})});
  if(!s.siegeWarn||typeof s.siegeWarn!=="object"||!Number.isFinite(s.siegeWarn.month)||!AI_FACTIONS.includes(s.siegeWarn.faction))s.siegeWarn=null;
  s.eraDecay=Number.isFinite(s.eraDecay)&&s.eraDecay>0?s.eraDecay:1;
  s.heatFloor=Number.isFinite(s.heatFloor)?clamp(s.heatFloor):0;
  s.peaceUnified=!!s.peaceUnified;
  // 出战的人在 startBattle 就离开了能战池。丢弃损坏的会话时不还人，他们就凭空蒸发了。
  if(!validBattleSession(s)){if(s.battleSession){s.regroup+=Math.max(0,Math.round(Number(s.battleSession.troops)||0));log(s,"warn","上一场血拼中断，队伍已经撤回老街整补。")}s.battleSession=null}
  return s}
function loadGame(){if(typeof localStorage==="undefined")return null;try{const raw=localStorage.getItem(SAVE_KEY),state=JSON.parse(raw||"null");if(state?.territories&&Object.keys(state.territories).length===14&&!localStorage.getItem(SAVE_KEY+"_before_18districts")){try{localStorage.setItem(SAVE_KEY+"_before_18districts",raw)}catch{toast("旧档备份空间不足，请先保留原版存档")}}return normalizeState(state)}catch{return null}}
function deleteSave(){if(typeof localStorage!=="undefined")localStorage.removeItem(SAVE_KEY)}

function monthDisplay(s,compact=false){const current=(s?.month||0)+1;return compact?`${current}月`:`第${current}月`}
function showMenu(){["creator","prologue","game","ending"].forEach(id=>$(id)?.classList.add("hidden"));$("menu")?.classList.remove("hidden");const saved=loadGame(),btn=$("continueBtn");if(saved){btn.classList.remove("hidden");btn.innerHTML=`继续 · ${esc(saved.name)} · ${monthDisplay(saved,true)} <span>→</span>`}else btn.classList.add("hidden")}
function showCreator(){$("menu").classList.add("hidden");$("creator").classList.remove("hidden");if(!creatorMutators.length)creatorMutators=rollMutators();renderMutatorRoll()}
function renderMutatorRoll(){const el=$("mutatorRoll");if(!el)return;el.innerHTML=creatorMutators.map(id=>`<div class="choice-card mutator-card"><b>${esc(MUTATORS[id].name)}</b><small>${esc(MUTATORS[id].desc)}</small></div>`).join("")}
function showGame(){if(!S){showMenu();toast("存档已失效，请重新开局");return false}["menu","creator","prologue","ending"].forEach(id=>$(id)?.classList.add("hidden"));$("game").classList.remove("hidden");if(S.ended){showEnding(S);return true}saveGame();renderAll();return true}
function renderPrologue(){const p=PROLOGUE[prologueIndex];$("prologuePortrait").src=assetUrl(p.portrait);$("prologueKicker").textContent=p.kicker;$("prologueTitle").textContent=p.title;$("prologueBody").innerHTML=p.body.map(x=>`<p>${x}</p>`).join("");$("prologueProgress").style.width=`${(prologueIndex+1)/PROLOGUE.length*100}%`;$("nextPrologueBtn").innerHTML=prologueIndex===PROLOGUE.length-1?"走进祖堂 <span>→</span>":"继续 <span>→</span>"}

function chapterInfo(s){const m=s.month;if(m<12)return["第一年 · 守住父业","守住父业"];if(m<30)return[`第${Math.floor(m/12)+1}年 · 吞并小势力`,"吞并小势力"];if(m<48)return[`第${Math.floor(m/12)+1}年 · 港城争霸`,"港城争霸"];return[`第${Math.floor(m/12)+1}年 · 一统江湖`,"一统江湖"]}
// 打完一仗能战人手会暴跌到个位数，若不标出整补/养伤，玩家会以为人凭空没了。
// 顶栏很窄：只放最要紧的两个数，总数与上限挂在 title 上，避免折成三行。
function crewBreakdownText(s){
  const parts=[];
  if(s.regroup>0)parts.push(`整补${s.regroup}`);
  if(s.wounded>0)parts.push(`<span class="hurt">养伤${s.wounded}</span>`);
  if(!parts.length)parts.push(`${totalCrew(s)}/${crewCap(s)}`);
  return parts.join(" ");
}
function renderAll(){if(!S||typeof document==="undefined")return;const [chapter,phase]=chapterInfo(S),net=monthlyNet(S);$("chapterText").textContent=chapter;$("phaseText").textContent=phase;$("monthText").textContent=monthDisplay(S);$("apText").textContent=`${S.ap} / 3`;$("apDots").innerHTML=[0,1,2].map(i=>`<i class="${i<S.ap?"":"spent"}"></i>`).join("");$("apDots").parentElement.title=`行动点 ${S.ap} / 3`;$("cashText").textContent=`${Math.round(S.cash)}万`;$("crewText").textContent=S.crew;$("crewBreakdown").innerHTML=crewBreakdownText(S);$("crewBreakdown").title=`能战 ${S.crew} · 整补 ${S.regroup} · 养伤 ${S.wounded} · 合计 ${totalCrew(S)}/${crewCap(S)}`;$("playerNameText").textContent=S.name;$("creedBadge").textContent=CREEDS[S.creed].name;$("territoryCount").textContent=`${ownTerritories(S).length} / ${TERRITORY_TOTAL}`;[["morale",S.morale],["rep",S.rep],["support",S.support],["heat",S.heat]].forEach(([k,v])=>{$(`${k}Text`).textContent=Math.round(v);$(`${k}Bar`).style.width=`${clamp(v)}%`});$("netIncomeText").textContent=`${net>=0?"+":""}${net}万`;$("netIncomeText").style.color=net>=0?"var(--green)":"var(--red)";$("incomeBreakdown").innerHTML=`<div class="income-item"><span>地盘总收入</span><b>+${monthlyGross(S)}万</b></div><div class="income-item neg"><span>人手、头目与产业</span><b>-${monthlyUpkeep(S)}万</b></div>`;$("mobileStatus").innerHTML=`<span>士气<b>${Math.round(S.morale)}</b></span><span>声望<b>${Math.round(S.rep)}</b></span><span>人心<b>${Math.round(S.support)}</b></span><span>压力<b>${Math.round(S.heat)}</b></span><span class="${net>=0?"":"neg"}">净收<b>${net>=0?"+":""}${net}万</b></span>`;$("turnHint").textContent=S.battleSession?`${TERRITORY_DEFS[S.battleSession.targetId].name}血拼中 · ${STAGE_NAMES[S.battleSession.stage-1]}（第${S.battleSession.stage}/3段）`:`${attackableTerritories(S).length}块地可进攻 · ${ownedOfficers(S).length}/${officerCapacity(S)}名头目`;$("gameNav").querySelectorAll("button").forEach(b=>b.classList.toggle("active",b.dataset.tab===S.tab));renderTab()}
function metrics(rows){return`<div class="metric-grid">${rows.map(([v,l])=>`<div class="metric"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join("")}</div>`}

function renderTab(){({hall:renderHall,recruit:renderRecruit,map:renderMap,battle:renderBattle,roster:renderRoster,chronicle:renderChronicle}[S.tab]||renderHall)()}
const HALL_GROUPS=[["堂内事","招人、练兵、管账、安人心",["recruit_crew","train","business","visit","tend_wounded","laylow"]],["守地盘","把吃下的地坐稳",["fortify","garrison"]],["对外手段","打听、讲数、拆对方的墙",["intel","truce","incite","insider","blockade","turncoat"]]];
function actionRow(a){const used=S.usedActions[a.id]||0,unavailable=!!(a.canRun&&!a.canRun(S)),done=used>=a.max,disabled=S.ap<=0||done||unavailable;const label=done?"已安排":S.ap<=0?"行动点用完":unavailable?lockedTextOf(a,S)||"条件不足":"安排";return`<article class="ledger-row action-row ${used?"used":""}"><span class="row-glyph">${a.icon}</span><div class="row-main"><b>${a.name}</b><small>${a.desc}</small><span class="row-fx">${(typeof a.effects==="function"?a.effects(S):a.effects).map(x=>`<i>${x}</i>`).join("")}</span>${used&&!done?`<span class="row-count">本月已办 ${used} 次，还能再办 ${a.max-used} 次</span>`:""}</div><button class="stamp-btn ${done?"done":""}" data-action="${a.id}" type="button" ${disabled?"disabled":""}>${label}</button></article>`}
function crewMini(o){if(!o)return"";const face=o.portrait?`<img src="${assetUrl(o.portrait)}" alt="${esc(o.name)}">`:`<span class="common-avatar">${esc(o.name.slice(-1))}</span>`;return`<div class="crew-mini">${face}<div><b>${esc(o.name)}</b><small>${esc(o.type)} · 忠诚 ${Math.round(o.loyalty)}${o.injured?` · <em>伤${o.injured}月</em>`:""}</small><div class="loyalty-track"><i style="width:${clamp(o.loyalty)}%"></i></div></div></div>`}
function renderHall(){const panel=$("panel"),byId=Object.fromEntries(ACTIONS.map(a=>[a.id,a])),grouped=new Set(HALL_GROUPS.flatMap(g=>g[2])),extra=ACTIONS.filter(a=>!grouped.has(a.id)),groups=HALL_GROUPS.map(([n,h,ids])=>[n,h,ids.map(id=>byId[id]).filter(Boolean)]);if(extra.length)groups[0][2].push(...extra);panel.innerHTML=`<section class="page-head"><h2>议事堂</h2>${metrics([[`${S.ap}/3`,"剩余行动"],[ownTerritories(S).length,"地盘"],[S.wins,"血拼胜场"],[ownedOfficers(S).length,"头目"]])}${worldStrip(S)}</section>${S.lastAction?`<div class="feedback-banner"><b>${esc(S.lastAction.name)}</b><p>${esc(S.lastAction.text)}</p></div>`:""}<div class="ledger-groups">${groups.map(([n,h,list])=>`<section><div class="group-title"><b>${n}</b><span>${h} · 每项耗 1 行动点</span></div><div class="ledger-rows">${list.map(actionRow).join("")}</div></section>`).join("")}</div><div class="section-head"><h2>父亲留下的三名旧部</h2><span></span></div><div class="crew-strip">${["zhaokui","sumanqing","chengye"].map(id=>crewMini(officer(S,id))).join("")}</div>`;panel.querySelectorAll("[data-action]").forEach(b=>b.addEventListener("click",()=>applyAction(S,b.dataset.action)))}

// 本局世道与外交台面：让「这一局哪里不一样」始终可见。
function worldStrip(s){
  const bits=[];
  // 手机端收支面板被折叠，净收入必须在议事堂常驻可见——资金链危机不能是"突然的"。
  const net=monthlyNet(s);bits.push(`<span class="${net>=0?"chip-pos":"chip-neg"}">本月净收 ${net>=0?"+":""}${net}万</span>`);
  (s.mutators||[]).forEach(id=>{const m=MUTATORS[id];if(m)bits.push(`<span title="${esc(m.desc)}">世道 · ${esc(m.name)}</span>`)});
  Object.entries(s.truces||{}).forEach(([f,until])=>{if(until>=s.month)bits.push(`<span>与${esc(FACTIONS[f].name)}停战至第${until+1}月</span>`)});
  if(s.incited&&s.incited.until>=s.month)bits.push(`<span>${esc(FACTIONS[s.incited.faction].name)}正被引向别家（至第${s.incited.until+1}月）</span>`);
  if((s.flags.armsBoost||0)>0)bits.push(`<span>硬家伙在手 · 还剩${s.flags.armsBoost}场</span>`);
  const govs=Object.keys(s.governors||{}).length;if(govs)bits.push(`<span>${govs}名头目主政中</span>`);
  return bits.length?`<div class="stat-chips world-strip">${bits.join("")}</div>`:"";
}
function officerMiniCard(o){if(!o)return"";const face=o.portrait?`<img src="${assetUrl(o.portrait)}" alt="${esc(o.name)}">`:`<div class="common-avatar">${esc(o.name.slice(-1))}</div>`;return`<article class="officer-card ${o.portrait?"portrait-card":""} ${o.injured?"injured":""}">${face}<div class="card-copy"><div class="role-line"><h3>${esc(o.name)}</h3><span>${esc(o.type)}</span></div><p>${esc(o.trait)} · ${esc(o.role)}</p>${xpBar(o)}<div class="stat-chips"><span>武${o.stats.force}</span><span>统${o.stats.command}</span><span>谋${o.stats.scheme}</span><span>经${o.stats.business}</span><span>魅${o.stats.charm}</span></div>${skillList(officerSkills(S,o),skillTiers(S,o))}<div class="meter-row"><span>忠诚 ${Math.round(o.loyalty)}</span><b>${o.injured?`伤${o.injured}月`:`功劳 ${o.merit}`}</b></div><div class="loyalty-track"><i style="width:${o.loyalty}%"></i></div></div></article>`}

function renderRecruit(){const panel=$("panel"),named=["aqi","yerong","xiejiu"];panel.innerHTML=`<section class="hero-panel"><h2>招贤</h2>${metrics([[`${ownedOfficers(S).length}/${officerCapacity(S)}`,"头目数/上限"],[commonOfficerCount(S),"普通人才"],[Math.round(S.cash)+"万","现金"],[S.rep,"声望"]])}</section><div class="section-head"><h2>江湖来客</h2><span></span></div><div class="card-grid">${named.map(id=>namedRecruitCard(id)).join("")}</div><div class="section-head"><h2>本月招募市场</h2><span>下月全部刷新</span></div><div class="card-grid">${S.recruitMarket.map(commonRecruitCard).join("")||'<div class="empty-state">本月没有合适人选。</div>'}</div>`;panel.querySelectorAll("[data-hire-common]").forEach(b=>b.addEventListener("click",()=>{if(hireCommon(S,b.dataset.hireCommon)){saveGame();renderAll()}else toast("行动点、现金或头目上限不足")}));panel.querySelectorAll("[data-hire-named]").forEach(b=>b.addEventListener("click",()=>{if(recruitNamed(S,b.dataset.hireNamed)){saveGame();renderAll()}else toast("条件还不够")}))}
function namedRecruitCard(id){const d=CHARACTER_DEFS[id],st=namedCandidateStatus(S,id),owned=st.state==="owned",disabled=st.state!=="ready"||S.ap<1;return`<article class="recruit-card portrait-card ${owned?"":st.state!=="ready"?"locked":""}"><img src="${assetUrl(d.portrait)}" alt="${d.name}"><div class="card-copy"><div class="role-line"><h3>${d.name}</h3><span>${d.type}</span></div><p>${d.traitText}</p><div class="stat-chips"><span>武${d.stats.force}</span><span>统${d.stats.command}</span><span>谋${d.stats.scheme}</span><span>经${d.stats.business}</span><span>魅${d.stats.charm}</span></div>${skillList(officerSkills(S,{...d,id}))}<button class="stamp-btn ${owned?"done":""}" type="button" data-hire-named="${id}" ${disabled||owned?"disabled":""}>${owned?"已入伙":st.text}</button></div></article>`}
function commonRecruitCard(c){const cost=recruitCost(S,c.cost),disabled=S.ap<1||S.cash<cost||ownedOfficers(S).length>=officerCapacity(S);return`<article class="recruit-card"><div class="common-avatar">${esc(c.name.slice(-1))}</div><span class="eyebrow">${esc(c.type)}</span><h3>${esc(c.name)}</h3><p>${esc(c.trait)}。忠诚预估 ${Math.round(c.loyalty)}。</p><div class="stat-chips"><span>武${c.stats.force}</span><span>统${c.stats.command}</span><span>谋${c.stats.scheme}</span><span>经${c.stats.business}</span><span>魅${c.stats.charm}</span></div>${skillList(officerSkills(S,c))}<p class="muted-note">Lv5 再学一个技能</p><button class="stamp-btn" type="button" data-hire-common="${c.id}" ${disabled?"disabled":""}>${ownedOfficers(S).length>=officerCapacity(S)?"头目上限已满":`招募 · ${cost}万 · 1点`}</button></article>`}

// 小地图：节点=地盘（按势力着色），连线=相邻关系。可点击：敌地直达血拼计划，自家地滚动到卡片。
function renderMinimap(visible){
  const edges=new Set(),lines=[],show=new Set(visible||Object.keys(TERRITORY_DEFS));
  Object.entries(TERRITORY_DEFS).forEach(([id,d])=>d.neighbors.forEach(n=>{const key=[id,n].sort().join("|");if(!edges.has(key)){edges.add(key);lines.push(key)}}));
  const edgeSvg=lines.map(key=>{const [a,b]=key.split("|"),[x1,y1]=MAP_POS[a],[x2,y2]=MAP_POS[b];
    return`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="map-edge"/>`}).join("");
  const attackable=new Set(attackableTerritories(S));
  const nodeSvg=Object.keys(TERRITORY_DEFS).map(id=>{
    const [x,y]=MAP_POS[id],t=S.territories[id],f=FACTIONS[t.owner],mine=t.owner==="player";
    const cls=`map-node${mine?" mine":""}${attackable.has(id)?" attackable":""}${mine&&t.settling>0?" settling":""}${mapSel===id?" selected":""}`;
    const sub=mine?(t.settling>0?`未稳${t.settling}`:""):attackable.has(id)?(S.intel[id]?`防${t.guard}`:"可攻"):"";
    const mark=mine?`<rect class="seal-sq" x="${x-15}" y="${y-15}" width="30" height="30" transform="rotate(-6 ${x} ${y})"/>`:`<circle class="dot" cx="${x}" cy="${y}" r="15" fill="${f.color}"/>`;
    return`<g class="${cls}" data-map-node="${id}" opacity="${show.has(id)?1:.28}"><circle class="ring" cx="${x}" cy="${y}" r="25"/>${isHomeHQ(S,id)?`<circle class="hq-ring" cx="${x}" cy="${y}" r="20"/>`:""}${mark}<text x="${x}" y="${y+44}" class="map-name">${TERRITORY_DEFS[id].name}</text>${sub?`<text x="${x}" y="${y-30}" class="map-sub">${sub}</text>`:""}${TERRITORY_DEFS[id].final?`<text x="${x}" y="${y+6}" class="map-final">终</text>`:isHomeHQ(S,id)?`<text x="${x}" y="${y+6}" class="map-final map-hq">堂</text>`:""}</g>`;
  }).join("");
  return`<div class="fog-map-wrap"><svg class="fog-map" viewBox="0 0 1254 1254" role="group" aria-label="雾港地图"><image href="${assetUrl("assets/map-harbor.webp")}" x="0" y="0" width="1254" height="1254" preserveAspectRatio="none"/><text x="560" y="300" class="map-region-label">新 界</text><text x="300" y="790" class="map-sea-label">维 多 利 亚 港</text>${edgeSvg}${nodeSvg}</svg></div>`;
}
let mapRegion="全部",mapScope="all",mapView="map",mapSel=null;
function territoryRow(id){const d=TERRITORY_DEFS[id],t=S.territories[id],f=FACTIONS[t.owner],mine=t.owner==="player",attackable=attackableTerritories(S).includes(id),known=mine||S.intel[id];return`<tr class="${mine?"mine":""}" data-trow="${id}"><td class="n"><b>${d.name}</b><small>${d.district}</small></td><td><i class="owner-dot" style="background:${f.color}"></i>${f.name}${isHomeHQ(S,id)?"·堂口":""}</td><td class="num">${known?t.guard:"不明"}</td><td class="num">${d.income*t.level}万</td><td class="num">${t.level}级${mine&&t.industry?` · ${INDUSTRIES[t.industry]?.icon||""}`:""}</td><td>${mine?"自家":attackable?'<span style="color:var(--seal)">可攻</span>':""}</td></tr>`}
function renderMap(){const panel=$("panel"),ids=Object.keys(TERRITORY_DEFS).filter(id=>(mapRegion==="全部"||TERRITORY_DEFS[id].region===mapRegion)&&(mapScope==="all"||mapScope==="owned"&&owns(S,id)||mapScope==="attack"&&attackableTerritories(S).includes(id)));
 if(mapSel&&!TERRITORY_DEFS[mapSel])mapSel=null;
 const detail=mapSel?`<button class="map-detail-close" type="button" aria-label="收起">×</button>${territoryCard(mapSel)}`:'<p class="detail-empty">选择地段</p><p class="detail-empty" style="margin-top:10px">朱印 · 自家　红圈 · 可攻　堂 · 帮派老巢</p>';
 const body=mapView==="list"?`<table class="territory-table"><thead><tr><th>地段</th><th>归属</th><th>驻防</th><th>地租</th><th>等级</th><th></th></tr></thead><tbody>${ids.map(territoryRow).join("")||'<tr><td colspan="6" class="empty-state">这个区域暂无符合条件的地段。</td></tr>'}</tbody></table>`:`<div class="map-stage">${renderMinimap(ids)}<aside class="map-detail ${mapSel?"":"empty"}">${detail}</aside></div><p class="map-caption">中环：其余35处地段归入和联胜后开放</p>`;
 panel.innerHTML=`<section class="city-map-heading"><h2>雾港十八区</h2><div class="city-summary"><span><b>${ownTerritories(S).length}</b> / ${TERRITORY_TOTAL} 地段</span><span>整区 <b>${Object.values(DISTRICTS).filter(d=>d.territories.every(id=>owns(S,id))).length}/18</b></span><span>月总收入 <b>${monthlyGross(S)}万</b></span><span><b>${attackableTerritories(S).length}</b> 处可进攻</span></div></section><div class="map-toolbar"><div class="map-filters">${["全部","九龙","港岛","新界","离岛"].map(r=>`<button type="button" data-region="${r}" class="${mapRegion===r?"active":""}">${r}</button>`).join("")}<span style="width:8px"></span>${Object.entries({all:"全部地段",owned:"我的生意",attack:"进攻前线"}).map(([k,v])=>`<button type="button" data-scope="${k}" class="${mapScope===k?"active":""}">${v}</button>`).join("")}</div><div class="view-switch"><button type="button" data-view="map" class="${mapView==="map"?"active":""}">地图</button><button type="button" data-view="list" class="${mapView==="list"?"active":""}">列表</button></div></div><div class="map-legend">${Object.entries(FACTIONS).map(([id,f])=>`<span><i style="background:${f.color}${id==="player"?";border-radius:0":""}"></i>${f.name} ${territoryCount(S,id)}</span>`).join("")}</div>${body}`;
 panel.querySelectorAll("[data-region]").forEach(b=>b.addEventListener("click",()=>{mapRegion=b.dataset.region;renderMap()}));
 panel.querySelectorAll("[data-scope]").forEach(b=>b.addEventListener("click",()=>{mapScope=b.dataset.scope;renderMap()}));
 panel.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>{mapView=b.dataset.view;renderMap()}));
 panel.querySelectorAll("[data-trow]").forEach(r=>r.addEventListener("click",()=>{mapSel=r.dataset.trow;mapView="map";renderMap()}));
 panel.querySelector(".map-detail-close")?.addEventListener("click",()=>{mapSel=null;renderMap()});
 panel.querySelectorAll("[data-map-node]").forEach(g=>{g.setAttribute("role","button");g.setAttribute("tabindex","0");g.setAttribute("aria-label",TERRITORY_DEFS[g.dataset.mapNode].name);const select=()=>{mapSel=g.dataset.mapNode;renderMap();panel.querySelector(`[data-map-node="${mapSel}"]`)?.focus({preventScroll:true})};g.addEventListener("click",select);g.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();select()}})});
 panel.querySelectorAll("[data-attack-territory]").forEach(b=>b.addEventListener("click",()=>{S.tab="battle";battleDraft.targetId=b.dataset.attackTerritory;renderAll()}));
 panel.querySelectorAll("[data-upgrade-territory]").forEach(b=>b.addEventListener("click",()=>upgradeTerritory(b.dataset.upgradeTerritory)));
 panel.querySelectorAll("[data-govern-territory]").forEach(b=>b.addEventListener("click",()=>governTerritory(b.dataset.governTerritory)));
 panel.querySelectorAll("[data-enterprise]").forEach(b=>b.addEventListener("click",()=>manageEnterprise(b.dataset.enterprise)));
}
// 委任主政：头目按五维给地盘持续加成，但主政期间不能出战——人往哪放是道真题。
function governTerritory(id){
  const t=S.territories[id];if(!t||t.owner!=="player")return;
  const cur=governorOf(S,id);
  if(cur){delete S.governors[id];log(S,"story",`${cur.name}从${TERRITORY_DEFS[id].name}回到了祖堂。`);saveGame();renderAll();return}
  if(S.ap<1){toast("行动点不足");return}
  const candidates=ownedOfficers(S).filter(o=>o.id!=="player"&&!o.injured&&!isGovernor(S,o.id)).sort((a,b)=>(b.stats.business+b.stats.command)-(a.stats.business+a.stats.command)).slice(0,4);
  if(!candidates.length){toast("没有可派驻的头目");return}
  enqueue({title:`谁去坐镇${TERRITORY_DEFS[id].name}`,portrait:candidates[0].portrait||"assets/player.webp",body:`<p>坐镇期间不能出战。</p>`,options:[
    ...candidates.map(o=>option(`${o.name}（经${o.stats.business} 统${o.stats.command} 魅${o.stats.charm}）`,`收入约+${Math.round(o.stats.business/3.5)}% · 驻防每月+${Math.max(1,Math.round(o.stats.command/25))*PEOPLE}`,()=>{S.governors[id]=o.id;o.merit+=2;log(S,"good",`${o.name}搬进了${TERRITORY_DEFS[id].name}的堂口，开始主政一方。`)})),
    option("再想想","不花行动点",()=>{S.ap++})
  ]},"委任主政");
  S.ap--;saveGame();renderAll();
}
function territoryCard(id){const d=TERRITORY_DEFS[id],t=S.territories[id],f=FACTIONS[t.owner],mine=t.owner==="player",attackable=attackableTerritories(S).includes(id),locked=d.final&&ownTerritories(S).length<TERRITORY_TOTAL-1,hq=isHomeHQ(S,id),hqLock=hqLocked(S,id),cost=territoryUpgradeCost(S,id),gov=mine?governorOf(S,id):null,p=!mine&&S.intel[id]?postureOf(S,id):null,truced=!mine&&truceActive(S,t.owner),drain=mine?0:siegeDrain(S,id);return`<article data-tcard="${id}" class="territory-card ${mine?"mine":""} ${attackable?"attackable":""} ${locked?"locked":""} ${mine&&t.settling>0?"settling":""}" style="--owner-color:${f.color}"><span class="territory-owner">${d.district} · ${f.name}${hq?" · 堂口":""}${truced?" · 停战中":""}</span><h3>${d.name}${mine&&t.settling>0?`<span class="settling-tag">未稳 ${t.settling}月</span>`:""}${drain?`<span class="siege-tag">围困中</span>`:""}</h3>${hq?`<p class="territory-bonus hq-note">${f.name}的起家老巢：头目倾巢守门，守方受伤−15%，驻防长得快。外围剩两块以下才开得了门；拔掉它，本家其余地盘驻防−30%。</p>`:""}<p class="territory-bonus">${mine&&gov?`${gov.name}在此主政：收入与驻防持续上涨`:p?`敌方姿态：${p.name}（${p.hint}）`:d.bonus}</p><div class="stat-chips"><span>地租 ${d.income*t.level}万</span><span>驻防 ${t.guard}${drain?` <b class="drain">↓${drain}/月</b>`:""}</span><span>稳定 ${t.stability}</span><span>Lv.${t.level}</span></div>${mine?enterpriseSummary(S,id):""}<div class="territory-actions">${mine?`<button class="stamp-btn" type="button" data-enterprise="${id}">经营产业</button><button class="stamp-btn" type="button" data-upgrade-territory="${id}" ${S.ap<1||S.cash<cost||t.level>=3?"disabled":""}>${t.level>=3?"地盘已满级":`投资 ${cost}万·1点`}</button><button class="stamp-btn" type="button" data-govern-territory="${id}" ${gov?"":S.ap<1?"disabled":""}>${gov?`撤回${gov.name}`:"委任主政·1点"}</button>`:attackable?`<button class="primary-btn" type="button" data-attack-territory="${id}">定进攻计划</button>`:`<button class="stamp-btn" type="button" disabled>${locked?"中环尚未开放":hqLock?`堂口未开·外围还有${factionTerritories(S,t.owner).length-1}块`:"尚不相邻"}</button>`}</div></article>`}
function territoryUpgradeCost(s,id){let cost=18+(s.territories[id].level-1)*16;if(owns(s,"west_market"))cost*=.85;if(owns(s,"mall"))cost*=.9;return Math.round(cost)}
function upgradeTerritory(id){const t=S.territories[id];if(!t||t.owner!=="player"||S.ap<1||t.level>=3)return;const cost=territoryUpgradeCost(S,id);if(S.cash<cost){toast("现金不足");return}const before=monthlyNet(S);S.ap--;addCash(S,-cost);t.level++;t.guard+=10*PEOPLE;t.stability=clamp(t.stability+8);const text=`${TERRITORY_DEFS[id].name}升至${t.level}级，月净收增加${Math.round((monthlyNet(S)-before)*10)/10}万，驻防+100。`;log(S,"good",text);toast(text);saveGame();renderAll()}

// ---- 血拼界面：出战令 + 卡牌对阵 ----
const CARD_GLYPH={press:"冲",hold:"稳",flank:"抄",backdoor:"门",parley:"喊",supply:"粮",duel:"斗",rearguard:"断",withdraw:"撤"};
let battlePlay={speed:1,playing:false,skip:false};
function skillTags(ids,tiers){return ids.map(skillInfo).filter(Boolean).map(k=>{const tr=(tiers&&tiers[k.id])||1;return`<i class="sk ${k.kind}${tr>1?" tier"+tr:""}" title="${esc(k.desc)}${tr>1?`（${TIER_MARK[tr-1].slice(1)}阶：效果加强）`:""}">${esc(skillLabel(k.id,tr))}</i>`}).join("")}
const SKILL_KIND={active:"主动",chase:"追击",passive:"常驻",aura:"压阵"};
function skillList(ids,tiers){return`<ul class="skill-list">${ids.map(id=>{const k=SKILLS[id];if(!k)return"";const tr=(tiers&&tiers[id])||1;return`<li><b class="sk ${k.kind}${tr>1?" tier"+tr:""}">${esc(skillLabel(id,tr))}</b><span>${SKILL_KIND[k.kind]||""}${k.rate?` ${Math.round(Math.min(.7,k.rate*(1+.15*(tr-1)))*100)}%`:""} · ${esc(k.desc)}${tr>1?`（${TIER_MARK[tr-1].slice(1)}阶加强）`:""}</span></li>`}).join("")}</ul>`}
function xpBar(o){const lv=lvOf(o),pct=lv>=LV_MAX?100:clamp(Math.round((Number(o.xp)||0)/lvNeed(lv)*100),0,100);return`<div class="xp-row"><span>Lv${lv}${lv>=LV_MAX?" · 满级":""}</span><div class="xp-track"><i style="width:${pct}%"></i></div><small>${lv>=LV_MAX?"":`${Number(o.xp)||0}/${lvNeed(lv)}`}</small></div>`}
function unitFace(u){return u.portrait?`<img src="${assetUrl(u.portrait)}" alt="">`:`<span class="face-seal">${esc((u.name.split("·").pop()||"?").slice(0,1))}</span>`}
function unitCardHTML(u){
  const pct=clamp(Math.round(u.hp/Math.max(1,u.hp0)*100),0,100);
  return`<article class="bunit ${u.side} ${u.row} ${u.out?"out":""}" data-ukey="${u.key}"><div class="bphoto">${unitFace(u)}<span class="brow-tag">${u.row==="front"?"前":"后"}</span></div><div class="bcopy"><b>${esc(u.name)}${u.lv?`<span class="lv-badge">Lv${u.lv}</span>`:""}</b><small>${esc(u.type)}</small><div class="bhp"><i style="width:${pct}%"></i></div><span class="bnum"><em>${Math.max(0,Math.round(u.hp))}</em> / ${u.hp0}</span><div class="bsk">${skillTags(u.skills,u.tiers)}</div></div></article>`;
}
function boardHTML(units,label="守军"){
  const side=s=>units.filter(u=>u.side===s).sort((a,b)=>(a.row===b.row?0:a.row==="front"?1:-1)*(s==="them"?1:-1));
  return`<div class="board"><div class="bside them">${side("them").map(unitCardHTML).join("")}</div><div class="bmid"><span>${esc(label)}</span><i></i><span>和联胜</span></div><div class="bside us">${side("us").map(unitCardHTML).join("")}</div></div>`;
}
function renderBattleSession(){
  const b=S.battleSession,panel=$("panel"),place=TERRITORY_DEFS[b.targetId].name;
  if(!Array.isArray(b.units)){b.units=buildBattleUnits(S,b);saveGame()}
  const pos=clamp((b.momentum+100)/2,0,100),opts=stageOptions(S,b),stageName=STAGE_NAMES[b.stage-1]||"收尾";
  panel.innerHTML=`<section class="hero-panel battle-head"><span class="eyebrow">${esc(stageName)} · 第 ${b.stage}/3 段</span><h2>${esc(place)}，${esc(stageName)}${b.hq?'<span class="hq-badge">堂口 · 守方受伤−15%</span>':""}</h2>
    <div class="momentum-wrap"><div class="momentum-rail"><i style="left:calc(${pos}% - 2px)"></i></div><div class="momentum-label"><span>对方占上风</span><b>${b.momentum>=0?"+":""}${b.momentum}</b><span>我方占上风</span></div></div>
    <div class="battle-meta"><span>投入 <b>${b.troops}</b></span><span>折损 <b>${b.losses}</b></span><span>对面倒下 <b>${b.enemyLoss}</b></span><span>${esc(tacticMeta(b.tactic).name)}</span></div></section>
    <div id="boardWrap">${boardHTML(b.units,FACTIONS[S.territories[b.targetId].owner]?.name)}</div>
    <div class="play-ctl"><span>回放</span>${[1,2].map(v=>`<button type="button" data-speed="${v}" class="${battlePlay.speed===v?"active":""}">${v}倍</button>`).join("")}<button type="button" id="skipPlay">直接看结果</button></div>
    <div class="section-head"><h2>号令</h2><span>出一张，管下一段的两回合</span></div>
    <div class="hand">${opts.map(o=>`<button class="order-card ${o.id==="withdraw"?"quit":""}" type="button" data-choice="${esc(o.id)}"><span class="oc-glyph">${CARD_GLYPH[o.id]||"令"}</span>${o.speaker?`<cite>${esc(o.speaker)}</cite>`:""}<b>${esc(o.text)}</b><small>${esc(o.effect)}</small></button>`).join("")}</div>
    ${b.log.length?`<div class="section-head"><h2>战况</h2><span>${esc(place)}</span></div><div class="stage-scroll">${b.log.map(x=>`<article class="stage-done"><time>${esc(x.name)}</time><p>${esc(x.text)}</p></article>`).join("")}</div>`:""}`;
  panel.querySelectorAll("[data-speed]").forEach(btn=>btn.addEventListener("click",()=>{battlePlay.speed=Number(btn.dataset.speed);panel.querySelectorAll("[data-speed]").forEach(x=>x.classList.toggle("active",x===btn))}));
  $("skipPlay")?.addEventListener("click",()=>{battlePlay.skip=true});
  panel.querySelectorAll("[data-choice]").forEach(btn=>btn.addEventListener("click",()=>playOrder(btn.dataset.choice)));
}
// 出牌：先结算（存档立刻落地），再拿结算前的快照逐条回放事件，放完才刷新到真实状态。
function playOrder(id){
  if(battlePlay.playing||!S.battleSession)return;
  const pre=JSON.parse(JSON.stringify(S.battleSession.units||[]));
  let res;
  try{res=applyStageChoice(S,id)}catch(error){if(typeof console!=="undefined")console.error("[雾港] 血拼推进失败",error);toast("这一段没能结算，进度没有变化");renderAll();return}
  const events=res.ended?(res.report?.events||[]):(S.battleSession?.events||[]);
  if(id==="withdraw"||!events.length){afterPlay(res);return}
  battlePlay.playing=true;battlePlay.skip=false;
  document.querySelectorAll("#panel .order-card").forEach(b=>b.disabled=true);
  const units=pre,byKey=k=>units.find(u=>u.key===k);
  const label=FACTIONS[S.territories[res.report?.targetId||S.battleSession?.targetId]?.owner]?.name,oldLabel=document.querySelector("#boardWrap .bmid span")?.textContent||label;
  const wrap=$("boardWrap");if(wrap)wrap.innerHTML=boardHTML(units,oldLabel);
  let i=0;
  const step=()=>{
    if(!battlePlay.playing)return;
    if(battlePlay.skip||i>=events.length){battlePlay.playing=false;afterPlay(res);return}
    const e=events[i++],a=byKey(e.a),t=byKey(e.b);
    if((e.k==="atk"||e.k==="skill"||e.k==="talk"||e.k==="bribe")&&t)t.hp=Math.max(0,t.hp-e.n);
    if(e.k==="heal"&&t)t.hp=Math.min(t.hp0,t.hp+e.n);
    if(e.k==="rout"&&t)t.out=true;
    if(wrap){wrap.innerHTML=boardHTML(units,oldLabel);flashEvent(wrap,e,a,t)}
    setTimeout(step,(e.k==="cast"?440:e.k==="rout"?520:e.k==="stunned"||e.k==="dodge"?260:290)/battlePlay.speed);
  };
  step();
}
function flashEvent(wrap,e,a,t){
  const el=k=>k&&wrap.querySelector(`[data-ukey="${k.key}"]`);
  const ae=el(a),te=el(t);
  if(ae&&e.k!=="rout")ae.classList.add("acting");
  const pop=(node,text,cls)=>{if(!node)return;const s=document.createElement("span");s.className="pop "+cls;s.textContent=text;node.appendChild(s)};
  if(e.k==="cast")pop(ae,skillLabel(e.skill,e.tier),'stamp');
  if((e.k==="atk"||e.k==="skill")&&e.n>0)pop(te,`−${e.n}`,"dmg");
  if(e.k==="talk")pop(te,`劝走${e.n}`,"dmg");
  if(e.k==="bribe")pop(te,`撬走${e.n}`,"dmg");
  if(e.k==="heal")pop(te,`+${e.n}`,"heal");
  if(e.k==="dodge")pop(te,"闪","heal");
  if(e.k==="stunned")pop(ae,"愣住","stamp");
  if(e.k==="stun")pop(te,"乱了","stamp");
  if(e.k==="rout")pop(te,"溃","stamp big");
}
function afterPlay(res){renderAll();if(res?.ended)announceBattleResult(res.report)}

function enemyPreviewHTML(id){
  if(!S.intel[id])return`<div class="enemy-preview unknown"><b>守军不明</b><small>先打听敌情，或者让魏小楼摸后门，才知道谁守、各带多少人。</small></div>`;
  const list=enemyLineup(S,id,null);
  return`${isHomeHQ(S,id)?'<p class="muted-note"><span class="hq-badge">堂口</span> 本家能打的头目全在这里，守方受伤−15%。拔下来，本家其余地盘驻防−30%。</p>':""}<div class="enemy-preview">${list.map(u=>`<span class="ep"><span class="ep-face">${unitFace(u)}</span><b>${esc(u.name)}</b><small>${u.lv?`Lv${u.lv} · `:""}${esc(u.type)} · ${u.hp}人</small><span class="bsk">${skillTags(u.skills,u.tiers)}</span></span>`).join("")}</div>`;
}
function renderBattle(){if(S.battleSession)return renderBattleSession();const panel=$("panel"),targets=attackableTerritories(S);if(!targets.length){panel.innerHTML='<div class="empty-state">当前没有可进攻地盘。拿下中环以外的所有地盘后，那里会成为最后一战。</div>';return}
  if(S.crew<MIN_TROOPS){panel.innerHTML=`<section class="hero-panel"><h2>人手不足，今晚不能开战</h2><p>至少需要${MIN_TROOPS}名能战人手，当前只有 <b>${S.crew}</b> 人。${S.regroup+S.wounded>0?`另有 ${S.regroup} 人整补中、${S.wounded} 人养伤——他们会在往后几个月陆续归队。`:"先去议事堂招人。"}</p></section><button class="launch-btn" disabled>人手不足${MIN_TROOPS}人</button>${S.lastBattle?renderLastBattle(S.lastBattle):""}`;return}
  if(!targets.includes(battleDraft.targetId))battleDraft.targetId=targets[0];
  const available=ownedOfficers(S).filter(o=>!o.injured&&!isGovernor(S,o.id));
  battleDraft.leaderIds=battleDraft.leaderIds.filter(id=>available.some(o=>o.id===id)).slice(0,3);
  if(!battleDraft.leaderIds.length)battleDraft.leaderIds=available.slice().sort((a,b)=>leaderScore(b)-leaderScore(a)).slice(0,3).map(o=>o.id);
  battleDraft.split=battleDraft.split||{};battleDraft.rows=battleDraft.rows||{};
  Object.keys(battleDraft.split).forEach(k=>{if(!battleDraft.leaderIds.includes(k))delete battleDraft.split[k]});
  const cap=Math.min(S.crew,maxTroops(S,battleDraft.leaderIds));
  battleDraft.troops=clamp(battleDraft.troops,MIN_TROOPS,Math.max(MIN_TROOPS,cap));
  const split=splitTroops(S,battleDraft.leaderIds,battleDraft.troops,battleDraft.split);
  battleDraft.troops=Object.values(split).reduce((a,b)=>a+b,0);
  const id=battleDraft.targetId,p=postureOf(S,id);
  const odds=simulateBattleOdds(S,{...battleDraft,split});
  const sm=hasOfficer(S,"sumanqing");
  const oddsText=!odds?"":sm?`苏曼青批：<b>${odds.label}</b>，${odds.p>=.95?"十拿九稳":odds.p<.05?"几乎没有胜算":`${Math.round(odds.p*10)}成把握`}，预计折损 ${odds.losses} 人。`:`<b>${odds.label}</b><br>苏曼青不在阵中，只能给出粗略判断。`;
  panel.innerHTML=`<section class="hero-panel"><h2>出征</h2>${metrics([[S.crew,"能战人手"],[S.morale,"当前士气"],[S.training,"整训加成"],[S.intel[id]?"已查清":"未查清","目标情报"]])}${S.regroup+S.wounded>0?`<p class="muted-note">另有 ${S.regroup} 人整补中、${S.wounded} 人养伤，本月不能出战。</p>`:""}</section>
  <div class="section-head"><h2>血拼计划</h2><span>发起进攻消耗 1 行动点</span></div>
  <div class="battle-layout"><div class="battle-targets">${targets.map(t=>{const pp=postureOf(S,t);return`<button class="target-row ${t===id?"active":""}" type="button" data-target="${t}"><b>${TERRITORY_DEFS[t].name}</b><span>${FACTIONS[S.territories[t].owner].name} · ${S.intel[t]?`驻防 ${S.territories[t].guard}${pp?` · ${pp.name}`:""}`:"驻防与姿态不明"}</span></button>`}).join("")}
    <div class="form-label">守在${esc(TERRITORY_DEFS[id].name)}的人</div>${enemyPreviewHTML(id)}</div>
  <div class="battle-form">
    <span class="form-label">战术${S.intel[id]&&p?` · 对方${p.name}（${p.hint}）`:" · 姿态不明，只有稳扎稳打不吃暗亏"}</span>
    <div class="tactic-grid">${[["assault","正面强攻"],["steady","稳扎稳打"],["ambush","迂回奇袭"],["persuade","攻心劝降"]].map(([tid,n])=>{const m=S.intel[id]?postureMult(S,id,tid):1,tag=m>1?'<i class="t-up">↑克制</i>':m<1?'<i class="t-down">↓被克</i>':"";return`<button class="tactic-btn ${battleDraft.tactic===tid?"active":""}" type="button" data-tactic="${tid}">${n}${tag}</button>`}).join("")}</div>
    <span class="form-label">上阵头目（最多3人，点照片选人）</span>
    <div class="pick-leaders">${available.map(o=>`<button type="button" class="pl ${battleDraft.leaderIds.includes(o.id)?"on":""}" data-leader="${o.id}"><span class="pl-face">${unitFace(o)}</span><b>${esc(o.name)}</b><small>Lv${lvOf(o)} · ${esc(o.type)}</small></button>`).join("")}</div>
    <span class="form-label">分派小弟 · 合计 <b id="troopValue">${battleDraft.troops}</b> / ${S.crew}</span>
    <div class="alloc">${battleDraft.leaderIds.map(lid=>{const o=officer(S,lid);if(!o)return"";const row=battleDraft.rows[lid]||defaultRow(o);return`<div class="alloc-row"><span class="ar-name"><b>${esc(o.name)}</b><span class="bsk">${skillTags(officerSkills(S,o),skillTiers(S,o))}</span></span><button type="button" class="row-toggle" data-row="${lid}">${row==="front"?"前排":"后排"}</button><input type="range" min="1" max="${troopCap(o)}" value="${split[lid]}" data-alloc="${lid}" aria-label="${esc(o.name)}带的小弟"><output>${split[lid]}</output></div>`}).join("")}</div>
    <div id="battleEstimate" class="battle-estimate">${oddsText}</div>
    <button id="launchBattle" class="launch-btn" type="button" ${battleDraft.leaderIds.length&&battleDraft.troops>=MIN_TROOPS?"":"disabled"}>${battleDraft.troops<MIN_TROOPS?`至少带${MIN_TROOPS}个人`:`发令 · 开战${TERRITORY_DEFS[id].name}`}</button>
  </div></div>${S.lastBattle?renderLastBattle(S.lastBattle):""}`;
  panel.querySelectorAll("[data-target]").forEach(b=>b.addEventListener("click",()=>{battleDraft.targetId=b.dataset.target;renderBattle()}));
  panel.querySelectorAll("[data-tactic]").forEach(b=>b.addEventListener("click",()=>{battleDraft.tactic=b.dataset.tactic;renderBattle()}));
  panel.querySelectorAll("[data-leader]").forEach(b=>b.addEventListener("click",()=>{const lid=b.dataset.leader;if(battleDraft.leaderIds.includes(lid))battleDraft.leaderIds=battleDraft.leaderIds.filter(x=>x!==lid);else{if(battleDraft.leaderIds.length>=3){toast("最多选3名头目");return}battleDraft.leaderIds.push(lid);battleDraft.troops+=Math.min(troopCap(officer(S,lid)),Math.max(0,S.crew-battleDraft.troops))}renderBattle()}));
  panel.querySelectorAll("[data-row]").forEach(b=>b.addEventListener("click",()=>{const lid=b.dataset.row,o=officer(S,lid);battleDraft.rows[lid]=(battleDraft.rows[lid]||defaultRow(o))==="front"?"back":"front";renderBattle()}));
  panel.querySelectorAll("[data-alloc]").forEach(r=>{r.addEventListener("input",()=>{r.nextElementSibling.textContent=r.value});r.addEventListener("change",()=>{const lid=r.dataset.alloc;battleDraft.split={...split,[lid]:Number(r.value)};const others=battleDraft.leaderIds.filter(x=>x!==lid).reduce((a,x)=>a+split[x],0);battleDraft.troops=Math.min(S.crew,others+Number(r.value));if(others+Number(r.value)>S.crew)battleDraft.split[lid]=S.crew-others;renderBattle()})});
  $("launchBattle")?.addEventListener("click",launchBattle);
}
function battleGains(r){return `<div class="reward-slip">${r.won&&r.cashGain!==undefined?`<b>拿下 ${esc(r.targetName)}</b><div class="stat-chips"><span>入账 +${r.cashGain||0}万</span><span>月净收 ${(r.netGain||0)>=0?"+":""}${r.netGain||0}万</span><span>声望 +${r.repGain??7}</span></div>${(r.honors||[]).map(n=>`<p>${esc(n)}全区归入和联胜 · 贺礼8万 · 民心+2</p>`).join("")}`:`<b>${r.won?"地盘已收入麾下":r.outcome==="retreat"?"已撤回":"整队再战"}</b>`}<p>${r.garrison?`留守 ${r.garrison}人 · `:""}整补 ${r.survivors??Math.max(0,r.troops-r.losses)}人 · 养伤 ${r.woundedBack??Math.round(r.losses*.55)}人 · 阵亡 ${r.losses-(r.woundedBack??Math.round(r.losses*.55))}人</p></div>`}
function renderLastBattle(r){return`<div class="section-head"><h2>上一场战报</h2><span>${r.won?"夺地成功":"进攻失利"}</span></div><div class="battle-report"><div class="result-score"><span>和联胜</span><strong>${r.won?"胜":"败"}</strong><span>${esc(r.targetName)}</span></div>${battleGains(r)}${(r.levelUps||[]).length?`<p class="lvup-line">${esc(r.levelUps.join("　"))}</p>`:""}${r.stages.map(x=>`<article class="battle-stage"><time>${x.name}</time><div><h3>${esc(r.targetName)}</h3><p>${esc(x.text)}</p></div></article>`).join("")}</div>`}
// 战果仍走一次 enqueue：endGame 会清空旧队列、挂起 pendingEnding，再由 pumpModal 在队列排空后
// flushEnding()。少了这次入队，终局之战的结局会直接盖住玩家还没看的战果。
function announceBattleResult(report){
  if(!report)return;
  const won=report.outcome==="win",quit=report.outcome==="retreat";
  const title=won?`${report.targetName}的招牌换了`:quit?`队伍从${report.targetName}退了回来`:`${report.targetName}没能拿下`;
  enqueue({title,portrait:officer(S,report.leaders[0])?.portrait,
    body:`<div class="result-score"><span>和联胜</span><strong>${won?"胜":quit?"撤":"败"}</strong><span>${esc(report.targetName)}</span></div>${battleGains(report)}${(report.levelUps||[]).length?`<p class="lvup-line">${esc(report.levelUps.join("　"))}</p>`:""}${report.stages.map(x=>`<div class="battle-stage"><time>${esc(x.name)}</time><div><p>${esc(x.text)}</p></div></div>`).join("")}${report.injured.length?`<p style="color:var(--red)">${esc(report.injured.join("、"))}在本场受伤。</p>`:""}`,
    options:[option(won?"把和联胜的招牌挂上去":quit?"整队，这场先算了":"整队，这场不算完",`折损 ${report.losses} 人`,()=>{})]},won?"血拼战报":quit?"鸣金收兵":"血拼战报");
}
function launchBattle(){
  if(!S){toast("当前存档已经失效");return false}
  if(S.battleSession){renderAll();return false}
  if(S.crew<MIN_TROOPS){toast(`至少需要${MIN_TROOPS}名人手才能开战`);return false}
  if(S.ap<1){toast("行动点已用完，这个月打不了了");return false}
  if(!battleDraft.leaderIds.length){toast("至少选择一名头目");return false}
  try{
    const target=battleDraft.targetId;
    if(S.flags.cashDealUntil&&S.month<=S.flags.cashDealUntil&&target==="new_city"){ownedOfficers(S).filter(o=>o.id!=="player").forEach(o=>o.loyalty=clamp(o.loyalty-5));delete S.flags.cashDealUntil;log(S,"warn","你撕碎了方景曜那张支票上的承诺。")}
    startBattle(S,{...battleDraft});
    battleDraft.leaderIds=[];battleDraft.split={};saveGame();renderAll();return true
  }catch(error){
    if(typeof console!=="undefined")console.error("[雾港] 开战失败",error);
    toast(error?.message==="target not attackable"?"目标地盘已经无法进攻，请重新选择":error?.message==="no leaders"?"没有可用头目参战":error?.message==="not enough crew"?`至少需要${MIN_TROOPS}名人手才能开战`:error?.message==="battle in progress"?"上一场血拼还没打完":"开战失败，当前进度没有变化");
    renderAll();return false
  }
}

function renderRoster(){const panel=$("panel"),own=ownedOfficers(S),others=S.officers.filter(o=>o.side!=="player"&&o.named);panel.innerHTML=`<section class="hero-panel"><h2>堂口名册</h2>${metrics([[own.length,"我方头目"],[Math.round(own.reduce((a,o)=>a+o.loyalty,0)/own.length),"平均忠诚"],[own.filter(o=>o.injured).length,"负伤"],[own.reduce((a,o)=>a+o.merit,0),"总功劳"]])}</section><div class="section-head"><h2>和联胜名册</h2><span>${own.length}/${officerCapacity(S)}</span></div><div class="officer-grid">${own.map(officerMiniCard).join("")}</div><div class="section-head"><h2>雾港其他人物</h2><span>打败一家社团后，其主将可能被收编</span></div><div class="officer-grid">${others.map(o=>`<article class="officer-card portrait-card enemy"><img src="${assetUrl(o.portrait)}" alt="${o.name}"><div class="card-copy"><div class="role-line"><h3>${o.name}<span class="lv-badge">Lv${lvOf(o)}</span></h3><span>${FACTIONS[o.side]?.name||"已离场"}</span></div><p>${o.traitText}</p><div class="stat-chips"><span>武${o.stats.force}</span><span>统${o.stats.command}</span><span>谋${o.stats.scheme}</span><span>经${o.stats.business}</span><span>魅${o.stats.charm}</span></div>${skillList(officerSkills(S,o),skillTiers(S,o))}</div></article>`).join("")}</div>`}
function renderChronicle(){const panel=$("panel");panel.innerHTML=`<section class="hero-panel"><h2>江湖记事</h2>${metrics([[S.battles,"血拼场次"],[S.wins,"胜场"],[S.casualties,"累计折损"],[CREEDS[Object.entries(S.style).sort((a,b)=>b[1]-a[1])[0][0]].name,"当前作风"]])}</section><div class="section-head"><h2>江湖记事</h2><span>最近100条</span></div><div class="chronicle">${S.log.map(l=>`<article class="log-row ${esc(l.kind||"")}"><time>第${l.month+1}月</time><div><b>${l.kind==="good"?"得势":l.kind==="bad"?"代价":l.kind==="warn"?"暗流":"记事"}</b><p>${esc(l.text)}</p></div></article>`).join("")}</div><div class="section-head"><h2>存档</h2><span>进度自动保存在本机</span></div><div class="save-actions"><button id="chronSaveBtn" class="small-btn">手动保存一次</button><button id="chronRestartBtn" class="small-btn danger-btn">删档重新开局</button></div>`;
  // 手机端顶栏放不下存/重按钮，这里是它们的常驻入口。
  $("chronSaveBtn")?.addEventListener("click",()=>{if(saveGame())toast("进度已保存在本机")});
  $("chronRestartBtn")?.addEventListener("click",()=>{if(confirm("删除当前存档并重新开始？")){deleteSave();S=null;showMenu()}});}

function showEnding(s){$("game")?.classList.add("hidden");$("ending").classList.remove("hidden");const title=endingTitle(s),victory=s.endingReason==="unified",settled=["halfharbor","warlord"].includes(s.endingReason),aqi=officer(s,"aqi"),styleKey=Object.entries(s.style).sort((a,b)=>b[1]-a[1])[0][0],styleName=CREEDS[styleKey].name;let line;if(s.endingReason==="bankrupt")line="账房最后一次合上账簿时，祖堂里还亮着灯，但已经没人等着领下个月的钱。地盘没有一夜丢光，和联胜却先从人心里散了。";else if(s.endingReason==="crushed")line="他们是从三个方向同时进来的。天亮时，老街还是那条老街，祖堂主位上坐着的却换了人。父亲留下的那本蓝色账簿，最后没有人捡起来。";else if(s.endingReason==="halfharbor")line="没有人正式宣布过什么。只是从某一年起，雾港一半的码头、货车和夜市账本上都写着同一个名字，而另一半学会了绕开它。这不是一统，是一种谁都拆不动的平衡。";else if(s.endingReason==="warlord")line="你守住了一片说得清边界的地方。出了这几条街，雾港还是别人的雾港——但在这几条街里，没有人再提沈振海的名字，他们提的是你的。";else if(s.endingReason==="faded")line="最后清点的时候，账簿上只剩几行。人陆续走了，招牌换了颜色，老街还在，只是不再有人为它开会。和联胜没有被谁一刀砍死，它是被这座城慢慢挤了出去。";else if(!victory)line="老街的招牌被摘下时，祖堂里没有人说话。父亲留下的那本蓝色账簿，终于没有人再往后翻。";else if(s.peaceUnified)line="最后一张桌上没有摔杯子。对方把印放下、把人交出来，第二天两家的伙计一起去码头点货。雾港统一的那天，医馆里一个新伤号都没有。";else if(styleKey==="yi")line="中环的招牌升起时，从敌对社团过来的人也站在人群里。他们服的不是沈振海的姓，是你这些年没赖掉的账。";else if(styleKey==="wei")line="最后一块招牌落地后，雾港安静了很久。没人怀疑你说的话，也没人敢问那些空着的椅子原来属于谁。";else line="雾港的货车、码头和铺面账本上，最后都出现了和联胜的名字。父亲留下的社团被你变成了一台不会停的机器。";const aqiLine=aqi?`<p>阿七站在人群最后面。这些年他学会的是“${styleName}”。有一天这枚龙头印再交到下一个人手上时，他大概会用同一种方式坐下。</p>`:"";const rank=victory?recordLeaderboard(s):null;
  const rankLine=victory&&rank?`<p class="lb-rank">一统用时 <b>${s.month+1}</b> 个月 · 名录第 <b>${rank}</b> 位${rank===1?"——雾港最快的话事人":""}</p>`:"";
  $("endingBody").innerHTML=`<span class="eyebrow">${victory?(s.peaceUnified?"结账 · 一张桌上谈完":"结账 · 一统雾港"):settled?"结账 · 各安其位":"结账 · 父业到此"}</span><h1>${title}</h1><div class="story-body"><p>${line}</p>${aqiLine}</div>${rankLine}<div class="ending-stats"><div><b>${s.month+1}</b><span>经过月数</span></div><div><b>${ownTerritories(s).length}</b><span>地盘</span></div><div><b>${s.wins}</b><span>胜场</span></div><div><b>${ownedOfficers(s).length}</b><span>最终头目</span></div></div><button id="endingRestart" class="primary-btn">重新接印</button><button id="endingLbBtn" class="secondary-btn">查看排行榜</button>`;$("endingRestart").addEventListener("click",()=>{if(confirm("删除当前存档并重新开始？")){deleteSave();S=null;showMenu()}});$("endingLbBtn").addEventListener("click",()=>showLeaderboard(s.runId))}

// iOS Safari 10+ ignores user-scalable=no, so pinch has to be blocked here too.
// touch-action:manipulation in style.css covers double-tap zoom.
function lockZoom(){["gesturestart","gesturechange","gestureend"].forEach(t=>document.addEventListener(t,e=>e.preventDefault(),{passive:false}))}

function boot(){lockZoom();const saved=loadGame();$("newGameBtn")?.addEventListener("click",showCreator);$("leaderboardBtn")?.addEventListener("click",()=>showLeaderboard());$("continueBtn")?.addEventListener("click",()=>{S=loadGame();showGame()});$("creedPicker")?.querySelectorAll("[data-creed]").forEach(b=>b.addEventListener("click",()=>{creatorCreed=b.dataset.creed;$("creedPicker").querySelectorAll("button").forEach(x=>x.classList.toggle("active",x===b))}));$("difficultyPicker")?.querySelectorAll("[data-difficulty]").forEach(b=>b.addEventListener("click",()=>{creatorDifficulty=b.dataset.difficulty;$("difficultyPicker").querySelectorAll("button").forEach(x=>x.classList.toggle("active",x===b))}));$("rerollMutatorsBtn")?.addEventListener("click",()=>{creatorMutators=rollMutators();renderMutatorRoll()});$("startGameBtn")?.addEventListener("click",()=>{S=createInitialState($("playerName").value,creatorCreed,creatorDifficulty,creatorMutators);prologueIndex=0;$("creator").classList.add("hidden");$("prologue").classList.remove("hidden");renderPrologue()});$("nextPrologueBtn")?.addEventListener("click",()=>{if(prologueIndex<PROLOGUE.length-1){prologueIndex++;renderPrologue()}else showGame()});$("gameNav")?.querySelectorAll("[data-tab]").forEach(b=>b.addEventListener("click",()=>{if(!S){showMenu();return}S.tab=b.dataset.tab;saveGame();renderAll()}));$("endMonthBtn")?.addEventListener("click",()=>S&&advanceMonth(S));$("mobileStatus")?.addEventListener("click",()=>{const open=$("sideColumn").classList.toggle("open");$("mobileStatus").setAttribute("aria-expanded",String(open))});$("saveBtn")?.addEventListener("click",()=>{if(saveGame())toast("进度已保存在本机")});$("restartBtn")?.addEventListener("click",()=>{if(confirm("删除当前存档并重新开始？")){deleteSave();S=null;showMenu()}});showMenu();if(saved&&saved.ended){S=saved}}

if(typeof document!=="undefined")document.addEventListener("DOMContentLoaded",boot);
if(typeof module!=="undefined"&&module.exports)module.exports={SKILLS,monthDisplay,recruitYield,monthlyInflow,territoryRecruit,leaderScore,battleCtx,defenderPower,enemyLineup,lvNeed,lvOf,gainXP,levelUp,skillTiers,skillLabel,enemyYearUp,migrateLevels,isHomeHQ,hqLocked,HQ_OF,PEOPLE,MIN_TROOPS,migratePeopleScale,officerSkills,splitTroops,troopCap,maxTroops,buildBattleUnits,simulateBattleOdds,enterpriseProfit,enterpriseForecast,districtHonors,recordEnterpriseEarnings,DISTRICTS,INDUSTRIES,enterpriseGross,enterpriseUpkeep,enterpriseTick,developEnterprise,setEnterprisePolicy,CHARACTER_DEFS,TERRITORY_DEFS,RANDOM_EVENTS,CHAIN_STEPS,POSTURES,MUTATORS,sortLeaderboard,rankOf,recordLeaderboard,loadLeaderboard,postureOf,postureMult,rerollPosture,rollMutators,governorTick,isGovernor,governorOf,truceCost,inciteChance,aliveAIFactions,breachActive,blockadeActive,siegeDrain,adjacentEnemy,blockadeTarget,blockadeCost,runBlockade,turncoatTarget,turncoatChance,turncoatCost,runTurncoat,factionDisorder,disorderTick,enemyCap,pruneSiege,decisiveReady,decisivePrep,decisiveTarget,decisiveDefPower,decisivePeace,decisivePeaceCost,offerDecisive,siegeCandidate,maybeSiegeWarn,resolveSiege,siegePower,siegeDefense,eraTick,factionTerritories,MAX_MONTHS,ACTIONS,FACTIONS,checkCrises,checkChapter,scheduleIn,pumpSchedule,createInitialState,makeCommonCandidate,refreshRecruitMarket,hireCommon,totalCrew,crewCap,drainCrew,recoverCrew,officerTension,enemyTurn,enemyGrowth,effectiveGuard,tickSettling,settlingTerritories,woundedCareCost,monthlyGross,monthlyUpkeep,attackableTerritories,estimateBattle,startBattle,stageOptions,applyStageChoice,finishBattle,resolveBattle,advanceMonth,ownTerritories,officerCapacity,applyAction,applyEconomy,checkInsolvency,monthDisplay,normalizeState,namedCandidateStatus};
