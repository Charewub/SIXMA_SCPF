import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js';
import {getAuth,onAuthStateChanged,GoogleAuthProvider,signInWithPopup,signOut} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js';
import {getFirestore,collection,collectionGroup,query,orderBy,documentId,limit,startAfter,getDocsFromServer,getDocFromServer,doc} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js';
import {isAdmin,escapeHTML as esc,normalize,filterRows,csv,exportRows} from './core.mjs';
const $=id=>document.getElementById(id);
const auth=getAuth(initializeApp(window.SIXMA_FIREBASE_CONFIG)),db=getFirestore();
const PAGE=100;
let all=[],visible=[],sources={},epoch=0,busy=false,selected=null,questions=null;
let detailRequest=0;
const label=r=>r.system==='tc'?'Talent Compass':'SIXMA Success Profile';
const date=v=>{const d=v?.toDate?v.toDate():new Date(v);return v&&!isNaN(+d)?d.toLocaleString('th-TH',{timeZone:'Asia/Bangkok'}):'—';};
const reportError=e=> e.code==='permission-denied'?'ไม่มีสิทธิ์อ่านข้อมูล กรุณา Publish Firestore Rules ชุด Admin และตรวจบัญชีที่ใช้':
 e.code==='failed-precondition'?'Firestore ต้องการ Index เพิ่มเติม: '+e.message:'โหลดข้อมูลไม่สำเร็จ: '+(e.message||e);
