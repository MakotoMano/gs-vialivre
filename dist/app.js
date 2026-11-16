import {CATEGORIES,STATUS,PLACES,DEMO_DATE,seedRecords,filterRecords,metrics,validateDraft,reviewRecord,csvAggregate} from './core.js';
import {LOCAL,request} from './api.js';
let serviceHealth=null,loading=LOCAL,analysisController;
const KEY='vialivre.prototype.v1',app=document.querySelector('#app'),modal=document.querySelector('#modal');
const paths={
 grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
 map:'m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2z M9 3v16 M15 5v16',
 list:'M8 6h13 M8 12h13 M8 18h13 M3 6h.1 M3 12h.1 M3 18h.1',
 check:'m5 12 4 4L19 6',shield:'M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7z m-5 9 3 3 5-6',
 pin:'M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 0 1 16 0z M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
 plus:'M12 5v14 M5 12h14',arrow:'M5 12h14 m-5-5 5 5-5 5',chevron:'m9 5 7 7-7 7',
 info:'M12 11v6 M12 7h.01 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
 search:'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
 clock:'M12 7v5l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
 upload:'M12 16V3 m-5 5 5-5 5 5 M4 15v6h16v-6',
 image:'M3 3h18v18H3z m0 14 6-6 5 5 3-3 4 4 M16 7h.01',
 x:'m6 6 12 12 M18 6 6 18',download:'M12 3v13 m-5-5 5 5 5-5 M4 17v4h16v-4',
 edit:'m15 5 4 4 M3 21l5-1L21 7l-4-4L4 16z',
 trash:'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',
 layers:'m12 3 10 5-10 5L2 8z m-10 9 10 5 10-5 M2 13l10 5 10-5',
 refresh:'M20 7v-5 M20 7h-5 M4 17v5 M4 17h5 M20 7a9 9 0 0 0-16 3 M4 17a9 9 0 0 0 16-3',
 menu:'M3 5h18 M3 12h18 M3 19h18',eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12 M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0'
};
function icon(name){return '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="'+(paths[name]||paths.pin)+'"/></svg>';}
function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function badge(status){return '<span class="badge '+status+'"><i class="dot"></i>'+STATUS[status]+'</span>';}
function btn(text,action,kind='',ico='',extra=''){return '<button class="btn '+kind+'" data-action="'+action+'" '+extra+'>'+(ico?icon(ico):'')+text+'</button>';}
function opts(items,value,blank){return (blank?'<option value="">'+blank+'</option>':'')+Object.entries(items).map(([k,v])=>'<option value="'+esc(k)+'" '+(value===k?'selected':'')+'>'+esc(typeof v==='string'?v:v.label)+'</option>').join('');}
const fmtDate=d=>new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short'}).format(new Date(d));
const fmtFull=d=>new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'}).format(new Date(d));
let records,storageProblem=false;
try{const raw=LOCAL?'[]':localStorage.getItem(KEY);records=raw?JSON.parse(raw):seedRecords();if(!Array.isArray(records)||records.some(r=>!r.id||!CATEGORIES[r.category]||!STATUS[r.status]||!Array.isArray(r.history)))throw Error();}
catch{records=LOCAL?[]:seedRecords();storageProblem=true;}
let route='overview',filters={search:'',category:'',status:'',period:''},map,markers={},pickerMap,draft,analysisTimer,toastTimer,focusBefore,detailId;
function save(next){try{localStorage.setItem(KEY,JSON.stringify(next));records=next;return true;}catch{const message='Não foi possível salvar. O armazenamento do navegador pode estar cheio ou bloqueado.';const error=modal.querySelector('.form-error');if(error)error.textContent=message;else toast(message);return false;}}
function toast(message){const el=document.querySelector('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),4800);}
function currentRecords(){return filterRecords(records,filters,new Date(Math.max(new Date(DEMO_DATE).getTime(),Date.now())));}
function categoryLegend(){return Object.entries(CATEGORIES).filter(([k])=>k!=='inconclusiva').map(([k,v])=>'<span><i style="background:'+v.color+'"></i>'+v.short+'</span>').join('');}
const routeLabels={overview:'Visão geral',map:'Explorar mapa',records:'Ocorrências',review:'Fila de revisão',about:'Sobre o projeto'};
function navLink(key,ico){return '<a class="nav-link '+(route===key?'active':'')+'" href="#'+key+'" '+(route===key?'aria-current="page"':'')+' aria-label="'+routeLabels[key]+'">'+icon(ico)+'<span>'+routeLabels[key]+'</span>'+(key==='review'?'<b class="count">'+metrics(records).pending+'</b>':'')+'</a>';}
function shell(){
 if(map){map.stop();map.remove();map=null;}markers={};
 app.innerHTML='<aside class="sidebar" aria-label="Navegação principal"><button class="icon-btn close-menu" data-action="menu" aria-label="Fechar menu">×</button><a class="brand" href="#overview"><img src="./assets/logo.svg" alt=""><span class="brand-name">ViaLivre<small>Cidades para todos</small></span></a><div class="nav-label">Monitoramento</div><nav>'+navLink('overview','grid')+navLink('map','map')+navLink('records','list')+navLink('review','shield')+'</nav><div class="side-bottom">'+navLink('about','info')+'<div class="side-note">'+icon('list')+'<h4>Cada registro faz diferença.</h4><p>Um olhar atento hoje. Uma cidade mais acessível amanhã.</p></div><div class="profile"><div class="avatar">VL</div><div>Espaço de demonstração<small>CitizenTech · FIAP</small></div></div></div></aside><div class="workspace"><header class="topbar"><div class="breadcrumb"><button class="icon-btn menu-toggle" data-action="menu" aria-label="Abrir menu" aria-expanded="false">'+icon('menu')+'</button><span class="home-crumb">Monitoramento</span><span class="home-crumb">/</span><strong>'+routeLabels[route]+'</strong></div><div class="top-right"><span class="demo-tag">Ambiente de demonstração</span><button class="icon-btn" data-action="help" aria-label="Sobre esta demonstração">'+icon('info')+'</button><div class="avatar">VL</div></div></header><main id="main" tabindex="-1">'+page()+'<footer class="page-footer"><span>ViaLivre © 2026 · Tecnologia a serviço do cidadão</span><span>Dados fictícios. Registros não certificam a segurança de trajetos.</span></footer></main></div>';
 if(LOCAL){app.innerHTML=localCopy(app.innerHTML);const reset=app.querySelector('[data-action=reset]');reset?.closest('section')?.remove();if(loading){app.querySelector('main').innerHTML='<div class=helper>Carregando os registros do servidor…</div>';}else if(!serviceHealth){app.querySelector('main').innerHTML='<section class="panel prose"><h2>Servidor indisponível</h2><p>Não foi possível carregar os registros. Verifique se o servidor local continua aberto.</p>'+btn('Tentar novamente','reload','primary')+'</section>';}else{const main=app.querySelector('main');main.insertAdjacentHTML('afterbegin','<div class="helper service-status">'+icon(serviceHealth.analysisConfigured?'check':'info')+(serviceHealth.analysisConfigured?'Servidor conectado · classificação por fotografia configurada.':'Servidor conectado · classificação automática não configurada. O cadastro e a revisão manual estão disponíveis.')+'</div>');}}
 syncMobileMenu(false);bindFilters();
 if(LOCAL&&(loading||!serviceHealth))return;
 if(route==='overview')initMap('overview-map',records.filter(r=>r.status==='validado'),false);
 if(route==='map')initMap('explore-map',currentRecords().filter(r=>r.status==='validado'),true);
}

function localCopy(html){
 const replacements={
 'Espaço de demonstração':'Espaço local',
 'Ambiente de demonstração':'MVP local',
 'Sobre esta demonstração':'Sobre o projeto',
 'Dados fictícios. Registros não certificam a segurança de trajetos.':'Registros locais. A revisão não certifica a segurança dos trajetos.',
 'Todos os registros da demonstração':'Registros salvos no banco local',
 'Dados salvos neste navegador':'Dados salvos no servidor local',
 'Você está usando o papel de revisor da demonstração.':'Você está usando o papel de revisor local, sem contas individuais.',
 'Este protótipo utiliza dados de demonstração e armazenamento no navegador.':'Esta versão utiliza um servidor local e banco SQLite. As fotografias e o histórico permanecem salvos após fechar o navegador.',
 'Limites da demonstração':'Limites da versão local',
 'Os registros iniciais são fictícios. Não há integração com prefeituras, certificação de acessibilidade ou recomendação de rotas. Os papéis de cidadão e revisor estão disponíveis para testar a experiência, sem autenticação.':'O banco começa vazio. Não há integração com prefeituras, certificação de acessibilidade ou recomendação de rotas. Esta versão funciona somente neste computador, com um revisor local e sem contas individuais.',
 'Selecione um cenário e confira os dados do registro.':'Envie uma fotografia para classificação quando o serviço estiver configurado, ou preencha a categoria manualmente.',
 'Selecione um local de demonstração e, se precisar, ajuste o ponto no mapa.':'Use uma referência inicial e ajuste o ponto no mapa para indicar o local observado.',
 'Confirme a alteração dos dados locais':'Confirme a alteração no banco local',
 'A ocorrência e a imagem associada serão removidas deste navegador.':'A ocorrência e a imagem associada serão removidas do banco local.'
 };
 for(const [from,to] of Object.entries(replacements))html=html.replaceAll(from,to);
 return html;
}
async function refreshLocal(){
 loading=true;shell();
 try{const [health,data]=await Promise.all([request('/health'),request('/records')]);serviceHealth=health;records=data;}
 catch(e){serviceHealth=null;toast(e.message);}
 finally{loading=false;shell();}
}

function heading(title,subtitle,extra){return '<div class="page-heading"><div><div class="eyebrow">Acessibilidade urbana</div><h1>'+title+'</h1><p class="subtitle">'+subtitle+'</p></div><div class="button-row">'+(extra||'')+btn('Registrar ocorrência','new','primary','plus')+'</div></div>';}
function stat(label,value,foot,ico,featured){return '<div class="stat '+(featured?'featured':'')+'"><div class="stat-icon">'+icon(ico)+'</div><p class="stat-label">'+label+'</p><div class="stat-number">'+value+'</div><div class="stat-foot">'+foot+'</div></div>';}
function tableRows(rows){return rows.map(r=>'<tr><td><div class="cell-title"><img class="thumb" src="'+esc(r.image)+'" alt=""><div><strong>'+esc(CATEGORIES[r.category].short)+'</strong><small>'+esc(r.id)+'</small></div></div></td><td>'+esc(r.area)+'</td><td>'+fmtDate(r.date)+'</td><td>'+badge(r.status)+'</td><td><button class="icon-btn" data-action="detail" data-id="'+r.id+'" aria-label="Ver ocorrência '+r.id+'">'+icon('arrow')+'</button></td></tr>').join('');}
function table(rows){return rows.length?'<div class="table-scroll"><table><thead><tr><th>Ocorrência</th><th>Região</th><th>Registro</th><th>Situação</th><th><span class="sr-only">Detalhes</span></th></tr></thead><tbody>'+tableRows(rows)+'</tbody></table></div>':empty('Nenhuma ocorrência encontrada','Tente outra busca ou limpe os filtros.');}
function empty(title,text){return '<div class="empty">'+icon('search')+'<h3>'+title+'</h3><p>'+text+'</p></div>';}
function page(){
 const m=metrics(records);
 if(route==='overview'){
 const cats=Object.entries(m.categories).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
 return heading('Uma cidade mais acessível, juntos.','Acompanhe os registros e transforme observações em informação.')+
 '<section class="stats" aria-label="Indicadores">'+stat('Ocorrências registradas',m.total,'Todos os registros da demonstração','layers',true)+stat('Ocorrências validadas',m.validated,'Disponíveis no mapa colaborativo','check')+stat('Aguardando revisão',m.pending,'Sua análise ajuda a qualificar os dados','clock')+stat('Regiões monitoradas',m.areas,'Com pelo menos um registro validado','pin')+'</section>'+
 '<div class="dashboard-grid"><div><section class="panel"><div class="panel-header"><div><h2>Um olhar sobre a cidade</h2><p>Barreiras registradas e validadas pela comunidade</p></div><a class="text-link" href="#map">Explorar mapa '+icon('arrow')+'</a></div><div class="map-wrap"><div class="map-label">'+icon('pin')+' São Paulo, SP</div><div id="overview-map" class="map" aria-label="Mapa das ocorrências validadas"></div><div class="tile-error">O mapa base está indisponível. Os pontos continuam acessíveis na lista de ocorrências.</div></div><div class="map-footer"><div class="legend">'+categoryLegend()+'</div><span>'+m.validated+' registros</span></div></section>'+
 '<section class="panel recent"><div class="panel-header"><div><h2>Registros recentes</h2><p>As últimas contribuições para a cidade</p></div><a class="text-link" href="#records">Ver todos '+icon('arrow')+'</a></div>'+table(filterRecords(records).slice(0,4))+'</section></div>'+
 '<aside class="dashboard-side"><section class="panel"><div class="panel-header"><div><h2>Tipos de barreiras</h2><p>Distribuição dos registros</p></div>'+icon('layers')+'</div><div class="categories">'+cats.map(([k,v])=>'<div class="cat-row"><div class="cat-line"><span class="cat-name"><i class="dot" style="background:'+CATEGORIES[k].color+'"></i>'+CATEGORIES[k].short+'</span><strong>'+v+'</strong></div><div class="bar-track"><div class="bar-fill" style="width:'+(v/Math.max(m.total,1)*100)+'%;background:'+CATEGORIES[k].color+'"></div></div></div>').join('')+'</div><div class="panel-foot">Considera todas as situações de revisão</div></section>'+
 '<section class="review-card"><div class="top-icon">'+icon('shield')+'</div><h3>'+m.pending+' registros precisam<br>de um olhar humano.</h3><p>Confirme ou ajuste os registros antes de disponibilizá-los no mapa.</p><a href="#review" class="btn">Revisar ocorrências '+icon('arrow')+'</a></section></aside></div>';
 }
 if(route==='records')return heading('Ocorrências','Todos os registros, da primeira observação à revisão.',btn('Exportar resumo','export','','download'))+filtersHtml(true)+'<div class="list-summary"><span id="result-count">'+currentRecords().length+' registros encontrados</span><span>Dados salvos neste navegador</span></div><section class="panel" id="results">'+table(currentRecords())+'</section>';
 if(route==='map'){const rows=currentRecords().filter(r=>r.status==='validado');return heading('Explore a acessibilidade da cidade','Consulte ocorrências validadas. Selecione um ponto para ver os detalhes.')+filtersHtml(false)+'<div class="list-summary"><span id="result-count">'+rows.length+' ocorrências validadas</span><span>Localizações aproximadas · São Paulo</span></div><div class="explore-layout"><div class="map-wrap explore-map"><div id="explore-map" class="map" aria-label="Mapa interativo de ocorrências"></div><div class="tile-error">O mapa base está indisponível. Consulte as ocorrências na lista ao lado.</div></div><section class="panel map-results" id="map-results">'+mapResults(rows)+'</section></div>';}
 if(route==='review'){
 const pending=filterRecords(records,{status:'pendente'});
 return heading('Seu olhar faz a diferença.','Revise a classificação e ajude a construir informações mais confiáveis.')+'<div class="helper">'+icon('info')+' Você está usando o papel de revisor da demonstração. Confira a categoria, a descrição e a fotografia do registro.</div><div class="list-summary"><span>'+pending.length+' ocorrências aguardando revisão</span><span>Somente registros validados aparecem no mapa</span></div>'+
 (pending.length?'<div class="record-cards">'+pending.map(r=>'<article class="record-card"><img src="'+esc(r.image)+'" alt="'+(r.illustration?'Ilustração de exemplo':'Fotografia enviada')+'"><div class="body"><div class="list-summary"><span>'+esc(r.id)+'</span>'+badge(r.status)+'</div><h3>'+esc(CATEGORIES[r.category].label)+'</h3><p>'+esc(r.address)+'<br>'+fmtDate(r.date)+'</p>'+btn('Revisar ocorrência','detail','','edit','data-id="'+r.id+'"')+'</div></article>').join('')+'</div>':empty('Tudo revisado por aqui','Novos registros aparecerão nesta fila. Você pode cadastrar uma ocorrência para testar.'));
 }
 return heading('Tecnologia para cidades mais inclusivas.','ViaLivre · Global Solution 2 — CitizenTech | FIAP')+
 '<div class="about-grid"><section class="panel prose"><div class="eyebrow">O projeto</div><h2>Da fotografia à informação coletiva</h2><p>O ViaLivre propõe identificar, classificar e monitorar barreiras de acessibilidade em espaços públicos urbanos a partir da colaboração dos cidadãos.</p><p>O projeto reúne cadastro de ocorrências, mapas interativos e indicadores de acessibilidade. Os participantes classificam e revisam os registros. Este protótipo utiliza dados de demonstração e armazenamento no navegador.</p><h3>Uma cidade que cabe todo mundo</h3><p>A solução se destina a pessoas com deficiência ou mobilidade reduzida, idosos e demais pedestres, além de organizações que acompanham a infraestrutura urbana.</p><div class="ods"><span>ODS 11</span><span>ODS 10</span><span>ODS 9</span></div><h3>Limites da demonstração</h3><p>Os registros iniciais são fictícios. Não há integração com prefeituras, certificação de acessibilidade ou recomendação de rotas. Os papéis de cidadão e revisor estão disponíveis para testar a experiência, sem autenticação.</p></section>'+
 '<section class="panel prose"><h2>Como funciona</h2><ol class="workflow"><li><div><strong>Registre uma barreira</strong><small>Adicione uma foto e uma localização aproximada.</small></div></li><li><div><strong>Classifique a ocorrência</strong><small>Selecione um cenário e confira os dados do registro.</small></div></li><li><div><strong>Revise a informação</strong><small>Confirme ou corrija os dados antes da validação.</small></div></li><li><div><strong>Acompanhe no mapa</strong><small>Registros validados passam a integrar a visualização.</small></div></li><li><div><strong>Entenda os indicadores</strong><small>O painel se atualiza a cada alteração dos registros.</small></div></li></ol></section></div>'+
 '<section class="panel storage-card"><div><h3>Começar uma nova demonstração</h3><p>Restaure os 24 registros de exemplo. Seus cadastros e alterações locais serão removidos.</p></div>'+btn('Restaurar demonstração','reset','','refresh')+'</section>';
}
function filtersHtml(status){return '<div class="filter-bar"><div class="search-field"><label for="search">Buscar ocorrência</label>'+icon('search')+'<input id="search" type="search" placeholder="Bairro, categoria ou código…" value="'+esc(filters.search)+'"></div><div><label for="category">Tipo de barreira</label><select id="category">'+opts(CATEGORIES,filters.category,'Todos os tipos')+'</select></div>'+(status?'<div><label for="status">Situação</label><select id="status">'+opts(STATUS,filters.status,'Todas as situações')+'</select></div>':'')+'<div><label for="period">Período</label><select id="period">'+opts({'7':'Últimos 7 dias','30':'Últimos 30 dias'},filters.period,'Todo o período')+'</select></div>'+btn('Limpar','clear','small','refresh')+'</div>';}
function bindFilters(){
 for(const key of ['search','category','status','period'])document.getElementById(key)?.addEventListener(key==='search'?'input':'change',e=>{filters[key]=e.target.value;updateResults();});
}
function updateResults(){
 const rows=currentRecords();
 if(route==='records'){document.querySelector('#results').innerHTML=table(rows);document.querySelector('#result-count').textContent=rows.length+' registros encontrados';}
 if(route==='map'){const valid=rows.filter(r=>r.status==='validado');document.querySelector('#map-results').innerHTML=mapResults(valid);document.querySelector('#result-count').textContent=valid.length+' ocorrências validadas';if(map){map.stop();map.remove();map=null;}initMap('explore-map',valid,true);}
}
function mapResults(rows){return rows.length?rows.map(r=>'<button class="map-record" data-action="map-detail" data-id="'+r.id+'"><div class="list-summary"><span>'+esc(r.id)+'</span>'+badge(r.status)+'</div><h3>'+esc(CATEGORIES[r.category].label)+'</h3><p>'+esc(r.address)+'</p><span class="text-link">Ver detalhes '+icon('arrow')+'</span></button>').join(''):empty('Sem registros neste filtro','Experimente outra categoria ou região.');}
function addBase(layerMap){
 const layer=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,referrerPolicy:'strict-origin-when-cross-origin',attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'}).addTo(layerMap);
 let loaded=0,failed=0;layer.on('tileload',()=>{loaded++;const err=layerMap.getContainer().parentElement.querySelector('.tile-error');if(err)err.classList.remove('show');});
 layer.on('tileerror',()=>{failed++;if(!loaded&&failed>=3)layerMap.getContainer().parentElement.querySelector('.tile-error')?.classList.add('show');});
}
function mapIcon(category){return L.divIcon({className:'marker-icon',html:'<div class="map-pin" style="--pin:'+CATEGORIES[category].color+'">'+icon(category==='obstrucao'?'layers':category==='desnivel'?'arrow':'pin')+'</div>',iconSize:[31,38],iconAnchor:[15,36]});}
function initMap(id,rows,interactive){
 if(!window.L){document.getElementById(id).innerHTML=empty('Mapa indisponível','Consulte os registros na lista.');return;}
 map=L.map(id,{zoomControl:false,scrollWheelZoom:interactive,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false}).setView([-23.5565,-46.6600],13);
 addBase(map);L.control.zoom({position:'bottomright'}).addTo(map);markers={};
 rows.forEach(r=>{
 const marker=L.marker([r.lat,r.lng],{icon:mapIcon(r.category),title:r.id+' · '+CATEGORIES[r.category].label,alt:'Abrir '+r.id}).addTo(map);
 marker.bindPopup('<strong>'+esc(CATEGORIES[r.category].label)+'</strong><p>'+esc(r.address)+'</p>'+badge(r.status)+'<br>'+btn('Ver ocorrência','detail','small','arrow','data-id="'+r.id+'"'));markers[r.id]=marker;
 });
 if(rows.length)map.fitBounds(rows.map(r=>[r.lat,r.lng]),{padding:[38,38],maxZoom:14,animate:false});
 const activeMap=map;setTimeout(()=>{if(map===activeMap)activeMap.invalidateSize({animate:false,pan:false});},40);
}
function openModal(html){if(LOCAL)html=localCopy(html);if(!modal.open){focusBefore=document.activeElement;modal.showModal();}if(pickerMap){pickerMap.remove();pickerMap=null;}modal.innerHTML=html;modal.scrollTop=0;setTimeout(()=>modal.querySelector('input:not([type=file]),select,button')?.focus(),30);}
function closeModal(){analysisController?.abort();analysisController=null;clearTimeout(analysisTimer);if(pickerMap){pickerMap.remove();pickerMap=null;}modal.close();modal.innerHTML='';draft=null;focusBefore?.focus?.();}
function modalHead(title,sub){return '<div class="modal-head"><div><h2 id="modal-title">'+title+'</h2>'+(sub?'<p>'+sub+'</p>':'')+'</div><button class="icon-btn" data-action="close" aria-label="Fechar">'+icon('x')+'</button></div>';}
function steps(active){return '<div class="steps">'+['Registro','Preparação','Conferência'].map((s,i)=>(i?'<i></i>':'')+'<span class="'+(active===i?'current':'')+'"><b>'+(i+1)+'</b>'+s+'</span>').join('')+'</div>';}
function startNew(){draft={image:'',illustration:false,address:PLACES[0].name,area:PLACES[0].area,lat:PLACES[0].lat,lng:PLACES[0].lng,userDescription:'',scenario:'dano',category:'dano'};formStep();}
function formStep(){
 openModal(modalHead('Registrar uma ocorrência','Uma observação pode ajudar muitas pessoas.')+'<div class="modal-body">'+steps(0)+
 '<div class="field"><label for="photo">Fotografia da barreira</label><div class="upload" id="dropzone">'+(draft.image?'<img src="'+esc(draft.image)+'" alt="Imagem selecionada"><small>Toque para substituir a imagem</small>':icon('upload')+'<strong>Escolha uma foto ou arraste para cá</strong><small>JPG, PNG ou WebP · até 8 MB</small>')+'<input id="photo" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Selecionar fotografia"></div></div><div class="upload-tools"><span>A imagem permanece neste navegador.</span><button class="text-link" data-action="example">'+icon('image')+' Usar imagem de exemplo</button></div>'+
 '<div class="field"><label for="place">Localização aproximada</label><select id="place">'+PLACES.map((p,i)=>'<option value="'+i+'" '+(draft.address===p.name?'selected':'')+'>'+p.name+'</option>').join('')+'</select><small>Selecione um local de demonstração e, se precisar, ajuste o ponto no mapa.</small></div>'+
 '<div class="field"><label for="address">Referência do local</label><input id="address" maxlength="160" value="'+esc(draft.address)+'" placeholder="Rua, praça ou ponto de referência"><small id="coordinates">'+draft.lat.toFixed(5)+', '+draft.lng.toFixed(5)+'</small></div>'+
 '<button class="text-link" data-action="picker">'+icon('map')+' Ajustar localização no mapa</button><div id="picker-slot"></div>'+
 '<div class="field" style="margin-top:20px"><label for="user-description">O que você observou? <span style="font-weight:400;color:var(--muted)">(opcional)</span></label><textarea id="user-description" maxlength="500" placeholder="Descreva a barreira e como ela pode dificultar a passagem…">'+esc(draft.userDescription)+'</textarea></div>'+
 '<div class="field"><label for="scenario">Cenário de demonstração</label><select id="scenario">'+opts({...CATEGORIES,erro:'Falha temporária do serviço'},draft.scenario)+'</select><small>O cenário selecionado preenche uma categoria e uma descrição de exemplo para testar o fluxo.</small></div><div class="form-error" id="form-error" role="alert"></div></div><div class="modal-footer">'+btn('Cancelar','close')+btn('Continuar','analyze','primary','arrow')+'</div>');
 if(LOCAL){modal.querySelector('.upload-tools').innerHTML='<span>A foto será salva no banco local ao enviar o registro.</span>';modal.querySelector('#address').closest('.field').insertAdjacentHTML('afterend','<div class=field><label for=area>Bairro ou região</label><input id=area maxlength=100 value="'+esc(draft.area)+'"></div><div class=coordinate-fields><div class=field><label for=latitude>Latitude</label><input id=latitude type=number step=0.00001 min=-90 max=90 value="'+draft.lat+'"></div><div class=field><label for=longitude>Longitude</label><input id=longitude type=number step=0.00001 min=-180 max=180 value="'+draft.lng+'"></div></div>');const scenario=modal.querySelector('#scenario');scenario.closest('.field').innerHTML='<div class=helper>Você pode classificar manualmente. O envio ao serviço externo é opcional e exige autorização.</div><label class=consent><input type=checkbox id=external-consent> Autorizo enviar esta fotografia ao serviço de classificação externo.</label>';const next=modal.querySelector('[data-action=analyze]');next.textContent='Classificar fotografia';next.disabled=!serviceHealth?.analysisConfigured;next.insertAdjacentHTML('beforebegin',btn('Classificar manualmente','local-manual','','edit'));}
 document.querySelector('#photo').addEventListener('change',e=>loadPhoto(e.target.files[0]));
 const drop=document.querySelector('#dropzone');drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('dragging');});drop.addEventListener('dragleave',()=>drop.classList.remove('dragging'));drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('dragging');loadPhoto(e.dataTransfer.files[0]);});
 document.querySelector('#place').addEventListener('change',e=>{const p=PLACES[Number(e.target.value)];draft={...draft,...p,address:p.name};document.querySelector('#address').value=p.name;if(LOCAL){document.querySelector('#area').value=p.area;document.querySelector('#latitude').value=p.lat;document.querySelector('#longitude').value=p.lng;}document.querySelector('#coordinates').textContent=p.lat.toFixed(5)+', '+p.lng.toFixed(5);if(pickerMap){pickerMap.setView([p.lat,p.lng],15);showPicker();}});
}
function captureDraft(){if(!draft)return;if(LOCAL){draft.area=document.querySelector('#area')?.value??draft.area;if(document.querySelector('#latitude')){draft.lat=(document.querySelector('#latitude').value.trim()?Number(document.querySelector('#latitude').value):NaN);draft.lng=(document.querySelector('#longitude').value.trim()?Number(document.querySelector('#longitude').value):NaN);}}draft.address=document.querySelector('#address')?.value??draft.address;draft.userDescription=document.querySelector('#user-description')?.value??draft.userDescription;draft.scenario=document.querySelector('#scenario')?.value??draft.scenario;}
async function loadPhoto(file){
 if(!file)return;captureDraft();const error=document.querySelector('#form-error');
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)){error.textContent='Escolha uma imagem JPG, PNG ou WebP.';return;}
 if(file.size>8*1024*1024){error.textContent='A foto deve ter no máximo 8 MB.';return;}
 try{
 const image=await createImageBitmap(file);const scale=Math.min(1,1100/Math.max(image.width,image.height));const canvas=document.createElement('canvas');canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);
 canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);image.close();
 if(!draft)return;draft.analysisId=null;draft.image=canvas.toDataURL('image/jpeg',.78);draft.illustration=false;formStep();
 }catch{if(error?.isConnected)error.textContent='Não foi possível abrir esta imagem. Tente outro arquivo.';}
}
function showPicker(){
 captureDraft();if(pickerMap){pickerMap.remove();pickerMap=null;}
 document.querySelector('#picker-slot').innerHTML='<div id="picker-map" class="picker-map" aria-label="Selecione um ponto aproximado no mapa"></div><small class="photo-caption">Clique no mapa para ajustar o ponto. A referência selecionada continua disponível por teclado.</small>';
 pickerMap=L.map('picker-map').setView([draft.lat,draft.lng],15);addBase(pickerMap);
 let point=L.marker([draft.lat,draft.lng],{icon:mapIcon('dano')}).addTo(pickerMap);
 pickerMap.on('click',e=>{draft.lat=Number(e.latlng.lat.toFixed(5));draft.lng=Number(e.latlng.lng.toFixed(5));point.setLatLng([draft.lat,draft.lng]);if(LOCAL){document.querySelector('#latitude').value=draft.lat;document.querySelector('#longitude').value=draft.lng;}document.querySelector('#coordinates').textContent=draft.lat.toFixed(5)+', '+draft.lng.toFixed(5);});
}
function analyze(){
 if(LOCAL){analyzeLocal();return;}
 captureDraft();const error=validateDraft(draft);if(error){document.querySelector('#form-error').textContent=error;return;}
 openModal(modalHead('Preparando a ocorrência','Organização dos dados do registro')+'<div class="modal-body">'+steps(1)+'<div class="analysis"><div class="scan">'+icon('list')+'</div><h3>Organizando o registro…</h3><p>Carregando a categoria e a descrição selecionadas.</p><div class="analysis-progress"><span></span><span></span><span></span></div><p>Demonstração local · nenhuma imagem é enviada</p></div></div>');
 analysisTimer=setTimeout(()=>{
 if(!draft||!modal.open)return;
 if(draft.scenario==='erro'){
 openModal(modalHead('O processamento não foi concluído','Cenário de falha temporária')+'<div class="modal-body"><div class="helper">'+icon('info')+' O cenário selecionado representa uma falha temporária. Sua foto e seus dados foram preservados. Volte ao registro para escolher outro cenário ou continue com a classificação manual.</div></div><div class="modal-footer">'+btn('Voltar ao registro','back')+btn('Classificar manualmente','manual','primary','edit')+'</div>');return;
 }
 draft.category=draft.scenario;draft.suggestedCategory=draft.scenario;draft.description=CATEGORIES[draft.category].description;reviewDraft();
 },1800);
}

