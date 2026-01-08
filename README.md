# YouTube Audio Downloader

Aplicação web para download de áudio de vídeos do YouTube em formato MP3 com qualidade configurável.

## 🚀 Funcionalidades

- Download de áudio de vídeos do YouTube em formato MP3
- Qualidade de áudio configurável (64, 128, 192, 256, 320 kbps)
- Preview de informações do vídeo (título, canal, duração, thumbnail)
- Interface web responsiva e moderna
- Containerizada com Docker para fácil deploy
- Limpeza automática de arquivos temporários

## 🛠️ Tecnologias

- **Backend**: Node.js + Express
- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Download**: yt-dlp
- **Conversão**: FFmpeg
- **Containerização**: Docker + Docker Compose

## 📋 Pré-requisitos

- Docker e Docker Compose instalados
- OU Node.js 18+ (para desenvolvimento sem Docker)

## 🔧 Instalação e Execução

### Usando Docker (Recomendado)

1. Clone o repositório:
```bash
git clone <repository-url>
cd yt-downloader
```

2. Copie o arquivo de exemplo de variáveis de ambiente:
```bash
cp .env.example .env
```

3. Configure as variáveis de ambiente em `.env` se necessário

4. Inicie a aplicação:
```bash
docker-compose up --build
```

5. Acesse a aplicação em: `http://localhost:3000`

### Desenvolvimento Local (sem Docker)

1. Instale as dependências do sistema:
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y python3 python3-pip ffmpeg

# macOS
brew install python3 ffmpeg

# Instale o yt-dlp
pip3 install yt-dlp
```

2. Instale as dependências do Node.js:
```bash
npm install
```

3. Configure as variáveis de ambiente:
```bash
cp .env.example .env
```

4. Inicie o servidor:
```bash
npm start
# ou para desenvolvimento com auto-reload:
npm run dev
```

5. Acesse: `http://localhost:3000`

## ⚙️ Configuração

As seguintes variáveis de ambiente podem ser configuradas no arquivo `.env`:

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `NODE_ENV` | Ambiente de execução | `development` |
| `PORT` | Porta do servidor | `3000` |
| `DOWNLOAD_DIR` | Diretório para arquivos temporários | `/app/downloads` |
| `FILE_MAX_AGE_MS` | Tempo de vida dos arquivos (ms) | `3600000` (1 hora) |

## 📖 Como Usar

1. Cole a URL de um vídeo do YouTube no campo de entrada
2. Escolha a qualidade desejada do áudio (64-320 kbps)
3. Clique em "Baixar Áudio"
4. Aguarde o processamento
5. O arquivo MP3 será baixado automaticamente

## 🐳 Comandos Docker Úteis

```bash
# Iniciar a aplicação
docker-compose up

# Iniciar em background
docker-compose up -d

# Parar a aplicação
docker-compose down

# Rebuild da imagem
docker-compose up --build

# Ver logs
docker-compose logs -f

# Executar comandos no container
docker-compose exec yt-downloader sh
```

## 🌐 Deploy com Nginx (Produção)

A aplicação usa **Server-Sent Events (SSE)** e downloads grandes, requerendo configuração especial no nginx:

### Opção 1: Docker Compose com Nginx

```bash
# Usar configuração de produção
docker-compose -f docker-compose.prod.yml up -d
```

### Opção 2: Nginx Standalone

1. Copie o arquivo de exemplo:
```bash
sudo cp nginx.conf.example /etc/nginx/sites-available/yt-downloader
```

2. Edite e ajuste o domínio:
```bash
sudo nano /etc/nginx/sites-available/yt-downloader
```

3. Ative o site:
```bash
sudo ln -s /etc/nginx/sites-available/yt-downloader /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Configurações Críticas do Nginx

- **SSE (Server-Sent Events)**: `proxy_buffering off` no endpoint `/api/download-progress/`
- **Range Requests**: Suporte a retomada de downloads
- **Timeouts**: Aumentados para 600s (downloads grandes)
- **Max Body Size**: 100M para uploads

Ver [nginx.conf.example](nginx.conf.example) para configuração completa.

## 📁 Estrutura do Projeto

```
yt-downloader/
├── public/              # Arquivos frontend
│   ├── index.html      # Interface principal
│   ├── styles.css      # Estilos
│   └── script.js       # Lógica do cliente
├── downloads/          # Diretório temporário (criado automaticamente)
├── server.js           # Servidor Express
├── package.json        # Dependências Node.js
├── Dockerfile          # Configuração Docker
├── docker-compose.yml  # Orquestração Docker
├── .env.example        # Exemplo de variáveis de ambiente
├── .gitignore         # Arquivos ignorados pelo Git
└── README.md          # Este arquivo
```

## 🔒 Segurança

- Arquivos temporários são automaticamente removidos após o download
- Limpeza periódica de arquivos antigos (configurável)
- Validação de URLs do YouTube
- Limite de tamanho de buffer para evitar sobrecarga

## 🤝 Contribuindo

Contribuições são bem-vindas! Sinta-se à vontade para abrir issues ou pull requests.

## 📄 Licença

ISC

## ⚠️ Aviso Legal

Esta ferramenta é apenas para fins educacionais. Respeite os direitos autorais e os termos de serviço do YouTube. Baixe apenas conteúdo que você tem permissão para baixar.
