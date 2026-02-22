import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler
from joblib import dump, load
import os

class DataPreprocessor:
    def __init__(self, model_dir="data/models"):
        self.scaler = StandardScaler()
        self.model_dir = model_dir
        self.features = [
            'gait_speed_var', 
            'balance_score', 
            'daily_steps', 
            'prev_fall_history', 
            'med_adherence', 
            'sedative_flag', 
            'motion_sensor_freq', 
            'pressure_mat_imbalance'
        ]

    def fit(self, data: pd.DataFrame):
        """Fits the scaler on training data."""
        self.scaler.fit(data[self.features])
        os.makedirs(self.model_dir, exist_ok=True)
        dump(self.scaler, os.path.join(self.model_dir, "scaler.joblib"))

    def load_scaler(self):
        """Loads saved scaler."""
        path = os.path.join(self.model_dir, "scaler.joblib")
        if os.path.exists(path):
            self.scaler = load(path)
            return True
        return False

    def transform(self, data: pd.DataFrame):
        """Transforms data, handles missing values (imputation)."""
        df = data.copy()
        
        # 1. Handle missing sensor data (Graceful degradation)
        # Use median for numerical, mode for flags
        for col in self.features:
            if col in df.columns:
                if col == 'sedative_flag':
                    df[col] = df[col].fillna(0) # Assume no sedative if unknown
                else:
                    df[col] = df[col].fillna(df[col].median() if not df[col].empty else 0)
            else:
                df[col] = 0 # Default if feature completely missing

        # 2. Normalize features
        df[self.features] = self.scaler.transform(df[self.features])
        
        return df[self.features]

    def prepare_time_series(self, data: pd.DataFrame, window_size=7):
        """Converts flat data into (samples, time_steps, features)."""
        # Note: In a real scenario, this would group by userId and sort by date
        # For simplicity, we assume data is already sorted for a single user
        X = []
        for i in range(len(data) - window_size + 1):
            X.append(data.iloc[i:i+window_size].values)
        return np.array(X)
