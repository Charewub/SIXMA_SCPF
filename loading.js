(() => {
 const root=document.getElementById('authLoading');
 const help=document.getElementById('loadingHelp');
 const text=document.getElementById('loadingHelpText');
 let finished=false;
 const timer=setTimeout(()=>{
  if(finished)return;
  help.hidden=false;text.textContent='ใช้เวลานานกว่าปกติ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต';
 },12000);
 document.getElementById('loadingRetry').onclick=()=>location.reload();
 window.finishAllstarLoading=()=>{
  if(finished)return;
  finished=true;clearTimeout(timer);
  root.classList.add('is-leaving');
  // No minimum loading delay; destination is already available underneath.
  setTimeout(()=>{root.hidden=true;},matchMedia('(prefers-reduced-motion: reduce)').matches?0:220);
 };
 window.addEventListener('error',e=>{
  if(finished)return;
  if(e.target?.tagName==='SCRIPT'||e.error){
   help.hidden=false;text.textContent='โหลดระบบไม่สำเร็จ กรุณาลองใหม่';
  }
 },true);
})();
