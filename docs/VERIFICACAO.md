# Verificação da entrega local

Data: 15/11/2026.

- 15 testes automatizados da API: persistência entre instâncias do servidor, foto decodificada, validação, revisão, conflito de edição, exclusão conjunta, ausência de chave, autorização de envio, origem de solicitações e associação da sugestão à foto.
- Contrato da integração: respostas estruturadas e falhas são testadas com transporte controlado. Esses testes não usam o serviço externo e não medem acurácia.
- Regras da interface: 6 testes de filtros, revisão, validação, métricas e exportação.
- Navegador: cadastro com arquivo, revisão, mapa, recarregamento, exclusão e layout em 390 e 1440 pixels, sem erros de execução observados. Também foram verificados o consentimento de envio, a preservação da fotografia após falha controlada do serviço e a recuperação após indisponibilidade do servidor.

Testes manuais: o responsável pelo projeto confirmou o funcionamento da análise real, da revisão e da exibição no mapa. Essa confirmação não constitui uma medição de acurácia. Ainda falta documentar um conjunto de fotografias e seus resultados para avaliação quantitativa. Não há hospedagem desta versão local, contas de usuários ou aferição de conformidade normativa.
