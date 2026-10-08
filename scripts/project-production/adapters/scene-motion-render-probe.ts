import { execFileSync } from "node:child_process";

// Run authored props-driven renderers in a time-bounded child, not in the CLI's
// process. This is a DOM dependency probe, not a security sandbox or pixel QA.
const probeScript = String.raw`
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const {pathToFileURL} = require('node:url');
(async () => {
 const input = JSON.parse(fs.readFileSync(0, 'utf8'));
 const hostRequire = createRequire(path.join(input.rootDir, 'package.json'));
 const React = hostRequire('react');
 const {renderToStaticMarkup} = hostRequire('react-dom/server');
 const runtime = path.join(input.rootDir, 'node_modules/@axmorf/studio');
 const modules = new Map([
  ['react', React], ['react/jsx-runtime', hostRequire('react/jsx-runtime')],
  ['remotion', await import(pathToFileURL(hostRequire.resolve('remotion')).href)],
  ['@axmorf/studio/contracts', await import(pathToFileURL(path.join(runtime, 'dist/contracts.js')).href)],
  ['@axmorf/studio/remotion', await import(pathToFileURL(path.join(runtime, 'dist/remotion.js')).href)]
 ]);
 const cache = new Map();
 const load = (name) => {
  if (cache.has(name)) return cache.get(name).exports;
  const source = input.sources[name];
  if (source === undefined) throw new Error('Unsupported probe import: ' + name);
  const module = {exports: {}}; cache.set(name, module);
  const localRequire = (id) => {
   if (modules.has(id)) return modules.get(id);
   if (!id.startsWith('.')) throw new Error('Unsupported probe dependency: ' + id);
   const base = path.posix.normalize(path.posix.join(path.posix.dirname(name), id));
   const target = [base, base+'.tsx', base+'.ts', base+'/index.tsx', base+'/index.ts'].find(p => input.sources[p] !== undefined);
   if (!target) throw new Error('Undeclared probe source: ' + id);
   return load(target);
  };
  new Function('require', 'module', 'exports', source)(localRequire, module, module.exports);
  return module.exports;
 };
 const Renderer = load('src/Renderer.tsx').default;
 if (typeof Renderer !== 'function') throw new Error('Unsupported Renderer export');
 if (input.mode === 'continuity') {
  const {SceneContinuityVisual} = modules.get('@axmorf/studio/remotion');
  const {computeSceneContinuityVisualFingerprint} = modules.get('@axmorf/studio/contracts');
  if (typeof SceneContinuityVisual !== 'function') throw new Error('Common visual helper is unavailable');
  const contradiction = message => {throw new Error('Scene handoff visual contradiction: '+message);};
  const tree = html => {
   const roots=[], stack=[];
   const tokens=/<!--[\s\S]*?-->|<\/?([a-zA-Z][\w:-]*)\b[^>]*>/g;
   let match;
   while ((match=tokens.exec(html))) {
    if (match[0].startsWith('<!--')) continue;
    if (match[0].startsWith('</')) {
     const node=stack.pop();
     if (!node || node.tag!==match[1]) throw new Error('Unbalanced boundary DOM');
     node.end=tokens.lastIndex;
     continue;
    }
    const attributes=Object.fromEntries([...match[0].matchAll(/\s([\w:-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
    const node={tag:match[1],attributes,start:match.index,end:tokens.lastIndex,parent:stack.at(-1),children:[]};
    (node.parent ? node.parent.children : roots).push(node);
    if (!/^(?:img|input|br|hr|meta|link|area|source|wbr)$/i.test(node.tag) && !match[0].endsWith('/>')) stack.push(node);
   }
   if (stack.length) throw new Error('Unclosed boundary DOM');
   return roots;
  };
  const nodes = roots => roots.flatMap(node=>[node,...nodes(node.children)]);
  const identityTransform = value => value==='none' || /^(?:translate\(\s*0(?:[ ,]+0)?\s*\)|matrix\(\s*1[ ,]+0[ ,]+0[ ,]+1[ ,]+0[ ,]+0\s*\))$/.test(value);
  const neutralAncestor = node => {
   if (!['div','svg','g'].includes(node.tag)) return false;
   for (const [name,value] of Object.entries(node.attributes)) {
    if (name.startsWith('data-') || name==='xmlns') continue;
    if (name==='transform' && identityTransform(value)) continue;
    if (name==='viewBox' && value.trim().replace(/\s+/g,' ')==='0 0 '+input.props.viewportWidth+' '+input.props.viewportHeight) continue;
    if (name==='width' && ['100%',String(input.props.viewportWidth)].includes(value)) continue;
    if (name==='height' && ['100%',String(input.props.viewportHeight)].includes(value)) continue;
    if (name!=='style') return false;
    for (const entry of value.split(';').filter(Boolean)) {
     const colon=entry.indexOf(':'), key=entry.slice(0,colon).trim(), val=entry.slice(colon+1).trim();
     if (['position'].includes(key) && ['relative','absolute'].includes(val)) continue;
     if (key==='width' && ['100%',input.props.viewportWidth+'px'].includes(val)) continue;
     if (key==='height' && ['100%',input.props.viewportHeight+'px'].includes(val)) continue;
     if (['inset','top','left','right','bottom','margin','padding'].includes(key) && /^(?:0|0px)$/.test(val)) continue;
     if (key==='opacity' && val==='1') continue;
     if (key==='transform' && identityTransform(val)) continue;
     if (key==='pointer-events' && val==='none') continue;
     if (key==='overflow' && val==='visible') continue;
     if (key==='display' && val==='block') continue;
     return false;
    }
   }
   return true;
  };
  const drawing = (html,id) => {
   if (/<style\b/i.test(html)) throw new Error('Boundary CSS requires browser review');
   const matches=nodes(tree(html)).filter(n=>n.attributes['data-scene-continuity']===id);
   if (matches.length!==1) contradiction('Expected exactly one boundary binding for '+id);
   const node=matches[0];
   for (let parent=node.parent;parent;parent=parent.parent) {
    if (!neutralAncestor(parent)) contradiction('Transformed, hidden or non-viewport ancestor for '+id);
   }
   return html.slice(node.start,node.end).replace(/\sdata-[\w:-]+="[^"]*"/g,'');
  };
  const render = (frame,continuity=input.props.continuity) => renderToStaticMarkup(React.createElement(Renderer,{...input.props,sceneFrame:frame,continuity}));
  const observations=[];
  for (const direction of ['incoming','outgoing']) {
   const handoff=input.props.continuity[direction];
   if (!handoff || handoff.kind!=='continuous' || !handoff.visual) continue;
   const frame=direction==='incoming' ? 0 : input.props.durationInFrames-1;
   const actual=render(frame);
   if (actual!==render(frame)) contradiction('Boundary renderer is not repeatable at frame '+frame);
   const expected=renderToStaticMarkup(React.createElement(SceneContinuityVisual,{handoff}));
   if (drawing(actual,handoff.continuityId)!==drawing(expected,handoff.continuityId)) contradiction('Actual drawing differs from frozen '+direction+' visual at frame '+frame);
   const alternative={...handoff,visual:{schemaVersion:1,viewBox:handoff.visual.viewBox,elements:[{tag:'circle',attributes:{cx:37,cy:53,r:11,fill:'#ed28a6'}}]}};
   const changed=render(frame,{...input.props.continuity,[direction]:alternative});
   const alternativeExpected=renderToStaticMarkup(React.createElement(SceneContinuityVisual,{handoff:alternative}));
   if (drawing(changed,handoff.continuityId)!==drawing(alternativeExpected,handoff.continuityId)) contradiction('Frozen visual is unused or partly ignored by '+direction+' binding');
   observations.push({direction,continuityId:handoff.continuityId,frame,visualFingerprint:computeSceneContinuityVisualFingerprint(handoff.visual)});
  }
  process.stdout.write(JSON.stringify({status:'handoff-consumption-observed',verification:'verified-dom-boundary',reviewStatus:'needs-temporal-review',observations,scope:'Actual SSR boundary subtree matches and consumes the frozen common SVG drawing, with neutral viewport ancestors. Excludes browser CSS, occlusion, Canvas/3D paint, adjacent non-subject elements, semantic correctness and aesthetic approval.'})+'\n');
  return;
 }
 const plan = input.props.shots.motionPlan;
 const render = (frame, motionPlan=plan) => renderToStaticMarkup(React.createElement(Renderer, {...input.props, sceneFrame:frame, shots:{...input.props.shots,motionPlan}}));
 const objectMarkup = (html, id) => {
  const matches = [...html.matchAll(new RegExp('<([a-zA-Z][\\w:-]*)\\b[^>]*\\bdata-motion-object="'+id+'"[^>]*>', 'g'))];
  if (matches.length !== 1) throw new Error('Expected exactly one rendered object binding: '+id);
  const match = matches[0], tag = match[1];
  let end = match.index + match[0].length, depth=1;
  if (!/^(?:img|input|br|hr|meta|link|area|source|wbr)$/i.test(tag)) {
   const tokens = new RegExp('<(/?)'+tag+'\\b[^>]*>', 'g'); tokens.lastIndex=end;
   let token;
   while ((token=tokens.exec(html))) {depth += token[1] ? -1 : (token[0].endsWith('/>') ? 0 : 1); if (!depth) {end=tokens.lastIndex;break;}}
   if (depth) throw new Error('Unbalanced rendered object: '+id);
  }
  const paintAttributes=new Set('style x y x1 y1 x2 y2 width height r rx ry cx cy transform d points fill fill-rule stroke stroke-width stroke-linecap stroke-linejoin opacity viewBox clip-path mask filter src href font-size font-family font-weight text-anchor dominant-baseline'.split(' '));
  const markup = html.slice(match.index,end).replace(/\s([\w:-]+)="[^"]*"/g,(attribute,name)=>paintAttributes.has(name) ? attribute : '').replace(/<!--.*?-->/g,'');
  if (/\b(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(markup)) throw new Error('Hidden probe object: '+id);
  return markup;
 };
 const {resolveMotionTrackState} = modules.get('@axmorf/studio/contracts');
 const fields=['x','y','scale','rotation','opacity','reveal','value'];
 const perturb = (value,key) => key==='scale' ? value*1.13 : ['opacity','reveal'].includes(key) ? (value>=.5 ? value*.5 : value+.25) : value+(key==='rotation'||key==='value' ? 17.37 : .137);
 const baseline = new Map();
 const at = frame => {if (!baseline.has(frame)) {const html=render(frame); if (html!==render(frame)) throw new Error('Renderer output is not repeatable at frame '+frame);baseline.set(frame,html);}return baseline.get(frame);};
 const observations=[];
 let renders=0;
 for (const action of plan.actions) {
  const begin=action.frameRange.startFrame, last=action.frameRange.endFrame-1;
  const changedLast=last-action.readingHoldFrames;
  const frames=[...new Set([begin, Math.floor((begin+changedLast)/2), changedLast, last, ...plan.objects.flatMap(o=>o.keyframes.filter(k=>k.frame>=begin&&k.frame<=last).map(k=>k.frame))])].sort((a,b)=>a-b);
  if (frames.length>32) throw new Error('Probe frame budget exceeded; split the action');
  let visibleChange=false;
  for (const id of action.objectIds) {
   const track=plan.objects.find(o=>o.objectId===id);
   const original=frames.map(frame=>objectMarkup(at(frame),id));
   if (new Set(original).size>1) visibleChange=true;
   const changedFields=fields.filter(key=>new Set(frames.map(frame=>resolveMotionTrackState(track,frame)[key])).size>1);
   const required=changedFields.length ? changedFields : fields;
   const influenced=[];
   for (const key of required) {
    const alternative={...plan,objects:plan.objects.map(o=>o.objectId!==id ? o : {...o,keyframes:o.keyframes.map(k=>({...k,state:{...k.state,[key]:perturb(k.state[key],key)}}))})};
    let affects=false;
    for (const frame of frames) {if (++renders>4096) throw new Error('Probe render budget exceeded');if (objectMarkup(render(frame,alternative),id)!==objectMarkup(at(frame),id)) affects=true;}
    if (affects) influenced.push(key);
   }
   if ((action.kind!=='hold' && !influenced.length) || changedFields.some(key=>!influenced.includes(key))) throw new Error('Motion plan is unused or partly ignored by object '+id+' in action '+action.actionId);
   if (action.readingHoldFrames) {
    const start=action.frameRange.endFrame-action.readingHoldFrames;
    if (objectMarkup(at(start),id)!==objectMarkup(at(last),id)) throw new Error('Rendered reading hold changes: '+id);
   }
   observations.push({actionId:action.actionId,objectId:id,frames,changedFields,influencedFields:influenced});
  }
  if (action.kind==='hold' ? visibleChange : !visibleChange) throw new Error('Rendered action contradicts declared change/hold: '+action.actionId);
 }
 process.stdout.write(JSON.stringify({status:'motion-consumption-observed',observations,verification:'verified-dom-dependency', reviewStatus:'needs-temporal-review', scope:'Props-driven SSR DOM dependencies, excluding data attributes; static holds need no perturbation response. Not pixel visibility, semantic correctness, browser effects or aesthetic approval'})+'\n');
})().catch(error=>{process.stderr.write(String(error.message)+'\n');process.exitCode=1;});
`;

export const runSceneMotionRenderProbe = (rootDir: string, input: unknown) =>
  execFileSync(process.execPath, ["-e", probeScript], {
    cwd: rootDir,
    input: JSON.stringify(input),
    encoding: "utf8",
    timeout: 15_000,
    maxBuffer: 8 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
