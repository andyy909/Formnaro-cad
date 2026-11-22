// Campaign effort resolution: one binding effective plan feeds preview, execution and completion.
// Only the provider and the result rows are simulated; roles, expandPlan, the effective-plan resolver and runCampaign are real.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),os=require('node:os'),path=require('node:path');
const {runCampaign}=require('../backend/ai-test-lab-campaign.cjs');
const {expandPlan,preset}=require('../backend/ai-test-lab-plan.cjs');
const {resolveEffectivePlan}=require('../backend/ai-test-lab-effective-plan.cjs');
const {createLabRoles}=require('../backend/ai-lab-roles.cjs');
const {validateConfig}=require('../backend/ai-provider.cjs');

const PROVIDER='https://api.deepseek.com';
const deepseek={key:'secret-modeler-123456789',config:validateConfig({baseUrl:PROVIDER,model:'deepseek-flash',protocol:'responses',reasoningEffort:'high'})};
let profile=deepseek;
const connectionsFor=levels=>({
 connection:()=>structuredClone(profile),
 providers:()=>[{id:PROVIDER,label:PROVIDER,model:'deepseek-flash',hasKey:true,configured:true}],
 credential:async(c,key)=>key,
 catalog:async({config})=>({hasKey:true,availableModelIds:[config.model],models:[{id:config.model,name:config.model,vision:true,reasoningEfforts:levels}]}),
 redact:s=>s
});

// Mimics the diagnostic start adapter, including the persisted series receipt.
// The role resolver, expansion, campaign, and result matching are production code.
async function harness(t,{effort,providerId=PROVIDER,levels=['low','high','max'],modelId='deepseek-flash',serve=(n,rows)=>rows,receiptPlan=plan=>plan,phases=Infinity,signal=new AbortController().signal}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-campaign-effort-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const roles=createLabRoles({directory:dir,credentials:()=>structuredClone(profile),provider:{},connections:connectionsFor(levels)});
 roles.save('modeler',{providerId,model:modelId,effort});
 const records=[],starts=[],resolved=[];let n=0;
 const start=async plan=>{
  const selected=roles.freeze(plan.roles,plan.monitor);
  const modeler=await roles.resolve('modeler',selected.modeler,{seriesEfforts:plan.efforts});
  // The real starter normalizes the public model/provider identity in its receipt.
  selected.modeler={...selected.modeler,providerId:modeler.providerId,model:modeler.config.model};
  const expanded=expandPlan(receiptPlan({...plan,roles:selected}));
  const seriesId=crypto.randomUUID();
  resolved.push(modeler.public.effectiveEffort);
  starts.push({name:plan.name,actual:expanded.trials,efforts:[...new Set(expanded.rows.map(r=>r.effort))],seriesId});
  const conditions=expanded.rows.map(row=>({...row,seriesId,planHash:expanded.planHash}));
  fs.writeFileSync(path.join(dir,'Serie-'+seriesId+'.json'),JSON.stringify({
   format:'FormnaroLabSeries',version:1,id:seriesId,plan:expanded.plan,planHash:expanded.planHash,
   plannedTrials:expanded.trials,rows:conditions,
  }));
  if(++n>phases)return;
  const rows=conditions.map((spec,i)=>({id:'r'+n+'-'+i,status:'completed',elapsedMs:spec.variant==='D'?2:1,verification:{passed:true},spec}));
  records.push(...serve(n,rows,seriesId));
 };
 const progress=[];
 const campaign=await runCampaign({directory:dir,start,state:()=>({records,lab:{roles:roles.state()}}),preflight:async()=>({passed:true}),report:async()=>{},signal,onProgress:c=>progress.push(c)});
 return {campaign,starts,resolved,records,roles,progress};
}

test('Saved fixed low does not shrink an explicitly multi-level campaign: Pilot runs 9 of 9',async t=>{
 const {campaign,starts,resolved,roles}=await harness(t,{effort:'low',phases:1});
 assert.equal(resolved[0],'low'); // first series level
 assert.deepEqual(starts[0].efforts,['low','high','max']);
 assert.equal(starts[0].actual,9);
 const pilot=campaign.phases[0];
 assert.match(pilot.name,/Pilot/);
 assert.equal(pilot.plannedTrials,9);
 assert.equal(pilot.trials,9);
 assert.equal(pilot.status,'completed');
 assert.equal(pilot.seriesId,starts[0].seriesId);
 assert.deepEqual(pilot.integrity,{expected:9,found:9,missing:0,duplicate:0,foreign:0,unattributed:0,receiptMatches:true});
 assert.match(campaign.phases[1].name,/Entwicklung/);
 assert.equal(roles.selection('modeler').effort,'low','global role selection is not modified');
});