function download(name,text,type) {const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function render() {
 const f=Object.fromEntries(['system','status','search','from','to'].map(k=>[k,$(k).value]));
 const invalid=f.from&&f.to&&f.from>f.to;
 visible=invalid?[]:filterRows(all,f);
 visible.sort((a,b)=>String(b.updated||'').localeCompare(String(a.updated||'')));
 $('stats').innerHTML=[['รายการที่ตรงตัวกรอง',visible.length],['ยังไม่ยืนยันผล',visible.filter(r=>!r.final).length],['ยืนยันผลแล้ว',visible.filter(r=>r.final).length],['รายชื่อใน Talent Compass',visible.reduce((n,r)=>n+r.people.length,0)]].map(([l,n])=>'<div class="stat"><small>'+l+'</small><strong>'+n+'</strong></div>').join('');
 $('rows').innerHTML=visible.map((r,i)=>'<tr><td><b>'+label(r)+'</b><small>'+esc(r.title)+'</small><small>'+esc(r.id)+'</small></td><td>'+esc(r.owner||'—')+'</td><td>'+esc(r.period||'—')+'</td><td><span class="pill '+(r.final?'final':'')+'">'+esc(r.status)+'</span></td><td>'+esc(date(r.updated))+'</td><td><button class="secondary" data-open="'+i+'">เปิดดู</button></td></tr>').join('')||'<tr><td colspan="6">'+(invalid?'วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด':'ไม่พบรายการในข้อมูลที่โหลดแล้ว')+'</td></tr>';
 const complete=Object.values(sources).every(s=>s.done);
 $('coverage').textContent='โหลดแล้ว '+all.length+' รายการ · '+(complete?'โหลดครบทั้งสองระบบ ณ เวลาที่อ่านข้อมูล':'ยังโหลดไม่ครบ — ยอดรวม การค้นหา และ CSV ครอบคลุมเฉพาะข้อมูลที่โหลดแล้ว');
 $('count').textContent='แสดง '+visible.length+' รายการ';
 $('more').hidden=complete;
 $('more').disabled=busy;
 $('export').disabled=busy||!visible.length;
}
async function load(reset=false) {
 if(busy||!isAdmin(auth.currentUser))return;
 busy=true;const ticket=epoch;
 $('message').textContent='กำลังอ่านข้อมูล…';$('refresh').disabled=true;
 if(reset){all=[];sources={sixma:{done:false},tc:{done:false}};selected=null;}
 render();
 const outcomes=await Promise.allSettled(Object.entries(sources).filter(([,s])=>!s.done).map(async([system,s])=>{
  const base=system==='sixma'?collection(db,'ASSESSMENTS'):collectionGroup(db,'assessments');
  const clauses=[orderBy(documentId()),limit(PAGE)];
  if(s.cursor)clauses.push(startAfter(s.cursor));
  const snap=await getDocsFromServer(query(base,...clauses));
  if(ticket!==epoch)return;
  s.done=snap.size<PAGE;s.cursor=snap.docs.at(-1)||s.cursor;
  for(const d of snap.docs) {
   if(system==='tc'&&!/^tcManagers\/[^/]+\/assessments\/[^/]+$/.test(d.ref.path))continue;
   if(!all.some(r=>r.path===d.ref.path))all.push(normalize(system,d.id,d.data(),d.ref.path));
  }
 }));
 if(ticket!==epoch)return;
 busy=false;$('refresh').disabled=false;
 const errors=outcomes.filter(r=>r.status==='rejected').map(r=>reportError(r.reason));
 $('message').textContent=errors.length?errors.join(' · '):'';
 render();
}
function fields(items){return '<div class="detail-grid">'+items.map(([k,v])=>'<div><small>'+esc(k)+'</small><p>'+esc(v??'—')+'</p></div>').join('')+'</div>';}
function table(headers,rows){return '<div class="table-wrap"><table><thead><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(v=>'<td>'+esc(v??'—')+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';}
async function openDetail(row) {
 const ticket=epoch, request=++detailRequest;
 selected=null;$('detail-body').textContent='กำลังโหลดรายละเอียดล่าสุด…';$('download-detail').disabled=true;$('print').disabled=true;$('detail').showModal();
 try {
  const snap=await getDocFromServer(doc(db,row.path));
  if(ticket!==epoch||request!==detailRequest||!$('detail').open)return;
  if(!snap.exists())throw Error('ไม่พบรายการนี้แล้ว');
  const r=normalize(row.system,row.id,snap.data(),row.path),d=r.data;
  let html='<h2>'+esc(label(r))+'</h2>'+fields([['รายการ',r.id],['สถานะ',r.status],['ผู้ประเมิน',r.owner],['ตำแหน่ง / หน่วยงาน',r.title],['รอบ / ช่วงเวลา',r.period],['อัปเดต',date(r.updated)]]);
  let response=null;
  if(r.system==='tc') {
   html+=fields([['Pathway',d.path],['Bank / Scoring version',(d.bankVersion||'')+' / '+(d.scoringVersion||'')]]);
   if(!r.final)html+='<p class="badge">ฉบับร่าง — ยังไม่มีผลประเมินที่ยืนยันแล้ว</p>';
   for(const p of r.people) {
    const result=r.final?d.results?.find(x=>x.id===p.id):null;
    html+='<section class="person"><h3>'+esc(p.name)+' · '+esc(p.empId)+'</h3>';
    if(result) {
     html+=fields([['Performance',result.px],['Potential',result.py],['9-Box',result.box]]);
     const advice=typeof TALENT_ADVISORY!=='undefined'?TALENT_ADVISORY[result.box]:null;
     if(advice)html+=[['Talent Interpretation',advice.interpretation],['Placement Recommendation — Why & When to Select',advice.placement],['Talent Development',advice.development],['Succession Recommendation',advice.succession+' — '+advice.successionDetail]].map(([h,t])=>'<h3>'+esc(h)+'</h3><p>'+esc(t)+'</p>').join('');
    } else if(r.final)html+='<p class="error">ไม่พบผลที่บันทึกไว้สำหรับพนักงานนี้</p>';
    html+='</section>';
   }
   const bank=typeof Q!=='undefined'?Q:[];
   html+='<h3>คำตอบที่บันทึกไว้</h3>'+table(['ข้อ','คำถาม',...r.people.map(p=>p.name)],bank.map(q=>[q.id,q.text,...r.people.map(p=>d.answers?.[q.id]?.[p.id]??'—')]));
  } else {
   const [rs,qs]=await Promise.all([getDocFromServer(doc(db,'RESPONSES',r.id)),questions?Promise.resolve(null):getDocsFromServer(collection(db,'PAIR_MASTER'))]);
   if(ticket!==epoch||request!==detailRequest||!$('detail').open)return;
   if(qs)questions=qs.docs.map(x=>x.data());
   response=rs.exists()?rs.data():null;
   html+=fields([['ความสัมพันธ์',d.relationship],['ตอบแล้ว',(d.answered_count??0)+' / 72'],['Questionnaire version',d.questionnaire_version]]);
   html+='<p class="muted">แสดงคำตอบตามที่บันทึกไว้ ระบบเดิมไม่ได้เก็บรายงานคะแนนสรุปในเอกสารนี้</p>';
   if(!response)html+='<p class="error">ไม่พบเอกสารคำตอบ</p>';
   else {
    if(response.revision!==d.revision)html+='<p class="error">รายการถูกแก้ไขระหว่างโหลด กรุณาปิดและเปิดรายละเอียดอีกครั้ง</p>';
    html+=table(['ข้อ','คำตอบ','ข้อความที่เลือก'],Array.from({length:72},(_,i)=>{
     const key='Q'+String(i+1).padStart(2,'0'),v=response[key]||'—';
     const q=questions.find(q=>q.questionnaire_version===d.questionnaire_version&&Number(q.pair_no)===i+1);
     return [key,v,v==='A'?q?.a_text_th:v==='B'?q?.b_text_th:'ยังไม่ตอบ'];
    }));
   }
  }
  selected={system:label(r),id:r.id,assessment:d,...(response?{response}:{})};
  $('detail-body').innerHTML=html;$('download-detail').disabled=false;$('print').disabled=false;
 } catch(e){if(ticket===epoch&&request===detailRequest)$('detail-body').textContent=reportError(e);}
}
onAuthStateChanged(auth,user=>{
 epoch++;busy=false;all=[];selected=null;questions=null;
 $('detail').close();$('detail-body').replaceChildren();$('rows').replaceChildren();$('stats').replaceChildren();
 $('workspace').hidden=true;$('identity').textContent=user?.email||'';$('signout').hidden=!user;$('gate').hidden=!!user;
 if(!user){$('message').textContent='กรุณาเข้าสู่ระบบ';return;}
 if(!isAdmin(user)){$('message').textContent='บัญชีนี้ไม่มีสิทธิ์ Admin กรุณาออกจากระบบแล้วเลือกบัญชีที่ได้รับสิทธิ์';return;}
 $('workspace').hidden=false;load(true);
});
$('login').onclick=async()=>{try{const p=new GoogleAuthProvider();p.setCustomParameters({prompt:'select_account'});await signInWithPopup(auth,p);}catch(e){$('message').textContent=reportError(e);}};
$('signout').onclick=()=>signOut(auth).catch(e=>$('message').textContent=reportError(e));
$('refresh').onclick=()=>load(true);$('more').onclick=()=>load();
for(const key of ['system','status','search','from','to'])$(key).addEventListener('input',render);
$('rows').onclick=e=>{const b=e.target.closest('[data-open]');if(b)openDetail(visible[Number(b.dataset.open)]);};
$('close').onclick=()=>$('detail').close();
$('export').onclick=()=>{if(isAdmin(auth.currentUser))download('ALLSTAR-admin-filtered.csv',csv(exportRows(visible)),'text/csv;charset=utf-8');};
$('download-detail').onclick=()=>{if(selected&&isAdmin(auth.currentUser))download('ALLSTAR-'+selected.id+'.json',JSON.stringify(selected,null,2),'application/json');};
$('print').onclick=()=>window.print();
