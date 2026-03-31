import json
import os
import random
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

# GLOBALS to be lazy-loaded
model = None
QUESTIONS_DB = None
EMBEDDING_CACHE = {}
_is_initialized = False

def initialize_ai():
    global model, QUESTIONS_DB, EMBEDDING_CACHE, _is_initialized
    if _is_initialized:
        return
        
    print("Loading local AI model (this may take 10-20 seconds on first run)...")
    model = SentenceTransformer('all-MiniLM-L6-v2')  # ~80MB, very fast
    print("Local AI model loaded successfully!")

    # Load the questions dataset
    DATASET_PATH = os.path.join(os.path.dirname(__file__), 'data', 'questions.json')
    with open(DATASET_PATH, 'r', encoding='utf-8') as f:
        QUESTIONS_DB = json.load(f)

    # PRE-CACHE EMBEDDINGS (Performance Optimization)
    print("Optimizing system: Pre-calculating answer embeddings...")
    for role, questions in QUESTIONS_DB.items():
        for q in questions:
            q_text = q["question"]
            ideal_text = q["ideal_answer"]
            embedding = model.encode([ideal_text])
            EMBEDDING_CACHE[q_text.lower()] = {
                "embedding": embedding,
                "ideal_answer": ideal_text,
                "keywords": q["keywords"],
                "role": role
            }
    print(f"System Optimized: {len(EMBEDDING_CACHE)} questions cached.")



def generate_interview_questions(field, count):
    """
    Randomly selects questions from the dataset for the given role.
    """
    try:
        initialize_ai()
        # Normalize field name
        role = field.strip()
        
        # Get questions for this role
        if role not in QUESTIONS_DB:
            # Fallback to General Interview if role not found
            role = "General Interview"
        
        questions_pool = QUESTIONS_DB[role]
        
        # Randomly select 'count' questions (or all if fewer available)
        selected = random.sample(questions_pool, min(count, len(questions_pool)))
        
        # Return just the question text as a list
        question_texts = [q["question"] for q in selected]
        return question_texts
    
    except Exception as e:
        print(f"ERROR: Failed to generate questions. Exception: {e}")
        # Fallback
        return ["Tell me about yourself.", "What are your strengths?", "Describe a challenge you faced."]


