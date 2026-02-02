FROM node:20-alpine

# Install simple static file server
RUN npm install -g serve

# Create app directory
WORKDIR /app

# Copy all files
COPY . .

# Start server on the port defined by Railway ($PORT)
# If $PORT is not set, default to 3000
CMD serve -s . -l tcp://0.0.0.0:${PORT:-3000}
