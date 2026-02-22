from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
import torch
import pandas as pd
import numpy as np
import os
import sys
from datetime import datetime

# Add parent dir to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from model.fall_risk_lstm import FallRiskLSTM
from pipeline.preprocessing import DataPreprocessor

app = FastAPI(title="ElderConnect Fall Risk API")

# Load model and preprocessor globally
MODEL_PATH = "data/models/fall_risk_v1.pth"
features = ['gait_speed_var', 'balance_score', 'daily_steps', 
            'prev_fall_history', 'med_adherence', 'sedative_flag', 
            'motion_sensor_freq', 'pressure_mat_imbalance']

preprocessor = DataPreprocessor()
model = FallRiskLSTM(input_size=len(features))

if os.path.exists(MODEL_PATH):
    model.load_state_dict(torch.load(MODEL_PATH))
    model.eval()
    preprocessor.load_scaler()
    print("Model loaded successfully.")
else:
    print("WARNING: Model file not found. Inference will return random values until trained.")

class InferenceRequest(BaseModel):
    userId: str
    historical_data: list # List of 7-30 days of features
    daily_scores: list = [] # Historical risk scores for trend analysis

class TrainingRequest(BaseModel):
    data_source: str # Path to CSV or DB connection string

def analyze_trajectory(history):
    """Analyzes the trend of historical risk scores."""
    if len(history) < 2:
        return "stable", 0.0
    
    # Simple linear regression for slope
    y = np.array(history)
    x = np.arange(len(y))
    slope = np.polyfit(x, y, 1)[0]

    if slope > 0.005: # Threshold for increasing
        return "increasing", slope
    elif slope < -0.005: # Threshold for decreasing
        return "decreasing", slope
    else:
        return "stable", slope

@app.post("/predict")
async def predict_risk(request: InferenceRequest):
    if len(request.historical_data) < 7:
        raise HTTPException(status_code=400, detail="Minimum 7 days of data required.")

    # Data availability check
    data_quality = len([d for d in request.historical_data if d.get('daily_steps', 0) > 0]) / len(request.historical_data)

    try:
        df = pd.DataFrame(request.historical_data)
        processed_data = preprocessor.transform(df)
        X = torch.FloatTensor(processed_data.values[-7:]).unsqueeze(0)
        
        with torch.no_grad():
            outputs = model(X)
            current = outputs["current"].item()
            f7d = outputs["7d"].item()
            f30 = outputs["30d"].item()
            f90 = outputs["90d"].item()

        # Trajectory & Spikes
        history = request.daily_scores if request.daily_scores else [current] * 10
        trend_label, slope = analyze_trajectory(history)
        
        # Spike Detection (>20 in 48h)
        is_spike = False
        if len(history) >= 2:
            if (current * 100) - (history[-1] * 100) > 20:
                is_spike = True

        # Confidence Interval (Based on data quality and model variance)
        margin = (1.0 - data_quality) * 10 + 5 

        # Generate Recommendations (Hybrid Logic)
        recommendations = generate_recommendations(df.iloc[-1], current, trend_label)

        return {
            "userId": request.userId,
            "current_risk": round(current * 100, 2),
            "forecast_7d": round(f7d * 100, 2),
            "forecast_30d": round(f30 * 100, 2),
            "forecast_90d": round(f90 * 100, 2),
            "risk_trend": trend_label,
            "confidence_interval": {"lower": round(current*100 - margin, 2), "upper": round(current*100 + margin, 2)},
            "spike_detected": is_spike,
            "recommendations": recommendations,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def generate_recommendations(latest_data, risk_score, trend):
    recs = []
    
    # Rule 1: Gait Instability
    if latest_data.get('gait_speed_var', 0) > 0.15:
        recs.append({
            "type": "exercise",
            "priority": "high",
            "title": "Balance Training",
            "description": "Perform 10 minutes of 'Single Leg Stance' and 'Heel-to-Toe Walk' today."
        })
    
    # Rule 2: Sedatives
    if latest_data.get('sedative_flag', 0) == 1:
        recs.append({
            "type": "medication_review",
            "priority": "medium",
            "title": "Sedative Impact Check",
            "description": "Risk profile shows sedative usage. Consult physician about evening dosage timing."
        })

    # Rule 3: Low Activity
    if latest_data.get('daily_steps', 0) < 2000:
        recs.append({
            "type": "lifestyle",
            "priority": "medium",
            "title": "Gentle Mobility",
            "description": "Try 3 short 5-minute walks around the home to maintain muscle strength."
        })

    # Rule 4: Night Movement (based on sensor freq if available)
    if latest_data.get('motion_sensor_freq', 0) > 20: # High frequency might imply restlessness
        recs.append({
            "type": "environment",
            "priority": "high",
            "title": "Night-time Safety",
            "description": "Ensure hallway night-lights are active. Consider non-slip mats near the bed."
        })

    if risk_score > 0.7 or trend == "increasing":
        recs.append({
            "type": "preventative",
            "priority": "critical",
            "title": "Emergency Contact Review",
            "description": "Your risk is trending upwards. Please ensure your wearable alert button is charged."
        })

    return recs

@app.post("/train")
async def trigger_retraining(request: TrainingRequest, background_tasks: BackgroundTasks):
    from scripts.train import train_model
    
    # Run training in background as it might take time
    background_tasks.add_task(train_model, request.data_source)
    
    return {"message": "Retraining pipeline triggered", "status": "processing"}

@app.get("/health")
def health_check():
    return {"status": "ok", "model_loaded": os.path.exists(MODEL_PATH)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
