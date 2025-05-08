import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import FormData from 'form-data';

// Helper function to sanitize prompt for filename
function sanitizePromptForFilename(prompt: string | undefined): string {
  if (!prompt) return '';
  const snippet = prompt.substring(0, 50); // Take first 50 chars
  return snippet
    .toLowerCase()
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/[^a-z0-9_-]/g, '') // Remove non-alphanumeric (allow underscore, hyphen)
    .replace(/^_+|_+$/g, ''); // Trim leading/trailing underscores
}

export interface IdeogramGenerateParams {
  prompt: string;
  aspect_ratio?: string;
  model?: 'V_1' | 'V_1_TURBO' | 'V_2' | 'V_2_TURBO' | 'V_3' | 'V_2A' | 'V_2A_TURBO';
  rendering_speed?: 'TURBO' | 'DEFAULT' | 'QUALITY';
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

export interface IdeogramResponseDataItem {
  url: string;
  id: string;
  filepath?: string;
  prompt?: string;
  resolution?: string;
  is_image_safe?: boolean;
  seed?: number;
  style_type?: string;
  [key: string]: any;
}

export interface IdeogramResponse {
  created: string;
  data: Array<IdeogramResponseDataItem>;
}

export class IdeogramClient {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.ideogram.ai';
  private readonly outputDir: string;

  constructor(apiKey: string, outputDir?: string) {
    if (!apiKey) {
      throw new Error('IDEOGRAM_API_KEY is required');
    }
    this.apiKey = apiKey;
    this.outputDir = outputDir || process.env.IDEOGRAM_OUTPUT_DIR || path.join(process.cwd(), 'generated_images');
    
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  private async downloadImage(url: string, imageId: string, promptForFilename?: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sanitizedPrompt = sanitizePromptForFilename(promptForFilename);
    const filenamePrefix = sanitizedPrompt ? `${timestamp}_${sanitizedPrompt}` : timestamp;
    const filename = `${filenamePrefix}_${imageId}.png`;
    const filepath = path.join(this.outputDir, filename);

    return new Promise((resolve, reject) => {
      https.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download image from ${url}, status code: ${response.statusCode}`));
          return;
        }
        const fileStream = fs.createWriteStream(filepath);
        response.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          resolve(filepath);
        });
        fileStream.on('error', (err) => {
          fs.unlink(filepath, () => reject(err));
        });
      }).on('error', reject);
    });
  }

  async generateImage(params: IdeogramGenerateParams): Promise<IdeogramResponse> {
    try {
      let endpoint: string;
      let requestBody: any;
      let requestHeaders: Record<string, string>;

      const commonHeaders = {
        'Api-Key': this.apiKey,
      };

      const apiParams: any = { ...params };

      if (params.model === 'V_3') {
        endpoint = `${this.baseUrl}/v1/ideogram-v3/generate`;
        requestHeaders = { ...commonHeaders };
        
        const formData = new FormData();
        formData.append('prompt', params.prompt);
        if (params.aspect_ratio) formData.append('aspect_ratio', params.aspect_ratio);
        if (params.rendering_speed) formData.append('rendering_speed', params.rendering_speed);
        if (params.magic_prompt_option) formData.append('magic_prompt', params.magic_prompt_option);
        if (params.seed !== undefined) formData.append('seed', params.seed.toString());
        if (params.style_type) formData.append('style_type', params.style_type);
        if (params.negative_prompt) formData.append('negative_prompt', params.negative_prompt);
        if (params.num_images !== undefined) formData.append('num_images', params.num_images.toString());
        if (params.resolution) formData.append('resolution', params.resolution);
        
        if (params.color_palette) {
          formData.append('color_palette', JSON.stringify(params.color_palette));
        }

        requestBody = formData;
        requestHeaders = { ...requestHeaders, ...formData.getHeaders() };

      } else {
        endpoint = `${this.baseUrl}/generate`;
        requestHeaders = {
          ...commonHeaders,
          'Content-Type': 'application/json',
        };

        if (apiParams.rendering_speed) {
          delete apiParams.rendering_speed;
        }

        const unsupportedColorPaletteModels = ['V_1', 'V_1_TURBO', 'V_2A', 'V_2A_TURBO'];
        if (params.model && unsupportedColorPaletteModels.includes(params.model) && apiParams.color_palette) {
          delete apiParams.color_palette;
        }
        
        requestBody = { image_request: apiParams };
      }

      const response = await axios.post(endpoint, requestBody, { headers: requestHeaders });

      const responseData = response.data;
      if (!responseData || !responseData.data || !Array.isArray(responseData.data)) {
        throw new Error('Invalid API response structure from Ideogram');
      }
      
      const downloadPromises = responseData.data.map(async (img: any) => {
        let imageId = img.id;
        if (!imageId && img.url) {
          const urlParts = img.url.split('/');
          const filenameWithQuery = urlParts[urlParts.length - 1];
          imageId = filenameWithQuery.split('.')[0].split('?')[0];
        }
        if (!imageId) {
          console.warn(`Could not determine a suitable image ID for URL: ${img.url}. Using a generated ID.`);
          imageId = `img_${new Date().getTime()}_${Math.random().toString(36).substring(2, 9)}`;
        }

        const promptForName = img.prompt || params.prompt;
        const filepath = await this.downloadImage(img.url, imageId, promptForName);
        return { ...img, id: imageId, filepath };
      });
      
      const updatedImageData = await Promise.all(downloadPromises);

      return {
        created: responseData.created,
        data: updatedImageData,
      };

    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errorMsg = error.response?.data?.message || error.response?.data?.description || error.message;
        console.error("Ideogram API Axios Error:", error.response?.status, errorMsg, error.response?.data);
        throw new Error(`Ideogram API error: ${errorMsg}`);
      }
      console.error("Ideogram Client Error:", error);
      throw error;
    }
  }
}
