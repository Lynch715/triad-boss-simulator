import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const g=createRequire(import.meta.url)('../app.js');
const ids=Object.keys(g.TERRITORY_DEFS);
assert.equal(ids.length,36);assert.equal(Object.keys(g.DISTRICTS).length,18);
assert.equal(new Set(Object.values(g.DISTRICTS).flatMap(d=>d.territories)).size,36);
for(const [id,d] of Object.entries(g.TERRITORY_DEFS)){
 assert.equal(g.DISTRICTS[d.district].region,d.region);
 for(const n of d.neighbors)assert.ok(g.TERRITORY_DEFS[n]?.neighbors.includes(id),`${id} → ${n} must be reciprocal`);
}
const visited=new Set(['old_street']),queue=['old_street'];
while(queue.length){for(const n of g.TERRITORY_DEFS[queue.shift()].neighbors)if(n!=='central_harbor'&&!visited.has(n)){visited.add(n);queue.push(n)}}
assert.equal(visited.size,35,'all ordinary locations reachable without final district');
const s=g.createInitialState('经营验收','li','standard');
assert.equal(g.developEnterprise(s,'clocktower','commerce'),false,'cannot build on enemy land');
s.cash=100;const initialGross=g.monthlyGross(s),initialUpkeep=g.monthlyUpkeep(s);
assert.ok(g.developEnterprise(s,'old_street','commerce'));assert.equal(s.cash,74);assert.equal(s.ap,2);
assert.equal(g.enterpriseGross(s,'old_street'),0);assert.equal(g.enterpriseUpkeep(s,'old_street'),0);
assert.equal(g.developEnterprise(s,'old_street','commerce'),false,'cannot pay twice while constructing');
g.enterpriseTick(s);assert.equal(s.territories.old_street.building,1);g.enterpriseTick(s);
assert.ok(g.monthlyGross(s)>initialGross);assert.equal(g.monthlyUpkeep(s),initialUpkeep+4);
const before=s.cash;const eco=g.applyEconomy(s);assert.equal(s.cash,Math.round((before+eco.net)*10)/10,'settlement really credits net cash');
const balanced=g.enterpriseGross(s,'old_street');assert.ok(g.setEnterprisePolicy(s,'old_street','growth'));assert.ok(g.enterpriseGross(s,'old_street')>balanced);
assert.equal(g.setEnterprisePolicy(s,'old_street','care'),false);s.month++;assert.ok(g.setEnterprisePolicy(s,'old_street','care'));
const stable=s.territories.old_street.stability;g.enterpriseTick(s);assert.equal(s.territories.old_street.stability,Math.min(100,stable+4));
s.territories.clocktower.owner='player';s.cash=100;s.ap=3;g.developEnterprise(s,'clocktower','logistics');g.enterpriseTick(s);g.enterpriseTick(s);
const linked=g.enterpriseGross(s,'clocktower');s.territories.old_street.owner='free';assert.ok(g.enterpriseGross(s,'clocktower')<linked,'supply link ends when adjacent business is lost');
assert.equal(g.setEnterprisePolicy(s,'old_street','balanced'),false);
const restored=g.normalizeState(JSON.parse(JSON.stringify(s)));assert.equal(restored.territories.clocktower.industry,'logistics');
const legacy=g.createInitialState('旧档');delete legacy.territories.tungchung;delete legacy.territories.causeway;legacy.factions.wan.defeated=true;
assert.ok(g.normalizeState(legacy));assert.equal(legacy.territories.causeway.owner,'free');assert.equal(Object.keys(legacy.territories).length,36);
const ending=g.createInitialState();ending.ended=true;ending.endingReason='unified';delete ending.territories.tungchung;g.normalizeState(ending);assert.equal(ending.territories.tungchung.owner,'player');
const gate=g.createInitialState();for(const t of Object.values(gate.territories))t.owner='east';gate.territories.old_street.owner='player';gate.factions.wan.defeated=gate.factions.long.defeated=true;
for(const id of ids.filter(id=>id!=='central_harbor').slice(0,8))gate.territories[id].owner='player';assert.equal(g.decisiveReady(gate),null,'8 territories cannot trigger large-map finale');
for(const id of ids.filter(id=>id!=='central_harbor'))gate.territories[id].owner='player';assert.ok(g.attackableTerritories(gate).includes('central_harbor'));
console.log('18 districts / 36 locations: geography, economy, policies, supply links, save migration and finale tests passed');
