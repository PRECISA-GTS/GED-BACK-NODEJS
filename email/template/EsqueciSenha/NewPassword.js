const cabecalho = require('../defaults/cabecalho');
const css = require('../defaults/css');
const rodape = require('../defaults/rodape');
require('dotenv/config');
const link = process.env.BASE_URL;

async function NewPassword(values) {
    let html = `
    <html>`;
    // CSS
    html += css();
    html += `
        <body class="body">
            <div class="box">`;
    // Cabeçalho
    html += cabecalho("REDEFINIR SENHA");
    // Conteúdo
    html += `
                <div class="content">
                    <h1 class="title">Olá ${values.nome},</h1>
                    <p>Recebemos uma solicitação para redefinir a senha da sua conta. Para prosseguir com a redefinição, siga as instruções abaixo:</p>
                    <p>Clique no link abaixo para acessar a página de redefinição de senha: </p>
                    <p><a class="link" href="${link}redefinir-senha?userId=${values.usuarioID}&type=${values.type}">Redefinir senha</a></p>
                    <p>Na página de redefinição de senha, você será solicitado a fornecer uma nova senha.</p>
                    <p>Caso você não tenha solicitado a redefinição de senha, recomendamos que você tome as seguintes medidas imediatamente:</p>
                    <ul>
                        <li>Verifique se a sua conta está protegida com uma senha forte e exclusiva.</li>
                        <li>Não compartilhe sua senha com ninguém.</li>
                        <li>Mantenha seus dispositivos e contas seguros, atualizando-os regularmente e evitando acesso não autorizado.</li>
                        </ul>
                    <p>Se você tiver alguma dúvida ou precisar de assistência adicional, entre em contato com o nosso suporte ao cliente.</p>
                    <p>Atenciosamente, <br/> 
                    Equipe GEDagro.
                    </p>
                </div>
            </div>`;
    // Rodapé
    html += await rodape(values);
    html += `
        </body>
    </html>
    `;
    return html;
}

module.exports = NewPassword;
