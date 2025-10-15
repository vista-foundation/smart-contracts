#!/bin/bash

echo "🚀 Setting up Escrow Services Demo..."

# Check if .env exists
if [ ! -f .env ]; then
    echo "📄 Creating .env file from template..."
    cp env.template .env
    echo "✅ .env file created. Please edit it with your Blockfrost API key."
    echo "📝 Get your free API key at: https://blockfrost.io/"
else
    echo "✅ .env file already exists"
fi

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

echo ""
echo "🎯 Setup complete! Next steps:"
echo "1. Edit .env file and add your Blockfrost Preview API key"
echo "2. Run CLI demo: node deploy-cli.js"
echo "3. Run web demo: pnpm dev"
echo ""
echo "💡 Make sure your API key is for the Preview network!"
