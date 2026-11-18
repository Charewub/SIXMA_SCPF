import {setProfile} from './profile.js?v=2';
import {connect,VERSION,allowedAccount} from './firebase-adapter.js?v=19.3';
import {AssessmentSession,draftKey} from './session.js?v=18.6';

const $=id=>document.getElementById(id);
const config=window.SIXMA_FIREBASE_CONFIG;
const portalModules=Array.isArray(window.SIXMA_PORTAL_MODULES)?window.SIXMA_PORTAL_MODULES:[];
const pageNames=['home','information','instructions','assessment','completion'];
const state={backend:null,ready:false,busy:false,view:'home',positions:[],assessments:[],questions:[],session:null,information:null};
const uuid=()=>crypto.randomUUID();
let toastTimer;
function message(text='',error=false) {
  const toast=$('feedback');
  clearTimeout(toastTimer);
  toast.replaceChildren();
  toast.hidden=!text;
  if(!text)return;
  toast.classList.toggle('success',!error);
  toast.appendChild(icon(error?'error':'check_circle'));
  const copy=document.createElement('span');
  copy.className='toast-copy';
  copy.textContent=text;
  toast.appendChild(copy);
  const dismiss=document.createElement('button');
  dismiss.type='button';
  dismiss.className='toast-close';
  dismiss.setAttribute('aria-label','Dismiss notification');
  dismiss.appendChild(icon('close'));
  dismiss.addEventListener('click',()=>{toast.hidden=true;});
  toast.appendChild(dismiss);
  if(!error)toastTimer=setTimeout(()=>{toast.hidden=true;},4500);
}
function confirmAction(text) {
  const dialog=$('confirmDialog');
  $('confirmMessage').textContent=text;
  return new Promise(resolve=>{
    dialog.returnValue='cancel';
    dialog.addEventListener('close',()=>resolve(dialog.returnValue==='confirm'),{once:true});
    dialog.showModal();
    $('confirmCancel').focus();
  });
}
function errorText(error) {
  if(String(error.message).includes('REVISION_CONFLICT')) {
    return 'มีการบันทึกรอบนี้จากอีกแท็บแล้ว Draft ในเครื่องยังเก็บอยู่ กรุณากลับ Home แล้วเปิดรอบนี้ใหม่เพื่อตรวจข้อมูลล่าสุด';
  }
  return error?.message||String(error);
}
function showPage(name) {
  state.view=name;
  closePositions();
  for(const page of pageNames)$(page+'Page').hidden=page!==name;
  $('steps').hidden=!['information','instructions'].includes(name);
  document.querySelectorAll('[data-step]').forEach(step=>{
    step.classList.toggle('active',step.dataset.step===name);
    if(step.dataset.step===name)step.setAttribute('aria-current','step');
    else step.removeAttribute('aria-current');
  });
  window.scrollTo({top:0,behavior:'instant'});
}
function showLanding(name) {
  $('authLoading').hidden=true;
  $('loginPage').hidden=name!=='login';
  $('portalPage').hidden=name!=='portal';
  $('sixmaApp').hidden=name!=='sixma';
  if(name!=='sixma')window.scrollTo({top:0,behavior:'instant'});
}
async function action(fn) {
  if(state.busy)return;
  state.busy=true;
  message();
  updateControls();
  try {await fn();}
  catch(error){console.error(error);message(errorText(error),true);}
  finally{state.busy=false;updateControls();renderSaveState();}
}
function updateControls() {
  document.querySelectorAll('button,input').forEach(node=>{
    if(!['confirmAccept','confirmCancel'].includes(node.id))node.disabled=state.busy;
  });
  $('createNew').disabled=state.busy||!state.ready;
  $('googleSignIn').disabled=state.busy||!state.backend;
  $('portalSignOut').disabled=state.busy||!state.backend;
  $('signOut').disabled=state.busy||!state.backend;
  $('portalTop').disabled=state.busy;
  const s=state.session;
  if(s) {
    $('optionA').disabled=state.busy||s.completed;
    $('optionB').disabled=state.busy||s.completed;
    $('saveDuring').hidden=s.completed;
    $('questionNext').disabled=state.busy||!s.answers[state.questions[s.index].id];
    $('completionSave').disabled=state.busy||s.completed;
    $('submitAssessment').disabled=state.busy||s.completed||s.count!==72;
    $('deleteAssessment').disabled=state.busy||s.completed;
  }
  document.body.setAttribute('aria-busy',String(state.busy));
}
function storageKey(id) {return draftKey(config,state.backend.user().uid,id);}
function readDraft(id) {
  try{return JSON.parse(localStorage.getItem(storageKey(id))||'null');}
  catch{return null;}
}
function keepDraft() {
  const s=state.session;
  if(!s || s.completed)return;
  try {
    localStorage.setItem(storageKey(s.id),JSON.stringify(s.serialize()));
    s.localOK=true;
  } catch {
    s.localOK=false;
    message('พื้นที่เก็บ Draft ในเครื่องใช้ไม่ได้ กรุณากด Save ก่อนปิดหน้าเว็บ',true);
  }
}
function clearDraft(id) {
  try{localStorage.removeItem(storageKey(id));}
  catch{ /* A confirmed cloud snapshot remains authoritative. */ }
}
function saveLabel() {
  const s=state.session;
  if(!s)return '';
  if(s.completed)return 'Submitted';
  if(!s.dirty)return 'Saved to Firebase';
  return s.localOK?'Saved locally · Not synced':'Draft in this tab only';
}
function renderSaveState() {
  $('saveState').textContent=saveLabel();
  $('completionState').textContent=saveLabel();
}
function icon(name) {
  const node=document.createElement('span');
  node.className='material-symbols-outlined';
  node.setAttribute('aria-hidden','true');
  node.textContent=name;
  return node;
}
function renderPortal() {
  const grid=$('portalGrid');
  grid.replaceChildren();
  setProfile(state.backend?.user());
  portalModules.forEach(module=>{
    const soon=module.status!=='active';
    const tile=document.createElement('button');
    tile.type='button';
    tile.className='portal-tile portal-tile--'+module.theme+(soon?' is-coming-soon':'');
    tile.disabled=soon;
    tile.setAttribute('aria-label',module.title+' '+module.subtitle+(soon?' — Coming soon':' — Open'));
    const symbol=icon(module.icon);symbol.classList.add('portal-tile-icon');
    const title=document.createElement('strong');title.className='portal-tile-title';title.textContent=module.title;
    const subtitle=document.createElement('span');subtitle.className='portal-tile-subtitle';subtitle.textContent=module.subtitle;
    const content=document.createElement('span');content.className='portal-tile-copy';
    content.append(title,subtitle);
    tile.append(symbol,content);
    if(soon) {
      const badge=document.createElement('span');badge.className='coming-soon-badge';badge.textContent='Coming soon';tile.appendChild(badge);
    } else {
      const arrow=icon('north_east');arrow.classList.add('portal-tile-arrow');tile.appendChild(arrow);
      tile.addEventListener('click',()=>action(()=>openPortalModule(module)));
    }
    grid.appendChild(tile);
  });
}
async function openPortalModule(module) {
  if (module.id === 'talent-compass' && !module.url) {
    window.location.assign('./talent-compass/');
    return;
  }
  if(module.target==='sixma') {
    showLanding('sixma');
    showPage('home');
    await refreshData();
    showPage('home');
    return;
  }
  if(module.url) {
    window.location.assign(module.url);
    return;
  }
  message('Talent Compass จะเชื่อมปลายทางในขั้นตอนถัดไป',true);
}
async function backToPortal() {
  const s=state.session;
  if(s?.dirty&&!s.completed) {
    keepDraft();
    if(!await confirmAction('ยังมีคำตอบที่เก็บเฉพาะในเครื่อง ต้องการกลับไปหน้า Portal หรือไม่?'))return;
  }
  state.session=null;
  showLanding('portal');
}
function renderHistory() {
  const body=$('historyBody');
  body.replaceChildren();
  const list=state.assessments.slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  for(const a of list) {
    const row=document.createElement('tr');
    const position=document.createElement('td');
    position.textContent=a.positionTitle;
    const detail=document.createElement('small');
    detail.textContent='Round '+a.roundNo+(a.relationship?' · '+a.relationship:'');
    position.appendChild(detail);
    const statusCell=document.createElement('td');
    const status=document.createElement('span');
    const done=a.status==='Completed';
    status.className='status '+(done?'submitted':'draft');
    status.appendChild(icon(done?'check_circle':'edit'));
    const label=document.createElement('span');label.textContent=done?'Submitted':'Draft';
    status.appendChild(label);statusCell.appendChild(status);
    const actions=document.createElement('td'),button=document.createElement('button');
    button.className='row-button';button.type='button';
    button.appendChild(document.createTextNode(done?'View':'Resume'));
    button.appendChild(icon('chevron_right'));
    button.setAttribute('aria-label',(done?'View ':'Resume ')+a.positionTitle+', round '+a.roundNo);
    button.addEventListener('click',()=>action(()=>openAssessment(a.id)));
    actions.appendChild(button);
    row.append(position,statusCell,actions);body.appendChild(row);
  }
  $('historyEmpty').hidden=list.length>0;
  $('historyEmpty').textContent=state.ready?'No assessments yet. Select Create New to begin.':'Sign in to view your assessment history.';
  renderPositions();
}
let positionActive=-1;
let showAllPositions=false;
let visiblePositions=[];
function closePositions() {
  $('positionOptions').hidden=true;
  $('targetPosition').setAttribute('aria-expanded','false');
  $('positionToggle').setAttribute('aria-expanded','false');
  $('targetPosition').removeAttribute('aria-activedescendant');
  positionActive=-1;
}
function renderPositions() {
  const query=showAllPositions?'':$('targetPosition').value.trim().toLocaleLowerCase();
  visiblePositions=state.positions.filter(p=>p.title.toLocaleLowerCase().includes(query)).map(p=>p.title);
  if(query && !state.positions.some(p=>p.title.toLocaleLowerCase()===query)) {
    visiblePositions.push($('targetPosition').value.trim());
  }
  const list=$('positionOptions');
  list.replaceChildren();
  visiblePositions.forEach((title,index)=>{
    const option=document.createElement('button');
    option.type='button';
    option.className='position-option';
    option.id='position-option-'+index;
    option.setAttribute('role','option');
    option.setAttribute('aria-selected',String(index===positionActive));
    option.tabIndex=-1;
    const label=document.createElement('span');
    label.textContent=title;
    option.appendChild(label);
    if(!state.positions.some(p=>p.title===title)) {
      const hint=document.createElement('small');
      hint.textContent='Create new position';
      option.appendChild(hint);
    }
    option.addEventListener('mousedown',event=>event.preventDefault());
    option.addEventListener('click',()=>selectPosition(index));
    list.appendChild(option);
  });
  if(positionActive>=0 && visiblePositions[positionActive]) {
    $('targetPosition').setAttribute('aria-activedescendant','position-option-'+positionActive);
  } else $('targetPosition').removeAttribute('aria-activedescendant');
}
function openPositions(all=false) {
  showAllPositions=all;
  renderPositions();
  $('positionOptions').hidden=false;
  $('targetPosition').setAttribute('aria-expanded','true');
  $('positionToggle').setAttribute('aria-expanded','true');
}
function selectPosition(index) {
  if(!visiblePositions[index])return;
  $('targetPosition').value=visiblePositions[index];
  $('targetPosition').focus();
  closePositions();
}
async function refreshData() {
  const data=await state.backend.call('getBootstrap');
  if(data.questionnaire_version!==VERSION || data.response_schema!=='WIDE72_V1' || data.questions.length!==72) {
    throw new Error('Questionnaire version or Wide72 schema mismatch.');
  }
  state.positions=data.positions;
  state.assessments=data.assessments;
  state.questions=data.questions;
  state.ready=true;
  renderHistory();
}
async function home() {
  const s=state.session;
  if(s?.dirty && !s.completed) {
    keepDraft();
    if(!await confirmAction('ยังมีคำตอบที่เก็บเฉพาะในเครื่อง ต้องการกลับ Home หรือไม่? คุณสามารถกลับมา Resume เพื่อบันทึกภายหลังได้'))return;
  }
  showPage('home');
  state.session=null;
  await refreshData();
}
function updateHistorySession() {
  const s=state.session;
  const index=state.assessments.findIndex(a=>a.id===s.id);
  const summary={id:s.id,positionId:s.positionId,positionTitle:s.positionTitle,roundNo:s.roundNo,
    relationship:s.relationship,status:s.status,answeredCount:s.count,revision:s.revision,
    createdAt:s.createdAt,updatedAt:s.updatedAt,completedAt:s.completedAt};
  if(index<0)state.assessments.push(summary);else state.assessments[index]=summary;
  renderHistory();
}
async function openAssessment(id) {
  const result=await state.backend.call('getAssessment',{assessment_id:id});
  state.session=new AssessmentSession(result,state.questions);
  const s=state.session,local=readDraft(id);
  let restored=false;
  if(s.canRestore(local)) {
    if(await confirmAction('พบคำตอบที่ยังไม่ได้บันทึกบนอุปกรณ์นี้ ต้องการ Restore local draft หรือไม่?')) {
      s.restore(local);restored=true;
    } else clearDraft(id);
  } else if(local && Number(local.base_revision)!==s.revision && !s.completed) {
    message('ฐานข้อมูลมี revision ใหม่กว่า Draft ในเครื่อง จึงเปิดผลที่บันทึกล่าสุด กรุณาตรวจคำตอบก่อนแก้ไข',true);
  }
  if(!restored) {
    const first=s.questions.findIndex(q=>!s.answers[q.id]);
    s.index=s.completed?0:first<0?71:first;
  }
  renderAssessment();
  showPage(s.count===72 && !s.completed?'completion':'assessment');
  renderCompletion();
}
function renderAssessment() {
  const s=state.session;
  if(!s)return;
  const q=state.questions[s.index];
  $('assessmentPosition').textContent=s.positionTitle;
  $('questionNumber').textContent=String(s.index+1).padStart(2,'0');
  $('optionAText').textContent=q.a;
  $('optionBText').textContent=q.b;
  $('progressFill').style.width=(s.count/72*100)+'%';
  $('progress').setAttribute('aria-valuenow',String(s.count));
  $('answeredCount').textContent=s.count+' / 72 answered';
  $('reviewBadge').hidden=!s.completed;
  for(const choice of ['A','B']) {
    const button=$('option'+choice),selected=s.answers[q.id]===choice;
    button.classList.toggle('selected',selected);
    button.setAttribute('aria-pressed',String(selected));
    button.querySelector('.answer-check').textContent=selected?'check_circle':'circle';
  }
  $('questionNext').textContent=s.index===71?'Finish →':'Next →';
  renderSaveState();
}
function choose(choice) {
  if(state.busy || !state.session || state.session.completed)return;
  state.session.answers[state.questions[state.session.index].id]=choice;
  keepDraft();
  renderAssessment();updateControls();
}
function previous() {
  const s=state.session;
  if(s.index===0) {
    if(s.completed)action(home);
    else showPage('instructions');
    return;
  }
  s.index--;keepDraft();renderAssessment();updateControls();
}
function next() {
  const s=state.session;
  if(!s.answers[state.questions[s.index].id])return;
  if(s.index<71) {s.index++;keepDraft();renderAssessment();updateControls();return;}
  if(s.count!==72) {
    s.index=state.questions.findIndex(q=>!s.answers[q.id]);
    renderAssessment();updateControls();
    message('กรุณาตอบให้ครบทั้ง 72 ข้อก่อนส่งผลประเมิน',true);
    return;
  }
  renderCompletion();showPage('completion');updateControls();
}
function renderCompletion() {
  const s=state.session;
  if(!s)return;
  $('submitAssessment').innerHTML='';
  $('submitAssessment').appendChild(icon(s.completed?'check_circle':'send'));
  $('submitAssessment').appendChild(document.createTextNode(s.completed?'Submitted':'Submit'));
  $('completionState').textContent=s.completed?'ส่งผลประเมินและบันทึกใน Firebase แล้ว':saveLabel();
}
async function save(mode='save',exit=false) {
  const s=state.session;
  if(!s || s.completed)return;
  if(mode==='submit') {
    if(s.count!==72)throw new Error('กรุณาตอบให้ครบ 72 ข้อก่อน Submit');
    if(!await confirmAction('ยืนยัน Submit ผลประเมิน? หลังส่งแล้วจะเปิดดูผลได้'))return;
  }
  const payload=s.request(mode,uuid);
  keepDraft();
  $('saveState').textContent='Saving to Firebase…';
  $('completionState').textContent=mode==='submit'?'Submitting…':'Saving to Firebase…';
  try {
    const result=await state.backend.call(mode==='submit'?'completeAssessment':'saveAssessmentSnapshot',payload);
    s.accept(result,mode);
    clearDraft(s.id);
    updateHistorySession();
    renderAssessment();renderCompletion();
    if(exit){showPage('home');state.session=null;await refreshData();}
    message(mode==='submit'?'ส่งผลประเมินและบันทึกใน Firebase แล้ว':'บันทึก Draft ใน Firebase แล้ว');
  } catch(error) {
    keepDraft();
    throw error;
  }
}
async function removeAssessment() {
  const s=state.session;
  if(!s || s.completed)return;
  if(!await confirmAction('ยืนยันลบฉบับร่างสำหรับ '+s.positionTitle+'? คำตอบในรอบนี้จะถูกลบถาวร'))return;
  const result=await state.backend.call('deleteAssessment',{assessment_id:s.id,expected_revision:s.revision,request_id:uuid()});
  if(!result.ok || !result.deleted)throw new Error('Deletion was not confirmed.');
  clearDraft(s.id);state.assessments=state.assessments.filter(a=>a.id!==s.id);
  state.session=null;renderHistory();showPage('home');
  message('ลบฉบับร่างแล้ว');
}
function newInformation() {
  state.session=null;state.information=null;
  $('informationForm').reset();
  showPage('information');$('targetPosition').focus();
}
async function prepareInformation() {
  const title=$('targetPosition').value.trim().replace(/\s+/g,' ');
  const selected=document.querySelector('input[name="relationship"]:checked');
  if(!title || !selected)throw new Error('กรุณาระบุตำแหน่งและความสัมพันธ์กับตำแหน่ง');
  let position=state.positions.find(p=>p.title.toLocaleLowerCase()===title.toLocaleLowerCase());
  if(!position) {
    position=await state.backend.call('createPosition',{title,request_id:uuid()});
    state.positions.push(position);renderHistory();
  }
  state.information={position_id:position.id,relationship:selected.value};
  showPage('instructions');
}
async function start() {
  if(state.session) {
    renderAssessment();showPage('assessment');return;
  }
  const info=state.information;
  if(!info) {showPage('information');return;}
  const key='sixma_create_'+config.projectId+'_'+state.backend.user().uid+'_'+info.position_id+'_'+info.relationship;
  let requestId=localStorage.getItem(key);
  if(!requestId){requestId=uuid();localStorage.setItem(key,requestId);}
  const result=await state.backend.call('createAssessment',{...info,request_id:requestId});
  localStorage.removeItem(key);
  if(!state.assessments.some(a=>a.id===result.id))state.assessments.push(result);
  await openAssessment(result.id);
}
async function boot() {
  try {
    state.backend=await connect(config);
    let user=state.backend.user();
    if(user&&!allowedAccount(user)) {
      await state.backend.logout();
      user=null;
    }
    if(user) {
      $('accountEmail').textContent=user.email||'';
      $('portalEmail').textContent=user.email||'';
      renderPortal();
      showLanding('portal');
    } else showLanding('login');
  } catch(error){showLanding('login');message(errorText(error),true);}
  finally{updateControls();}
}
$('googleSignIn').addEventListener('click',()=>action(async()=>{
  const result=await state.backend.login();
  $('accountEmail').textContent=result.user.email||'';
  $('portalEmail').textContent=result.user.email||'';
  renderPortal();showLanding('portal');
}));
const logout=()=>action(async()=>{keepDraft();await state.backend.logout();state.session=null;location.reload();});
$('signOut').addEventListener('click',logout);
$('portalSignOut').addEventListener('click',logout);
$('portalTop').addEventListener('click',()=>action(backToPortal));
$('createNew').addEventListener('click',()=>{if(!state.busy && state.ready)newInformation();});
$('homeTop').addEventListener('click',()=>action(home));
$('infoBack').addEventListener('click',()=>action(home));
$('informationForm').addEventListener('submit',event=>{event.preventDefault();action(prepareInformation);});
$('instructionsBack').addEventListener('click',()=>{
  if(state.session)action(home);else showPage('information');
});
$('startAssessment').addEventListener('click',()=>action(start));
$('optionA').addEventListener('click',()=>choose('A'));
$('optionB').addEventListener('click',()=>choose('B'));
$('questionBack').addEventListener('click',previous);
$('questionNext').addEventListener('click',next);
$('saveDuring').addEventListener('click',()=>action(()=>save()));
$('completionSave').addEventListener('click',()=>action(()=>save()));
$('submitAssessment').addEventListener('click',()=>action(()=>save('submit')));
$('deleteAssessment').addEventListener('click',()=>action(removeAssessment));
$('completionHome').addEventListener('click',()=>action(home));
$('reviewAnswers').addEventListener('click',()=>{state.session.index=0;renderAssessment();showPage('assessment');updateControls();});
window.addEventListener('beforeunload',event=>{
  if(state.session?.dirty && !state.session.completed) {
    keepDraft();event.preventDefault();event.returnValue='';
  }
});
$('positionToggle').addEventListener('click',()=>{
  if($('positionOptions').hidden)openPositions(true);else closePositions();
});
$('targetPosition').addEventListener('focus',()=>openPositions(true));
$('targetPosition').addEventListener('input',()=>{positionActive=-1;openPositions();});
$('targetPosition').addEventListener('keydown',event=>{
  if(event.key==='Escape'){closePositions();return;}
  if(event.key==='ArrowDown' || event.key==='ArrowUp') {
    event.preventDefault();
    if($('positionOptions').hidden)openPositions();
    const direction=event.key==='ArrowDown'?1:-1;
    positionActive=Math.max(0,Math.min(visiblePositions.length-1,positionActive+direction));
    renderPositions();
    document.getElementById('position-option-'+positionActive)?.scrollIntoView({block:'nearest'});
  }
  if(event.key==='Enter' && !$('positionOptions').hidden && positionActive>=0) {
    event.preventDefault();selectPosition(positionActive);
  }
  if(event.key==='Tab')closePositions();
});
document.addEventListener('pointerdown',event=>{
  if(!event.target.closest('.position-combobox'))closePositions();
});
$('confirmCancel').addEventListener('click',()=>$('confirmDialog').close('cancel'));
$('confirmAccept').addEventListener('click',()=>$('confirmDialog').close('confirm'));
boot();
