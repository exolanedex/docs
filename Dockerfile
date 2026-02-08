FROM node:20-alpine

WORKDIR /app

# Copy everything including content/
COPY . .

# Install deps
RUN npm install --omit=dev

# Build the static site
RUN node build.mjs

# Expose the port Railway assigns
EXPOSE ${PORT:-3000}

# Start the server
CMD ["node", "serve.mjs"]