async function analyzeLocal(){
 captureDraft();const error=validateDraft(draft);
 if(error){document.querySelector('#form-error').textContent=error;return;}
 if(!document.querySelector('#external-consent')?.checked){document.querySelector('#form-error').textContent='Autorize o envio da foto ou use a classificação manual.';return;}
 const activeDraft=draft,controller=new AbortController();analysisController=controller;
 openModal(modalHead('Classificando a fotografia','Aguarde o processamento do registro.')+'<div class=modal-body>'+steps(1)+'<div class=analysis><div class=scan>'+icon('image')+'</div><h3>Processando a fotografia…</h3><p>A foto está sendo enviada ao serviço de classificação. O resultado precisará da sua conferência.</p></div></div><div class=modal-footer>'+btn('Cancelar','close')+'</div>');
 try{
 const result=await request('/analyze',{method:'POST',body:JSON.stringify({image:activeDraft.image,consent:true}),signal:controller.signal});
 if(draft!==activeDraft||!modal.open)return;
 Object.assign(draft,result,{suggestedCategory:result.category});reviewDraft();
 }catch(e){
 if(draft!==activeDraft||!modal.open)return;
 openModal(modalHead('O processamento não foi concluído','Sua fotografia e os dados foram preservados.')+'<div class=modal-body><div class=helper>'+esc(e.message)+'</div></div><div class=modal-footer>'+btn('Voltar ao registro','back')+btn('Classificar manualmente','manual','primary','edit')+'</div>');
 }finally{if(analysisController===controller)analysisController=null;}
}
function manualLocal(){captureDraft();const error=validateDraft(draft);if(error){document.querySelector('#form-error').textContent=error;return;}draft.analysisId=null;draft.category='inconclusiva';draft.suggestedCategory='inconclusiva';draft.description=draft.userDescription||'';reviewDraft();}

