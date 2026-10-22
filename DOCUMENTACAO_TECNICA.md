# Documentação Técnica — Monitoramento de Roteador via SNMP

## 1. Arquitetura do sistema

O sistema foi desenvolvido em Node.js e possui uma interface web para acompanhar as informações do roteador.

O servidor utiliza o Express para receber as solicitações da interface e organizar a coleta de dados. O módulo SNMP consulta o roteador, enquanto os módulos de métricas, histórico e alertas processam e armazenam as informações.

A interface apresenta gráficos de tráfego de entrada, tráfego de saída e uso da CPU. Também permite iniciar ou pausar a coleta e configurar os limites para os alertas.

## 2. Bibliotecas utilizadas

- **Express:** cria o servidor e as rotas da aplicação.
- **net-snmp:** permite consultar as informações do roteador por SNMP.
- **Chart.js:** cria os gráficos de tráfego e uso da CPU.
- **Nodemailer:** envia alertas por e-mail.
- **dotenv:** carrega as configurações e credenciais armazenadas no arquivo `.env`.

## 3. MIBs e OIDs

O sistema utiliza a IF-MIB para consultar as interfaces de rede e os contadores de tráfego.

Os principais OIDs utilizados são:

- **ifDescr — `1.3.6.1.2.1.2.2.1.2`:** identifica as interfaces de rede.
- **ifHCInOctets — `1.3.6.1.2.1.31.1.1.1.6`:** informa a quantidade de bytes recebidos.
- **ifHCOutOctets — `1.3.6.1.2.1.31.1.1.1.10`:** informa a quantidade de bytes transmitidos.
- **ifInOctets — `1.3.6.1.2.1.2.2.1.10`:** contador de entrada alternativo, de 32 bits.
- **ifOutOctets — `1.3.6.1.2.1.2.2.1.16`:** contador de saída alternativo, de 32 bits.
- **hrProcessorLoad — `1.3.6.1.2.1.25.3.3.1.2`:** informa a utilização da CPU, quando o equipamento suporta essa MIB.

O sistema prioriza os contadores de 64 bits e utiliza os de 32 bits quando os primeiros não estão disponíveis. O OID da CPU pode precisar ser ajustado conforme o suporte do roteador.

## 4. Cálculo do tráfego em bps

O SNMP fornece contadores acumulados em bytes. Para calcular a velocidade do tráfego, o sistema compara duas leituras da mesma interface e considera o tempo real entre elas.

A fórmula utilizada é:

**Tráfego (bps) = (bytes atuais − bytes anteriores) × 8 ÷ tempo em segundos**

O resultado é apresentado em bits por segundo (bps), separadamente para entrada e saída.

Na primeira leitura, o sistema apenas registra o valor inicial. Se o contador diminuir ou ocorrer uma alteração na interface ou na configuração do roteador, a referência é atualizada para evitar cálculos incorretos.

## 5. Estratégia de alertas

O sistema permite configurar limites para o tráfego de entrada, o tráfego de saída e o uso da CPU. Cada limite funciona de forma independente.

Quando uma métrica ultrapassa o limite configurado, o sistema gera um alerta por pop-up na interface e pode enviar uma notificação por e-mail, conforme as opções habilitadas.

Para evitar notificações repetidas, o sistema envia um alerta na primeira ultrapassagem do limite. Um novo alerta só é permitido depois que o valor retorna ao limite ou abaixo dele e volta a ultrapassá-lo.
É possível também alterar o tempo de coleta para comparar com o threshold, o que evitaria mensagens repetidas em curto prazo.

As configurações de e-mail ficam no arquivo `.env`, mantendo as credenciais fora do código do projeto. Se ocorrer uma falha na coleta SNMP ou no envio do e-mail, o erro é registrado para consulta, sem encerrar o servidor.