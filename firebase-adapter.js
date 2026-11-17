export const VERSION = 'SIXMA_LEADING_PEOPLE_72_TYPE01_02_03_V1';
export const KEYS = Array.from({length:72}, (_,i) => 'Q'+String(i+1).padStart(2,'0'));
export function choices(row) { return KEYS.map(key => row?.[key] || ''); }
export function validateAnswers(answers, finish = false) {
  if (!Array.isArray(answers) || answers.length !== 72 || answers.some(x => !['','A','B'].includes(x))) {
    throw new Error('ANSWERS_MUST_BE_72_A_B_OR_BLANK');
  }
  if (finish && answers.includes('')) throw new Error('INCOMPLETE_ASSESSMENT');
  return answers.filter(Boolean).length;
}
export function project(a) {
  return {id:a.assessment_id,positionId:a.position_id,positionTitle:a.position_title_snapshot,
    roundNo:Number(a.round_no),relationship:a.relationship||'',questionnaireVersion:a.questionnaire_version,status:a.status,
    answeredCount:Number(a.answered_count),totalPairs:72,currentPairNo:Number(a.current_pair_no),
    revision:Number(a.revision),createdAt:a.created_at,updatedAt:a.updated_at,completedAt:a.completed_at || null};
}
function receipt(a) {
  return {ok:true,assessment_id:a.assessment_id,status:a.status,answered_count:a.answered_count,
    revision:a.revision,saved_at:a.updated_at,completed_at:a.completed_at || null};
}
export function nextSnapshot(a,r,input,finish,at,actor) {
  const n=validateAnswers(input.answers,finish);
  if(a.questionnaire_version!==VERSION) throw new Error('QUESTIONNAIRE_VERSION_MISMATCH');
  const equal=JSON.stringify(choices(r))===JSON.stringify(input.answers);
  if(a.status==='Completed') {
    if(finish && equal) return null;
    throw new Error('ASSESSMENT_LOCKED');
  }
  if(r?.last_request_id===input.request_id) {
    if(!equal) throw new Error('REQUEST_ID_REUSED_WITH_DIFFERENT_ANSWERS');
    return null;
  }
  if(!Number.isInteger(input.expected_revision) || a.revision!==input.expected_revision) {
    throw new Error('REVISION_CONFLICT_RELOAD_ASSESSMENT');
  }
  if(!r || r.revision!==a.revision) throw new Error('RESPONSE_ASSESSMENT_REVISION_MISMATCH');
  if(!finish && equal) return null;
  const next={...a,status:finish?'Completed':n?'In Progress':'Not Started',answered_count:n,
    current_pair_no:Math.max(1,Math.min(72,Number(input.current_pair_no)||1)),
    revision:a.revision+1,updated_at:at,completed_at:finish?at:''};
  const response={...r,status:next.status,answered_count:n,revision:next.revision,
    saved_at:at,last_request_id:input.request_id,saved_by:actor};
  KEYS.forEach((k,i)=>response[k]=input.answers[i]);
  return {assessment:next,response};
}
export async function connect(config) {
  if(!config?.projectId || Object.values(config).some(v=>String(v).includes('REPLACE_WITH'))) {
    throw new Error('Please complete firebase-config.js with your Firebase web app configuration.');
  }
  const base='https://www.gstatic.com/firebasejs/12.6.0/';
  const [appSDK,authSDK,f] = await Promise.all([
    import(base+'firebase-app.js'),import(base+'firebase-auth.js'),import(base+'firebase-firestore.js')
  ]);
  const app=appSDK.initializeApp(config);
  const auth=authSDK.getAuth(app);
  const db=f.getFirestore(app);
  await auth.authStateReady();
  const ref=(tab,id)=>f.doc(db,tab,id);
  const list=async tab=>(await f.getDocsFromServer(f.collection(db,tab))).docs.map(d=>d.data());
  const actor=()=>auth.currentUser?.uid;
  const requireUser=()=>{if(!actor())throw new Error('Sign in with your authorized Google account to continue.');};
  const audit=(tx,input,event,id,at)=>tx.set(ref('AUDIT_LOG',input.request_id),{
    event_id:input.request_id,request_id:input.request_id,event_type:event,assessment_id:id,
    actor:actor(),created_at:at,pair_id:'',previous_option:'',new_option:''});
  return {
    user:()=>auth.currentUser,
    login:()=>authSDK.signInWithPopup(auth,new authSDK.GoogleAuthProvider()),
    logout:()=>authSDK.signOut(auth),
    async call(method,input={}) {
      requireUser();
      if(method==='getBootstrap') {
        const marker=await f.getDocFromServer(ref('_SIXMA','migration'));
        if(!marker.exists() || marker.data().ready!==true)throw new Error('Database migration is not complete. Contact the administrator.');
        const [positions,assessments,pairs]=await Promise.all(['POSITIONS','ASSESSMENTS','PAIR_MASTER'].map(list));
        const questions=pairs.filter(p=>p.questionnaire_version===VERSION).sort((a,b)=>a.pair_no-b.pair_no);
        if(questions.length!==72 || questions.some((p,i)=>p.pair_id!=='LP72-'+String(i+1).padStart(3,'0') || p.qa_status!=='PASS')) {
          throw new Error('Import the SIXMA migration data before opening assessments.');
        }
        return {questionnaire_version:VERSION,response_schema:'WIDE72_V1',
          positions:positions.filter(p=>String(p.is_active).toUpperCase()==='TRUE')
            .sort((a,b)=>a.display_order-b.display_order).map(p=>({id:p.position_id,title:p.position_title})),
          assessments:assessments.map(project),questions:questions.map(p=>({id:p.pair_id,pairNo:p.pair_no,a:p.a_text_th,b:p.b_text_th}))};
      }
      if(method==='getAssessment') {
        return f.runTransaction(db,async tx=>{
          const [a,r]=await Promise.all([tx.get(ref('ASSESSMENTS',input.assessment_id)),tx.get(ref('RESPONSES',input.assessment_id))]);
          if(!a.exists() || !r.exists())throw new Error('ASSESSMENT_NOT_FOUND');
          const answers={};choices(r.data()).forEach((v,i)=>{if(v)answers['LP72-'+String(i+1).padStart(3,'0')]=v;});
          return {assessment:project(a.data()),answers};
        });
      }
      if(!input.request_id || input.request_id.includes('/'))throw new Error('INVALID_REQUEST_ID');
      if(method==='createPosition') {
        const title=String(input.title||'').trim().replace(/\s+/g,' ');
        if(!title || title.length>200 || /^[=+@-]/.test(title))throw new Error('INVALID_POSITION_TITLE');
        const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(title.toLocaleLowerCase()));
        const id='POS-'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
        return f.runTransaction(db,async tx=>{
          const old=await tx.get(ref('POSITIONS',id));
          if(old.exists())return {id,title:old.data().position_title};
          const at=new Date().toISOString();
          tx.set(ref('POSITIONS',id),{position_id:id,position_title:title,is_active:true,last_round_no:0,display_order:9999,created_at:at,updated_at:at});
          audit(tx,input,'create_position','',at);return {id,title};
        });
      }
      if(method==='createAssessment') {
        const relationship=input.relationship||'';
        if(relationship && !['Line Manager','Current Role Holder','Peers','Direct Reports'].includes(relationship)) {
          throw new Error('INVALID_RELATIONSHIP');
        }
        const id='ASM-'+input.request_id;
        return f.runTransaction(db,async tx=>{
          const [existing,pos]=await Promise.all([tx.get(ref('ASSESSMENTS',id)),tx.get(ref('POSITIONS',input.position_id))]);
          if(existing.exists())return project(existing.data());
          if(!pos.exists() || String(pos.data().is_active).toUpperCase()!=='TRUE')throw new Error('POSITION_NOT_FOUND_OR_INACTIVE');
          const at=new Date().toISOString(),p=pos.data(),round=Number(p.last_round_no||0)+1;
          const a={assessment_id:id,position_id:input.position_id,position_title_snapshot:p.position_title,
            round_no:round,relationship,questionnaire_version:VERSION,status:'Not Started',answered_count:0,total_pairs:72,
            current_pair_no:1,revision:0,create_request_id:input.request_id,created_at:at,updated_at:at,completed_at:'',created_by:actor()};
          const r={assessment_id:id,position_id:a.position_id,position_title:p.position_title,round_no:round,
            questionnaire_version:VERSION,status:a.status,answered_count:0,revision:0,saved_at:'',last_request_id:'',saved_by:actor()};
          KEYS.forEach(k=>r[k]='');
          tx.set(ref('POSITIONS',input.position_id),{...p,last_round_no:round});
          tx.set(ref('ASSESSMENTS',id),a);tx.set(ref('RESPONSES',id),r);
          audit(tx,input,'create_assessment',id,at);return project(a);
        });
      }
      if(['saveAssessmentSnapshot','completeAssessment','deleteAssessment'].includes(method)) {
        return f.runTransaction(db,async tx=>{
          const ar=ref('ASSESSMENTS',input.assessment_id),rr=ref('RESPONSES',input.assessment_id);
          const [as,rs]=await Promise.all([tx.get(ar),tx.get(rr)]);
          if(!as.exists()) {
            if(method==='deleteAssessment')return {ok:true,deleted:true,assessment_id:input.assessment_id};
            throw new Error('ASSESSMENT_NOT_FOUND');
          }
          const a=as.data(),at=new Date().toISOString();
          if(method==='deleteAssessment') {
            if(a.revision!==input.expected_revision)throw new Error('REVISION_CONFLICT_RELOAD_ASSESSMENT');
            tx.delete(ar);tx.delete(rr);audit(tx,input,'delete_assessment',input.assessment_id,at);
            return {ok:true,deleted:true,assessment_id:input.assessment_id};
          }
          const next=nextSnapshot(a,rs.data(),input,method==='completeAssessment',at,actor());
          if(!next)return receipt(a);
          tx.set(ar,next.assessment);tx.set(rr,next.response);
          audit(tx,input,method,input.assessment_id,at);return receipt(next.assessment);
        });
      }
      throw new Error('UNKNOWN_METHOD');
    }
  };
}
