/* ═══════════════════════════════════════════════════════════════
   SULSIGN CORE — Fonte única da verdade
   Cálculo financeiro, status, categorias e config Supabase.
   Toda página deve importar este arquivo:
   <script src="sulsign_core.js"></script>
   Regra: NENHUM módulo redefine estas funções localmente.
   ═══════════════════════════════════════════════════════════════ */
var SulSignCore = (function(){

  // ── CONFIG ──
  var SUPA_URL = 'https://obeamqkcuytctfczhook.supabase.co';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9iZWFtcWtjdXl0Y3RmY3pob29rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMDIxOTQsImV4cCI6MjA4ODU3ODE5NH0.zk88W0HUIYkp8toTsJIXFHf6IGPRPs4hKz8kT3I5QVY';

  // ── PIPELINE OFICIAL DE STATUS ──
  var STATUS_PIPELINE = [
    'Em Orçamento',
    'Proposta Enviada',
    'Aprovado',
    'Em Produção',
    'Entregue',
    'Faturado',
    'Pago',
    // terminais de negócio perdido (mantêm modal de recusa e auto-vencimento):
    'Orçamento Recusado',
    'Orçamento Vencido',
    'Cancelado'
  ];

  /* ── CATEGORIAS OFICIAIS DE LANÇAMENTO ──
     Organizadas em BLOCOS. A ordem dos blocos e a ordem de leitura de um DRE
     (receita > custo > pessoal > tributo > despesa fixa > capital); dentro de
     cada bloco, ordem alfabetica. CATEGORIAS e DERIVADA daqui — nao existe
     lista plana mantida a mao, entao e impossivel o dropdown agrupado e a
     lista de validacao divergirem.
     Jul/2026: ampliado de 27 para 41 categorias. 'Aporte' passou a existir de
     fato (antes so tinha SUBCATS, e a opcao aparecia unicamente nas linhas ja
     salvas com ela, via o unshift do valor atual no catSel). */
  var BLOCOS = [
    { nome:'Receita', cats:[
      'Receita de Job','Receita Não Operacional','Rendimento de Aplicação'] },
    { nome:'Custo de Job', cats:[
      'Alimentação','Comissão','Comunicação Visual','Insumo','Locação',
      'Locação Equipamentos','Logística','Mão de Obra','Material','Mobilidade',
      'Taxas e Licenças','Verba Produção'] },
    { nome:'Custo PDVEX', cats:[
      'Locação Equipamentos PDVEX','Locação PDVEX','Mão de Obra PDVEX','Material PDVEX'] },
    { nome:'Pessoal', cats:[
      'Folha de Pagamento','Pró-Labore','Segurança do Trabalho'] },
    { nome:'Tributos e Encargos', cats:[
      'Encargos Trabalhistas','Imposto'] },
    { nome:'Despesa Fixa / Administrativa', cats:[
      'Despesa Financeira','Frota','Manutenção','Marketing','Ocupação','Serviços'] },
    { nome:'Capital e Sócios', cats:[
      'Aporte','Aquisição de Ativo','Distribuição de Lucros','Dívida Anterior','Mútuo de Sócio'] },
    { nome:'Fluxo Particular (Pondé)', cats:[
      'Receita Particular (Pondé)','Repasse Particular (Pondé)',
      'Reserva Imposto Particular','Retirada Particular (Pondé)'] },
    { nome:'Movimento Interno', cats:[
      'Aplicação Financeira','Estorno','Outros','Resgate de Aplicação'] }
  ];

  var CATEGORIAS = (function(){
    var a=[],i,j;
    for(i=0;i<BLOCOS.length;i++){
      for(j=0;j<BLOCOS[i].cats.length;j++) a.push(BLOCOS[i].cats[j]);
    }
    return a;
  })();

  // ── CATEGORIAS DE CUSTO ORIGINADO NA PDVEX ──
  // Lista branca explicita. NAO usar match por substring ('PDVEX' no nome):
  // um espaco a mais ou grafia diferente quebraria a conciliacao em silencio.
  var CATEGORIAS_PDVEX = ['Locação PDVEX','Locação Equipamentos PDVEX','Mão de Obra PDVEX','Material PDVEX'];

  // Categorias novas, para as telas que montam dropdown proprio.
  var CATEGORIAS_LOCACAO = ['Locação','Locação Equipamentos','Locação PDVEX','Locação Equipamentos PDVEX','Mão de Obra PDVEX','Material PDVEX'];

  // Tudo que precisa ser injetado nos dropdowns antigos que tem lista propria.
  // Mobilidade = transporte de PESSOA (Uber, 99, taxi). Logística = transporte
  // de MATERIAL. Virou categoria, e nao subcategoria, por uma limitacao que
  // NAO existe mais: contas_pagar tem a coluna subcategoria e a baixa passou a
  // copia-la (Jul/2026). Mantido como categoria para nao quebrar o historico,
  // mas a restricao que motivou a decisao ja caiu.
  var CATEGORIAS_EXTRAS = CATEGORIAS_LOCACAO.concat(['Mobilidade']);


  /* ═══ SUBCATEGORIAS: dominio controlado por categoria ═══
     Fonte unica. Antes vivia chumbado dentro de Lancamentos.html; a v2 nao
     tinha lista nenhuma e aceitava texto livre, o que gerava "logistica",
     "Logística" e "Logistica " como coisas diferentes. */
  var SUBCATS = {
    'Material':['Madeira','Metalon','Impressao','Acrilico','Tintas','Ferragens','Eletrica','Consumivel'],
    'Insumo':['Madeira','Metalon','Impressao','Acrilico','Tintas','Ferragens','Eletrica','Consumivel'],
    'Mão de Obra':['Carpintaria','Serralheria','Montagem','Pintura','Marcenaria','Ajudante','Eletrica'],
    'Serviços':['Contabilidade','Juridico','TI','Consultoria','Manutencao','Terceirizado'],
    'Logística':['Frete','Combustivel','Estacionamento','Pedagio'],
    'Mobilidade':['Uber','99','Taxi','Onibus/Metro','Passagem','Combustivel'],
    'Aplicação Financeira':['CDB','LCI/LCA','Tesouro Direto','Fundo','Poupanca'],
    'Resgate de Aplicação':['CDB','LCI/LCA','Tesouro Direto','Fundo','Poupanca'],
    'Rendimento de Aplicação':['CDB','LCI/LCA','Tesouro Direto','Fundo','Poupanca'],
    'Locação':['Equipamento','Estrutura','Veiculo','Espaco','Mobiliario'],
    'Locação Equipamentos':['Trelica','Praticavel','Som e Luz','Ferramenta','Maquinario','Gerador'],
    'Locação PDVEX':['Equipamento','Estrutura','Veiculo','Espaco','Mobiliario'],
    'Locação Equipamentos PDVEX':['Trelica','Praticavel','Som e Luz','Ferramenta','Maquinario','Gerador'],
    'Mão de Obra PDVEX':['Carpintaria','Serralheria','Montagem','Pintura','Marcenaria','Ajudante','Eletrica'],
    'Material PDVEX':['Madeira','Metalon','Impressao','Acrilico','Tintas','Ferragens','Eletrica','Consumivel'],
    'Alimentação':['Equipe','Cliente'],
    /* Imposto = SOBRE FATURAMENTO, do periodo corrente. INSS/FGTS/IRRF sairam
       daqui (Jul/2026) e viraram 'Encargos Trabalhistas': encargo de folha e
       custo de pessoal, nao carga tributaria sobre venda — misturar os dois
       fazia a aliquota efetiva da empresa parecer maior do que e.
       Lancamentos antigos com subcategoria 'INSS'/'FGTS'/'IRRF' continuam
       legiveis: o subSel preserva valor fora do dominio como '(fora da lista)'. */
    'Imposto':['Simples Nacional','ISS','IRPJ/CSLL','PIS/COFINS','Outros'],
    'Encargos Trabalhistas':['INSS','FGTS','IRRF Folha','Contribuicao Sindical','Encargo Rescisorio'],
    'Folha de Pagamento':['Salario','Adiantamento/Vale','13o Salario','Ferias','Rescisao','Hora Extra','Vale Transporte','Vale Refeicao','Bonus/PLR','Estagio'],
    'Pró-Labore':['Socio Carlos','Socio Ponde','Socio Jovita','Socio Dudu'],
    'Segurança do Trabalho':['EPI','ASO/Exames','PCMSO/PGR','Treinamento NR'],
    'Ocupação':['Aluguel','Condominio','IPTU','Energia','Agua','Internet/Telefone','Seguranca/Alarme','Limpeza'],
    'Manutenção':['Predial','Maquinas','Ferramentas','TI'],
    'Marketing':['Anuncios','Site/Dominio','Brindes','Feiras','Representacao'],
    'Frota':['Combustivel','Manutencao','IPVA/Licenciamento','Multas','Seguro','Pedagio'],
    'Despesa Financeira':['Tarifa Bancaria','Juros','IOF','Taxa Maquininha','Antecipacao','Multa/Mora'],
    'Taxas e Licenças':['ART/RRT','Credenciamento','Taxa de Shopping','Alvara','Bombeiro','Seguro de Obra'],
    'Receita Não Operacional':['Venda de Ativo','Sucata','Indenizacao/Seguro','Bonificacao','Reembolso Recebido'],
    'Aquisição de Ativo':['Maquinas e Equipamentos','Ferramentas','Veiculos','Informatica','Moveis e Instalacoes','Benfeitorias','Software/Licencas'],
    'Dívida Anterior':['Parcelamento Federal','Parcelamento Municipal','Parcelamento Estadual','INSS/FGTS Atrasado','Acordo Trabalhista','Acordo Fornecedor','Juros e Multa'],
    'Distribuição de Lucros':['Socio Carlos','Socio Ponde','Socio Jovita','Socio Dudu'],
    'Mútuo de Sócio':['Emprestimo Recebido','Devolucao'],
    'Comissão':['Vendedor','Agencia','BV'],
    'Comunicação Visual':['Impressao','Recorte','Instalacao'],
    'Verba Produção':['Adiantamento','Prestacao de Contas'],
    'Receita de Job':['Sinal','Saldo','Parcela','Integral'],
    'Aporte':['Socio Dudu','Socio Carlos','Socio Ponde','Socio Jovita'],
    'Estorno':['Devolucao Fornecedor','Ajuste Bancario','Reembolso']
  };

  function subcategoriasDe(categoria){
    var k = String(categoria==null?'':categoria).trim();
    return (SUBCATS[k] || []).slice();
  }

  function ehPDVEX(categoria){
    return CATEGORIAS_PDVEX.indexOf(String(categoria==null?'':categoria).trim()) >= 0;
  }

  // ── FLUXO PARTICULAR DO PONDE (nao e SulSign) ──
  // O Ponde usa a conta da empresa (C6) para trabalhos pessoais: entra receita
  // de clientes dele, ele saca parte para o sustento e reserva parte para o
  // imposto dessas notas particulares. Esses lancamentos NAO podem contaminar
  // o caixa nem os KPIs da SulSign — mesma logica do job de treino, que ja e
  // excluido de todos os agregados por nome.
  // Lista branca explicita, sem match por substring.
  var CATEGORIAS_PARTICULAR = ['Receita Particular (Pondé)','Retirada Particular (Pondé)','Reserva Imposto Particular','Repasse Particular (Pondé)'];
  CATEGORIAS_EXTRAS = CATEGORIAS_EXTRAS.concat(CATEGORIAS_PARTICULAR);

  function ehParticular(categoria){
    return CATEGORIAS_PARTICULAR.indexOf(String(categoria==null?'':categoria).trim()) >= 0;
  }

  // ── TRANSFERENCIA ENTRE CONTAS DA PROPRIA EMPRESA ──
  // Aplicar em CDB nao e despesa e resgatar nao e receita: o dinheiro continua
  // sendo da SulSign, so mudou de lugar. Mas SAI da conta corrente de fato, e o
  // Fluxo de Caixa espelha o extrato — entao o lancamento precisa existir, senao
  // o saldo do sistema nunca bate com o banco.
  // 'Rendimento de Aplicacao' NAO entra aqui de proposito: o juro do CDB e
  // receita financeira de verdade e deve somar como ganho.
  var CATEGORIAS_TRANSFER = ['Aplicação Financeira','Resgate de Aplicação'];
  CATEGORIAS_EXTRAS = CATEGORIAS_EXTRAS.concat(CATEGORIAS_TRANSFER).concat(['Rendimento de Aplicação']);

  function ehTransferencia(categoria){
    return CATEGORIAS_TRANSFER.indexOf(String(categoria==null?'':categoria).trim()) >= 0;
  }

  /* ── MOVIMENTO DE CAPITAL / PATRIMONIO (nao e resultado) ──
     Sai ou entra na conta de verdade — entao PRECISA existir em lancamentos e
     PRECISA aparecer no Fluxo de Caixa. Mas nao e receita nem despesa e nao
     pode entrar em nenhum calculo de margem, DRE ou custo de job:

       Aporte               entrada de capital do socio, nao e venda
       Mútuo de Sócio       emprestimo do socio, entra e depois volta
       Dívida Anterior      parcelamento de passivo herdado, anterior a esta
                            gestao. Nao e imposto do periodo: jogar isso em
                            'Imposto' destruiria a margem de 2026 com divida
                            de outra era e inflaria a carga tributaria aparente
       Aquisição de Ativo   troca de caixa por patrimonio (CAPEX), vira
                            imobilizado e depois depreciacao — nao despesa
       Distribuição de Lucros  saida de resultado ja apurado, nao custo

     O par Aporte -> Dívida Anterior fecha em zero no resultado: capital sobe,
     divida cai, exercicio nao e afetado. Que e exatamente o que aconteceu. */
  var CATEGORIAS_CAPITAL = ['Aporte','Aquisição de Ativo','Distribuição de Lucros','Dívida Anterior','Mútuo de Sócio'];

  function ehCapital(categoria){
    return CATEGORIAS_CAPITAL.indexOf(String(categoria==null?'':categoria).trim()) >= 0;
  }

  /* Atalho para os agregados: tudo que sai do resultado operacional.
     Use nos KPIs (Dashboard, Painel Financeiro, CEO Dashboard) — NUNCA no
     Fluxo de Caixa, que espelha o extrato e tem que bater com o banco. */
  function foraDoResultado(categoria){
    return ehCapital(categoria) || ehParticular(categoria) || ehTransferencia(categoria);
  }

  // ── CÁLCULO OFICIAL DO ORÇAMENTO ──
  // Replica exatamente o calcAll() do ORC_Manager:
  //   fator = (1+AC+DF+RI)/(1-L-I)
  //   por linha: venda = custo*fator; imposto = venda*IR; total = venda+imposto
  //   grupos com opcional=true NÃO entram no total geral
  //   vendaLiquida = totalGrupos * (1 - desconto%)
  //   totalGeral   = vendaLiquida + vendaLiquida * opPct%
  function calcOrcamento(orc){
    var bdi = orc.bdi || {};
    var ac = (parseFloat(bdi.ac)||0)/100,
        df = (parseFloat(bdi.df)||0)/100,
        ri = (parseFloat(bdi.ri)||0)/100,
        l  = (parseFloat(bdi.lc)||0)/100,
        im = (parseFloat(bdi.im)||0)/100,
        ir = (parseFloat(bdi.ir)||0)/100,
        dp = (parseFloat(bdi['desc-pct'])||0)/100,
        op = (parseFloat(bdi['op-pct'])||0)/100;
    var fator = (1+ac+df+ri)/(1-l-im);
    var custoTotal=0, vendaBruta=0, custoOpc=0, vendaOpc=0;
    (orc.grupos||[]).forEach(function(g){
      var isOpc = !!g.opcional;
      (g.linhas||[]).forEach(function(ln){
        var q = parseFloat(ln.qtd)||0, u = parseFloat(ln.unit)||0;
        var custo = q*u;
        var venda = custo*fator;
        var tot = venda + venda*ir;
        if(isOpc){ custoOpc+=custo; vendaOpc+=tot; }
        else     { custoTotal+=custo; vendaBruta+=tot; }
      });
    });
    var vendaLiquida = vendaBruta*(1-dp);
    var vendaTotal   = vendaLiquida + vendaLiquida*op;
    return {
      custo: custoTotal,
      venda: vendaTotal,           // total geral, idêntico ao r-geral do ORC
      vendaBruta: vendaBruta,      // antes de desconto e operacional
      desconto: vendaBruta*dp,
      operacional: vendaLiquida*op,
      custoOpcional: custoOpc,     // opcionais NÃO inclusos no total
      vendaOpcional: vendaOpc,
      fator: fator
    };
  }

  // ── FORMATAÇÃO ──
  function fmt(v){
    return 'R$ '+(v||0).toFixed(2).replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,'.');
  }

  return {
    SUPA_URL: SUPA_URL,
    SUPA_KEY: SUPA_KEY,
    STATUS_PIPELINE: STATUS_PIPELINE,
    BLOCOS: BLOCOS,
    CATEGORIAS: CATEGORIAS,
    CATEGORIAS_PDVEX: CATEGORIAS_PDVEX,
    CATEGORIAS_LOCACAO: CATEGORIAS_LOCACAO,
    CATEGORIAS_EXTRAS: CATEGORIAS_EXTRAS,
    SUBCATS: SUBCATS,
    subcategoriasDe: subcategoriasDe,
    ehPDVEX: ehPDVEX,
    CATEGORIAS_PARTICULAR: CATEGORIAS_PARTICULAR,
    ehParticular: ehParticular,
    CATEGORIAS_TRANSFER: CATEGORIAS_TRANSFER,
    ehTransferencia: ehTransferencia,
    CATEGORIAS_CAPITAL: CATEGORIAS_CAPITAL,
    ehCapital: ehCapital,
    foraDoResultado: foraDoResultado,
    calcOrcamento: calcOrcamento,
    fmt: fmt
  };
})();
