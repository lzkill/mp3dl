const form = document.getElementById('downloadForm');
const videoUrlInput = document.getElementById('videoUrl');
const qualitySelect = document.getElementById('quality');
const downloadBtn = document.getElementById('downloadBtn');
const btnText = document.querySelector('.btn-text');
const spinner = document.querySelector('.spinner');
const videoInfo = document.getElementById('videoInfo');
const errorMessage = document.getElementById('errorMessage');
const successMessage = document.getElementById('successMessage');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');

// Elementos de informação do vídeo
const thumbnail = document.getElementById('thumbnail');
const title = document.getElementById('title');
const uploader = document.getElementById('uploader');
const duration = document.getElementById('duration');

// Gerar ID de sessão único
function generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Função para formatar duração em segundos para MM:SS
function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Função para mostrar mensagem de erro
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
    successMessage.classList.add('hidden');
    setTimeout(() => {
        errorMessage.classList.add('hidden');
    }, 5000);
}

// Função para mostrar mensagem de sucesso
function showSuccess(message) {
    successMessage.textContent = message;
    successMessage.classList.remove('hidden');
    errorMessage.classList.add('hidden');
    setTimeout(() => {
        successMessage.classList.add('hidden');
    }, 5000);
}

// Função para obter informações do vídeo
async function getVideoInfo(url) {
    try {
        const response = await fetch('/api/video-info', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Erro ao obter informações do vídeo');
        }

        const info = await response.json();
        
        // Preencher informações do vídeo
        thumbnail.src = info.thumbnail;
        title.textContent = info.title;
        uploader.textContent = info.uploader;
        duration.textContent = formatDuration(info.duration);
        
        // Mostrar avisos se houver
        if (info.warnings && info.warnings.length > 0) {
            showError(info.warnings.join(' '));
        }
        
        videoInfo.classList.remove('hidden');
    } catch (error) {
        videoInfo.classList.add('hidden');
    }
}

// Debounce para evitar muitas requisições
let debounceTimer;
videoUrlInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    const url = e.target.value.trim();
    
    if (url && (url.includes('youtube.com') || url.includes('youtu.be'))) {
        debounceTimer = setTimeout(() => {
            getVideoInfo(url);
        }, 1000);
    } else {
        videoInfo.classList.add('hidden');
    }
});

// Manipular envio do formulário
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const url = videoUrlInput.value.trim();
    const quality = qualitySelect.value;

    if (!url) {
        showError('Por favor, informe a URL do vídeo');
        return;
    }

    // Validação básica de URL do YouTube
    if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
        showError('Por favor, informe uma URL válida do YouTube');
        return;
    }

    // Desabilitar botão e mostrar spinner
    downloadBtn.disabled = true;
    btnText.textContent = 'Processando...';
    spinner.classList.remove('hidden');
    errorMessage.classList.add('hidden');
    successMessage.classList.add('hidden');
    progressContainer.classList.remove('hidden');
    progressBar.style.width = '0%';
    progressText.textContent = 'Iniciando...';

    const sessionId = generateSessionId();
    
    // Conectar ao SSE para receber progresso
    const eventSource = new EventSource(`/api/download-progress/${sessionId}`);
    
    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            progressBar.style.width = `${data.progress}%`;
            progressText.textContent = data.message;
            
            if (data.stage === 'error') {
                eventSource.close();
                showError(data.message);
                downloadBtn.disabled = false;
                btnText.textContent = 'Baixar Áudio';
                spinner.classList.add('hidden');
                progressContainer.classList.add('hidden');
            }
        } catch (error) {
            // Ignorar erros de parsing
        }
    };
    
    let errorCount = 0;
    eventSource.onerror = (error) => {
        errorCount++;
        
        // Se houver muitos erros, fechar e mostrar mensagem
        if (errorCount > 3) {
            eventSource.close();
            showError('Conexão perdida. Recarregue a página e tente novamente.');
            downloadBtn.disabled = false;
            btnText.textContent = 'Baixar Áudio';
            spinner.classList.add('hidden');
            progressContainer.classList.add('hidden');
        }
    };

    try {
        const response = await fetch('/api/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url, quality, sessionId }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Erro ao baixar o áudio');
        }

        // Obter o arquivo como blob
        const blob = await response.blob();
        
        // Extrair o nome do arquivo do header Content-Disposition
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = 'audio.mp3';
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="(.+)"/);
            if (filenameMatch) {
                filename = filenameMatch[1];
            }
        }

        // Criar URL temporário e fazer download
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(downloadUrl);
        document.body.removeChild(a);

        progressBar.style.width = '100%';
        progressText.textContent = 'Completo! 🎉';
        showSuccess('Download concluído com sucesso! 🎉');
        
        setTimeout(() => {
            progressContainer.classList.add('hidden');
        }, 3000);
        
    } catch (error) {
        showError(error.message || 'Erro ao processar o download. Tente novamente.');
        progressContainer.classList.add('hidden');
    } finally {
        // Fechar conexão SSE
        eventSource.close();
        
        // Reabilitar botão e esconder spinner
        downloadBtn.disabled = false;
        btnText.textContent = 'Baixar Áudio';
        spinner.classList.add('hidden');
    }
});
