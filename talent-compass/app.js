import * as identitySDK from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import {syncUser,tokenIdentity,identityFields,linkLegacy} from '../identity.mjs?v=3';
import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,onAuthStateChanged,signOut} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {getFirestore,collection,doc,getDocFromServer,getDocsFromServer,query,orderBy,runTransaction} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
const config = window.SIXMA_FIREBASE_CONFIG;
if (!config?.projectId || !config?.apiKey) throw Error('โหลด firebase-config.js ของ Portal ไม่สำเร็จ');
const app = initializeApp(config);
const auth = getAuth(app);
const root=document.querySelector('#app'),msg=document.querySelector('#msg');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let id,record,page,box;
const db = getFirestore(app);

async function call(action) {
  const email = auth.currentUser.email.toLowerCase();
  const records = collection(db, 'tcManagers', email, 'assessments');
  try {
    if (action === 'list') {
      const snapshot = await getDocsFromServer(query(records, orderBy('updated', 'desc')));
      const identity=await tokenIdentity(auth.currentUser), rows=[];
      for(const row of snapshot.docs) {
        const linked=await linkLegacy(identitySDK,db,row,'tc',identity);
        if(linked)rows.push({...linked,id:row.id});
      }
      return rows;
    }
    const ref = doc(records, id);
    if (action === 'get') {
      const snapshot = await getDocFromServer(ref);
      if (!snapshot.exists()) throw Error('ไม่พบรายการ');
      return snapshot.data();
    }
    const identity=await tokenIdentity(auth.currentUser);
    const finishing = action === 'finish';
    const {people, answers, period, department, path, revision} = record;
    if (new Set(people.map(p => p.empId)).size !== people.length)
      throw Error('รหัสพนักงานในรายการต้องไม่ซ้ำกัน');
    if (finishing && Q.some(q => people.some(p => ![1,2,3].includes(answers[q.id]?.[p.id]))))
      throw Error('กรุณาประเมินให้ครบก่อนยืนยัน');
    return await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(ref);
      const previous = snapshot.data();
      if (previous?.status === 'FINAL') {
        if (finishing) return previous;
        throw Error('รายการนี้ยืนยันผลแล้ว กรุณาเปิดรายการล่าสุด');
      }
      if ((previous?.revision ?? 0) !== revision)
        throw Error('รายการถูกแก้ไขจากหน้าต่างอื่น กรุณากลับหน้า Home แล้วเปิดรายการล่าสุด');
      const updated = new Date().toISOString();
      const next = {owner: email, people, answers, period, department, path, revision: revision + 1,
        status: finishing ? 'FINAL' : 'DRAFT', bankVersion: 'v2.1', scoringVersion: 'v1', updated};
      Object.assign(next,previous?.identity_source ? {
        owner_uid:previous.owner_uid,created_by_name:previous.created_by_name,
        created_by_email:previous.created_by_email,identity_source:previous.identity_source,
        identity_recorded_at:previous.identity_recorded_at
      } : {owner_uid:identity.uid,...identityFields(identity,'created',identitySDK.serverTimestamp())});
      if (finishing) {
        next.finalizedAt = updated;
        next.results = people.map(person => {
          const scores = score(next, person);
          return {id: person.id, ...scores, box: GROUPS[lev(scores.py)][lev(scores.px)]};
        });
      }
      transaction.set(ref, next);
      return next;
    });
  } catch (error) {
    if (error.code === 'permission-denied')
      throw Error('บัญชีนี้ยังไม่มีสิทธิ์ทำรายการ กรุณาตรวจสิทธิ์ Manager และ Firestore Rules');
    throw error;
  }
}
const button=(action,label)=>'<button type="button" class="btn" data-action="'+action+'">'+label+'</button>';

