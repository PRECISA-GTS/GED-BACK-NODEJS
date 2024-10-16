const cabecalho = (titulo) => {
    let html = `
    <div class="cabecalho">
        <img src="https://gedagro.com.br/images/logoBranca.png" alt="GED - Gestão Eletrônica de Documentos" class="logo">
        <h6 class="titulo">
            <strong>${titulo}</strong>
        </h6>
    </div>`;
    return html;
};

module.exports = cabecalho;