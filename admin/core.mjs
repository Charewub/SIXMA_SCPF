export const ADMIN_EMAILS = ['guntrakon@gmail.com','guntrakon@airasia.com'];
export const isAdmin = u => !!u?.emailVerified && ADMIN_EMAILS.includes(String(u.email||'').toLowerCase());
export const escapeHTML = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function dateKey(v) {
 const date = v?.toDate ? v.toDate() : new Date(v);
 if (!v || Number.isNaN(+date)) return '';
 // Filters use Thai local calendar dates.
 return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}
export function normalize(system,id,data,path) {
 const tc=system==='tc';
 return {system,id,path,data,title:tc?(data.department||'ไม่ระบุหน่วยงาน'):(data.position_title_snapshot||id),
 owner:tc?data.owner:data.created_by,status:data.status||'ไม่ระบุ',final:tc?data.status==='FINAL':data.status==='Completed',
 updated:tc?data.updated:data.updated_at,period:tc?data.period:String(data.round_no??''),
 people:tc && Array.isArray(data.people)?data.people:[]};
}
export function filterRows(rows,f) {
 const q=(f.search||'').trim().toLowerCase();
 return rows.filter(r=>(!f.system||r.system===f.system)&&(!f.status||(f.status==='final'?r.final:!r.final))
 &&(!f.from||dateKey(r.updated)>=f.from)&&(!f.to||!!dateKey(r.updated)&&dateKey(r.updated)<=f.to)
 &&[r.id,r.title,r.owner,r.period,...r.people.flatMap(p=>[p.name,p.empId])].join(' ').toLowerCase().includes(q));
}
export function csvCell(v) {
 let s=String(v??'');
 if (/^[\s]*[=+@-]/.test(s)) s="'"+s;
 return '"'+s.replace(/"/g,'""')+'"';
}
export const csv = rows => '\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n');
export function exportRows(rows) {
 const result=[['System','Assessment ID','Status','Assessor email / UID','Position / Department','Period / Round','Updated','Employee name','Employee ID','Performance','Potential','9-Box']];
 for(const r of rows) for(const p of r.people.length?r.people:[{}]) {
  const score=r.final?r.data.results?.find(x=>x.id===p.id):null;
  result.push([r.system==='tc'?'Talent Compass':'SIXMA',r.id,r.status,r.owner,r.title,r.period,r.updated,p.name,p.empId,score?.px,score?.py,score?.box]);
 }
 return result;
}
