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
      return snapshot.docs.map(row => ({...row.data(), id: row.id}));
    }
    const ref = doc(records, id);
    if (action === 'get') {
      const snapshot = await getDocFromServer(ref);
      if (!snapshot.exists()) throw Error('ไม่พบรายการ');
      return snapshot.data();
    }
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
const button=(action,label)=>'<button class="btn" data-action="'+action+'">'+label+'</button>';
async function home(){const rows=await call('list');root.innerHTML='<h1>My Assessments</h1>'+button('new','สร้างแบบประเมิน')+button('logout','ออกจากระบบ')+rows.map(r=>'<div class="listcard">'+button('open-'+r.id,esc(r.department)+' · '+esc(r.period)+' · '+(r.status==='FINAL'?'บันทึกผลแล้ว':'ฉบับร่าง'))+'</div>').join('');}
function create(){root.innerHTML='<form class="card stack"><h2>สร้างแบบประเมิน</h2><label>หน่วยงาน <input required name="dept" value="" placeholder="กรอกแผนก"></label><label>รอบประเมิน <input required name="period"></label><label>Talent Pathway <select name="path"><option value="manager">Supervisor | Team Leader → Assistant Manager | Manager</option><option value="director">Manager | Senior Manager → HOD</option></select></label><h3>ผู้รับการประเมิน 3–5 คน</h3><p class="muted">กรอกชื่อภาษาอังกฤษและรหัสพนักงานที่ขึ้นต้นด้วย 1</p>'+Array.from({length:5},(_,i)=>'<div><input name="name'+i+'" aria-label="ชื่อพนักงานภาษาอังกฤษ" maxlength="150" pattern="[A-Za-z0-9 ]+" title="ใช้ A–Z, a–z, 0–9 และเว้นวรรคระหว่างชื่อ" placeholder="ชื่อพนักงานภาษาอังกฤษ" '+(i<3?'required':'')+'> <input name="emp'+i+'" aria-label="รหัสพนักงาน" type="text" inputmode="numeric" maxlength="100" pattern="1[0-9]*" title="เริ่มด้วย 1 และใช้ตัวเลขเท่านั้น เช่น 1020194" placeholder="เช่น 1020194" '+(i<3?'required':'')+'></div>').join('')+'<button class="btn primary">เริ่มประเมิน</button></form>'+button('home','กลับ');}
function question(){const q=Q[page];root.innerHTML='<section class="card"><p class="eyebrow">ข้อ '+(page+1)+' / 30 · '+esc(q.dimension)+'</p><div class="pbar"><span style="width:'+(100*(page+1)/Q.length)+'%"></span></div><h2 class="prompt">'+esc(q.text)+'</h2>'+record.people.map(p=>'<div class="rating"><b>'+esc(p.name)+'</b><div class="choices">'+['ทำได้อยู่บ่อยๆ แต่ยังต้องระมัดระวัง หรือมีข้อผิดพลาดบ้าง','ทำเป็นประจำ ตรงตามมาตรฐานและความคาดหวัง','ทำได้โดดเด่นสม่ำเสมอ เหนือความคาดหวัง'].map((l,i)=>'<button class="choice '+(record.answers[q.id]?.[p.id]===i+1?'sel':'')+'" data-rate="'+p.id+'" data-v="'+(i+1)+'">'+l+'</button>').join('')+'</div></div>').join('')+'<div class="actions">'+(page?button('prev','ย้อนกลับ'):'')+button('home','กลับหน้ารายการ')+button(page===29?'finish':'next',page===29?'ยืนยันและบันทึกผล':'ถัดไป')+'</div></section>';}
function summary(){const a=TALENT_ADVISORY[box];root.innerHTML='<p class="eyebrow">บันทึกผลแล้ว</p><h1>Talent Summary</h1>'+button('home','กลับหน้ารายการ')+'<div class="summary-grid"><section class="card"><h2>ภาพรวม 9-Box</h2><p>Performance → · Potential ↑</p><div class="nine"><span></span>'+['Low','Moderate','High'].map(v=>'<b>'+v+'</b>').join('')+[2,1,0].map(y=>'<b>'+label(y)+'</b>'+GROUPS[y].map((g,x)=>'<button class="mapcell summary-cell tone-'+x+y+' '+(g===box?'selected':'')+'" data-box="'+g+'"><strong>'+g+'</strong>'+record.people.filter(p=>record.results.find(r=>r.id===p.id).box===g).map(p=>'<span class="mapchip">'+esc(p.name)+'</span>').join('')+'</button>').join('')).join('')+'</div></section><section class="card"><h2>'+box+'</h2>'+record.people.filter(p=>record.results.find(r=>r.id===p.id).box===box).map(p=>{const r=record.results.find(r=>r.id===p.id);return '<p>'+esc(p.name)+' · Performance '+r.px.toFixed(2)+' · Potential '+r.py.toFixed(2)+'</p>';}).join('')+[['Talent Interpretation',a.interpretation],['Placement Recommendation — Why & When to Select',a.placement],['Talent Development',a.development],['Succession Recommendation',a.succession+' — '+a.successionDetail]].map(([h,t])=>'<section class="summary-dev"><h3>'+h+'</h3><p>'+esc(t)+'</p></section>').join('')+'</section></div>';}
async function run(fn){if(root.inert)return;root.inert=true;msg.textContent='';try{await fn();}catch(e){msg.textContent=e.message;}finally{root.inert=false;}}
root.onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);run(async()=>{const people=[];for(let i=0;i<5;i++){const name=f.get('name'+i).trim(),empId=f.get('emp'+i).trim();if(name||empId)people.push({id:'p'+people.length,name,empId});}id=crypto.randomUUID();record={revision:0,department:f.get('dept'),period:f.get('period'),path:f.get('path'),people,answers:{}};record=await call('save');page=0;question();});};
root.onclick=e=>{const b=e.target.closest('button');if(!b||!b.dataset.action&&!b.dataset.rate&&!b.dataset.box)return;run(async()=>{const action=b.dataset.action;if(b.dataset.rate){const q=Q[page],old=record;record={...old,answers:{...old.answers,[q.id]:{...old.answers[q.id],[b.dataset.rate]:Number(b.dataset.v)}}};try{record=await call('save');}catch(err){record=old;throw err;}question();return;}if(b.dataset.box){box=b.dataset.box;summary();return;}if(action==='login')await signInWithPopup(auth,new GoogleAuthProvider());if(action==='logout')await signOut(auth);if(action==='home')await home();if(action==='new')create();if(action.startsWith('open-')){id=action.slice(5);record=await call('get');if(record.status==='FINAL'){box=record.results[0].box;summary();}else{page=Q.findIndex(q=>record.people.some(p=>!record.answers[q.id]?.[p.id]));if(page<0)page=29;question();}}if(action==='prev'){page--;question();}if(action==='next'||action==='finish'){if(record.people.some(p=>!record.answers[Q[page].id]?.[p.id]))throw Error('กรุณาประเมินทุกคนในข้อนี้');if(action==='next'){page++;question();}else{record=await call('finish');box=record.results[0].box;summary();}}});};
onAuthStateChanged(auth,async user=>{root.innerHTML='';msg.textContent='';record=null;id=null;document.querySelector('#identity').textContent=user?.email||'';if(!user){root.innerHTML='<section class="card"><h1>Talent Compass</h1>'+button('login','เข้าสู่ระบบด้วยบัญชี Google บริษัท')+'</section>';return;}try{await home();}catch(e){msg.textContent=e.message;root.innerHTML=button('logout','ออกจากระบบ');}});
