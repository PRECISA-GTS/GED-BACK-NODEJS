const cabecalho = require('../defaults/cabecalho');
const css = require('../defaults/css');
const rodape = require('../defaults/rodape');
require('dotenv/config');
const urlBase = process.env.BASE_URL;

async function layoutNotification(values) {
    let html = `
    <html>`;
    // CSS
    html += css();
    // Body
    html += `
    <body class="body">
        <div class="box">`;
    // Cabeçalho
    html += cabecalho("NOTIFICAÇÃO DO SISTEMA");
    // Conteúdo
    html += `<div class="content">`
    // Stages
    html += `
    <h1 class="title">${values.assunto}</h1>
    <p>${values.descricao}</p>
    <div style="margin-top: 30px;">
        <a href="${urlBase}" target="_blank" class="button" >
            <span style="color: #fff; font-size: 12px; font-weight: normal;">ACESSAR SISTEMA</span>
        </a>    
    </div>
    </div>`;
    // Rodapé
    html += await rodape(values);
    html += `
    </body>
    </html> `;

    return html;
}

module.exports = layoutNotification;