test('Saved series behaves the same as saved fixed low in a campaign',async t=>{
 const {campaign,starts}=await harness(t,{effort:'series',phases:1});
 assert.equal(starts[0].actual,9);
 assert.equal(campaign.phases[0].trials,9);
 assert.equal(campaign.phases[0].status,'completed');
});

test('Complete campaign: confirmation phases run exactly their own effort, never repeated Low',async t=>{
 const {campaign,starts}=await harness(t,{effort:'low'});
 assert.equal(campaign.status,'completed',campaign.error);
 for(const p of campaign.phases){assert.equal(p.status,'completed',p.name);assert.equal(p.trials,p.plannedTrials,p.name);}
 const confirm=starts.filter(s=>/Bestätigung/.test(s.name));
 assert.deepEqual(confirm.map(s=>s.efforts),[['low'],['high'],['max']]);
 assert.deepEqual(starts.filter(s=>!/Bestätigung|Bildvergleich|Auswahl|Übung|Aktiver/.test(s.name)).map(s=>s.efforts),[['low','high','max'],['low','high','max']]);
 assert.equal(new Set(campaign.series).size,campaign.series.length,'one series id per phase');
 assert.deepEqual(campaign.series,starts.map(s=>s.seriesId));
});

test('Unsupported efforts are dropped and documented, announced count matches',async t=>{
 // Real support rules: this model accepts low/high/medium but not max.
 profile={key:deepseek.key,config:validateConfig({baseUrl:'https://api.groq.com/openai/v1',model:'openai/gpt-oss-20b',protocol:'chat'})};
 t.after(()=>{profile=deepseek;});
 const {campaign,starts}=await harness(t,{effort:'low',providerId:'https://api.groq.com',modelId:'openai/gpt-oss-20b',levels:['low','high']});
 assert.equal(campaign.status,'completed',campaign.error);
 assert.deepEqual(campaign.efforts,['low','high']);
 assert.equal(starts[0].actual,6);
 assert.deepEqual(campaign.phases[0].droppedEfforts,['max']);
 assert.equal(campaign.phases[0].plannedTrials,6);
 assert.equal(starts.filter(s=>/Bestätigung/.test(s.name)).length,2);
 assert.deepEqual(campaign.decisions.filter(d=>d.effort).map(d=>d.effort),['low','high']);
});

test('Deliberately fixed low series keeps 3 matching A/C/D rows and preview agrees',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-campaign-effort-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const roles=createLabRoles({directory:dir,credentials:()=>structuredClone(profile),provider:{},connections:connectionsFor(['low','high','max'])});
 roles.save('modeler',{providerId:PROVIDER,model:'deepseek-flash',effort:'low'});
 const p=preset(),plan={...p,caseIds:['assembly'],variants:['A','C','D']};
 const effective=resolveEffectivePlan({...plan,roles:roles.freeze(undefined,plan.monitor)});
 assert.equal(effective.trials,3);
 assert.deepEqual(effective.rows.map(r=>r.variant).sort(),['A','C','D']);
 assert.deepEqual(effective.efforts,['low']);
 assert.equal(effective.trials,expandPlan({...plan,roles:roles.freeze(undefined,plan.monitor)}).trials);
});

test('Missing rows are reported and block the next phase',async t=>{
 const {campaign,starts}=await harness(t,{effort:'low',serve:(n,rows)=>n===1?rows.slice(0,7):rows});
 assert.equal(campaign.status,'blocked');
 assert.match(campaign.error,/Nicht alle geplanten Prüfungen/);
 const pilot=campaign.phases[0];
 assert.equal(pilot.status,'incomplete');
 assert.equal(pilot.trials,7);
 assert.equal(pilot.integrity.missing,2);
 assert.equal(starts.length,1);
});

test('Duplicate rows are detected',async t=>{
 const {campaign}=await harness(t,{effort:'low',serve:(n,rows)=>n===1?[...rows,{...rows[0],id:'dup'}]:rows});
 assert.equal(campaign.status,'blocked');
 assert.equal(campaign.phases[0].integrity.duplicate,1);
 assert.equal(campaign.phases[0].trials,9,'valid rows counted once');
});

