# Sistema de Monitoramento de Roteador via SNMP

Este projeto foi desenvolvido para a disciplina de Projeto e Administração de Redes. O sistema consulta um roteador por SNMP, acompanha o tráfego de entrada e saída e o uso da CPU, mostra gráficos em tempo real e histórico e gera alertas quando os limites configurados são ultrapassados.

## 1. Pré-requisitos

Antes de executar o projeto, é necessário ter:

- Node.js versão 20.19 ou superior.
- npm, instalado junto com o Node.js.
- Um roteador acessível pela rede com SNMP habilitado.
- Uma interface de rede disponível para monitoramento.
- Um navegador web.
- Para testar alertas por e-mail, uma conta ou servidor SMTP configurado.

O sistema pode ser executado no Windows ou Linux.

## 2. Instalação e execução

### Windows

Abra o PowerShell dentro da pasta do projeto e execute os comandos abaixo.

**1. Verifique se o Node.js e o npm estão instalados:**

```powershell
node --version
npm --version
```

**2. Instale as dependências:**

```powershell
npm install
```

**3. Crie o arquivo de configuração do e-mail:**

```powershell
Copy-Item .env.example .env
```

Se for testar o envio de e-mails, abra o arquivo `.env` e preencha os dados SMTP. Caso contrário, deixe o envio de e-mail desativado na aplicação.

**4. Inicie o sistema:**

```powershell
npm start
```

**5. Abra o navegador no endereço:**

http://127.0.0.1:3000

Para encerrar o sistema, volte ao terminal e pressione `Ctrl+C`.

### Linux

Primeiro, instale o Node.js na versão 20.19 ou superior e o npm. Utilize uma versão compatível com a distribuição Linux e confirme a instalação antes de continuar.

Abra o terminal na pasta do projeto.

**1. Verifique as versões instaladas:**

```bash
node --version
npm --version
```

**2. Instale as dependências:**

```bash
npm install
```

**3. Crie o arquivo de configuração:**

```bash
cp .env.example .env
```

Se quiser testar os alertas por e-mail, edite o arquivo `.env` e informe os dados SMTP. Se não for usar e-mail, deixe essa opção desativada na aplicação.

**4. Inicie o sistema:**

```bash
npm start
```

**5. Abra o navegador no endereço:**

http://127.0.0.1:3000

Para encerrar, pressione `Ctrl+C` no terminal.

Não é necessário executar o servidor como administrador ou root para usar a aplicação normalmente.

## 3. Configuração do roteador e do SNMP

O roteador precisa estar acessível a partir do computador que executa o sistema.

No roteador, habilite o SNMP e configure uma comunidade ou usuário com permissão de leitura. Sempre que possível, prefira SNMPv3. Em um laboratório com SNMPv1 ou SNMPv2c, utilize uma comunidade de leitura restrita ao computador de monitoramento.

No MikroTik, confira se o serviço SNMP está habilitado e se o acesso está permitido para o endereço do computador que executa o projeto.

Depois de iniciar a aplicação:

1. Abra a aba **Configuração**.
2. Informe o endereço IP do roteador.
3. Selecione a versão SNMP e informe a porta, normalmente `161`, e o timeout.
4. Para SNMPv1/v2c, informe a comunidade de leitura. Para SNMPv3, preencha os dados de autenticação exigidos.
5. Clique em **Buscar interfaces via SNMP** e escolha a interface que será monitorada.
6. Confira o OID de CPU. O padrão é `1.3.6.1.2.1.25.3.3.1.2`, mas alguns roteadores não oferecem esse objeto. Se necessário, utilize o OID compatível com o equipamento.
7. Defina o intervalo de coleta e os limites de tráfego de entrada, saída e CPU.
8. Selecione os tipos de alerta desejados.
9. Se utilizar e-mail, informe o destinatário e configure o SMTP no arquivo `.env`.
10. Clique em **Salvar configuração**.

