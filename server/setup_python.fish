#!/usr/bin/env fish
# Setup Python virtual environment for spaCy (Fish shell version)

echo "Creating Python virtual environment..."
python3 -m venv venv

echo "Activating virtual environment..."
source venv/bin/activate.fish

echo "Installing spaCy..."
pip install --upgrade pip
pip install spacy

echo "Downloading English language model..."
python -m spacy download en_core_web_sm

echo ""
echo "✓ Setup complete!"
echo ""
echo "To use this environment:"
echo "  source venv/bin/activate.fish    # Activate the venv"
echo "  cargo test                       # Run tests"
echo "  cargo run                        # Run server"
echo "  deactivate                       # Exit venv when done"
