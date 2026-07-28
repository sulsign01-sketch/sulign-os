-- ═══════════════════════════════════════════════════════════════
-- SULSIGN OS 2.0 — RECONSTRUÇÃO DA OS COMO "FRENTES DE PRODUÇÃO"
-- Rodar no SQL Editor do Supabase (obeamqkcuytctfczhook)
-- Aditivo: mantém a tabela e as linhas existentes. Diário de Obra
-- continua vinculando por ordens_servico.num.
--
-- Modelo: cada linha = 1 FRENTE (estrutura, impressão, montagem…).
-- Um job vira N frentes. Origem pode ser orçamento, pdvex ou avulso.
-- A frente existir = ela foi liberada pro Fernando (liberado_em).
-- Sem CHECK nos enums de propósito: o DB fica permissivo e o
-- mod_prod.js valida os valores — evita a migração quebrar em
-- linhas legadas (treino) com status/origem fora do padrão novo.
-- ═══════════════════════════════════════════════════════════════

-- ── COLUNAS NOVAS (idempotente) ──
alter table ordens_servico add column if not exists origem       text default 'orcamento'; -- orcamento | pdvex | avulso
alter table ordens_servico add column if not exists job          text;                     -- SS-AAAA_MM-## ou rótulo do job pdvex/avulso
alter table ordens_servico add column if not exists cliente      text;                     -- snapshot p/ pdvex/avulso (orçamento puxa ao vivo)
alter table ordens_servico add column if not exists projeto      text;
alter table ordens_servico add column if not exists evento       text;                     -- nome do evento (PDVEX) — futuro vínculo ao Fechamento
alter table ordens_servico add column if not exists frente       text;                     -- Estrutura | Impressão | Montagem | Acabamento | Marcenaria | Outros
alter table ordens_servico add column if not exists escopo       text;                     -- o que esta frente inclui
alter table ordens_servico add column if not exists pecas_ref    jsonb default '[]'::jsonb; -- grupos/peças do orçamento nesta frente (nomes)
alter table ordens_servico add column if not exists responsavel  text default 'Fernando';
alter table ordens_servico add column if not exists prioridade   text default 'normal';    -- normal | alta | urgente
alter table ordens_servico add column if not exists data_montagem date;
alter table ordens_servico add column if not exists instrucoes   text;                     -- instruções do Carlos pro Fernando
alter table ordens_servico add column if not exists liberado_em  timestamptz;              -- o "soltei pro Fernando"
alter table ordens_servico add column if not exists liberado_por text;
alter table ordens_servico add column if not exists concluido_em timestamptz;
alter table ordens_servico add column if not exists updated_at   timestamptz default now();
alter table ordens_servico add column if not exists deletado_em  timestamptz;

-- garante colunas-base caso a tabela estivesse mínima
alter table ordens_servico add column if not exists num              text;
alter table ordens_servico add column if not exists orcamento_numero text;
alter table ordens_servico add column if not exists status           text default 'Aguardando início';
alter table ordens_servico add column if not exists data_entrega     date;
alter table ordens_servico add column if not exists created_at       timestamptz default now();

-- ── BACKFILL das linhas existentes ──
update ordens_servico set origem      = coalesce(origem,'orcamento');
update ordens_servico set job         = coalesce(job, orcamento_numero) where job is null;
update ordens_servico set liberado_em = coalesce(liberado_em, created_at) where liberado_em is null;
update ordens_servico set responsavel = coalesce(responsavel,'Fernando') where responsavel is null;
update ordens_servico set prioridade  = coalesce(prioridade,'normal')     where prioridade is null;

-- normaliza status legado (texto livre) pro conjunto novo de produção
update ordens_servico set status = case
    when status ~* 'entreg'              then 'Entregue'
    when status ~* 'conclu|finaliz|fechad' then 'Concluído'
    when status ~* 'produ'               then 'Em produção'
    else 'Aguardando início'
  end
  where deletado_em is null;
update ordens_servico set status = 'Aguardando início' where status is null;

-- ── ÍNDICES ──
create index if not exists idx_os_orc    on ordens_servico(orcamento_numero);
create index if not exists idx_os_job    on ordens_servico(job);
create index if not exists idx_os_status on ordens_servico(status);
create index if not exists idx_os_del    on ordens_servico(deletado_em);

-- ── RLS (mesmo padrão: authenticated total) ──
alter table ordens_servico enable row level security;
drop policy if exists os_auth on ordens_servico;
create policy os_auth on ordens_servico
  for all to authenticated using (true) with check (true);

-- ── TRIGGER updated_at (reusa a função já criada no ss20_novas_tabelas.sql) ──
drop trigger if exists trg_os_touch on ordens_servico;
create trigger trg_os_touch
  before update on ordens_servico
  for each row execute function ss20_touch_updated_at();
