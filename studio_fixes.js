const StudioText = {
  normalize(value) {
    return String(value ?? '').normalize('NFKC')
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
      .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي')
      .replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();
  },
  hasContent(value) { return this.normalize(value).length >= 2; },
  changed(value, baseline) {
    const a = this.normalize(value), b = this.normalize(baseline);
    return this.hasContent(value) && a !== b;
  }
};


// Validation uses browser parsing and computed styles, not whole-source keyword matches.
const StudioChecks = {
  source(raw) { return raw.replace(/<!--[\s\S]*?-->/g, ''); },
  css(raw, selector, required) {
    const parsed = new DOMParser().parseFromString(raw, 'text/html');
    const target = parsed.querySelector(selector);
    if (!target) return false;
    const sheet = new CSSStyleSheet();
    sheet.replaceSync([...parsed.querySelectorAll('style')].map(s => s.textContent).join('\n'));
    const declarations = [];
    function collect(rules) {
      for (const rule of rules) {
        if (rule.selectorText) {
          try { if (target.matches(rule.selectorText)) declarations.push(rule); } catch (_) {}
        } else if (rule.cssRules && (!rule.conditionText || matchMedia(rule.conditionText).matches)) collect(rule.cssRules);
      }
    }
    collect(sheet.cssRules);
    // Require the taught selector to occur in a real, matching rule.
    if (!declarations.some(r => r.selectorText.split(',').some(s => s.trim() === selector))) return false;
    for (const prop of Object.keys(required)) {
      if (!declarations.some(r => r.style.getPropertyValue(prop))) return false;
    }
    parsed.querySelectorAll('script,link,meta,base,iframe,object,embed,svg,math').forEach(e => e.remove());
    parsed.querySelectorAll('*').forEach(el => {
      for (const a of [...el.attributes]) if (/^on/i.test(a.name) || /^(src|srcset|href|action|formaction)$/i.test(a.name)) el.removeAttribute(a.name);
    });
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-same-origin');
    frame.style.cssText = 'position:absolute;left:-10000px;top:0;width:600px;height:400px;border:0;visibility:hidden';
    document.body.append(frame);
    try {
      const d = frame.contentDocument;
      d.open(); d.write('<!doctype html><html><head></head><body></body></html>'); d.close();
      const csp = d.createElement('meta'); csp.httpEquiv = 'Content-Security-Policy';
      csp.content = "default-src 'none'; style-src 'unsafe-inline'"; d.head.append(csp);
      for (const s of parsed.querySelectorAll('style')) { const n = d.createElement('style'); n.textContent = s.textContent; d.head.append(n); }
      d.body.innerHTML = parsed.body.innerHTML;
      const el = d.querySelector(selector);
      if (!el) return false;
      const expected = el.cloneNode(false); expected.removeAttribute('id');
      for (const [prop,value] of Object.entries(required)) expected.style.setProperty(prop,value,'important');
      el.parentNode.insertBefore(expected, el.nextSibling);
      const actualStyle = frame.contentWindow.getComputedStyle(el);
      const expectedStyle = frame.contentWindow.getComputedStyle(expected);
      const expand = p => p === 'padding' || p === 'margin' ? ['top','right','bottom','left'].map(s=>p+'-'+s) : p === 'border' ? ['top','right','bottom','left'].flatMap(s=>['width','style','color'].map(v=>'border-'+s+'-'+v)) : p === 'overflow' ? ['overflow-x','overflow-y'] : [p];
      return Object.keys(required).every(p => expand(p).every(k=>actualStyle.getPropertyValue(k) === expectedStyle.getPropertyValue(k)));
    } finally { frame.remove(); }
  },
  behavior(raw, index) {
    return new Promise(resolve => {
      const frame = document.createElement('iframe');
      frame.setAttribute('sandbox','allow-scripts');
      frame.style.cssText='position:absolute;left:-10000px;width:600px;height:400px;visibility:hidden';
      const token = crypto.randomUUID(); let finished = false;
      const finish = result => { if(finished)return; finished=true; clearTimeout(timer); window.removeEventListener('message',listen); frame.remove(); resolve(result); };
      const listen = e => { if(e.source === frame.contentWindow && e.data?.studioCheck === token) finish(e.data); };
      const timer = setTimeout(()=>finish({passed:false,error:'لم تكتمل تجربة الزر؛ راجعي الكود ثم حاولي مجددًا.'}),2500);
      window.addEventListener('message',listen);
      function runner(token,index) {
        const send = parent.postMessage.bind(parent); const alerts=[]; const errors=[];
        const norm=t=>String(t??'').normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/[^\p{L}\p{N}]+/gu,'').toLowerCase();
        const has=t=>norm(t).length>=2;
        window.alert = text => alerts.push(String(text));
        window.addEventListener('error',()=>errors.push('execution'));
        window.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{
          const msg=document.getElementById('msg'),title=document.getElementById('title'),box=document.getElementById('box');
          const before={msg:msg?.textContent,color:title?getComputedStyle(title).color:null,display:box?getComputedStyle(box).display:null};
          const buttons=[...document.querySelectorAll('button')];
          if(!buttons.length){send({studioCheck:token,passed:false},'*');return;}
          buttons[0].click();
          setTimeout(()=>{
            let passed=false;
            if(index===1) passed=alerts.some(t=>has(t)&&norm(t)!==norm('مرحباً بكِ'));
            if(index===2) passed=!!msg && has(msg.textContent) && norm(msg.textContent)!==norm(before.msg) && norm(msg.textContent)!==norm('مرحباً');
            if(index===3) passed=!!title && before.color!=='rgb(255, 0, 0)' && getComputedStyle(title).color==='rgb(255, 0, 0)';
            if(index===4) passed=!!box && before.display!=='none' && getComputedStyle(box).display==='none';
            send({studioCheck:token,passed:passed && !errors.length},'*');
          },80);
        },0));
      }
      const bootstrap = '('+runner.toString()+')('+JSON.stringify(token)+','+index+');';
      // Split the closing tag so this file remains safe inside the outer HTML script.
      frame.srcdoc = '<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; script-src &#39;unsafe-inline&#39;; style-src &#39;unsafe-inline&#39;;"><script>'+bootstrap+'<'+'/script>'+raw;
      document.body.append(frame);
    });
  }
};

