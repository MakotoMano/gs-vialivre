# ViaLivre — MVP acadêmico

Plataforma de monitoramento da acessibilidade urbana — CitizenTech / FIAP.

**Acessar online:** https://gs-vialivre.onrender.com — não é necessário manter o computador ligado. A consulta é pública; o envio exige uma conta por convite e a revisão exige a conta de revisor. No plano gratuito, a primeira abertura após inatividade pode levar cerca de um minuto.

O projeto pode ser executado localmente ou hospedado com servidor Python no Render Free e banco PostgreSQL no Supabase Free. Consulte [implantação online](docs/ONLINE.md) para contas, permissões, configuração e limites. A versão online usa HTTPS, login e cadastro de colaboradores por convite.

## Abrir no Windows

As dependências já estão instaladas neste computador. Dê dois cliques em **Iniciar_ViaLivre.cmd**. Mantenha a janela aberta durante o uso; o navegador abrirá em http://127.0.0.1:8000. Para encerrar, pressione Ctrl+C na janela do servidor.

Em outro computador, instale Python 3.14 e execute **Instalar_ViaLivre.cmd** uma vez antes de iniciar. A instalação precisa de internet. O projeto foi validado com Python 3.14 no Windows.

Também é possível executar no terminal:

```powershell
.\.venv\Scripts\python.exe run.py
```

Se a porta estiver ocupada, use `run.py --port 8002` e abra http://127.0.0.1:8002.

## O que funciona

- Cadastro de fotografia JPG, PNG ou WebP, com referência, bairro e coordenadas editáveis.
- Servidor Python/FastAPI, banco SQLite e fotografias persistentes no computador.
- Classificação manual e integração opcional de classificação por fotografia.
- Conferência antes de cadastrar, fila de revisão, validação, rejeição e reabertura.
- Histórico com os valores anteriores, preservação da sugestão recebida e controle de versões para evitar sobrescritas entre janelas.
- Mapa Leaflet/OpenStreetMap com apenas ocorrências validadas, filtros, indicadores e exportação agregada CSV.
- Exclusão do registro e de sua fotografia mediante confirmação.
- Interface responsiva e mensagens de falha sem simular uma classificação bem-sucedida.

O banco começa vazio. Os dados ficam em **data/vialivre.sqlite3**, incluindo as fotografias. Fechar ou limpar o navegador não apaga os registros desta versão.

## Ativar a classificação de fotografias

1. Obtenha uma chave no [painel do serviço](https://aistudio.google.com/apikey).
2. Copie `.env.example` para `.env` na raiz do projeto.
3. Abra `.env` em um editor local e preencha `GEMINI_API_KEY`. Nunca envie a chave pelo chat, inclua em capturas ou distribua esse arquivo.
4. O modelo fica em `GEMINI_MODEL`; confirme que ele está disponível para sua conta.
5. Reinicie o servidor. No formulário, autorize o envio da fotografia e clique em **Classificar fotografia**.
6. Confira a categoria e a descrição antes de enviar para revisão.

Sem chave, o botão de classificação externa fica desabilitado; **Classificar manualmente** continua funcionando. Uma chave preenchida indica configuração, não garante acesso, cota ou funcionamento do serviço. Falhas de credencial, conexão, limite e resposta inválida são informadas ao usuário.

**A análise real foi confirmada em testes manuais pelo responsável pelo projeto**, incluindo o fluxo de revisão e exibição no mapa. Os testes automatizados exercitam o contrato e as falhas com respostas controladas, sem enviar fotografias a um provedor. Ainda não há resultado de acurácia medido em um conjunto documentado de imagens.

## Tecnologia e funcionamento

A interface usa HTML, CSS e JavaScript, sem compilação. Ela envia solicitações ao FastAPI, que valida os campos, normaliza as fotos e grava tudo no SQLite. O servidor controla identificadores, situação, histórico e versões. O navegador não pode cadastrar um registro diretamente como validado.

A integração de fotografia é chamada somente pelo servidor, via HTTPS, com saída estruturada em categoria e descrição. A chave nunca é entregue ao navegador. O resultado recebido fica vinculado à fotografia e precisa de conferência humana. Não há processamento remoto durante o cadastro manual.

SQLite atende à execução local. A versão publicada usa PostgreSQL no Supabase para preservar registros e fotografias entre reinicializações do servidor. Consulte [arquitetura](docs/ARQUITETURA.md) e [roteiro de apresentação](docs/ROTEIRO.md).

## Testes

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_api.py tests/test_online.py -q
node --test tests/core.test.js
```

O teste de navegador em `tests/browser-local.mjs` requer Playwright instalado separadamente e servidor na porta 8001, ou a variável `TEST_URL`. `PLAYWRIGHT_MODULE` permite indicar a instalação de Playwright. As imagens `tests/local-desktop.png` e `tests/local-mobile.png` são evidências de interface com dados de teste, não registros urbanos reais.

## Dados e limites

O modo **local** é de um único operador, sem exigir contas. O modo **online** possui contas individuais de colaboradores e uma conta de revisor. O servidor inicia vinculado a 127.0.0.1. Para publicar, use VIALIVRE_MODE=online e a configuração descrita em docs/ONLINE.md; não exponha o modo local como serviço público.

As fotos são reduzidas no navegador, verificadas novamente no servidor e convertidas para JPEG sem preservar os metadados originais. Endereço e coordenadas são informados pelo usuário. Não há geocodificação, reconhecimento de identidade ou certificação de acessibilidade. Evite fotografar rostos, placas e documentos; escolha imagens adequadas para a apresentação.

O mapa base e as fontes dependem de internet. A lista, o cadastro manual e a revisão funcionam com o servidor local mesmo sem mapa. Não há envio à prefeitura nem recomendação de rotas seguras. Uma ocorrência validada significa revisão pelo operador, não vistoria técnica.

Para backup, encerre o servidor e copie a pasta **data** inteira. Ela pode conter fotografias e informações de localização; não a inclua em uma distribuição pública. Para restaurar, mantenha o servidor parado e recoloque sua cópia da pasta data.

## Protótipo anterior

`Abrir_ViaLivre.html` é a demonstração anterior, com 24 registros fictícios e dados no navegador. `npm run demo` inicia essa experiência em arquivos separados na porta 4173. Ela não utiliza o banco do MVP. A versão publicada anteriormente no endereço de demonstração continua sendo demonstrativa. A implantação Render/Supabase é independente e utiliza a edição online documentada neste repositório.

## Referências técnicas

- [FastAPI](https://fastapi.tiangolo.com/): API e validação.
- [SQLite](https://www.sqlite.org/): banco local transacional.
- [Integração de fotografias](https://aistudio.google.com/docs/image-understanding) e [resposta estruturada](https://aistudio.google.com/docs/structured-output).
- [Estrutura de interações](https://aistudio.google.com/docs/interactions-overview).
- [Leaflet](https://leafletjs.com/), licença em dist/vendor/LEAFLET-LICENSE.txt.
- [OpenStreetMap contributors](https://www.openstreetmap.org/copyright).
