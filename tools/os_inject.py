#!/usr/bin/env python3
"""Grava uma OS gerada pela calculadora (JSON 'Gerar OS PDVEX') como nova aba na planilha OS_Router_PDVEX.
Uso: python3 os_inject.py OS_xxx.json planilha_entrada.xlsx planilha_saida.xlsx [--num 2026-0067]
Copia o layout da aba MODELO (estilos, mesclas, larguras), recria as 4 seções com o nº de linhas necessário,
mantém as fórmulas (VLOOKUP na Base de custos) e acrescenta a linha no Índice. Nunca sobrescreve a entrada."""
import sys, json, re, copy, datetime
import openpyxl
from openpyxl.utils import get_column_letter

def main(js, src, dst, num=None):
    os_ = json.load(open(js, encoding='utf-8'))
    wb = openpyxl.load_workbook(src)
    M = wb['MODELO']; IDX = wb['Índice']
    B = wb['Base de custos']
    # itens novos na Base (filamento) e R$/h da impressora 3D, só se ainda não existirem
    if os_.get('hora3d') and B['C14'].value in (None, ''): B['C14'] = os_['hora3d']
    exist = {B.cell(r, 1).value for r in range(19, 99)}
    for nome, d in (os_.get('baseAdd') or {}).items():
        if nome in exist: continue
        for r in range(85, 99):
            if B.cell(r, 1).value in (None, ''):
                for c in range(1, 4): B.cell(r, c)._style = copy.copy(B.cell(84, c)._style)
                B.cell(r, 1, nome); B.cell(r, 2, d['un']); B.cell(r, 3, d['custo']); exist.add(nome); break
    nums = [int(n.split('-')[-1]) for n in wb.sheetnames if re.fullmatch(r'OS-2026-\d{4}', n)]
    n = num or '2026-%04d' % (max(nums) + 1)
    name = 'OS-' + n
    if name in wb.sheetnames: raise SystemExit('Já existe a aba ' + name)
    ns = wb.create_sheet(name, index=wb.sheetnames.index('OS-2026-%04d' % max(nums)))
    # propriedades da página e colunas
    for k, v in M.column_dimensions.items():
        ns.column_dimensions[k].width = v.width; ns.column_dimensions[k].min = v.min; ns.column_dimensions[k].max = v.max
    ns.page_setup.orientation = M.page_setup.orientation; ns.page_setup.fitToWidth = M.page_setup.fitToWidth; ns.page_setup.fitToHeight = 0
    ns.sheet_properties.pageSetUpPr = copy.copy(M.sheet_properties.pageSetUpPr)
    ns.print_options = copy.copy(M.print_options); ns.page_margins = copy.copy(M.page_margins)
    ns.sheet_view.showGridLines = M.sheet_view.showGridLines
    merges = [(r.min_row, r.min_col, r.max_row, r.max_col) for r in M.merged_cells.ranges]

    def cp(srow, drow, subs=None):
        for c in range(1, 12):
            s = M.cell(srow, c); d = ns.cell(drow, c)
            d._style = copy.copy(s._style)
            v = s.value
            if isinstance(v, str) and v.startswith('='):
                v = re.sub(r'(?<![A-Za-z$!])([A-K])%d(?!\d)' % srow, lambda m: m.group(1) + str(drow), v)
            d.value = v
        if M.row_dimensions[srow].height: ns.row_dimensions[drow].height = M.row_dimensions[srow].height
        for (r1, c1, r2, c2) in merges:
            if r1 == srow and r2 == srow: ns.merge_cells(start_row=drow, start_column=c1, end_row=drow, end_column=c2)

    for r in range(1, 15): cp(r, r)
    # H1:K3 mesclado (título) — cp só cobre mesclas de 1 linha
    for (r1, c1, r2, c2) in merges:
        if r1 == 2 and r2 == 3: ns.merge_cells(start_row=2, start_column=c1, end_row=3, end_column=c2)
    ns['H2'] = n
    ns['A7'] = os_['evento']; ns['E7'] = os_.get('job', 'A definir (sem SS)'); ns['I7'] = datetime.datetime.combine(datetime.date.today(), datetime.time())
    ns['I7'].number_format = M['I7'].number_format if M['I7'].number_format != 'General' else 'dd/mm/yyyy'
    ns['A9'] = os_.get('cliente', ''); ns['E9'] = os_.get('tipoServico', 'Corte CNC (router)'); ns['I9'] = os_.get('periodo', 'A confirmar')
    ns['A11'] = os_.get('setor', 'Router CNC'); ns['E11'] = os_.get('solicitante', 'PDVEX'); ns['I11'] = 'A confirmar'

    secs = [('mpP', 15, 16, 22, 23), ('mpS', 24, 25, 28, 29), ('maq', 30, 31, 37, 38), ('mo', 39, 40, 44, 45)]
    r = 15; seq = 0; sub = {}; first_row = None
    for key, hdr, tpl, subt, blank in secs:
        lines = os_['secoes'][key]
        cp(hdr, r); r += 1
        a = r; cnt = max(len(lines), 1)
        for i in range(cnt):
            cp(tpl, r)
            if i < len(lines):
                l = lines[i]; seq += 1
                if first_row is None: first_row = r
                ns.cell(r, 1, seq); ns.cell(r, 2, l['desc']); ns.cell(r, 3, l['tipo']); ns.cell(r, 4, l['mp']); ns.cell(r, 5, l['med'])
                ns.cell(r, 6, l['qtd']); ns.cell(r, 7, l['un'])
                if key == 'mpS': ns.cell(r, 10, '=IF(H%d="","",H%d)' % (r, r))
                elif key in ('maq', 'mo'): ns.cell(r, 10, l['cobUn'])
            r += 1
        b = r - 1
        cp(subt, r)
        ns.cell(r, 9).value = '=SUM(I%d:I%d)' % (a, b); ns.cell(r, 11).value = '=SUM(K%d:K%d)' % (a, b)
        sub[key] = r; r += 1
        cp(blank, r); r += 1
    # resumo
    base = r
    cp(46, r); r += 1
    rs = {}
    for src_r, k in ((47, 'mpP'), (48, 'mpS'), (49, 'maq'), (50, 'mo')):
        cp(src_r, r); ns.cell(r, 11).value = ('=I%d' % sub['mpP']) if k == 'mpP' else '=K%d' % sub[k]; r += 1
    cp(51, r); r += 1
    cp(52, r); ns.cell(r, 11).value = '=K%d+K%d+K%d' % (sub['mpS'], sub['maq'], sub['mo']); pagar = r; r += 1
    cp(53, r); ns.cell(r, 9).value = os_.get('orcNumero') or None; r += 1
    cp(54, r); ns.cell(r, 11).value = os_.get('orcValor'); vo = r; r += 1
    cp(55, r); ns.cell(r, 11).value = '=IF(K%d="","",K%d-K%d)' % (vo, pagar, vo); r += 1
    for sr in (56, 57, 58): cp(sr, r); r += 1
    cp(59, r); last = r
    ns.print_area = 'A1:K%d' % last
    ns.sheet_properties.tabColor = M.sheet_properties.tabColor

    # Índice: desloca A:H a partir da linha 7 (as colunas I:M têm a tabela de perfis)
    lastrow = max(r_ for r_ in range(7, IDX.max_row + 1) if IDX.cell(r_, 1).value)
    for rr in range(lastrow, 6, -1):
        for c in range(1, 9):
            s = IDX.cell(rr, c); d = IDX.cell(rr + 1, c)
            d._style = copy.copy(s._style); d.value = s.value
        if IDX.row_dimensions[rr].height: IDX.row_dimensions[rr + 1].height = IDX.row_dimensions[rr].height
    for rr in range(7, lastrow + 2):
        IDX.cell(rr, 8).value = '=IF(F%d="","",F%d-E%d)' % (rr, rr, rr)
    q = "'%s'!" % name
    IDX['A7'] = name; IDX['B7'] = '=' + q + 'A7&""'; IDX['C7'] = '=' + q + 'E7&""'
    IDX['D7'] = '=COUNT(%sA15:A%d)' % (q, sub['mo'])
    IDX['E7'] = '=%sI%d+%sI%d+%sI%d' % (q, sub['mpS'], q, sub['maq'], q, sub['mo'])
    IDX['F7'] = '=%sK%d' % (q, pagar); IDX['G7'] = os_.get('perfil', 'PDVEX')
    IDX['H7'] = '=IF(F7="","",F7-E7)'
    wb.save(dst)
    print('OK', name, 'linhas', seq, 'última linha', last)

if __name__ == '__main__':
    a = sys.argv[1:]; num = None
    if '--num' in a: i = a.index('--num'); num = a[i + 1]; del a[i:i + 2]
    main(a[0], a[1], a[2], num)
