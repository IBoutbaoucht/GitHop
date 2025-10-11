# Use official Node image
FROM node:20

# Set working directory inside container
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy all source code
COPY . .

# Expose the Express port
EXPOSE 4000

# Start the app (this can be overridden in docker-compose)
CMD ["npm", "run", "dev"]
