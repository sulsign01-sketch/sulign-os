/* ═══════════════════════════════════════════════════════════════
   SULSIGN OS 2.0 — MÓDULO: PRODUÇÃO / OS (prod)
   Lista real de ordens de serviço: status, disciplina, prazos,
   realizado (fechado dedup por fornecedor, regra do Painel v1)
   vs verba target. Gestão completa segue no OS Manager v1.
   ═══════════════════════════════════════════════════════════════ */
(function(){
  var fmt=SulSignCore.fmt;

  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function isTreino(x){ return (x||'').indexOf('TREINO')>=0; }
  function dstr(d){
    if(!d)return '—';
    var p=(d.split('T')[0]||'').split('-');
    return p.length===3?(p[2]+'/'+p[1]+'/'+p[0]):d;
  }

  /* regra oficial: realizado = max(fechado OS, lançado) por fornecedor */
  function calcRealizado(os, lancDaOs){
    var porForn={}, target=0;
    function ent(f){f=f||'(sem fornecedor)';if(!porForn[f])porForn[f]={os:0,lanc:0};return porForn[f];}
    (os.itens||[]).forEach(function(it){
      target+=parseFloat(it.target)||0;
      var fc=parseFloat(it.fechado)||0;
      if(fc)ent(it.fornecedor).os+=fc;
    });
    (lancDaOs||[]).forEach(function(l){
      var v=parseFloat(l.valor)||0;
      if(v)ent(l.fornecedor).lanc+=v;
    });
    var tot=0;
    Object.keys(porForn).forEach(function(f){tot+=Math.max(porForn[f].os,porForn[f].lanc);});
    return {realizado:tot,target:target};
  }

  function fetchAll(){
    if(SS20.cache.prod) return Promise.resolve(SS20.cache.prod);
    return Promise.all([
      SS20.sb('ordens_servico?select=*&deletado_em=is.null&order=created_at.desc'),
      SS20.sb('orcamentos?select=numero,cliente,projeto,status&order=numero.desc'),
      SS20.sb('lancamentos?select=valor,fornecedor,orcamento_numero&deletado_em=is.null')
    ]).then(function(r){
      var data={
        oss:r[0].filter(function(o){return !isTreino(o.num)&&!isTreino(o.orcamento_numero);}),
        orcs:{},
        lanc:r[2].filter(function(l){return !isTreino(l.orcamento_numero);})
      };
      r[1].forEach(function(o){data.orcs[o.numero]=o;});
      SS20.cache.prod=data;
      return data;
    });
  }

  function render(c){
    fetchAll().then(function(d){ draw(c,d); })
    .catch(function(e){
      c.innerHTML='<div class="err-view">Erro ao carregar OS: '+esc(e.message)+'</div>';
    });
  }

  function draw(c,d){
    var hoje=new Date(); hoje.setHours(0,0,0,0);

    /* indexar lançamentos por OS (os_num se existir; senão por job=orcamento) */
    var lancPorOs={};
    d.lanc.forEach(function(l){
      var k=l.orcamento_numero;
      if(!k)return;
      if(!lancPorOs[k])lancPorOs[k]=[];
      lancPorOs[k].push(l);
    });

    var abertas=0,atrasadas=0,totTarget=0,totReal=0;
    var rows=d.oss.map(function(os){
      var orc=d.orcs[os.orcamento_numero]||{};
      var r=calcRealizado(os, lancPorOs[os.num]||lancPorOs[os.orcamento_numero]||[]);
      totTarget+=r.target; totReal+=r.realizado;
      var status=os.status||'—';
      var fechada=/entreg|conclu|finaliz|fechad/i.test(status);
      if(!fechada)abertas++;
      var prazo=os.data_entrega_prometida||os.prazo||null;
      var late=false;
      if(!fechada&&prazo){
        var dt=new Date((prazo.split('T')[0])+'T00:00:00');
        if(dt<hoje){late=true;atrasadas++;}
      }
      return {os:os,orc:orc,r:r,late:late,fechada:fechada,prazo:prazo};
    });

    var h='<div style="padding:24px 26px">';
    h+='<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:4px">';
    h+='<h2 style="font-family:var(--font-d);font-size:19px">Produção / OS</h2>';
    h+='<span style="flex:1"></span>';
    h+='<a href="../SulSign_OS_Manager.html" target="_blank" style="background:var(--accent);color:#fff;text-decoration:none;font-size:12.5px;font-weight:600;padding:8px 14px;border-radius:8px">⚒ Gerenciar no OS Manager</a>';
    h+='</div>';
    h+='<p style="color:var(--mut);font-size:12.5px;margin-bottom:18px">Realizado = maior entre valor fechado na OS e lançamento pago, por fornecedor (regra oficial)</p>';

    h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:20px">';
    h+=kpi('OS no sistema',d.oss.length,'','var(--ink)');
    h+=kpi('Abertas',abertas,atrasadas?('⚠ '+atrasadas+' atrasadas'):'nenhuma atrasada',atrasadas?'var(--danger)':'var(--ok)');
    h+=kpi('Verba (target)',fmt(totTarget),'','var(--blue)');
    h+=kpi('Realizado',fmt(totReal),totTarget?Math.round(totReal/totTarget*100)+'% da verba':'',totReal<=totTarget?'var(--ok)':'var(--danger)');
    h+='</div>';

    h+='<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);overflow:auto">';
    h+='<table style="width:100%;border-collapse:collapse;font-size:12.5px;min-width:720px"><thead><tr>';
    ['OS','Job / Cliente','Disciplina','Status','Entrega','Verba','Realizado','%'].forEach(function(x,i){
      h+='<th style="text-align:'+(i>=5?'right':'left')+';padding:10px 12px;font-size:10px;letter-spacing:.6px;text-transform:uppercase;color:var(--mut);border-bottom:1px solid var(--line);white-space:nowrap">'+x+'</th>';
    });
    h+='</tr></thead><tbody>';
    if(!rows.length)h+='<tr><td colspan="8" style="padding:24px;text-align:center;color:var(--mut)">Nenhuma OS.</td></tr>';
    rows.forEach(function(x){
      var pctV=x.r.target?Math.round(x.r.realizado/x.r.target*100):0;
      var pctCor=pctV<=85?'var(--ok)':(pctV<=100?'var(--warn)':'var(--danger)');
      h+='<tr>'
        +'<td style="padding:9px 12px;border-bottom:1px solid var(--line);font-weight:600;white-space:nowrap">'+esc(x.os.num)+'</td>'
        +'<td style="padding:9px 12px;border-bottom:1px solid var(--line)"><span style="font-weight:600">'+esc(x.os.orcamento_numero||'—')+'</span>'
          +(x.orc.cliente?' <span style="color:var(--mut);font-size:11px">· '+esc(x.orc.cliente)+'</span>':'')+'</td>'
        +'<td style="padding:9px 12px;border-bottom:1px solid var(--line)">'+esc(x.os.disciplina||'—')+'</td>'
        +'<td style="padding:9px 12px;border-bottom:1px solid var(--line);white-space:nowrap">'+esc(x.os.status||'—')+'</td>'
        +'<td style="padding:9px 12px;border-bottom:1px solid var(--line);white-space:nowrap;'+(x.late?'color:var(--danger);font-weight:700':'')+'">'+dstr(x.prazo)+(x.late?' ⚠':'')+'</td>'
        +'<td style="padding:9px 12px;border-bottom:1px solid var(--line);text-align:right;color:var(--mut)">'+fmt(x.r.target)+'</td>'
        +'<td style="padding:9px 12px;border-bottom:1px solid var(--line);text-align:right;font-weight:700">'+fmt(x.r.realizado)+'</td>'
        +'<td style="padding:9px 12px;border-bottom:1px solid var(--line);text-align:right;font-weight:700;color:'+pctCor+'">'+(x.r.target?pctV+'%':'—')+'</td>'
        +'</tr>';
    });
    h+='</tbody></table></div></div>';
    c.innerHTML=h;
  }

  function kpi(lbl,val,sub,cor){
    return '<div style="background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:16px 18px">'
      +'<div style="font-size:10.5px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--mut)">'+lbl+'</div>'
      +'<div style="font-family:var(--font-d);font-size:21px;font-weight:800;margin:6px 0 3px;color:'+cor+'">'+val+'</div>'
      +'<div style="font-size:11.5px;color:var(--mut)">'+(sub||'&nbsp;')+'</div></div>';
  }

  SS20.modules.prod={render:render};
})();
