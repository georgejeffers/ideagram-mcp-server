import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

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
    filepath?: string;
  }>;
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
    
    // 出力ディレクトリが存在しない場合は作成
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  private async downloadImage(url: string, id: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${timestamp}_${id}.png`;
    const filepath = path.join(this.outputDir, filename);

    return new Promise((resolve, reject) => {
      https.get(url, (response) => {
        const fileStream = fs.createWriteStream(filepath);
        response.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          resolve(filepath);
        });
        fileStream.on('error', reject);
      }).on('error', reject);
    });
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
            'Api-Key': this.apiKey,
            'Content-Type': 'application/json',
          },
        }
      );

      // 画像を自動保存
      const downloadPromises = response.data.data.map(async (img: { url: string; id: string }) => {
        const filepath = await this.downloadImage(img.url, img.id);
        return { ...img, filepath };
      });
      
      const updatedData = await Promise.all(downloadPromises);
      response.data.data = updatedData;

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Ideogram API error: ${error.response?.data?.message || error.message}`);
      }
      throw error;
    }
  }
}