A configuração salva fica em `data/config.json`. As amostras e os eventos também são armazenados na pasta `data/`, permitindo consultar o histórico depois de reiniciar a aplicação.

A interface web fica disponível somente no próprio computador, em `127.0.0.1:3000`.

## 4. Configuração do e-mail

Para enviar alertas por e-mail, preencha no arquivo `.env` as variáveis abaixo com os dados do serviço SMTP utilizado:

```env
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

Use os valores fornecidos pelo seu serviço de e-mail. Alguns serviços exigem uma senha de aplicativo em vez da senha normal da conta.

Depois de alterar o `.env`, reinicie o servidor para carregar as configurações.

Não compartilhe esse arquivo nem envie senhas para o repositório Git.

## 5. Como usar o sistema

### Monitoramento em tempo real

Na tela principal, clique em **Iniciar** para começar a coleta. Os gráficos mostram o tráfego de entrada e saída em bps e o uso da CPU em porcentagem.

O botão **Pausar** interrompe a coleta temporariamente. O botão **Resetar visualização** limpa os dados mostrados no gráfico em tempo real, sem apagar o histórico salvo.

Na primeira leitura, o sistema registra os contadores de tráfego como referência. A taxa em bps aparece após uma leitura válida seguinte.

### Histórico

1. Abra a aba **Histórico**.
2. Informe a data e a hora inicial e final.
3. Clique em **Aplicar período**.
4. Confira os gráficos e as amostras do intervalo escolhido.

O histórico fica salvo em `data/amostras.jsonl` e continua disponível após reiniciar a aplicação.

### Alertas

Configure os limites de entrada, saída e CPU na tela de configuração. Quando uma métrica ultrapassa o limite, o sistema pode mostrar um pop-up e enviar um e-mail, conforme as opções habilitadas.

Para evitar notificações repetidas, um novo alerta para a mesma métrica só é gerado depois que ela retorna ao limite ou abaixo dele e volta a ultrapassá-lo.

Os eventos e as falhas ficam registrados em `data/eventos.jsonl`.

## 6. Como testar a aplicação

Faça os testes com o roteador acessível e uma configuração válida.

| Teste | Como fazer | Resultado esperado |
|---|---|---|
| Coleta SNMP | Configure o roteador e clique em **Iniciar**. | Os dados disponíveis são coletados e os gráficos são atualizados. |
| Controles | Clique em **Iniciar**, **Pausar**, **Iniciar** novamente e **Resetar visualização**. | Os controles funcionam sem duplicar a coleta nem apagar o histórico. |
| Histórico | Selecione um período que contenha amostras. | São mostrados os dados daquele intervalo. |
| Alerta pop-up | Habilite o pop-up e configure um limite abaixo do valor observado. | O sistema mostra um alerta com a métrica, o valor, o limite e o horário. |
| Alerta por e-mail | Configure o SMTP, o destinatário e habilite o envio. | O e-mail é enviado quando ocorre uma ultrapassagem, ou a falha é informada. |
| Falha SNMP | Em ambiente de teste, interrompa a conexão ou utilize temporariamente dados SNMP inválidos. | O erro é informado e o servidor continua funcionando. |
| Persistência | Faça algumas coletas, encerre o servidor e inicie-o novamente. | As amostras anteriores continuam disponíveis no histórico. |

Para testar um alerta de CPU, configure temporariamente um limite baixo, como `1%`. O alerta só aparecerá se a leitura válida da CPU ultrapassar esse valor. Se o roteador informar `0%`, o teste não provocará o alerta.

### Executar os testes automatizados

Os testes locais não exigem um roteador conectado.

No Windows ou Linux, execute:

```bash
npm test
```

Os testes verificam os cálculos de tráfego, o tratamento de contadores e a validação das configurações.

## 7. Documentação complementar

O arquivo `DOCUMENTACAO_TECNICA.md` apresenta a arquitetura do sistema, as bibliotecas utilizadas, as MIBs/OIDs, o cálculo do tráfego em bps e a estratégia de alertas.