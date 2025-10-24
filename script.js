// Simple helper: lower/trim and remove punctuation for matching
function norm(s){
  return (s||"")
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g,"")
    .replace(/\s+/g," ")
    .trim();
}

// Load lesson data, then render
(async function init(){
  const data = await fetch('assets/data/lesson.json').then(r=>r.json());

  // --- Transcript
  const transcriptEl = document.getElementById('transcript');
  transcriptEl.textContent = data.transcript.join('\n');

  // --- Audio speed and resume
  const audio = document.getElementById('player');
  const speed = document.getElementById('speed');
  const resumeBtn = document.getElementById('resumeBtn');

  speed.addEventListener('change', ()=>{ audio.playbackRate = Number(speed.value); });

  // Save progress
  const KEY_TIME = 'ps-ae-time';
  const KEY_DONE = 'ps-ae-done';
  const KEY_QA  = 'ps-ae-qa';

  // Restore time
  const last = Number(localStorage.getItem(KEY_TIME) || 0);
  if (last > 1) {
    resumeBtn.hidden = false;
    resumeBtn.onclick = () => { audio.currentTime = last; resumeBtn.hidden = true; };
  }
  audio.addEventListener('timeupdate', ()=>{
    localStorage.setItem(KEY_TIME, String(audio.currentTime));
    updateCompletion();
  });

  // --- Comprehension
  const form = document.getElementById('qaForm');
  form.innerHTML = '';
  const savedQA = JSON.parse(localStorage.getItem(KEY_QA) || '{}');

  data.questions.forEach((q, idx)=>{
    const wrap = document.createElement('div');
    wrap.className = 'qa-item';

    const label = document.createElement('label');
    label.textContent = `${idx+1}. ${q}`;

    const input = document.createElement('input');
    input.type = 'text';
    input.name = `q${idx}`;
    input.value = savedQA[`q${idx}`] || '';

    const feedback = document.createElement('div');
    feedback.className = 'feedback';
    feedback.id = `fb${idx}`;

    input.addEventListener('input', ()=>{
      savedQA[`q${idx}`] = input.value;
      localStorage.setItem(KEY_QA, JSON.stringify(savedQA));
    });

    wrap.appendChild(label);
    wrap.appendChild(input);
    wrap.appendChild(feedback);
    form.appendChild(wrap);
  });

  const checkBtn = document.getElementById('checkBtn');
  const resetBtn = document.getElementById('resetBtn');
  const scoreEl  = document.getElementById('score');

  checkBtn.addEventListener('click', (e)=>{
    e.preventDefault();
    let correct = 0;
    const total = data.questions.length;

    data.answerKey.forEach((ans, idx)=>{
      const user = norm(form.elements[`q${idx}`].value);
      const gold = norm(ans);

      const fb = document.getElementById(`fb${idx}`);
      if (!user){
        fb.textContent = 'No answer yet.'; fb.className = 'feedback wrong';
        return;
      }
      // Simple contains matching for leniency
      if (user.includes(gold) || gold.includes(user)) {
        fb.textContent = 'Correct'; fb.className = 'feedback correct';
        correct++;
      } else {
        // allow a few key synonym hints
        const synonyms = {
          'cleared within 48 hours':'48 hours',
          'stopped the medication':'stopped medication',
          'mild skin rash':'skin rash'
        };
        let ok = false;
        for (const k in synonyms){
          if (gold.includes(k) && user.includes(synonyms[k])) ok = true;
        }
        if (ok){ fb.textContent = 'Partially correct'; fb.className = 'feedback partial'; correct += 0.5; }
        else { fb.textContent = 'Try again'; fb.className = 'feedback wrong'; }
      }
    });

    scoreEl.textContent = `Score: ${correct} / ${data.questions.length}`;
    updateCompletion();
  });

  resetBtn.addEventListener('click', (e)=>{
    e.preventDefault();
    localStorage.removeItem(KEY_QA);
    Array.from(form.elements).forEach(el=>{ if(el.tagName==='INPUT') el.value=''; });
    document.querySelectorAll('.feedback').forEach(fb=>{ fb.textContent=''; fb.className='feedback'; });
    scoreEl.textContent = '';
    updateCompletion();
  });

  // --- Vocabulary
  const table = document.getElementById('vocabTable');
  const header = document.createElement('div');
  header.className = 'row header';
  header.innerHTML = `
    <div class="cell">Term</div>
    <div class="cell">Meaning</div>
    <div class="cell">Example</div>
  `;
  table.appendChild(header);
  data.vocabulary.forEach(v=>{
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <div class="cell"><strong>${v.term}</strong></div>
      <div class="cell">${v.meaning}</div>
      <div class="cell">${v.example}</div>
    `;
    table.appendChild(row);
  });

  document.getElementById('downloadVocab').addEventListener('click',(e)=>{
    e.preventDefault();
    const csv = [
      ['Term','Meaning','Example'],
      ...data.vocabulary.map(v=>[v.term,v.meaning,v.example])
    ].map(r=>r.map(x=>`"${(x||'').replace(/"/g,'""')}"`).join(',')).join('\n');

    const blob = new Blob([csv],{type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'vocabulary.csv';
    a.click();
    URL.revokeObjectURL(url);
  });

  // --- Roleplay tabs
  const tabs = document.querySelectorAll('.tab');
  const rp = document.getElementById('roleplayContent');
  function setTab(name){
    tabs.forEach(t=>t.classList.toggle('active', t.dataset.tab===name));
    rp.textContent = data.roleplay[name] || '';
  }
  tabs.forEach(t=>t.addEventListener('click',()=>setTab(t.dataset.tab)));
  setTab('rep');

  // --- Simple recorder (if available)
  const recordBtn = document.getElementById('recordBtn');
  const downloadLink = document.getElementById('downloadLink');
  let media, chunks = [], recording = false;

  recordBtn.addEventListener('click', async ()=>{
    if (!navigator.mediaDevices?.getUserMedia) {
      alert('Recording not supported in this browser.');
      return;
    }
    if (!recording){
      try{
        const stream = await navigator.mediaDevices.getUserMedia({audio:true});
        media = new MediaRecorder(stream);
        chunks = [];
        media.ondataavailable = e=>{ if(e.data.size>0) chunks.push(e.data); };
        media.onstop = ()=>{
          const blob = new Blob(chunks, {type:'audio/webm'});
          const url = URL.createObjectURL(blob);
          downloadLink.href = url;
          downloadLink.hidden = false;
        };
        media.start();
        recording = true;
        recordBtn.textContent = 'Stop recording';
      }catch(err){
        alert('Mic permission denied.');
      }
    } else {
      media.stop();
      recording = false;
      recordBtn.textContent = 'Record practice (browser)';
    }
  });

  // --- Completion logic
  const completeBtn = document.getElementById('completeBtn');
  const completeState = document.getElementById('completeState');

  function updateCompletion(){
    const listenedEnough = (audio.currentTime || 0) >= Math.min( (audio.duration||60) * 0.8, 30 ); // 80% or 30s min
    const hasAnyScore = document.getElementById('score').textContent.trim().length > 0;
    const vocabLoaded = !!data.vocabulary?.length;
    const ready = listenedEnough && hasAnyScore && vocabLoaded;
    completeBtn.disabled = !ready;
  }

  completeBtn.addEventListener('click', ()=>{
    const stamp = new Date().toLocaleString();
    localStorage.setItem(KEY_DONE, stamp);
    completeState.textContent = `Completed on ${stamp}`;
    completeBtn.disabled = true;
  });

  const doneAt = localStorage.getItem(KEY_DONE);
  if (doneAt){
    completeState.textContent = `Completed on ${doneAt}`;
    completeBtn.disabled = true;
  } else {
    updateCompletion();
  }
})();
