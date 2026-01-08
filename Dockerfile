# Production stage
FROM node:18-alpine

# Instalar dependências do sistema necessárias
RUN apk add --no-cache \
    python3 \
    py3-pip \
    ffmpeg

# Instalar yt-dlp (usando --break-system-packages para containers Docker)
RUN pip3 install --no-cache-dir --break-system-packages yt-dlp

# Criar diretório da aplicação
WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências do Node.js
RUN npm install --production

# Copiar código da aplicação
COPY . .

# Criar diretório de downloads
RUN mkdir -p /app/downloads

# Expor porta
EXPOSE 3000

# Variáveis de ambiente padrão
ENV NODE_ENV=production
ENV PORT=3000
ENV DOWNLOAD_DIR=/app/downloads

# Comando para iniciar a aplicação
CMD ["node", "server.js"]