const cssRequirements = {
 'sec-7-act-1':['h1',{color:'purple'}],
 'sec-7-act-2':['p',{'font-size':'20px','background-color':'#f5f3ff'}],
 'sec-7-act-3':['.card',{border:'2px solid #8b5cf6'}],
 'sec-7-act-4':['button',{'background-color':'#7c3aed',color:'white'}],
 'sec-8-act-1':['.box',{padding:'20px'}],
 'sec-8-act-2':['.card',{margin:'15px',border:'2px solid #f97316'}],
 'sec-8-act-3':['.box',{border:'2px solid #10b981'}],
 'sec-8-act-4':['.card',{padding:'15px',margin:'10px',border:'1px solid #c4b5fd'}],
 'sec-9-act-1':['.scroll-box',{overflow:'auto'}],
 'sec-9-act-2':['.clip-box',{overflow:'hidden'}],
 'sec-9-act-3':['.responsive-card',{width:'100%'}],
 'sec-9-act-4':['.container',{width:'100%','max-height':'100px',overflow:'auto'}]
};

function installStudioChecks() {
 const acts=Object.values(CURRICULUM_DATA.activities).flat();
 const text=(dom,s)=>[...dom.querySelectorAll(s)].some(e=>StudioText.hasContent(e.textContent));
 const list=(dom,tag,values)=>[...dom.querySelectorAll(tag)].some(el=>{const children=[...el.children];return children.length===values.length && children.every((e,i)=>e.tagName==='LI' && StudioText.hasContent(e.textContent));});
 const link=(dom,href,label)=>[...dom.querySelectorAll('a')].some(e=>e.getAttribute('href')===href && StudioText.hasContent(e.textContent));
 const extra={
 'sec-1-act-1':(d,r)=>text(d,'h1','نادي البرمجة والابتكار') && !!d.querySelector('p')?.textContent.trim(),
 'sec-1-act-2':(d,r)=>text(d,'h1','معرض المشاريع الواعدة') && text(d,'h2','مشروع استوديو الكود') && /<h1\b[^>]*>[^]*?<\/h1\s*>/i.test(r) && d.querySelectorAll('h1').length===1,
 'sec-1-act-3':d=>text(d,'h1','نادي الطبيعة')&&text(d,'h2','الورش التدريبية')&&text(d,'h3','ورشة وتصميم'),
 'sec-1-act-4':d=>text(d,'h1','مبادرة مدرستي الخضراء')&&text(d,'h2','أهدافنا')&&!!d.querySelector('p')?.textContent.trim(),
 'sec-2-act-1':d=>list(d,'ul',['البرمجة','التصميم','الذكاء الاصطناعي']),
 'sec-2-act-2':d=>list(d,'ol',['كتابة الأكواد','المعاينة','النشر']),
 'sec-2-act-3':d=>list(d,'ul',['الافتتاحية','كلمة القائدة','التكريم']) && ![...d.querySelectorAll('li')].some(e=>!e.parentElement.matches('ul,ol')),
 'sec-2-act-4':d=>list(d,'ol',['كتاب التقنية','استوديو الكود','تطبيقات عملية']),
 'sec-3-act-1':d=>link(d,'https://madrasati.sa','بوابة مدرستي'),
 'sec-3-act-2':d=>!!d.querySelector('a[href="https://saudi.sa"][target="_blank"]'),
 'sec-3-act-3':d=>link(d,'https://moe.gov.sa','وزارة التعليم'),
 'sec-3-act-4':d=>link(d,'library.html','المكتبة')&&link(d,'support.html','الدعم'),
 'sec-4-act-1':d=>[...d.querySelectorAll('img[src]')].some(e=>StudioText.hasContent(e.getAttribute('alt'))),
 'sec-4-act-2':d=>!!d.querySelector('img[src][width="200"][height="150"]'),
 'sec-4-act-3':(d,r)=>!!d.querySelector('img[src][alt]')&&!/<\/img\s*>/i.test(r),
 'sec-4-act-4':d=>[...d.querySelectorAll('img[src][width="250"]')].some(e=>StudioText.hasContent(e.getAttribute('alt'))),
 'sec-5-act-1':d=>!!d.querySelector('video[controls] > source[src]'),
 'sec-5-act-2':d=>!!d.querySelector('video[controls][autoplay][muted] > source[src]'),
 'sec-5-act-3':d=>!!d.querySelector('video > source[src="clip.webm"]'),
 'sec-5-act-4':d=>!!d.querySelector('video[controls][width="400"] > source[src="lesson.webm"]'),
 'sec-6-act-1':d=>[...d.querySelectorAll('input[type="text"]')].some(e=>StudioText.hasContent(e.getAttribute('placeholder'))),
 'sec-6-act-2':d=>{const rs=[...d.querySelectorAll('input[type="radio"]')];return rs.length===2&&rs.every(e=>e.name==='grade')&&new Set(rs.map(e=>e.value)).size===2;},
 'sec-6-act-3':d=>!!d.querySelector('label[for="user-email"]')&&!!d.querySelector('input[type="email"][id="user-email"]')&&d.querySelectorAll('[id="user-email"]').length===1,
 'sec-6-act-4':d=>[...d.querySelectorAll('form')].some(f=>f.querySelector('input[type="text"]')&&f.querySelector('button[type="submit"]')),
 'sec-11-act-1':d=>[...d.querySelectorAll('table')].some(t=>{const r=t.rows[1];return r?.cells.length===2&&[...r.cells].every(c=>StudioText.hasContent(c.textContent));}),
 'sec-11-act-2':d=>[...d.querySelectorAll('table')].some(t=>{const r=t.rows[0];return r?.cells.length===2&&[...r.cells].every(e=>e.tagName==='TH');}),
 'sec-11-act-3':(d,r)=>d.querySelectorAll('table tr').length===2&&(r.match(/<\/tr\s*>/gi)||[]).length===2,
 'sec-11-act-4':d=>[...d.querySelectorAll('table[border="1"]')].some(t=>t.rows.length===2&&t.rows[0].cells[0]?.tagName==='TH'&&StudioText.hasContent(t.rows[0].cells[0]?.textContent)&&t.rows[1].cells[0]?.tagName==='TD'&&StudioText.hasContent(t.rows[1].cells[0]?.textContent))
 };
 for(const act of acts){
   const original=act.validation;
   act.validation=async(dom,raw)=>{
     const clean=StudioChecks.source(raw);
     const parsed=new DOMParser().parseFromString(clean,'text/html');
     const result=original(parsed,clean);
     let passed=!!result.passed;
     if(cssRequirements[act.id]) passed=StudioChecks.css(clean,...cssRequirements[act.id]);
     else if(act.id.startsWith('sec-10-')) passed=(await StudioChecks.behavior(clean,Number(act.id.slice(-1)))).passed;
     else if(extra[act.id]) passed=!!extra[act.id](parsed,clean);
     let review=result.review||'راجعي العناصر والقيم والنصوص المطلوبة؛ الكود الحالي لا يحقق جميع شروط النشاط.';
     let done=result.done||'حققتِ متطلبات النشاط بنجاح.';
     if(cssRequirements[act.id]){
       const [sel,props]=cssRequirements[act.id];
       review='راجعي العنصر '+sel+' والقيم '+Object.entries(props).map(([k,v])=>k+': '+v).join('، ')+'. تأكدي أن قاعدة أخرى أو تنسيقًا داخل الوسم لا يغيّر النتيجة، وأن التنسيق ليس داخل تعليق.';
       done='طبقتِ التنسيق المطلوب على '+sel+'؛ وتطابقت القيم الفعلية للعنصر مع هدف النشاط.';
     }
     if(act.id.startsWith('sec-10-'))review='لم يحدث الأثر المطلوب عند تجربة النقر على الزر. راجعي اسم الدالة، والمعرّف المطابق للعنصر، والنص أو التنسيق المطلوب؛ وجود الكلمات وحده لا يكفي.';
     return {...result,passed,done:passed?done:'',review:passed?'':review,nextStep:passed?'اشرحي سبب نجاح الكود بجملة، ثم جرّبي تغييرًا صغيرًا ولاحظي أثره في المعاينة.':'راجعي المطلوب أعلى المحرر، وعدّلي الجزء الناقص ثم تحققي مرة أخرى.'};
   };
 }
 const get=id=>acts.find(a=>a.id===id);
 get('sec-1-act-1').title='1. أكمل: عنوان ونص للنشاط المدرسي';
 get('sec-4-act-3').goal='فهم أن img عنصر فارغ (Void Element) لا يملك وسم إغلاق في HTML.';
 get('sec-8-act-3').instructions='أضيفي نمط الحد solid ليظهر الإطار بسمك 2px ولون #10b981. غياب نمط الحد يجعل الحد غير ظاهر.';
 get('sec-10-act-2').initialCode=get('sec-10-act-2').initialCode.replace('تم التفعيل بنجاح!','مرحباً');
 get('sec-10-act-3').initialCode=get('sec-10-act-3').initialCode.replace('getElementById','getelementbyid');
 get('sec-10-act-4').title='4. ابنِ: زر إخفاء نص';
 get('sec-10-act-1').hints=["اكتبي رسالة جديدة من اختيارك داخل alert مع الحفاظ على الاقتباسات."];
 get('sec-10-act-1').instructions='غيّري رسالة التنبيه الافتراضية إلى رسالة جديدة من اختيارك، واجعليها تظهر عند النقر. الإملاء ليس معيار التقييم.';
 get('sec-10-act-2').instructions='غيّري النص الذي يظهر عند النقر إلى رسالة جديدة من اختيارك. لا تتركي رسالة البداية كما هي؛ لا يلزم نسخ نص نموذجي حرفيًا.';
 for(const a of acts.filter(a=>!cssRequirements[a.id]&&!a.id.startsWith('sec-10-'))){a.instructions+=' النصوص المذكورة أمثلة؛ يمكنكِ كتابة نصك مع الحفاظ على الوسوم والسمات المطلوبة. لا يُقيّم الإملاء.';}
 get('sec-11-act-2').instructions='استبدلي خلايا الصف الأول td بـ th لتحديد خلايا عناوين الأعمدة دلاليًا.';
 get('sec-11-act-3').title='3. نظّم: الإغلاق الصريح لصفوف الجدول';
 get('sec-11-act-3').instructions='أضيفي إغلاقًا صريحًا </tr> للصف الأول لتنظيم الكود. تسمح HTML بحذفه في هذه الحالة، لكن هدف التدريب كتابة إغلاق الصفين بوضوح.';
 get('sec-11-act-3').goal='تدريب تنظيم المصدر بإغلاق صفوف الجدول صراحةً.';
 for(const id of ['sec-9-act-1','sec-9-act-2']){
   const a=get(id);a.initialCode=a.initialCode.replace('height:','max-width: 280px;\n    height:');
   a.initialCode=a.initialCode.replace(/(<div[^>]*>)[\s\S]*?(<\/div>)/, '$1'+Array(8).fill('<p>نجرّب قراءة محتوى طويل داخل صندوق قصير لنلاحظ الفرق بين إظهار النص وقصّه وتمريره.</p>').join('')+'$2');
 }
 for(const a of acts){a.instructions+=(a.id==='sec-4-act-4'||a.id.startsWith('sec-5-'))?' ملف التدريب الافتراضي متوفر داخل المعاينة تلقائيًا.':'';}
 get('sec-11-act-2').validationWhy='تعرّف th خلية عنوان في الجدول؛ المظهر العريض مجرد تنسيق افتراضي يمكن تغييره.';
}
installStudioChecks();

