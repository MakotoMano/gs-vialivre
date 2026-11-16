import test from 'node:test';
import assert from 'node:assert/strict';
import {seedRecords,metrics,filterRecords,validateDraft,reviewRecord,csvAggregate,DEMO_DATE} from '../dist/core.js';
test('a demonstração contém 24 registros coerentes e 17 pontos publicáveis',()=>{
 const rows=seedRecords(),m=metrics(rows);assert.equal(rows.length,24);assert.equal(new Set(rows.map(r=>r.id)).size,24);
 assert.deepEqual([m.validated,m.pending,m.rejected,m.areas],[17,5,2,6]);
 assert.ok(rows.filter(r=>r.status==='validado').every(r=>r.category!=='inconclusiva'));
});
test('filtros combinam busca sem acentos, categoria, situação e período',()=>{
 const rows=seedRecords();const filtered=filterRecords(rows,{search:'consolacao',status:'validado',category:'obstrucao',period:'7'},new Date(DEMO_DATE));
 assert.ok(filtered.length>0);assert.ok(filtered.every(r=>r.area==='Consolação'&&r.status==='validado'&&r.category==='obstrucao'));
 assert.equal(filterRecords(rows,{search:'nenhum-lugar'}).length,0);
});
test('uma revisão preserva a sugestão original e registra o histórico',()=>{
 const pending=seedRecords().find(r=>r.status==='pendente'),original=JSON.stringify(pending);
 const updated=reviewRecord(pending,'obstrucao','Descrição corrigida','validado',DEMO_DATE);
 assert.equal(updated.category,'obstrucao');assert.equal(updated.suggestedCategory,pending.suggestedCategory);assert.equal(updated.history.length,pending.history.length+1);
 assert.equal(JSON.stringify(pending),original);assert.equal(updated.status,'validado');
});
test('validação bloqueia imagens inconclusivas e descrição vazia',()=>{
 const r=seedRecords()[0];assert.throws(()=>reviewRecord(r,'inconclusiva','Imagem pouco clara','validado'));
 assert.throws(()=>reviewRecord(r,'dano',' ','validado'));
 assert.throws(()=>reviewRecord(r,'dano','Teste','publicado'));
});
test('registro exige imagem e coordenadas válidas',()=>{
 const base={image:'example',address:'Praça',lat:-23.5,lng:-46.6};
 assert.equal(validateDraft(base),'');assert.ok(validateDraft({...base,image:''}));
 assert.ok(validateDraft({...base,lat:NaN}));assert.ok(validateDraft({...base,lng:181}));
});
test('CSV agrega o filtro sem exportar dados pessoais ou fotografias',()=>{
 const rows=filterRecords(seedRecords(),{status:'pendente'}),csv=csvAggregate(rows);
 assert.ok(csv.includes('"Total de ocorrências";"5"'));assert.ok(!csv.includes('imagem_url'));assert.ok(!csv.includes('VL-'));
});
