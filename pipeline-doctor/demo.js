(() => {
  const $=id=>document.getElementById(id),data=window.PIPELINE_DOCTOR;
  if(!data){$('content').textContent='Run agent.py --export to generate a demo result.';return;}
  let step=-1;
  const titles=['The broken report','Reproduce both bugs','The actual Cursor SDK code','Inspect the Python diff','Verify the repaired behavior','Run it live / open evidence'];
  function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
  function button(label,fn){const b=el('button',label);b.onclick=fn;return b;}
  function terminal(title,text){const n=el('div',undefined,'terminal');n.append(el('div',title,'term-head'),el('pre',text));return n;}
  function card(title,text){const n=el('div',undefined,'card');n.append(el('h3',title),el('p',text));return n;}
  function openFile(name,text=data.files[name]){$('artifact-title').textContent=name;$('artifact-body').textContent=text||'No artifact.';if($('artifact').showModal)$('artifact').showModal();else $('artifact').setAttribute('open','');}
  function checks(result){const n=el('div');for(const check of result.checks){const row=el('div',undefined,'check '+(check.passed?'pass':'fail'));row.append(el('strong',`${check.passed?'PASS':'FAIL'} · ${check.name}`));if(check.error)row.append(el('pre',check.error));n.append(row);}if(result.error)n.append(el('pre',result.error));return n;}
  function source(){const lines=data.source['agent.py'].split('\n');const start=lines.findIndex(l=>l.startsWith('def live_repair'));const end=lines.findIndex((l,i)=>i>start&&l.startsWith('def execute'));
    const n=el('div',undefined,'terminal');n.append(el('div',`agent.py:${start+1} · exact implementation excerpt`,'term-head'));const pre=el('pre');lines.slice(start,end).forEach((line,i)=>{const row=el('span',undefined,'code-line');row.append(el('span',String(start+i+1),'ln'));line.split(/(Agent\.create|AgentOptions|LocalAgentOptions|agent\.send|run\.messages|run\.wait)/g).forEach((p,j)=>row.append(el('span',p,j%2?'sdk':'')));pre.append(row);});n.append(pre);return n;}
  function overview(out){
    out.append(el('p','Two edge cases can stop the morning report. One Cursor agent edits the reporting file; Python independently checks whether the repair worked.','quote'));
    const flow=el('div',undefined,'repair-flow');flow.setAttribute('aria-label','Repair architecture');
    [['1 · Reproduce','Python runs the broken report',1],['2 · Repair','Cursor SDK reads contract → edits file',2],['3 · Inspect','Review the actual Python diff',3],['4 · Verify','Python checks the repaired behavior',4]].forEach(([label,text,target])=>{
      const b=button('',()=>go(target));b.append(el('span',label,'eyebrow'),el('strong',text));flow.append(b);
    });out.append(flow);
    const board=el('div',undefined,'repair-board');
    const definitions=[['Found in original','before',false],['Still failing','after',false],['Verified after repair','after',true]];
    const bugs=[['zero clicks remains visible','Zero-click campaign','Division by zero crashes the report.','Keep the campaign; its conversion rate is undefined.'],['empty result set','Empty query result','Choosing a winner from no rows crashes the report.','Return a valid empty report with no winner.']];
    definitions.forEach(([label,phase,passed])=>{
      const lane=el('section',undefined,'repair-lane '+(phase==='before'?'found':passed?'verified':'pending'));lane.append(el('h3',label));let count=0;
      for(const [name,title,problem,expected] of bugs){
        const check=data[phase].checks.find(c=>c.name===name);if(!check||check.passed!==passed)continue;count++;
        const item=card(title,phase==='before'?problem:expected);item.dataset.bug=name;
        item.append(el('span',phase==='before'?'FAIL before':passed?'PASS after':'FAIL after','badge'),button(phase==='before'?'See failure':'See check evidence',()=>openFile(name+' · '+phase,JSON.stringify(check,null,2))));
        if(phase==='after'&&passed)item.append(button('See actual fix →',()=>go(3)));lane.append(item);
      }
      if(!count)lane.append(el('p',phase==='after'&&!passed?'Neither highlighted bug is failing in the saved checks.':'No matching check results.','note'));
      board.append(lane);
    });out.append(board);
    out.append(el('p',`${data.after.checks.filter(c=>c.passed).length}/${data.after.checks.length} checks passed · ${data.mode==='live'?'Actual Cursor SDK run':'Fixture run'} · ${data.run_id}. Before/after columns show evidence from one saved run, not a live activity stream.`, 'note'));
    if(data.error)out.append(terminal('RUN ERROR',data.error));
    const actions=el('div',undefined,'actions');actions.append(button('Open run report',()=>openFile('REPORT.md')),button('Open SDK activity',()=>openFile('events.jsonl')),button('Run this live →',()=>go(5)));out.append(actions);
  }
  function render(){
    $('title').textContent=step===-1?'Kanban board · what gets fixed and how':titles[step];$('mode').textContent=`${data.mode==='live'?'LIVE CURSOR RUN':'FIXTURE RUN · NO SDK CALL'} · ${data.passed?'REPAIRED':'FAILED'}`;
    $('steps').replaceChildren(...titles.map((t,i)=>{const b=button(`${i+1}. ${['Problem','Failures','SDK code','Diff','Checks','Run / evidence'][i]}`,()=>go(i));b.classList.toggle('selected',i===step);b.setAttribute('aria-current',i===step?'step':'false');return b;}));
    const home=button('▦ Board + fix map',()=>go(-1));home.classList.toggle('selected',step===-1);home.id='board-home';$('steps').prepend(home);
    const out=$('content');out.replaceChildren();
    if(step===-1)overview(out);
    if(step===0){
      out.append(el('p','“Our reporting job crashes when a campaign has no clicks—or when the warehouse query returns no rows. Cursor can repair the Python before the morning review.”','quote'));
      const grid=el('div',undefined,'grid');grid.append(card('Bug 1 · zero clicks','An undefined conversion rate triggers ZeroDivisionError. Keep the campaign visible with an undefined rate instead of dropping it.'),card('Bug 2 · no rows','Picking a winner from an empty list triggers ValueError. An empty dataset should produce a valid empty report.'));out.append(grid);
      out.append(el('p','One agent → read contract and code → edit the actual file → independent regression checks. All inputs are synthetic; no warehouse connection or production deployment.','note'));
      out.append(terminal('BEFORE / campaign_report.py',data.files['before.py']));
      const citation=el('p',undefined,'note');citation.append('Inspired by the local script-repair workflow in ');const a=el('a','Snowflake’s SDK quickstart');a.href='https://docs.snowflake.com/en/user-guide/cortex-code-agent-sdk/quickstart';a.target='_blank';a.rel='noopener';citation.append(a,'. This implementation uses Cursor SDK and its own fixtures and tests.');out.append(citation);
    }
    if(step===1){out.append(el('p','These failures were reproduced by running the original Python, not supplied by an agent. The ordinary case passes, which helps show what must remain unchanged.'));out.append(checks(data.before));}
    if(step===2){const grid=el('div',undefined,'sdk-stack');grid.append(source());const note=card('What Cursor contributes','Agent.create starts one local agent. read and edit allow it to inspect and change the reporting file. agent.send gives it the contract. run.messages streams real tool/status evidence. Python runs the independent checks after completion.');note.append(el('p','Compared with the reference: Cursor API credentials replace the Cortex connection configuration. There is no Cortex dependency. The application checks success rather than trusting the agent’s summary.','note'),button('Open full agent.py',()=>openFile('agent.py',data.source['agent.py'])),button('Open the business contract',()=>openFile('CONTRACT.md',data.source['CONTRACT.md'])));grid.append(note);out.append(grid);}
    if(step===3){out.append(el('p',`This is the actual workspace edit from this ${data.mode} run. Red removes code; green adds code. ${data.passed?'The edited file passes the independent checks.':'The run failed; do not present this edit as a successful repair.'}`));const term=el('div',undefined,'terminal');const pre=el('pre');(data.files['patch.diff']||'(No change was made.)').split('\n').forEach(line=>pre.append(el('span',line+'\n','diff-line '+(line.startsWith('+++')||line.startsWith('---')||line.startsWith('@@')?'meta':line.startsWith('+')?'add':line.startsWith('-')?'remove':''))));term.append(pre);out.append(term);out.append(button('Open the actual edited file',()=>openFile('after.py')));}
    if(step===4){out.append(checks(data.after));out.append(el('p','Six independent cases cover empty input, zero clicks, ordinary math, mixed campaigns, zero conversions, ties, and input preservation. Tests live outside the agent workspace.','note'));const sample=data.after.checks.find(c=>c.name==='mixed campaigns and correct winner');if(sample?.actual)out.append(terminal('REPAIRED REPORT / mixed campaigns',JSON.stringify(sample.actual,null,2)));if(data.error)out.append(terminal('RUN ERROR',data.error));}
    if(step===5){out.append(terminal('RUN IN YOUR TERMINAL',`cd /Users/mmalveira/Interview_Prep/pipeline-doctor\n.venv/bin/python agent.py --live --export\n\n# Offline rehearsal (explicit fixtures):\n.venv/bin/python agent.py --export`));out.append(el('p','The existing private Cursor key is loaded automatically. Each run creates a fresh workspace. --export puts that exact result in this page; click Reload latest run after the terminal completes.'));out.append(el('p',`Current run: ${data.run_id}\nWorkspace: ${data.workspace}`,'note'));const actions=el('div',undefined,'actions');Object.keys(data.files).sort().forEach(name=>actions.append(button(name,()=>openFile(name))));out.append(actions);out.append(el('p','A failed agent run stays failed. It never falls back to the reference patch. The agent edits local code; tests run in a child Python process with API credentials removed. This is not an OS sandbox.','note'));}
    out.scrollTop=0;$('position').textContent=step===-1?'Overview':`${step+1} / ${titles.length}`;$('back').disabled=step===-1;$('next').disabled=step===5;$('next').textContent=step===-1?'Start walkthrough →':'Next →';
  }
  function go(i){step=Math.max(-1,Math.min(5,i));render();}
  $('back').onclick=()=>go(step-1);$('next').onclick=()=>go(step+1);$('reload').onclick=()=>location.reload();$('close').onclick=()=>{$('artifact').close?$('artifact').close():$('artifact').removeAttribute('open');};
  document.addEventListener('keydown',e=>{if($('artifact').open||e.target.closest('pre'))return;if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();go(step+(e.key==='ArrowRight'?1:-1));}});
  render();
})();
