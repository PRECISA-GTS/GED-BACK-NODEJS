const cabecalho = require('../defaults/cabecalho');
const css = require('../defaults/css');
const rodape = require('../defaults/rodape');
require('dotenv/config');
const urlBase = process.env.BASE_URL;


async function alterPassword(values) {
    const rotaDirect = values.papelID == 1 ? `${urlBase}esqueceu-sua-senha?type=login` : `${urlBase}esqueceu-sua-senha?type=fornecedor`

    let html = `
    <html>`;
    // CSS
    html += css();
    // Body
    html += `
    <body class="body">
        <div class="box">`;
    // Cabeçalho
    html += cabecalho("Senha alterada com sucesso!");
    // Conteúdo
    html += `
    <div class="content">
      <h1 class="title">Olá, ${values.nome} </h1>
      <p>Caso você não tenha realizado a alteração da senha, recomendamos redefinir a senha clicando <a href="${rotaDirect}">aqui</a></p>
      <div>
        <p>Atenção: </p>
        <ul>
          <li>Verifique se a sua conta está protegida com uma senha forte e exclusiva.</li>
          <li>Não compartilhe sua senha com ninguém.</li>
          <li>Mantenha seus dispositivos e contas seguros, atualizando-os regularmente e evitando acesso não autorizado.</li>
        </ul>
      </div>
      <p>Em caso de dúvida, entre em contato com o suporte técnico.</p>
      <div style="margin-top: 10px;">
                    <p>
                      Atenciosamente, <br/>
                      Equipe GEDagro <br/>
                      suporte@precisatecnologia.com.br <br/>
                      (49) 3322-8044 <br/>
                    </p>
                </div>
    </div>`

    // Rodapé
    html += await rodape(values);
    html += `
        </body>
    </html>`;

    return html;
}

module.exports = alterPassword;
