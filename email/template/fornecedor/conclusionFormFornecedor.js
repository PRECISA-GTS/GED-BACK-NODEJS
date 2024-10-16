const cabecalho = require('../defaults/cabecalho');
const css = require('../defaults/css');
const rodape = require('../defaults/rodape');
require('dotenv/config');
const urlBase = process.env.BASE_URL;

async function conclusionFormFornecedor(data) {

    let html = `
    <html>`;
    // CSS
    html += css();
    // Body
    html += `
    <body class="body">
        <div class="box">`;
    // Cabeçalho
    html += cabecalho("FORNECEDOR ENVIOU FORMULÁRIO");
    // Conteúdo
    html += `
        <div class="content">
            <h1 class="title">Olá, ${data.fabrica.razaoSocial} </h1>
            <p>O fornecedor ${data.fornecedor.razaoSocial} com CNPJ Nº ${data.fornecedor.cnpj} concluiu o preenchimento do formulário Nº ${data.fornecedor.fornecedorID}</p>
            <p>Agora o mesmo está disponível para a sua avaliação.</p>
            <p><a class="link" href="${urlBase}formularios/fornecedor/">Acessar o sistema</a></p>
            <p>Atenciosamente, <br/> 
            Equipe GEDagro.
            </p>
        </div>
    </div>`;
    // Rodapé
    html += await rodape(values);
    html += `
        </body>
    </html>`;

    return html;
}

module.exports = conclusionFormFornecedor;