function reviewDraft(){
 openModal(modalHead('Confira as informações','Você pode corrigir os dados antes de enviar para revisão.')+'<div class="modal-body">'+steps(2)+'<div class="review-layout"><div><img class="review-photo" src="'+esc(draft.image)+'" alt="Imagem da nova ocorrência"><p class="photo-caption">'+(draft.illustration?'Ilustração de exemplo · dado fictício':'Fotografia selecionada')+'<br>'+esc(draft.address)+'</p></div><div><div class="field"><label for="review-category">Categoria da ocorrência</label><select id="review-category">'+opts(CATEGORIES,draft.category)+'</select><small>Categoria inicial: '+CATEGORIES[draft.suggestedCategory].label+'</small></div><div class="field"><label for="review-description">Descrição</label><textarea id="review-description" maxlength="1000">'+esc(draft.description)+'</textarea></div></div></div><div class="helper">'+icon('shield')+' O registro entrará na fila de revisão. Ele aparecerá no mapa depois de ser validado.</div><div id="form-error" class="form-error" role="alert"></div></div><div class="modal-footer">'+btn('Voltar ao registro','back')+btn('Enviar para revisão','submit','primary','check')+'</div>');
}
async function submitDraft(){
 const description=document.querySelector('#review-description').value.trim();if(!description){document.querySelector('#form-error').textContent='Preencha a descrição da ocorrência.';return;}
 const date=new Date().toISOString();const id='VL-'+Date.now().toString(36).toUpperCase();
 const record={id,category:document.querySelector('#review-category').value,suggestedCategory:draft.suggestedCategory,description,userDescription:draft.userDescription,address:draft.address.trim(),area:draft.area,lat:draft.lat,lng:draft.lng,date,status:'pendente',image:draft.image,illustration:draft.illustration,source:'usuario',reviewedBy:null,history:[{date,action:'Ocorrência registrada'},{date,action:'Enviada para revisão humana'}]};
 if(LOCAL){const button=modal.querySelector('[data-action=submit]');button.disabled=true;button.dataset.busy='true';try{const result=await request('/records',{method:'POST',body:JSON.stringify({image:draft.image,address:draft.address.trim(),area:draft.area,lat:draft.lat,lng:draft.lng,userDescription:draft.userDescription,category:record.category,description,analysisId:draft.analysisId||null})});records=[...records,result];}catch(e){document.querySelector('#form-error').textContent=e.message;button.disabled=false;delete button.dataset.busy;return;}}else if(!save([...records,record]))return;
 closeModal();setRoute('review');toast('Ocorrência enviada para revisão. Você já pode validá-la.');
}
function openDetail(id){
 const r=records.find(r=>r.id===id);if(!r)return;detailId=id;
 openModal(modalHead(r.id+' · Detalhes da ocorrência',r.address)+'<div class="modal-body"><div class="review-layout"><div><img class="review-photo" src="'+esc(r.image)+'" alt="'+(r.illustration?'Ilustração de exemplo da barreira':'Fotografia da ocorrência')+'"><p class="photo-caption">'+(r.illustration?'Ilustração de exemplo':'Fotografia enviada')+' · '+(r.source==='exemplo'?'Registro fictício':'Cadastro local')+'</p>'+badge(r.status)+'</div><div><div class="field"><label for="detail-category">Classificação revisada</label><select id="detail-category">'+opts(CATEGORIES,r.category)+'</select><small>Categoria original: '+CATEGORIES[r.suggestedCategory].label+'</small></div><div class="field"><label for="detail-description">Descrição da ocorrência</label><textarea id="detail-description" maxlength="1000">'+esc(r.description)+'</textarea></div></div></div>'+
 '<dl class="detail-meta"><div><dt>Região</dt><dd>'+esc(r.area)+'</dd></div><div><dt>Registrada em</dt><dd>'+fmtFull(r.date)+'</dd></div><div><dt>Localização aproximada</dt><dd>'+r.lat.toFixed(5)+', '+r.lng.toFixed(5)+'</dd></div><div><dt>Revisão</dt><dd>'+esc(r.reviewedBy||'Aguardando análise humana')+'</dd></div></dl>'+
 (r.userDescription?'<h3>Observação do cidadão</h3><p class="photo-caption">'+esc(r.userDescription)+'</p>':'')+
 '<h3>Histórico do registro</h3><ul class="timeline">'+r.history.map(h=>'<li>'+esc(h.action)+'<small>'+fmtFull(h.date)+'</small></li>').join('')+'</ul><div class="form-error" id="detail-error" role="alert"></div></div><div class="modal-footer">'+btn('Excluir','delete','danger','trash')+'<div class="button-row">'+(r.status==='pendente'?btn('Rejeitar','reject')+btn('Validar ocorrência','validate','primary','check'):btn('Devolver à revisão','reopen')+btn('Salvar alterações','save-detail','primary','check'))+'</div></div>');
}
async function updateDetail(status){
 const r=records.find(r=>r.id===detailId);
 try{const updated=reviewRecord(r,document.querySelector('#detail-category').value,document.querySelector('#detail-description').value,status);
 if(LOCAL){const buttons=modal.querySelectorAll('.modal-footer button');buttons.forEach(b=>{b.disabled=true;b.dataset.busy='true';});try{const result=await request('/records/'+r.id,{method:'PATCH',body:JSON.stringify({category:updated.category,description:updated.description,status,version:r.version})});records=records.map(v=>v.id===r.id?result:v);closeModal();shell();toast('Revisão salva no banco local.');}finally{buttons.forEach(b=>{b.disabled=false;delete b.dataset.busy;});}return;}
 if(save(records.map(v=>v.id===r.id?updated:v))){closeModal();shell();toast(status==='validado'?'Ocorrência validada. O mapa e os indicadores foram atualizados.':status==='rejeitado'?'Ocorrência rejeitada. Ela não será exibida no mapa.':'Ocorrência devolvida à fila de revisão.');}}
 catch(e){document.querySelector('#detail-error').textContent=e.message;}
}
async function deleteLocal(){
 const r=records.find(r=>r.id===detailId);if(!r)return;
 const button=modal.querySelector('[data-action=confirm-delete]');button.disabled=true;button.dataset.busy='true';
 try{await request('/records/'+r.id+'?version='+r.version,{method:'DELETE'});records=records.filter(v=>v.id!==r.id);closeModal();shell();toast('Ocorrência e fotografia excluídas do banco local.');}
 catch(e){button.disabled=false;delete button.dataset.busy;toast(e.message);}
}
function confirmAction(action){
 const reset=action==='reset';openModal(modalHead(reset?'Restaurar demonstração':'Excluir ocorrência','Confirme a alteração dos dados locais')+'<div class="confirm-body">'+icon('trash')+'<h3>'+(reset?'Começar novamente?':'Remover este registro?')+'</h3><p>'+(reset?'Seus registros e alterações serão removidos deste navegador e substituídos pelos 24 exemplos iniciais.':'A ocorrência e a imagem associada serão removidas deste navegador. Essa ação não pode ser desfeita.')+'</p></div><div class="modal-footer">'+btn('Cancelar',reset?'close':'cancel-delete')+btn(reset?'Restaurar os exemplos':'Excluir registro',reset?'confirm-reset':'confirm-delete','danger','trash')+'</div>');
}
function exportSummary(){const blob=new Blob([csvAggregate(currentRecords())],{type:'text/csv;charset=utf-8;'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='ViaLivre_Resumo_Ocorrencias.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Resumo exportado com os filtros atuais.');}
function syncMobileMenu(open){const sidebar=document.querySelector('.sidebar');if(!sidebar)return;sidebar.classList.toggle('open',open);sidebar.inert=window.innerWidth<=620&&!open;document.querySelectorAll('[data-action=menu]').forEach(b=>b.setAttribute('aria-expanded',String(open)));}
window.matchMedia('(max-width:620px)').addEventListener('change',()=>syncMobileMenu(false));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.open)syncMobileMenu(false);});
document.addEventListener('click',e=>{if(document.querySelector('.sidebar')?.classList.contains('open')&&!e.target.closest('.sidebar,[data-action=menu]'))syncMobileMenu(false);});
function setRoute(next){if(location.hash==='#'+next){route=next;filters={search:'',category:'',status:'',period:''};shell();}else location.hash=next;}
document.addEventListener('click',e=>{
 const el=e.target.closest('[data-action]');if(!el)return;const action=el.dataset.action;
 if(action==='menu')syncMobileMenu(!document.querySelector('.sidebar').classList.contains('open'));
 if(action==='new'&&(!LOCAL||serviceHealth))startNew();
 if(action==='close'&&!modal.querySelector('.modal-footer [data-busy]'))closeModal();
 if(action==='detail'||action==='map-detail')openDetail(el.dataset.id);
 if(action==='help')setRoute('about');
 if(action==='clear'){filters={search:'',category:'',status:'',period:''};shell();}
 if(action==='export')exportSummary();
 if(action==='example'){captureDraft();const kind=draft.scenario in CATEGORIES?draft.scenario:'dano';draft.image='./assets/'+kind+'.svg';draft.illustration=true;formStep();}
 if(action==='picker')showPicker();
 if(action==='analyze')analyze();
 if(action==='back')formStep();
 if(action==='local-manual')manualLocal();
 if(action==='reload')refreshLocal();
 if(action==='manual'){draft.analysisId=null;draft.category='inconclusiva';draft.suggestedCategory='inconclusiva';draft.description='';reviewDraft();}
 if(action==='submit')submitDraft();
 if(action==='validate')updateDetail('validado');
 if(action==='reject')updateDetail('rejeitado');
 if(action==='reopen')updateDetail('pendente');
 if(action==='save-detail')updateDetail(records.find(r=>r.id===detailId).status);
 if(action==='delete'||action==='reset')confirmAction(action);
 if(action==='cancel-delete')openDetail(detailId);
 if(action==='confirm-delete'){if(LOCAL){deleteLocal();return;}if(save(records.filter(r=>r.id!==detailId))){closeModal();shell();toast('Ocorrência excluída deste navegador.');}}
 if(action==='confirm-reset'&&!LOCAL){if(save(seedRecords())){closeModal();shell();toast('Demonstração restaurada com os 24 registros iniciais.');}}
});
modal.addEventListener('cancel',e=>{e.preventDefault();if(!modal.querySelector('.modal-footer [data-busy]'))closeModal();});
window.addEventListener('hashchange',()=>{route=location.hash.slice(1) in routeLabels?location.hash.slice(1):'overview';filters={search:'',category:'',status:'',period:''};shell();window.scrollTo({top:0});});
window.addEventListener('storage',e=>{if(!LOCAL&&e.key===KEY&&e.newValue){try{const latest=JSON.parse(e.newValue);if(Array.isArray(latest)){records=latest;if(!modal.open)shell();}}catch{}}});
route=location.hash.slice(1) in routeLabels?location.hash.slice(1):'overview';
shell();if(LOCAL)await refreshLocal();if(storageProblem)toast('Não foi possível recuperar os dados locais. Exibindo os exemplos de demonstração.');
