const cabecalho = require('../defaults/cabecalho');
const css = require('../defaults/css');
const rodape = require('../defaults/rodape');
require('dotenv/config');
const urlBase = process.env.BASE_URL;


async function newUser(values) {

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
      <p>Foi criado um Login de Acesso ao sistema GEDagro na ${values.nomeFantasiaFabrica}.</p>
      <p>Você pode acessar o sistema através do endereço <a href="${urlBase}login">${urlBase}login</a> </p>
      <div style="margin-top: 10px;">
      <p>Usuário  <br/><strong>${values.cpf}</strong></p>
      <p>Senha  <br/><strong>${values.senha}</strong></p>
      <div>
        <p style="color: red; font-size: 14px">Atenção!  Esta é uma senha gerada automaticamente pelo sistema. Para sua segurança lembre de alterá-la no menu <strong>Meus Dados</strong>.
        </p>
    </div>
    <div>
    <p>Atenciosamente, <br/>
        ${values.nomeProfissional} <br/>
        ${values.cargoProfissional} <br/>
    </p>
    </div>
  </div>
      
      `

    // Rodapé
    html += await rodape(values);
    html += `
        </body>
    </html>`;

    return html;
}

module.exports = newUser;
