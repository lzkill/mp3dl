require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || './downloads';
const DOWNLOAD_TIMEOUT_MS = parseInt(process.env.DOWNLOAD_TIMEOUT_MS || '600000'); // 10 minutos
const MAX_VIDEO_SIZE_MB = parseInt(process.env.MAX_VIDEO_SIZE_MB || '500'); // 500MB
const MAX_VIDEO_DURATION_SEC = parseInt(process.env.MAX_VIDEO_DURATION_SEC || '3600'); // 1 hora

// Criar diretório de downloads se não existir
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Endpoint de health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Endpoint para obter informações do vídeo
app.post('/api/video-info', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL do vídeo é obrigatória' });
  }

  try {
    const ytDlp = spawn('yt-dlp', ['--dump-json', '--no-playlist', url]);
    
    let stdout = '';
    let stderr = '';
    
    ytDlp.stdout.on('data', (data) => {
      stdout += data;
    });
    
    ytDlp.stderr.on('data', (data) => {
      stderr += data;
    });
    
    ytDlp.on('close', (code) => {
      if (code !== 0) {
        console.error('Erro ao obter informações do vídeo:', stderr);
        return res.status(500).json({ 
          error: 'Falha ao obter informações do vídeo',
          details: stderr 
        });
      }
      
      try {
        const videoInfo = JSON.parse(stdout);
        
        // Validar duração (avisar mas não bloquear para áudio)
        const durationWarning = videoInfo.duration > MAX_VIDEO_DURATION_SEC ? 
          `Vídeo longo (${Math.floor(videoInfo.duration / 60)} min). Download pode demorar.` : null;
        
        // Validar tamanho (estimativa - avisar mas não bloquear pois vamos baixar só áudio)
        const estimatedSizeMB = (videoInfo.filesize || videoInfo.filesize_approx || 0) / (1024 * 1024);
        const sizeWarning = estimatedSizeMB > MAX_VIDEO_SIZE_MB ? 
          `Vídeo grande (${Math.floor(estimatedSizeMB)}MB). Download pode demorar.` : null;
        
        res.json({
          title: videoInfo.title,
          duration: videoInfo.duration,
          thumbnail: videoInfo.thumbnail,
          uploader: videoInfo.uploader,
          estimatedSizeMB: Math.floor(estimatedSizeMB) || 'Desconhecido',
          warnings: [durationWarning, sizeWarning].filter(Boolean)
        });
      } catch (error) {
        console.error('Erro ao parsear informações do vídeo:', error);
        res.status(500).json({ 
          error: 'Falha ao processar informações do vídeo',
          details: error.message 
        });
      }
    });
    
  } catch (error) {
    console.error('Erro ao obter informações do vídeo:', error);
    res.status(500).json({ 
      error: 'Falha ao obter informações do vídeo',
      details: error.message 
    });
  }
});

// Endpoint SSE para progresso do download
app.get('/api/download-progress/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  // Configurar SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  
  // Enviar comentário a cada 30s para manter conexão viva
  const keepAlive = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 30000);
  
  // Armazenar listener no objeto global (simples implementação)
  global.progressListeners = global.progressListeners || {};
  global.progressListeners[sessionId] = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  
  // Cleanup ao fechar conexão
  req.on('close', () => {
    clearInterval(keepAlive);
    if (global.progressListeners && global.progressListeners[sessionId]) {
      delete global.progressListeners[sessionId];
    }
  });
});

