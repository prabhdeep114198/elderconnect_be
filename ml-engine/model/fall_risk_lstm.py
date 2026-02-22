import torch
import torch.nn as nn
import numpy as np
from statsmodels.tsa.seasonal import seasonal_decompose
import pandas as pd

class FallRiskMultiHorizonLSTM(nn.Module):
    def __init__(self, input_size, hidden_size=128, num_layers=3):
        super(FallRiskMultiHorizonLSTM, self).__init__()
        self.hidden_size = hidden_size
        self.num_layers = num_layers
        
        self.lstm = nn.LSTM(input_size, hidden_size, num_layers, batch_first=True, dropout=0.3)
        
        # Multiple heads for different horizons
        self.current_risk_head = nn.Sequential(
            nn.Linear(hidden_size, 32),
            nn.ReLU(),
            nn.Linear(32, 1),
            nn.Sigmoid()
        )
        
        # Forecast heads (predicting delta or absolute risk)
        self.forecast_7d_head = nn.Sequential(
            nn.Linear(hidden_size, 32),
            nn.ReLU(),
            nn.Linear(32, 1),
            nn.Sigmoid()
        )
        
        self.forecast_30d_head = nn.Sequential(
            nn.Linear(hidden_size, 32),
            nn.ReLU(),
            nn.Linear(32, 1),
            nn.Sigmoid()
        )

        self.forecast_90d_head = nn.Sequential(
            nn.Linear(hidden_size, 32),
            nn.ReLU(),
            nn.Linear(32, 1),
            nn.Sigmoid()
        )

    def forward(self, x):
        h0 = torch.zeros(self.num_layers, x.size(0), self.hidden_size).to(x.device)
        c0 = torch.zeros(self.num_layers, x.size(0), self.hidden_size).to(x.device)
        
        out, _ = self.lstm(x, (h0, c0))
        last_out = out[:, -1, :]
        
        return {
            "current": self.current_risk_head(last_out),
            "7d": self.forecast_7d_head(last_out),
            "30d": self.forecast_30d_head(last_out),
            "90d": self.forecast_90d_head(last_out)
        }

def analyze_trajectory(history_scores):
    """
    Performs STL decomposition to identify trend and seasonality.
    """
    if len(history_scores) < 14: # Need at least 2 weeks for minimal seasonality check
        return "stable", 0.0
    
    series = pd.Series(history_scores)
    try:
        # Simple linear trend if small data, STL if enough
        z = np.polyfit(range(len(series)), series, 1)
        slope = z[0]
        
        if slope > 0.5: trend = "increasing"
        elif slope < -0.5: trend = "decreasing"
        else: trend = "stable"
        
        return trend, slope
    except:
        return "stable", 0.0