// Keep preview execution in a unique opaque origin; student scripts cannot reach this app.
function prepareStudioPreview(code) {
 const d=new DOMParser().parseFromString(code,'text/html');
 d.documentElement.dir='rtl';d.documentElement.lang='ar';
 if(!d.querySelector('meta[charset]')){const m=d.createElement('meta');m.charset='UTF-8';d.head.prepend(m);}
 const base=d.createElement('style');base.textContent='body{font-family:system-ui,sans-serif;padding:16px;margin:0;color:#1e293b}';d.head.prepend(base);
 const alerts=d.createElement('script');alerts.textContent='window.alert=function(text){var p=document.createElement("p");p.setAttribute("role","alert");p.style.cssText="padding:12px;border:2px solid #7c3aed;background:#f5f3ff";p.textContent=String(text);document.body.append(p)}';d.head.prepend(alerts);
 for(const img of d.querySelectorAll('img[src="photo.jpg"]'))img.src=STUDIO_IMAGE;
 for(const s of d.querySelectorAll('source[src],video[src]'))if(/^(movie|intro|clip|lesson)\.webm$/.test(s.getAttribute('src'))){s.src=STUDIO_VIDEO;if(s.tagName==='SOURCE')s.type='video/webm';}
 return '<!doctype html>'+d.documentElement.outerHTML;
}
CodeStudioApp.prototype.runCodePreview=function(){
 const f=document.getElementById('preview-iframe');if(!f)return;
 const code=this.activeEditorInstance?.getValue()||'';const act=this.getCurrentActivity();if(act)this.state.user.savedCode[act.id]=code;
 f.setAttribute('sandbox','allow-scripts');f.srcdoc=prepareStudioPreview(code);
};
CodeStudioApp.prototype.runProjectPreview=function(){const f=document.getElementById('project-preview-iframe');if(!f)return;f.setAttribute('sandbox','allow-scripts');f.srcdoc=prepareStudioPreview(this.activeEditorInstance?.getValue()||'');};
CodeStudioApp.prototype.verifyCodeSolution=async function(actId){
 const code=this.activeEditorInstance?.getValue()||'';const act=this.getCurrentActivity();if(!act||act.id!==actId)return;
 const token=(this._validationToken||0)+1;this._validationToken=token;
 this.state.user.savedCode[actId]=code;
 const panel=document.getElementById('feedback-panel');if(panel)panel.textContent='جارٍ التحقق من الحل…';
 try{
   const result=await act.validation(new DOMParser().parseFromString(code,'text/html'),code);
   if(token!==this._validationToken||this.getCurrentActivity()?.id!==actId||this.activeEditorInstance?.getValue()!==code)return;
   if(result.passed){if(this.state.user.progress[actId]!=='assisted')this.state.user.progress[actId]='completed';this.saveStateToStorage();}
   this.renderStructuredFeedback(result);
 }catch(error){console.error('Validation failed',error);this.renderStructuredFeedback({passed:false,review:'تعذر تشغيل الفحص بسبب خطأ داخلي. احتفظنا بكودك؛ حاولي مجددًا.',why:'هذه مشكلة في أداة التحقق ولا تعني أن حلك خاطئ.',nextStep:'أعيدي التحقق، وأخبري المعلمة إذا تكرر التنبيه.'});}
};
const originalToggle=CodeStudioApp.prototype.toggleLearningMode;
CodeStudioApp.prototype.toggleLearningMode=function(mode){this.saveCurrentActivityDraftImmediate();return originalToggle.call(this,mode);};

