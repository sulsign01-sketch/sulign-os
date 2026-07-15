/* ═══════════════════════════════════════════════════════════════
   SULSIGN OS 2.0 — MÓDULO: DIÁRIO DE OBRA (dob)
   Registro diário por OS/job: atividades, equipe, ocorrências,
   clima, link de fotos. Requer tabela diario_obra
   (SQL: ss20_novas_tabelas.sql).
   ═══════════════════════════════════════════════════════════════ */
(function(){
  var st={job:''};

  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function isTreino(x){ return (x||'').indexOf('TREINO')>=0; }
  function dstr(d){
    if(!d)return '—';
    var p=(String(d).split('T')[0]||'').split('-');
    return p.length===3?(p[2]+'/'+p[1]+'/'+p[0]):d;
  }
  function hojeISO(){
    var d=new Date();
    return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);
  }

  function fetchAll(force){
    if(SS20.cache.dob&&!force) return Promise.resolve(SS20.cache.dob);
    return Promise.all([
      SS20.sb('diario_obra?select=*&deletado_em=is.null&order=data.desc,created_at.desc'),
      SS20.sb('ordens_servico?select=num,orcamento_numero,status,disciplina&deletado_em=is.null&order=created_at.desc')
    ]).then(function(r){
      var data={
        regs:r[0].filter(function(x){return !isTreino(x.job)&&!isTreino(x.os_num);}),
        oss:r[1].filter(function(x){return !isTreino(x.num)&&!isTreino(x.orcamento_numero);})
      };
      SS20.cache.dob=data;
      return data;
    });
  }

  function render(c){
    fetchAll().then(function(d){ draw(c,d); })
    .catch(function(e){
      if(String(e.message).indexOf('404')>=0){
        c.innerHTML='<div class="placeholder-view"><h2>Diário de Obra</h2>'
          +'<p>A tabela <b>diario_obra</b> ainda não existe no Supabase.</p>'
          +'<p>Rode o arquivo <b>v2/sql/ss20_novas_tabelas.sql</b> no SQL Editor do Supabase e recarregue esta página.</p></div>';
        return;
      }
      c.innerHTML='<div class="err-view">Erro: '+esc(e.message)+'</div>';
    });
  }

  function draw(c,d){
    var jobsSet={};
    d.regs.forEach(function(r){ if(r.job)jobsSet[r.job]=1; });
    d.oss.forEach(function(o){ if(o.orcamento_numero)jobsSet[o.orcamento_numero]=1; });
    var jobs=Object.keys(jobsSet).sort().reverse();

    var filt=d.regs.filter(function(r){
      if(st.job&&r.job!==st.job&&r.os_num!==st.job)return false;
      return true;
    });
    var comOcorrencia=filt.filter(function(r){return r.ocorrencias;}).length;

    var h='<div style="padding:24px 26px">';
    h+='<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:4px">';
    h+='<h2 style="font-family:var(--font-d);font-size:19px">Diário de Obra</h2>';
    h+='<span style="flex:1"></span>';
    h+='<button type="button" id="dob-novo" style="background:var(--accent);color:#fff;border:none;font-size:12.5px;font-weight:600;padding:8px 14px;border-radius:8px;cursor:pointer">⊕ Registro de hoje</button>';
    h+='</div>';
    h+='<p style="color:var(--mut);font-size:12.5px;margin-bottom:16px">'+filt.length+' registros'
      +(comOcorrencia?' · <b style="color:var(--warn)">'+comOcorrencia+' com ocorrência</b>':'')+'</p>';

    h+='<select id="dob-job" style="padding:8px 12px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit;background:var(--panel);margin-bottom:16px">';
    h+='<option value="">Todos os jobs</option>';
    jobs.forEach(function(j){h+='<option'+(st.job===j?' selected':'')+'>'+esc(j)+'</option>';});
    h+='</select>';

    h+='<div id="dob-form"></div>';

    if(!filt.length){
      h+='<div style="color:var(--mut);font-size:13px;padding:20px 0">Nenhum registro ainda. Comece com o botão acima — o hábito do diário protege a empresa em qualquer discussão de prazo ou ocorrência com cliente.</div>';
    }
    filt.forEach(function(r){
      h+='<div style="background:var(--panel);border:1px solid '+(r.ocorrencias?'var(--warn)':'var(--line)')+';border-radius:var(--radius);padding:15px 16px;margin-bottom:10px">'
        +'<div style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;margin-bottom:6px">'
        +'<span style="font-weight:800;font-family:var(--font-d)">'+dstr(r.data)+'</span>'
        +(r.turno?'<span style="font-size:10.5px;padding:2px 8px;border-radius:10px;background:var(--paper);color:var(--ink2)">'+esc(r.turno)+'</span>':'')
        +(r.job?'<span style="font-size:11.5px;font-weight:600;color:var(--accent)">'+esc(r.job)+'</span>':'')
        +(r.os_num?'<span style="font-size:11px;color:var(--mut)">'+esc(r.os_num)+'</span>':'')
        +'<span style="flex:1"></span>'
        +(r.clima?'<span style="font-size:11px;color:var(--mut)">'+esc(r.clima)+'</span>':'')
        +'</div>'
        +'<div style="font-size:13px;line-height:1.6;margin-bottom:'+(r.ocorrencias||r.equipe||r.fotos_link?'8px':'0')+'">'+esc(r.atividades)+'</div>'
        +(r.ocorrencias?'<div style="font-size:12.5px;color:var(--warn);background:var(--warn-soft);border-radius:8px;padding:8px 10px;margin-bottom:6px">⚠ '+esc(r.ocorrencias)+'</div>':'')
        +'<div style="display:flex;gap:14px;font-size:11px;color:var(--mut);flex-wrap:wrap">'
        +(r.equipe?'<span>👷 '+esc(r.equipe)+'</span>':'')
        +(r.autor?'<span>por '+esc(r.autor)+'</span>':'')
        +(r.fotos_link?'<a href="'+esc(r.fotos_link)+'" target="_blank" style="color:var(--blue)">📷 fotos</a>':'')
        +'</div></div>';
    });
    h+='</div>';
    c.innerHTML=h;

    document.getElementById('dob-job').addEventListener('change',function(){
      st.job=this.value; draw(c,d);
    });
    document.getElementById('dob-novo').addEventListener('click',function(){form(c,d);});
  }

  function form(c,d){
    var f=document.getElementById('dob-form');
    var opsJob='<option value="">— sem job —</option>';
    var vistos={};
    d.oss.forEach(function(o){
      if(o.orcamento_numero&&!vistos[o.orcamento_numero]){
        vistos[o.orcamento_numero]=1;
        opsJob+='<option value="'+esc(o.orcamento_numero)+'">'+esc(o.orcamento_numero)+'</option>';
      }
    });
    f.innerHTML='<div style="background:var(--panel);border:2px solid var(--accent);border-radius:var(--radius);padding:18px;margin-bottom:16px">'
      +'<div style="font-size:12px;font-weight:700;margin-bottom:12px">Novo registro</div>'
      +'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px">'
      +'<div><label style="display:block;font-size:10.5px;font-weight:600;color:var(--mut);margin-bottom:3px">Data</label>'
      +'<input id="fd-data" type="date" value="'+hojeISO()+'" style="padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit"></div>'
      +'<div><label style="display:block;font-size:10.5px;font-weight:600;color:var(--mut);margin-bottom:3px">Turno</label>'
      +'<select id="fd-turno" style="padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit;background:var(--panel)"><option>Manhã</option><option>Tarde</option><option>Noite</option><option>Madrugada</option><option>Dia inteiro</option></select></div>'
      +'<div style="flex:1;min-width:160px"><label style="display:block;font-size:10.5px;font-weight:600;color:var(--mut);margin-bottom:3px">Job</label>'
      +'<select id="fd-job" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit;background:var(--panel)">'+opsJob+'</select></div>'
      +'<div style="min-width:130px"><label style="display:block;font-size:10.5px;font-weight:600;color:var(--mut);margin-bottom:3px">Clima (externo)</label>'
      +'<input id="fd-clima" type="text" placeholder="Sol, chuva…" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit"></div>'
      +'</div>'
      +'<label style="display:block;font-size:10.5px;font-weight:600;color:var(--mut);margin-bottom:3px">Atividades realizadas *</label>'
      +'<textarea id="fd-atv" rows="3" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit;margin-bottom:10px"></textarea>'
      +'<label style="display:block;font-size:10.5px;font-weight:600;color:var(--mut);margin-bottom:3px">Ocorrências / pendências</label>'
      +'<textarea id="fd-oco" rows="2" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit;margin-bottom:10px"></textarea>'
      +'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">'
      +'<div style="flex:1;min-width:160px"><label style="display:block;font-size:10.5px;font-weight:600;color:var(--mut);margin-bottom:3px">Equipe</label>'
      +'<input id="fd-eq" type="text" placeholder="Everson, Fernando…" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit"></div>'
      +'<div style="flex:1;min-width:160px"><label style="display:block;font-size:10.5px;font-weight:600;color:var(--mut);margin-bottom:3px">Link fotos (Drive)</label>'
      +'<input id="fd-fotos" type="text" placeholder="https://drive.google.com/…" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit"></div>'
      +'<div style="min-width:130px"><label style="display:block;font-size:10.5px;font-weight:600;color:var(--mut);margin-bottom:3px">Registrado por</label>'
      +'<input id="fd-autor" type="text" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit"></div>'
      +'</div>'
      +'<div style="display:flex;gap:8px"><button type="button" id="fd-salvar" style="background:var(--accent);color:#fff;border:none;font-size:12.5px;font-weight:600;padding:9px 16px;border-radius:8px;cursor:pointer">💾 Salvar registro</button>'
      +'<button type="button" id="fd-cancel" style="background:var(--paper);border:1px solid var(--line);font-size:12.5px;padding:9px 16px;border-radius:8px;cursor:pointer">Cancelar</button></div>'
      +'<div id="fd-msg" style="font-size:11.5px;margin-top:8px"></div></div>';
    try{f.scrollIntoView({behavior:'smooth',block:'nearest'});}catch(e){}

    document.getElementById('fd-cancel').addEventListener('click',function(){f.innerHTML='';});
    document.getElementById('fd-salvar').addEventListener('click',function(){
      var atv=document.getElementById('fd-atv').value.trim();
      if(!atv){
        var m=document.getElementById('fd-msg');
        m.textContent='Descreva as atividades.'; m.style.color='var(--danger)';
        return;
      }
      SS20.sbw('diario_obra','POST',{
        data:document.getElementById('fd-data').value||null,
        turno:document.getElementById('fd-turno').value,
        job:document.getElementById('fd-job').value||null,
        clima:document.getElementById('fd-clima').value.trim()||null,
        atividades:atv,
        ocorrencias:document.getElementById('fd-oco').value.trim()||null,
        equipe:document.getElementById('fd-eq').value.trim()||null,
        fotos_link:document.getElementById('fd-fotos').value.trim()||null,
        autor:document.getElementById('fd-autor').value.trim()||null
      }).then(function(){
        return fetchAll(true);
      }).then(function(d2){draw(c,d2);})
      .catch(function(e){
        var m=document.getElementById('fd-msg');
        m.textContent='Erro ao salvar: '+e.message; m.style.color='var(--danger)';
      });
    });
  }

  SS20.modules.dob={render:render};
})();
