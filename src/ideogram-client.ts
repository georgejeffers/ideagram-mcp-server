import axios from 'axios';

export interface IdeogramGenerateParams {
  prompt: string;
  aspect_ratio?: string;
  model?: 'V_1' | 'V_1_TURBO' | 'V_2' | 'V_2_TURBO';
  magic_prompt_option?: 'AUTO' | 'ON' | 'OFF';
  seed?: number;
  style_type?: string;
  negative_prompt?: string;
  num_images?: number;
  resolution?: string;
  color_palette?: {
    name?: string;
    members?: Array<{ color: string; weight?: number }>;
  };
}

export interface IdeogramResponse {
  created: string;
  data: Array<{
    url: string;
    id: string;
  }>;
}

export class IdeogramClient {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.ideogram.ai';

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('IDEOGRAM_API_KEY is required');
    }
    this.apiKey = apiKey;
  }

  async generateImage(params: IdeogramGenerateParams): Promise<IdeogramResponse> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/generate`,
        {
          image_request: params,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Ideogram API error: ${error.response?.data?.message || error.message}`);
      }
      throw error;
    }
  }
}