const originalDimensions=CodeStudioApp.prototype.updateOverflowDimensions;
CodeStudioApp.prototype.updateOverflowDimensions=function(key,val){originalDimensions.call(this,key,val);const labels=['عرض الصندوق','ارتفاع الصندوق','حجم الخط'];const keys=['boxWidth','boxHeight','fontSize'];const i=keys.indexOf(key);if(i>=0){const input=document.querySelector('input[data-overflow="'+key+'"]');if(input?.previousElementSibling)input.previousElementSibling.textContent=labels[i]+': '+val+'px';}const code=document.getElementById('lab-overflow-code');if(code){const o=this.state.labState.overflow;code.textContent='.box { width: '+o.boxWidth+'px; height: '+o.boxHeight+'px; font-size: '+o.fontSize+'px; overflow: '+o.mode+'; }';}};
const originalBox=CodeStudioApp.prototype.updateBoxModelLab;
CodeStudioApp.prototype.updateBoxModelLab=function(key,val){originalBox.call(this,key,val);const el=document.getElementById('box-label-'+key);if(el)el.textContent=(key==='padding'?'الحشو الداخلي (Padding): ':'الهامش الخارجي (Margin): ')+val+'px';};

CodeStudioApp.prototype.confirmResetActivityCode=function(id){
 const act=this.getCurrentActivity();if(!act||act.id!==id)return;
 this.openModal('<h3 class="font-bold text-lg mb-3">إعادة بداية النشاط؟</h3><p class="mb-4 text-sm">سيُستبدل الكود الحالي بكود البداية. يمكنكِ إلغاء العملية للاحتفاظ بمحاولتك.</p><div class="flex gap-3"><button class="p-3 rounded bg-red-100" onclick="app.applyResetActivityCode(\''+id+'\')">إعادة الكود</button><button class="p-3 rounded bg-slate-100" onclick="app.closeModal()">إلغاء</button></div>');
};
CodeStudioApp.prototype.applyResetActivityCode=function(id){
 const act=this.getCurrentActivity();if(!act||act.id!==id)return;
 this._validationToken=(this._validationToken||0)+1;
 this.state.user.savedCode[id]=act.initialCode;
 this.activeEditorInstance?.setValue(act.initialCode);
 this.saveStateToStorage();this.closeModal();this.runCodePreview();
 const panel=document.getElementById('feedback-panel');if(panel)panel.textContent='أُعيد كود البداية. عدّلي الكود ثم تحققي من الحل.';
};
CodeStudioApp.prototype.requestProgressiveHint=function(id){
 const act=this.getCurrentActivity();if(!act||act.id!==id)return;
 this.saveCurrentActivityDraftImmediate();this._hintLevels=this._hintLevels||{};
 const hints=act.hints||[];const level=Math.min(this._hintLevels[id]||0,Math.max(0,hints.length-1));
 this._hintLevels[id]=level+1;
 this.openModal('<h3 class="font-bold text-lg mb-3">تلميح '+(level+1)+' من '+Math.max(1,hints.length)+'</h3><p class="text-sm whitespace-pre-wrap leading-relaxed mb-4" dir="rtl">'+this.escapeTextContent(hints[level]||'راجعي هدف النشاط وحددي الوسم أو الخاصية المطلوب تعديلها.')+'</p><div class="flex gap-3">'+(level+1<hints.length?'<button class="p-3 rounded bg-brand-100" onclick="app.requestProgressiveHint(\''+id+'\')">تلميح إضافي</button>':'')+'<button class="p-3 rounded bg-slate-100" onclick="app.closeModal()">العودة لمحاولتي</button></div>');
};