const pathway = value => value === 'manager' ? 'Supervisor | Team Leader → Assistant Manager | Manager' : 'Manager | Senior Manager → HOD';
const completed = row => Q.filter(q => row.people.every(p => [1,2,3].includes(row.answers[q.id]?.[p.id]))).length;
function welcome() {
 root.innerHTML = '<section class="card welcome"><p class="eyebrow">TALENT COMPASS™</p><h1>Talent &amp; Successors Identification Journey</h1>'+document.getElementById('journey-image').innerHTML+'<div class="actions">'+button('guide','เข้าสู่ TALENT COMPASS™ →')+button('home','My Assessments')+'</div></section>';
}
function guide() { root.innerHTML = `<section class="byb-page">
<div class="byb-top"><div><p class="eyebrow">NEW ASSESSMENT</p><h1>Before You Begin</h1><p class="muted">How to use TALENT COMPASS™ · ประเมินโดยอ้างอิงพฤติกรรมจากการทำงานจริง</p></div><span class="byb-location">● YOU ARE HERE · IDENTIFY</span></div>

<div class="guide-original">${document.getElementById('instructions-image').innerHTML}</div><div class="byb-mobile text-alternative">
 <div class="byb-group"><span class="eyebrow">HOW TO USE TALENT COMPASS™</span><h2>Observe Behaviors. Recognize Potential.</h2><p class="muted" style="margin-top:6px;font-size:13px">พิจารณาการทำงานจริงในช่วง 12 เดือนที่ผ่านมา เพื่อประเมิน Performance และ Potential ผ่านคำถาม 30 ข้อ</p></div>
 <div class="byb-rules"><div class="byb-group"><h3>HOW TO THINK · แนวทางพิจารณา</h3>
 ${[['LOOK BEYOND IMPRESSIONS','อย่าตัดสินจากความรู้สึกหรือเหตุการณ์ล่าสุด'],['FOCUS ON REAL BEHAVIORS','พิจารณาวิธีคิด การตัดสินใจ การลงมือทำ และผลลัพธ์จริง'],['SEPARATE PERFORMANCE FROM POTENTIAL','ผลงานปัจจุบันไม่เท่ากับศักยภาพในอนาคตเสมอไป'],['ASSESS EACH PERSON INDEPENDENTLY','ประเมินแต่ละคนอย่างอิสระ ไม่จัดอันดับหรือบังคับกระจายคะแนน'],['APPLY FAIR AND CONSISTENT STANDARDS','ใช้เกณฑ์เดียวกันกับทุกคน โดยคำนึงถึงบริบทและโอกาส']].map((x,i)=>`<div class="byb-rule"><span class="byb-no">${i+1}</span><div><b>${x[0]}</b><p>${x[1]}</p></div></div>`).join('')}
 </div><div class="byb-group"><h3>HOW TO RATE · 3 ระดับคะแนน</h3><div class="byb-rating">
 <div class="byb-rating-item"><b>01 — ทำได้โดดเด่นสม่ำเสมอ เหนือความคาดหวัง</b><p>ทำได้ต่อเนื่องและสร้างผลลัพธ์ที่เหนือมาตรฐาน</p></div>
 <div class="byb-rating-item"><b>02 — ทำเป็นประจำ ตรงตามมาตรฐานและความคาดหวัง</b><p>ทำได้เหมาะสมด้วยตนเองและได้ผลลัพธ์ตามมาตรฐาน</p></div>
 <div class="byb-rating-item"><b>03 — ทำได้อยู่บ่อยๆ แต่ยังต้องระมัดระวัง หรือมีข้อผิดพลาดบ้าง</b><p>ทำได้บ่อย แต่บางครั้งยังต้องการคำแนะนำหรือปรับปรุง</p></div>
 </div><div class="byb-remind" style="margin-top:14px">IMPORTANT: ประเมินทุกคนให้ครบทุกข้อ หลายคนอยู่ระดับเดียวกันได้ ไม่จำเป็นต้องกระจายคะแนนให้ครบทั้ง 3 ระดับ</div></div></div>
</div>
<div class="byb-actions"><label class="byb-check"><input id="bybConsent" type="checkbox" aria-label="ยืนยันว่าจะประเมินอย่างเป็นธรรม"><span><b>Before You Start</b><br>ข้าพเจ้าจะประเมินจากพฤติกรรมจริง ด้วยวิจารณญาณที่เป็นธรรม</span></label><button class="btn primary" id="bybContinue" data-action="begin" disabled>I UNDERSTAND — START ASSESSMENT →</button></div>
<p class="byb-note">ขั้นตอนถัดไป: เลือก Pathway และระบุชื่อพนักงาน 3–5 คน ก่อนเริ่มทำ 30 ข้อ · บันทึกข้อมูลใน Firestore</p>
</section>`; }
async function home() {
 const rows = await call('list');
 root.innerHTML = '<div class="pagehead"><div><p class="eyebrow">WORKSPACE</p><h1>My Assessments</h1><p class="muted">ยินดีต้อนรับ '+esc(auth.currentUser.displayName || auth.currentUser.email)+'</p></div><div class="actions">'+button('guide','+ สร้าง Assessment')+button('welcome','View Journey')+'</div></div><div class="grid cols3 stats">'+[
 ['Assessments ทั้งหมดที่เข้าถึงได้',rows.length],
 ['ฉบับร่าง',rows.filter(r=>r.status==='DRAFT').length],
 ['บันทึกผลแล้ว',rows.filter(r=>r.status==='FINAL').length]
 ].map(([title,count])=>'<div class="stat"><small>'+title+'</small><b>'+count+'</b></div>').join('')+'</div><section class="assessment-list"><h2>รายการประเมินของฉัน</h2>'+(
 rows.map(row => '<article class="listcard"><div class="between"><div><h3>'+pathway(row.path)+'</h3><p class="muted">'+esc(row.department)+' · '+esc(row.period)+' · '+row.people.length+' คน</p></div><span class="pill '+row.status+'">'+(row.status==='FINAL'?'บันทึกผลแล้ว':'ฉบับร่าง')+'</span></div><div class="between progress-meta"><span>'+completed(row)+' / 30 ข้อ</span><small class="muted">อัปเดต '+esc(new Date(row.updated).toLocaleString('th-TH'))+'</small></div><div class="pbar"><span style="width:'+completed(row)/30*100+'%"></span></div><div class="actions">'+button('open-'+row.id,row.status==='FINAL'?'ดูผล / รายละเอียด →':'ทำต่อ / แก้ไข →')+'</div></article>').join('')
 || '<div class="card empty"><h3>ยังไม่มีรายการประเมิน</h3><p class="muted">เริ่มต้นด้วยการสร้าง Assessment ใหม่สำหรับ Talent Pool ของคุณ</p>'+button('guide','+ สร้าง Assessment ใหม่')+'</div>')+'</section>';
}

