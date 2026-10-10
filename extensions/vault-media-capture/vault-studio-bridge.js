// Bridge between Vault's own studio pages and the Chrome extension.
// Never run this bridge on Venice/Perchance or arbitrary third-party pages.
(() => {
  const host = location.hostname.toLowerCase();
  if (!(host === "localhost" || (host.endsWith(".vercel.app") && host.includes("vault")) ||
        /^vault[.-]/.test(host) || host === "vault.ec" || host === "vault.eccreativestudios.com") ||
      !/^\/studios\/(?:venice|perchance)(?:\/|$)/.test(location.pathname)) return;
  const ORIGIN = location.origin;
  const METHODS = new Set(["VAULT_STUDIO_AUTOSAVE","VAULT_STUDIO_UPLOAD_FILE"]);
  const replies = new Map();
  const reply = (value) => window.postMessage({type:"VAULT_STUDIO_BRIDGE_REPLY",...value},ORIGIN);
  window.addEventListener("message",(event)=>{
    if(event.source!==window||event.origin!==ORIGIN||!event.data)return;
    const m = event.data;
    if(m.type==="VAULT_STUDIO_BRIDGE_REQUEST") {reply({available:true});return;}
    if(m.type==="VAULT_STUDIO_OPEN"){
      if(!["venice","perchance"].includes(m.site))return;
      chrome.runtime.sendMessage({type:"VAULT_STUDIO_OPEN",site:m.site,vaultOrigin:ORIGIN})
        .then(result=>reply({available:true,opened:!!result?.opened,error:result?.error||""}))
        .catch(e=>reply({available:true,error:e.message||"Extension could not open studio."}));
      return;
    }
    if(m.type==="VAULT_STUDIO_AUTOSAVE_RESULT"){
      const pending=replies.get(m.requestId);
      if(!pending)return;
      replies.delete(m.requestId);
      clearTimeout(pending.timer);
      pending.sendResponse({ok:!!m.ok,error:m.error||"",title:m.title||""});
    }
  });
  chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
    if(!METHODS.has(message?.type))return;
    if(typeof message.site!=="string"||!["venice","perchance"].includes(message.site)){
      sendResponse({ok:false,error:"Unknown site"});return;
    }
    const requestId=crypto.randomUUID();
    const timer=setTimeout(()=>{
      replies.delete(requestId);
      sendResponse({ok:false,error:"Vault did not confirm the save; reopen the Vault Studio page and try again."});
    },25000);
    replies.set(requestId,{sendResponse,timer});
    const payload={type:message.type,requestId,site:message.site,
      url:typeof message.url==="string"?message.url.slice(0,4096):"",
      filename:typeof message.filename==="string"?message.filename.slice(0,140):"",
      mimeType:typeof message.mimeType==="string"?message.mimeType.slice(0,90):"",
      dataUrl:typeof message.dataUrl==="string"?message.dataUrl:""};
    window.postMessage(payload,ORIGIN);
    return true;
  });
  reply({available:true});
})();