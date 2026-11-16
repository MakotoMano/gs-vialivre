# Verificação da entrega

Data: 15/11/2026.

- 15 testes automatizados da API: persistência entre instâncias do servidor, foto decodificada, validação, revisão, conflito de edição, exclusão conjunta, ausência de chave, autorização de envio, origem de solicitações e associação da sugestão à foto.
- Contrato da integração: respostas estruturadas e falhas são testadas com transporte controlado. Esses testes não usam o serviço externo e não medem acurácia.
- Regras da interface: 6 testes de filtros, revisão, validação, métricas e exportação.
- Navegador: cadastro com arquivo, revisão, mapa, recarregamento, exclusão e layout em 390 e 1440 pixels, sem erros de execução observados. Também foram verificados o consentimento de envio, a preservação da fotografia após falha controlada do serviço e a recuperação após indisponibilidade do servidor.

Testes manuais: o responsável pelo projeto confirmou o funcionamento da análise real, da revisão e da exibição no mapa. Essa confirmação não constitui uma medição de acurácia. Ainda falta documentar um conjunto de fotografias e seus resultados para avaliação quantitativa. Não há hospedagem desta versão local, contas de usuários ou aferição de conformidade normativa.

## Preparação da edição online

- 23 testes da API: 15 de regras existentes e 8 de contas, sessões, permissões, privacidade, cotas e bloqueios de configuração inadequada.
- 6 testes de regras da interface.
- Navegador: cadastro por convite, autenticação, envio privado, revisão autorizada, consulta pública e layout de celular.
- PostgreSQL remoto: conexão TLS pelo Session pooler, permissões da conta limitada, inserção, leitura, atualização e rollback verificados sem deixar dados de teste.

## Publicação verificada

- Endereço: https://gs-vialivre.onrender.com, plano Render Free, banco Supabase Free.
- Implantação `dep-dbt5tn61egvs73fgt0ag`, commit `a7e1884`, concluída com estado `live` em 15/11/2026 (horário de São Paulo).
- Página inicial e `/api/health` responderam com sucesso; modo online, armazenamento PostgreSQL e classificação configurada.
- Consulta pública, bloqueio de alteração sem login, autenticação do revisor, sessão com cookie Secure/HttpOnly/SameSite, bloqueio de origem externa e logout verificados no endereço publicado.
- Nenhuma ocorrência criada ou alterada por essa verificação.
- Navegador separado no endereço publicado: interface pública, formulário de login, ausência de controles de revisão para visitante e largura de 390 pixels sem transbordamento ou erros JavaScript.
- A classificação externa foi confirmada anteriormente pelo responsável na versão local. A configuração está presente no servidor publicado, mas uma chamada real a partir dele ainda não foi exercitada.
