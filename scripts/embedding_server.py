import os
import sys
from flask import Flask, request, jsonify
from sentence_transformers import SentenceTransformer
import torch

# Configuration
PORT = 5001
MODEL_NAME = 'all-MiniLM-L6-v2'

app = Flask(__name__)

# Load Model
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Loading {MODEL_NAME} on {device}...")
try:
    model = SentenceTransformer(MODEL_NAME, device=device)
    print(f"Model loaded successfully!")
except Exception as e:
    print(f"Failed to load model: {e}")
    sys.exit(1)

@app.route('/encode', methods=['POST'])
def encode():
    try:
        data = request.json
        if not data or 'text' not in data:
            return jsonify({'error': 'Missing "text" field'}), 400
        
        text = data['text']
        embedding = model.encode(text).tolist()
        
        return jsonify({'embedding': embedding})
    except Exception as e:
        print(f"Error encoding: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'device': device})

if __name__ == '__main__':
    print(f"Starting Embedding Server on port {PORT}...")
    app.run(host='0.0.0.0', port=PORT)