test('Foreign rows (other series, or unexpected conditions) are not attributed to the phase',async t=>{
 const other={id:'other',status:'completed',verification:{passed:true},spec:{caseId:'assembly',effort:'low',variant:'A',workflow:'agent',sceneScope:'selection',repeat:0,imageMode:'none',seriesId:'other-series'}};
 const stray=(rows,seriesId)=>({...rows[0],id:'stray',spec:{...rows[0].spec,seriesId,caseId:'drill'}});
 const {campaign}=await harness(t,{effort:'low',serve:(n,rows,seriesId)=>n===1?[other,...rows,stray(rows,seriesId)]:rows});
 const pilot=campaign.phases[0];
 assert.equal(pilot.integrity.found,9);
 assert.equal(pilot.integrity.unattributed,1,'row from another series is not counted');
 assert.equal(pilot.integrity.foreign,1,'unexpected condition inside the series is flagged');
 assert.equal(campaign.status,'blocked');
 assert.ok(!campaign.series.includes('other-series'));
});

test('Abort during a phase is documented on the phase',async t=>{
 const controller=new AbortController();
 const {campaign}=await harness(t,{effort:'low',signal:controller.signal,serve:(n,rows)=>{controller.abort();return rows.slice(0,4);}});
 assert.equal(campaign.status,'cancelled');
 const pilot=campaign.phases[0];
 assert.equal(pilot.status,'cancelled');
 assert.equal(pilot.trials,4);
 assert.equal(pilot.integrity.missing,5);
 assert.ok(pilot.endedAt);
 assert.ok(pilot.error);
});

test('Start without roles is refused rather than silently using the saved effort',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'formnaro-campaign-effort-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const campaign=await runCampaign({directory:dir,start:async()=>assert.fail('must not start'),state:()=>({records:[]}),preflight:async()=>({passed:true}),report:async()=>{},signal:new AbortController().signal,onProgress:()=>{}});
 assert.equal(campaign.status,'blocked');
 assert.match(campaign.error,/Laborrollen/);
});