def analyze_interview_answer(question, answer):
    """
    Analyzes the answer using semantic similarity and keyword matching.
    Context-aware feedback for General Interview vs Technical questions.
    """
    try:
        initialize_ai()
        # Check cache for question data
        q_key = question.lower()
        if q_key not in EMBEDDING_CACHE:
            # Question not in dataset, use generic scoring
            return {
                "rating": 5,
                "feedback": "Your answer was recorded. This question is not in the standard dataset, so detailed feedback is unavailable.",
                "improvement": "Try to be more specific and provide examples.",
                "correctness": "Unknown"
            }
        
        q_data = EMBEDDING_CACHE[q_key]
        ideal_embedding = q_data["embedding"]
        keywords = q_data["keywords"]
        question_role = q_data["role"]
        
        # Determine if this is a General Interview question
        is_general = (question_role == "General Interview")
        
        # 1. Semantic Similarity
        answer_embedding = model.encode([answer])
        # Use cached ideal_embedding
        similarity = cosine_similarity(answer_embedding, ideal_embedding)[0][0]
        
        # --- GIBBERISH DETECTION (Trained System v3) ---
        # Very low similarity + short length usually indicates gibberish or unrelated content
        is_gibberish = (similarity < 0.15 and len(answer.split()) < 5) or (similarity < 0.1)
        
        if is_gibberish:
            return {
                "rating": 0,
                "feedback": "Your answer seems unrelated or contains meaningless text. Please provide a clear, technical response.",
                "improvement": "Try to answer the question using complete sentences and relevant industry terms.",
                "correctness": "Invalid/Gibberish"
            }
        
        # 2. Realistic Scoring (Non-linear Mapping)
        # Formula: boost = similarity ^ 0.7 (brings lower scores up faster)
        similarity_boosted = (similarity ** 0.7) * 100
        similarity_score = max(0, min(100, similarity_boosted))
        
        # 3. Keyword Matching (Trained System v2 - Enhanced Robustness)
        answer_lower = answer.lower()
        keywords_found = 0
        for kw in keywords:
            kw_lower = kw.lower()
            # Broad robust matching: handle plurals, singulars, and common technical variations
            patterns = {kw_lower}
            
            # 1. handle 'parentheses' <-> 'parenthesis'
            if kw_lower.endswith('es'):
                patterns.add(kw_lower[:-2] + 'is')
                patterns.add(kw_lower[:-2])
            elif kw_lower.endswith('is'):
                patterns.add(kw_lower[:-2] + 'es')
            
            # 2. handle 'y' -> 'ies' (e.g., 'library' -> 'libraries')
            elif kw_lower.endswith('y'):
                patterns.add(kw_lower[:-1] + 'ies')
            elif kw_lower.endswith('ies'):
                patterns.add(kw_lower[:-3] + 'y')
            
            # 3. simple plural 's'
            elif kw_lower.endswith('s'):
                patterns.add(kw_lower[:-1])
            else:
                patterns.add(kw_lower + 's')
            
            if any(p in answer_lower for p in patterns):
                keywords_found += 1
                
        keyword_score = (keywords_found / len(keywords)) * 100 if keywords else 0
        
        # 4. Final Weighted Scoring
        if is_general:
            # General: Prioritize meaning (flow/structure)
            final_score = (similarity_score * 0.9) + (keyword_score * 0.1)
            # More generous boost for general
            final_score = min(100.0, final_score * 1.1)
        else:
            # Technical: Balanced
            final_score = (similarity_score * 0.75) + (keyword_score * 0.25)
            # Encouragement boost for technical
            if keywords_found > 0:
                final_score = min(100.0, final_score * 1.15)
        
        rating = int(final_score / 10)  # Convert to 1-10 scale
        rating = max(1, min(10, rating))  # Clamp to 1-10
        
        # 5. Generate Context-Aware Feedback
        if is_general:
            # General Interview feedback
            if rating >= 8:
                correctness = "Excellent"
                feedback = "Excellent answer! You provided a well-structured response with relevant details."
            elif rating >= 6:
                correctness = "Good"
                feedback = "Good answer. You covered the main points, but could add more specific examples or details."
            elif rating >= 4:
                correctness = "Adequate"
                feedback = "Your answer is on the right track, but lacks depth and specific examples."
            else:
                correctness = "Needs Improvement"
                feedback = "Your answer needs more detail and structure. Consider using specific examples from your experience."
        else:
            # Technical feedback (focus on concepts, accuracy)
            if rating >= 8:
                correctness = "Correct"
                feedback = "Excellent answer! You demonstrated strong technical understanding."
            elif rating >= 6:
                correctness = "Partially Correct"
                feedback = "Good answer. You covered the main concepts but could add more technical detail."
            elif rating >= 4:
                correctness = "Partially Correct"
                feedback = "Your answer shows some understanding, but misses key technical concepts."
            else:
                correctness = "Incorrect"
                feedback = "Your answer needs significant improvement. Review the fundamental concepts."
        
        # 6. Context-Aware Improvement Suggestions
        missing_keywords = [kw for kw in keywords if kw.lower() not in answer_lower]
        
        if is_general:
            if missing_keywords:
                improvement = f"Consider mentioning: {', '.join(missing_keywords[:3])}."
            else:
                improvement = "Great coverage! Try to add more specific examples or quantifiable achievements."
        else:
            if missing_keywords:
                improvement = f"Try to include these key concepts: {', '.join(missing_keywords[:3])}."
            else:
                improvement = "Excellent coverage of key concepts! Consider adding real-world examples."
        
        return {
            "rating": rating,
            "feedback": feedback,
            "improvement": improvement,
            "correctness": correctness
        }
    
    except Exception as e:
        print(f"ERROR: Failed to analyze answer. Exception: {e}")
        return {
            "rating": 0,
            "feedback": f"Error: {str(e)}",
            "improvement": "Check console logs.",
            "correctness": "Error"
        }

