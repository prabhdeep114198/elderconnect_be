import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

export interface PrivacySection {
  id: string;
  title: string;
  icon: string;
  content: string;
}

export interface PrivacyPolicy {
  id: string;
  language: string;
  version: string;
  content: string;
  sections?: PrivacySection[];
  isActive: boolean;
  effectiveDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface TermsConditions {
  id: string;
  language: string;
  version: string;
  content: string;
  sections?: PrivacySection[];
  isActive: boolean;
  effectiveDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateCheck {
  policyUpdate: boolean;
  termsUpdate: boolean;
}

class PrivacyApi {
  private axiosInstance;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: `${API_BASE_URL}/privacy`,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  // Set authentication token
  setAuthToken(token: string) {
    this.axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  // Get active privacy policy
  async getPolicy(language: string = 'en'): Promise<PrivacyPolicy> {
    const response = await this.axiosInstance.get(`/policy?language=${language}`);
    return response.data;
  }

  // Get active terms and conditions
  async getTerms(language: string = 'en'): Promise<TermsConditions> {
    const response = await this.axiosInstance.get(`/terms?language=${language}`);
    return response.data;
  }

  // Get all versions of privacy policy
  async getPolicyVersions(language: string = 'en'): Promise<PrivacyPolicy[]> {
    const response = await this.axiosInstance.get(`/policy/versions?language=${language}`);
    return response.data;
  }

  // Get all versions of terms
  async getTermsVersions(language: string = 'en'): Promise<TermsConditions[]> {
    const response = await this.axiosInstance.get(`/terms/versions?language=${language}`);
    return response.data;
  }

  // Check if user needs to accept updated policy/terms
  async checkUpdates(
    userId: string,
    lastPolicyDate?: string,
    lastTermsDate?: string,
  ): Promise<UpdateCheck> {
    const params = new URLSearchParams();
    if (lastPolicyDate) params.append('lastPolicyDate', lastPolicyDate);
    if (lastTermsDate) params.append('lastTermsDate', lastTermsDate);

    const response = await this.axiosInstance.get(
      `/check-updates/${userId}?${params.toString()}`,
    );
    return response.data;
  }

  // Record user acceptance of privacy policy
  async acceptPolicy(data: {
    userId: string;
    policyId: string;
    acceptedAt: Date;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    await this.axiosInstance.post('/accept-policy', data);
  }

  // Record user acceptance of terms
  async acceptTerms(data: {
    userId: string;
    termsId: string;
    acceptedAt: Date;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    await this.axiosInstance.post('/accept-terms', data);
  }
}

export const privacyApi = new PrivacyApi();