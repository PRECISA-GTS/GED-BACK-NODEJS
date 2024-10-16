const cabecalho = require('../defaults/cabecalho');
const css = require('../defaults/css');
const rodape = require('../defaults/rodape');
require('dotenv/config');
const urlBase = process.env.BASE_URL;


async function instructionsExistFornecedor(values) {
    // link login e registro enviando cnpj e unidade como parâmetros
    const linkLogin = `${urlBase}/fornecedor/?f=${values.fornecedorID}`;

    let html = `
    <html>`;
    // CSS
    html += css();
    // Body
    html += `
    <body class="body">
        <div class="box">`;
    // Cabeçalho
    html += cabecalho("Avaliação do fornecedor");
    // Conteúdo
    html += `
    <div class="content">`
    // Stages
    html += `
    <div class="boxBorderOff">
        <img style="width: 100%" src="https://gedagro.com.br/images/ged/email/fornecedor/${values.stage}.jpg" />
    </div>
        <p><strong>Olá, ${values.nomeFantasia}!</strong></p>`;
    html += `
                    <div>
                        <p>A ${values.nomeFantasiaFabrica} possui como norma de PBF a avaliação de seus fornecedores quanto a matérias-prima e ingredientes.</p>
                        <p>Solicitamos para este fim o preenchimento deste formulário:</p>
                    </div>
                    <div style="margin-top: 10px;">
                    <table>
                        <tr>
                            <td>ID:</td>
                            <td>${values.fornecedorID}</td>
                        </tr>
                        <tr>
                            <td>Fábrica:</td>
                            <td>${values.nomeFantasiaFabrica}</td>
                        </tr>
                        <tr>
                            <td>CNPJ:</td>
                            <td>${values.cnpjFabrica}</td>
                        </tr>
                        <tr>
                            <td>Data - Hora:</td>
                            <td>${values.dataInicio}</td>
                        </tr>
                        <tr>
                            <td>Profissional:</td>
                            <td>${values.nomeProfissional}</td>
                        </tr>
                        <tr>
                            <td>Acessar formulário:</td>
                            <td>${values.link}</td>
                        </tr>
                    </table>
                </div>
                
                    
                    <div>
                        <p>Atenciosamente, <br/>
                            ${values.nomeProfissional} <br/>
                            ${values.cargoProfissional} <br/>
                        </p>
                    </div>
                </div>
            </div>`;
    // Rodapé
    html += await rodape(values);
    html += `
        </body>
    </html>`;

    return html;
}

module.exports = instructionsExistFornecedor;