// Endpoint para download do áudio com progresso
app.post('/api/download', async (req, res) => {
  const { url, quality = '192', sessionId } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL do vídeo é obrigatória' });
  }

  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID é obrigatório' });
  }

  // Validar qualidade
  const validQualities = ['64', '128', '192', '256', '320'];
  if (!validQualities.includes(quality)) {
    return res.status(400).json({ 
      error: 'Qualidade inválida. Use: 64, 128, 192, 256 ou 320' 
    });
  }

  const sendProgress = (data) => {
    if (global.progressListeners && global.progressListeners[sessionId]) {
      global.progressListeners[sessionId](data);
    }
  };

  // Gerar nome de arquivo único
  const timestamp = Date.now();
  const outputTemplate = path.join(DOWNLOAD_DIR, `${timestamp}_%(title)s.%(ext)s`);

  sendProgress({ stage: 'starting', progress: 0, message: 'Iniciando download...' });

  // Comando yt-dlp para download e conversão com progresso
  const ytDlp = spawn('yt-dlp', [
    '-x',
    '--audio-format', 'mp3',
    '--audio-quality', `${quality}K`,
    '-o', outputTemplate,
    '--no-playlist',
    '--newline',
    '--progress',
    url
  ]);
  
  let hasError = false;
  let errorMessage = '';
  let downloadComplete = false;
  let filePath = null;
  
  // Timeout
  const timeout = setTimeout(() => {
    if (!downloadComplete) {
      ytDlp.kill();
      hasError = true;
      errorMessage = `Timeout: Download excedeu o limite de ${DOWNLOAD_TIMEOUT_MS / 1000} segundos`;
      sendProgress({ stage: 'error', progress: 0, message: errorMessage });
    }
  }, DOWNLOAD_TIMEOUT_MS);
  
  ytDlp.stdout.on('data', (data) => {
    const output = data.toString();
    console.log('yt-dlp output:', output);
    
    // Parse do progresso
    const downloadMatch = output.match(/\[download\]\s+(\d+\.?\d*)%/);
    if (downloadMatch) {
      const progress = parseFloat(downloadMatch[1]);
      sendProgress({ 
        stage: 'downloading', 
        progress: Math.min(progress, 99), 
        message: `Baixando e convertendo: ${progress.toFixed(1)}%` 
      });
    }
    
    // Detectar conversão
    if (output.includes('[ExtractAudio]')) {
      sendProgress({ stage: 'converting', progress: 95, message: 'Convertendo para MP3...' });
    }
  });
  
  ytDlp.stderr.on('data', (data) => {
    const error = data.toString();
    console.error('yt-dlp stderr:', error);
    errorMessage += error;
  });
  
  ytDlp.on('close', (code) => {
    clearTimeout(timeout);
    downloadComplete = true;
    
    if (code !== 0 || hasError) {
      console.error('Erro no download:', errorMessage);
      sendProgress({ stage: 'error', progress: 0, message: 'Falha no download' });
      return res.status(500).json({ 
        error: 'Falha ao baixar o áudio',
        details: errorMessage || 'Processo finalizado com erro'
      });
    }
    
    sendProgress({ stage: 'processing', progress: 100, message: 'Finalizando...' });
    
    try {
      // Encontrar o arquivo gerado
      const files = fs.readdirSync(DOWNLOAD_DIR)
        .filter(file => file.startsWith(timestamp.toString()) && file.endsWith('.mp3'))
        .sort((a, b) => {
          return fs.statSync(path.join(DOWNLOAD_DIR, b)).mtime.getTime() -
                 fs.statSync(path.join(DOWNLOAD_DIR, a)).mtime.getTime();
        });

      if (files.length === 0) {
        sendProgress({ stage: 'error', progress: 0, message: 'Arquivo não encontrado' });
        return res.status(500).json({ error: 'Arquivo de áudio não encontrado após download' });
      }

      const filename = files[0];
      filePath = path.join(DOWNLOAD_DIR, filename);
      const fileStat = fs.statSync(filePath);
      const fileSize = fileStat.size;

      // Sanitizar nome do arquivo para uso em headers HTTP
      const sanitizedFilename = filename
        .replace(/[^\x20-\x7E]/g, '') // Remove caracteres não-ASCII
        .replace(/[<>:"/\\|?*]/g, '_') // Remove caracteres inválidos
        .trim();

      sendProgress({ stage: 'complete', progress: 100, message: 'Download pronto!' });

      // Enviar arquivo com suporte a Range requests
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        
        const fileStream = fs.createReadStream(filePath, { start, end });
        
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': 'audio/mpeg',
          'Content-Disposition': `attachment; filename="${sanitizedFilename}"`
        });
        
        fileStream.pipe(res);
        
        fileStream.on('end', () => {
          setTimeout(() => {
            try {
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log('Arquivo temporário removido:', filename);
              }
            } catch (error) {
              console.error('Erro ao remover arquivo:', error);
            }
          }, 1000);
        });
        
      } else {
        // Download normal
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': 'audio/mpeg',
          'Content-Disposition': `attachment; filename="${sanitizedFilename}"`,
          'Accept-Ranges': 'bytes'
        });
        
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
        
        fileStream.on('end', () => {
          setTimeout(() => {
            try {
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log('Arquivo temporário removido:', filename);
              }
            } catch (error) {
              console.error('Erro ao remover arquivo:', error);
            }
          }, 1000);
        });
        
        fileStream.on('error', (error) => {
          console.error('Erro ao enviar arquivo:', error);
        });
      }
      
    } catch (error) {
      console.error('Erro ao processar arquivo:', error);
      sendProgress({ stage: 'error', progress: 0, message: error.message });
      if (!res.headersSent) {
        res.status(500).json({ 
          error: 'Erro ao processar arquivo',
          details: error.message 
        });
      }
    }
  });
});

// Limpeza de arquivos antigos (rodar a cada hora)
setInterval(() => {
  const now = Date.now();
  const maxAge = parseInt(process.env.FILE_MAX_AGE_MS || '3600000'); // 1 hora padrão

  fs.readdir(DOWNLOAD_DIR, (err, files) => {
    if (err) {
      console.error('Erro ao ler diretório de downloads:', err);
      return;
    }

    files.forEach(file => {
      const filePath = path.join(DOWNLOAD_DIR, file);
      fs.stat(filePath, (err, stats) => {
        if (err) return;
        
        if (now - stats.mtime.getTime() > maxAge) {
          fs.unlink(filePath, (err) => {
            if (err) {
              console.error('Erro ao remover arquivo antigo:', err);
            } else {
              console.log('Arquivo antigo removido:', file);
            }
          });
        }
      });
    });
  });
}, 3600000); // Executar a cada hora

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Diretório de downloads: ${DOWNLOAD_DIR}`);
  console.log(`Timeout de download: ${DOWNLOAD_TIMEOUT_MS / 1000}s`);
  console.log(`Tamanho máximo de vídeo: ${MAX_VIDEO_SIZE_MB}MB`);
  console.log(`Duração máxima de vídeo: ${MAX_VIDEO_DURATION_SEC / 60} minutos`);
});