CodeStudioApp.prototype.installBackupControls=function(){
 const footer=document.querySelector('footer');if(!footer||document.getElementById('progress-backup-controls'))return;
 const box=document.createElement('div');box.id='progress-backup-controls';box.className='max-w-4xl mx-auto px-4 py-4 text-center text-xs space-y-3';
 box.innerHTML='<p>يُحفظ العمل محليًا في المتصفح الحالي. قد لا تستعيد معاينة Gemini المسودات بعد التحديث؛ احفظي نسخة تقدم قبل المغادرة.</p><div class="flex flex-wrap justify-center gap-3"><button class="px-4 py-2 rounded-lg bg-brand-100 text-brand-800 font-bold" onclick="app.openProgressBackup(false)">حفظ نسخة التقدم</button><button class="px-4 py-2 rounded-lg bg-slate-100 text-slate-800 font-bold" onclick="app.openProgressBackup(true)">استعادة نسخة التقدم</button></div>';
 footer.append(box);
};
CodeStudioApp.prototype.openProgressBackup=function(restore){
 this.saveCurrentActivityDraftImmediate();
 if(this.state.currentView==='project'&&this.activeEditorInstance)this.state.user.projectDrafts[this.state.activeProject]=this.activeEditorInstance.getValue();
 const content=restore?'':JSON.stringify({version:1,user:this.state.user},null,2);
 this.openModal('<h3 class="font-bold mb-3">'+(restore?'استعادة نسخة التقدم':'حفظ نسخة التقدم')+'</h3><p class="text-xs mb-3">'+(restore?'اختاري ملف التقدم أو الصقي نصه. الاستعادة تستبدل المسودات والتقدم الحاليين.':'احتفظي بهذا الملف على جهازك لاستعادة مسوداتك ومشروعاتك، حتى عند تغير رابط المعاينة.')+'</p>'+(restore?'<input type="file" accept="application/json,.json" aria-label="ملف التقدم" onchange="app.readProgressBackupFile(this)" class="mb-3 w-full">':'')+'<textarea id="progress-backup-text" aria-label="نص نسخة التقدم" dir="ltr" class="w-full h-48 border rounded p-2 text-xs" '+(restore?'':'readonly')+'>'+this.escapeTextContent(content)+'</textarea><p id="progress-backup-status" class="text-xs py-2"></p><div class="flex gap-3"><button class="p-3 bg-brand-100 rounded" onclick="app.'+(restore?'restoreProgressBackup':'downloadProgressBackup')+'()">'+(restore?'استعادة التقدم':'تنزيل ملف التقدم')+'</button><button class="p-3 bg-slate-100 rounded" onclick="app.closeModal()">إغلاق</button></div>');
};
CodeStudioApp.prototype.downloadProgressBackup=function(){const txt=document.getElementById('progress-backup-text').value;const url=URL.createObjectURL(new Blob([txt],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='code_studio_progress.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
CodeStudioApp.prototype.readProgressBackupFile=function(input){const file=input.files?.[0];if(!file)return;if(file.size>2000000){document.getElementById('progress-backup-status').textContent='الملف أكبر من الحد المسموح (2 MB).';return;}const reader=new FileReader();reader.onload=()=>{document.getElementById('progress-backup-text').value=String(reader.result);};reader.readAsText(file);};
CodeStudioApp.prototype.restoreProgressBackup=function(){
 try{
  const backup=JSON.parse(document.getElementById('progress-backup-text').value);if(backup.version!==1||!backup.user||typeof backup.user!=='object')throw Error('format');
  const input=backup.user;const ids=new Set(Object.values(CURRICULUM_DATA.activities).flat().map(a=>a.id));
  const savedCode=Object.fromEntries(Object.entries(input.savedCode||{}).filter(([k,v])=>ids.has(k)&&typeof v==='string'));
  const progress=Object.fromEntries(Object.entries(input.progress||{}).filter(([k,v])=>ids.has(k)&&['completed','assisted'].includes(v)));
  const projectDrafts=Object.fromEntries(Object.entries(input.projectDrafts||{}).filter(([k,v])=>['club','gallery','magazine'].includes(k)&&typeof v==='string'));
  this._validationToken=(this._validationToken||0)+1;
  this.state.user={...this.state.user,name:typeof input.name==='string'?input.name.slice(0,60):this.state.user.name,savedCode,progress,projectDrafts};
  this.saveStateToStorage();this.closeModal();if(this.activeEditorInstance){this.activeEditorInstance.destroy();this.activeEditorInstance=null;}this.state.currentView='home';this.render();this.showToastNotification('استُعيدت نسخة التقدم بنجاح.');
 }catch(_){document.getElementById('progress-backup-status').textContent='تعذر قراءة النسخة. اختاري ملف تقدم صحيحًا صادرًا من الاستوديو.';}
};
