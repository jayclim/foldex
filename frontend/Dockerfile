FROM oven/bun:1

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install

# Copy the rest of the frontend code
COPY . .

# Expose Vite's default port
EXPOSE 5173

# Run the dev server and bind to 0.0.0.0
CMD ["bun", "run", "dev", "--host", "0.0.0.0"]
