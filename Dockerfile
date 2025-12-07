# Use a lightweight Node.js image with 'serve' for static file serving
FROM node:20-alpine

# Install serve globally
RUN npm install -g serve

# Set working directory
WORKDIR /app

# Copy static files
COPY . .

# Expose port 3000
EXPOSE 3000

# Run serve on port 3000
CMD ["serve", "-s", ".", "-l", "3000"]
