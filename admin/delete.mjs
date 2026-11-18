// Atomic per assessment: SIXMA metadata + response + deletion audit.
// Explicit revision check prevents deleting a record changed since selection.
export async function deleteRecord({db,doc,runTransaction},row,actor,eventId) {
 const valid=row.system==='sixma'?row.path==='ASSESSMENTS/'+row.id:
 /^tcManagers\/[^/]+\/assessments\/[^/]+$/.test(row.path);
 if(!valid)throw Error('เส้นทางรายการไม่ถูกต้อง');
 return runTransaction(db,async tx=>{
  const target=doc(db,row.path),snapshot=await tx.get(target);
  if(!snapshot.exists())return;
  if(snapshot.data().revision!==row.data.revision)throw Error('รายการมีการแก้ไขหลังโหลด กรุณาโหลดข้อมูลใหม่');
  tx.delete(target);
  if(row.system==='sixma')tx.delete(doc(db,'RESPONSES',row.id));
  tx.set(doc(db,'AUDIT_LOG',eventId),{event_id:eventId,actor,event_type:'admin_delete_assessment',assessment_id:row.id,system:row.system,document_path:row.path,created_at:new Date().toISOString()});
 });
}