test('Desktop diagnostic campaign binds its real pilot receipt and opens development without changing fixed Low', async (t) => {
  const { createDiagnostics } = require('../backend/ai-diagnostics.cjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'formnaro-campaign-dispatch-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const revision = '0123456789abcdef';
  const requested = [];
  let runner;
  runner = createDiagnostics({
    app: {}, directory, credentials: () => structuredClone(deepseek),
    connections: connectionsFor(['low', 'high', 'max']),
    reviewerEnabled: false,
    provider: {
      testConnection: async () => ({ models: ['deepseek-flash'] }),
      completeModel: async (config, _key, envelope) => {
        const supervisor = envelope.system.includes('independent Formnaro experiment supervisor');
        if (!supervisor) requested.push(config.reasoningEffort);
        envelope.onDiagnostic?.({ type: 'request', body: { model: config.model } });
        return {
          text: JSON.stringify(supervisor
            ? { verdict: 'continue', reasonCode: 'none', confidence: 0.8, explanation: 'Simulated', evidence: 'Fixture' }
            : { tool: 'offlinecad_preview', arguments: { revision, commands: [{ op: 'create', type: 'box', size: [1, 2, 3] }] } }),
          data: { model: config.model, usage: { input_tokens: 10, output_tokens: 10 } },
        };
      },
    },
    openChild: () => ({
      call: async (method) => {
        if (method === 'setup') return {
          scene: { revision, objects: [], selectionTargets: [] }, context: {}, project: { nodes: [] },
          validationContext: (await import('../src/cad-ai-context.js')).cadAIContext(),
        };
        if (method === 'capture') return 'data:image/png;base64,AQID';
        return {};
      },
      cancel() {},
      close: async () => ({ code: 0, signal: null }),
    }),
    onEvent(event) {
      const current = event.state?.lab?.campaign;
      if (current?.phases.length === 2 && current.phases[1].status === 'running') runner.cancel();
    },
  });
  runner.labPreflight = async () => ({ passed: true });
  runner.labRoleSave({ role: 'modeler', selection: { providerId: PROVIDER, model: 'deepseek-flash', effort: 'low' } });
  const result = await runner.labCampaign();
  assert.equal(result.status, 'cancelled', result.error);
  assert.equal(result.phases[0].status, 'completed', result.error);
  assert.equal(result.phases[0].trials, 9);
  assert.equal(result.phases[0].integrity.receiptMatches, true);
  assert.match(result.phases[1].name, /Entwicklung/);
  assert.equal(result.phases[1].status, 'cancelled');
  assert.deepEqual(requested.toSorted(), ['high', 'high', 'high', 'low', 'low', 'low', 'max', 'max', 'max']);
  assert.equal(runner.state().lab.roles.selections.modeler.effort, 'low');

  const exported = await runner.exportAll('json');
  const broad = JSON.parse(fs.readFileSync(exported.path, 'utf8'));
  const receipt = broad.campaigns.find(campaign => campaign.id === result.id);
  assert.equal(receipt.status, 'cancelled');
  assert.equal(receipt.phases[1].status, 'cancelled');
  assert.equal(receipt.phases[1].trials, 0);
  const markdown = await runner.exportAll('md');
  assert.match(fs.readFileSync(markdown.path, 'utf8'), /Entwicklung .*cancelled .*0 von/);
  const bySeries = await runner.labReport({ seriesId: result.phases[0].seriesId, format: 'json' });
  assert.equal(JSON.parse(fs.readFileSync(bySeries.path, 'utf8')).campaigns[0].id, result.id);
});

function developmentDecision(campaign, effort = 'low') {
  return campaign.decisions.find((decision) => decision.effort === effort);
}

function developmentRows(grade) {
  return (phase, rows) => phase === 2 ? rows.map((row) => ({ ...row, ...grade(row.spec) })) : rows;
}

test('An empty development variant, or two empty variants, leave confirmation open', async (t) => {
  for (const empty of [['C'], ['C', 'D']]) {
    const { campaign } = await harness(t, {
      effort: 'low',
      serve: developmentRows((spec) => empty.includes(spec.variant)
        ? { status: 'failed', verification: undefined, elapsedMs: 1 }
        : { verification: { passed: false }, elapsedMs: 100 }),
    });
    assert.equal(developmentDecision(campaign).selected, null);
    assert.equal(developmentDecision(campaign).confirmation, 'open');
    assert.equal(campaign.phases.filter((phase) => phase.name.startsWith('Bestätigung')).length, 0);
  }
});

test('Fast interrupted attempts with a snapshot do not compensate for incomplete coverage', async (t) => {
  const { campaign } = await harness(t, {
    effort: 'low',
    serve: developmentRows((spec) => spec.effort === 'low' && spec.variant === 'C' && spec.caseId === 'drill'
      ? { status: 'timeout', verification: { passed: true }, elapsedMs: 1 }
      : { elapsedMs: 100 }),
  });
  assert.equal(developmentDecision(campaign).selected, null);
  assert.equal(developmentDecision(campaign).confirmation, 'open');
  assert.ok(!campaign.phases.some((phase) => phase.name.endsWith('Aufgaben · low')));
});

test('Complete comparable groups prefer native success, then measured time', async (t) => {
  const { campaign } = await harness(t, {
    effort: 'low',
    serve: developmentRows((spec) => ({
      verification: { passed: spec.effort !== 'low' || spec.variant === 'D' },
      elapsedMs: spec.effort === 'max' ? 100 : (spec.variant === 'C' ? 25 : 100),
    })),
  });
  assert.equal(developmentDecision(campaign, 'low').selected, 'D');
  assert.equal(developmentDecision(campaign, 'high').selected, 'C');
  assert.equal(developmentDecision(campaign, 'max').selected, null);
  assert.equal(developmentDecision(campaign, 'max').confirmation, 'open');
});

test('A self-consistent receipt with changed limits or monitor cannot complete a phase', async (t) => {
  for (const adjust of [
    (plan) => ({ ...plan, limits: { ...plan.limits, rounds: 1 } }),
    (plan) => ({ ...plan, monitor: { ...plan.monitor, mode: 'off' } }),
  ]) {
    const { campaign } = await harness(t, { effort: 'low', receiptPlan: adjust });
    assert.equal(campaign.phases[0].trials, 9);
    assert.equal(campaign.phases[0].integrity.receiptMatches, false);
    assert.equal(campaign.phases[0].status, 'incomplete');
  }
});

test('Another model or a model change during execution invalidates a development cohort', async (t) => {
  for (const mismatch of [
    { modelIdentity: { exactMatch: false } },
    { modelIdentity: { exactMatch: true }, requestedModel: 'deepseek-flash',
      usageEvents: [{ returnedModel: 'deepseek-v4-pro' }, { returnedModel: 'deepseek-flash' }] },
  ]) {
    const { campaign } = await harness(t, {
      effort: 'low',
      serve: developmentRows((spec) => spec.variant === 'C' && spec.effort === 'low' ? mismatch : {}),
    });
    assert.equal(developmentDecision(campaign).selected, null);
    assert.equal(developmentDecision(campaign).confirmation, 'open');
  }
});
