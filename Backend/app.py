import logging
from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import ai_service

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder="../Frontend", static_url_path="")
CORS(app)

@app.route('/')
def serve_frontend():
    return app.send_static_file('index.html')

@app.route('/api/status', methods=['GET'])
def status():
    return jsonify({"configured": True})  # Always ready with local AI

@app.route('/api/start', methods=['POST'])
def start_interview():
    try:
        data = request.json
        field = data.get('field', 'General Interview')
        count = data.get('count', 5)
        
        logger.info(f"Starting interview for field: {field}, count: {count}")
        
        # ai_service now returns a list directly
        questions = ai_service.generate_interview_questions(field, count)
        return jsonify({"questions": questions})
        
    except Exception as e:
        logger.error(f"Failed to start interview: {str(e)}")
        return jsonify({"error": "Internal server error occurred while generating questions."}), 500

@app.route('/api/analyze', methods=['POST'])
def analyze():
    try:
        data = request.json or request.form
        question = data.get('question')
        answer = data.get('answer')
        
        if not question or not answer:
            return jsonify({"error": "Question and Answer are required"}), 400
            
        logger.info(f"Analyzing text answer for: {question[:50]}...")
        
        feedback = ai_service.analyze_interview_answer(question, answer)
        return jsonify(feedback)
        
    except Exception as e:
        logger.error(f"Failed to analyze answer: {str(e)}")
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

if __name__ == '__main__':
    logger.info("Starting Flask server on port 5000...")
    app.run(debug=True, port=5000)
