const cabecalho = require("../../defaults/cabecalho");
const css = require("../../defaults/css");
const rodape = require("../../defaults/rodape");

async function fornecedorPreenche(values) {
    let html = `
    <html>`;
    // CSS
    html += css();
    html += `
        <body class="body">
            <div class="box">`;
    // Cabeçalho
    html += cabecalho("PREENCHIMENTO DE NÃO CONFORMIDADE");
    // Conteúdo
    html += `
                <div class="content">
                    <p><strong>Olá, ${values.nomeFantasia}!</strong></p>
                    <p>A ${values.nomeFantasiaFabrica} solicita o preenchimento da não conformidade.</p>`;

    if (values.products) {
        html += `
                    <div>
                        <p>${values.products.length > 1 ? 'Produtos:' : 'Produto:'}
                            ${values.products.map(product => `<span>${product}</span>`).join(', ')}.
                        </p>
                    </div>`;
    }

    html += `
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
    </html>
    `;
    return html;
}

module.exports = fornecedorPreenche;
