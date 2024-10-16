const db = require('../../../config/db');

const rodape = async (values) => {
    //   Obtem dados da fabrica
    const sqlUnity = `
       SELECT a.*   
       FROM unidade AS a
       WHERE a.unidadeID = ?;
       `
    const [resultUnity] = await db.promise().query(sqlUnity, [values.unidadeID])

    const endereco = {
        logradouro: resultUnity[0]?.logradouro,
        numero: resultUnity[0]?.numero,
        complemento: resultUnity[0]?.complemento,
        bairro: resultUnity[0]?.bairro,
        cidade: resultUnity[0]?.cidade,
        uf: resultUnity[0]?.uf,
    }

    const enderecoCompleto = Object.entries(endereco).map(([key, value]) => {
        if (value) {
            return `${value}, `;
        }
    }).join('').slice(0, -2) + '.'; // Remove a última vírgula e adiciona um ponto final


    let html = values.papelID == 1 ? (
        // Rodapé com dados da unidade (fábrica)
        `<div class="box rodape">
            <p class="textSmall">Este é um e-mail automático, não responda.</p>
            <p style="font-size: 14px;">${resultUnity[0]?.nomeFantasia ?? ''}<br/>
            ${enderecoCompleto ?? ''}</p>
        </div>`
    ) : (
        // Rorapé padrão
        `<div class="box rodape">
        <p class="textSmall">Este é um e-mail automático, não responda.</p>
        <div>
            <p><a  href="https://gedagro.com.br/" class="superSmall">Gedagro - Gerenciamento Eletrônico de Documentos</a><br/>
            Rua Minas Gerais, 533, Sala 206 - 89801-200 - Chapecó - SC</p>
        </div>
    </div>`
    );
    return html;
};

module.exports = rodape;
