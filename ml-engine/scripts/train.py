import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, r2_score
import sys
import os

# Add parent dir to path to import model and pipeline
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from model.fall_risk_lstm import FallRiskLSTM
from pipeline.preprocessing import DataPreprocessor

def train_model(data_path, window_size=7, epochs=50, batch_size=32):
    # 1. Load Data
    df = pd.read_csv(data_path)
    
    # 2. Preprocess
    preprocessor = DataPreprocessor()
    preprocessor.fit(df)
    features_normalized = preprocessor.transform(df)
    
    # Target: risk_score (0-100) -> normalize to 0-1 for Sigmoid
    target = df['actual_risk_score'].values / 100.0 if 'actual_risk_score' in df.columns else np.random.rand(len(df))
    
    # 3. Create Sequences
    X = preprocessor.prepare_time_series(features_normalized, window_size)
    y = target[window_size-1:]
    
    # 4. Split
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    # Convert to Tensors
    X_train = torch.FloatTensor(X_train)
    y_train = torch.FloatTensor(y_train).view(-1, 1)
    X_test = torch.FloatTensor(X_test)
    y_test = torch.FloatTensor(y_test).view(-1, 1)
    
    train_loader = DataLoader(TensorDataset(X_train, y_train), batch_size=batch_size, shuffle=True)
    
    # 5. Initialize Model
    model = FallRiskLSTM(input_size=len(preprocessor.features))
    criterion = nn.MSELoss()
    optimizer = optim.Adam(model.parameters(), lr=0.001)
    
    # 6. Training Loop
    print(f"Starting training for {epochs} epochs...")
    for epoch in range(epochs):
        model.train()
        epoch_loss = 0
        for batch_X, batch_y in train_loader:
            optimizer.zero_grad()
            outputs = model(batch_X)
            loss = criterion(outputs, batch_y)
            loss.backward()
            optimizer.step()
            epoch_loss += loss.item()
        
        if (epoch+1) % 10 == 0:
            print(f"Epoch [{epoch+1}/{epochs}], Loss: {epoch_loss/len(train_loader):.4f}")

    # 7. Evaluation
    model.eval()
    with torch.no_grad():
        y_pred = model(X_test)
        mae = mean_absolute_error(y_test.numpy(), y_pred.numpy())
        r2 = r2_score(y_test.numpy(), y_pred.numpy())
        print(f"\nEvaluation Metrics:")
        print(f"Mean Absolute Error: {mae * 100:.2f}%")
        print(f"R2 Score: {r2:.4f}")

    # 8. Save Model
    os.makedirs("data/models", exist_ok=True)
    torch.save(model.state_dict(), "data/models/fall_risk_v1.pth")
    print("\nModel saved to data/models/fall_risk_v1.pth")

    return mae, r2

if __name__ == "__main__":
    # If file doesn't exist, create synthetic for demo
    dummy_path = "data/raw/synthetic_data.csv"
    if not os.path.exists(dummy_path):
        os.makedirs("data/raw", exist_ok=True)
        data = pd.DataFrame(np.random.rand(100, 9), columns=[
            'gait_speed_var', 'balance_score', 'daily_steps', 
            'prev_fall_history', 'med_adherence', 'sedative_flag', 
            'motion_sensor_freq', 'pressure_mat_imbalance', 'actual_risk_score'
        ])
        data['actual_risk_score'] *= 100
        data.to_csv(dummy_path, index=False)
    
    train_model(dummy_path)
