(() => {
  const root=document.getElementById('count-room-demo'); if(!root)return;
  const data=window.COUNT_ROOM_DATA, $=id=>document.getElementById(id);
  let scenario='roi',step=0,arch=0,session=null,busy=false,view='board',previousBodyOverflow='',runningScenario=null;
  const runErrors={};
  const titles=['The issue at hand','Why the clock matters','How Cursor SDK assists','How the architecture works','Receive the incident','Investigate the SQL','Apply the policy gate','Propose—or stop','Verify the outcome','Fix applied—or alert raised'];
  const chapters=['01 · The issue','02 · Impact of delay','03 · Why Cursor SDK','04 · Architecture','05 · Terminal walkthrough'];
  const stories={
    roi:{name:'Marketing',hook:'One zero-impression campaign can break the entire nightly metric job.',issue:'The marketing SQL divides total spend by total impressions. A campaign with no impressions creates an invalid denominator and interrupts the warehouse job.',owner:'The marketing operations owner needs trustworthy numbers before the next campaign review.',stakes:'Until the job recovers, dashboard users may be looking at stale data without realizing it.',timeline:[['Now · stale visibility','The nightly refresh fails. Teams lose a current view of campaign performance.'],['Next business review · decisions at risk','Budget decisions may use yesterday’s metrics. Someone has to investigate the failure manually before the numbers can be trusted.'],['Repeated failures · growing backlog','Missed refreshes create more reconciliation work and undermine trust in the dashboard. The business cost depends on spend and how long stale metrics are used.']],goal:'Automatically fix the marketing SQL in the local demo, after independent checks pass.',sdk:'Cursor reads the failing query and investigates the denominator edge case. When policy permits, a second agent proposes a minimal SQL change; Python verifies the exact proposal, then automatically applies it to the local demo workspace.',boundary:'The SDK helps interpret and change code. Independent assertions must still prove the metric contract.',outcome:'The marketing SQL is fixed automatically in the local demo. The receipt shows the changed file and passing checks.'},
    ggr:{name:'Revenue',hook:'A one-line date boundary can put revenue into the wrong reporting day.',issue:'The SQL groups wagers at midnight, while this demo property defines its gaming day as 06:00–06:00. Overnight activity can land in the wrong day.',owner:'The finance controller needs reconciled numbers and a controlled correction path.',stakes:'A technically simple fix can affect previously reported periods. The response needs evidence and the right owner.',timeline:[['Now · reconciliation mismatch','Daily revenue disagrees with slot accounting. Finance needs to identify the affected periods and dependencies.'],['Before the next reporting cutoff · decision pressure','An unresolved mismatch can delay sign-off or carry an error into another reporting cycle. The actual deadline must come from the reporting owner.'],['If carried forward · wider correction scope','More downstream reports may need assessment and reconciliation. Previously issued reports may require review; the controller determines the response.']],goal:'Leave the state-regulated revenue SQL unchanged and raise an alert for the controller.',sdk:'Cursor investigates the boundary error and supplies a structured diagnosis. The Python gate blocks the fix agent under the company’s policy for Nevada-regulated reporting, then raises an owner alert.',boundary:'Understanding the fix does not authorize it. Governance is enforced by Python using trusted incident metadata and the tag snapshot.',outcome:'The regulated SQL is unchanged. An OPEN alert in the demo inbox tells the controller and compliance owner what needs review.'},
  };
  const architecture=[
    ['Input','Incident signal','python','A synthetic incident JSON supplies the alert, SQL path and target object. A production scheduler or monitoring webhook would call the same orchestrator.','load_incident() → handle_incident()'],
    ['Cursor SDK','Read-only triage','sdk','A fresh SQL workspace exposes read tools and two callbacks: warehouse_select returns a labeled snapshot; emit_triage returns the diagnosis and suspects.','Agent.create(AgentOptions(...)) → agent.send() → run.messages()'],
    ['Our Python','Policy gate','python','Python includes the original incident target even if the agent omits it. It resolves the strictest tag policy and rejects unknown mappings.','gate.decide() → may_instantiate_fix()'],
    ['Cursor SDK','Bounded proposal','sdk','Only an allowed policy decision reaches a second agent. emit_patch submits complete SQL. Python saves that exact text; it never substitutes a fixture in live mode.','Agent.create(...) → emit_patch({sql})'],
    ['Our Python','Independent checks','python','Run the original and proposed SQL on synthetic test data. Check output columns, retained rows, aggregates and edge cases against expected values.','verify_sql(original) + verify_sql(proposed)'],
    ['Our Python','Apply or alert','python','Automatically apply a passing, authorized fix to the local demo. Otherwise leave SQL unchanged and raise an alert in the demo inbox.','APPLIED.json or ALERT.json + evidence']
  ];
  function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
  function tile(label,title,body){const n=el('article',undefined,'cr-tile');n.append(el('span',label,'cr-label'),el('h3',title),el('p',body));return n;}
  function grid(...nodes){const n=el('div',undefined,'cr-story-grid');n.append(...nodes);return n;}
  function showArtifact(name,text){
    $('cr-modal-title').textContent=name;$('cr-modal-content').textContent=text;
    const dialog=$('cr-artifact-dialog');if(!dialog.open){if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');}
    $('cr-modal-content').scrollTop=0;
  }
  function viewFile(name){showArtifact(name,data[scenario].files[name]||'No artifact for this stage.');}

  function action(text,fn){const n=el('button',text);n.type='button';n.onclick=fn;return n;}
  function stageOf(run,id){return run.stages.find(s=>s.id===id);}
  function verification(run){return run.files['verification.json']?JSON.parse(run.files['verification.json']):null;}
  function checkText(v){return (v.passed?'PASS':'FAIL')+'\n'+(v.checks||[]).map(c=>`  [${c.passed?'PASS':'FAIL'}] ${c.name}`).join('\n')+(v.error?'\n  '+v.error:'');}
  function terminalStages(run){
    const live=run.mode==='live',v=verification(run),fix=stageOf(run,'fix'),privacy=stageOf(run,'privacy-reviewer'),finalAction=stageOf(run,'action');
    const name=run.files['DOSSIER.md']?'DOSSIER.md':'EVIDENCE.md';
    return [
      {label:'01 / signal',text:`$ python -m count_room run ${scenario}${live?' --live':''}\n\n[mode] ${live?'Cursor SDK + local verification':'fixture triage/proposal + real local verification'}\n[incident] ${run.incident.title}\n[target] ${run.incident.target_object}\n[source] ${run.incident.sql_file}`,tone:'command',what:'The entry command starts one complete pipeline. The lines summarize the saved incident and its trusted target.',why:'The original target stays attached to the investigation so the agent cannot silently narrow away a regulated object.',sdk:'No SDK call at this stage. Python receives the signal.',proof:'Source: incident JSON and the saved run. This is a readable replay, not a raw terminal capture.'},
      {label:'02 / triage',text:`[${live?'SDK':'fixture'}] ${live?'structured triage returned':'recorded hypothesis loaded; no SDK call'}\n[diagnosis] ${run.triage.hypothesis}\n[files] ${run.triage.suspect_files.join(', ')}\n\n[impact snapshot]\n${stageOf(run,'profiler').detail}`,what:'A diagnosis connects the alert to a specific SQL behavior. The impact section is a synthetic warehouse snapshot.',why:'The owner needs a reason and scope, not just “the job failed.”',sdk:'Live mode: Agent.create → agent.send → read tools / warehouse_select → emit_triage. run.messages records SDK events. Saved mode loads fixture triage.',proof:'Source: triage result, profile snapshot, and events.jsonl. No live warehouse query is implied.'},
      {label:'03 / policy',text:`[zone] ${run.decision.zone.id}\n[decision] ${run.decision.explanation}\n\n[next] ${fix.blocked?'BLOCKED — do not instantiate fix agent':'ALLOWED — proposal stage may proceed'}\n[production deployment] not performed`,tone:fix.blocked?'fail':'ok',what:'The gate resolves policy before the proposal stage. The decision includes the tag or absence of a governance tag.',why:'The same technical capability must behave differently for a marketing dashboard and a filed revenue number.',sdk:'No SDK call. Python owns authorization. If blocked, there is no second agent to instruct or override.',proof:'Source: PolicyDecision and the fix stage status. These are this demo company’s rules.'},
      {label:'04 / proposal',text:fix.blocked?`[BLOCKED] ${fix.detail}\n[SDK] proposal agent not created\n[output path] change-control dossier`:`[${live?'SDK':'fixture'}] ${live?'emit_patch returned SQL':'recorded proposal selected; no SDK call'}\n[saved] proposed.sql\n\n${run.files['patch.diff']||fix.detail}`,tone:fix.blocked?'fail':undefined,what:fix.blocked?'This is the refusal branch. There is no applied diff and no executable proposal to verify.':'This is the actual unified diff: “−” removes a line, “+” adds a line, and unchanged context shows where it belongs.',why:fix.blocked?'The right output is an evidence-backed escalation, even when the fix looks obvious.':'A reviewer can inspect the exact proposal. A plausible explanation is not enough.',sdk:fix.blocked?'The second Agent.create is skipped.': 'Live mode creates the proposal agent and captures emit_patch. Python owns artifact writes and tests the returned SQL without replacement.',proof:fix.blocked?'Source: blocked fix stage. The dossier’s advisory SQL attachment is explicitly a fixture example.':'Source: patch.diff and proposed.sql. The repository SQL remains unchanged.'},
      {label:'05 / verification',text:v?`[engine] Local SQL checks · synthetic test data\n\nBEFORE / original SQL\n${checkText(v.before)}\n\nAFTER / actual proposal\n${checkText(v.after)}${privacy?'\n\n[privacy review]\n'+privacy.detail:''}\n\n[production deployment] false`:`[SKIPPED] ${stageOf(run,'clone').summary}\n[reason] proposal prohibited by policy\n[next] assemble dossier`,tone:(!v||privacy||!v.after.passed)?'fail':'ok',what:v?'The verifier executes SQL and reports independent assertions. Before/after makes the repaired behavior visible.':'There is no proposal to run. Skipped verification is the correct result for the blocked branch.',why:privacy?'The code can pass while existing data exposure remains. The incident stays open.':'A changed query needs evidence; passing local checks still does not mean production has been deployed.',sdk:'No SDK call. Python runs independent SQL checks on the proposal. Privacy uses a separate deterministic rule over synthetic exposure facts.',proof:'Source: verification.json when present and the privacy stage. Local checks do not use a Snowflake clone.'},
      {label:'06 / apply or alert',text:`[outcome] ${finalAction.summary}\n[scope] ${run.action_scope}\n[production deployment] false\n\n${run.files[run.auto_remediated?'APPLIED.json':'ALERT.json']}\n\n[report] ${name}\n[inspect] Open full report for the supporting evidence.`,tone:run.auto_remediated?'ok':'fail',what:run.auto_remediated?'The verified SQL has actually replaced the file in this run’s local demo workspace. The receipt includes before/after hashes and its path.':'The SQL is unchanged. An OPEN alert identifies the controller and compliance owner, the blocking policy, and the required review.',why:run.auto_remediated?'The ordinary marketing incident is fixed without waiting for an engineer to apply the SQL.':'State-regulated reporting follows the company’s controlled-change policy. The agent investigates but cannot make the change.',sdk:run.auto_remediated?'In live mode, Cursor authors the fix. Python independently verifies and applies it. In fixture mode, the input patch is canned but verification and local application still execute.':'Cursor investigates in live mode. Python blocks the second agent and writes the alert. Delivery here is the local demo inbox, not an external notification.',proof:run.auto_remediated?'Source: applied.sql, APPLIED.json, and the actual workspace file.':'Source: ALERT.json, unchanged workspace SQL, DOSSIER.md and events.jsonl.'}

    ];
  }
  function renderTerminal(out,run){
    const current=step-4,stages=terminalStages(run),part=stages[current];
    const layout=el('div',undefined,'cr-terminal-grid'),terminal=el('div',undefined,'cr-terminal');
    const bar=el('div',undefined,'cr-terminal-bar');bar.append(el('i',undefined,'cr-dot'),el('i',undefined,'cr-dot'),el('i',undefined,'cr-dot'),el('span',`count-room / ${scenario} / ${run.mode==='live'?'live SDK results':'saved fixture results'}`));terminal.append(bar);
    const body=el('div');body.id='cr-terminal-body';body.setAttribute('role','region');body.setAttribute('aria-label','Terminal output');body.tabIndex=0;
    stages.slice(current,current+1).forEach(s=>{const i=current;
      const n=el('div',undefined,'cr-log-block'+(i===current?' current':''));n.append(el('div',s.label,'cr-log-title'));
      if(view==='code'){
        const bundle=data.source_code;
        const keys=i===3&&scenario==='ggr'?['gate_branch','raise_alert']:i===5?[run.auto_remediated?'apply_fix':'raise_alert','handoff']:stepCode[i+4];
        if(bundle&&keys){
          const calls=el('nav',undefined,'cr-controls cr-terminal-calls');calls.setAttribute('aria-label','SDK source in terminal');const code=el('div');
          function showCall(key){
            const snippet=bundle.snippets[key],file=bundle.files[snippet.file];
            calls.querySelectorAll('button').forEach(b=>{b.classList.toggle('selected',b.dataset.terminalSnippet===key);b.setAttribute('aria-pressed',String(b.dataset.terminalSnippet===key));});
            code.replaceChildren(el('div',`SOURCE EXCERPT / ${snippet.file}:${snippet.start}`,'cr-log-title'),el('div',file.path,'cr-code-path'),sourceLines(snippet.lines,snippet.start),el('p',codeChoices[key],'cr-terminal-explain'),action('Open full '+snippet.file,()=>showArtifact(file.path,pyLines(file.text).map((line,index)=>`${index+1}  ${line}`).join('\n'))));
          }
          keys.forEach(key=>{const b=action(bundle.snippets[key].title,()=>showCall(key));b.dataset.terminalSnippet=key;calls.append(b);});
          n.append(calls,code);showCall(keys[0]);
        }
      }
      if(view!=='code')n.append(el('div',`RESULT / ${run.mode==='live'?'completed live run':'saved fixture run'}`,'cr-log-title'),el('pre',s.text,s.tone?'cr-log-'+s.tone:''));body.append(n);
    });terminal.append(body);
    const aside=el('aside',undefined,'cr-explainer');[['What you’re seeing',part.what],['Why this matters',part.why],['Cursor SDK’s role',part.sdk],['Evidence behind these lines',part.proof]].forEach(([h,p])=>aside.append(el('h4',h),el('p',p)));
    aside.append(el('h4','Terminal legend'),el('p','Blue: entry command and context. Teal: stage labels. Green: an allowed or passing result. Pink: a failure, refusal, or skipped branch. Only the current stage is shown. Next advances the run.'));
    if(current===3&&!stageOf(run,'fix').blocked)aside.append(action('Open proposed.sql',()=>viewFile('proposed.sql')));
    if(current===4){aside.append(action('Show bad-proposal failure',showFailure));}
    if(current===5){aside.append(action(run.auto_remediated?'Open applied SQL':'Open owner alert',()=>viewFile(run.auto_remediated?'applied.sql':'ALERT.json')));aside.append(action('Open full report',()=>viewFile(run.files['DOSSIER.md']?'DOSSIER.md':'EVIDENCE.md')),action('Open raw event log',()=>viewFile('events.jsonl')));}
    layout.append(terminal,aside);out.append(layout);body.scrollTop=body.lastElementChild.offsetTop-body.offsetTop;
  }
  function renderArchitecture(out){
    out.append(el('p','Click a component to see its responsibility. Teal components use Cursor; blue components are application code. The policy gate controls the proposal branch.'));
    const path=el('div',undefined,'cr-architecture');
    architecture.forEach(([owner,title,type],i)=>{const blocked=scenario==='ggr'&&i===3;const b=action('',()=>{arch=i;render();});b.className='cr-'+(blocked?'blocked':type)+(arch===i?' selected':'');b.append(el('small',blocked?'Skipped in this scenario':owner),el('strong',title));b.setAttribute('aria-pressed',String(arch===i));path.append(b);});out.append(path);
    const a=architecture[arch];out.append(tile(a[0],a[1],scenario==='ggr'&&arch===3?'This path is not entered. The regulatory policy sets may_patch=false, so the workflow raises an alert and creates the dossier.':a[3]),el('p',a[4],'cr-note'));
    out.append(el('p','Data boundary: SQL lives in a fresh local workspace. Agents read files and call bounded tools; Python tests and applies permitted fixes in the local demo workspace. Tag/impact/lineage lookups use synthetic snapshots. Verification runs SQL locally. Production services are not connected.','cr-note'));
  }
  const codeChoices={
    apply_fix:'Only a passing fix with automatic-remediation permission reaches this branch. Python rechecks the SQL, atomically replaces the local demo file, and records a receipt.',
    raise_alert:'When change is prohibited, Python writes an OPEN alert with the owners and required action. The workspace SQL remains unchanged; no external message is sent.',
    dispatch:'This switch is where the incident leaves ordinary application code and enters Cursor in live mode. Fixture replay takes the other branch.',
    triage_create:'This is the first SDK agent. AgentOptions selects read tools; LocalAgentOptions supplies the workspace and custom evidence/result callbacks.',
    triage_prompt:'agent.send() gives the coding agent a concrete incident, its source file, and an instruction to return structured triage. The incident body is explicitly treated as evidence.',
    triage_events:'run.messages() supplies SDK events for the audit log. run.wait() checks completion; an error must stop the pipeline.',
    triage_result:'Cursor calls emit_triage through a CustomTool. The callback captures structured fields that Python can use in the policy decision.',
    warehouse_tool:'The SDK can call this Python evidence adapter. It returns a labeled synthetic snapshot in this prototype, and rejected queries return a denied result.',
    trusted_target:'Python adds the original incident file and object before deciding policy. The agent cannot authorize a narrower scope by omitting that target.',
    gate_decide:'gate.py is Python only. decide() looks up warehouse tags and picks the strictest zone. No model call.',
    gate_may_fix:'may_instantiate_fix is the yes/no for Agent 2. False for NGCB_MICS: the writing agent is never created.',
    gate_zones:'Untagged objects are STANDARD. NGCB_MICS beats RESTRICTED_PII. The zone is not an agent-editable file.',
    gate_branch:'This return happens before live_fix is called. For regulated revenue, there is no second Agent.create call to override with a prompt.',
    fix_create:'This is the second SDK agent, reached only after policy permits a proposal. Its emit_patch custom tool submits SQL; it does not write the repository.',
    fix_callback:'The exact SQL returned through the SDK callback is captured here. Empty or repeated proposals are rejected, and the submission is audited.',
    fix_prompt:'The second agent receives the affected SQL file and incident, then returns a complete replacement query through emit_patch. Its run events are recorded.',
    verify_proposal:'The proposal flows into proposed.sql, patch.diff, and the verifier. These are Python operations, so the model is not approving its own work.',
    handoff:'Python chooses the report based on the policy decision. The regulated branch includes explicitly labeled advisory fixture SQL rather than an agent-authored patch.'
  };
  const stepCode={2:['triage_create','fix_create'],4:['dispatch'],5:['triage_create','triage_prompt','warehouse_tool','triage_result','triage_events'],6:['trusted_target','gate_decide','gate_may_fix','gate_branch'],7:['fix_create','fix_callback','fix_prompt'],8:['verify_proposal'],9:['apply_fix','raise_alert','handoff']};
  const architectureCode=[['dispatch'],['triage_create','triage_prompt','warehouse_tool','triage_result','triage_events'],['trusted_target','gate_decide','gate_may_fix','gate_branch'],['fix_create','fix_callback','fix_prompt'],['verify_proposal'],['apply_fix','raise_alert','handoff']];
  function pyLines(text){
    const lines=String(text).split(/\r?\n/);
    if(lines.length&&lines[lines.length-1]==='')lines.pop();
    return lines;
  }
  function sourceLines(lines,start,focus){
    const pre=el('pre',undefined,'cr-source');
    lines.forEach((text,i)=>{const number=start+i;const row=el('span',undefined,'cr-source-line'+(focus&&number>=focus[0]&&number<=focus[1]?' focus':''));row.append(el('span',String(number),'cr-line-number'));
      text.split(/(Agent\.create|AgentOptions|LocalAgentOptions|CustomTool|agent\.send|run\.messages|run\.wait|emit_patch|emit_triage)/g).forEach((part,j)=>row.append(el('span',part,j%2?'cr-sdk-token':undefined)));pre.append(row);});
    return pre;
  }
  function renderCode(out,keys){
    const bundle=data.source_code;if(!bundle)return;
    const card=el('section',undefined,'cr-code');card.setAttribute('aria-label','Implementation code');
    card.append(el('h3','The code behind this step'),el('p','Exact excerpts from the Python implementation. Teal highlights the SDK calls and callbacks. Expand the file to see the surrounding code.','cr-note'));
    const tabs=el('nav',undefined,'cr-controls');tabs.setAttribute('aria-label','Code excerpts');const content=el('div');
    function choose(key){const snippet=bundle.snippets[key],file=bundle.files[snippet.file];
      tabs.querySelectorAll('button').forEach(b=>{b.classList.toggle('selected',b.dataset.snippet===key);b.setAttribute('aria-pressed',String(b.dataset.snippet===key));});
      content.replaceChildren(el('p',codeChoices[key],'cr-quote'),el('p',`${file.path}:${snippet.start} · source ${file.sha256.slice(0,8)}`,'cr-code-path'),sourceLines(snippet.lines,snippet.start));
      const full=el('details');full.append(el('summary',`Open full ${snippet.file} · excerpt highlighted`));
      full.addEventListener('toggle',()=>{if(full.open&&!full.querySelector('pre'))full.append(sourceLines(pyLines(file.text),1,[snippet.start,snippet.start+snippet.lines.length-1]));});
      content.append(full,el('p',data[scenario].mode==='live'?'Source exported from the local implementation. This run used the live SDK path.':'This is the real live-mode implementation; the displayed fixture run did not call Cursor.','cr-note'));
    }
    keys.forEach(key=>{const b=action(bundle.snippets[key].title,()=>choose(key));b.dataset.snippet=key;tabs.append(b);});card.append(tabs,content);out.append(card);choose(keys[0]);
  }

  function sqlDiffRows(before,after){
    const a=before.trimEnd().split('\n'),b=after.trimEnd().split('\n');
    const lcs=Array.from({length:a.length+1},()=>new Uint32Array(b.length+1));
    for(let i=a.length-1;i>=0;i--)for(let j=b.length-1;j>=0;j--)lcs[i][j]=a[i]===b[j]?1+lcs[i+1][j+1]:Math.max(lcs[i+1][j],lcs[i][j+1]);
    const rows=[];let i=0,j=0;
    while(i<a.length||j<b.length){
      if(i<a.length&&j<b.length&&a[i]===b[j]){rows.push({kind:'same',old:i+1,new:j+1,text:a[i]});i++;j++;}
      else if(i<a.length&&(j===b.length||lcs[i+1][j]>=lcs[i][j+1])){rows.push({kind:'removed',old:i+1,text:a[i]});i++;}
      else{rows.push({kind:'added',new:j+1,text:b[j]});j++;}
    }
    return rows;
  }
  function renderSqlDiff(out,run,reveal=true){
    const before=run.files['original.sql']||data.sql_sources?.[scenario];
    const advisory=scenario==='ggr';const after=run.files[advisory?'proposed-fix.sql':'proposed.sql'];
    if(!before||!after)return;
    const rows=sqlDiffRows(before,after),card=el('section',undefined,'cr-diff-card');card.setAttribute('aria-label','SQL before and after');
    card.append(el('h3',reveal?'What broke—and the SQL correction':'The broken SQL'),el('p',run.incident.sql_file,'cr-code-path'));
    const reasons=scenario==='roi'?['The denominator can be zero. That prevents the nightly metric from producing a usable result.','The expected correction guards the denominator with NULLIF. Zero impressions yield NULL, while ordinary ratios remain unchanged. Independent checks decide whether the actual proposal is valid.']:['The query groups at midnight. Under this demo’s 06:00 gaming-day convention, overnight wagers land in the wrong reporting day.','The advisory example shifts timestamps back six hours before grouping. It requires controller/compliance review and is not automatically applied.'];
    card.append(el('p',reasons[0],'cr-quote'));
    let shown=reveal;
    const toggle=action(shown?'Hide correction':'Reveal the correction',()=>{shown=!shown;draw();});toggle.className='cr-diff-toggle';card.append(toggle);
    const body=el('div');card.append(body);
    function pane(title,old){const section=el('section');section.append(el('h4',title));const pre=el('pre',undefined,'cr-diff-code');
      rows.filter(r=>old?r.kind!=='added':r.kind!=='removed').filter(r=>!r.text.trimStart().startsWith('--')).forEach(r=>{
        const line=el('span',undefined,'cr-diff-line cr-diff-'+r.kind);line.append(el('span',String(old?r.old:r.new),'cr-diff-number'),el('span',r.kind==='same'?'  ':old?'− ':'+ ','cr-diff-sign'),el('span',r.text));pre.append(line);
      });section.append(pre);return section;}
    function draw(){body.replaceChildren();toggle.textContent=shown?'Hide correction':'Reveal the correction';toggle.setAttribute('aria-expanded',String(shown));
      const split=el('div',undefined,'cr-diff-split'+(shown?'':' cr-diff-single'));split.append(pane('BEFORE · broken query',true));
      if(shown)split.append(pane(advisory?'ADVISORY ONLY · change blocked':run.auto_remediated?'AFTER · applied in local demo':run.patch_verified?'PROPOSED · checks pass, not applied':'PROPOSED · checks failed, not applied',false));body.append(split);
      if(shown){body.append(el('p',reasons[1]));body.append(el('p',advisory?'Blocked by policy. This is a fixture example of the correction—not SDK output. The regulated workspace SQL stays unchanged.':`Proposal source: ${run.mode==='live'?'Cursor SDK':'fixture'}. Local checks: ${run.patch_verified?'PASS':'FAIL'}. Applied locally: ${run.auto_remediated?'yes':'no'}.`,'cr-note'));}
      body.append(el('p','Red − removes a line. Green + adds a line. Line numbers refer to the original and proposed files. SQL view omits comments; the full diff below preserves every line.','cr-note'));
      if(shown){const full=el('details');full.append(el('summary','Open the full unified diff'));const raw=run.files['patch.diff']||`--- ${run.incident.sql_file}\n+++ advisory-only.sql\n@@ -1,${before.trimEnd().split('\n').length} +1,${after.trimEnd().split('\n').length} @@\n`+rows.map(r=>(r.kind==='added'?'+':r.kind==='removed'?'-':' ')+r.text).join('\n')+'\n';
        full.append(el('pre',raw,'cr-file-content'));body.append(full);}
    }
    draw();out.append(card);
  }

  function renderFixChart(out){
    const chart=el('section',undefined,'cr-fix-chart');chart.setAttribute('aria-label','How each incident is handled');
    chart.append(el('h3','What gets fixed—and how'),el('p','Click any stage to see its code, diff, or evidence. These paths describe the workflow; the board below shows saved outcomes.','cr-note'));
    const paths={
      roi:[['Issue','Zero impressions break campaign SQL',0,'story'],['Cursor SDK','Diagnose the denominator error',5,'code'],['Python policy','Allow a marketing repair',6,'code'],['Cursor SDK','Propose guarded division',7,'diff'],['Python checks + action','Verify → apply locally',9,'result']],
      ggr:[['Issue','Revenue uses the wrong day boundary',0,'story'],['Cursor SDK','Diagnose the 06:00 boundary',5,'code'],['Python policy','Regulated reporting: block changes',6,'code'],['No fix agent','SQL stays unchanged',7,'result'],['Python alert','Controller reviews evidence',9,'result']]
    };
    for(const key of ['roi','ggr']){
      const row=el('div',undefined,'cr-fix-path cr-fix-'+key);row.append(el('strong',stories[key].name,'cr-path-name'));
      paths[key].forEach(([owner,label,index,targetView],i)=>{
        const node=action('',()=>{scenario=key;step=index;view=targetView;render();});node.className='cr-flow-node';node.dataset.crFlow=key+'-'+i;node.disabled=busy;
        node.append(el('span',owner,'cr-label'),el('strong',label));row.append(node);
      });chart.append(row);
    }
    out.append(chart);
  }
  function renderBoard(out){
    out.append(el('h3','Two incidents. Two accountable outcomes.'),el('p','Cursor investigates and proposes code. Python controls permission, verifies the result, and applies a fix or raises an owner alert. Select a card’s evidence without leaving the board.','cr-note'));
    renderFixChart(out);
    const board=el('div',undefined,'cr-board');
    const lanes=[['working','In progress'],['fixed','Fixed locally'],['review','Needs owner review']];
    const runs=['roi','ggr'].filter(key=>data[key]).map(key=>({key,run:data[key],lane:runningScenario===key?'working':runErrors[key]?'review':data[key].auto_remediated?'fixed':'review'}));
    for(const [id,label] of lanes){
      const lane=el('section',undefined,'cr-board-lane cr-board-'+id);lane.setAttribute('aria-label',label);
      const items=runs.filter(item=>item.lane===id);lane.append(el('h4',label+' · '+items.length));
      if(!items.length)lane.append(el('p',id==='working'?'No run executing from this page.':'No runs in this state.','cr-note'));
      for(const {key,run} of items){
        const card=el('article',undefined,'cr-run-card');card.dataset.crRun=key;
        card.append(el('span',stories[key].name.toUpperCase(),'cr-label'),el('h3',key==='roi'?'Campaign metrics fail':'Revenue day mismatch'));
        if(runningScenario===key){card.append(el('p','Python is executing the requested run. Results will appear when it finishes.'),el('span','Running · awaiting result','cr-run-badge'));}
        else{
          const error=runErrors[key];
          card.append(el('span',error?'Latest attempt failed':run.auto_remediated?'Verified + applied':run.alert_raised||run.files['ALERT.json']?'Alert recorded · SQL unchanged':'Review required','cr-run-badge'));
          card.append(el('p',error||stageOf(run,'action')?.summary||'Inspect the saved report.'));
          card.append(el('p',key==='roi'?'SDK: diagnose → propose. Python: test → apply.':'SDK: diagnose. Python: block fix agent → alert.','cr-note'));
          card.append(el('p',(error?'Prior result · ':'')+(run.mode==='live'?'Live SDK run':'Fixture run')+' · '+run.run_id,'cr-run-meta'));
          const buttons=el('div',undefined,'cr-controls');
          const jump=action(error?'Inspect prior run':'Follow this incident →',()=>{scenario=key;go(0);});jump.disabled=busy;buttons.append(jump);
          for(const [file,label] of [['patch.diff','Diff'],['APPLIED.json','Fix receipt'],['ALERT.json','Owner alert'],[run.files['DOSSIER.md']?'DOSSIER.md':'EVIDENCE.md','Report'],['events.jsonl','Activity']]){
            if(run.files[file])buttons.append(action(label,()=>showArtifact(stories[key].name+' · '+file,run.files[file])));
          }
          card.append(buttons);
        }
        lane.append(card);
      }
      board.append(lane);
    }
    out.append(board,el('p','Board shows the exported runs plus executions started from this page. Terminal runs appear after export and refresh. Alerts are stored in the local demo inbox.','cr-note'));
    const credit=el('a','Inspired by Cursor’s Agent Kanban cookbook');credit.href='https://github.com/cursor/cookbook/tree/main/sdk/agent-kanban';credit.target='_blank';credit.rel='noopener noreferrer';out.append(credit);
  }

  function render(){
    const run=data[scenario],story=stories[scenario];if(!run)return;
    $('cr-provenance').textContent=`${run.mode==='live'?'LIVE CURSOR + LOCAL CHECKS':'RECORDED PYTHON RUN · NO SDK CALL'} · ${run.run_id} · No deployment`;
    $('cr-step-nav').replaceChildren(...chapters.map((title,i)=>{const b=action(title,()=>go(i===4?4:i));const selected=(step>=4?4:step)===i;b.classList.toggle('selected',selected);b.setAttribute('aria-current',selected?'step':'false');return b;}));
    $('cr-progress-fill').style.width=((step+1)*10)+'%';$('cr-step-count').textContent=`${story.name.toUpperCase()} · STEP ${step+1} OF 10`;$('cr-step-title').textContent=titles[step];
    const hooks=[story.hook,'The longer the issue remains open, the harder the handoff can become.',story.goal,'Two bounded agent stages, with a deterministic decision between them.','Start with the alert and keep its original target.','Turn an error message into an evidence-backed diagnosis.','The company policy—not the model—decides what may happen next.',scenario==='ggr'?'The most important action is the one the system refuses to take.':'Save a precise SQL proposal that a reviewer can inspect.','Prove the behavior; distinguish a code fix from a resolved incident.',run.auto_remediated?'Fixed automatically in the local demo. Open the applied file and receipt.':'Change withheld. Open the alert for the owner.'];$('cr-step-hook').textContent=hooks[step];
    const out=$('cr-output');out.replaceChildren();
    const allowedViews=step<4?['story',...(step===0?['diff']:[]),...(step===2||step===3?['code']:[])]:['result','code',...(step===7||step===9?['diff']:[]),'evidence'];
    allowedViews.push('board');
    if(!allowedViews.includes(view))view=allowedViews[0];
    const viewLabels={board:'Kanban board + fix map',story:step===3?'Architecture':'Story',result:'Terminal result',code:'SDK / Python code',diff:'SQL before / after',evidence:'Evidence'};
    $('cr-view-nav').replaceChildren(...allowedViews.map(key=>{const b=action(viewLabels[key],()=>{view=key;render();});b.dataset.crView=key;b.classList.toggle('selected',view===key);b.setAttribute('aria-pressed',String(view===key));return b;}));
    if(view==='story'){
    if(step===0){out.append(grid(tile('The failure','What broke',story.issue),tile('The owner','Who needs an answer',story.owner),tile('The consequence','What is at stake',story.stakes)),el('p',`Example signal: ${run.incident.title}`,'cr-note'));}
    if(step===1){out.append(grid(...story.timeline.map(([h,p],i)=>tile('Time window '+(i+1),h,p))),el('p','Illustrative business consequences, not measured losses or a promised SLA. The incident owner supplies the actual response deadline. All incident figures in this prototype are synthetic.','cr-note'));}
    if(step===2){out.append(grid(tile('Investigate','Give Python a coding agent',story.sdk),tile('Constrain','Put policy between agent stages',story.boundary),tile('Deliver','Make the output useful',story.goal)),el('p','The SDK provides workspace tools, the agent loop, structured callbacks, and run events. Your Python supplies authorization, SQL assertions, and the report. That makes the workflow callable from an alert rather than dependent on someone opening an editor.'));}
    if(step===3)renderArchitecture(out);
    }
    if(view==='board'){
      $('cr-step-count').textContent='RUN OVERVIEW';$('cr-step-title').textContent='Agent work, visible at a glance';$('cr-step-hook').textContent='A fix is only complete when its evidence proves it. A blocked change needs an accountable owner.';
      renderBoard(out);
    }
    if(view==='diff')renderSqlDiff(out,run,step!==0);
    if(view==='result'||(view==='code'&&step>=4))renderTerminal(out,run);
    if(view==='code'&&step<4)renderCode(out,step===3?architectureCode[arch]:stepCode[step]);
    if(view==='evidence'){
      out.append(el('h3','Evidence for this run'),el('p','Open a file here. Close it to return to this exact step.','cr-note'));
      const files=el('div',undefined,'cr-controls');Object.keys(run.files).sort().forEach(name=>files.append(action(name,()=>viewFile(name))));out.append(files);
      out.append(action('Inspect a bad proposal failing checks',showFailure));
    }
    out.scrollTop=0;
    $('cr-back').disabled=step===0;$('cr-next').disabled=step===9;$('cr-next').textContent=step===3?'Start terminal walkthrough →':step===9?'Walkthrough complete':'Next →';$('cr-next-hint').textContent=step===9?'Open Evidence above, or switch scenarios.':'Up next: '+titles[step+1];
    if(view==='board'){$('cr-next').disabled=false;$('cr-next').textContent='Start marketing walkthrough →';$('cr-next-hint').textContent='Or select any stage in the fix map.';$('cr-back').disabled=true;}
    $('cr-board-home').setAttribute('aria-pressed',String(view==='board'));
    root.querySelectorAll('[data-cr-scenario]').forEach(b=>{b.classList.toggle('selected',b.dataset.crScenario===scenario);b.disabled=busy;});
    $('cr-files').replaceChildren(...Object.keys(run.files).sort().map(name=>action(name,()=>viewFile(name))));$('cr-execute').disabled=busy||!session;$('cr-live-execute').disabled=busy||!session?.live_available;
  }
  function go(index){step=Math.max(0,Math.min(9,index));view=step<4?'story':'result';render();}
  function showFailure(){showArtifact('Bad proposal rejected · actual verifier result',JSON.stringify(data.bad_patch,null,2));}
  root.querySelectorAll('[data-cr-scenario]').forEach(b=>b.onclick=()=>{scenario=b.dataset.crScenario;arch=0;$('cr-file-panel').open=false;$('cr-file-title').textContent='Choose an artifact';$('cr-file-content').textContent='Use the buttons above to inspect a complete file from this run.';go(0);});
  const presenterTargets={marketing:['roi',0],architecture:['roi',3],applied:['roi',9],regulated:['ggr',6],alert:['ggr',9],'sdk-triage':['roi',5],'sdk-gate':['ggr',7],'sdk-patch':['roi',7]};
  root.querySelectorAll('[data-cr-present]').forEach(button=>button.onclick=()=>{
    if(busy)return;
    const cue=button.dataset.crPresent;
    if(cue==='intro'){document.getElementById('cr-sdlc-title').scrollIntoView({block:'start'});return;}
    if(cue==='failure'){showFailure();return;}
    const target=presenterTargets[cue];if(!target)return;
    scenario=target[0];arch=0;$('cr-file-panel').open=false;$('cr-file-title').textContent='Choose an artifact';$('cr-file-content').textContent='Choose a file from the selected run.';go(target[1]);
    if(cue.startsWith('sdk-')){view='code';render();}
    if(cue==='sdk-patch')root.querySelector('[data-terminal-snippet="fix_callback"]')?.click();
    $('cr-player').scrollIntoView({block:'start'});
  });
  $('cr-modal-close').onclick=()=>{const dialog=$('cr-artifact-dialog');if(dialog.close)dialog.close();else dialog.removeAttribute('open');};
  function toggleFocus(){const focused=$('cr-player').classList.toggle('cr-focused');if(focused){previousBodyOverflow=document.body.style.overflow;document.body.style.overflow='hidden';}else document.body.style.overflow=previousBodyOverflow;$('cr-focus').textContent=focused?'Exit focus ×':'Focus demo ⛶';$('cr-focus').setAttribute('aria-pressed',String(focused));if(!focused)$('cr-player').scrollIntoView({block:'start'});}
  $('cr-board-home').onclick=()=>{view='board';render();};
  $('cr-focus').onclick=toggleFocus;
  $('cr-back').onclick=()=>go(step-1);$('cr-next').onclick=()=>(view==='board'?(scenario='roi',go(0)):go(step+1));$('cr-restart').onclick=()=>go(0);$('cr-failure').onclick=showFailure;
  root.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('cr-artifact-dialog').open&&$('cr-player').classList.contains('cr-focused')){toggleFocus();return;}if(e.target.closest('#cr-artifact-dialog'))return;if(!['ArrowLeft','ArrowRight'].includes(e.key)||e.target.closest('pre,#cr-terminal-body'))return;e.preventDefault();e.stopPropagation();go(step+(e.key==='ArrowRight'?1:-1));});
  async function execute(mode){
    const selected=scenario;busy=true;runningScenario=selected;delete runErrors[selected];render();$('cr-server-status').textContent=mode==='live'?'Cursor is running. SDK events are saved in runs/; replay becomes available after completion.':'Python is executing the scenario and SQL checks…';
    try{const response=await fetch('/api/run',{method:'POST',headers:{'Content-Type':'application/json','X-Count-Room-Token':session.token},body:JSON.stringify({incident:selected,mode})});const value=await response.json();if(!response.ok)throw Error(value.error);data[selected]=value;step=4;view='result';$('cr-server-status').textContent='Completed. Walk through the new result one terminal stage at a time.';}
    catch(error){runErrors[selected]=error.message;$('cr-server-status').textContent='Run failed: '+error.message+' The prior labeled run remains available; no success was substituted.';}
    finally{busy=false;runningScenario=null;render();}
  }
  $('cr-execute').onclick=()=>execute('fixture');$('cr-live-execute').onclick=()=>execute('live');
  if(location.protocol==='http:'&&['127.0.0.1','localhost'].includes(location.hostname))fetch('/api/status').then(r=>r.json()).then(value=>{session=value;$('cr-server-status').textContent=value.live_available?'Python connected. Fresh local and live Cursor execution available.':'Python connected. Local execution available; live Cursor needs CURSOR_API_KEY in the server environment.';render();}).catch(()=>{});
  if(location.hash==='#sdk-demo-orig'){document.querySelector('[data-outer="spacex"]').click();document.querySelector('[data-tab="combo"]').click();root.scrollIntoView();}
  render();
})();
