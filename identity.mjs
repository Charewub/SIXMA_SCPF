// Identity comes from the current verified Firebase token, never the Admin viewer.
export async function tokenIdentity(user) {
 if(!user?.emailVerified)throw Error('กรุณายืนยันอีเมลก่อนใช้งาน');
 const {claims}=await user.getIdTokenResult();
 const email=String(claims.email||'').toLowerCase();
 if(!claims.email_verified||!(/^[^@]+@airasia\.com$/.test(email)||email==='guntrakon@gmail.com'))throw Error('บัญชีไม่ได้รับอนุญาต');
 return {uid:user.uid,email,name:typeof claims.name==='string'?claims.name:''};
}
export const identityFields=(i,source,at)=>({
 created_by_name:i.name,created_by_email:i.email,identity_source:source,identity_recorded_at:at
});
export function ownsLegacy(system,data,i,path) {
 return system==='sixma'?data.created_by===i.uid:
 data.owner===i.email&&path.split('/')[1]===i.email&&(!data.owner_uid||data.owner_uid===i.uid);
}
export async function syncUser(f,db,user) {
 const i=await tokenIdentity(user);
 await f.setDoc(f.doc(db,'USERS',i.uid),{uid:i.uid,email:i.email,display_name:i.name,updated_at:f.serverTimestamp()});
 return i;
}
export async function linkLegacy(f,db,snapshot,system,i) {
 const data=snapshot.data();
 if(data.identity_source||!ownsLegacy(system,data,i,snapshot.ref.path))return data;
 return f.runTransaction(db,async tx=>{
  const fresh=await tx.get(snapshot.ref);
  if(!fresh.exists())return null;
  const d=fresh.data();
  if(d.identity_source||!ownsLegacy(system,d,i,snapshot.ref.path))return d;
  const patch={...identityFields(i,'linked',f.serverTimestamp()),...(system==='tc'?{owner_uid:i.uid}:{})};
  tx.update(snapshot.ref,patch);
  return {...d,...patch};
 });
}
