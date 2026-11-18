export function setProfile(user) {
 const el=id=>document.getElementById(id), email=String(user?.email||'');
 el('profileName').textContent=user?.displayName||email||'บัญชีผู้ใช้';
 el('profileInitial').textContent=email.charAt(0).toUpperCase()||'?';
 const photo=el('profilePhoto');photo.hidden=true;el('profileInitial').hidden=false;
 photo.onload=()=>{photo.hidden=false;el('profileInitial').hidden=true;};
 photo.onerror=()=>{photo.hidden=true;el('profileInitial').hidden=false;};
 if(user?.photoURL && /^https:\/\//.test(user.photoURL)){photo.referrerPolicy='no-referrer';photo.src=user.photoURL;}else photo.removeAttribute('src');
 el('profileAdmin').hidden=!(user?.emailVerified&&['guntrakon@gmail.com','guntrakon@airasia.com'].includes(email.toLowerCase()));
 const menu=el('userProfile');menu.open=false;
 if(!menu.dataset.bound){
  menu.dataset.bound='true';
  document.addEventListener('click',e=>{if(!menu.contains(e.target))menu.open=false;});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&menu.open){menu.open=false;menu.querySelector('summary').focus();}});
 }
}
