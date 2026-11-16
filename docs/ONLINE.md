# ViaLivre online — implantação sem plano pago

A versão online usa Render Free para executar a interface e o servidor e Supabase Free para PostgreSQL. As fotografias ficam no mesmo banco, em um esquema privado chamado vialivre. O aplicativo acessa esse esquema por uma conta limitada às tabelas do projeto; o navegador não recebe a senha do banco.

## Site publicado

- Endereço: https://gs-vialivre.onrender.com
- Painel do servidor: https://dashboard.render.com/web/srv-dbt5tmm1egvs73fgsv90
- Painel do banco: https://supabase.com/dashboard/project/jmnywhglkuzeoqprnkkz
- Consulta pública sem login; use **Entrar** para acessar a conta de revisor.
- O usuário está em `ADMIN_USERNAME` e a senha em `ADMIN_PASSWORD`, no arquivo local `.env.deploy`. O código para convidar colaboradores está em `REGISTRATION_CODE`. Compartilhe apenas o convite com os colaboradores, nunca o arquivo inteiro.

O serviço foi criado diretamente no Render, no plano Free. A configuração ativa fica no painel; `render.yaml` é um modelo de implantação, não um Blueprint vinculado a esse serviço. A publicação inicial foi verificada em 15/11/2026, com conexão ao PostgreSQL, login, sessão protegida e logout. A chave de classificação está configurada; uma nova chamada ao provedor a partir do servidor hospedado ainda não foi testada.

## Limites da edição

- Consulta pública de ocorrências validadas.
- Colaboradores criam contas usando um código de convite e podem enviar ocorrências e consultar seus próprios registros pendentes.
- Somente o revisor valida, rejeita, reabre ou exclui registros.
- Máximo de 50 contas, 500 ocorrências e 100 MB de fotografias armazenadas.
- Fotografias normalizadas de até 500 KB; arquivos originais de até 8 MB passam pela redução da interface.
- Até 10 cadastros por conta por dia, 5 análises por conta por dia e 20 análises por dia no site inteiro. Falhas também consomem essas tentativas, evitando repetição ilimitada de chamadas.
- Sessão de 8 horas; novo login encerra a sessão anterior da mesma conta.
- Recuperação de senha por e-mail ainda não implementada. A senha do revisor é administrada nas variáveis protegidas do servidor.

Esses limites ajudam a conter uso, mas não substituem a configuração gratuita dos provedores. Não habilite faturamento, não adicione recursos pagos e não configure tarefas para impedir a suspensão automática do Render.

## Configuração no Render

Use o repositório https://github.com/MakotoMano/gs-vialivre, branch main, runtime Python e plano Free. O arquivo render.yaml documenta os comandos. Não crie um banco Render para este projeto: o armazenamento persistente será no Supabase.

Variáveis protegidas:

| Nome | Valor |
| --- | --- |
| VIALIVRE_MODE | online |
| DATABASE_URL | Conexão Session pooler do Supabase usando a conta vialivre_app |
| ADMIN_USERNAME | Nome da conta de revisor |
| ADMIN_PASSWORD | Senha exclusiva de pelo menos 12 caracteres |
| REGISTRATION_CODE | Código compartilhado apenas com colaboradores convidados |
| GEMINI_API_KEY | Chave do projeto confirmado no plano gratuito |
| GEMINI_MODEL | Modelo disponível no plano gratuito da conta |
| ONLINE_ANALYSIS_ENABLED | true somente quando a classificação estiver autorizada |
| FREE_TIER_CONFIRMED | true somente após confirmar ausência de faturamento na conta da chave |
| PYTHON_VERSION | 3.14.0 |

O nome de host do Render é reconhecido pela variável RENDER_EXTERNAL_HOSTNAME. Para outro domínio, configure ALLOWED_HOSTS com os nomes separados por vírgula, sem curingas. Cookies de acesso exigem HTTPS.

## Banco

Aplique deploy/schema.sql em um projeto vazio após provisionar a conta vialivre_app com uma senha exclusiva. O código de execução não cria tabelas em produção. A conexão usa TLS, Session pooler, até quatro conexões e o esquema privado vialivre. Não exponha esse esquema pela Data API.

A senha do banco, a senha do revisor e o convite gerados durante a implantação ficam em .env.deploy no computador do responsável. Esse arquivo é ignorado pelo Git. Nunca publique esse arquivo, .env ou uma URL de conexão com senha.

Os registros da versão local não são copiados automaticamente para o site. Fotos e dados locais podem conter informações pessoais e devem ser revisados antes de qualquer migração.

## Operação gratuita

O Render Free suspende o processo após inatividade e pode levar cerca de um minuto para abrir novamente. Isso não apaga os registros no Supabase. O Supabase Free pode pausar projetos após uma semana sem atividade. Os limites mensais dos provedores e a disponibilidade dos planos continuam se aplicando. Se o limite gratuito for atingido, aceite a suspensão ou aguarde a renovação; não faça upgrade automático.

A conta Render pode ter outros aplicativos que compartilham franquias. Verifique o uso total e mantenha o limite de gastos em zero onde disponível. Em uma conta sem método de pagamento, o Render suspende o serviço ao esgotar determinadas franquias em vez de cobrar excedentes.

Referências: [Render Free](https://render.com/docs/free), [Supabase Free](https://supabase.com/pricing), [conexão PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres), [classificação no plano gratuito](https://aistudio.google.com/docs/pricing).
