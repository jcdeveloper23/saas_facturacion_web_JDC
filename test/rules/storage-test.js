// Pruebas de storage.rules contra el emulador de Storage, con tokens sin firmar.
// Por ahora cubren el logo de la empresa (companies/{cid}/branding/).
//
//   firebase emulators:exec -c firebase.storage-rules-test.json --only storage \
//     --project demo-facturaec "node test/rules/storage-test.js"
const P=process.env.GCLOUD_PROJECT||'demo-facturaec', B=`${P}.appspot.com`, H=`http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST||'127.0.0.1:9299'}`;
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const now=()=>Math.floor(Date.now()/1000);
const tok=c=>`${b64({alg:'none',typ:'JWT'})}.${b64({iss:`https://securetoken.google.com/${P}`,aud:P,auth_time:now(),iat:now(),exp:now()+3600,sub:c.uid,user_id:c.uid,...c})}.`;
const up=(path,t,type='image/png',size=100)=>fetch(`${H}/v0/b/${B}/o?name=${encodeURIComponent(path)}`,{method:'POST',headers:{Authorization:`Bearer ${t}`,'Content-Type':type},body:Buffer.alloc(size,1)});
const del=(path,t)=>fetch(`${H}/v0/b/${B}/o/${encodeURIComponent(path)}`,{method:'DELETE',headers:{Authorization:`Bearer ${t}`}});
const get=(path,t)=>fetch(`${H}/v0/b/${B}/o/${encodeURIComponent(path)}?alt=media`,{headers:{Authorization:`Bearer ${t}`}});
let ok=0,n=0;const ex=async(name,p,s)=>{const r=await p;n++;const g=r.status===s;ok+=g;console.log(`${g?'OK  ':'FAIL'} ${name} [${r.status}, esperado ${s}]`)};
(async()=>{
 const admin=tok({uid:'a',companyId:'c1',role:'admin'}), cashier=tok({uid:'b',companyId:'c1',role:'cashier'}), other=tok({uid:'o',companyId:'c2',role:'admin'});
 await ex('admin sube PNG a branding', up('companies/c1/branding/logo.png',admin),200);
 await ex('admin sube JPG a branding', up('companies/c1/branding/logo.jpg',admin,'image/jpeg'),200);
 await ex('cajero lee el logo', get('companies/c1/branding/logo.png',cashier),200);
 await ex('cajero NO sube', up('companies/c1/branding/logo.png',cashier),403);
 await ex('admin de otra empresa NO sube', up('companies/c1/branding/logo.png',other),403);
 await ex('admin de otra empresa NO lee', get('companies/c1/branding/logo.png',other),403);
 await ex('admin NO sube un PDF', up('companies/c1/branding/logo.pdf',admin,'application/pdf'),403);
 await ex('admin NO sube > 2 MB', up('companies/c1/branding/logo.png',admin,'image/png',2*1024*1024+1),403);
 await ex('cajero NO borra', del('companies/c1/branding/logo.jpg',cashier),403);
 await ex('admin borra', del('companies/c1/branding/logo.jpg',admin),204);
 console.log(`\n${ok}/${n} casos OK`); if(ok!==n) process.exitCode=1;
})();