const examples = [
 {name:'Nara Smith', code:'1020194'}, {name:'Alex Tan', code:'1035827'},
 {name:'Priya Kumar', code:'1017463'}, {name:'Daniel Lee', code:'1042685'},
 {name:'Maya Chen', code:'1029531'}
];
function personInput(index) {
 const example = examples[index];
 return '<div class="person-input"><label>พนักงาน '+(index+1)+'<input name="name'+index+'" aria-label="ชื่อพนักงานภาษาอังกฤษ" maxlength="150" pattern="[A-Za-z0-9 ]+" title="ใช้ A–Z, a–z, 0–9 และเว้นวรรคระหว่างชื่อ" placeholder="'+example.name+'" required></label><label>Employee ID<input name="emp'+index+'" aria-label="รหัสพนักงาน" type="text" inputmode="numeric" maxlength="100" pattern="1[0-9]*" title="ตัวเลขเท่านั้น" placeholder="'+example.code+'" required></label></div>';
}
function create() {
 root.innerHTML = '<form class="card stack"><h2>สร้างการประเมินใหม่</h2><p class="muted">เลือก Pathway และกรอกชื่อพนักงาน 3–5 คน</p><label>Department <input required name="dept" value="" placeholder="กรอกแผนก"></label><label>Assessment Period <input required name="period" placeholder="เช่น 2026 H2"></label><label>Talent Pathway <select name="path"><option value="manager">Supervisor | Team Leader → Assistant Manager | Manager</option><option value="director">Manager | Senior Manager → HOD</option></select></label><h3>รายชื่อพนักงาน</h3><p class="muted">กรอกชื่อภาษาอังกฤษและรหัสพนักงาน (ตัวเลขเท่านั้น)</p><div id="personInputs" class="stack">'+[0,1,2].map(personInput).join('')+'</div><div class="actions">'+button('add-person','+ เพิ่มชื่อ (สูงสุด 5)')+button('remove-person','− ลบชื่อสุดท้าย')+'</div><div class="info">ระบบจะบันทึกเป็น Draft ทันทีเมื่อสร้างรายการ และสามารถกลับมาทำต่อได้</div><button class="btn primary">สร้างและเริ่มประเมิน</button></form>'+button('home','กลับ');
 root.querySelector('[data-action="remove-person"]').disabled = true;
}
function updatePeople(action) {
 const inputs = document.getElementById('personInputs');
 const count = inputs.children.length;
 if(action === 'add-person' && count < 5) inputs.insertAdjacentHTML('beforeend',personInput(count));
 if(action === 'remove-person' && count > 3) inputs.lastElementChild.remove();
 root.querySelector('[data-action="add-person"]').disabled = inputs.children.length >= 5;
 root.querySelector('[data-action="remove-person"]').disabled = inputs.children.length <= 3;
}
function question() {
 const q=Q[page],dim=D.find(d=>d.id===q.domain),answers=record.answers[q.id]||{};
 root.innerHTML='<div class="pagehead"><div><p class="eyebrow">TALENT ASSESSMENT</p><h1>ประเมินพฤติกรรม</h1><p class="muted">'+pathway(record.path)+' · '+esc(record.department)+'</p></div>'+button('home','← My Assessments')+'</div><section class="card"><div class="between"><span class="muted">Question '+(page+1)+' of 30 · '+esc(dim.name)+'</span><span class="pill">บันทึกข้อมูลแล้ว</span></div><div class="pbar"><span style="width:'+completed(record)/30*100+'%"></span></div><p class="muted progress-meta">'+esc(q.dimension)+' · '+esc(dim.desc)+'</p><h2 class="prompt">'+esc(q.text)+'</h2><p class="muted">โปรดให้คะแนนพนักงานทุกคนจากพฤติกรรมที่สังเกตได้จริง สามารถให้คะแนนเดียวกันหลายคนได้</p><details class="progress-meta"><summary>แนวทางหลักฐานสำหรับ '+(record.path==='manager'?'Manager':'Director')+' Role</summary><p>'+esc(dim.lens[record.path])+'</p></details>'+
 record.people.map(p=>'<div class="rating"><b>'+esc(p.name)+'</b><div class="choices">'+[
 [3,'ทำได้โดดเด่นสม่ำเสมอ เหนือความคาดหวัง'],
 [2,'ทำเป็นประจำ ตรงตามมาตรฐานและความคาดหวัง'],
 [1,'ทำได้อยู่บ่อยๆ แต่ยังต้องระมัดระวัง หรือมีข้อผิดพลาดบ้าง']
 ].map(([v,t])=>'<button type="button" class="choice '+(answers[p.id]===v?'sel':'')+'" data-rate="'+p.id+'" data-v="'+v+'" aria-pressed="'+(answers[p.id]===v)+'">'+t+'</button>').join('')+'</div></div>').join('')+
 '<p class="muted">ตอบแล้ว '+record.people.filter(p=>[1,2,3].includes(answers[p.id])).length+' / '+record.people.length+' คน ในข้อนี้ · รวม '+completed(record)+' / 30 ข้อ</p><div class="actions">'+(page?button('prev','← ก่อนหน้า'):'')+button('home','บันทึกและออก')+button(page===29?'finish':'next',page===29?'ยืนยันและบันทึกผล':'ข้อถัดไป →')+'</div></section>';
}
function summary(){const a=TALENT_ADVISORY[box];root.innerHTML='<p class="eyebrow">บันทึกผลแล้ว</p><h1>Talent Summary</h1>'+button('home','กลับหน้ารายการ')+'<div class="summary-grid"><section class="card"><h2>ภาพรวม 9-Box</h2><p>Performance → · Potential ↑</p><div class="nine"><span></span>'+['Low','Moderate','High'].map(v=>'<b>'+v+'</b>').join('')+[2,1,0].map(y=>'<b>'+label(y)+'</b>'+GROUPS[y].map((g,x)=>'<button class="mapcell summary-cell tone-'+x+y+' '+(g===box?'selected':'')+'" data-box="'+g+'"><strong>'+g+'</strong>'+record.people.filter(p=>record.results.find(r=>r.id===p.id).box===g).map(p=>'<span class="mapchip">'+esc(p.name)+'</span>').join('')+'</button>').join('')).join('')+'</div></section><section class="card"><h2>'+box+'</h2>'+record.people.filter(p=>record.results.find(r=>r.id===p.id).box===box).map(p=>{const r=record.results.find(r=>r.id===p.id);return '<p>'+esc(p.name)+' · Performance '+r.px.toFixed(2)+' · Potential '+r.py.toFixed(2)+'</p>';}).join('')+[['Talent Interpretation',a.interpretation],['Placement Recommendation — Why & When to Select',a.placement],['Talent Development',a.development],['Succession Recommendation',a.succession+' — '+a.successionDetail]].map(([h,t])=>'<section class="summary-dev"><h3>'+h+'</h3><p>'+esc(t)+'</p></section>').join('')+'</section></div>';}
async function run(fn){if(root.inert)return;root.inert=true;msg.textContent='';try{await fn();}catch(e){msg.textContent=e.message;}finally{root.inert=false;}}
root.onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);run(async()=>{const people=[];for(let i=0;i<5;i++){const name=(f.get('name'+i)||'').trim(),empId=(f.get('emp'+i)||'').trim();if(name||empId){
if(!name || !/^1[0-9]*$/.test(empId) || !/^[A-Za-z0-9 ]+$/.test(name))throw Error('กรอกชื่อภาษาอังกฤษและรหัสพนักงาน (ตัวเลขเท่านั้น) ให้ครบ');
people.push({id:'p'+people.length,name,empId});
}}if(people.length<3 || people.length>5)throw Error('กรุณาระบุพนักงาน 3–5 คน');id=crypto.randomUUID();record={revision:0,department:f.get('dept'),period:f.get('period'),path:f.get('path'),people,answers:{}};record=await call('save');page=0;question();});};
root.onclick=e=>{const b=e.target.closest('button');if(!b||!b.dataset.action&&!b.dataset.rate&&!b.dataset.box)return;run(async()=>{const action=b.dataset.action;if(b.dataset.rate){const q=Q[page],old=record;record={...old,answers:{...old.answers,[q.id]:{...old.answers[q.id],[b.dataset.rate]:Number(b.dataset.v)}}};try{record=await call('save');}catch(err){record=old;throw err;}question();return;}if(b.dataset.box){box=b.dataset.box;summary();return;}if(action==='login')await signInWithPopup(auth,new GoogleAuthProvider());if(action==='logout')await signOut(auth);if(action==='home')await home();if(action==='add-person'||action==='remove-person')updatePeople(action);if(action==='welcome')welcome();if(action==='guide'||action==='new')guide();if(action==='begin'&&document.getElementById('bybConsent')?.checked)create();if(action?.startsWith('open-')){id=action.slice(5);record=await call('get');if(record.status==='FINAL'){box=record.results[0].box;summary();}else{page=Q.findIndex(q=>record.people.some(p=>!record.answers[q.id]?.[p.id]));if(page<0)page=29;question();}}if(action==='prev'){page--;question();}if(action==='next'||action==='finish'){if(record.people.some(p=>!record.answers[Q[page].id]?.[p.id]))throw Error('กรุณาประเมินทุกคนในข้อนี้');if(action==='next'){page++;question();}else{record=await call('finish');box=record.results[0].box;summary();}}});};
onAuthStateChanged(auth,async user=>{root.innerHTML='';msg.textContent='';record=null;id=null;document.querySelector('#identity').textContent=user?.email||'';if(!user){root.innerHTML='<section class="card"><h1>Talent Compass</h1>'+button('login','เข้าสู่ระบบด้วยบัญชี Google บริษัท')+'</section>';return;}try{await syncUser(identitySDK,db,user);await call('list');welcome();}catch(e){msg.textContent=e.message;root.innerHTML=button('logout','ออกจากระบบ');}});

root.addEventListener('change', event => {
 if(event.target.id === 'bybConsent') document.getElementById('bybContinue').disabled = !event.target.checked;
});
