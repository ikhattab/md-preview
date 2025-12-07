# Static file server using Caddy (better headers/compression than `serve`)
FROM caddy:2.8-alpine

WORKDIR /srv

# Copy site assets
COPY . /srv

# Listen on Fly's internal port
EXPOSE 3000

# file-server sets sensible defaults; Fly terminates TLS at the edge
CMD ["caddy", "file-server", "--root", "/srv", "--listen", ":3000"]
