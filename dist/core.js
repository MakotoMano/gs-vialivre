export const CATEGORIES={
 dano:{label:'Calçada danificada',short:'Calçada danificada',color:'#d58f35',description:'Dano aparente no piso da calçada, com potencial dificuldade para a circulação de pedestres.'},
 obstrucao:{label:'Obstrução por objetos',short:'Obstrução',color:'#7284b4',description:'Objetos ou entulho ocupam parte da faixa de circulação da calçada.'},
 desnivel:{label:'Degrau ou desnível',short:'Degrau ou desnível',color:'#4d9a83',description:'Desnível aparente no trajeto, sem alternativa acessível identificável na imagem.'},
 outra:{label:'Outra barreira potencial',short:'Outra barreira',color:'#bb7c85',description:'Possível barreira à mobilidade que precisa de avaliação humana para ser classificada.'},
 inconclusiva:{label:'Imagem inconclusiva',short:'Inconclusiva',color:'#8c9693',description:'Não foi possível sugerir uma categoria neste cenário. Revise a imagem e informe uma classificação.'}
};
export const STATUS={validado:'Validada',pendente:'Em revisão',rejeitado:'Rejeitada'};
export const PLACES=[
 {name:'Av. Paulista, próximo ao MASP',area:'Bela Vista',lat:-23.5614,lng:-46.6559},
 {name:'Rua Augusta, próximo à Rua Frei Caneca',area:'Consolação',lat:-23.5531,lng:-46.6533},
 {name:'Praça da República',area:'República',lat:-23.5433,lng:-46.6424},
 {name:'Rua dos Pinheiros, próximo ao Largo da Batata',area:'Pinheiros',lat:-23.5676,lng:-46.6928},
 {name:'Rua Vergueiro, próximo ao Centro Cultural',area:'Liberdade',lat:-23.5705,lng:-46.6399},
 {name:'Rua Oscar Freire, próximo à Rua da Consolação',area:'Jardins',lat:-23.5605,lng:-46.6724}
];
export const DEMO_DATE='2026-11-11T18:00:00-03:00';
export function seedRecords(){
 const kinds=['dano','obstrucao','desnivel','dano','obstrucao','dano','outra','desnivel','dano','obstrucao','desnivel','dano','obstrucao','dano','desnivel','outra','obstrucao','dano','desnivel','obstrucao','dano','inconclusiva','inconclusiva','dano'];
 return kinds.map((category,i)=>{
  const place=PLACES[i%PLACES.length],status=i<17?'validado':i<22?'pendente':'rejeitado';
  const date=new Date(new Date(DEMO_DATE).getTime()-(i%12)*86400000-(i%4)*3600000).toISOString();
  return {id:'VL-'+String(1048-i),category,suggestedCategory:category,description:CATEGORIES[category].description,
  userDescription:'Registro fictício para demonstração da plataforma.',address:place.name,area:place.area,
  lat:place.lat+(Math.floor(i/6)-1)*.0024,lng:place.lng+(i%3-1)*.0019,date,status,
  image:'./assets/'+category+'.svg',illustration:true,source:'exemplo',reviewedBy:status==='pendente'?null:'Revisor de demonstração',
  history:[{date,action:'Registro de demonstração criado'},{date,action:status==='validado'?'Classificação validada':status==='rejeitado'?'Ocorrência rejeitada':'Aguardando revisão'}]};
 });
}
export function filterRecords(records,filters={},now=new Date(DEMO_DATE)){
 const needle=(filters.search||'').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 const days=Number(filters.period)||0;
 return records.filter(r=>{
  const hay=[r.id,r.address,r.area,r.description,CATEGORIES[r.category]?.label].join(' ').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  return (!needle||hay.includes(needle))&&(!filters.category||r.category===filters.category)&&(!filters.status||r.status===filters.status)&&(!days||new Date(r.date).getTime()>=now.getTime()-days*86400000);
 }).sort((a,b)=>new Date(b.date)-new Date(a.date));
}
export function metrics(records){
 const valid=records.filter(r=>r.status==='validado');
 return {total:records.length,validated:valid.length,pending:records.filter(r=>r.status==='pendente').length,
 rejected:records.filter(r=>r.status==='rejeitado').length,areas:new Set(valid.map(r=>r.area)).size,
 categories:Object.fromEntries(Object.keys(CATEGORIES).map(k=>[k,records.filter(r=>r.category===k).length]))};
}
export function validateDraft(d){
 if(!d.image)return 'Adicione uma foto ou use a imagem de exemplo.';
 if(!d.address?.trim())return 'Informe a localização aproximada.';
 if(!Number.isFinite(d.lat)||!Number.isFinite(d.lng)||Math.abs(d.lat)>90||Math.abs(d.lng)>180)return 'Selecione uma localização válida.';
 if((d.userDescription||'').length>500)return 'A descrição deve ter até 500 caracteres.';
 return '';
}
export function reviewRecord(record,category,description,status,now=new Date().toISOString()){
 if(!CATEGORIES[category])throw new Error('Categoria inválida.');
 if(!['validado','rejeitado','pendente'].includes(status))throw new Error('Situação inválida.');
 if(status==='validado'&&category==='inconclusiva')throw new Error('Escolha uma categoria conclusiva antes de validar.');
 if(!description.trim())throw new Error('Preencha a descrição da ocorrência.');
 return {...record,category,description:description.trim(),status,reviewedBy:status==='pendente'?null:'Revisor de demonstração',
 history:[...record.history,{date:now,action:status==='validado'?'Classificação revisada e validada':status==='rejeitado'?'Ocorrência rejeitada após revisão':'Ocorrência devolvida para revisão'}]};
}
export function csvAggregate(records){
 const m=metrics(records);const quote=x=>'"'+String(x).replaceAll('"','""')+'"';
 return '\uFEFF'+[['Tipo','Indicador','Quantidade'],['Resumo','Total de ocorrências',m.total],['Resumo','Validadas',m.validated],['Resumo','Em revisão',m.pending],['Resumo','Rejeitadas',m.rejected],['Resumo','Áreas com registros validados',m.areas],...Object.entries(m.categories).map(([k,v])=>['Categoria',CATEGORIES[k].label,v])].map(row=>row.map(quote).join(';')).join('\r\n');
}
