# Arquitetura da versão local

## Componentes

```text
Navegador — HTML / CSS / JavaScript
    |
    | HTTP, mesma origem, 127.0.0.1
    v
Servidor Python / FastAPI
    |-- Validação de campos e fotografias
    |-- Revisão e controle de versão
    |-- SQLite: registros, fotografias e histórico
    |
    +-- HTTPS opcional: serviço de classificação
        Chave somente no servidor; autorização por fotografia
```

A interface mantém apenas o estado da tela em memória no modo local. O banco é a fonte persistente dos registros. O antigo modo demonstrativo usa localStorage separadamente e não é importado automaticamente.

## Organização

| Arquivo | Responsabilidade |
| --- | --- |
| run.py | Inicialização local e opção para abrir o navegador |
| backend/app.py | Rotas, persistência, revisão e restrições de acesso local |
| backend/models.py | Contratos dos dados e limites dos campos |
| backend/images.py | Leitura, limite, orientação e conversão das fotografias |
| backend/classifier.py | Integração externa e validação da resposta |
| dist/api.js | Solicitações da interface ao servidor |
| dist/app.js | Telas e fluxo de cadastro/revisão |
| dist/core.js | Categorias, filtros, métricas e exportação |
| dist/runtime.js | Modo demonstrativo; substituído pela API no servidor local |
| data/vialivre.sqlite3 | Persistência local, não distribuída |

## Banco de dados

**records:** id único, dados JSON, fotografia JPEG em BLOB e versão numérica. Os dados incluem categoria atual, sugestão original, descrição, classificação recebida, método, endereço, bairro, coordenadas, data, situação, revisor e histórico. Alterar um registro incrementa a versão; o servidor rejeita alterações com versão antiga.

**analyses:** identificador, resumo SHA-256 da foto normalizada, resultado estruturado e data. O cadastro só aceita uma sugestão associada à mesma foto. Entradas anteriores a um dia são limpas quando uma nova classificação é salva. As fotografias não são armazenadas nesta tabela. O resultado necessário permanece no registro depois do cadastro.

A criação, a revisão e a exclusão são transacionais. A fotografia e o registro são gravados ou removidos juntos. A versão do esquema inicial é 1. SQLite usa WAL; copie a pasta data inteira para backup com o servidor encerrado.

## API

| Método e caminho | Operação |
| --- | --- |
| GET /api/health | Estado do banco e presença da configuração de classificação |
| GET /api/records | Listar os registros locais |
| POST /api/records | Cadastrar como pendente |
| PATCH /api/records/{id} | Revisar categoria, descrição e situação com versão obrigatória |
| DELETE /api/records/{id}?version=N | Excluir registro e foto com controle de versão |
| GET /api/records/{id}/image | Ler a fotografia persistida |
| POST /api/analyze | Classificar uma foto mediante consentimento |
| GET /api/docs | Documentação interativa local |

## Regras principais

1. Fotografias devem ser JPG, PNG ou WebP, até 8 MB e até 20 milhões de pixels para leitura no servidor. O limite de requisição é 12 MB, incluindo a codificação base64.
2. Campos, categorias, coordenadas e descrições são validados novamente no servidor. Arquivos inválidos e URLs remotas não são aceitos como fotografias.
3. Todo cadastro entra como pendente; somente a revisão pode torná-lo validado.
4. A categoria inconclusiva não pode ser validada sem correção humana.
5. Só registros validados aparecem no mapa. Indicadores e exportação são calculados a partir dos registros da interface.
6. Falhas externas não geram resultados fictícios. A fotografia permanece no formulário para revisão manual.
7. O servidor não serve .env, código do backend nem o arquivo do banco. Apenas dist é servido como conteúdo estático.
8. Requisições de alteração oriundas de outro site são bloqueadas. O uso previsto é restrito ao computador local.

## Edição online

backend/database.py oferece armazenamento PostgreSQL, mantendo SQLite no modo local. O esquema privado vialivre é criado por deploy/schema.sql, e a conta do aplicativo tem apenas permissões de leitura e alteração das tabelas. Fotografias continuam no banco para garantir criação e exclusão conjuntas com os registros.

backend/auth.py implementa senhas com scrypt e sal aleatório, sessões revogáveis com tokens aleatórios armazenados apenas como resumos e cookies Secure/HttpOnly/SameSite. A consulta pública mostra registros validados; colaboradores autenticados também veem seus próprios envios; somente revisores podem modificar a revisão ou excluir registros. Contas de colaboradores exigem convite.

As tentativas de login, os cadastros e as análises têm limites persistidos no banco. A classificação online só é habilitada quando ONLINE_ANALYSIS_ENABLED e FREE_TIER_CONFIRMED são true. Esses controles não substituem manter os provedores em planos gratuitos e sem cobrança de excedentes.

Consulte docs/ONLINE.md para configuração e limitações. A hospedagem demonstrativa anterior continua separada. Não há migração automática de fotografias ou registros locais para a nuvem.
